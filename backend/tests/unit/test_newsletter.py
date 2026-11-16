import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from teleconsult.modules.newsletter import routes


class Collection:
    def __init__(self, doc=None):
        self.doc = doc
        self.indexes = []
        self.update_calls = []

    async def create_index(self, *args, **kwargs):
        self.indexes.append((args, kwargs))

    async def find_one(self, query):
        if self.doc and query.get("email") == self.doc.get("email"):
            return self.doc
        return None

    async def find_one_and_update(self, query, update, **kwargs):
        return {"count": 1}

    async def update_one(self, query, update, **kwargs):
        self.update_calls.append((query, update, kwargs))
        class Result:
            matched_count = 1
        return Result()


class Database:
    def __init__(self, subscriber=None):
        self.collections = {"newsletter_subscribers": Collection(subscriber), "newsletter_rate_limits": Collection()}

    def __getitem__(self, name):
        return self.collections[name]


@pytest.fixture
def setup(monkeypatch):
    database = Database()
    settings = SimpleNamespace(mongodb_enabled=True, mongodb_uri="mongodb://test", newsletter_website_url="https://care.example", newsletter_api_base_url="https://api.example", newsletter_poster_url="https://care.example/poster.png", newsletter_token_ttl_minutes=60, newsletter_rate_limit_per_hour=5)
    monkeypatch.setattr(routes, "get_settings", lambda: settings)
    monkeypatch.setattr(routes.mongo_database, "database", lambda: database)
    monkeypatch.setattr(routes, "send_with_retries", AsyncMock())
    return database


@pytest.mark.asyncio
async def test_valid_subscription_is_pending_and_sends_verification(setup):
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    result = await routes.subscribe(routes.SubscribeRequest(email=" User@Example.com ", consent=True), request)
    assert result["message"] == routes.GENERIC_MESSAGE
    subscriber_update = setup.collections["newsletter_subscribers"].update_calls[0][1]["$set"]
    assert subscriber_update["email"] == "user@example.com"
    assert subscriber_update["status"] == "pending"
    assert "verification_token_hash" in subscriber_update
    await asyncio.sleep(0)
    routes.send_with_retries.assert_awaited_once()


@pytest.mark.asyncio
async def test_consent_required_and_duplicate_active_is_generic(setup):
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    with pytest.raises(HTTPException):
        await routes.subscribe(routes.SubscribeRequest(email="x@example.com", consent=False), request)
    active = {"email": "x@example.com", "status": "active"}
    setup.collections["newsletter_subscribers"].doc = active
    result = await routes.subscribe(routes.SubscribeRequest(email="x@example.com", consent=True), request)
    assert result["message"] == routes.GENERIC_MESSAGE


def test_html_contains_brand_and_unsubscribe_link(setup):
    html = routes.email_html("welcome", "https://api.example/api/newsletter/unsubscribe?token=x")
    assert "Your Care, Closer to You" in html
    assert "Explore Kaizen Care" in html
    assert "Unsubscribe" in html
    assert "https://care.example/poster.png" in html
