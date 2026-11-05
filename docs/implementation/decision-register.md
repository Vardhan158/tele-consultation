# Patient Portal decision register

These decisions remain sponsor, clinical-owner, legal, or operations approvals.
The implementation exposes them as environment configuration and does not claim
the portal is launch-approved while they remain unresolved.

| Decision | Configuration | Current local default | Approval owner |
| --- | --- | --- | --- |
| Authentication method | `TELECONSULT_AUTH_METHOD` | `password` | Product/security |
| Payment policy | `TELECONSULT_PAYMENT_MODE` | `clinic_specific` | Product/finance |
| Clinical intake policy | `TELECONSULT_INTAKE_POLICY` | `clinic_configured` | Clinical owner |
| Electronic prescriptions | `TELECONSULT_PRESCRIPTIONS_ENABLED` | `false` | Clinical/legal |
| Video provider and policy | `TELECONSULT_VIDEO_PROVIDER`, join window, audio fallback | unconfigured, 30 minutes, disabled | Clinical/operations |
| Cancellation/refunds/no-show | deadline and reschedule settings | 24 hours, one reschedule | Product/clinic/legal |
| Mobile launch | `TELECONSULT_MOBILE_LAUNCH_MODE` | responsive web | Product |
| Clinical records | retention days and release policy | 2555 days; release-gated | Clinical/legal/privacy |
| Clinic model | `TELECONSULT_CLINIC_MODEL` | clinic network | Business/product |

Safe configuration is available at `GET /config/patient-portal`; provider
credentials and operational secrets are never returned.
