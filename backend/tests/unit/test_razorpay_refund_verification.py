from datetime import UTC, datetime
from uuid import uuid4
import pytest
from fastapi import HTTPException
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.admin.routes import refund_payment_admin, RefundPayload


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

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        if doc:
            if "$set" in update:
                doc.update(update["$set"])
        elif upsert:
            new_doc = dict(update.get("$set", {}))
            self._data.append(new_doc)

    async def insert_one(self, doc):
        self._data.append(dict(doc))


class MockDatabase:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MockMongoCollection()
        return self._collections[name]


class MockRequest:
    def __init__(self):
        self.cookies = {"teleconsult_session": "test_session_token"}
        self.headers = {}


@pytest.mark.asyncio
async def test_razorpay_refund_verification_and_duplicate_prevention():
    tenant_id = get_settings().default_tenant_id
    admin_user_id = "admin_user_1"
    payment_id = "pay_captured_400"

    payments_col = MockMongoCollection([
        {
            "id": payment_id,
            "tenant_id": tenant_id,
            "patient_id": "patient-101",
            "appointment_id": "KC-APT-5C330E",
            "amount_paise": 40000,
            "currency": "INR",
            "status": "captured",
            "provider_transaction_id": "pay_test_40000",
        }
    ])

    appointments_col = MockMongoCollection([
        {"id": "KC-APT-5C330E", "tenant_id": tenant_id, "status": "confirmed"}
    ])

    db = MockDatabase({
        "payments": payments_col,
        "appointments": appointments_col,
        "audit_logs": MockMongoCollection([]),
    })

    import teleconsult.kernel.mongodb.client as mongo_client
    import teleconsult.modules.admin.routes as admin_routes_mod

    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        async def mock_verify_admin(request):
            return Principal(
                user_id=admin_user_id,
                tenant_id=tenant_id,
                roles=frozenset({"clinic_admin"}),
                permissions=frozenset({"clinic:admin"}),
            )

        admin_routes_mod._verify_admin = mock_verify_admin

        req = MockRequest()
        payload = RefundPayload(reason="Customer goodwill refund")

        # 1. Process refund first time (Success)
        res = await refund_payment_admin(payment_id=payment_id, payload=payload, request=req, session=None)

        assert res["status"] == "refunded"
        assert res["amount_paise"] == 40000
        assert res["formatted_amount"] == "₹400.00"
        assert res["razorpay_refund_id"].startswith("rfnd_")

        # 2. Process refund second time (Duplicate refund prevention raises 409 Conflict)
        with pytest.raises(HTTPException) as exc_info:
            await refund_payment_admin(payment_id=payment_id, payload=payload, request=req, session=None)

        assert exc_info.value.status_code == 409
        assert "already been refunded" in exc_info.value.detail

    finally:
        mongo_client.mongo_database.database = original_database
