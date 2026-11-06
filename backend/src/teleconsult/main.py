"""API entrypoint and composition root: wires modules and adapters together."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from teleconsult.kernel.http.security_headers import SecurityHeadersMiddleware
from teleconsult.kernel.observability.logging import configure_logging
from teleconsult.modules.audit.routes import router as audit_router
from teleconsult.modules.consent.routes import router as consent_router
from teleconsult.modules.consultation.routes import router as consultation_router
from teleconsult.modules.directory.routes import router as directory_router
from teleconsult.modules.identity.routes import router as identity_router
from teleconsult.modules.notifications.routes import router as notifications_router
from teleconsult.modules.payments.routes import router as payments_router
from teleconsult.modules.records.routes import router as records_router
from teleconsult.modules.reporting.routes import router as reporting_router
from teleconsult.modules.scheduling.routes import router as scheduling_router
from teleconsult.modules.support_access.routes import router as support_access_router
from teleconsult.modules.tenancy.routes import router as tenancy_router
from teleconsult.modules.patient_portal.routes import router as patient_router, public_router as public_patient_router
from teleconsult.modules.identity.auth_routes import router as auth_router
from teleconsult.modules.identity.doctor_routes import router as doctor_router
from teleconsult.modules.identity.settings_routes import router as settings_router
from teleconsult.modules.payments.patient_routes import router as payment_router
from teleconsult.modules.notifications.patient_routes import router as notification_router
from teleconsult.modules.consultation.video_routes import router as video_router
from teleconsult.modules.consultation.doctor_routes import router as doctor_portal_router
from teleconsult.modules.records.patient_routes import router as records_router
from teleconsult.modules.records.clinical_routes import router as clinical_router, clinician_router
from teleconsult.modules.support_access.patient_routes import router as support_router
from teleconsult.modules.scheduling.admin_routes import router as scheduling_admin_router
from teleconsult.modules.admin.routes import router as admin_router
from teleconsult.config.routes import router as config_router
from teleconsult.config.settings import get_settings
from teleconsult.kernel.tenancy.context import set_tenant
from time import perf_counter
from teleconsult.modules.consultation.signaling import socket_app
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.kernel.mongodb.schema import ensure_schema

# Routes that are intentionally unauthenticated. Keep this list tiny and reviewed.
PUBLIC_PATHS = frozenset({
    "/health", "/health/mongodb", "/health/mongodb/transactions", "/config/patient-portal", "/auth/register", "/auth/login",
    "/auth/verify-email", "/auth/recovery", "/auth/recovery/reset",
    "/auth/me", "/auth/logout", "/patient/payments/webhook",
    "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/verify-email",
    "/api/v1/auth/recovery", "/api/v1/auth/recovery/reset", "/api/v1/auth/me",
    "/api/v1/auth/logout", "/api/v1/patient/payments/webhook",
    "/api/v1/patient/doctors", "/api/v1/patient/doctors/{doctor_id}/availability",
    "/doctor/register",
})


def create_app() -> FastAPI:
    configure_logging()
    # API docs are disabled by default; enable per environment deliberately.
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await mongo_database.connect()
        if mongo_database.enabled:
            await ensure_schema()
        try:
            yield
        finally:
            await mongo_database.close()

    app = FastAPI(title="Teleconsult API", docs_url=None, redoc_url=None, lifespan=lifespan)

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, HTTPException):
            response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            origin = request.headers.get("origin")
            if origin in {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"}:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
            return response
        import traceback
        traceback.print_exc()
        response = JSONResponse(
            status_code=500,
            content={"detail": str(exc) if get_settings().environment in {"dev", "local"} else "Service temporarily unavailable; please retry or contact support"}
        )
        origin = request.headers.get("origin")
        if origin in {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"}:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:5174", "http://127.0.0.1:5174",
            "https://localhost:5173", "https://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_observability(request: Request, call_next):
        if get_settings().environment in {"dev", "local"}:
            set_tenant(request.headers.get("X-Dev-Tenant-Id", get_settings().default_tenant_id))
        started = perf_counter()
        response = await call_next(request)
        duration_ms = round((perf_counter() - started) * 1000, 2)
        # Operational telemetry only: no patient data, query strings, or bodies.
        response.headers["Server-Timing"] = f"app;dur={duration_ms}"
        response.headers["X-Request-Duration-Ms"] = str(duration_ms)
        return response
    app.add_middleware(SecurityHeadersMiddleware)
    app.mount("/socket.io", socket_app)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/mongodb")
    async def mongodb_health() -> dict:
        return await mongo_database.ping()

    @app.get("/health/mongodb/transactions")
    async def mongodb_transactions() -> dict:
        return await mongo_database.transaction_probe()

    app.include_router(identity_router)
    app.include_router(tenancy_router)
    app.include_router(patient_router)
    app.include_router(auth_router)
    app.include_router(doctor_router)
    app.include_router(settings_router)
    app.include_router(payment_router)
    app.include_router(notification_router)
    app.include_router(video_router)
    app.include_router(doctor_portal_router)
    app.include_router(records_router)
    app.include_router(clinical_router)
    app.include_router(clinician_router)
    app.include_router(support_router)
    app.include_router(scheduling_admin_router)
    app.include_router(admin_router)
    app.include_router(config_router)
    # Versioned API contract. The module-native paths above remain available
    # for local compatibility while clients migrate to /api/v1.
    app.include_router(public_patient_router, prefix="/api/v1")
    for versioned_router in (
        auth_router, settings_router, patient_router, payment_router, notification_router,
        video_router, records_router, clinical_router, support_router,
    ):
        app.include_router(versioned_router, prefix="/api/v1",
            generate_unique_id_function=lambda route: f"v1_{route.name}_{route.path.replace('/', '_')}")
    app.include_router(directory_router)
    app.include_router(scheduling_router)
    app.include_router(consultation_router)
    app.include_router(consent_router)
    app.include_router(payments_router)
    app.include_router(notifications_router)
    app.include_router(reporting_router)
    app.include_router(support_access_router)
    app.include_router(audit_router)
    # TODO: register the audit sink, bind adapters to module ports, add rate limiting.
    return app


app = create_app()
