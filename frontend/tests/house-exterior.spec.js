import { test, expect } from '@playwright/test';

const channel = process.env.QA_BROWSER_CHANNEL || 'chromium';
const firefoxRun = channel === 'firefox';
test.use({
  browserName: firefoxRun ? 'firefox' : 'chromium',
  channel: firefoxRun ? undefined : channel,
  video: 'off',
  trace: 'retain-on-failure',
  permissions: [],
  launchOptions: firefoxRun ? {
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disable-fail-if-major-performance-caveat': true },
  } : process.env.QA_HARDWARE === '1' ? {} : {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

test('house stays mounted through the scroll path on desktop and mobile', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  test.setTimeout(480_000);
  const errors = [];
  const writes = [];
  const callAttempts = [];
  const sockets = [];
  await page.routeWebSocket('**/*', (socket) => {
    sockets.push(socket.url());
    socket.close();
  });
  await page.exposeFunction('recordCallAttempt', (api) => callAttempts.push(api));
  await page.addInitScript(() => {
    for (const api of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
      if (window[api]) window[api] = function () { window.recordCallAttempt(api); throw new Error('Unexpected WebRTC'); };
    }
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
      window.recordCallAttempt('getUserMedia');
      return Promise.reject(new Error('Unexpected media access'));
    };
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.fallback();
    writes.push(route.request().url());
    return route.abort();
  });
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.setViewportSize({ width: 1280, height: 800 });
  const modelResponse = page.waitForResponse((response) => response.url().endsWith('/assets/house/modern-house.glb'));
  const roomResponse = page.waitForResponse((response) => response.url().endsWith('/assets/house/living-room.glb'));
  const patientResponse = page.waitForResponse((response) => response.url().endsWith('/assets/house/patient.glb'));
  const laptopResponse = page.waitForResponse((response) => response.url().endsWith('/assets/house/patient-laptop.glb'));
  const props = ['demo-printer', 'demo-prescription-paper', 'pharmacy-travel', 'pharmacy-interior', 'pharmacist', 'care-finale'].map((name) =>
    page.waitForResponse((response) => response.url().endsWith(`/assets/house/${name}.glb`)));
  await page.goto('/');
  const section = page.locator('.care-story');
  await section.scrollIntoViewIfNeeded();
  expect((await modelResponse).ok()).toBe(true);
  expect((await roomResponse).ok()).toBe(true);
  expect((await patientResponse).ok()).toBe(true);
  expect((await laptopResponse).ok()).toBe(true);
  for (const asset of await Promise.all(props)) expect(asset.ok()).toBe(true);
  await expect(section.locator('canvas')).toHaveCount(1);
  await expect(section.locator('canvas')).toHaveAttribute('data-house-ready', 'true', { timeout: 30_000 });
  const go = async (progress) => {
    await expect.poll(async () => section.evaluate((node, value) => {
      const { top, height } = node.getBoundingClientRect();
      const destination = scrollY + top + (height - innerHeight) * value;
      if (Math.abs(scrollY - destination) > 1) window.scrollTo({ top: destination, behavior: 'instant' });
      return Math.abs(Number(node.style.getPropertyValue('--story-progress')) - value);
    }, progress), { message: `story reaches ${progress}`, timeout: 25_000 }).toBeLessThan(.003);
  };
  await section.locator('canvas').evaluate((node) => { window.__houseCanvas = node; });
  const views = [
    ['exterior', .01],
    ['doorway', .106],
    ['patient', .171],
    ['chair', .187],
    ['laptop', .216],
    ['booking', .259],
    ['consultation', .347],
    ['printing', .451],
    ['pickup', .48],
    ['car-board', .564],
    ['driving', .609],
    ['parked', .638],
    ['car-exit', .646],
    ['pharmacy-entry', .662],
    ['handoff', .726],
    ['pharmacy-exit-turn', .744],
    ['car-reboard', .764],
    ['return-drive', .790],
    ['home-exit', .816],
    ['living-room', .839],
    ['care-plan', .881],
    ['water', .898],
    ['rest', .951],
    ['garden-turn', .989],
    ['garden', .993],
    ['finale', .9995],
  ];
  const capture = process.env.CAPTURE_HOUSE_STORY;
  const reverseCapture = process.env.CAPTURE_HOUSE_REVERSE?.split(',');
  const checkViews = async (device, reverse = false) => {
    for (const [name, progress] of reverse ? [...views].reverse() : views) {
      await go(progress);
      const stage = section.locator('.care-story-stage');
      const bounds = await stage.boundingBox();
      const canvas = await section.locator('canvas').boundingBox();
      expect(Math.abs(bounds.y)).toBeLessThan(4);
      expect(bounds.height).toBeCloseTo(page.viewportSize().height, 0);
      expect(canvas.width).toBeGreaterThan(300);
      expect(canvas.height).toBeGreaterThan(400);
      const captureFrame = reverse ? reverseCapture?.includes(name) : capture === '1' || capture?.split(',').includes(name);
      if (captureFrame) {
        await page.waitForTimeout(450);
        await go(progress);
        await page.screenshot({ path: testInfo.outputPath(`${device}-${name}${reverse ? "-reverse" : ""}.png`), timeout: 35000 });
      }
    }
  };
  const currentProgress = () => section.evaluate((node) => Number(node.style.getPropertyValue('--story-progress')));
  const storyCanvas = section.locator('canvas');
  const expectSameCanvas = async () => {
    expect(await storyCanvas.evaluate((node) => node === window.__houseCanvas)).toBe(true);
    await expect(storyCanvas).toBeVisible();
  };
  await go(.18);
  await page.mouse.move(790, 440);
  const slowStart = await currentProgress();
  for (let step = 0; step < 6; step++) {
    await page.mouse.wheel(0, 22);
    await page.waitForTimeout(40);
  }
  await expect.poll(currentProgress).toBeGreaterThan(slowStart + .005);
  const fastStart = await currentProgress();
  await page.mouse.wheel(0, 1600);
  await expect.poll(currentProgress).toBeGreaterThan(fastStart + .08);
  await page.mouse.wheel(0, -1800);
  await expect.poll(currentProgress).toBeLessThan(fastStart - .005);
  await expectSameCanvas();
  await checkViews('desktop');
  const cta = section.getByRole('link', { name: 'Book Your Consultation' });
  await expect(cta).toBeVisible();
  await go(.951);
  await expect(cta).toBeHidden();
  await checkViews('desktop', true);
  await go(.695);
  await page.setViewportSize({ width: 800, height: 800 });
  await expect.poll(currentProgress).toBeCloseTo(.695, 2);
  await expectSameCanvas();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => section.locator('canvas').evaluate((canvas) => canvas.clientWidth)).toBe(390);
  await expect.poll(currentProgress).toBeCloseTo(.695, 2);
  if (!firefoxRun) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const swipe = async (from, to) => {
      const point = (y) => ({ x: 210, y });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(from + (to - from) * i / 8)] });
        await page.waitForTimeout(32);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
    };
    await swipe(700, 370);
    await expect.poll(currentProgress).toBeGreaterThan(.71);
    const touchForward = await currentProgress();
    await swipe(355, 710);
    await expect.poll(currentProgress).toBeLessThan(touchForward - .01);
    await cdp.detach();
  }
  await expectSameCanvas();
  await checkViews('mobile');
  await expect(cta).toBeVisible();
  await go(.951);
  await expect(cta).toBeHidden();
  await checkViews('mobile', true);
  await go(.9995);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(callAttempts).toEqual([]);
  expect(sockets).toEqual([]);
  await testInfo.attach('story-safety', { body: JSON.stringify({ writes, callAttempts, sockets, errors }), contentType: 'application/json' });
  await cta.click();
  await expect(page).toHaveURL(/\/find-doctors$/);
  await expect(page.getByPlaceholder(/name, specialty, or clinic/i)).toBeAttached();
});
