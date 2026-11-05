from fastapi.testclient import TestClient

from teleconsult.main import app


def test_security_headers_present() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
