import { test, expect } from '@playwright/test';

const saved = { version: 1, address: 'Bengaluru, India', city: 'Bengaluru', state: 'Karnataka', country: 'India', postal_code: '560001', latitude: 12.97, longitude: 77.59 };

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.addInitScript(() => {
    window.geoCalls = 0;
    navigator.geolocation.getCurrentPosition = (_success, failure) => { window.geoCalls++; failure({ code: 1 }); };
    const result = { formatted_address: 'Bengaluru, India', address_components: [{ types: ['locality'], long_name: 'Bengaluru' }, { types: ['country'], long_name: 'India' }] };
    class Map {
      constructor(node) { node.textContent = 'Interactive map'; window.testMap = this; this.events = {}; }
      addListener(event, callback) { this.events[event] = callback; return { remove() {} }; }
      panTo() {} setZoom() {}
    }
    class Marker {
      constructor(options) { Object.assign(this, options); this.events = {}; window.testMarker = this; }
      addListener(event, callback) { this.events[event] = callback; return { remove() {} }; }
    }
    class Autocomplete extends HTMLElement {
      constructor() { super(); }
      connectedCallback() {
        this.innerHTML = '<button type="button">Choose Bengaluru search result</button>';
        this.querySelector('button').onclick = () => this.dispatchEvent(Object.assign(new Event('gmp-select'), {
          placePrediction: { toPlace: () => ({ fetchFields: async () => {}, formattedAddress: result.formatted_address, addressComponents: [], location: { toJSON: () => ({ lat: 12.97, lng: 77.59 }) } }) },
        }));
      }
    }
    customElements.define('mock-autocomplete', Autocomplete);
    window.google = { maps: { importLibrary: async () => ({ Map, AdvancedMarkerElement: Marker, PlaceAutocompleteElement: Autocomplete, Geocoder: class { async geocode() { return { results: [result] }; } } }) } };
  });
});

test('first visit, denied permission, search, persistence and change location', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detect My Current Location' })).toBeEnabled();
  expect(await page.evaluate(() => window.geoCalls)).toBe(0);
  await page.getByRole('button', { name: 'Detect My Current Location' }).click();
  await expect(page.getByRole('alert')).toContainText('permission was denied');
  await page.getByRole('button', { name: 'Choose Bengaluru search result' }).click();
  await page.getByRole('button', { name: 'Confirm Location' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change Location' }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change Location' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Bengaluru, India', { exact: true })).toBeVisible();
});

test('manual selection and granted geolocation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Detect My Current Location' })).toBeEnabled();
  await page.evaluate(() => window.testMap.events.click({ latLng: { toJSON: () => ({ lat: 11, lng: 76 }) } }));
  await expect(page.getByText('Coordinates: 11.000000, 76.000000')).toBeVisible();
  await page.evaluate(() => { window.testMarker.position = { lat: 12, lng: 77 }; window.testMarker.events.dragend(); });
  await expect(page.getByText('Coordinates: 12.000000, 77.000000')).toBeVisible();
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (success) => success({ coords: { latitude: 13, longitude: 78 } }); });
  await page.getByRole('button', { name: 'Detect My Current Location' }).click();
  await expect(page.getByText('Coordinates: 13.000000, 78.000000')).toBeVisible();
});

test('skip continues and suppresses prompts for the session on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Skip for Now' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  await page.getByRole('button', { name: 'Change Location' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('valid saved location suppresses modal', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('kaizen.location.v1', JSON.stringify(value)), saved);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Change Location' }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('corrupt saved location prompts again', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kaizen.location.v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('profile storage requires consent and a failed save can be retried', async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: true, user_id: 'patient-1', role: 'patient' } }));
  let writes = 0;
  let payload;
  await page.route('**/profile/location', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { location: null } });
    writes++;
    payload = route.request().postDataJSON();
    return route.fulfill(writes === 1 ? { status: 503, json: { detail: 'Unavailable' } } : { json: { location: payload.location } });
  });
  await page.goto('/services');
  await page.getByRole('button', { name: 'Choose Bengaluru search result' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Confirm Location' }).click();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Change Location' }).first().click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm Location' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await page.getByRole('button', { name: 'Confirm Location' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(payload.consent).toBe(true);
  expect(writes).toBe(2);
});

test('profile location restores without prompting', async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { authenticated: true, user_id: 'patient-1', role: 'patient' } }));
  await page.route('**/profile/location', (route) => route.fulfill({ json: { location: saved } }));
  await page.goto('/services');
  await expect(page.getByRole('button', { name: 'Change Location' }).first()).toHaveAttribute('title', saved.address);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('map authentication failure remains skippable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Detect My Current Location' })).toBeEnabled();
  await page.evaluate(() => window.gm_authFailure());
  await expect(page.getByRole('alert')).toContainText('could not load');
  await page.getByRole('button', { name: 'Skip for Now' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
