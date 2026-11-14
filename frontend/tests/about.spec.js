import { test, expect } from '@playwright/test';

async function mockAuth(page) {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
}

for (const width of [375, 1440]) {
  test(`About direct route, responsive layout, navbar and CTAs at ${width}px`, async ({ page }) => {
    await mockAuth(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'Personalized Care, Wherever You Are' })).toBeVisible();
    await expect(page.getByAltText('Personalized Care, Trusted Results')).toBeVisible();
    const nav = width < 1280
      ? page.getByRole('button', { name: 'Toggle navigation menu' })
      : page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'About', exact: true });
    if (width < 1280) {
      await nav.click();
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(nav).toHaveAttribute('href', '/about');
      await expect(nav).toHaveAttribute('aria-current', 'page');
    }
    expect(await page.locator('header').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Meet Our Doctors', exact: true }).click();
    await expect(page).toHaveURL(/\/find-doctors$/);
    await page.goBack();
    await page.getByRole('button', { name: 'Register As Patient', exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
  });
}
