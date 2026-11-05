# MongoDB repository dependency map

MongoDB repository mode is preparation-only. PostgreSQL remains the active
application datastore while each module is migrated and verified independently.

| Module | Current PostgreSQL boundary | MongoDB repository target | Activation gate |
| --- | --- | --- | --- |
| Identity/RBAC | auth routes, policy lookup, sessions, recovery, MFA | users, user_sessions, recovery_tokens, mfa_credentials | hash/session/RBAC isolation tests |
| Patient | patient routes, profile/intake, consent | patients, consents, consent_events | patient ownership and consent tests |
| Doctor/clinic | doctor routes, approval, clinic permissions | doctors, clinics, credentials, approvals | approval and clinic isolation tests |
| Scheduling | availability and appointment routes | doctor_availability, appointments | transaction/concurrency tests |
| Payments | Razorpay order, verification, refund, webhook routes | payments, refunds, payment_webhooks | idempotency/signature tests |
| Clinical | notes, amendments, prescriptions, summaries | clinical_notes, amendments, prescriptions, summaries | clinician authorization/audit tests |
| Records | metadata and access audit | medical_records, record_access_events | private storage and access tests |
| Consultation | FastAPI authorization and Socket.IO lifecycle | consultation_sessions, participants, video_session_events | two-role lifecycle and WebRTC regression |
| Follow-up/notifications | follow-up and notification routes/services | follow_up_plans, notifications, preferences | patient isolation and event tests |
| Support/settings/audit | support, settings, audit/outbox | support_tickets, user_settings, audit_logs, outbox_events | role and retention tests |

No route is switched to MongoDB by this stage. The adapter boundary is selected
only by an explicit feature flag after module-level verification.
