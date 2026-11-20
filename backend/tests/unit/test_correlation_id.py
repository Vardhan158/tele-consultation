"""Unit tests for Correlation ID / Request ID propagation and structured logging redaction.

Checklist References:
- BE-13: Request ID / Correlation ID Propagation
- MON-02: Structured Logging with Correlation Context
- SEC-08: Sensitive Data Redaction in Telemetry
"""

import logging
import uuid
import pytest
from starlette.testclient import TestClient

from teleconsult.main import app
from teleconsult.kernel.observability.logging import (
    CorrelationIdAndRedactingFilter,
    get_correlation_id,
    set_correlation_id,
)


@pytest.fixture
def client():
    with TestClient(app, base_url="http://testserver") as c:
        yield c


def test_correlation_id_generated_when_missing(client: TestClient):
    """When client provides no correlation header, server generates UUID and sets both headers."""
    response = client.get("/health")
    assert response.status_code == 200

    corr_id = response.headers.get("X-Correlation-ID")
    req_id = response.headers.get("X-Request-ID")

    assert corr_id is not None
    assert req_id is not None
    assert corr_id == req_id

    # Verify it's a valid UUID
    parsed_uuid = uuid.UUID(corr_id)
    assert parsed_uuid.version == 4


def test_correlation_id_propagated_from_x_correlation_id(client: TestClient):
    """When client sends X-Correlation-ID, server preserves and reflects it in response headers."""
    custom_id = "trace-client-abc-987"
    response = client.get("/health", headers={"X-Correlation-ID": custom_id})

    assert response.status_code == 200
    assert response.headers.get("X-Correlation-ID") == custom_id
    assert response.headers.get("X-Request-ID") == custom_id


def test_correlation_id_propagated_from_x_request_id(client: TestClient):
    """When client sends X-Request-ID, server preserves and reflects it in response headers."""
    custom_id = "req-client-xyz-456"
    response = client.get("/health", headers={"X-Request-ID": custom_id})

    assert response.status_code == 200
    assert response.headers.get("X-Correlation-ID") == custom_id
    assert response.headers.get("X-Request-ID") == custom_id


def test_correlation_id_present_on_error_responses(client: TestClient):
    """Correlation ID headers must be present even on 404 or 400 error responses."""
    custom_id = "err-trace-555"
    response = client.get("/non-existent-path-for-testing", headers={"X-Correlation-ID": custom_id})

    assert response.headers.get("X-Correlation-ID") == custom_id
    assert response.headers.get("X-Request-ID") == custom_id


def test_logging_filter_attaches_correlation_id_and_redacts_sensitive_keys():
    """Verify that the filter attaches correlation_id to log records and redacts sensitive data."""
    test_corr_id = "ctx-trace-12345"
    set_correlation_id(test_corr_id)

    filter_obj = CorrelationIdAndRedactingFilter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="User authenticated with password=secret_password and token=ey123456",
        args=(),
        exc_info=None,
    )

    # Attach sensitive attributes
    setattr(record, "password", "my_super_secret_pw")
    setattr(record, "token", "jwt_token_payload")
    setattr(record, "notes", "Patient has severe psychiatric history")

    assert filter_obj.filter(record) is True

    # Check correlation ID attached
    assert record.correlation_id == test_corr_id

    # Check attributes redacted
    assert record.password == "[REDACTED]"
    assert record.token == "[REDACTED]"
    assert record.notes == "[REDACTED]"

    # Check message string sanitized
    assert "secret_password" not in record.msg
    assert "ey123456" not in record.msg
    assert "[REDACTED]" in record.msg
