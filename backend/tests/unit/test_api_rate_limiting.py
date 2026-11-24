import pytest
from fastapi.testclient import TestClient

from teleconsult.kernel.http.rate_limiter import (
    TIER_LIMITS,
    SlidingWindowRateLimiter,
    get_rate_limiter,
)
from teleconsult.main import create_app


@pytest.fixture(autouse=True)
def reset_limiter():
    """Reset the rate limiter state before each test."""
    limiter = get_rate_limiter()
    limiter.reset()
    yield
    limiter.reset()


def test_rate_limiter_allows_requests_within_limit():
    """Requests within the rate limit must pass and return X-RateLimit headers."""
    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/auth/recovery",
        json={"email": "patient@example.com"},
        headers={"X-Forwarded-For": "203.0.113.10"},
    )

    # Response should have standard rate limit headers
    assert "X-RateLimit-Limit" in response.headers
    assert response.headers["X-RateLimit-Limit"] == str(TIER_LIMITS["auth_otp"])
    assert "X-RateLimit-Remaining" in response.headers
    assert response.status_code != 429


def test_rate_limiter_blocks_otp_flooding_after_limit():
    """Requests exceeding 5 req/min on auth_otp tier must return HTTP 429 Too Many Requests."""
    app = create_app()
    client = TestClient(app)
    test_ip = "203.0.113.42"

    # Limit is 5 for auth_otp
    for i in range(5):
        resp = client.post(
            "/auth/recovery",
            json={"email": "flooder@example.com"},
            headers={"X-Forwarded-For": test_ip},
        )
        assert resp.status_code != 429, f"Request {i+1} was unexpectedly blocked"
        assert resp.headers.get("X-RateLimit-Remaining") == str(4 - i)

    # 6th request from same IP must be rate-limited (HTTP 429)
    blocked_resp = client.post(
        "/auth/recovery",
        json={"email": "flooder@example.com"},
        headers={"X-Forwarded-For": test_ip},
    )

    assert blocked_resp.status_code == 429
    data = blocked_resp.json()
    assert data["code"] == "RATE_LIMIT_EXCEEDED"
    assert "Too many requests" in data["detail"]
    assert "Retry-After" in blocked_resp.headers
    assert int(blocked_resp.headers["Retry-After"]) > 0
    assert blocked_resp.headers["X-RateLimit-Remaining"] == "0"


def test_rate_limiter_isolates_by_client_ip():
    """One rate-limited IP address should not affect another legitimate IP address."""
    app = create_app()
    client = TestClient(app)
    bad_ip = "198.51.100.1"
    good_ip = "198.51.100.2"

    # Exhaust bad_ip's budget
    for _ in range(5):
        client.post(
            "/auth/recovery",
            json={"email": "bad@example.com"},
            headers={"X-Forwarded-For": bad_ip},
        )

    # 6th request from bad_ip is blocked
    bad_resp = client.post(
        "/auth/recovery",
        json={"email": "bad@example.com"},
        headers={"X-Forwarded-For": bad_ip},
    )
    assert bad_resp.status_code == 429

    # good_ip should still be permitted through
    good_resp = client.post(
        "/auth/recovery",
        json={"email": "good@example.com"},
        headers={"X-Forwarded-For": good_ip},
    )
    assert good_resp.status_code != 429
    assert good_resp.headers["X-RateLimit-Remaining"] == "4"


def test_rate_limiter_login_tier_limit():
    """Login tier permits up to 10 requests per minute and blocks the 11th."""
    app = create_app()
    client = TestClient(app)
    login_ip = "203.0.113.99"

    for i in range(10):
        resp = client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "wrong_password"},
            headers={"X-Forwarded-For": login_ip},
        )
        assert resp.status_code != 429, f"Login request {i+1} was unexpectedly throttled"

    # 11th login attempt must be throttled
    blocked = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "wrong_password"},
        headers={"X-Forwarded-For": login_ip},
    )
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "RATE_LIMIT_EXCEEDED"


def test_test_harness_bypass_header():
    """When X-Test-RateLimit-Bypass: 1 is sent, requests bypass rate limiter for automated testing."""
    app = create_app()
    client = TestClient(app)
    bypass_ip = "203.0.113.200"

    # Send 10 requests with bypass header on a 5-request tier
    for _ in range(10):
        resp = client.post(
            "/auth/recovery",
            json={"email": "test@example.com"},
            headers={
                "X-Forwarded-For": bypass_ip,
                "X-Test-RateLimit-Bypass": "1",
            },
        )
        assert resp.status_code != 429


@pytest.mark.asyncio
async def test_rate_limiter_falls_back_when_mongodb_fails():
    """When MongoDB fails or drops connection, rate limiter must fall back gracefully to in-memory store."""
    from unittest.mock import MagicMock, patch
    from teleconsult.kernel.http.rate_limiter import RateLimiterMiddleware, SlidingWindowRateLimiter

    limiter = SlidingWindowRateLimiter(window_seconds=60)
    middleware = RateLimiterMiddleware(app=MagicMock(), limiter=limiter)

    mock_db = MagicMock()
    mock_db.enabled = True
    mock_db.client = MagicMock()
    mock_db.database.side_effect = Exception("DB connection dropped")

    with patch("teleconsult.kernel.mongodb.client.mongo_database", mock_db):
        # Must fall back gracefully and allow request via in-memory store
        allowed, remaining, retry_after = await middleware.check_rate_limit("1.2.3.4", "auth_otp")
        assert allowed is True
        assert remaining == 4
        assert retry_after == 0


def test_cors_preflight_options_bypasses_rate_limiting():
    """Browser preflight OPTIONS requests must never consume rate limit quota and must return 200 with CORS headers."""
    app = create_app()
    client = TestClient(app)

    # Send 10 consecutive preflight requests from the frontend origin
    for _ in range(10):
        resp = client.options(
            "/auth/register",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "X-Forwarded-For": "203.0.113.88",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
        assert resp.headers.get("access-control-allow-credentials") == "true"


def test_cors_headers_retained_when_rate_limited():
    """When a POST request is throttled with HTTP 429, CORS headers must still be preserved for the frontend."""
    app = create_app()
    client = TestClient(app)
    ip = "203.0.113.123"

    for _ in range(5):
        client.post(
            "/auth/register",
            json={"email": "cors_test@example.com"},
            headers={"Origin": "http://localhost:5173", "X-Forwarded-For": ip},
        )

    # 6th request triggers rate limit
    resp = client.post(
        "/auth/register",
        json={"email": "cors_test@example.com"},
        headers={"Origin": "http://localhost:5173", "X-Forwarded-For": ip},
    )
    assert resp.status_code == 429
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"

