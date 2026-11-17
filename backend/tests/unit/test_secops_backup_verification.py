from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.modules.admin import secops_dashboard_routes
from teleconsult.modules.admin.secops_dashboard_routes import (
    create_recovery_request,
    get_backup_readiness,
    verify_backup_artifact,
)


@pytest.mark.asyncio
async def test_backup_artifact_verification_updates_record_and_status() -> None:
    principal = MongoPrincipal(
        user_id="secops_agent_1",
        tenant_id="default",
        role="secops",
    )

    mock_db = MagicMock()
    mock_collection = MagicMock()

    existing_backup = {
        "id": "BKP-160731",
        "backup_id": "BKP-160731",
        "tenant_id": "default",
        "service": "MongoDB Atlas Cluster",
        "status": "SUCCESS",
        "verification_status": "PENDING",
        "artifact_verified": False,
        "size_mb": 420.5,
        "created_at": datetime.now(UTC) - timedelta(hours=6),
    }

    mock_collection.find_one = AsyncMock(return_value=existing_backup)
    mock_collection.update_one = AsyncMock()
    mock_collection.insert_one = AsyncMock()
    mock_db.__getitem__.side_effect = lambda name: mock_collection

    with patch("teleconsult.kernel.mongodb.client.mongo_database.database", return_value=mock_db):
        res = await verify_backup_artifact("BKP-160731", principal)

    assert res["status"] == "success"
    assert res["backup_id"] == "BKP-160731"
    assert res["artifact_verified"] is True
    assert res["verification_status"] == "VERIFIED"
    assert res["sha256_checksum"].startswith("sha256:")

    mock_collection.update_one.assert_called_once()
    call_args = mock_collection.update_one.call_args[0][1]["$set"]
    assert call_args["artifact_verified"] is True
    assert call_args["verification_status"] == "VERIFIED"


@pytest.mark.asyncio
async def test_get_backup_readiness_preserves_verified_status_on_refresh() -> None:
    principal = MongoPrincipal(
        user_id="secops_agent_1",
        tenant_id="default",
        role="secops",
    )

    mock_db = MagicMock()
    mock_collection = MagicMock()

    verified_backup = {
        "_id": "dummy_oid",
        "id": "BKP-160731",
        "backup_id": "BKP-160731",
        "tenant_id": "default",
        "service": "MongoDB Atlas Cluster",
        "status": "SUCCESS",
        "verification_status": "VERIFIED",
        "artifact_verified": True,
        "sha256_checksum": "sha256:7f83b165a2d4e8c1",
        "size_mb": 420.5,
        "recovery_point": (datetime.now(UTC) - timedelta(hours=6)).isoformat(),
        "created_at": datetime.now(UTC) - timedelta(hours=6),
    }

    class AsyncCursor:
        def __init__(self, items):
            self.items = items

        def sort(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def __aiter__(self):
            self.iter = iter(self.items)
            return self

        async def __anext__(self):
            try:
                return next(self.iter)
            except StopIteration:
                raise StopAsyncIteration

    mock_collection.find.return_value = AsyncCursor([verified_backup])
    mock_db.__getitem__.side_effect = lambda name: mock_collection

    with patch("teleconsult.kernel.mongodb.client.mongo_database.database", return_value=mock_db):
        res = await get_backup_readiness(principal)

    assert len(res["backups"]) == 1
    item = res["backups"][0]
    assert item["id"] == "BKP-160731"
    assert item["verification_status"] == "VERIFIED"
    assert item["artifact_verified"] is True
    assert item["sha256_checksum"] == "sha256:7f83b165a2d4e8c1"


@pytest.mark.asyncio
async def test_corrupted_backup_artifact_fails_verification() -> None:
    principal = MongoPrincipal(
        user_id="secops_agent_1",
        tenant_id="default",
        role="secops",
    )

    mock_db = MagicMock()
    mock_collection = MagicMock()

    corrupted_backup = {
        "id": "BKP-999999",
        "backup_id": "BKP-999999",
        "tenant_id": "default",
        "service": "MongoDB Atlas Cluster",
        "status": "FAILED",
        "verification_status": "PENDING",
        "artifact_verified": False,
        "size_mb": 0.0,
        "created_at": datetime.now(UTC),
    }

    mock_collection.find_one = AsyncMock(return_value=corrupted_backup)
    mock_collection.update_one = AsyncMock()
    mock_db.__getitem__.side_effect = lambda name: mock_collection

    with patch("teleconsult.kernel.mongodb.client.mongo_database.database", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await verify_backup_artifact("BKP-999999", principal)

    assert exc_info.value.status_code == 422
    assert "verification failed" in str(exc_info.value.detail).lower()


@pytest.mark.asyncio
async def test_end_to_end_creation_verification_and_refresh_listing() -> None:
    principal = MongoPrincipal(
        user_id="secops_agent_1",
        tenant_id="default",
        role="secops",
    )

    storage = {}
    mock_db = MagicMock()
    mock_collection = MagicMock()

    async def mock_find_one(query):
        req_id = query.get("id") or query.get("backup_id")
        if not req_id and "$or" in query:
            for item in query["$or"]:
                if "id" in item:
                    req_id = item["id"]
                    break
                if "backup_id" in item:
                    req_id = item["backup_id"]
                    break
        return storage.get(req_id)

    async def mock_insert_one(doc):
        doc_id = doc.get("id") or doc.get("backup_id")
        storage[doc_id] = dict(doc)
        return MagicMock(acknowledged=True)

    async def mock_update_one(filter_q, update_q, upsert=False):
        req_id = filter_q.get("id") or filter_q.get("backup_id")
        if not req_id and "$or" in filter_q:
            for item in filter_q["$or"]:
                if "id" in item:
                    req_id = item["id"]
                    break
                if "backup_id" in item:
                    req_id = item["backup_id"]
                    break
        if req_id in storage:
            storage[req_id].update(update_q.get("$set", {}))
        elif upsert and req_id:
            storage[req_id] = update_q.get("$set", {})
        return MagicMock(acknowledged=True)

    class InMemoryCursor:
        def __init__(self, items):
            self.items = list(items)

        def sort(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def __aiter__(self):
            self.iter = iter(self.items)
            return self

        async def __anext__(self):
            try:
                return next(self.iter)
            except StopIteration:
                raise StopAsyncIteration

    mock_collection.find_one = AsyncMock(side_effect=mock_find_one)
    mock_collection.insert_one = AsyncMock(side_effect=mock_insert_one)
    mock_collection.update_one = AsyncMock(side_effect=mock_update_one)
    mock_collection.find.side_effect = lambda *args, **kwargs: InMemoryCursor(storage.values())
    mock_db.__getitem__.side_effect = lambda name: mock_collection

    with patch("teleconsult.kernel.mongodb.client.mongo_database.database", return_value=mock_db):
        created = await secops_dashboard_routes.trigger_manual_backup(principal)
        bkp_id = created["id"]
        assert bkp_id in storage
        assert storage[bkp_id]["verification_status"] == "PENDING"

        verified_res = await verify_backup_artifact(bkp_id, principal)
        assert verified_res["verification_status"] == "VERIFIED"
        assert storage[bkp_id]["verification_status"] == "VERIFIED"
        assert storage[bkp_id]["artifact_verified"] is True

        refreshed = await get_backup_readiness(principal)
        assert len(refreshed["backups"]) >= 1
        found = next((b for b in refreshed["backups"] if b["id"] == bkp_id), None)
        assert found is not None
        assert found["verification_status"] == "VERIFIED"
        assert found["artifact_verified"] is True


@pytest.mark.asyncio
async def test_recovery_request_creation_persistence_listing_and_refresh() -> None:
    principal = MongoPrincipal(
        user_id="secops_agent_1",
        tenant_id="default",
        role="secops",
    )

    requests_storage = {}
    mock_db = MagicMock()
    mock_collection = MagicMock()

    async def mock_insert_one(doc):
        doc_id = doc.get("id") or doc.get("request_id") or doc.get("backup_id")
        requests_storage[doc_id] = dict(doc)
        return MagicMock(acknowledged=True)

    class InMemoryCursor:
        def __init__(self, items):
            self.items = list(items)

        def sort(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def __aiter__(self):
            self.iter = iter(self.items)
            return self

        async def __anext__(self):
            try:
                return next(self.iter)
            except StopIteration:
                raise StopAsyncIteration

    mock_collection.insert_one = AsyncMock(side_effect=mock_insert_one)
    mock_collection.find.side_effect = lambda *args, **kwargs: InMemoryCursor(requests_storage.values())
    mock_db.__getitem__.side_effect = lambda name: mock_collection

    payload = secops_dashboard_routes.RecoveryRequestCreate(
        target_service="MongoDB Atlas Cluster",
        recovery_point="2026-11-16T12:00:00Z",
        target_environment="Staging",
        reason="Disaster recovery exercise testing",
        expected_impact="Temporary staging data overwrite",
    )

    with patch("teleconsult.kernel.mongodb.client.mongo_database.database", return_value=mock_db):
        created = await create_recovery_request(payload, principal)
        req_id = created["id"]
        assert req_id in requests_storage
        assert created["approval_status"] == "PENDING_APPROVAL"
        assert created["target_environment"] == "Staging"
        assert created["reason"] == "Disaster recovery exercise testing"

        refreshed = await get_backup_readiness(principal)
        assert len(refreshed["recovery_requests"]) >= 1
        found = next((r for r in refreshed["recovery_requests"] if r["id"] == req_id), None)
        assert found is not None
        assert found["approval_status"] == "PENDING_APPROVAL"
        assert found["target_service"] == "MongoDB Atlas Cluster"
        assert found["reason"] == "Disaster recovery exercise testing"
