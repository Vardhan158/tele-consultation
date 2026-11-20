import { test, expect } from '@playwright/test';

test('professional doctor registration renders all 13 required fields across 3 sections on a single page without scrolling', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.setViewportSize({ width: 1440, height: 750 });
  await page.goto('/doctor/register');
  await expect(page.getByRole('heading', { name: /Doctor Registration/i })).toBeVisible();

  // Section 1: Personal Information (6 fields)
  await expect(page.getByRole('heading', { name: /Personal Information/i })).toBeVisible();
  await expect(page.locator('input[name="full_name"]')).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="mobile_number"]')).toBeVisible();
  await expect(page.locator('input[name="state"]')).toBeVisible();
  await expect(page.locator('input[name="date_of_birth"]')).toBeVisible();
  await expect(page.locator('select[name="gender"]')).toBeVisible();

  // Section 2: Professional Information (7 fields)
  await expect(page.getByRole('heading', { name: /Professional Information/i })).toBeVisible();
  await expect(page.locator('select[name="specialty"]')).toBeVisible();
  await expect(page.locator('input[name="registration_number"]')).toBeVisible();
  await expect(page.locator('input[name="medical_council"]')).toBeVisible();
  await expect(page.locator('input[name="qualifications"]')).toBeVisible();
  await expect(page.locator('input[name="experience_years"]')).toBeVisible();
  await expect(page.locator('input[name="languages"]')).toBeVisible();
  await expect(page.locator('input[name="credential_document"]')).toBeVisible();

  // Section 3: Account Security (2 fields)
  await expect(page.getByRole('heading', { name: /Account Security/i })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('input[name="confirm_password"]')).toBeVisible();

  // Show/Hide password toggles
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show confirm password' })).toBeVisible();

  // Required Consents
  await expect(page.locator('input[name="terms_consent"]')).toBeVisible();
  await expect(page.locator('input[name="declaration_consent"]')).toBeVisible();

  // Submit button directly visible without scrolling
  await expect(page.getByRole('button', { name: /Submit Doctor Registration/i })).toBeVisible();

  // Verify single page layout without vertical scrolling on desktop viewport
  const isScrollable = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollHeight > main.clientHeight : false;
  });
  expect(isScrollable).toBe(false);
});

test('doctor registration form client-side validations', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/doctor/register');

  // Fill password and mismatched confirm password
  await page.locator('input[name="full_name"]').fill('Dr. Test Doctor');
  await page.locator('input[name="email"]').fill('drtest@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('9876543210');
  await page.locator('input[name="state"]').fill('Karnataka');
  await page.locator('input[name="date_of_birth"]').fill('1990-05-15');
  await page.locator('select[name="gender"]').selectOption('Male');
  await page.locator('select[name="specialty"]').selectOption('Cardiology');
  await page.locator('input[name="registration_number"]').fill('REG-12345');
  await page.locator('input[name="medical_council"]').fill('Karnataka Medical Council');
  await page.locator('input[name="password"]').fill('Secret123#');
  await page.locator('input[name="confirm_password"]').fill('Different123#');
  await page.locator('input[name="experience_years"]').fill('10');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="languages"]').fill('English, Hindi');
  await page.locator('input[name="credential_document"]').setInputFiles({
    name: 'test_certificate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test certificate content'),
  });
  await page.locator('input[name="terms_consent"]').check();
  await page.locator('input[name="declaration_consent"]').check();

  await page.getByRole('button', { name: /Submit Doctor Registration/i }).click();
  await expect(page.locator('text=Passwords do not match').first()).toBeVisible();
});

test('doctor registration mobile number validation requires exactly 10 digits', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/doctor/register');

  await page.locator('input[name="mobile_number"]').fill('98765');
  await page.locator('input[name="mobile_number"]').blur();
  await expect(page.locator('text=Mobile number must be exactly 10 digits.').first()).toBeVisible();

  await page.locator('input[name="mobile_number"]').fill('9876543210');
  await page.locator('input[name="mobile_number"]').blur();
  await expect(page.locator('text=Mobile number must be exactly 10 digits.')).toHaveCount(0);
});

test('doctor registration date of birth validation requires age 21 or older', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/doctor/register');

  const today = new Date();
  const underageDob = `${today.getFullYear() - 18}-01-01`;
  await page.locator('input[name="date_of_birth"]').fill(underageDob);
  await page.locator('input[name="date_of_birth"]').blur();
  await expect(page.locator('text=Doctor must be at least 21 years of age.').first()).toBeVisible();

  const validDob = `${today.getFullYear() - 30}-01-01`;
  await page.locator('input[name="date_of_birth"]').fill(validDob);
  await page.locator('input[name="date_of_birth"]').blur();
  await expect(page.locator('text=Doctor must be at least 21 years of age.')).toHaveCount(0);
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
  await page.locator('input[name="mobile_number"]').fill('9876543210');
  await page.locator('input[name="state"]').fill('Karnataka');
  await page.locator('input[name="date_of_birth"]').fill('1988-11-20');
  await page.locator('select[name="gender"]').selectOption('Male');
  await page.locator('select[name="specialty"]').selectOption('General Medicine');
  await page.locator('input[name="registration_number"]').fill('KMC-998877');
  await page.locator('input[name="medical_council"]').fill('Karnataka Medical Council');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="experience_years"]').fill('12');
  await page.locator('input[name="languages"]').fill('English, Hindi, Kannada');
  await page.locator('input[name="credential_document"]').setInputFiles({
    name: 'council_reg.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock council cert'),
  });
  await page.locator('input[name="password"]').fill('ValidPass123!');
  await page.locator('input[name="confirm_password"]').fill('ValidPass123!');
  await page.locator('input[name="terms_consent"]').check();
  await page.locator('input[name="declaration_consent"]').check();

  await page.getByRole('button', { name: /Submit Doctor Registration/i }).click();

  await expect(page.locator('text=Registration Submitted Successfully')).toBeVisible();
  await expect(page.locator('text=PENDING_VERIFICATION').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Proceed to Email Verification/i })).toBeVisible();
});
