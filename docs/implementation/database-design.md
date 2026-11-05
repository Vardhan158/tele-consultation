# Patient Portal database design

The PostgreSQL schema is split by ownership and protected by tenant-scoped
queries. Migration history currently includes the patient journey entities
through revision `0014_core_entities`.

| Logical entity | Physical table | Owner |
| --- | --- | --- |
| User account/session/recovery | `identity.user_accounts`, `identity.auth_sessions`, `identity.recovery_tokens` | Identity |
| Patient profile | `patient_portal.patients` | Patient Portal |
| Consent | `patient_portal.patient_consents` | Patient Portal |
| Clinic/specialty | `tenancy.clinics`, `directory.specialties` | Tenancy/Directory |
| Doctor and availability | `patient_portal.doctors`, `patient_portal.doctor_availability` | Directory/Scheduling |
| Appointment/history | `patient_portal.appointments`, `patient_portal.appointment_events` | Scheduling |
| Intake | `patient_portal.medical_intakes` | Patient Portal |
| Payments/refunds | `payments.payment_transactions`, `payments.refunds` | Payments |
| Consultation/video | `consultation.consultations`, `consultation.video_sessions` | Consultation |
| Clinical notes | `consultation.clinical_notes` | Consultation |
| Prescriptions/summaries | `records.prescriptions`, `records.consultation_summaries` | Records |
| Documents | `records.patient_documents` | Records |
| Follow-up/support | `support_access.follow_up_actions`, `support_access.support_tickets` | Support |
| Notifications | `notifications.notifications` | Notifications |
| Audit | `audit.audit_records` | Audit |

## Integrity controls

- Appointment slot uniqueness and overlap checks prevent conflicting bookings.
- Appointment events preserve lifecycle history.
- Payment transactions retain provider references and idempotency keys.
- Video sessions are separate from clinical encounter completion.
- Clinical output queries filter on explicit release state.
- Document queries require tenant, patient, release, and scan state.
- Support tickets contain operational text and do not grant clinical access.
- Sensitive free text is not copied into ordinary application logs.
- All timestamps are stored timezone-aware and rendered in the patient locale.
