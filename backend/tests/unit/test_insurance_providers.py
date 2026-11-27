"""Unit tests for Checkpoint 1 — Insurance Provider Master."""
import re
from typing import Any
import pytest
from fastapi import HTTPException
from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.modules.insurance.routes import (
    create_insurance_provider,
    get_insurance_provider,
    list_insurance_providers,
    toggle_insurance_provider_status,
    update_insurance_provider,
)
from teleconsult.modules.insurance.schemas import (
    InsuranceProviderCreate,
    InsuranceProviderStatusUpdate,
    InsuranceProviderUpdate,
)


class MockCursor:
    def __init__(self, docs: list[dict[str, Any]]):
        self._docs = docs

    def sort(self, key: str, direction: int) -> "MockCursor":
        reverse = direction < 0
        self._docs = sorted(self._docs, key=lambda x: x.get(key, ""), reverse=reverse)
        return self

    def skip(self, n: int) -> "MockCursor":
        self._docs = self._docs[n:]
        return self

    def limit(self, n: int) -> "MockCursor":
        self._docs = self._docs[:n]
        return self

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class InMemoryMongoCollection:
    def __init__(self):
        self.docs: list[dict[str, Any]] = []

    def _matches(self, doc: dict[str, Any], query: dict[str, Any]) -> bool:
        for k, v in query.items():
            if k == "$or":
                sub_matches = any(self._matches(doc, cond) for cond in v)
                if not sub_matches:
                    return False
                continue
            doc_val = doc.get(k)
            if isinstance(v, dict):
                if "$regex" in v:
                    pattern = v["$regex"]
                    flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                    if not (doc_val and re.search(pattern, str(doc_val), flags)):
                        return False
                elif "$ne" in v:
                    if doc_val == v["$ne"]:
                        return False
                elif "$in" in v:
                    if doc_val not in v["$in"]:
                        return False
            else:
                if doc_val != v:
                    return False
        return True

    async def insert_one(self, doc: dict[str, Any]) -> Any:
        self.docs.append(dict(doc))
        return type("Result", (), {"inserted_id": doc.get("id")})()

    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        for doc in self.docs:
            if self._matches(doc, query):
                return dict(doc)
        return None

    def find(self, query: dict[str, Any]) -> MockCursor:
        matched = [dict(doc) for doc in self.docs if self._matches(doc, query)]
        return MockCursor(matched)

    async def count_documents(self, query: dict[str, Any]) -> int:
        return sum(1 for doc in self.docs if self._matches(doc, query))

    async def update_one(self, query: dict[str, Any], update: dict[str, Any]) -> Any:
        for doc in self.docs:
            if self._matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                return type("Result", (), {"modified_count": 1})()
        return type("Result", (), {"modified_count": 0})()


class InMemoryMongoDatabase:
    def __init__(self):
        self.collections: dict[str, InMemoryMongoCollection] = {}

    def __getitem__(self, name: str) -> InMemoryMongoCollection:
        if name not in self.collections:
            self.collections[name] = InMemoryMongoCollection()
        return self.collections[name]


@pytest.fixture
def mock_db(monkeypatch):
    from teleconsult.kernel.mongodb.client import mongo_database
    db = InMemoryMongoDatabase()
    monkeypatch.setattr(mongo_database, "database", lambda: db)
    return db


@pytest.fixture
def admin_principal():
    return MongoPrincipal(
        user_id="admin-001",
        tenant_id="tenant-alpha",
        role="clinic_admin",
        clinic_id="clinic-001",
    )


@pytest.fixture
def other_tenant_admin():
    return MongoPrincipal(
        user_id="admin-002",
        tenant_id="tenant-beta",
        role="clinic_admin",
        clinic_id="clinic-002",
    )


@pytest.mark.asyncio
async def test_create_insurance_provider_success(mock_db, admin_principal):
    payload = InsuranceProviderCreate(
        provider_name="Star Health and Allied Insurance",
        provider_code="STAR-HEALTH",
        country="India",
        provider_type="Insurance Company",
        contact_person="Ramesh Sharma",
        contact_email="claims.support@starhealth.in",
        contact_number="+91-9876543210",
        official_website="https://www.starhealth.in",
        claim_submission_email="submissions@starhealth.in",
        claim_submission_portal_url="https://portal.starhealth.in/claims",
        status="Active",
    )

    created = await create_insurance_provider(payload, principal=admin_principal)

    assert created["id"] is not None
    assert created["provider_code"] == "STAR-HEALTH"
    assert created["provider_name"] == "Star Health and Allied Insurance"
    assert created["status"] == "Active"
    assert created["tenant_id"] == "tenant-alpha"

    # Verify audit log was recorded
    audit_logs = mock_db["audit_logs"].docs
    assert len(audit_logs) == 1
    assert audit_logs[0]["action"] == "insurance_provider.created"
    assert audit_logs[0]["target_id"] == created["id"]
    assert audit_logs[0]["actor_id"] == "admin-001"
    assert audit_logs[0]["metadata"]["provider_code"] == "STAR-HEALTH"


@pytest.mark.asyncio
async def test_prevent_duplicate_provider_code(mock_db, admin_principal):
    payload1 = InsuranceProviderCreate(
        provider_name="HDFC ERGO General Insurance",
        provider_code="HDFC-ERGO",
        country="India",
        provider_type="Insurance Company",
        status="Active",
    )
    await create_insurance_provider(payload1, principal=admin_principal)

    # Attempt to create duplicate with lowercase code
    payload2 = InsuranceProviderCreate(
        provider_name="HDFC ERGO Duplicate",
        provider_code="hdfc-ergo",
        country="India",
        provider_type="Insurance Company",
        status="Active",
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_insurance_provider(payload2, principal=admin_principal)

    assert exc_info.value.status_code == 409
    assert "already exists" in exc_info.value.detail


@pytest.mark.asyncio
async def test_list_and_filter_providers(mock_db, admin_principal):
    p1 = InsuranceProviderCreate(
        provider_name="Care Health Insurance",
        provider_code="CARE-HLTH",
        country="India",
        provider_type="Insurance Company",
        status="Active",
    )
    p2 = InsuranceProviderCreate(
        provider_name="Medi Assist India TPA",
        provider_code="MEDI-ASSIST",
        country="India",
        provider_type="TPA",
        status="Inactive",
    )
    await create_insurance_provider(p1, principal=admin_principal)
    await create_insurance_provider(p2, principal=admin_principal)

    # Filter by Active status
    result = await list_insurance_providers(status="Active", principal=admin_principal)
    assert result["total"] == 1
    assert result["items"][0]["provider_code"] == "CARE-HLTH"

    # Filter by TPA type
    result_tpa = await list_insurance_providers(provider_type="TPA", principal=admin_principal)
    assert result_tpa["total"] == 1
    assert result_tpa["items"][0]["provider_code"] == "MEDI-ASSIST"

    # Search term matching provider name
    result_search = await list_insurance_providers(search="assist", principal=admin_principal)
    assert result_search["total"] == 1
    assert result_search["items"][0]["provider_code"] == "MEDI-ASSIST"

    # Stats check
    assert result["stats"]["total"] == 2
    assert result["stats"]["active"] == 1
    assert result["stats"]["inactive"] == 1
    assert result["stats"]["insurance_company"] == 1
    assert result["stats"]["tpa"] == 1


@pytest.mark.asyncio
async def test_update_provider_and_audit(mock_db, admin_principal):
    payload = InsuranceProviderCreate(
        provider_name="Niva Bupa Health Insurance",
        provider_code="NIVA-BUPA",
        country="India",
        provider_type="Insurance Company",
        status="Active",
    )
    created = await create_insurance_provider(payload, principal=admin_principal)

    update_payload = InsuranceProviderUpdate(
        contact_person="Priya Nair",
        official_website="https://www.nivabupa.com",
    )
    updated = await update_insurance_provider(created["id"], update_payload, principal=admin_principal)

    assert updated["contact_person"] == "Priya Nair"
    assert updated["official_website"] == "https://www.nivabupa.com"

    # Check update audit log
    audit_logs = [log for log in mock_db["audit_logs"].docs if log["action"] == "insurance_provider.updated"]
    assert len(audit_logs) == 1
    assert audit_logs[0]["target_id"] == created["id"]
    assert audit_logs[0]["metadata"]["changes"]["contact_person"] == "Priya Nair"


@pytest.mark.asyncio
async def test_toggle_provider_status(mock_db, admin_principal):
    payload = InsuranceProviderCreate(
        provider_name="Tata AIG General Insurance",
        provider_code="TATA-AIG",
        country="India",
        provider_type="Insurance Company",
        status="Active",
    )
    created = await create_insurance_provider(payload, principal=admin_principal)

    # Deactivate
    status_payload = InsuranceProviderStatusUpdate(status="Inactive")
    deactivated = await toggle_insurance_provider_status(created["id"], status_payload, principal=admin_principal)
    assert deactivated["status"] == "Inactive"

    # Check status change audit log
    status_logs = [log for log in mock_db["audit_logs"].docs if log["action"] == "insurance_provider.status_changed"]
    assert len(status_logs) == 1
    assert status_logs[0]["metadata"]["previous_status"] == "Active"
    assert status_logs[0]["metadata"]["new_status"] == "Inactive"


@pytest.mark.asyncio
async def test_tenant_isolation(mock_db, admin_principal, other_tenant_admin):
    # Provider created under tenant-alpha
    payload = InsuranceProviderCreate(
        provider_name="ICICI Lombard",
        provider_code="ICICI-LOMB",
        country="India",
        provider_type="Insurance Company",
        status="Active",
    )
    created = await create_insurance_provider(payload, principal=admin_principal)

    # Admin from tenant-beta cannot view it
    with pytest.raises(HTTPException) as exc_info:
        await get_insurance_provider(created["id"], principal=other_tenant_admin)
    assert exc_info.value.status_code == 404

    # Admin from tenant-beta gets empty list
    beta_list = await list_insurance_providers(principal=other_tenant_admin)
    assert beta_list["total"] == 0

    # Admin from tenant-beta CAN use the same code in their own tenant
    created_beta = await create_insurance_provider(payload, principal=other_tenant_admin)
    assert created_beta["tenant_id"] == "tenant-beta"
    assert created_beta["provider_code"] == "ICICI-LOMB"


@pytest.mark.asyncio
async def test_update_duplicate_code_conflict(mock_db, admin_principal):
    p1 = await create_insurance_provider(
        InsuranceProviderCreate(
            provider_name="Provider One",
            provider_code="CODE-ONE",
            country="India",
            provider_type="Insurance Company",
            status="Active",
        ),
        principal=admin_principal,
    )
    p2 = await create_insurance_provider(
        InsuranceProviderCreate(
            provider_name="Provider Two",
            provider_code="CODE-TWO",
            country="India",
            provider_type="TPA",
            status="Active",
        ),
        principal=admin_principal,
    )

    # Trying to update p2's code to CODE-ONE should raise 409
    with pytest.raises(HTTPException) as exc_info:
        await update_insurance_provider(
            p2["id"],
            InsuranceProviderUpdate(provider_code="CODE-ONE"),
            principal=admin_principal,
        )
    assert exc_info.value.status_code == 409
    assert "already exists" in exc_info.value.detail


@pytest.mark.asyncio
async def test_non_existent_provider_raises_404(mock_db, admin_principal):
    with pytest.raises(HTTPException) as exc_get:
        await get_insurance_provider("non-existent-id", principal=admin_principal)
    assert exc_get.value.status_code == 404

    with pytest.raises(HTTPException) as exc_put:
        await update_insurance_provider(
            "non-existent-id",
            InsuranceProviderUpdate(provider_name="New Name"),
            principal=admin_principal,
        )
    assert exc_put.value.status_code == 404

    with pytest.raises(HTTPException) as exc_patch:
        await toggle_insurance_provider_status(
            "non-existent-id",
            InsuranceProviderStatusUpdate(status="Inactive"),
            principal=admin_principal,
        )
    assert exc_patch.value.status_code == 404


@pytest.mark.asyncio
async def test_fastapi_http_client_integration(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from teleconsult.main import create_app
    from teleconsult.kernel.mongodb.client import mongo_database
    from teleconsult.config.settings import get_settings

    test_db = InMemoryMongoDatabase()
    monkeypatch.setattr(type(mongo_database), "enabled", property(lambda self: True))
    monkeypatch.setattr(mongo_database, "database", lambda: test_db)
    monkeypatch.setattr(get_settings(), "mongodb_enabled", True)

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Role": "clinic_admin",
        "X-Dev-User-Id": "admin-http",
        "X-Dev-Tenant-Id": "1",
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create provider via HTTP POST
        res_post = await client.post(
            "/clinic-admin/insurance/providers",
            headers=headers,
            json={
                "provider_name": "Bajaj Allianz General Insurance",
                "provider_code": "BAJAJ-ALLIANZ",
                "country": "India",
                "provider_type": "Insurance Company",
                "contact_person": "Sunita Verma",
                "contact_email": "healthclaims@bajajallianz.co.in",
                "contact_number": "1800-209-5858",
                "official_website": "https://www.bajajallianz.com",
                "status": "Active",
            },
        )
        assert res_post.status_code == 201
        data = res_post.json()
        prov_id = data["id"]
        assert data["provider_code"] == "BAJAJ-ALLIANZ"

        # 2. List providers via HTTP GET
        res_list = await client.get("/clinic-admin/insurance/providers", headers=headers)
        assert res_list.status_code == 200
        list_data = res_list.json()
        assert list_data["total"] == 1
        assert list_data["items"][0]["id"] == prov_id
        assert list_data["stats"]["active"] == 1

        # 3. Get single provider by ID
        res_get = await client.get(f"/clinic-admin/insurance/providers/{prov_id}", headers=headers)
        assert res_get.status_code == 200
        assert res_get.json()["provider_name"] == "Bajaj Allianz General Insurance"

        # 4. Update provider via HTTP PUT
        res_put = await client.put(
            f"/clinic-admin/insurance/providers/{prov_id}",
            headers=headers,
            json={"contact_person": "Sunita Verma-Sharma"},
        )
        assert res_put.status_code == 200
        assert res_put.json()["contact_person"] == "Sunita Verma-Sharma"

        # 5. Toggle status via HTTP PATCH
        res_patch = await client.patch(
            f"/clinic-admin/insurance/providers/{prov_id}/status",
            headers=headers,
            json={"status": "Inactive"},
        )
        assert res_patch.status_code == 200
        assert res_patch.json()["status"] == "Inactive"

