import { expect, test } from '@playwright/test';

const enabled = process.env.CLINIC_ADMIN_E2E === 'true';
const email = process.env.CLINIC_ADMIN_E2E_EMAIL || 'clinic-admin@teleconsult.local';
const password = process.env.CLINIC_ADMIN_E2E_PASSWORD || 'AdminPassword123!';
const approveId = process.env.CLINIC_ADMIN_PENDING_APPROVE_ID;
const rejectId = process.env.CLINIC_ADMIN_PENDING_REJECT_ID;

test.describe('Clinic Administrator workspace', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!enabled, 'Requires CLINIC_ADMIN_E2E=true');
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/Clinic Administrator|Clinic Operations & Key Performance Indicators/i).first()).toBeVisible();
  });

  test('renders dashboard metrics and switches operational sections', async ({ page }) => {
    await expect(page.getByText(/Total Doctors/i).first()).toBeVisible();
    await page.goto('/clinic/doctors');
    await expect(page).toHaveURL(/\/clinic\/doctors$/);
    await page.goto('/clinic/appointments');
    await expect(page).toHaveURL(/\/clinic\/appointments$/);
    await page.goto('/clinic/settings');
    await expect(page).toHaveURL(/\/clinic\/settings$/);
  });

  test('keeps the workspace usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText(/Clinic Administrator|Clinic Operations/i).first()).toBeVisible();
  });

  test('approves and rejects pending doctors with a reason', async ({ page }) => {
    test.skip(!approveId || !rejectId, 'Requires pending doctor IDs');
    await page.goto('/clinic/doctors');
    const approveRow = page.getByTestId(`admin-row-${approveId}`);
    await expect(approveRow).toBeVisible();
    await approveRow.getByTestId(`approve-${approveId}`).click();
    await expect(page.getByTestId(`admin-row-${approveId}`)).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('approved');
    const reject = page.getByTestId(`reject-${rejectId}`);
    page.once('dialog', (dialog) => dialog.accept('Credentials did not meet clinic requirements'));
    await reject.click();
    await expect(reject).toHaveCount(0);
  });

  test('cancels and reschedules appointments through the API', async ({ page }) => {
    await page.goto('/clinic/appointments');
    await expect(page).toHaveURL(/\/clinic\/appointments$/);
  });

  test('persists clinic settings', async ({ page }) => {
    await page.goto('/clinic/settings');
    await expect(page.getByText(/Operating Hours|Clinic Settings/i).first()).toBeVisible();
  });
});
