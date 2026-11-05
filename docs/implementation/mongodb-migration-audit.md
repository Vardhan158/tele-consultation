# Kaizentrix Care PostgreSQL to MongoDB Migration Audit

Status: audit and staged migration plan only. PostgreSQL remains the active runtime database.

## Current architecture

- FastAPI backend under backend/src/teleconsult.
- SQLAlchemy 2 async ORM with AsyncSession and asyncpg.
- Runtime engine: teleconsult.kernel.db.session.get_engine.
- Per-request transaction and tenant context: tenant_session plus PostgreSQL RLS setup.
- Alembic history: migrations 0001 through 0021; the latest migration is video session event persistence.
- Authentication, RBAC, appointments, payments, clinical records, settings, notifications, consent, support, and WebRTC consultation authorization all read or write PostgreSQL.
- Socket.IO signaling is appointment-scoped, but its authentication and consultation lifecycle events currently read/write PostgreSQL directly.
- React frontend API contracts should remain unchanged during repository replacement.

## Migration inventory

| Domain | Existing PostgreSQL responsibility | MongoDB target |
| --- | --- | --- |
| Identity | users, auth sessions, recovery tokens, MFA secrets/codes | users, user_sessions, recovery_tokens, mfa_credentials |
| Tenancy/RBAC | tenant identity, role/policy lookup, RLS context | tenants, tenant-scoped documents, repository authorization filters |
| Patient | profile/intake, consents, consent audit/history | patients, consents, consent_events |
| Doctor/clinic | doctor profile, credentials, approval, clinics | doctors, doctor_credentials, clinics, doctor_approvals |
| Scheduling | availability, appointment uniqueness/status transitions | doctor_availability, appointments |
| Consultation | video sessions, participant token hashes, lifecycle events | consultation_sessions, consultation_participants, video_session_events |
| Clinical | notes, finalization, amendment history, prescriptions, summaries | clinical_notes, clinical_note_amendments, prescriptions, consultation_summaries |
| Records | medical-record metadata and access/audit information | medical_records, record_access_events |
| Payments | orders, transactions, webhook idempotency, refunds | payments, payment_webhooks, refunds |
| Follow-up | plans, actions, progress history | follow_up_plans, follow_up_actions |
| Communications | notifications and preference state | notifications, notification_preferences |
| Support | support tickets and status history | support_tickets, support_events |
| Compliance | audit/outbox records | audit_logs, outbox_events |
| Settings | user settings, export/deletion requests | user_settings, data_requests |

## Required indexes and invariants

- Unique: normalized user email; tenant-scoped doctor registration number; appointment idempotency key; payment provider order/payment/webhook IDs; session token hashes.
- Compound: (tenant_id, patient_id, starts_at), (tenant_id, doctor_id, starts_at), (tenant_id, appointment_id, event_at).
- Authorization filters must include tenant and participant ownership on every repository operation.
- Clinical, payment, consent, audit, and consultation event collections must not use TTL deletion.
- TTL may be used only for explicitly temporary recovery/session documents after retention review.
- Appointment booking, payment verification, refund state transitions, and note finalization require MongoDB transactions on a replica set.

## PostgreSQL dependencies requiring replacement

- sqlalchemy, asyncpg, psycopg, alembic.
- get_engine, tenant_session, apply_rls_context.
- SQLAlchemy select, update, IntegrityError, foreign keys, unique constraints, joins, and transaction blocks in all module routes/services.
- Direct SQL access in backend/scripts/inspect_db.py, check_data.py, and clear_teleconsult_data.py.
- PostgreSQL-specific JSONB usage in the outbox model.
- Socket.IO signaling database lookups and lifecycle writes.
- Development provisioning and verification scripts.

## Staged implementation plan

1. Add a MongoDB adapter using PyMongo Async, configuration, startup ping, shutdown close, health reporting, and a repository/unit-of-work interface. Keep PostgreSQL unchanged.
2. Add collection validators, indexes, and repository tests against an isolated MongoDB replica-set test database.
3. Implement dual-read/dual-write repositories behind feature flags, beginning with identity and read-only directory data.
4. Migrate authentication/RBAC and tenant isolation, preserving password hashes and session semantics.
5. Migrate patient/doctor scheduling and appointment concurrency with transaction tests.
6. Migrate payments, clinical documents, records, follow-up, notifications, support, settings, and audit data.
7. Move Socket.IO authorization and consultation lifecycle persistence behind the same repository boundary.
8. Build a repeatable export/transform/import tool with stable IDs, checksums, relationship checks, counts, and a redacted reconciliation report.
9. Run real MongoDB integration, API, authorization, payment idempotency, clinical amendment, and WebRTC signaling tests.
10. Perform an approved maintenance-window cutover with PostgreSQL backup, final sync, reconciliation, MongoDB feature flag activation, smoke tests, monitoring, and rollback availability.
11. Remove PostgreSQL runtime dependencies only after acceptance and an agreed rollback period. Retain backups and Alembic history.

## Current blockers before implementation/cutover

- MongoDB URI/database and deployment topology are not configured in backend/.env.
- No MongoDB driver or repository layer currently exists.
- A MongoDB replica set is required for the transactional workflows.
- No approved PostgreSQL backup, maintenance window, reconciliation acceptance criteria, or rollback owner is defined.
- Existing live PostgreSQL data must be inventoried before any import; no destructive cleanup is authorized.
- Storage migration for private medical-record files is separate from metadata migration and requires an explicit storage target.

## Safety decision

No database switch, migration execution, PostgreSQL deletion, Alembic change, or data rewrite was performed during this audit.
