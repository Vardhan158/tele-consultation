import { expect, test } from '@playwright/test';

test.use({ channel: 'chrome', video: 'off' });

test('production landing navigation, hero, footer, auth and checkout work with isolated fixtures', async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const writes = [];
  let loggedIn = false;
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000);
  starts.setUTCHours(10, 0, 0, 0);
  const doctor = { id: 4201, full_name: 'Dr. QA Fixture', specialty: 'General Medicine',
    approved_for_consultation: true, currency: 'INR', fee_paise: 50000, timezone: 'UTC' };
  const profile = { id: 4202, role: 'patient', authenticated: true, full_name: 'QA Patient', email: 'qa@example.test' };
  const slot = { id: 4203, starts_at: starts.toISOString(), ends_at: new Date(+starts + 20 * 60 * 1000).toISOString() };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace(/^\/api(?=\/(auth|patient)\/)/, '');
    if (!/^\/(auth|patient|api\/v1\/patient|api\/newsletter)\//.test(path)
      || !['fetch', 'xhr'].includes(request.resourceType()) && method !== 'OPTIONS') {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        await route.abort();
        throw new Error(`Unexpected remote write ${method} ${url.pathname}`);
      }
      return route.fallback();
    }
    const origin = request.headers().origin || new URL(testInfo.project.use.baseURL).origin;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, idempotency-key' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (method !== 'GET') writes.push({ method, path });
    let json = [];
    if (path === '/auth/me') json = loggedIn ? profile : { authenticated: false };
    else if (path === '/auth/login' && method === 'POST') { loggedIn = true; json = profile; }
    else if (path === '/auth/logout' && method === 'POST') { loggedIn = false; json = { ok: true }; }
    else if (path === '/patient/profile') json = profile;
    else if (path === '/api/v1/patient/doctors') json = [doctor];
    else if (path.endsWith('/availability')) json = [slot];
    else if (path.endsWith('/pricing')) json = { currency: 'INR', base_fee_paise: 50000, platform_fee_paise: 0, total_payable_paise: 50000 };
    else if (path === '/api/newsletter/subscribe' && method === 'POST') {
      expect(request.postDataJSON().consent).toBe(true);
      json = { message: 'QA newsletter confirmation' };
    } else if (path === '/patient/payments/create-order' && method === 'POST') {
      expect(request.postDataJSON()).toMatchObject({ doctor_id: doctor.id, starts_at: slot.starts_at });
      json = { key_id: 'fixture', amount_paise: 50000, base_fee_paise: 50000, platform_fee_paise: 0,
        payment_id: 'fixture', order_id: 'fixture-order', appointment_id: 'fixture-appointment' };
    } else if (path === '/patient/payments/verify' && method === 'POST') json = { ok: true };
    else if (method !== 'GET') throw new Error(`Unexpected local write ${method} ${path}`);
    return route.fulfill({ json, headers });
  });
  await page.addInitScript(() => {
    window.Razorpay = class {
      constructor(options) { this.options = options; }
      open() {
        this.options.handler({ razorpay_order_id: 'fixture-order', razorpay_payment_id: 'fixture-payment', razorpay_signature: 'fixture-signature' });
      }
    };
  });
  await page.goto('/');
  const hero = page.locator('#home');
  await expect(hero.getByRole('img', { name: 'Physician at Kaizen Care' })).toBeVisible();
  await hero.getByRole('button', { name: '3D Stethoscope' }).click();
  await expect(hero.locator('canvas')).toBeVisible();
  await expect(hero.getByText(/Stethoscope.glb.*Loaded/)).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await nav.getByRole('link', { name: 'Find Doctors' }).click();
  await expect(page.getByText(doctor.full_name, { exact: true }).first()).toBeVisible();
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/services');
  await expect(footer.getByRole('link', { name: /support@/ })).toHaveAttribute('href', /^mailto:/);
  await expect(footer.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  await footer.getByRole('textbox', { name: 'Email address' }).fill('qa@example.test');
  await footer.getByRole('checkbox').check();
  await footer.getByRole('button', { name: 'Subscribe' }).click();
  await expect(footer.getByRole('status')).toHaveText('QA newsletter confirmation');
  await page.setViewportSize({ width: 820, height: 1180 });
  const tabletRegistration = page.locator('header').getByRole('button', { name: 'Doctor Registration' });
  const tabletBox = await tabletRegistration.boundingBox();
  expect(tabletBox.x + tabletBox.width).toBeLessThanOrEqual(820);
  await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav.getByRole('link', { name: 'Find Doctors' })).toBeVisible();
  await mobileNav.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('input[name="email"]').fill(profile.email);
  await page.locator('input[name="password"]').fill('FixturePassword123!');
  await page.getByRole('button', { name: /sign in securely/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/find-doctors');
  await page.getByRole('button', { name: /\bbook$/i }).first().click();
  const checkout = page.getByRole('button', { name: 'Continue to Payment' });
  await expect(checkout).toBeVisible();
  await expect(checkout).toBeDisabled();
  await page.getByRole('button', { name: /10:00\s*am/i }).click();
  await page.getByRole('checkbox', { name: /cancellation policy/i }).check();
  await page.getByRole('checkbox', { name: /grant consent/i }).check();
  await checkout.click();
  await expect(page.getByRole('heading', { name: /payment & booking confirmed/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fixture-booking-confirmation.png') });
  await page.getByRole('button', { name: 'Go to My Appointments' }).click();
  await expect(page).toHaveURL(/\/appointments$/);
  await page.locator('header button[aria-haspopup="true"]').click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: /sign in to patient portal/i })).toBeVisible();
  await testInfo.attach('fixture-writes', { body: JSON.stringify(writes), contentType: 'application/json' });
  expect(writes.map(({ path }) => path)).toEqual(['/api/newsletter/subscribe', '/auth/login', '/patient/payments/create-order', '/patient/payments/verify', '/auth/logout']);
});
