import { test, expect } from '@playwright/test';

test.describe('Kaizen Care Comprehensive E2E & Multi-Role Audit', () => {

  test('01: Landing Page & Doctor Registration Modal - Scroll Isolation & NMC Verification', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Kaizen/i);

    // Verify top navbar is visible
    const navbar = page.locator('header').first();
    await expect(navbar).toBeVisible();

    // Trigger Doctor Registration Modal from Navbar
    const docRegBtn = navbar.getByRole('button', { name: /Doctor Registration/i });
    await expect(docRegBtn).toBeVisible();
    await docRegBtn.click();

    // Verify modal rendered into document.body as portal
    const modal = page.locator('[data-lenis-prevent="true"]').first();
    await expect(modal).toBeVisible();

    // Verify Step 1 is rendered
    await expect(page.getByRole('heading', { name: /Doctor Registration/i })).toBeVisible();
    await expect(page.locator('input[name="full_name"]')).toBeVisible();

    // Attempt to submit empty Step 1 -> verify client-side validations
    await page.getByRole('button', { name: /Continue to Professional Details/i }).click();
    await expect(page.getByText(/Full name is required/i)).toBeVisible();
    await expect(page.getByText(/Email address is required/i)).toBeVisible();
    await expect(page.getByText(/Mobile number is required/i)).toBeVisible();

    // Fill Step 1 with valid data
    await page.locator('input[name="full_name"]').fill('Dr. Arvind Rao');
    await page.locator('input[name="email"]').fill('dr.arvind@clinic.com');
    await page.locator('input[name="mobile_number"]').fill('9876543210');
    await page.locator('select[name="state"]').selectOption('Karnataka');
    await page.locator('input[name="date_of_birth"]').fill('1985-04-12');
    await page.locator('select[name="gender"]').selectOption('Male');

    // Advance to Step 2
    await page.getByRole('button', { name: /Continue to Professional Details/i }).click();

    // Verify Step 2 is active
    await expect(page.getByRole('heading', { name: /Professional Information & Credentials/i })).toBeVisible();
    await page.locator('select[name="specialty"]').selectOption('Cardiology');
    await page.locator('input[name="medical_council"]').fill('Karnataka Medical Council');

    // Test Fake Doctor License: KMC-246378
    await page.locator('input[name="registration_number"]').fill('KMC-246378');
    const verifyBtn = page.getByRole('button', { name: /Verify with NMC \/ SMC/i });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // Verify rejection badge (AMBER: Not Found in Karnataka Medical Council Registry)
    await expect(page.getByText(/Not Found in Karnataka Medical Council Registry/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Status: Unverified/i)).toBeVisible();

    // Test Legitimate Doctor License: KMC-2014-98745
    await page.locator('input[name="registration_number"]').fill('KMC-2014-98745');
    await verifyBtn.click();

    // Verify acceptance badge (GREEN: Verified Active with Karnataka Medical Council)
    await expect(page.getByText(/Verified Active with Karnataka Medical Council/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Receipt: NMC-/i)).toBeVisible();

    // Close modal
    await page.getByRole('button', { name: 'Close', exact: false }).filter({ has: page.locator('span:text("close")') }).first().click();
    await expect(modal).not.toBeVisible();
  });

  test('02: Patient Authentication, Dashboard & Healthcare Submodules', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();

    // Fill patient credentials
    await page.locator('input[name="email"]').fill('patient@teleconsult.local');
    await page.locator('input[name="password"]').fill('PatientPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/Devika Pillai/i).first()).toBeVisible();
    await expect(page.getByText(/Patient/i).first()).toBeVisible();

    // Verify appointments submodule
    await page.goto('/appointments');
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByText(/Dr\. Arvind Rao/i).first()).toBeVisible();

    // Verify insurance submodule
    await page.goto('/my-insurance');
    await expect(page).toHaveURL(/\/my-insurance$/);
    await expect(page.getByText(/Star Health/i).first()).toBeVisible();

    // Verify medical records submodule
    await page.goto('/medical-records');
    await expect(page).toHaveURL(/\/medical-records$/);

    // Verify prescriptions submodule
    await page.goto('/prescriptions');
    await expect(page).toHaveURL(/\/prescriptions$/);

    // Verify consent submodule
    await page.goto('/consent');
    await expect(page).toHaveURL(/\/consent$/);
  });

  test('03: Doctor Authentication & Clinician Dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('doctor@teleconsult.local');
    await page.locator('input[name="password"]').fill('DoctorPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify redirect to doctor dashboard
    await expect(page).toHaveURL(/\/doctor\/dashboard$/);
    await expect(page.getByText(/Dr\. Arvind Rao/i).first()).toBeVisible();
    await expect(page.getByText(/Doctor/i).first()).toBeVisible();

    // Verify doctor appointments
    await page.goto('/doctor/appointments');
    await expect(page).toHaveURL(/\/doctor\/appointments$/);

    // Verify doctor availability management
    await page.goto('/doctor/availability');
    await expect(page).toHaveURL(/\/doctor\/availability$/);
  });

  test('04: Clinic Administrator Workspace & Operational Controls', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('clinic-admin@teleconsult.local');
    await page.locator('input[name="password"]').fill('AdminPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify redirect to clinic overview
    await expect(page).toHaveURL(/\/clinic\/overview$/);
    await expect(page.getByText(/Clinic Operations & Key Performance Indicators/i).first()).toBeVisible();
    await expect(page.getByText(/Clinic Administrator/i).first()).toBeVisible();

    // Verify Doctor Management tab
    await page.goto('/clinic/doctors');
    await expect(page).toHaveURL(/\/clinic\/doctors$/);
    await expect(page.getByText(/Dr\. Arvind Rao/i).first()).toBeVisible();

    // Verify Clinic Settings tab
    await page.goto('/clinic/settings');
    await expect(page).toHaveURL(/\/clinic\/settings$/);
    await expect(page.getByText(/Operating Hours/i).first()).toBeVisible();

    // Verify Audit Logs tab
    await page.goto('/clinic/audit');
    await expect(page).toHaveURL(/\/clinic\/audit$/);
  });

  test('05: Security, RBAC & OWASP Access Control Verification', async ({ page }) => {
    // Clear cookies to simulate fresh unauthenticated session
    await page.context().clearCookies();

    // 1. Unauthenticated access to protected clinic overview -> renders AuthScreen login form
    await page.goto('/clinic/overview');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();

    // 2. Unauthenticated access to doctor dashboard -> renders AuthScreen login form
    await page.goto('/doctor/dashboard');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();

    // 3. NoSQL / SQL Injection attempt in login email
    await page.goto('/login');
    await page.locator('input[name="email"]').fill("admin'OR'1'='1@clinic.com");
    await page.locator('input[name="password"]').fill('password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/Unable to authenticate with those details/i)).toBeVisible();
  });

});
