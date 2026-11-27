import { test, expect } from '@playwright/test';
async function mockApi(page, authenticated = false, general = true) {
  await page.route('**/auth/me', r => r.fulfill({ json: { authenticated, role: 'patient' } }));
  await page.route('**/api/v1/patient/doctors?*', r => r.fulfill({ json: [
    ...(general ? [{ id: 'g', full_name: 'Test General Doctor', specialty: 'General Medicine', fee_paise: 50000 }] : []),
    { id: 's', full_name: 'Test Specialist Doctor', specialty: 'Cardiology', fee_paise: 60000 },
  ] }));
  await page.route('**/api/v1/patient/doctors/*/availability', r => r.fulfill({ json: [] }));
  await page.route('**/api/v1/patient/booking-options', r => r.fulfill({ json: {} }));
  await page.route('**/patient/profile', r => r.fulfill({ json: {} }));
}
const buttons = page => page.locator('main button');
const actionNames = [
  'Find a Doctor',
  'Find a Doctor',
  'Find a Specialist',
  'Book Video Consultation',
  'Sign In to View Records',
  'Manage Follow-ups',
];
for (const width of [375, 768, 1024, 1440]) {
  test(`Services layout, active navbar, refresh and back at ${width}px`, async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/services');
    await expect(buttons(page)).toHaveCount(6);
    for (const name of [...new Set(actionNames)]) await expect(page.getByRole('button', { name, exact: true }).first()).toBeVisible();
    if (width < 1280) await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    const nav = page.getByRole('navigation', { name: width < 1280 ? 'Mobile navigation' : 'Primary navigation', exact: true });
    await expect(nav.getByRole('link', { name: 'Services', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Services', exact: true })).toHaveAttribute('href', '/services');
    if (width < 1280) await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const columns = await page.locator('main .grid').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width < 768 ? 1 : width < 1024 ? 2 : 3);
    await page.reload();
    await expect(buttons(page)).toHaveCount(6);
    for (const [index, destination] of [[1, /\/find-doctors$/], [2, /\/find-doctors$/], [3, /\/video-consultation$/], [4, /\/prescriptions$/], [5, /\/follow-up$/]]) {
      await buttons(page).nth(index).click();
      await expect(page).toHaveURL(destination);
      if (index < 3) await expect(page.getByText('Test Specialist Doctor', { exact: true })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/services$/);
      await expect(buttons(page)).toHaveCount(6);
    }
  });
}
for (const authenticated of [false, true]) {
  test(`General specialty persists after reload; authenticated=${authenticated}`, async ({ page }) => {
    await mockApi(page, authenticated);
    await page.goto('/services');
    await buttons(page).first().click();
    await expect(page).toHaveURL(/specialty=General%20Medicine/);
    for (let i = 0; i < 2; i++) {
      await expect(page.getByText('Test General Doctor', { exact: true })).toBeVisible();
      await expect(page.getByText('Test Specialist Doctor', { exact: true })).toHaveCount(0);
      if (!i) await page.reload();
    }
  });
}
test('Unsupported specialty falls back to all doctors', async ({ page }) => {
  await mockApi(page, false, false);
  await page.goto('/services');
  await buttons(page).first().click();
  await expect(page.getByText('Test Specialist Doctor', { exact: true })).toBeVisible();
  await expect(page.locator('select').first()).toHaveValue('all');
});
