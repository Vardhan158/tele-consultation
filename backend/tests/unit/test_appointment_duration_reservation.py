from datetime import UTC, datetime, timedelta
import pytest
from teleconsult.modules.patient_portal.routes import compute_doctor_pricing


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

    def find(self, query):
        filtered = []
        for doc in self._data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$regex" in v:
                    val = str(doc.get(k, ""))
                    import re
                    if not re.search(v["$regex"], val, re.IGNORECASE):
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                filtered.append(doc)

        class Cursor:
            def __init__(self, items):
                self.items = items

            async def to_list(self, limit):
                return self.items[:limit]

        return Cursor(filtered)


class MockDatabase:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MockMongoCollection()
        return self._collections[name]


@pytest.mark.asyncio
async def test_compute_doctor_pricing_returns_configured_45min_duration():
    tenant_id = "default_tenant"
    doctor_id = "doc-arjun-101"

    # Clinic configures a 45-minute consultation service
    services_col = MockMongoCollection([
        {
            "id": "srv-45min",
            "tenant_id": tenant_id,
            "active": True,
            "assigned_doctors": [doctor_id],
            "appointment_types": ["First Consultation"],
            "base_fee": 500,
            "platform_fee": 0,
            "duration_minutes": 45,
            "currency": "INR",
        }
    ])

    db = MockDatabase({"services": services_col})

    pricing = await compute_doctor_pricing(
        db=db,
        tenant_id=tenant_id,
        doctor_id=doctor_id,
        appointment_type="First Consultation",
    )

    assert pricing["duration_minutes"] == 45
    assert pricing["base_fee_paise"] == 50000

    starts_at = datetime.now(UTC)
    dur = timedelta(minutes=pricing["duration_minutes"])
    ends_at = starts_at + dur

    # Verify that the reserved slot duration is exactly 45 minutes
    assert (ends_at - starts_at).total_seconds() / 60.0 == 45.0
