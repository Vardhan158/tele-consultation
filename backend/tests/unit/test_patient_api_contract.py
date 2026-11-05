from teleconsult.main import app


def test_patient_api_contract_exposes_versioned_core_routes() -> None:
    paths = set(app.openapi()["paths"])
    required = {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/patient/profile",
        "/api/v1/patient/doctors",
        "/api/v1/patient/appointments",
        "/api/v1/patient/payments",
        "/api/v1/patient/notifications",
        "/api/v1/patient/documents",
        "/api/v1/patient/follow-up",
        "/api/v1/patient/support/tickets",
    }
    assert required <= paths
