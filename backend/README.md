# Teleconsult backend

## Local development

From the repository root:

```powershell
docker compose up -d postgres
Set-Location backend
uv sync
Copy-Item .env.example .env
uv run alembic upgrade head
uv run uvicorn teleconsult.main:app --reload
```

The API is served at `http://localhost:8000`; the public readiness check is
`GET /health`. The database is PostgreSQL 16 and is persisted in the
`teleconsult-postgres` Docker volume.

The current repository is an MVP scaffold. Authentication, clinical vendor
adapters, payment capture, and the production WebRTC integration remain
explicit implementation work before handling real patient data.
