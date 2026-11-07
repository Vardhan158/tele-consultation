"""Fixtures for tests that require an isolated MongoDB instance."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime
import os

import pytest
import pytest_asyncio

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.kernel.mongodb.schema import ensure_schema
from teleconsult.modules.identity.auth_routes import password_hash


TEST_TENANT = "00000000-0000-0000-0000-000000000001"
TEST_ADMIN_ID = "test-clinic-admin"
TEST_DOCTOR_ID = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"


@pytest_asyncio.fixture
async def mongodb_test_database(request: pytest.FixtureRequest) -> AsyncIterator[object]:
    """Provide a clean, synthetic database for explicitly marked Mongo tests."""
    if request.node.get_closest_marker("mongodb_integration") is None:
        yield None
        return

    if not os.getenv("MONGODB_TEST_URI"):
        pytest.fail("MONGODB_TEST_URI must point to an isolated test replica set")

    os.environ["MONGODB_ENABLED"] = "true"
    os.environ["MONGODB_REPOSITORIES_ENABLED"] = "true"
    os.environ["MONGODB_URI"] = os.environ["MONGODB_TEST_URI"]
    os.environ["MONGODB_DATABASE"] = os.getenv("MONGODB_TEST_DATABASE", "teleconsult_test")
    get_settings.cache_clear()

    await mongo_database.connect()
    database = mongo_database.database()
    await ensure_schema(database)
    for collection in await database.list_collection_names():
        await database[collection].delete_many({})

    now = datetime.now(UTC)
    await database["users"].insert_one({
        "id": TEST_ADMIN_ID,
        "tenant_id": TEST_TENANT,
        "full_name": "Synthetic Clinic Administrator",
        "email": "clinic-admin@teleconsult.local",
        "mobile_number": "+910000000000",
        "password_hash": password_hash("AdminPassword123!"),
        "role": "clinic_admin",
        "verified_at": now,
        "mfa_enabled": False,
        "created_at": now,
    })
    await database["doctors"].insert_one({
        "id": TEST_DOCTOR_ID,
        "user_id": "test-doctor",
        "tenant_id": TEST_TENANT,
        "full_name": "Synthetic Doctor",
        "specialty": "General Medicine",
        "active": True,
        "approval_status": "approved",
        "approved_for_consultation": True,
    })
    await database["services"].insert_one({
        "id": "test-service",
        "tenant_id": TEST_TENANT,
        "name": "Follow-up Consultation",
        "appointment_types": ["Follow-up Consultation"],
        "assigned_doctors": [TEST_DOCTOR_ID],
        "base_fee": 400,
        "platform_fee": 75,
        "currency": "INR",
        "duration_minutes": 30,
        "active": True,
    })
    await database["clinic_settings"].insert_one({
        "tenant_id": TEST_TENANT,
        "timezone": "UTC",
        "appointment_types": ["Follow-up Consultation"],
        "visit_formats": ["Video consultation"],
    })
    try:
        yield database
    finally:
        await database["user_sessions"].delete_many({})
        await database["blocked_dates"].delete_many({})
        await database["appointments"].delete_many({})
        await database["payments"].delete_many({})
        await mongo_database.close()
        get_settings.cache_clear()

