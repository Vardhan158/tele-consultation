"""Unit tests for Phase 4 features:
- F-10: 3D Pain & Symptom Visualizer (Intake & Live Call Synced)
- F-11: In-Call Collaborative Teleconsent & Live Document Review
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

    def skip(self, *args, **kwargs):
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

    async def count_documents(self, query):
        return sum(1 for d in self.docs if self._matches(d, query))

    async def insert_one(self, doc):
        d = dict(doc)
        if "id" not in d:
            d["id"] = str(uuid4())
        self.docs.append(d)
        return type("Result", (), {"inserted_id": d["id"]})()

    async def update_one(self, query, update, upsert=False):
        matched = 0
        for doc in self.docs:
            if self._matches(doc, query):
                matched = 1
                if "$set" in update:
                    doc.update(update["$set"])
                return type("Result", (), {"matched_count": matched})()
        if upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "id" not in new_doc:
                new_doc["id"] = str(uuid4())
            self.docs.append(new_doc)
            return type("Result", (), {"matched_count": 1})()
        return type("Result", (), {"matched_count": 0})()

    def _matches(self, doc, query):
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, sub) for sub in v):
                    return False
            elif k == "tenant_id" and str(doc.get("tenant_id")) != str(v):
                return False
            elif isinstance(v, dict):
                if "$in" in v and doc.get(k) not in v["$in"]:
                    return False
                if "$nin" in v and doc.get(k) in v["$nin"]:
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
async def test_3d_pain_map_intake_and_doctor_annotation(test_setup):
    """F-10: Verify patient 3D pain map saving, retrieval, and doctor clinical annotation."""
    db = test_setup
    tenant_id = "default"
    patient_id = f"pat-pain-{uuid4().hex[:6]}"
    doctor_id = f"doc-ortho-{uuid4().hex[:6]}"
    appointment_id = f"appt-pain-{uuid4().hex[:8]}"

    # Seed Doctor
    await db["doctors"].insert_one({
        "id": doctor_id,
        "user_id": doctor_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Orthopedic Specialist",
        "specialty": "Orthopedics",
        "active": True,
    })

    # Seed Appointment
    await db["appointments"].insert_one({
        "id": appointment_id,
        "tenant_id": tenant_id,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "status": "confirmed",
        "starts_at": datetime.now(UTC).isoformat(),
    })

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Patient saves 3D pain map
        patient_headers = {"X-Dev-Patient-Id": patient_id, "X-Dev-Tenant-Id": tenant_id}
        pain_payload = {
            "points": [
                {
                    "body_region": "lumbar_spine",
                    "label": "Lower Back (L4-L5)",
                    "severity": 8,
                    "pain_type": "Throbbing",
                    "coordinates": [0.0, 0.45, -0.12],
                    "notes": "Radiates down the left lateral thigh upon forward flexion",
                    "duration_days": 14,
                },
                {
                    "body_region": "left_knee",
                    "label": "Left Knee Patellar",
                    "severity": 5,
                    "pain_type": "Aching",
                    "coordinates": [-0.18, -0.22, 0.05],
                    "notes": "Stiffness following prolonged sitting",
                    "duration_days": 30,
                },
            ],
            "patient_notes": "Significant difficulty ascending stairs over the past two weeks.",
        }

        save_res = await client.post(
            f"/patient/appointments/{appointment_id}/pain-map",
            headers=patient_headers,
            json=pain_payload,
        )
        assert save_res.status_code == 200, save_res.text
        save_data = save_res.json()
        assert save_data["status"] == "saved"
        assert save_data["total_points"] == 2
        assert save_data["overall_severity"] == 8

        # 2. Patient retrieves saved pain map
        get_res = await client.get(
            f"/patient/appointments/{appointment_id}/pain-map",
            headers=patient_headers,
        )
        assert get_res.status_code == 200, get_res.text
        map_data = get_res.json()
        assert len(map_data["points"]) == 2
        assert map_data["overall_severity"] == 8
        assert "ascending stairs" in map_data["patient_notes"]

        # 3. Doctor reviews patient's 3D pain map
        doctor_headers = {"X-Dev-Doctor-Id": doctor_id, "X-Dev-Tenant-Id": tenant_id}
        doc_view_res = await client.get(
            f"/doctor/consultations/{appointment_id}/pain-map",
            headers=doctor_headers,
        )
        assert doc_view_res.status_code == 200, doc_view_res.text
        doc_view = doc_view_res.json()
        assert len(doc_view["points"]) == 2
        assert doc_view["overall_severity"] == 8

        # 4. Doctor annotates pain map with clinical palpation findings
        doc_annotate_res = await client.post(
            f"/doctor/consultations/{appointment_id}/pain-map",
            headers=doctor_headers,
            json={
                "doctor_notes": "Positive Straight Leg Raise on left side at 45 degrees. Tenderness on L4-L5 paraspinal palpation.",
                "clinical_observations": ["Left L5 radiculopathy suspected", "Patellofemoral crepitus noted"],
                "additional_points": [
                    {
                        "body_region": "lumbar_spine",
                        "label": "Paraspinal Spasm Trigger Point",
                        "severity": 7,
                        "pain_type": "Sharp",
                        "coordinates": [0.05, 0.47, -0.1],
                        "notes": "Hypertonic muscle band detected during clinical history assessment",
                    }
                ],
            },
        )
        assert doc_annotate_res.status_code == 200, doc_annotate_res.text
        doc_annotate_data = doc_annotate_res.json()
        assert doc_annotate_data["annotated_by_doctor"] is True
        assert doc_annotate_data["total_points"] == 3
        assert "Straight Leg Raise" in doc_annotate_data["doctor_notes"]


@pytest.mark.asyncio
async def test_in_call_collaborative_teleconsent_workflow(test_setup):
    """F-11: Verify in-call teleconsent dispatch, patient digital signing, and SHA-256 seal."""
    db = test_setup
    tenant_id = "default"
    patient_id = f"pat-consent-{uuid4().hex[:6]}"
    doctor_id = f"doc-consent-{uuid4().hex[:6]}"
    appointment_id = f"appt-teleconsent-{uuid4().hex[:8]}"

    # Seed Doctor
    await db["doctors"].insert_one({
        "id": doctor_id,
        "user_id": doctor_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Priya Deshmukh",
        "specialty": "General Medicine",
        "active": True,
    })

    # Seed Appointment
    await db["appointments"].insert_one({
        "id": appointment_id,
        "tenant_id": tenant_id,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "status": "in_progress",
    })

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        doctor_headers = {"X-Dev-Doctor-Id": doctor_id, "X-Dev-Tenant-Id": tenant_id}
        patient_headers = {"X-Dev-Patient-Id": patient_id, "X-Dev-Tenant-Id": tenant_id}

        # 1. Doctor requests informed teleconsent for procedure
        request_res = await client.post(
            f"/doctor/consultations/{appointment_id}/teleconsent/request",
            headers=doctor_headers,
            json={
                "title": "Informed Consent for Telehealth Assessment & Minor Injection Protocol",
                "procedure_name": "Trigger Point Assessment & Prescribed Injection Protocol",
                "procedure_description": "Explanation of teleconsultation clinical assessment, risk mitigation, and emergency referral protocol.",
                "clauses": [
                    "I voluntary agree to remote clinical evaluation.",
                    "I confirm full disclosure of allergies and ongoing medications.",
                ],
                "risks_disclosed": ["Potential allergic hypersensitivity", "Need for immediate local ER triage if severe reaction occurs"],
                "urgency": "urgent",
            },
        )
        assert request_res.status_code == 200, request_res.text
        req_data = request_res.json()
        assert req_data["status"] == "requested"
        consent_id = req_data["consent_id"]
        assert req_data["procedure_name"] == "Trigger Point Assessment & Prescribed Injection Protocol"

        # 2. Patient queries active teleconsent request
        active_res = await client.get(
            f"/patient/consultations/{appointment_id}/teleconsent/active",
            headers=patient_headers,
        )
        assert active_res.status_code == 200, active_res.text
        active_data = active_res.json()
        assert active_data["has_active_request"] is True
        assert active_data["request"]["id"] == consent_id
        assert len(active_data["request"]["clauses"]) == 2

        # 3. Patient digitally signs and seals the teleconsent
        sign_res = await client.post(
            f"/patient/consultations/{appointment_id}/teleconsent/sign",
            headers=patient_headers,
            json={
                "consent_request_id": consent_id,
                "signature_name": "Rahul Sharma",
                "signature_data": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPg==",
                "declaration_accepted": True,
                "device_info": "Chrome on Windows 11",
            },
        )
        assert sign_res.status_code == 200, sign_res.text
        sign_data = sign_res.json()
        assert sign_data["status"] == "signed"
        assert len(sign_data["cryptographic_seal_sha256"]) == 64
        seal = sign_data["cryptographic_seal_sha256"]

        # 4. Doctor verifies teleconsent status and SHA-256 seal
        doc_status_res = await client.get(
            f"/doctor/consultations/{appointment_id}/teleconsent/status",
            headers=doctor_headers,
        )
        assert doc_status_res.status_code == 200, doc_status_res.text
        doc_status_items = doc_status_res.json()
        assert len(doc_status_items) >= 1
        signed_item = next(item for item in doc_status_items if item["id"] == consent_id)
        assert signed_item["status"] == "signed"
        assert signed_item["signature_name"] == "Rahul Sharma"
        assert signed_item["cryptographic_seal_sha256"] == seal
