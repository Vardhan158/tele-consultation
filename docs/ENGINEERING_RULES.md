# Engineering Rules (read before your first PR)

## Module anatomy
```
modules/<name>/
  api.py          PUBLIC. Typed functions + DTOs other modules may call. Nothing else is importable.
  routes.py       HTTP layer. Every route: Depends(require("<permission>")).
  schemas.py      Request/response models.
  service.py      Use cases. Orchestrates domain + repo, emits audit events and outbox events.
  domain.py       Entities and rules. No framework or DB imports.
  models.py       ORM tables, in this module's own schema.
  repo.py         SQL. Private to the module.
  permissions.py  Permission names this module defines.
  events.py       Events this module publishes.
  ports.py        Interfaces to external vendors (only if needed).
```
Allowed direction inside a module: routes -> service -> repo. Domain stays pure.

## Adding a new endpoint — checklist
1. Define the permission in `permissions.py`.
2. Add the route with `Depends(require(...))`.
3. Add an authorization negative test (wrong role, wrong tenant, wrong patient relationship).
4. Emit an audit event if the action is sensitive.
5. Confirm no PHI reaches logs, URLs or error messages.
6. Update the OpenAPI contract: `contracts/openapi.json` is committed so API changes show in review.

## Adding a new table
1. Put it in the owning module's schema.
2. Add `tenant_id` and an RLS policy in `migrations/rls/`.
3. Grant only the owning module's DB role in `migrations/roles/`.
4. Add a cross-tenant read test.

## Cross-module communication
- Synchronous question: call the other module's `api.py` function.
- Something happened: write an outbox event in the SAME transaction; a worker publishes it.
- Never import another module's `service`, `repo`, `models`, `domain`, `schemas`, `ports` or `events`.

## Vendors
Define a Protocol in the module's `ports.py`. Implement it in `adapters/<kind>/<vendor>.py`.
Add a contract test with a fake. Wire in `main.py`. Record the vendor, region, retention and
sub-processor terms in `docs/compliance/subprocessors.md`.

## When to extract a module into its own service
Only on a measured trigger: independent scaling pressure, a separate owning team with its own release
cadence, fault-isolation need, or a different compliance boundary / client-mandated physical isolation.
Record the decision as an ADR first.

## Data handling
- Stable internal IDs only in URLs/logs/analytics.
- Notifications must not contain diagnoses or unnecessary health details.
- Consultation recording is OFF by default; enabling it needs a product, legal and consent decision.
- AI features touching identifiable patient data are out of scope until separately reviewed.
