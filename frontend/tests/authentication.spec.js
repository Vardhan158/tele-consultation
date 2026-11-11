import { test, expect } from '@playwright/test';

const patient = {
  email: process.env.E2E_PATIENT_EMAIL,
  password: process.env.E2E_PATIENT_PASSWORD,
};
const registration = {
  full_name: process.env.E2E_REGISTRATION_NAME,
  mobile_number: process.env.E2E_REGISTRATION_MOBILE,
  email: process.env.E2E_REGISTRATION_EMAIL,
  password: process.env.E2E_REGISTRATION_PASSWORD,
};

function blocked(testInfo, reason) {
  testInfo.skip(true, `BLOCKED: ${reason}`);
}

test.describe('Kaizentrix patient authentication', () => {
  test('registration page renders required fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name="full_name"]')).toBeVisible();
    await expect(page.locator('input[name="mobile_number"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirm_password"]')).toBeVisible();
    await expect(page.locator('input[name="terms_accepted"]')).toBeVisible();
  });

  test('registration required-field validation', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('input[name="full_name"]')).toHaveAttribute('required', '');
    await expect(page.locator('input[name="email"]')).toHaveAttribute('required', '');
  });

  test('registration with isolated development data', async ({ page }) => {
    if (!Object.values(registration).every(Boolean)) {
      blocked(test, 'E2E_REGISTRATION_* development data is not configured');
    }
    await page.goto('/register');
    await page.locator('input[name="full_name"]').fill(registration.full_name);
    await page.locator('input[name="mobile_number"]').fill(registration.mobile_number);
    await page.locator('input[name="email"]').fill(registration.email);
    await page.locator('input[name="password"]').fill(registration.password);
    await page.locator('input[name="confirm_password"]').fill(registration.password);
    await page.locator('input[name="terms_accepted"]').check();
    const responsePromise = page.waitForResponse((response) => response.url().includes('/auth/register'));
    await page.getByRole('button', { name: 'Create Account' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /6-digit security code/i })).toBeVisible();
  });

  test('OTP verification uses only an approved development code', async ({ page }) => {
    if (!process.env.E2E_REGISTRATION_EMAIL || !process.env.E2E_OTP) {
      blocked(test, 'approved E2E registration email and OTP are not configured');
    }
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /6-digit security code/i })).toBeVisible();
    const digits = String(process.env.E2E_OTP).split('');
    for (let i = 0; i < digits.length; i += 1) await page.locator('input[inputmode="numeric"]').nth(i).fill(digits[i]);
    const responsePromise = page.waitForResponse((response) => response.url().includes('/auth/verify-email'));
    await page.getByRole('button', { name: /verify/i }).click();
    expect((await responsePromise).status()).toBe(200);
  });

  test('authorized login, API status, dashboard, refresh, logout, and protection', async ({ page }) => {
    if (!patient.email || !patient.password) blocked(test, 'authorized patient credentials are not configured');
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(patient.email);
    await page.locator('input[name="password"]').fill(patient.password);
    const loginResponse = page.waitForResponse((response) => response.url().includes('/auth/login'));
    await page.getByRole('button', { name: /sign in securely/i }).click();
    expect((await loginResponse).status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(patient.password);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByRole('main')).toBeVisible();
    await page.getByTitle('Sign out').click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /sign in to patient portal/i })).toBeVisible();
  });

  test('incorrect password is rejected without exposing credentials', async ({ page }) => {
    if (!patient.email || !patient.password) blocked(test, 'authorized patient email is not configured');
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(patient.email);
    await page.locator('input[name="password"]').fill(`${patient.password}-incorrect`);
    const responsePromise = page.waitForResponse((response) => response.url().includes('/auth/login'));
    await page.getByRole('button', { name: /sign in securely/i }).click();
    expect((await responsePromise).status()).toBe(401);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/unable to authenticate/i)).toBeVisible();
    await expect(page.getByText(/unable to authenticate/i)).not.toContainText(patient.password);
  });
});
