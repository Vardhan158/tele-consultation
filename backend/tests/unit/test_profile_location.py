from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from teleconsult.kernel.authz.policy import Principal, get_principal
from teleconsult.modules.identity import location_routes as routes

LOCATION = {"version": 1, "address": "Bengaluru, India", "city": "Bengaluru",
            "state": "Karnataka", "country": "India", "postal_code": "560001",
            "latitude": 12.97, "longitude": 77.59}


@pytest.fixture
def client(monkeypatch):
    collection = SimpleNamespace(
        find_one=AsyncMock(return_value={"discovery_location": LOCATION}),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
    )
    monkeypatch.setattr(routes, "users_collection", lambda: collection)
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_principal] = lambda: Principal(
        user_id="user-a", tenant_id="tenant-a", roles=frozenset({"patient"}),
        permissions=frozenset({"patient:profile:write"}),
    )
    with TestClient(app) as test_client:
        test_client.cookies.set("teleconsult_session", "test")
        yield test_client, collection


def test_read_and_save_are_scoped_to_current_profile(client):
    api, collection = client
    assert api.get("/profile/location").json() == {"location": LOCATION}
    assert api.put("/profile/location", json={"location": LOCATION, "consent": True}).status_code == 200
    query, update = collection.update_one.call_args.args
    assert query == {"tenant_id": "tenant-a", "id": "user-a"}
    assert collection.find_one.call_args.args[0] == query
    assert update["$set"]["discovery_location_consent"]["granted"] is True
    assert "recorded_at" in update["$set"]["discovery_location_consent"]
    assert set(update["$set"]) == {"discovery_location", "discovery_location_consent"}


@pytest.mark.parametrize("change", [
    {"consent": False}, {"consent": None},
    {"location": {**LOCATION, "latitude": 91}},
    {"location": {**LOCATION, "longitude": -181}},
    {"location": {**LOCATION, "address": "  "}},
    {"user_id": "another-user"},
])
def test_invalid_or_unconsented_writes_rejected(client, change):
    api, collection = client
    assert api.put("/profile/location", json={"location": LOCATION, "consent": True, **change}).status_code == 422
    collection.update_one.assert_not_called()


def test_missing_consent_rejected(client):
    api, collection = client
    assert api.put("/profile/location", json={"location": LOCATION}).status_code == 422
    collection.update_one.assert_not_called()


def test_no_session_cannot_use_fixture_identity(client):
    api, collection = client
    api.cookies.clear()
    assert api.get("/profile/location").status_code == 401
    assert api.put("/profile/location", json={"location": LOCATION, "consent": True}).status_code == 401
    collection.update_one.assert_not_called()


def test_missing_profile_is_not_created(client):
    api, collection = client
    collection.update_one.return_value = SimpleNamespace(matched_count=0)
    assert api.put("/profile/location", json={"location": LOCATION, "consent": True}).status_code == 404
