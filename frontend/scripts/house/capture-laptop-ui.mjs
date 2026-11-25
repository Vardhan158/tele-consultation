// Run with the local Vite server running. Every API request is intercepted.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../../public/assets/house/laptop-ui/', import.meta.url));
const origin = 'http://localhost:5173';
const width = 1200;
const height = 780;
const browser = await chromium.launch({ channel: 'chromium' });
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2030-04-08T04:00:00Z'));
  let signedIn = false;
  const doctors = ['Dr. Asha Rao', 'Dr. Nikhil Shah'].map((full_name, i) => ({
    id: `demo-${i}`, full_name, specialty: i ? 'Internal Medicine' : 'General Medicine',
    clinic_name: 'Kaizen Care', qualifications: ['MBBS', 'MD'], approval_status: 'approved',
    experience_years: 12 - i, supported_languages: ['English', 'Hindi'], fee_paise: 50000,
    currency: 'INR', timezone: 'Asia/Kolkata', registration_number: 'DEMO PROFILE',
  }));
  const responses = {
    '/api/v1/patient/doctors': doctors,
    '/api/v1/patient/booking-options': { appointment_types: ['First Consultation'], visit_formats: ['Video consultation'] },
    '/patient/profile': { full_name: 'Demo Patient' },
  };
  let mutations = 0;
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data) => route.fulfill({ json: data, headers: cors });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (request.method() !== 'GET') { mutations++; return route.abort(); }
    if (url.pathname === '/auth/me') return json({ authenticated: signedIn, role: 'patient', full_name: 'Demo Patient' });
    if (url.pathname in responses) return json(responses[url.pathname]);
    if (/\/patient\/doctors\/demo-\d\/availability$/.test(url.pathname)) {
      return json([{ id: 'demo-slot', starts_at: '2030-04-09T05:30:00Z', duration_minutes: 30 }]);
    }
    if (url.pathname.endsWith('/pricing')) return json({ currency: 'INR', base_fee_paise: 50000, platform_fee_paise: 0, total_payable_paise: 50000, duration_minutes: 30 });
    if (/^\/(api|patient|auth)\//.test(url.pathname)) return json([]);
    if (url.origin === origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    return route.abort();
  });
  const frameTargets = {};
  const capture = async (name, target) => {
    await target?.scrollIntoViewIfNeeded();
    if (target) {
      const rect = await target.boundingBox();
      frameTargets[name] = [(rect.x + rect.width / 2) / width, (rect.y + rect.height / 2) / height];
    }
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ animations: 'disabled', timeout: 15000 });
    execFileSync('python', ['-c', 'from PIL import Image; import io,sys; Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB").resize((960,624),Image.Resampling.LANCZOS).save(sys.argv[1], quality=86, method=6)', `${output}/${name}.webp`], { input: png });
  };
  const badge = () => page.evaluate(() => {
    const tag = document.createElement('div');
    tag.textContent = 'SIMULATED BOOKING';
    Object.assign(tag.style, { position: 'fixed', bottom: '12px', right: '14px', zIndex: 9999, color: '#fff', background: '#162623', padding: '7px 12px', borderRadius: '6px', font: 'bold 13px system-ui', letterSpacing: '0.08em', pointerEvents: 'none' });
    document.body.append(tag);
  });
  await page.goto(origin);
  const nav = page.getByRole('link', { name: 'Find Doctors', exact: true }).first();
  await nav.waitFor();
  await page.waitForTimeout(800);
  await capture('landing', nav);
  signedIn = true;
  await page.goto(`${origin}${await nav.getAttribute('href')}`);
  const book = page.locator('button').filter({ has: page.getByText('Book', { exact: true }) }).first();
  await book.waitFor({ timeout: 10000 }).catch(async (error) => {
    throw new Error(`${page.url()} ${await page.locator('body').innerText()}`, { cause: error });
  });
  await badge();
  await capture('doctors', book);
  await book.click();
  const slot = page.getByRole('button', { name: /11:00/ }).first();
  await slot.waitFor();
  await capture('schedule', slot);
  await slot.click();
  for (const label of [/24-hour appointment cancellation/, /consent for telehealth/]) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  const confirm = page.getByRole('button', { name: 'Continue to Payment' });
  // Leave the real handler untouched. The preview only captures the restyled DOM.
  await confirm.evaluate((button) => { button.textContent = 'Confirm demo appointment'; button.disabled = false; });
  await capture('review', page.getByRole('button', { name: 'Confirm demo appointment' }));
  await page.getByRole('button', { name: 'Confirm demo appointment' }).evaluate((button) => {
    const sheet = button.parentElement.closest('.fixed');
    sheet.innerHTML = `<div class="care-card max-w-lg w-full p-8 space-y-5 border-2 border-emerald-500 shadow-2xl">
      <div class="text-center space-y-3"><span class="material-symbols-outlined text-emerald-700">check_circle</span>
      <h2 class="text-2xl font-bold text-[#162623]">Demo appointment confirmed</h2>
      <p class="text-sm text-[#577877]">This is a simulation. No appointment was booked and no payment was made.</p></div>
      <div class="rounded-xl bg-[#F0F5F7] p-5 text-sm text-[#162623] space-y-2"><p class="font-bold">Dr. Asha Rao</p><p>General Medicine · First consultation</p><p>Tuesday, April 9 · 11:00 AM IST</p></div></div>`;
  });
  await capture('confirmed');
  if (mutations) throw new Error(`Capture attempted ${mutations} non-GET requests`);
  await writeFile(new URL('../../src/components/public/story/laptopTargets.json', import.meta.url), JSON.stringify(frameTargets, null, 2) + '\n');
} finally {
  await browser.close();
}
