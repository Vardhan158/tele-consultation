import pytest
from datetime import UTC, datetime
from uuid import uuid4

from teleconsult.kernel.authz.policy import Principal
from teleconsult.adapters.whatsapp import get_whatsapp_service
from teleconsult.modules.records.clinical_routes import (
    get_generic_substitutes,
    create_pharmacy_order,
    list_pharmacy_orders,
    PharmacyOrderCreate,
    PharmacyOrderItem,
)
from teleconsult.modules.patient_portal.routes import (
    request_urgent_care,
    get_urgent_care_status,
    cancel_urgent_care,
    UrgentCareRequest,
)
from teleconsult.modules.consultation.doctor_routes import (
    toggle_urgent_care,
    get_urgent_care_queue,
    claim_urgent_care_ticket,
    UrgentCareToggle,
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
                elif k == "patient_id" and isinstance(v, dict) and "$in" in v:
                    if d.get("patient_id") not in v["$in"]:
                        match = False
                        break
                elif k == "status" and isinstance(v, dict) and "$in" in v:
                    if d.get("status") not in v["$in"]:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(d)
        return MockCursor(matches)

    async def find_one(self, query=None, sort=None):
        cursor = self.find(query)
        async for doc in cursor:
            return doc
        return None

    async def count_documents(self, query=None):
        query = query or {}
        count = 0
        async for _ in self.find(query):
            count += 1
        return count

    async def update_one(self, query, update, upsert=False):
        matched = 0
        doc = await self.find_one(query)
        if doc:
            matched = 1
            if "$set" in update:
                doc.update(update["$set"])
        return type("UpdateResult", (), {"matched_count": matched})()

    async def find_one_and_update(self, query, update, return_document=True):
        doc = await self.find_one(query)
        if doc:
            if "$set" in update:
                doc.update(update["$set"])
            return doc
        return None


class MockDb:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = MockCollection()
        return self.collections[name]


@pytest.mark.asyncio
async def test_whatsapp_service_formatting_and_dev_fallback():
    service = get_whatsapp_service()

    # Test appointment confirmation template
    res1 = await service.send_appointment_confirmation(
        to_phone="+919876543210",
        patient_name="Ananya Sharma",
        doctor_name="Dr. Priya Rao",
        appointment_time="Nov 25, 2026, 10:30 AM IST",
        join_url="https://care.kaizen.io/consult/apt-test-101",
    )
    assert res1["status"] == "simulated"
    assert "Ananya Sharma" in res1["message"]
    assert "https://care.kaizen.io/consult/apt-test-101" in res1["message"]

    # Test 15-min reminder template
    res2 = await service.send_15min_reminder(
        to_phone="+919876543210",
        patient_name="Ananya Sharma",
        doctor_name="Dr. Priya Rao",
        join_url="https://care.kaizen.io/consult/apt-test-101",
    )
    assert res2["status"] == "simulated"
    assert "15 minutes" in res2["message"]

    # Test prescription alert template
    res3 = await service.send_prescription_alert(
        to_phone="+919876543210",
        patient_name="Ananya Sharma",
        doctor_name="Dr. Priya Rao",
        prescription_url="https://care.kaizen.io/rx/rx-101/download",
    )
    assert res3["status"] == "simulated"
    assert "official electronic prescription" in res3["message"]


@pytest.mark.asyncio
async def test_generic_substitutes_and_pharmacy_ordering(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    tenant_id = "ten-pharm"
    patient_user_id = "pat-123"
    rx_id = "rx-test-999"

    # Seed patient
    await mock_db["patients"].insert_one({
        "id": patient_user_id,
        "user_id": patient_user_id,
        "tenant_id": tenant_id,
        "full_name": "Rohan Patel",
        "phone_number": "+919876543210",
        "address": "42 HSR Layout, Sector 2, Bangalore",
    })

    # Seed prescription with brand names (Crocin, Pantoprazole)
    rx_content = (
        "Rx: Teleconsultation Encounter\n"
        "1. Crocin 650mg - 1 tablet TDS after meals\n"
        "2. Pantoprazole 40mg - 1 tablet OD empty stomach\n"
        "Diagnosis: Acute Gastritis & Fever"
    )
    await mock_db["prescriptions"].insert_one({
        "id": rx_id,
        "tenant_id": tenant_id,
        "patient_id": patient_user_id,
        "appointment_id": "apt-888",
        "prescriber_name": "Dr. Vivek Gupta",
        "content": rx_content,
        "status": "released",
        "created_at": datetime.now(UTC).isoformat(),
        "released_at": datetime.now(UTC).isoformat(),
    })

    principal = Principal(
        user_id=patient_user_id,
        tenant_id=tenant_id,
        roles=frozenset({"patient"}),
        permissions=frozenset({"prescription:read"}),
    )

    # 1. Test Generic Substitutes Suggestion
    sub_res = await get_generic_substitutes(rx_id, principal=principal)
    assert sub_res["prescription_id"] == rx_id
    assert len(sub_res["substitutes"]) >= 2
    assert sub_res["savings_percentage"] > 50.0
    assert sub_res["total_savings_inr"] > 0.0

    # 2. Test Pharmacy Ordering
    order_payload = PharmacyOrderCreate(
        delivery_address="42 HSR Layout, Sector 2, Bangalore",
        contact_phone="+919876543210",
        preferred_tier="generic_jan_aushadhi",
        items=[
            PharmacyOrderItem(
                name="Paracetamol (Jan Aushadhi)",
                generic_name="Paracetamol 650mg",
                dosage="650mg",
                quantity=1,
                price_inr=12.0,
            ),
            PharmacyOrderItem(
                name="Pantoprazole 40mg (Jan Aushadhi)",
                generic_name="Pantoprazole 40mg",
                dosage="40mg",
                quantity=1,
                price_inr=18.0,
            ),
        ],
        notes="Please deliver between 10am - 1pm",
    )

    ord_res = await create_pharmacy_order(rx_id, order_payload, principal=principal)
    assert ord_res["status"] == "confirmed"
    assert "rx-ord-" in ord_res["order_id"]
    assert ord_res["total_amount_inr"] == 30.0

    # 3. Test List Pharmacy Orders
    orders_list = await list_pharmacy_orders(principal=principal)
    assert len(orders_list) == 1
    assert orders_list[0]["id"] == ord_res["order_id"]
    assert orders_list[0]["total_amount_inr"] == 30.0
    assert "Janaushadhi" in orders_list[0]["fulfillment_partner"]


@pytest.mark.asyncio
async def test_urgent_care_queue_lifecycle(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    tenant_id = "ten-urg"
    patient_id = "pat-urg-1"
    doctor_id = "doc-urg-1"

    # Seed doctor
    await mock_db["doctors"].insert_one({
        "id": doctor_id,
        "user_id": doctor_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Sunita Sen",
        "approval_status": "approved",
        "active": True,
        "urgent_care_duty": False,
    })

    # Seed patient
    await mock_db["patients"].insert_one({
        "id": patient_id,
        "user_id": patient_id,
        "tenant_id": tenant_id,
        "full_name": "Meera Nair",
        "phone_number": "+919988776655",
    })

    patient_principal = Principal(
        user_id=patient_id,
        tenant_id=tenant_id,
        roles=frozenset({"patient"}),
        permissions=frozenset({"appointment:create", "appointment:read"}),
    )

    doctor_principal = Principal(
        user_id=doctor_id,
        tenant_id=tenant_id,
        roles=frozenset({"doctor"}),
        permissions=frozenset({"doctor:appointment:read", "doctor:appointment:write"}),
    )

    # 1. Patient requests urgent care
    req_payload = UrgentCareRequest(
        chief_complaint="High fever and severe chills since 2 hours",
        urgency_level="urgent",
        contact_phone="+919988776655",
    )
    req_res = await request_urgent_care(req_payload, principal=patient_principal)
    assert req_res["status"] == "waiting"
    assert req_res["queue_position"] == 1
    ticket_id = req_res["ticket_id"]

    # 2. Duplicate request returns same waiting ticket
    dup_res = await request_urgent_care(req_payload, principal=patient_principal)
    assert dup_res["ticket_id"] == ticket_id
    assert dup_res["status"] == "waiting"

    # 3. Doctor toggles on-duty
    duty_res = await toggle_urgent_care(UrgentCareToggle(active=True), principal=doctor_principal)
    assert duty_res["urgent_care_duty"] is True

    # 4. Doctor checks queue
    queue_res = await get_urgent_care_queue(principal=doctor_principal)
    assert queue_res["doctor_on_duty"] is True
    assert queue_res["queue_count"] == 1
    assert queue_res["waiting_patients"][0]["ticket_id"] == ticket_id

    # 5. Doctor claims the ticket
    claim_res = await claim_urgent_care_ticket(ticket_id, principal=doctor_principal)
    assert claim_res["status"] == "claimed"
    assert "appointment_id" in claim_res
    apt_id = claim_res["appointment_id"]

    # 6. Patient status reflects claimed state
    status_res = await get_urgent_care_status(principal=patient_principal)
    assert status_res["has_active_request"] is True
    assert status_res["status"] == "claimed"
    assert status_res["appointment_id"] == apt_id
    assert status_res["doctor_name"] == "Dr. Sunita Sen"
