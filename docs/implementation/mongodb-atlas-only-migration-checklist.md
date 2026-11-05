# MongoDB Atlas-only backend migration checklist

Status: planning/audit. MongoDB application traffic remains disabled.

## Runtime and security boundary

- [ ] Replace kernel/db/session.py request sessions with a MongoDB unit of work.
- [ ] Replace PostgreSQL RLS context with explicit tenant/clinic/subject filters.
- [ ] Move kernel/authz/policy.py principal resolution to MongoDB sessions.
- [ ] Add a single feature-flagged MongoDB service composition root.
- [ ] Preserve PostgreSQL as rollback-only until Atlas-only acceptance passes.

## Identity and five roles

- [ ] modules/identity/auth_routes.py: registration, login, verification, recovery, reset, logout.
- [ ] modules/identity/doctor_routes.py: doctor registration, approval, MFA.
- [ ] modules/identity/settings_routes.py: settings, sessions, export/deletion requests.
- [ ] Patient identity/profile and consent ownership.
- [ ] Doctor/clinic administrator isolation.
- [ ] Platform Support scoped operational access.
- [ ] Security/Operations audit-only access.

## Patient and doctor workflows

- [ ] modules/patient_portal/routes.py: profile, doctors, availability, appointments, history.
- [ ] modules/consultation/doctor_routes.py: dashboard, appointments, availability, patients, notes.
- [ ] modules/scheduling/admin_routes.py: clinic scheduling and availability.
- [ ] Patient and clinician API response compatibility tests.

## Payments and scheduling

- [x] MongoDB scheduling repository primitives and real Atlas concurrency validation.
- [x] MongoDB payment repository primitives and real Atlas idempotency validation.
- [ ] Connect scheduling services to FastAPI routes.
- [ ] Connect payment services to FastAPI routes.
- [ ] Razorpay test-mode API integration.
- [ ] Appointment/payment consistency and recovery workflows.

## Clinical and records

- [ ] modules/records/patient_routes.py: private file metadata and access control.
- [ ] modules/records/clinical_routes.py: summaries and prescriptions.
- [ ] Clinical note draft/finalization/amendment history.
- [ ] Consent history and required-consent enforcement.
- [ ] Follow-up plans and clinical history.
- [ ] Private object storage integration; no public medical-document URLs.

## Supporting modules

- [ ] Notifications and preferences.
- [ ] Support tickets and scoped support access.
- [ ] Audit logs and security events.
- [ ] Clinic settings and doctor approval history.
- [ ] Operational reports and outbox/recovery records.

## Consultation persistence

- [ ] modules/consultation/video_routes.py: MongoDB session authorization.
- [ ] modules/consultation/signaling.py: MongoDB lifecycle/event persistence.
- [ ] Waiting-room admission, join/leave, completion, and reconnect cleanup.
- [ ] Preserve WebRTC + Socket.IO; no Daily integration.

## Runtime removal gate

- [ ] Dedicated Atlas test database with synthetic records.
- [ ] All five role workflows pass against MongoDB.
- [ ] Clinical, payments, scheduling, authorization, and WebRTC integration tests pass.
- [ ] Backend starts and serves all APIs without PostgreSQL credentials.
- [ ] MONGODB_ENABLED=true and MONGODB_REPOSITORIES_ENABLED=true only in isolated development.
- [ ] Remove unused PostgreSQL runtime dependencies after acceptance.
- [ ] Keep Alembic files and PostgreSQL backups until separately approved.

## Current blockers

The current environment has no PostgreSQL connection URL, so historical data
backup, export, relationship reconciliation, and migration cannot be performed.
MongoDB repositories are incomplete for clinical, records, notifications,
support, settings, audit, and consultation persistence. The application must
not be switched to Atlas-only mode until those modules and their integration
tests are complete.
