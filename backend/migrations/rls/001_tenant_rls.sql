-- EXAMPLE row-level security pattern for a tenant-scoped table.
-- The app sets: SELECT set_config('app.tenant_id', '<tenant>', true) per transaction.

ALTER TABLE records.clinical_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE records.clinical_note FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON records.clinical_note
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Repeat for every tenant-scoped table and add a cross-tenant negative test for each.
