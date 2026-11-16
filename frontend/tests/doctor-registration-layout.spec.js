import { test, expect } from '@playwright/test';

test('clinician registration keeps the full form reachable by scrolling', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto('/doctor/register');
  await expect(page.getByRole('heading', { name: 'Clinician Registration' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(await page.locator('main').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  expect(await page.locator('main').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Submit Clinician Registration' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Submit Clinician Registration' })).toBeVisible();
});
