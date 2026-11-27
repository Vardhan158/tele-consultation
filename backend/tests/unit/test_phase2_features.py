"""Unit tests for Phase 2 features:
- F-04: Chrono-Care Timeline & Longitudinal Health Trends (GET /patient/health-timeline)
- F-05: Drug-Drug Interaction & Dosage Safety Copilot (POST /clinician/clinical-outputs/check-drug-safety)
- F-06: Granular Purpose-Bound Consent Ledger (GET/POST /patient/consents/granular-ledger)
"""
from datetime import UTC, datetime
from uuid import uuid4
import pytest
from httpx import ASGITransport, AsyncClient

from teleconsult.main import create_app
import teleconsult.kernel.mongodb.client as mc
from teleconsult.config.settings import get_settings


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
async def test_get_chrono_care_timeline(test_setup):
    db = test_setup
    tenant_id = "1"
    user_id = "patient-chrono-1"

    # Seed Patient
    await db["patients"].insert_one({
        "id": user_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "full_name": "Meera Krishnan",
    })

    # Seed Appointment
    await db["appointments"].insert_one({
        "id": "apt-chr-1",
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "doctor_name": "Dr. Ramesh Gupta",
        "specialty": "Cardiology",
        "status": "completed",
        "starts_at": "2026-11-20T10:00:00Z",
    })

    # Seed Prescription
    await db["prescriptions"].insert_one({
        "id": "rx-chr-1",
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "prescriber_name": "Dr. Ramesh Gupta",
        "medications": [{"name": "Amlodipine 5mg", "dosage": "Once daily"}],
        "released_at": "2026-11-20T10:30:00Z",
    })

    # Seed Clinical Summary
    await db["consultation_summaries"].insert_one({
        "id": "sm-chr-1",
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "content": "Stage 1 Essential Hypertension. Lifestyle changes and Amlodipine initiated.",
        "released_at": "2026-11-20T10:35:00Z",
    })

    # Seed Diagnostic Record
    await db["records"].insert_one({
        "id": "rec-chr-1",
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "title": "Lipid Profile Panel",
        "uploaded_at": "2026-11-19T09:00:00Z",
    })

    # Seed Medical Intake for vitals
    await db["medical_intakes"].insert_one({
        "id": "intake-1",
        "tenant_id": tenant_id,
        "patient_id": user_id,
        "blood_pressure": "128/84",
        "pulse": 76,
        "weight": 68.5,
        "submitted_at": "2026-11-20T09:45:00Z",
    })

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Patient-Id": user_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/patient/health-timeline", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["patient_name"] == "Meera Krishnan"
        assert data["total_events"] >= 4
        event_types = {e["event_type"] for e in data["events"]}
        assert "consultation" in event_types
        assert "prescription" in event_types
        assert "summary" in event_types
        assert "record" in event_types
        assert "vital_trends" in data
        assert "blood_pressure" in data["vital_trends"]
        assert len(data["vital_trends"]["blood_pressure"]) >= 1


@pytest.mark.asyncio
async def test_drug_safety_copilot_allergy_and_interactions(test_setup):
    db = test_setup
    tenant_id = "1"
    doc_id = "doc-safety-1"

    # Seed Doctor
    await db["doctors"].insert_one({
        "id": doc_id,
        "user_id": doc_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Ananya Roy",
        "approval_status": "approved",
        "active": True,
    })

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Doctor-Id": doc_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    payload = {
        "medications": [
            {"name": "Amoxicillin 500mg", "dosage": "1-0-1"},
            {"name": "Aspirin 75mg", "dosage": "0-1-0"},
            {"name": "Omeprazole 20mg", "dosage": "1-0-0"},
        ],
        "allergies": ["Penicillin"],
        "existing_medications": ["Warfarin 5mg", "Clopidogrel 75mg"],
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/clinician/clinical-outputs/check-drug-safety", headers=headers, json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["safe_to_prescribe"] is False
        assert data["overall_risk_level"] in {"critical", "high"}
        severities = [a["severity"] for a in data["alerts"]]
        assert "contraindicated" in severities  # Penicillin allergy vs Amoxicillin
        assert "major" in severities            # Warfarin vs Aspirin
        assert "moderate" in severities         # Clopidogrel vs Omeprazole


@pytest.mark.asyncio
async def test_drug_safety_copilot_schedule_x_intercept(test_setup):
    db = test_setup
    tenant_id = "1"
    doc_id = "doc-safety-2"

    await db["doctors"].insert_one({
        "id": doc_id,
        "user_id": doc_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Arvind Rao",
        "approval_status": "approved",
        "active": True,
    })

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Doctor-Id": doc_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    payload = {
        "medications": [
            {"name": "Ketamine 50mg", "dosage": "stat"},
            {"name": "Paracetamol 500mg", "dosage": "1-0-1"},
        ],
        "allergies": [],
        "existing_medications": [],
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/clinician/clinical-outputs/check-drug-safety", headers=headers, json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["schedule_x_intercepted"] is True
        assert data["safe_to_prescribe"] is False
        assert data["overall_risk_level"] == "critical"
        alert_types = [a["interaction_type"] for a in data["alerts"]]
        assert "schedule_x_intercept" in alert_types


@pytest.mark.asyncio
async def test_granular_consent_lifecycle(test_setup):
    db = test_setup
    tenant_id = "1"
    user_id = "patient-consent-1"

    await db["patients"].insert_one({
        "id": user_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "full_name": "Devika Pillai",
    })

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Patient-Id": user_id,
        "X-Dev-Tenant-Id": tenant_id,
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch initial standard granular consents
        res_list = await client.get("/patient/consents/granular-ledger", headers=headers)
        assert res_list.status_code == 200
        initial_consents = res_list.json()
        assert len(initial_consents) >= 3
        codes = [c["purpose_code"] for c in initial_consents]
        assert "CARE" in codes
        assert "EMERGENCY" in codes

        # 2. Grant a new purpose-bound research consent
        new_consent_payload = {
            "purpose_code": "RESEARCH",
            "purpose_title": "Anonymized Diabetic Outcomes Research Panel",
            "data_types": ["vitals", "glucose_readings"],
            "validity_days": 90,
            "delegate_entity": "Apollo Telehealth Research Institute",
        }
        res_create = await client.post("/patient/consents/granular-ledger", headers=headers, json=new_consent_payload)
        assert res_create.status_code == 201
        created = res_create.json()
        assert created["purpose_code"] == "RESEARCH"
        assert created["status"] == "active"
        assert created["abdm_artifact_id"].startswith("ABDM-")
        created_id = created["id"]

        # 3. Revoke the newly granted consent
        revoke_payload = {"reason": "Withdrawing consent for research study"}
        res_revoke = await client.post(f"/patient/consents/granular-ledger/{created_id}/revoke", headers=headers, json=revoke_payload)
        assert res_revoke.status_code == 200
        revoked = res_revoke.json()
        assert revoked["id"] == created_id
        assert revoked["status"] == "revoked"
        assert revoked["revocation_reason"] == "Withdrawing consent for research study"
        assert revoked["revoked_at"] is not None
