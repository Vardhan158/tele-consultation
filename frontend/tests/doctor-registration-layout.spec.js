import { test, expect } from '@playwright/test';

test('clinician registration keeps the full form reachable by scrolling and verifies exactly the 9 fields', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto('/doctor/register');
  await expect(page.getByRole('heading', { name: /Doctor Registration|Clinician Registration/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(await page.locator('main').evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');

  // Verify exactly the 9 required fields
  await expect(page.locator('input[name="full_name"]')).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="mobile_number"]')).toBeVisible();
  await expect(page.locator('input[name="registration_number"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('input[name="confirm_password"]')).toBeVisible();
  await expect(page.locator('input[name="experience_years"]')).toBeVisible();
  await expect(page.locator('input[name="qualifications"]')).toBeVisible();
  await expect(page.locator('input[name="languages"]')).toBeVisible();

  // Verify removed fields are NOT present
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('select[name="specialty"]')).toHaveCount(0);
  await expect(page.locator('input[name="medical_council"]')).toHaveCount(0);
  await expect(page.locator('input[name="clinic_name"]')).toHaveCount(0);

  // Submit button
  await page.getByRole('button', { name: /Submit (Doctor|Clinician) Registration/i }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /Submit (Doctor|Clinician) Registration/i })).toBeVisible();
});

test('doctor registration form client-side validations', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/doctor/register');

  // Fill password and mismatched confirm password
  await page.locator('input[name="full_name"]').fill('Dr. Test Doctor');
  await page.locator('input[name="email"]').fill('drtest@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('+919876543210');
  await page.locator('input[name="registration_number"]').fill('REG-12345');
  await page.locator('input[name="password"]').fill('Secret123#');
  await page.locator('input[name="confirm_password"]').fill('Different123#');
  await page.locator('input[name="experience_years"]').fill('10');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="languages"]').fill('English, Hindi');
  await page.locator('input[name="terms_consent"]').check();

  await page.getByRole('button', { name: /Submit (Doctor|Clinician) Registration/i }).click();
  await expect(page.locator('text=Passwords do not match').first()).toBeVisible();
});

test('doctor registration mobile number validation requires exactly 10 digits', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/doctor/register');

  await page.locator('input[name="mobile_number"]').fill('98765');
  await page.locator('input[name="mobile_number"]').blur();
  await expect(page.locator('text=Mobile number must be exactly 10 digits.').first()).toBeVisible();

  await page.locator('input[name="mobile_number"]').fill('+919876543210');
  await page.locator('input[name="mobile_number"]').blur();
  await expect(page.locator('text=Mobile number must be exactly 10 digits.')).toHaveCount(0);
});

test('successful doctor registration submission displays PENDING_VERIFICATION confirmation', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.route(url => url.pathname.includes('/doctor/register') && url.port === '8000', route => route.fulfill({
    status: 201,
    json: {
      status: 'verification_required',
      user_id: 'doc-mock-123',
      email: 'dr.test@clinic.com',
      approval_status: 'pending',
    },
  }));

  await page.goto('/doctor/register');
  await page.locator('input[name="full_name"]').fill('Dr. Harshavardhan');
  await page.locator('input[name="email"]').fill('dr.test@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('+919876543210');
  await page.locator('input[name="registration_number"]').fill('KMC-98765');
  await page.locator('input[name="password"]').fill('Secret123#');
  await page.locator('input[name="confirm_password"]').fill('Secret123#');
  await page.locator('input[name="experience_years"]').fill('12');
  await page.locator('input[name="qualifications"]').fill('MBBS, MS');
  await page.locator('input[name="languages"]').fill('English, Kannada');
  await page.locator('input[name="terms_consent"]').check();

  await page.getByRole('button', { name: /Submit (Doctor|Clinician) Registration/i }).click();
  await expect(page.locator('text=PENDING_VERIFICATION').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Registration Submitted Successfully/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Proceed to Email Verification/i })).toBeVisible();
});


