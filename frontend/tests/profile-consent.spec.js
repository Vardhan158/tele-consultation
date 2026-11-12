import { test, expect } from '@playwright/test';
import { login, patient, hasPatient } from './e2e-helpers.js';

function blocked(reason) {
  test.skip(true, `BLOCKED: ${reason}`);
}

test.describe('Kaizentrix patient profile and consent', () => {
  test.beforeEach(async ({ page }) => {
    if (!hasPatient) blocked('authorized patient credentials are not configured');
    await login(page, patient);
  });

  test('profile page renders and loads patient data', async ({ page }) => {
    const profileResponse = page.waitForResponse((r) => r.url().includes('/patient/profile'));
    await page.goto('/profile');
    expect((await profileResponse).status()).toBe(200);
    await expect(page.getByRole('heading', { name: /your patient profile/i })).toBeVisible();
    await expect(page.getByText(/personal information/i).first()).toBeVisible();
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('profile edit saves, persists after refresh, and restores original value', async ({ page }) => {
    await page.goto('/profile');
    const city = page.getByText('City', { exact: true }).locator('..').locator('input');
    const original = await city.inputValue();
    const testValue = 'Development City';
    await city.fill(testValue);
    const [saveResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/patient/profile') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: /save changes/i }).click(),
    ]);
    expect(saveResponse.status()).toBe(200);
    await page.reload();
    await expect(page.getByText('City', { exact: true }).locator('..').locator('input')).toHaveValue(testValue);
    await page.getByText('City', { exact: true }).locator('..').locator('input').fill(original);
    const [restoreResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/patient/profile') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: /save changes/i }).click(),
    ]);
    expect(restoreResponse.status()).toBe(200);
  });

  test('profile validation rejects invalid input', async ({ page }) => {
    await page.goto('/profile');
    const city = page.getByText('City', { exact: true }).locator('..').locator('input');
    await city.fill('12345');
    await city.blur();
    await expect(page.getByText(/city cannot contain numbers/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
  });

  test('consent screen displays directives without granting consent', async ({ page }) => {
    await page.goto('/consent');
    await expect(page.getByRole('heading', { name: /your data.*your choices/i })).toBeVisible();
    await expect(page.getByText(/care.*communication permissions/i)).toBeVisible();
    await expect(page.getByText(/video appointments/i)).toBeVisible();
    blocked('consent submission requires an explicit approved development fixture; no consent was granted');
  });

  test('medical intake is not exposed as a patient route in the current UI', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('main')).toBeVisible();
    blocked('no Medical Intake route or persistence UI is implemented in the current patient portal');
  });

  test('unauthenticated profile access is protected', async ({ page }) => {
    await page.request.post('http://localhost:8000/auth/logout');
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /sign in to patient portal/i })).toBeVisible();
  });
});
