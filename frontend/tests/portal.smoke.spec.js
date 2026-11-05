import { test, expect } from '@playwright/test';

test('patient landing page renders without a runtime error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Kaizentrix Care', { exact: true }).first()).toBeVisible();
});

test('landing navigation exposes sign-in and registration actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /register|get started/i }).first()).toBeVisible();
});

test('clinician registration screen is reachable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /clinician registration/i }).click();
  await expect(page.getByRole('heading', { name: /clinician registration/i })).toBeVisible();
  await expect(page.getByLabel('Professional registration number')).toBeVisible();
});

test('authenticated doctor can open the doctor dashboard and appointments', async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: true, role: 'doctor', full_name: 'Test Clinician' } }));
  await page.route('**/doctor/dashboard', (route) => route.fulfill({ json: { today: 0, upcoming: 0, completed: 0, pending_notes: 0 } }));
  await page.route('**/doctor/appointments', (route) => route.fulfill({ json: [] }));
  await page.route('**/patient/notifications', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /doctor dashboard/i })).toBeVisible();
  await page.getByRole('button', { name: /appointments/i }).first().click();
  await expect(page.getByRole('heading', { name: /doctor appointments/i })).toBeVisible();
});

test('clinic administrator can review a pending doctor application', async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: true, role: 'clinic_admin', full_name: 'Clinic Admin' } }));
  await page.route('**/doctor/pending', (route) => route.fulfill({ json: [{ id: 'doc-1', full_name: 'Dr Test', specialty: 'Cardiology', clinic_name: 'Test Clinic', registration_number: 'REG-1' }] }));
  await page.route('**/doctor/doc-1/approve', (route) => route.fulfill({ json: { status: 'approved', doctor_id: 'doc-1' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /doctor approvals/i })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/dr test/i)).toBeVisible();
});

test('doctor can inspect patients, availability, settings, and clinical note actions', async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: true, role: 'doctor', full_name: 'Test Clinician' } }));
  await page.route('**/doctor/dashboard', (route) => route.fulfill({ json: { today: 1, upcoming: 1, completed: 0, pending_notes: 1 } }));
  await page.route('**/doctor/appointments', (route) => route.fulfill({ json: [{ id: 'apt-1', starts_at: '2026-11-05T10:00:00Z', ends_at: '2026-11-05T10:30:00Z', status: 'in_progress', payment_status: 'paid' }] }));
  await page.route('**/doctor/patients', (route) => route.fulfill({ json: [{ id: 'pat-1', full_name: 'Authorized Patient', preferred_language: 'English' }] }));
  await page.route('**/doctor/availability', (route) => route.fulfill({ json: [] }));
  await page.route('**/patient/notifications', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('button', { name: /patients/i }).click();
  await expect(page.getByRole('heading', { name: /patient panel/i })).toBeVisible();
  await page.route('**/doctor/patients/pat-1', (route) => route.fulfill({ json: { patient: { id: 'pat-1', full_name: 'Authorized Patient' }, appointments: [], notes: [] } }));
  await page.getByRole('button', { name: /authorized patient english/i }).click();
  await page.getByRole('button', { name: /availability/i }).click();
  await expect(page.getByRole('heading', { name: /availability/i })).toBeVisible();
  await page.getByRole('button', { name: /settings/i }).first().click();
  await expect(page.getByRole('heading', { name: /doctor settings/i })).toBeVisible();
});
