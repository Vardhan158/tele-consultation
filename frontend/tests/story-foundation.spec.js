import { test, expect } from '@playwright/test';

// Keep WebGL deterministic on CI/remote desktops without a hardware GPU.
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

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('story preserves its canvas when scrolling forward and back', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const story = page.locator('.care-story');
  await expect(story).toBeVisible();
  expect(await story.evaluate((node) => node.previousElementSibling.id)).toBe('home');
  const bounds = await story.evaluate((node) => ({ top: node.offsetTop, travel: node.offsetHeight - innerHeight }));
  const go = async (progress) => {
    await page.evaluate((y) => window.scrollTo(0, y), bounds.top + bounds.travel * progress);
    await expect.poll(() => story.evaluate((node) => Number(node.style.getPropertyValue('--story-progress')))).toBeCloseTo(progress, 1);
  };
  await go(0.2);
  await expect(story.locator('canvas')).toHaveCount(1);
  await story.locator('canvas').evaluate((node) => { window.__storyCanvas = node; });
  await go(0.8);
  await go(0.2);
  expect(await story.locator('canvas').evaluate((node) => node === window.__storyCanvas)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(story.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('reduced motion advances and reverses through still shots on one Canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const story = page.locator('.care-story');
  await story.scrollIntoViewIfNeeded();
  const canvas = story.locator('canvas');
  await expect(canvas).toHaveAttribute('data-house-ready', 'true', { timeout: 30_000 });
  await canvas.evaluate((node) => { window.storyBeforeScroll = node; });
  expect(await story.evaluate((node) => node.offsetHeight)).toBeGreaterThan(await page.evaluate(() => innerHeight * 12));
  await expect(story.locator('.care-story-progress')).toBeHidden();
  const shots = [0, .106, .171, .216, .259, .347, .48, .609, .638, .726, .79, .839, .898, .951, .993, 1];
  const progress = () => story.evaluate((node) => Number(node.style.getPropertyValue('--story-progress')));
  const go = (point) => story.evaluate((node, raw) => {
    const top = node.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + raw * (node.clientHeight - node.firstElementChild.clientHeight), behavior: 'instant' });
  }, point);
  for (const [index, shot] of shots.entries()) {
    await go((index + .5) / shots.length);
    await expect.poll(progress).toBe(shot);
  }
  await expect(story.getByRole('link', { name: 'Book Your Consultation' })).toBeVisible();
  await go(8.5 / shots.length);
  await expect.poll(progress).toBe(.638);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(progress).toBeCloseTo(8.5 / shots.length, 2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(progress).toBe(.638);
  expect(await canvas.evaluate((node) => node === window.storyBeforeScroll)).toBe(true);
});

test('a delayed model keeps the opening copy visible until the Canvas is ready', async ({ page }) => {
  let release;
  let requested;
  const modelRequested = new Promise((resolve) => { requested = resolve; });
  const modelGate = new Promise((resolve) => { release = resolve; });
  await page.route('**/modern-house.glb', async (route) => {
    requested();
    await modelGate;
    await route.continue();
  });
  await page.goto('/');
  const story = page.locator('.care-story');
  const canvas = story.locator('canvas');
  try {
    await story.scrollIntoViewIfNeeded();
    await modelRequested;
    await story.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      window.scrollTo({ top: scrollY + bounds.top + .25 * (bounds.height - innerHeight), behavior: 'instant' });
    });
    await expect(canvas).toBeHidden();
    await expect(story.locator('.care-story-copy')).toHaveCSS('opacity', '1');
  } finally {
    release();
  }
  await expect(canvas).toHaveAttribute('data-house-ready', 'true', { timeout: 30_000 });
  await expect(canvas).toBeVisible();
  await expect(story.locator('.care-story-copy')).toHaveCSS('opacity', '0');
});


test('WebGL-disabled landing keeps the story and hero fallback usable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...options) {
      if (type.includes('webgl')) return null;
      return getContext.call(this, type, ...options);
    };
  });
  await page.goto('/');
  const hero = page.locator('#home');
  await hero.getByRole('button', { name: '3D Stethoscope' }).click();
  await expect(hero.getByText("The 3D stethoscope is unavailable on this device.")).toBeVisible();
  await page.locator('.care-story').scrollIntoViewIfNeeded();
  await expect(page.getByText('The 3D view is unavailable on this device.')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  const technology = page.locator('#technology');
  await technology.scrollIntoViewIfNeeded();
  await expect(technology.getByText('The 3D stethoscope is unavailable on this device.')).toBeVisible();
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(page.locator('footer')).toBeVisible();
});
