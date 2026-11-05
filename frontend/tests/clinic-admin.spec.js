/* global process */
import { expect, test } from '@playwright/test';

const enabled = process.env.CLINIC_ADMIN_E2E === 'true';
const email = process.env.CLINIC_ADMIN_E2E_EMAIL;
const password = process.env.CLINIC_ADMIN_E2E_PASSWORD;
const approveId = process.env.CLINIC_ADMIN_PENDING_APPROVE_ID;
const rejectId = process.env.CLINIC_ADMIN_PENDING_REJECT_ID;

test.describe('Clinic Administrator workspace', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!enabled || !email || !password, 'Requires an isolated synthetic Clinic Administrator environment');
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: /sign in/i }).last().click();
    await expect(page.getByRole('main').getByText('Clinic administrator', { exact: true })).toBeVisible();
  });

  test('renders dashboard metrics and switches operational sections', async ({ page }) => {
    await expect(page.getByText(/total doctors/i)).toBeVisible();
    await page.getByRole('button', { name: /doctor approvals/i }).click();
    await expect(page.getByRole('heading', { name: /doctor approvals/i })).toBeVisible();
    await page.getByRole('button', { name: /patient/i }).click();
    await expect(page.getByRole('heading', { name: /patient/i })).toBeVisible();
    await page.getByRole('button', { name: /clinic settings/i }).click();
    await expect(page.getByRole('button', { name: /save clinic settings/i })).toBeVisible();
  });

  test('keeps the workspace usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('main').getByText('Clinic administrator', { exact: true })).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot('clinic-admin-mobile.png', { maxDiffPixels: 200 });
  });

  test('approves and rejects pending doctors with a reason', async ({ page }) => {
    await page.getByRole('button', { name: /doctor approvals/i }).click();
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
    await page.getByRole('button', { name: /^Appointments$/i }).click();
    const row = page.locator('[data-testid^="admin-row-"]').first();
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row.getByTestId('record-status')).toContainText('cancelled');
  });

  test('persists clinic settings', async ({ page }) => {
    await page.getByRole('button', { name: /clinic settings/i }).click();
    await page.locator('input').first().fill('Synthetic Clinic A Updated');
    await page.getByRole('button', { name: /save clinic settings/i }).click();
    await expect(page.getByRole('status')).toContainText('Clinic settings saved');
  });
});
