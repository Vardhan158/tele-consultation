from types import SimpleNamespace
import pytest
from httpx import ASGITransport, AsyncClient
from teleconsult.main import create_app
from teleconsult.config.settings import get_settings


@pytest.fixture
def app():
    return create_app()


@pytest.mark.asyncio
async def test_contact_inquiries_endpoint_post(app, monkeypatch):
    from teleconsult.kernel.mongodb.client import mongo_database

    class MockCollection:
        def __init__(self):
            self.docs = []
        async def insert_one(self, doc):
            self.docs.append(doc)
            return SimpleNamespace(inserted_id="mock-id")

    class MockDb:
        def __init__(self):
            self.coll = MockCollection()
        def __getitem__(self, name):
            return self.coll

    mock_db = MockDb()
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(get_settings(), "mongodb_enabled", True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Valid inquiry
        payload = {
            "name": "Alex Taylor",
            "email": "alex.taylor@example.com",
            "phone": "9876543210",
            "subject": "Finding care",
            "message": "Looking for a specialist consultation.",
            "privacy_consent": True,
        }
        res = await client.post("/contact/inquiries", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "received"
        assert "id" in data
        assert "Your inquiry has been received" in data["message"]

        # 2. Validation error - missing consent
        invalid_payload = {**payload, "privacy_consent": False}
        res_fail = await client.post("/contact/inquiries", json=invalid_payload)
        assert res_fail.status_code == 422
