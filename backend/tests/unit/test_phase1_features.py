"""Unit tests for Phase 1 features:
- F-01: Pre-Flight Claim Health Checker (POST /patient/insurance/claims/preflight-validate)
- F-03: Geo-Aware Emergency Paramedic Card (GET /patient/emergency-card)
"""
from datetime import UTC, datetime
from uuid import uuid4
import pytest
from httpx import ASGITransport, AsyncClient

from teleconsult.main import create_app
import teleconsult.kernel.mongodb.client as mc
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal


class InMemoryCursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self._idx = 0

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __iter__(self):
        return iter(self._docs)

    def __aiter__(self):
        self._idx = 0
        return self

    async def __anext__(self):
        if self._idx < len(self._docs):
            item = self._docs[self._idx]
            self._idx += 1
            return item
        raise StopAsyncIteration


class InMemoryCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query):
        for doc in self.docs:
            if self._matches(doc, query):
                return dict(doc)
        return None

    def find(self, query):
        matches = [dict(d) for d in self.docs if self._matches(d, query)]
        return InMemoryCursor(matches)

    async def insert_one(self, doc):
        d = dict(doc)
        if "id" not in d:
            d["id"] = str(uuid4())
        self.docs.append(d)
        return type("Result", (), {"inserted_id": d["id"]})()

    async def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if self._matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "id" not in new_doc:
                new_doc["id"] = str(uuid4())
            self.docs.append(new_doc)

    def _matches(self, doc, query):
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, sub) for sub in v):
                    return False
            elif k == "tenant_id" and str(doc.get("tenant_id")) != str(v):
                return False
            elif isinstance(v, dict):
                if "$nin" in v and doc.get(k) in v["$nin"]:
                    return False
                if "$in" in v and doc.get(k) not in v["$in"]:
                    return False
            elif doc.get(k) != v:
                return False
        return True


class InMemoryDatabase:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = InMemoryCollection()
        return self.collections[name]

    def __contains__(self, name):
        return True


@pytest.fixture
def test_setup(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr(type(mc.mongo_database), "enabled", property(lambda self: True))
    monkeypatch.setattr(mc.mongo_database, "database", lambda: db)
    monkeypatch.setattr(get_settings(), "mongodb_enabled", True)
    monkeypatch.setattr(get_settings(), "environment", "dev")
    return db


@pytest.mark.asyncio
async def test_preflight_claim_validation_complete_success(test_setup):
    db = test_setup
    tenant_id = "1"
    user_id = "patient-p1"
    appt_id = "appt-comp-1"
    pol_id = "pol-active-1"

    # Seed Patient
    await db["patients"].insert_one({
        "id": user_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "full_name": "Aarav Sharma",
        "email": "aarav@example.com",
    })

    # Seed Completed Appointment
    await db["appointments"].insert_one({
        "id": appt_id,
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "doctor_id": "doc-1",
        "doctor_name": "Dr. Ramesh Gupta",
        "status": "completed",
        "starts_at": "2026-11-20T10:00:00Z",
        "fee_paise": 150000,
        "consultation_fee": "₹1500.00",
    })

    # Seed Payment
    await db["payments"].insert_one({
        "id": "pay-1",
        "tenant_id": tenant_id,
        "appointment_id": appt_id,
        "status": "captured",
    })

    # Seed Consultation Summary
    await db["consultation_summaries"].insert_one({
        "id": "sum-1",
        "tenant_id": tenant_id,
        "appointment_id": appt_id,
        "status": "finalized",
    })

    # Seed Prescription
    await db["prescriptions"].insert_one({
        "id": "rx-1",
        "tenant_id": tenant_id,
        "appointment_id": appt_id,
        "patient_id": user_id,
        "status": "released",
        "medications": [{"name": "Amoxicillin", "dosage": "500mg", "frequency": "1-0-1"}],
    })

    # Seed Active Policy covering appointment
    await db["insurance_policies"].insert_one({
        "id": pol_id,
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "provider_name": "Star Health",
        "policy_number": "SH-12345678",
        "policy_holder_name": "Aarav Sharma",
        "relationship": "Self",
        "status": "Active",
        "start_date": "2026-01-01",
        "expiry_date": "2027-12-31",
    })

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Patient-Id": user_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/patient/insurance/claims/preflight-validate",
            headers=headers,
            json={"appointment_id": appt_id, "policy_id": pol_id},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["readiness_score"] == 100
        assert data["is_submission_ready"] is True
        assert "100%" in data["summary_message"]
        checks = {c["key"]: c["passed"] for c in data["checks"]}
        assert checks["consultation_status"] is True
        assert checks["payment_verification"] is True
        assert checks["summary_finalized"] is True
        assert checks["prescription_released"] is True
        assert checks["policy_selection"] is True
        assert checks["policy_status"] is True
        assert checks["coverage_window"] is True


@pytest.mark.asyncio
async def test_preflight_claim_validation_missing_policy_warns(test_setup):
    db = test_setup
    tenant_id = "1"
    user_id = "patient-p2"
    appt_id = "appt-comp-2"

    await db["patients"].insert_one({
        "id": user_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "full_name": "Priya Nair",
    })
    await db["appointments"].insert_one({
        "id": appt_id,
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "status": "completed",
        "starts_at": "2026-11-20T10:00:00Z",
    })
    await db["payments"].insert_one({"appointment_id": appt_id, "tenant_id": tenant_id, "status": "captured"})
    await db["consultation_summaries"].insert_one({"appointment_id": appt_id, "tenant_id": tenant_id, "status": "finalized"})
    await db["prescriptions"].insert_one({"appointment_id": appt_id, "tenant_id": tenant_id, "status": "released"})

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Patient-Id": user_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/patient/insurance/claims/preflight-validate",
            headers=headers,
            json={"appointment_id": appt_id, "policy_id": None},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["is_submission_ready"] is False
        assert data["readiness_score"] < 100
        checks = {c["key"]: c for c in data["checks"]}
        assert checks["policy_selection"]["passed"] is False
        assert "action_hint" in checks["policy_selection"]


@pytest.mark.asyncio
async def test_get_emergency_paramedic_card_success(test_setup):
    db = test_setup
    tenant_id = "1"
    user_id = "00000000-0000-0000-0000-000000000777"

    # Seed Patient with Allergies and Emergency Contact
    await db["patients"].insert_one({
        "id": user_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "full_name": "Kavita Sundaram",
        "date_of_birth": "1988-06-14",
        "gender": "Female",
        "blood_group": "B+",
        "emergency_contact": {"name": "Rajesh Sundaram", "phone": "+91-9888877777", "relationship": "Spouse"},
        "allergies": ["Penicillin", "Aspirin"],
        "medical_history": ["Type 2 Diabetes", "Hypertension"],
    })

    # Seed Active Prescription
    await db["prescriptions"].insert_one({
        "id": "rx-em-1",
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "medications": [
            {"name": "Metformin", "dosage": "500mg", "frequency": "1-0-1"},
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "1-0-0"},
        ],
        "created_at": "2026-11-25T10:00:00Z",
    })

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Patient-Id": user_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/patient/emergency-card", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["patient_id"] == user_id
        assert data["full_name"] == "Kavita Sundaram"
        assert data["blood_group"] == "B+"
        assert data["emergency_contact"]["name"] == "Rajesh Sundaram"
        assert data["emergency_contact"]["phone"] == "+91-9888877777"
        assert "Penicillin" in data["allergies"]
        assert "Type 2 Diabetes" in data["chronic_conditions"]
        assert any("Metformin" in m for m in data["active_medications"])
        assert len(data["emergency_hotlines"]) >= 3
        hotline_numbers = [h["number"] for h in data["emergency_hotlines"]]
        assert "112" in hotline_numbers
        assert "108" in hotline_numbers
