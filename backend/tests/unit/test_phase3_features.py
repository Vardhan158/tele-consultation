"""Unit tests for Phase 3 features:
- F-07: Queue Escalation & Clinical SLA Breach Predictor (Clinic Admin)
- F-08: Dynamic Performance-Linked Doctor Payout Tiering
- F-09: Specialty Multi-Disciplinary Virtual Board (Cross-Specialty Consult)
"""
from datetime import UTC, datetime, timedelta
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

    async def update_many(self, query, update):
        matched = 0
        for doc in self.docs:
            if self._matches(doc, query):
                matched += 1
                if "$set" in update:
                    doc.update(update["$set"])
        return type("Result", (), {"matched_count": matched})()

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
async def test_sla_queue_monitor_and_escalation(test_setup):
    """F-07: Verify SLA monitoring, predictive breach classification, and ticket reassignment."""
    db = test_setup
    tenant_id = "default"

    now = datetime.now(UTC)
    ticket_normal_id = f"test-sla-norm-{uuid4().hex[:6]}"
    ticket_warning_id = f"test-sla-warn-{uuid4().hex[:6]}"
    ticket_breached_id = f"test-sla-breach-{uuid4().hex[:6]}"

    # Seed on-duty doctor
    await db["doctors"].insert_one({
        "id": "doc-urgent-standby",
        "user_id": "doc-urgent-standby",
        "tenant_id": tenant_id,
        "full_name": "Dr. On-Duty Physician",
        "specialty": "Emergency Medicine",
        "active": True,
        "urgent_care_duty": True,
    })

    # Insert three test tickets with different wait times:
    # 1. Normal (< 10 mins ago)
    await db["urgent_care_queue"].insert_one({
        "id": ticket_normal_id,
        "tenant_id": tenant_id,
        "patient_id": "pat-01",
        "patient_name": "Normal Queue Patient",
        "chief_complaint": "Mild headache",
        "status": "waiting",
        "created_at": (now - timedelta(minutes=4)).isoformat(),
    })

    # 2. Warning (10 - 20 mins ago)
    await db["urgent_care_queue"].insert_one({
        "id": ticket_warning_id,
        "tenant_id": tenant_id,
        "patient_id": "pat-02",
        "patient_name": "Warning Queue Patient",
        "chief_complaint": "Fever for 2 days",
        "status": "waiting",
        "created_at": (now - timedelta(minutes=14)).isoformat(),
    })

    # 3. Breached (>= 20 mins ago)
    await db["urgent_care_queue"].insert_one({
        "id": ticket_breached_id,
        "tenant_id": tenant_id,
        "patient_id": "pat-03",
        "patient_name": "Breached Queue Patient",
        "chief_complaint": "Acute abdominal pain",
        "status": "waiting",
        "created_at": (now - timedelta(minutes=25)).isoformat(),
    })

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. GET /admin/sla/monitor
        res = await client.get(
            "/admin/sla/monitor",
            headers={"X-Dev-Admin-Id": "admin-super", "X-Dev-Tenant-Id": tenant_id},
        )
        assert res.status_code == 200, res.text
        data = res.json()

        assert "tickets" in data
        assert "summary" in data
        summary = data["summary"]
        assert summary["total_waiting"] >= 3
        assert summary["warning_count"] >= 1
        assert summary["breached_count"] >= 1

        # Check breach classifications
        tickets_map = {t["ticket_id"]: t for t in data["tickets"]}
        assert ticket_normal_id in tickets_map
        assert tickets_map[ticket_normal_id]["sla_status"] == "normal"
        assert tickets_map[ticket_normal_id]["breach_probability"] < 0.50

        assert ticket_warning_id in tickets_map
        assert tickets_map[ticket_warning_id]["sla_status"] == "warning"
        assert tickets_map[ticket_warning_id]["breach_probability"] >= 0.50

        assert ticket_breached_id in tickets_map
        assert tickets_map[ticket_breached_id]["sla_status"] == "breached"
        assert tickets_map[ticket_breached_id]["breach_probability"] >= 0.90
        assert "CRITICAL" in tickets_map[ticket_breached_id]["recommended_action"]

        # 2. POST /admin/sla/reassign-ticket
        reassign_res = await client.post(
            "/admin/sla/reassign-ticket",
            headers={"X-Dev-Admin-Id": "admin-super", "X-Dev-Tenant-Id": tenant_id},
            json={
                "ticket_id": ticket_breached_id,
                "target_doctor_id": "doc-urgent-standby",
                "reason": "Queue rebalance to prevent further SLA delay",
            },
        )
        assert reassign_res.status_code == 200, reassign_res.text
        reassign_data = reassign_res.json()
        assert reassign_data["status"] == "reassigned"

        # Verify updated status in database
        updated_ticket = await db["urgent_care_queue"].find_one({"id": ticket_breached_id})
        assert updated_ticket["claimed_by_doctor_id"] == "doc-urgent-standby"

        # 3. POST /admin/sla/nudge-doctor
        nudge_res = await client.post(
            "/admin/sla/nudge-doctor",
            headers={"X-Dev-Admin-Id": "admin-super", "X-Dev-Tenant-Id": tenant_id},
            json={
                "ticket_id": ticket_warning_id,
                "doctor_id": "doc-urgent-standby",
                "message": "Urgent reminder: Patient in lobby approaching 15-minute wait threshold.",
            },
        )
        assert nudge_res.status_code == 200, nudge_res.text
        assert nudge_res.json()["status"] == "nudged"


@pytest.mark.asyncio
async def test_doctor_performance_linked_payout_tier(test_setup):
    """F-08: Verify dynamic doctor payout tiering and clinic-wide performance distribution."""
    db = test_setup
    tenant_id = "default"
    doctor_id = f"doc-tier-{uuid4().hex[:6]}"

    # Setup doctor record with high punctuality and rating
    await db["doctors"].insert_one({
        "id": doctor_id,
        "user_id": doctor_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Sarah Punctual",
        "specialty": "Cardiology",
        "active": True,
        "punctuality_rate": 0.98,
        "avg_rating": 4.95,
    })

    # Record payout ledger entry
    await db["doctor_payout_ledger"].insert_one({
        "id": f"payout-{uuid4().hex[:6]}",
        "tenant_id": tenant_id,
        "doctor_id": doctor_id,
        "gross_amount_paise": 100000,  # ₹1000
        "platform_fee_paise": 15000,   # ₹150
        "tds_withheld_paise": 10000,   # ₹100
        "net_payable_paise": 75000,    # ₹750
        "created_at": datetime.now(UTC).isoformat(),
    })

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. GET /doctor/payouts/performance-tier
        res = await client.get(
            "/doctor/payouts/performance-tier",
            headers={"X-Dev-Doctor-Id": doctor_id, "X-Dev-Tenant-Id": tenant_id},
        )
        assert res.status_code == 200, res.text
        tier_data = res.json()

        assert tier_data["doctor_id"] == doctor_id
        assert tier_data["tier"] == "Platinum"
        assert tier_data["multiplier"] == 1.20
        assert tier_data["bonus_percentage"] == 20.0
        assert tier_data["base_net_payout_inr"] == 750.0
        assert tier_data["earned_performance_bonus_inr"] == 150.0  # 20% of 750
        assert tier_data["total_net_payout_inr"] == 900.0          # 750 + 150

        # 2. GET /admin/payouts/doctor-tiers
        admin_res = await client.get(
            "/admin/payouts/doctor-tiers",
            headers={"X-Dev-Admin-Id": "admin-super", "X-Dev-Tenant-Id": tenant_id},
        )
        assert admin_res.status_code == 200, admin_res.text
        admin_data = admin_res.json()
        assert "tier_distribution" in admin_data
        assert admin_data["tier_distribution"]["Platinum"] >= 1
        assert any(d["doctor_id"] == doctor_id for d in admin_data["doctors"])


@pytest.mark.asyncio
async def test_specialty_multidisciplinary_virtual_board(test_setup):
    """F-09: Verify cross-specialty virtual board consultation invite and joint clinical notes."""
    db = test_setup
    tenant_id = "default"
    primary_doctor_id = f"doc-primary-{uuid4().hex[:6]}"
    consultant_doctor_id = f"doc-oncologist-{uuid4().hex[:6]}"
    appointment_id = f"appt-{uuid4().hex[:8]}"

    await db["doctors"].insert_one({
        "id": primary_doctor_id,
        "user_id": primary_doctor_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Primary Physician",
        "specialty": "Internal Medicine",
        "active": True,
    })

    await db["doctors"].insert_one({
        "id": consultant_doctor_id,
        "user_id": consultant_doctor_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Consultant Oncologist",
        "specialty": "Medical Oncology",
        "active": True,
    })

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Primary Doctor invites secondary specialist to joint board
        invite_res = await client.post(
            f"/doctor/consultations/{appointment_id}/invite-specialist",
            headers={"X-Dev-Doctor-Id": primary_doctor_id, "X-Dev-Tenant-Id": tenant_id},
            json={
                "specialist_doctor_id": consultant_doctor_id,
                "specialty": "Medical Oncology",
                "clinical_rationale": "Patient presents with persistent lymphadenopathy; seeking joint oncology evaluation.",
                "urgency": "urgent",
            },
        )
        assert invite_res.status_code == 200, invite_res.text
        invite_data = invite_res.json()
        assert invite_data["status"] == "invited"
        assert invite_data["specialist_name"] == "Dr. Consultant Oncologist"

        # 2. Query board members
        members_res = await client.get(
            f"/doctor/consultations/{appointment_id}/board-members",
            headers={"X-Dev-Doctor-Id": primary_doctor_id, "X-Dev-Tenant-Id": tenant_id},
        )
        assert members_res.status_code == 200, members_res.text
        members = members_res.json()
        assert len(members) >= 1
        assert any(m["specialist_doctor_id"] == consultant_doctor_id for m in members)

        # 3. Consultant Specialist adds attributed clinical observation & recommendation
        note_res = await client.post(
            f"/doctor/consultations/{appointment_id}/board-notes",
            headers={"X-Dev-Doctor-Id": consultant_doctor_id, "X-Dev-Tenant-Id": tenant_id},
            json={
                "clinical_observation": "Reviewed CT scan findings; no focal pulmonary nodule identified.",
                "specialty_recommendation": "Recommend excisional biopsy of left cervical node and follow-up in 7 days.",
            },
        )
        assert note_res.status_code == 200, note_res.text
        note_data = note_res.json()
        assert note_data["author_doctor_id"] == consultant_doctor_id
        assert "excisional biopsy" in note_data["specialty_recommendation"]

        # 4. List board notes
        notes_res = await client.get(
            f"/doctor/consultations/{appointment_id}/board-notes",
            headers={"X-Dev-Doctor-Id": primary_doctor_id, "X-Dev-Tenant-Id": tenant_id},
        )
        assert notes_res.status_code == 200, notes_res.text
        notes = notes_res.json()
        assert len(notes) >= 1
        assert any("excisional biopsy" in n["specialty_recommendation"] for n in notes)
