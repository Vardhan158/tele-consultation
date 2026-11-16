from uuid import uuid4
import pytest
from fastapi import HTTPException
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.payments.patient_routes import (
    _resolve_patient_ids,
    get_payment_receipt,
    download_payment_receipt,
)


class MockMongoCollection:
    def __init__(self, data=None):
        self._data = data or []

    async def find_one(self, query):
        for doc in self._data:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(ck) == cv for ck, cv in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return doc
        return None


class MockDatabase:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getitem__(self, name):
        return self._collections.get(name, MockMongoCollection())


@pytest.mark.asyncio
async def test_resolve_patient_ids_aggregates_linked_identifiers():
    user_id = "00000000-0000-0000-0000-000000000001"
    tenant_id = "default_tenant"

    patients_col = MockMongoCollection([
        {
            "tenant_id": tenant_id,
            "id": "pat-1001",
            "user_id": user_id,
            "user_account_id": "acc-500",
        }
    ])
    users_col = MockMongoCollection([
        {"tenant_id": tenant_id, "id": user_id, "user_id": user_id}
    ])

    db = MockDatabase({"patients": patients_col, "users": users_col})
    resolved = await _resolve_patient_ids(db, tenant_id, user_id)

    assert user_id in resolved
    assert "pat-1001" in resolved
    assert "acc-500" in resolved


@pytest.mark.asyncio
async def test_payment_receipt_ownership_enforcement():
    tenant_id = "default_tenant"
    patient_a_id = "00000000-0000-0000-0000-000000000001"
    patient_b_id = "00000000-0000-0000-0000-000000000002"
    payment_id = "pay-unauthorized-999"

    # Payment belongs to Patient B
    payments_col = MockMongoCollection([
        {
            "id": payment_id,
            "tenant_id": tenant_id,
            "patient_id": patient_b_id,
            "appointment_id": "apt-999",
            "amount_paise": 50000,
            "currency": "INR",
            "status": "captured",
        }
    ])
    patients_col = MockMongoCollection([])
    users_col = MockMongoCollection([])

    db = MockDatabase({
        "payments": payments_col,
        "patients": patients_col,
        "users": users_col,
    })

    # Principal is Patient A attempting to access Patient B's payment
    principal = Principal(
        user_id=patient_a_id,
        tenant_id=tenant_id,
        roles=frozenset({"patient"}),
        permissions=frozenset({"payment:read"}),
    )

    # Monkeypatch mongo_database for testing
    import teleconsult.kernel.mongodb.client as mongo_client
    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        # 1. Test get_payment_receipt raises 403
        with pytest.raises(HTTPException) as exc_info:
            await get_payment_receipt(payment_id=payment_id, session=None, principal=principal)
        assert exc_info.value.status_code == 403
        assert "Access denied" in exc_info.value.detail

        # 2. Test download_payment_receipt raises 403
        with pytest.raises(HTTPException) as exc_info_dl:
            await download_payment_receipt(payment_id=payment_id, session=None, principal=principal)
        assert exc_info_dl.value.status_code == 403
        assert "Access denied" in exc_info_dl.value.detail

    finally:
        mongo_client.mongo_database.database = original_database
