# First-visit location selection

The selector is a native modal dialog above the existing application. It supports Places Autocomplete (New), browser geolocation only after a click, map clicks, and a draggable Advanced Marker. Escape/Close/Skip dismiss it for the current tab session. Confirmed locations suppress future prompts. Change Location is available in the portal header and public desktop/mobile navigation.

## Google Cloud setup

1. Select a Google Cloud project with billing enabled.
2. Enable **Maps JavaScript API**, **Places API (New)**, and **Geocoding API**. The legacy Places API is not used.
3. Create a browser API key with **Websites (HTTP referrers)** application restrictions. Allow only actual production/staging origins, e.g. `https://your-domain.example/*`. Use a separate development key for `http://localhost:5173/*` and, if needed, `http://127.0.0.1:5173/*`.
4. Restrict that key to the three APIs above. Set quotas and billing alerts appropriate for expected usage.
5. Create a **JavaScript map ID** for Advanced Markers. Set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID` in the frontend environment or deployment build environment; restart Vite/rebuild after changes. No secret or actual key is committed. `DEMO_MAP_ID` is used only as a development fallback.
6. Serve production over HTTPS for browser geolocation. Ensure deployment headers allow `geolocation=(self)` and do not strip all referrers from Google requests; `strict-origin-when-cross-origin` is suitable for the frontend. If a CSP is configured at the host, allow Google Maps resources according to Google's CSP documentation.

References: [key restrictions](https://developers.google.com/maps/api-security-best-practices), [Autocomplete (New)](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new), [Advanced Markers setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/start), [CSP](https://developers.google.com/maps/documentation/javascript/content-security-policy).

## Persistence and boundaries

- Guests: validated versioned location in `localStorage` at `kaizen.location.v1`.
- Signed-in users: device cache is scoped to the user ID. An unchecked-by-default checkbox explicitly permits a `PUT /profile/location`. A GET restores that profile location on future visits/devices. Guest locations are never silently uploaded after login.
- MongoDB stores `discovery_location` and `discovery_location_consent` (purpose and server timestamp) on the current tenant/user's existing `users` document. No collection migration is required. Routes use existing session authorization and do not accept user/tenant identifiers from the client. MongoDB must be enabled; other database configurations return 503 for profile storage while device-only selection remains usable.
- Unchecking the checkbox means the next selection stays on the device; it does not delete a previously consented profile location. The profile value takes precedence on the next visit.
- Missing/invalid storage prompts again; denied permission, API errors, failed saves, and unavailable browser storage do not prevent Skip. A failed profile save stays open and can be retried or saved locally by unchecking consent.
- The current directory's `location` parameter matches **clinic names**, not geography. The selector deliberately does not pass city/coordinates to that unrelated filter. `useSelectedLocation().selected` exposes the choice for future supported geographic discovery. Booking, payments, clinical records, and authentication logic are unchanged.

## Verification

Frontend: `npm run build`; `npx eslint src/components/location src/lib/location.js`; `npx playwright test tests/location.spec.js --reporter=list`.

Backend (from backend): `.venv/Scripts/python.exe -m pytest tests/unit/test_profile_location.py tests/architecture/test_routes_have_authz.py -q`.

Browser tests mock Google Maps and the profile API to cover first visit, denied/granted geolocation, search, map click, marker drag, refresh persistence, Change Location, mobile Skip, corrupt storage, map auth failure, consent, save retry, and remote profile restoration. Backend tests cover tenant/user scoping, explicit consent, invalid coordinates/addresses, unauthorized requests, and missing profiles.

Live Google billing/key restrictions, actual map tiles, real Places results, OS permission prompts, and live MongoDB persistence still require a configured deployment smoke test. Use a clean browser context, confirm a location, refresh, reopen from the header, deny geolocation, and repeat on mobile. Existing end-to-end workflow tests that begin with a fresh browser should explicitly dismiss this new first-visit dialog before interacting with the page.

### Results from implementation validation

- Production frontend build: passed; bundle-size and mixed static/dynamic import warnings remain.
- ESLint for location components, utilities, and browser tests: passed.
- Ruff for the new backend route and tests: passed.
- Location Playwright suite: 8 passed (mocked Google/profile services).
- Profile location and authorization architecture tests: 13 passed.
- Broader backend unit suite: 70 passed, 27 failed, 1 skipped, 2 errors. Confirmed failure causes include MongoDB-enabled environment conflicting with disabled-database assertions, appointment collection mocks missing `find_one_and_update`, and missing `MONGODB_TEST_URI` for integration fixtures. Full regression success is not established.

## Changed files

- `frontend/src/components/location/LocationProvider.jsx`: restoration, device storage, consented profile saves, header action.
- `frontend/src/components/location/LocationModal.jsx`: accessible overlay, map/search/geolocation, preview, error handling.
- `frontend/src/components/location/location.css`: responsive green-and-white presentation.
- `frontend/src/lib/location.js`: Maps loader, address normalization, saved-value validation.
- `frontend/src/main.jsx`, `frontend/src/App.jsx`: provider mounting and existing identity synchronization.
- `frontend/src/components/layout/Header.jsx`, `frontend/src/components/layout/Navbar.tsx`: Change Location actions.
- `backend/src/teleconsult/modules/identity/location_routes.py`, `backend/src/teleconsult/main.py`: protected MongoDB profile endpoints and registration.
- `frontend/tests/location.spec.js`, `backend/tests/unit/test_profile_location.py`: automated coverage.
- `frontend/.env.example`, `LOCATION_SETUP.md`: environment template and setup/verification instructions.
