# Teleconsult — Modular Monolith Scaffold

START HERE. This repository is a **skeleton**, not a finished product. It gives your team the
structure, the guard-rails and the first security building blocks. Business logic is yours to write.


## 0. What was verified before this was handed to you

On the generated skeleton: `ruff` clean, `mypy --strict` clean (172 files), `lint-imports` **27 contracts kept**,
`pytest` 4 passed. The guard-rails were also proven to *fail correctly*: an illegal cross-module import is
blocked, an untrusted-worker import of `sqlalchemy` is blocked, and a route without `require()` fails the
architecture test. Checked against current releases of FastAPI/import-linter at build time. Newer FastAPI
hides included routers behind private wrappers, so the route test inspects each module's `router` directly.
Re-run the Quick Start commands yourself after `uv sync`; pin and commit `uv.lock`.

## 1. Architecture in one paragraph

One Python (FastAPI) backend, one container image, organised into business **modules** that may only
talk to each other through each module's `api.py`. Vendors (video, SMS, payments, FHIR, storage) sit
behind **ports** and are implemented in `adapters/`. Risky work on untrusted input (file scanning,
rendering) runs in an **isolated worker that has no database access**. Row-level security and
per-module database roles limit the damage of any single bug. The same image can be deployed pooled,
schema-per-tenant or as a dedicated silo per client.

## 2. Quick start

```bash
cd backend
uv sync                         # install pinned dependencies (creates uv.lock, COMMIT IT)
cp .env.example .env            # no secrets in git, ever
uv run ruff check .             # lint
uv run mypy src                 # strict typing = your compile-time safety net
uv run lint-imports             # module boundary contracts (must pass)
uv run pytest                   # includes architecture + security tests
uv run uvicorn teleconsult.main:app --reload
```

Frontend: see `frontend/README.md`. Infrastructure: see `infra/README.md`.

## 3. The ten rules that matter most (non-negotiable)

1. **Module boundary.** Code outside a module may import only that module's `api.py`. Enforced by
   `backend/.importlinter`; CI fails on violations. Never "just this once".
2. **No cross-module tables or joins.** Each module owns its schema. Ask via `api.py` or consume events.
3. **One authorization path.** Every route uses `Depends(require("permission"))` from
   `kernel/authz`. A test fails the build if any route lacks it (except the explicit public allow-list).
   Authorization checks tenant, role, patient-clinician relationship and purpose — not just role.
4. **One audit path.** Only `kernel/audit_emit.py` writes audit events. Log: record access, privileged
   actions, consent changes, exports, prescriptions, admin changes, support access.
5. **Tenant isolation is tested, not assumed.** Every tenant-scoped table gets an RLS policy
   (`migrations/rls/`) and a negative test proving tenant A cannot read tenant B.
6. **No PHI in logs, URLs, analytics, tickets or notifications.** Use stable internal IDs. Use the
   redacting log filter. Prefer allow-listing fields over deny-listing.
7. **Untrusted input goes to `worker_untrusted` only.** Uploaded files are scanned/parsed/rendered
   there, with no DB credentials and no network access to internal services.
8. **Vendors behind ports.** A module defines what it needs in `ports.py`; the vendor code lives in
   `adapters/`. Swapping a video provider must touch one adapter, not the business logic.
9. **Secrets never in git or images.** Use managed identity + vault. Secret scanning runs in CI and
   pre-commit. Rotate on any suspicion.
10. **Synthetic data outside production.** `scripts/seed_synthetic.py` is the only data source for
    dev/test. Never copy production clinical data down.

## 4. Suggested build order

1. `kernel` (auth, authz, tenancy, audit, outbox, observability) + `identity` — with negative tests first.
2. `tenancy` (clients/clinics/config) + `directory` + `scheduling`.
3. `consultation` with a stub `VideoProvider`; real adapter after your vendor pilot.
4. `consent` + `records` + the `worker_untrusted` file pipeline.
5. `notifications`, `payments`, `reporting`, `support_access`, `audit` review tooling.

Start simple: a small module can begin with `routes.py`, `service.py`, `models.py` and a real `api.py`.
Add the other files when you need them. The `api.py` boundary is the one thing to keep from day one.

## 5. Definition of done (every module / every client release)

- ASVS 5.0 **Level 2** verified for the whole app; **Level 3** for identity, authz, crypto, audit, records, consent
  (track in `docs/security/asvs-checklist.md`).
- `ruff`, `mypy --strict`, `lint-imports`, `pytest` green. SAST, dependency scan, secret scan,
  container scan green; SBOM produced per release (`.github/workflows/security.yml`).
- Tenant-isolation and authorization negative tests present for every new endpoint.
- Audit events emitted for every sensitive action.
- Independent penetration test with retest of critical/high findings before client go-live.

## 6. What code cannot do for you (before real patient data)

Engineering controls here do not replace: legal/regulatory review per launch country, a privacy impact
assessment, clinical safety review, signed processor/sub-processor contracts (cloud, video, SMS, email,
analytics), retention schedules and a tested restore. Track these in `docs/compliance/`.

## 7. Known placeholders you must implement

| Area | Status in this skeleton |
|---|---|
| `kernel/authz` `get_principal` | Fails closed (401). Implement OIDC token validation. |
| Tenancy modes | Only **pooled** (RLS) is wired. `schema` and `silo` are reserved in config. |
| RLS policies / DB roles | Example SQL in `migrations/roles` and `migrations/rls`; extend per table. |
| Adapters | Empty packages. Implement behind each module's `ports.py`. |
| Worker queue | Choose Celery or Arq and record it in `docs/adr/`. |
| CI workflows | Reasonable starting points; pin action versions and adapt to your org. |
| Frontend apps | Folders and workspace config only; scaffold with Vite + React + TypeScript. |

## 8. Repository map

```
backend/    Python modular monolith (src/teleconsult/{kernel,modules,adapters,config})
frontend/   pnpm workspace: patient-web, clinician-portal, admin-console, shared packages
infra/      Terraform/Bicep: reusable modules, environments, per-client overlays
docs/       ADRs, security artefacts, compliance records, runbooks, ENGINEERING_RULES.md
.github/    CI, security pipeline, release pipeline, CODEOWNERS
```

Read `docs/ENGINEERING_RULES.md` next.
# Teleconsultation
