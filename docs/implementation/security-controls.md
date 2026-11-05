# Patient Portal security controls

Implemented controls:

- Login creates an opaque, hashed, expiring session token in an HTTP-only cookie.
- Logout revokes the session; expired and revoked sessions are rejected by the
  backend principal resolver.
- Development fixture identity headers are accepted only in `dev` mode.
- Frontend requests include credentials and the development CORS origin is
  explicit rather than wildcarded.
- Patient resources are filtered by authenticated patient ID and tenant ID.
- Clinical output and document endpoints require release/scan state.
- Video room tokens are short-lived and stored only as hashes.
- Payment verification and refund actions are server-side operations.
- Notification delivery is isolated from appointment/payment commits.
- Support tickets are operational and do not grant clinical access.

Production gates still required before real patient data: OIDC/OAuth issuer and
signature validation, workforce MFA, managed TLS and encryption-at-rest
configuration, a real malware scanner/private object store, provider-signed
payment webhooks, rate limiting, secret management, retention enforcement, and
independent security/legal/clinical review.
