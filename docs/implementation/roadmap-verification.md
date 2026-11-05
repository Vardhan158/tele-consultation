# Development roadmap and exit criteria

The roadmap is implemented as a dependency order. Each phase below has a
current verification command or an explicit external gate.

| Phase | Scope | Current evidence / exit gate |
| --- | --- | --- |
| 1 Foundation | React/Vite, FastAPI, PostgreSQL compose, env config, light theme, CI | Frontend build, backend tests, `docker compose up -d postgres`, CI workflow |
| 2 Authentication | Registration, login, recovery, logout, sessions, profile, consent | Auth/profile API tests; production OIDC/MFA review remains required |
| 3 Doctor discovery | Approved directory, filters, clinic metadata, availability | Live frontend directory and backend approval/slot filters |
| 4 Appointments | Intake, authoritative slots, booking, idempotency, reschedule, cancel | Appointment tests and protected-slot scheduling behavior |
| 5 Payments/notifications | Server verification, pending/failure/refund states, notification ledger/retry | Payment/notification APIs and failure-recovery tests; provider certification remains required |
| 6 Video | Join window, token, device readiness, waiting room, admission, disconnect | Video state APIs and frontend readiness flow; managed provider integration remains required |
| 7 Clinical records | Private documents, scan/release gates, summaries, prescriptions | Release-filtered APIs and private-access flow; clinical authorization/UAT remains required |
| 8 Follow-up/support | Follow-up actions, operational support, completion recovery | Live P10 screens and least-privilege ticket APIs |
| 9 Pilot validation | Security, clinical UAT, accessibility, load, recovery, release approval | External evidence required; not claimed by local tests |

## Standard verification commands

```powershell
cd backend
uv run pytest
uv run ruff check .
uv run mypy src
uv run lint-imports

cd ..\frontend
npm ci
npm run lint
npm run build
```

No phase is considered production-ready solely because a local build passes.
The controlled pilot requires owner approval across product, clinical,
security/privacy, and operations, plus provider and regulatory dependencies.
