from fastapi.testclient import TestClient

from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.kernel.mongodb.schema import COLLECTIONS, INDEXES
from teleconsult.main import app


def test_mongodb_health_is_explicitly_disabled_without_configuration() -> None:
    response = TestClient(app).get("/health/mongodb")
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "status": "disabled"}


def test_mongodb_transaction_probe_does_not_claim_support_when_disabled() -> None:
    response = TestClient(app).get("/health/mongodb/transactions")
    assert response.status_code == 200
    assert response.json()["supported"] is False
    assert response.json()["enabled"] is False


def test_foundation_schema_has_expected_collections_and_indexes() -> None:
    assert {"users", "appointments", "consultation_sessions", "clinical_notes", "audit_logs"} <= set(COLLECTIONS)
    assert {"users", "appointments", "payments", "user_sessions"} <= set(INDEXES)
    assert mongo_database.enabled is False


def test_postgresql_url_has_no_implicit_fallback(monkeypatch) -> None:
    from teleconsult.kernel.db import session as db_session

    class MissingDatabaseSettings:
        database_url = ""

    monkeypatch.setattr(db_session, "get_settings", lambda: MissingDatabaseSettings())
    try:
        db_session.get_engine.cache_clear()
        try:
            db_session.get_engine()
        except RuntimeError as exc:
            assert "TELECONSULT_DATABASE_URL" in str(exc)
        else:
            raise AssertionError("Missing PostgreSQL configuration was silently accepted")
    finally:
        db_session.get_engine.cache_clear()
