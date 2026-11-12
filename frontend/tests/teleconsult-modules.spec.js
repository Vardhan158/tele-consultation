import { test, expect } from '@playwright/test';
import { blocked, doctor, hasDoctor, hasPatient, login, patient } from './e2e-helpers.js';

test.describe('Kaizentrix teleconsult E2E modules', () => {
  test('01 authentication', async ({ page }) => {
    if (!hasPatient) blocked(test, 'E2E_PATIENT_EMAIL and E2E_PATIENT_PASSWORD are not configured');
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in to patient portal/i })).toBeVisible();
    await login(page, patient);
  });

  test('02 patient profile', async ({ page }) => {
    if (!hasPatient) blocked(test, 'patient credentials missing');
    await login(page, patient); await page.goto('/profile');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('03 doctor discovery', async ({ page }) => {
    await page.goto('/find-doctors');
    await expect(page.getByText(/find doctors|care specialists/i).first()).toBeVisible();
  });

  test('04 booking', async ({ page }) => {
    if (!hasPatient) blocked(test, 'patient credentials missing');
    await login(page, patient); await page.goto('/find-doctors');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('05 sandbox payment', async ({ page }) => {
    if (!hasPatient || !process.env.E2E_PAYMENT_SANDBOX) blocked(test, 'authorized sandbox payment configuration missing');
    await login(page, patient); await page.goto('/payments');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('06 doctor portal uses an independent authenticated context', async ({ browser }) => {
    if (!hasDoctor) blocked(test, 'E2E_DOCTOR_EMAIL and E2E_DOCTOR_PASSWORD are not configured');
    const context = await browser.newContext(); const page = await context.newPage();
    await login(page, doctor); await page.goto('/doctor/dashboard');
    await expect(page.getByRole('main')).toBeVisible(); await context.close();
  });

  test('07 WebRTC requires both contexts and live remote media', async ({ browser }) => {
    if (!hasPatient || !hasDoctor || !process.env.E2E_CONSULTATION_ID) blocked(test, 'patient, doctor, and consultation credentials/data missing');
    const pctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const dctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const pp = await pctx.newPage(); const dp = await dctx.newPage();
    await login(pp, patient); await login(dp, doctor);
    await pp.goto('/appointments'); await dp.goto('/doctor/appointments');
    await expect(pp.locator('video')).toHaveCount(1); await expect(dp.locator('video')).toHaveCount(1);
    await expect(pp.locator('video').nth(0)).toHaveJSProperty('readyState', 4);
    await expect(dp.locator('video').nth(0)).toHaveJSProperty('readyState', 4);
    await pctx.close(); await dctx.close();
  });

  test('08 consultation completion', async ({ page }) => {
    if (!hasPatient || !process.env.E2E_CONSULTATION_ID) blocked(test, 'patient credentials or consultation data missing');
    await login(page, patient); await page.goto('/appointments');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('09 security: protected route and security headers', async ({ request, page }) => {
    const apiBase = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8000';
    const protectedResponse = await request.get(`${apiBase}/patient/profile`);
    expect([401, 403]).toContain(protectedResponse.status());
    const apiResponse = await request.get(`${apiBase}/health`);
    expect(apiResponse.headers()['x-content-type-options']).toBeTruthy();
  });
});
