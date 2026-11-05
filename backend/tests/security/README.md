Put here, for EVERY tenant-scoped resource and endpoint:
- tenant A cannot read/write tenant B (API and direct DB with RLS)
- wrong role / wrong patient-clinician relationship is denied
- malicious file, oversized file, unauthorized download link
- token expiry, revoked session, MFA step-up
- rate-limit and abuse cases
