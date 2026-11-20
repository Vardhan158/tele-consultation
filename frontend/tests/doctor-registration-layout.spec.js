import { test, expect } from '@playwright/test';

test('doctor registration 3-step story mode renders cleanly with step progression and no vertical scrolling', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.setViewportSize({ width: 1440, height: 750 });
  await page.goto('/doctor/register');
  await expect(page.getByRole('heading', { name: /Doctor Registration/i })).toBeVisible();

  // Verify Stepper Header
  await expect(page.getByText('Step 1 of 3: Personal Information')).toBeVisible();
  await expect(page.getByText('1. Personal')).toBeVisible();
  await expect(page.getByText('2. Credentials')).toBeVisible();
  await expect(page.getByText('3. Verification')).toBeVisible();

  // Step 1: Personal Information (6 fields)
  await expect(page.getByRole('heading', { name: /Personal Information/i })).toBeVisible();
  await expect(page.locator('input[name="full_name"]')).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="mobile_number"]')).toBeVisible();
  await expect(page.locator('select[name="state"]')).toBeVisible();
  await expect(page.locator('input[name="date_of_birth"]')).toBeVisible();
  await expect(page.locator('select[name="gender"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to Professional Details/i })).toBeVisible();

  // Verify single page layout without vertical scrolling on Step 1
  let isScrollable = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollHeight > main.clientHeight : false;
  });
  expect(isScrollable).toBe(false);

  // Fill Step 1
  await page.locator('input[name="full_name"]').fill('Dr. Harshavardhan');
  await page.locator('input[name="email"]').fill('dr.test@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('9876543210');
  await page.locator('select[name="state"]').selectOption('Karnataka');
  await page.locator('input[name="date_of_birth"]').fill('1990-05-15');
  await page.locator('select[name="gender"]').selectOption('Male');

  // Advance to Step 2
  await page.getByRole('button', { name: /Continue to Professional Details/i }).click();

  // Step 2: Professional Information (6 fields)
  await expect(page.getByText('Step 2 of 3: Medical Credentials')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Professional Information & Credentials/i })).toBeVisible();
  await expect(page.locator('select[name="specialty"]')).toBeVisible();
  await expect(page.locator('input[name="registration_number"]')).toBeVisible();
  await expect(page.locator('input[name="medical_council"]')).toBeVisible();
  await expect(page.locator('input[name="qualifications"]')).toBeVisible();
  await expect(page.locator('input[name="experience_years"]')).toBeVisible();
  await expect(page.locator('input[name="languages"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to Personal Info/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to Verification & Security/i })).toBeVisible();

  // Verify single page layout without vertical scrolling on Step 2
  isScrollable = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollHeight > main.clientHeight : false;
  });
  expect(isScrollable).toBe(false);

  // Fill Step 2
  await page.locator('select[name="specialty"]').selectOption('General Medicine');
  await page.locator('input[name="registration_number"]').fill('KMC-123456');
  await page.locator('input[name="medical_council"]').fill('Karnataka Medical Council');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="experience_years"]').fill('8');
  await page.locator('input[name="languages"]').fill('English, Hindi');

  // Advance to Step 3
  await page.getByRole('button', { name: /Continue to Verification & Security/i }).click();

  // Step 3: Document Uploads & Security
  await expect(page.getByText('Step 3 of 3: Verification Documents')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Document Uploads/i })).toBeVisible();
  await expect(page.locator('input[name="credential_document"]')).toBeVisible();
  await expect(page.locator('input[name="qualification_certificate"]')).toBeVisible();
  await expect(page.locator('input[name="identity_proof"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Account Security & Consents/i })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('input[name="confirm_password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show confirm password' })).toBeVisible();
  await expect(page.locator('input[name="terms_consent"]')).toBeVisible();
  await expect(page.locator('input[name="declaration_consent"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to Credentials/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Submit Doctor Registration/i })).toBeVisible();

  // Verify single page layout without vertical scrolling on Step 3
  isScrollable = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollHeight > main.clientHeight : false;
  });
  expect(isScrollable).toBe(false);

  // Test Back Navigation to Step 2
  await page.getByRole('button', { name: /Back to Credentials/i }).click();
  await expect(page.getByText('Step 2 of 3: Medical Credentials')).toBeVisible();

  // Test Back Navigation to Step 1
  await page.getByRole('button', { name: /Back to Personal Info/i }).click();
  await expect(page.getByText('Step 1 of 3: Personal Information')).toBeVisible();
  expect(await page.locator('input[name="full_name"]').inputValue()).toBe('Dr. Harshavardhan');
});

test('doctor registration form client-side validations across story steps', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/doctor/register');

  // Step 1: Attempt to proceed without filling fields
  await page.getByRole('button', { name: /Continue to Professional Details/i }).click();
  await expect(page.locator('text=Full name is required.').first()).toBeVisible();

  // Fill Step 1 correctly
  await page.locator('input[name="full_name"]').fill('Dr. Test Doctor');
  await page.locator('input[name="email"]').fill('drtest@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('9876543210');
  await page.locator('select[name="state"]').selectOption('Karnataka');
  await page.locator('input[name="date_of_birth"]').fill('1990-05-15');
  await page.locator('select[name="gender"]').selectOption('Male');
  await page.getByRole('button', { name: /Continue to Professional Details/i }).click();

  // Step 2: Attempt to proceed without filling fields
  await expect(page.getByText('Step 2 of 3: Medical Credentials')).toBeVisible();
  await page.getByRole('button', { name: /Continue to Verification & Security/i }).click();
  await expect(page.locator('text=Medical specialization is required.').first()).toBeVisible();

  // Fill Step 2 correctly
  await page.locator('select[name="specialty"]').selectOption('Cardiology');
  await page.locator('input[name="registration_number"]').fill('REG-12345');
  await page.locator('input[name="medical_council"]').fill('Karnataka Medical Council');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="experience_years"]').fill('10');
  await page.locator('input[name="languages"]').fill('English, Hindi');
  await page.getByRole('button', { name: /Continue to Verification & Security/i }).click();

  // Step 3: Test password mismatch validation
  await expect(page.getByText('Step 3 of 3: Verification Documents')).toBeVisible();
  await page.locator('input[name="credential_document"]').setInputFiles({
    name: 'test_certificate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test certificate content'),
  });
  await page.locator('input[name="password"]').fill('Secret123#');
  await page.locator('input[name="confirm_password"]').fill('Different123#');
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

test('successful doctor registration submission displays PENDING_VERIFICATION confirmation across story flow', async ({ page }) => {
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

  // Step 1: Personal Info
  await page.locator('input[name="full_name"]').fill('Dr. Harshavardhan');
  await page.locator('input[name="email"]').fill('dr.test@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('9876543210');
  await page.locator('select[name="state"]').selectOption('Karnataka');
  await page.locator('input[name="date_of_birth"]').fill('1988-11-20');
  await page.locator('select[name="gender"]').selectOption('Male');
  await page.getByRole('button', { name: /Continue to Professional Details/i }).click();

  // Step 2: Professional Info
  await page.locator('select[name="specialty"]').selectOption('General Medicine');
  await page.locator('input[name="registration_number"]').fill('KMC-998877');
  await page.locator('input[name="medical_council"]').fill('Karnataka Medical Council');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="experience_years"]').fill('12');
  await page.locator('input[name="languages"]').fill('English, Hindi, Kannada');
  await page.getByRole('button', { name: /Continue to Verification & Security/i }).click();

  // Step 3: Documents & Security
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

test('clicking Doctor Registration in Navbar opens popup modal with all 3 steps', async ({ page }) => {
  await page.route('**/auth/me', route => route.fulfill({ json: { authenticated: false } }));
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/');

  // Verify URL is "/"
  expect(page.url()).not.toContain('/doctor/register');

  // Click "Doctor Registration" in the Navbar
  const navDoctorBtn = page.getByRole('banner').getByRole('button', { name: /Doctor Registration/i });
  await expect(navDoctorBtn).toBeVisible();
  await navDoctorBtn.click();

  // Verify URL did NOT navigate away to /doctor/register
  expect(page.url()).not.toContain('/doctor/register');

  // Verify popup modal is open with Step 1
  await expect(page.getByRole('heading', { name: /Doctor Registration/i })).toBeVisible();
  await expect(page.getByText('Step 1 of 3: Personal Information')).toBeVisible();
  await expect(page.getByText('1. Personal')).toBeVisible();
  await expect(page.getByText('2. Credentials')).toBeVisible();
  await expect(page.getByText('3. Verification')).toBeVisible();

  // Verify close button is present in the modal header
  const closeBtn = page.getByRole('button', { name: /Close Doctor Registration/i });
  await expect(closeBtn).toBeVisible();

  // Fill Step 1
  await page.locator('input[name="full_name"]').fill('Dr. Modal Test');
  await page.locator('input[name="email"]').fill('dr.modal@clinic.com');
  await page.locator('input[name="mobile_number"]').fill('9988776655');
  await page.locator('select[name="state"]').selectOption('Maharashtra');
  await page.locator('input[name="date_of_birth"]').fill('1988-08-20');
  await page.locator('select[name="gender"]').selectOption('Female');

  // Advance to Step 2
  await page.getByRole('button', { name: /Continue to Professional Details/i }).click();
  await expect(page.getByText('Step 2 of 3: Medical Credentials')).toBeVisible();

  // Fill Step 2
  await page.locator('select[name="specialty"]').selectOption('General Medicine');
  await page.locator('input[name="registration_number"]').fill('MCI-99887');
  await page.locator('input[name="medical_council"]').fill('Maharashtra Medical Council');
  await page.locator('input[name="qualifications"]').fill('MBBS, MD');
  await page.locator('input[name="experience_years"]').fill('10');
  await page.locator('input[name="languages"]').fill('English, Marathi');

  // Advance to Step 3
  await page.getByRole('button', { name: /Continue to Verification & Security/i }).click();
  await expect(page.getByText('Step 3 of 3: Verification Documents')).toBeVisible();

  // Verify close button dismisses the popup and restores landing page without URL change
  await closeBtn.click();
  await expect(page.getByRole('heading', { name: /Doctor Registration/i })).not.toBeVisible();
  expect(page.url()).not.toContain('/doctor/register');
});

