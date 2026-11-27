import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const [url, destination, mode] = process.argv.slice(2);
const browser = await chromium.launch({
  channel: process.env.QA_BROWSER_CHANNEL || 'chromium',
  args: mode === 'software' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});

function instrument() {
  const contexts = new Map();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const gl = getContext.call(this, type, ...args);
    if (!gl || !type.startsWith('webgl') || contexts.has(this)) return gl;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
    const state = { draws: 0, frames: 0, contextLosses: 0, renderer, storage: new Map() };
    this.addEventListener('webglcontextlost', () => state.contextLosses++);
    contexts.set(this, state);
    let frame = -1;
    let activeUnit = gl.TEXTURE0;
    const buffers = new Map();
    const textures = new Map();
    const bpp = new Map([
      [gl.R8, 1], [gl.RG8, 2], [gl.RGB8, 3], [gl.RGBA8, 4], [gl.SRGB8_ALPHA8, 4],
      [gl.RGBA16F, 8], [gl.RGBA32F, 16], [gl.RG16F, 4], [gl.R16F, 2],
      [gl.DEPTH_COMPONENT16, 2], [gl.DEPTH_COMPONENT24, 3], [gl.DEPTH_COMPONENT32F, 4],
      [gl.DEPTH24_STENCIL8, 4], [gl.RGB9_E5, 4], [gl.R11F_G11F_B10F, 4],
    ]);
    function wrap(name, count) {
      const method = gl[name];
      if (method) gl[name] = function (...values) {
        count(...values);
        return method.apply(this, values);
      };
    }
    for (const method of ['drawElements', 'drawArrays', 'drawArraysInstanced', 'drawElementsInstanced']) {
      wrap(method, () => {
        state.draws++;
        if (frame !== window.__benchmarkFrame) {
          frame = window.__benchmarkFrame;
          state.frames++;
        }
      });
    }
    wrap('bindBuffer', (target, buffer) => buffers.set(target, buffer));
    wrap('bufferData', (target, data, usage, offset, length) => {
      const buffer = buffers.get(target);
      if (!buffer) return;
      const bytes = typeof data === 'number' ? data
        : length ? length * (data.BYTES_PER_ELEMENT ?? 1) : data.byteLength - (offset ?? 0) * (data.BYTES_PER_ELEMENT ?? 1);
      state.storage.set(buffer, bytes);
    });
    wrap('deleteBuffer', (buffer) => state.storage.delete(buffer));
    wrap('activeTexture', (unit) => { activeUnit = unit; });
    wrap('bindTexture', (target, texture) => textures.set(`${activeUnit}:${target}`, texture));
    wrap('texStorage2D', (target, levels, format, width, height) => {
      const texture = textures.get(`${activeUnit}:${target}`);
      if (!texture || !bpp.has(format)) return;
      let pixels = 0;
      for (let level = 0; level < levels; level++) pixels += Math.max(1, width >> level) * Math.max(1, height >> level);
      state.storage.set(texture, pixels * bpp.get(format) * (target === gl.TEXTURE_CUBE_MAP ? 6 : 1));
    });
    wrap('deleteTexture', (texture) => state.storage.delete(texture));
    return gl;
  };
  window.__benchmarkFrame = 0;
  function markFrame() {
    window.__benchmarkFrame++;
    requestAnimationFrame(markFrame);
  }
  requestAnimationFrame(markFrame);
  window.storyStats = () => {
    const state = [...contexts].find(([canvas]) => canvas.closest('.care-story-canvas'))?.[1];
    if (!state) return null;
    const { storage, ...counts } = state;
    return { ...counts, trackedBytes: [...storage.values()].reduce((sum, value) => sum + value, 0) };
  };
}

const stability = mode === 'stability';
const sweeps = stability
  ? [['warm', 0, 1, 8000], ['reverse1', 1, 0, 6500], ['forward1', 0, 1, 6500],
    ['reverse2', 1, 0, 6500], ['forward2', 0, 1, 6500], ['reverse3', 1, 0, 6500], ['forward3', 0, 1, 6500]]
  : mode === 'full'
  ? [['fullJourney', 0, 1, 8000]]
  : [['approach', .01, .15, 2000], ['patient', .165, .22, 2000],
    ['pharmacy', .676, .747, 2000], ['finale', .84, 1, 2000]];
const results = {};
try {
  for (const [device, viewport, deviceScaleFactor] of [
    ['desktop', { width: 1280, height: 800 }, 1],
    ['mobile-emulation', { width: 390, height: 844 }, 2],
  ]) {
    results[device] = [];
    for (let trial = 0; trial < (stability ? 1 : 3); trial++) {
      const context = await browser.newContext({ viewport, deviceScaleFactor });
      await context.addInitScript(instrument);
      await context.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: false } }));
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('.care-story').waitFor();
      await page.evaluate(() => {
        window.storyLoadStart = performance.now();
        document.querySelector('.care-story').scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await page.locator('canvas[data-house-ready=true]').waitFor({ timeout: 60000 });
      await page.waitForFunction(() => window.storyStats()?.draws > 0, { timeout: 60000 });
      const loadMs = await page.evaluate(() => performance.now() - window.storyLoadStart);
      const scenes = {};
      const cdp = stability ? await context.newCDPSession(page) : null;
      for (const [name, start, end, duration] of sweeps) {
        scenes[name] = await page.evaluate(async ({ start, end, duration }) => {
          const story = document.querySelector('.care-story');
          const top = story.getBoundingClientRect().top + scrollY;
          const runway = story.clientHeight - innerHeight;
          const jump = (p) => window.scrollTo({ top: top + p * runway, behavior: 'instant' });
          jump(start);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const before = window.storyStats();
          const initial = performance.now();
          await new Promise((resolve) => {
            const tick = (time) => {
              const fraction = Math.min(1, (time - initial) / duration);
              jump(start + (end - start) * Math.max(0, fraction));
              if (fraction < 1) requestAnimationFrame(tick);
              else requestAnimationFrame(resolve);
            };
            requestAnimationFrame(tick);
          });
          const seconds = (performance.now() - initial) / 1000;
          const after = window.storyStats();
          const rendered = after.frames - before.frames;
          return { fps: rendered / seconds, drawsPerFrame: (after.draws - before.draws) / rendered, trackedBytes: after.trackedBytes, contextLosses: after.contextLosses };
        }, { start, end, duration });
        if (cdp) {
          await cdp.send('HeapProfiler.collectGarbage');
          scenes[name].jsHeapBytes = (await cdp.send('Runtime.getHeapUsage')).usedSize;
        }
      }
      const renderer = await page.evaluate(() => window.storyStats().renderer);
      const transfer = await page.evaluate(() => performance.getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/assets/house/'))
        .reduce((sum, entry) => sum + entry.encodedBodySize, 0));
      const offscreen = await page.evaluate(async () => {
        const canvas = document.querySelector('.care-story-canvas canvas');
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        window.scrollTo({ top: 0, behavior: 'instant' });
        await wait(550);
        const before = window.storyStats().draws;
        await wait(650);
        const after = window.storyStats().draws;
        document.querySelector('.care-story').scrollIntoView({ block: 'start', behavior: 'instant' });
        await wait(400);
        return {
          drawsWhileOffscreen: after - before,
          retainedCanvas: canvas === document.querySelector('.care-story-canvas canvas'),
          resumedDrawing: window.storyStats().draws > after,
        };
      });
      results[device].push({ renderer, loadMs, transfer, scenes, offscreen });
      await cdp?.detach();
      await context.close();
      await writeFile(destination, JSON.stringify(results, null, 2));
    }
  }
} finally {
  await browser.close();
}
