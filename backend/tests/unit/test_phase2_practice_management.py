import pytest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.consultation.doctor_routes import (
    create_recurring_availability,
    doctor_get_payouts,
    RecurringAvailabilityPayload,
)
from teleconsult.modules.admin.routes import (
    reassign_appointment_admin,
    get_clinic_payout_ledger,
    ReassignAppointmentPayload,
)


class MockCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return list(self.items[:length] if length else self.items)

    def __aiter__(self):
        self._iter = iter(self.items)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class MockCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return type("InsertResult", (), {"inserted_id": doc.get("id")})()

    def find(self, query=None):
        query = query or {}
        matches = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for sub in v:
                        if all(d.get(sk) == sv for sk, sv in sub.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif k == "status" and isinstance(v, dict) and "$in" in v:
                    if d.get("status") not in v["$in"]:
                        match = False
                        break
                elif k == "starts_at" and isinstance(v, dict) and "$lt" in v:
                    pass  # simplified for mock test
                elif k == "ends_at" and isinstance(v, dict) and "$gt" in v:
                    pass  # simplified for mock test
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(d)
        return MockCursor(matches)

    async def find_one(self, query=None):
        cursor = self.find(query)
        async for doc in cursor:
            return doc
        return None

    async def update_one(self, query, update, upsert=False):
        matched = 0
        doc = await self.find_one(query)
        if doc:
            matched = 1
            if "$set" in update:
                doc.update(update["$set"])
        return type("UpdateResult", (), {"matched_count": matched})()


class MockDb:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = MockCollection()
        return self.collections[name]


@pytest.mark.asyncio
async def test_recurring_availability_generation(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    doctor_id = "doc-rec-1"
    await mock_db["doctors"].insert_one({
        "id": doctor_id,
        "user_id": doctor_id,
        "tenant_id": "ten-rec",
        "full_name": "Dr. Recurring Test",
        "approval_status": "approved",
        "active": True,
        "approved_for_consultation": True,
    })

    principal = Principal(
        user_id=doctor_id,
        tenant_id="ten-rec",
        roles=frozenset({"doctor"}),
        permissions=frozenset({"doctor:availability:write"}),
    )

    payload = RecurringAvailabilityPayload(
        days_of_week=[0, 2],  # Mon & Wed
        start_time="09:00",
        end_time="11:00",
        slot_duration_minutes=30,
        weeks_ahead=2,
    )

    res = await create_recurring_availability(payload, principal=principal)
    assert res["slots_created"] > 0
    assert "Successfully generated" in res["message"]

    # Verify slots were created in collection
    slots = mock_db["doctor_availability"].docs
    assert len(slots) == res["slots_created"]
    for s in slots:
        assert s["doctor_id"] == doctor_id
        assert s["status"] == "available"


@pytest.mark.asyncio
async def test_section_194j_payout_and_ledger_reconciliation(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    doctor_id = "doc-tds-1"
    await mock_db["doctors"].insert_one({
        "id": doctor_id,
        "user_id": doctor_id,
        "tenant_id": "ten-tds",
        "full_name": "Dr. Sharma",
        "approval_status": "approved",
        "active": True,
        "approved_for_consultation": True,
    })

    # Seed 2 Section 194J ledger entries: ₹1,000 (100k paise) and ₹2,000 (200k paise)
    await mock_db["doctor_payout_ledger"].insert_one({
        "id": "payout-entry-1",
        "tenant_id": "ten-tds",
        "doctor_id": doctor_id,
        "appointment_id": "apt-1",
        "payment_id": "pay-1",
        "gross_amount_paise": 100_000,
        "platform_fee_paise": 15_000,
        "tds_rate": 0.10,
        "tds_withheld_paise": 10_000,
        "net_payable_paise": 75_000,
        "status": "recorded",
        "financial_year": "2026-2027",
        "created_at": datetime.now(UTC).isoformat(),
    })
    await mock_db["doctor_payout_ledger"].insert_one({
        "id": "payout-entry-2",
        "tenant_id": "ten-tds",
        "doctor_id": doctor_id,
        "appointment_id": "apt-2",
        "payment_id": "pay-2",
        "gross_amount_paise": 200_000,
        "platform_fee_paise": 30_000,
        "tds_rate": 0.10,
        "tds_withheld_paise": 20_000,
        "net_payable_paise": 150_000,
        "status": "recorded",
        "financial_year": "2026-2027",
        "created_at": datetime.now(UTC).isoformat(),
    })

    doc_principal = Principal(
        user_id=doctor_id,
        tenant_id="ten-tds",
        roles=frozenset({"doctor"}),
        permissions=frozenset({"doctor:appointment:read"}),
    )

    # 1. Doctor queries personal earnings and Section 194J TDS
    doc_payouts = await doctor_get_payouts(principal=doc_principal)
    assert doc_payouts["total_gross_inr"] == 3000.0
    assert doc_payouts["total_platform_commission_inr"] == 450.0
    assert doc_payouts["total_tds_withheld_inr"] == 300.0  # 10% TDS
    assert doc_payouts["total_net_payable_inr"] == 2250.0
    assert len(doc_payouts["entries"]) == 2

    # 2. Clinic Admin queries clinic-wide statutory TDS ledger
    from fastapi import Request
    admin_req = type("Req", (), {"cookies": {}, "headers": {}})()
    admin_principal = Principal(
        user_id="admin-1",
        tenant_id="ten-tds",
        roles=frozenset({"clinic_admin"}),
        permissions=frozenset({"clinic:admin"}),
    )

    from teleconsult.modules.admin import routes as admin_routes
    async def mock_admin_verify(req):
        return admin_principal
    monkeypatch.setattr(admin_routes, "_verify_admin", mock_admin_verify)
    settings = admin_routes.get_settings()
    monkeypatch.setattr(settings, "default_tenant_id", "ten-tds")

    admin_ledger = await get_clinic_payout_ledger(request=admin_req)
    assert admin_ledger["total_gross_inr"] == 3000.0
    assert admin_ledger["total_tds_withheld_inr"] == 300.0
    assert admin_ledger["total_net_payable_inr"] == 2250.0
    assert admin_ledger["total_transactions"] == 2


@pytest.mark.asyncio
async def test_admin_appointment_reassignment(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    old_doc_id = "doc-old"
    new_doc_id = "doc-new"
    apt_id = "apt-reassign-123"

    await mock_db["doctors"].insert_one({
        "id": new_doc_id,
        "tenant_id": "ten-clinic",
        "full_name": "Dr. Subhash Bose",
        "specialty": "Neurology",
        "active": True,
        "approved_for_consultation": True,
    })

    await mock_db["appointments"].insert_one({
        "id": apt_id,
        "tenant_id": "ten-clinic",
        "patient_id": "pat-777",
        "doctor_id": old_doc_id,
        "status": "confirmed",
        "starts_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
    })

    from teleconsult.modules.admin import routes as admin_routes
    admin_req = type("Req", (), {"cookies": {}, "headers": {}})()
    admin_principal = Principal(
        user_id="admin-super",
        tenant_id="ten-clinic",
        roles=frozenset({"clinic_admin"}),
        permissions=frozenset({"clinic:admin"}),
    )
    async def mock_admin_verify_2(req):
        return admin_principal
    monkeypatch.setattr(admin_routes, "_verify_admin", mock_admin_verify_2)
    settings = admin_routes.get_settings()
    monkeypatch.setattr(settings, "default_tenant_id", "ten-clinic")

    payload = ReassignAppointmentPayload(
        new_doctor_id=new_doc_id,
        reason="Primary doctor attending an urgent surgical procedure",
    )

    result = await reassign_appointment_admin(apt_id, payload, request=admin_req)
    assert result["status"] == "reassigned"
    assert result["doctor_id"] == new_doc_id

    # Verify appointment updated in database
    updated_apt = await mock_db["appointments"].find_one({"id": apt_id})
    assert updated_apt["doctor_id"] == new_doc_id
    assert updated_apt["reassigned_from"] == old_doc_id
    assert updated_apt["reassignment_reason"] == "Primary doctor attending an urgent surgical procedure"

    # Verify notification queued for patient
    notifs = mock_db["notifications"].docs
    assert len(notifs) == 1
    assert notifs[0]["event_type"] == "doctor_reassigned"
    assert "Dr. Subhash Bose" in notifs[0]["body"]
