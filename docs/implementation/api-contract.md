# Versioned patient API contract

The patient API is exposed under `/api/v1`. Module-native paths remain as a
local compatibility surface while clients migrate. Protected routes require
an authenticated session and contextual authorization; the development fixture
headers are enabled only when `TELECONSULT_ENVIRONMENT=dev`.

## Implemented versioned resources

| Capability | Versioned endpoints |
| --- | --- |
| Authentication | `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/recovery`, `/api/v1/auth/recovery/reset` |
| Profile/intake/consent | `/api/v1/patient/profile`, `/api/v1/patient/intake`, `/api/v1/patient/consents` |
| Doctors/slots | `/api/v1/patient/doctors`, `/api/v1/patient/doctors/{id}/availability` |
| Appointments | `/api/v1/patient/appointments`, `/api/v1/patient/appointments/{id}/cancel`, `/api/v1/patient/appointments/{id}/reschedule` |
| Payments/refunds | `/api/v1/patient/payments`, `/api/v1/patient/payments/initiate`, `/api/v1/patient/payments/{id}/verify`, `/api/v1/patient/payments/{id}/refund` |
| Video | `/api/v1/patient/consultations/{id}/join`, `/api/v1/patient/consultations/{id}/connected`, `/api/v1/patient/consultations/{id}/disconnected`, plus clinician admission/completion actions |
| Documents | `/api/v1/patient/documents`, `/api/v1/patient/documents/{id}/access` |
| Clinical outputs | `/api/v1/patient/clinical-outputs/summaries`, `/api/v1/patient/clinical-outputs/prescriptions` |
| Follow-up/support | `/api/v1/patient/follow-up`, `/api/v1/patient/support/tickets` |
| Notifications | `/api/v1/patient/notifications`, `/api/v1/patient/notifications/{id}/read`, `/api/v1/patient/notifications/{id}/retry` |

## Contract rules

- State-changing booking, payment, refund, and retry requests require
  duplicate-prevention or idempotency controls.
- Payment-provider webhooks must be implemented as a separate provider-authenticated
  route; they must not trust a patient cookie or client checkout result.
- Clinical summaries and prescriptions are filtered by release state before
  serialization. Drafts are never returned to the patient.
- Error responses avoid account, appointment, document, and clinical-resource
  enumeration.
- Provider adapters, rate-limit policy, and production OIDC verification are
  deployment integrations and must be configured before handling real data.
