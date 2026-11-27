import { expect } from '@playwright/test';

export const patient = { email: process.env.E2E_PATIENT_EMAIL, password: process.env.E2E_PATIENT_PASSWORD };
export const doctor = { email: process.env.E2E_DOCTOR_EMAIL, password: process.env.E2E_DOCTOR_PASSWORD };
export const hasPatient = Boolean(patient.email && patient.password);
export const hasDoctor = Boolean(doctor.email && doctor.password);

export async function login(page, credentials) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole('button', { name: /sign in securely/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export function blocked(test, reason) { test.skip(true, `BLOCKED: ${reason}`); }
