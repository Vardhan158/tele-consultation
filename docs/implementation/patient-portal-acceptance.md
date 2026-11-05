# Patient Portal implementation acceptance baseline

This document translates the Patient Portal objectives into verifiable delivery
requirements. The percentage targets are pilot validation goals, not claims of
current system performance.

| ID | Requirement | MVP verification | Production/pilot evidence |
| --- | --- | --- | --- |
| PP-01 | Patient account creation and secure access | Registration, login, logout, session expiry, and recovery tests pass | OIDC/identity-provider review, abuse tests, security assessment |
| PP-02 | Privacy and consultation consent | Consent version, timestamp, actor, and withdrawal state are persisted and audited | Legal approval of consent wording and retention review |
| PP-03 | Doctor directory | Doctor profile includes specialty, fee, clinic, status, and availability | Reconciliation with clinic source of truth |
| PP-04 | Conflict-free booking | Database constraint plus transaction-level availability check rejects duplicate/conflicting bookings | Load test with concurrent booking attempts; target >=95% valid booking completion |
| PP-05 | Online payment | Appointment payment state is explicit and idempotent; failed payment leaves appointment recoverable | Payment-provider reconciliation and payment-failure runbook |
| PP-06 | Secure consultation join | Appointment authorization gates a time-bound video-room token; join failures have retry/fallback states | Supported-device/network matrix; target >=98% join success |
| PP-07 | Failure recovery | Device check, network retry, provider outage, cancellation, reschedule, and support paths are visible | Incident drills and video-outage runbook validation |
| PP-08 | Clinical documents | Patient can access only documents attached to an authorized completed consultation | Access-control tests, export tests, retention review |
| PP-09 | Follow-up care | Cancellation, rescheduling, follow-up appointment, prescription and summary states are represented | Clinic workflow acceptance and notification delivery checks |
| PP-10 | Privacy and audit | Tenant, patient, clinician, and purpose checks protect every clinical route; sensitive access emits an audit event | 100% sensitive-access audit coverage; zero unresolved critical findings |
| PP-11 | Performance and availability | Automated smoke and API latency checks run in CI | 99.9% monthly availability measurement in production |
| PP-12 | Accessibility | Keyboard navigation, labels, focus states, contrast, and responsive layouts are tested | WCAG 2.2 AA audit |

## Required state model

Appointments use the following lifecycle:

`requested -> payment_pending -> confirmed -> checked_in -> in_consultation -> completed`

Terminal or recovery states are:

`cancelled`, `reschedule_requested`, `payment_failed`, `provider_failed`, and
`no_show`.

Transitions must be performed by backend commands, not by client-side status
updates. Every transition records the actor, timestamp, reason, tenant, and
correlation ID in the audit stream.

## Delivery order

1. Identity, patient profile, consent, and tenant-scoped authorization.
2. Doctor directory, availability, appointment constraints, and booking.
3. Payment abstraction with idempotency and failure recovery.
4. Consultation room abstraction, device readiness, join token, and recovery UI.
5. Records, prescriptions, summaries, notifications, and follow-up actions.
6. Security, accessibility, load, availability, and pilot-evidence automation.

No production patient data should be used for local development; seed data must
remain synthetic.

## Role and authorization baseline

The platform has five operational roles. A role is not sufficient authorization
by itself: every protected request must also be checked against tenant, subject,
relationship, appointment, purpose, and resource state.

| Role | Allowed responsibilities | Explicitly prohibited |
| --- | --- | --- |
| Patient | Own profile, consent, appointments, uploads, authorized consultation join, released outputs | Other patients' records; doctor notes; prescriptions; fees; payment success; admission bypass |
| Doctor | Own availability, admit assigned patient, conduct consultation, author notes and permitted outputs | Other clinics' configuration; unassigned patient records; changing payment state outside the payment workflow |
| Clinic Administrator | Clinic doctors, availability, fees, booking exceptions, clinic configuration | Reading clinical content beyond granted operational purpose; altering clinical authorship |
| Platform Support | Account, payment, booking, and connection assistance through approved support workflows | Undisclosed record access; impersonation; silent changes to clinical or payment records |
| Security/Operations | Availability, incident investigation, security controls, audit review | Routine clinical access; changing clinical content; bypassing tenant controls |

### Patient authorization rules

The backend must enforce these rules on every relevant endpoint:

- Patient reads and writes are scoped to the authenticated patient subject.
- A patient may join only a consultation for their own confirmed appointment,
  within the allowed join window, after required consent, payment, and provider
  checks have passed.
- Clinical documents become readable only after release by an authorized
  clinician or clinic workflow.
- Uploads are associated with the patient and consultation context, scanned,
  and never treated as trusted executable input.
- Patient clients cannot submit authoritative payment-success, admission,
  prescription, fee, or doctor-note state.
- Support access requires a separately audited purpose and time-bounded grant;
  it must not reuse patient permissions.
- Every denied access is safe to the caller and does not reveal whether another
  patient's resource exists.

## Patient module map

The patient navigation exposes the following ten patient-facing capabilities.
Staff-only doctor management, clinic administration, support operations, audit,
and monitoring remain backend/shared modules and are not patient sidebar items.

| ID | Patient-facing module | Shared backend capability | Current UI route |
| --- | --- | --- | --- |
| P01 | Registration, Login & Account Recovery | Authentication & User Management | `profile` |
| P02 | Profile, Medical Intake & Consent | Patient Profile & Consent | `profile` |
| P03 | Find Doctors | Doctor Directory | `find-doctors` |
| P04 | Book & Manage Appointments | Appointment Management | `appointments` |
| P05 | Payments & Refunds | Payment & Refund Management | `payments` |
| P06 | Notifications & Reminders | Notifications & Reminders | `notifications` |
| P07 | Video Consultation | Video Consultation | `video-consultation` |
| P08 | Medical Records & Documents | Clinical Records & Document Management | `medical-records` |
| P09 | Prescriptions & Consultation Summaries | Prescription & Medical Advice | `prescriptions` |
| P10 | Follow-Up & Support | Follow-Up Management & Support | `support` |

The dashboard is a patient home surface, not an additional functional module.
Each module must expose only patient-safe actions in the patient client; the
authoritative permissions and state transitions live in the backend.

## Complete patient journey and recovery branches

The journey is represented by backend-controlled state transitions:

`landing -> authenticated -> consent_required -> slot_selection -> health_details -> payment_pending? -> confirmed -> waiting_room -> in_consultation -> documents_pending -> completed -> follow_up`

The payment step is conditional: clinics that do not require payment move from
valid health details directly to confirmation. The following recovery branches
preserve already-valid data and return the patient to a safe state:

| Branch | Safe recovery state |
| --- | --- |
| Consent rejected | `consent_rejected`; explain the consequence and allow review or exit |
| Doctor/slot unavailable | `doctor_unavailable` -> return to slot selection |
| Invalid health details | `invalid_health_details` -> return to intake with validation errors |
| Payment failure | `payment_failed` -> retry payment or choose another slot |
| Missed appointment | `missed_appointment` -> follow-up or new slot selection |
| Interrupted video | `video_interrupted` -> waiting-room retry or follow-up support |
| Clinical documents unavailable | `documents_unavailable` -> follow-up/support without exposing missing data |

The state machine is implemented in `backend/src/teleconsult/modules/patient_portal/journey.py`.

## Cross-role integration invariants

- Patient doctor search and booking both require `approved_for_consultation`;
  hiding an unapproved doctor in the UI is not an authorization control.
- Clinic schedule publication is additive. An existing slot with a pending,
  confirmed, checked-in, or in-progress appointment cannot be silently replaced.
  The admin scheduling endpoint returns a conflict and requires an explicit
  exception workflow.
- Payment verification is the only operation allowed to move a payment-required
  appointment to `confirmed`.
- Patient check-in creates a video waiting session; only an authorized doctor
  admission can move it to `in_progress`.
- Notification delivery is asynchronous and cannot roll back a confirmed
  appointment, released document, or payment result.
- Clinical documents and prescriptions are patient-readable only after an
  explicit release state; support tickets do not grant clinical-record access.
- Technical session failure, payment failure, and notification failure preserve
  the clinical and appointment records already safely committed.

The clinic scheduling publication endpoint is:

`POST /admin/doctors/{doctor_id}/availability`
