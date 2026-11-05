# Patient Portal end-to-end acceptance checklist

Status is intentionally evidence-based. `PASS` means an automated/local check
currently proves the item. `PENDING` requires an environment, provider, staff
role, clinical owner, or operational drill that is not available in the local
scaffold.

## Authentication & Consent

- [ ] Register patient successfully — PENDING provider/database E2E
- [ ] Verify patient identity — PENDING OIDC/verification provider
- [ ] Log in and log out — PENDING browser/session E2E
- [ ] Recover account access — PENDING verified recovery channel
- [x] Capture versioned consent — backend/API implemented
- [x] Block activities requiring declined consent — consent state persisted; booking gate E2E pending

## Doctor Discovery & Booking

- [x] Find an approved doctor — API and frontend implemented
- [x] Filter doctors by specialty — API and frontend implemented
- [x] Display current availability — slot API and frontend implemented
- [x] Book an available appointment — backend transaction implemented
- [x] Prevent duplicate booking — idempotency and slot constraints implemented
- [x] Reschedule appointment — backend/frontend implemented
- [x] Cancel appointment under policy — cancellation authorization implemented; clinic policy integration pending

## Payment & Notifications

- [ ] Complete required payment — provider integration pending
- [x] Verify payment server-side — verification boundary implemented
- [x] Recover from failed payment — pending/failed states implemented
- [x] Prevent duplicate charge — idempotency implemented
- [x] Send appointment confirmation — notification ledger implemented; provider delivery pending
- [x] Preserve appointment when notification fails — state isolation implemented

## Video Consultation

- [x] Validate appointment check-in — backend implemented
- [x] Validate camera and microphone — browser readiness flow implemented
- [x] Generate authorized short-lived token — backend implemented
- [x] Enter waiting room — backend/frontend implemented
- [ ] Doctor admits correct patient — clinician workflow/provider integration pending
- [ ] Complete consultation — clinician completion workflow pending
- [x] Recover from disconnection — session state and retry flow implemented
- [ ] Handle video provider outage — provider runbook/drill pending

## Clinical Records & Follow-Up

- [x] Upload and scan medical report — validation/scan state implemented; real scanner pending
- [ ] Doctor saves clinical notes — clinician authoring workflow pending
- [ ] Release approved consultation summary — release workflow pending
- [ ] Release permitted prescription — clinical authorization workflow pending
- [x] Restrict unreleased records — release-filtered queries implemented
- [x] Arrange follow-up — follow-up/support API implemented
- [ ] Show consultation history — encounter history integration pending

## Security & Reliability

- [x] Prevent cross-patient record access — tenant/patient filters implemented
- [x] Enforce role-based permissions — protected routes use backend permission dependencies
- [x] Record required audit events — audit records and appointment events implemented
- [x] Handle expired session — session expiry/revocation implemented
- [ ] Test concurrent booking requests — load/integration environment pending
- [ ] Verify backup and recovery procedures — operational restore drill pending

## Completion gate

The Patient Portal is not considered complete until all pending provider,
clinician, browser, load, backup, accessibility, and security checks have
evidence attached. This checklist does not replace detailed test suites.
