import { test, expect } from '@playwright/test';

for (const width of [375, 768, 1440]) {
  test(`FAQs route, navbar, accordion and back navigation at ${width}px`, async ({ page }) => {
    await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/faqs');
    await expect(page.getByRole('heading', { name: 'Frequently Asked Questions' })).toBeVisible();
    const questions = page.locator('button[aria-controls*="-answer-"]');
    await expect(questions).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1280) {
      await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'FAQs', exact: true })).toHaveAttribute('aria-current', 'page');
    } else {
      const faqLink = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'FAQs', exact: true });
      await expect(faqLink).toHaveAttribute('href', '/faqs');
      await expect(faqLink).toHaveAttribute('aria-current', 'page');
    }
    const first = questions.first();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('[role="region"]').first();
    await expect(panel).toBeVisible();
    await expect(first).toHaveAttribute('aria-controls', await panel.getAttribute('id'));
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('link', { name: 'Services', exact: true }).click();
    await expect(page).toHaveURL(/\/services$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/faqs$/);
    await expect(page.getByRole('heading', { name: 'Frequently Asked Questions' })).toBeVisible();
  });
}
