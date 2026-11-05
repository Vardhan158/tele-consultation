-- EXAMPLE. One DB role per module; each can touch ONLY its own schema.
-- Apply to the highest-risk modules first: identity, records, consent, audit.
-- Credentials come from the vault / managed identity, never from this file.

CREATE SCHEMA IF NOT EXISTS records;
CREATE SCHEMA IF NOT EXISTS consent;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE ROLE records_role NOLOGIN;
CREATE ROLE consent_role NOLOGIN;
CREATE ROLE audit_role   NOLOGIN;

GRANT USAGE ON SCHEMA records TO records_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA records TO records_role;

GRANT USAGE ON SCHEMA consent TO consent_role;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA consent TO consent_role;   -- consent history is append-only

GRANT USAGE ON SCHEMA audit TO audit_role;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO audit_role;       -- audit is append-only: no UPDATE/DELETE

-- The application login role is granted membership in these roles and switches per module.
