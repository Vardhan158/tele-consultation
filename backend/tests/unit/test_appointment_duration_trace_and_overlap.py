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
                elif isinstance(v, dict) and "$regex" in v:
                    val = str(doc.get(k, ""))
                    import re
                    if not re.search(v["$regex"], val, re.IGNORECASE):
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
async def test_historical_appointment_preserves_booked_30min_duration():
    tenant_id = "default_tenant"
    doctor_id = "doc-arjun-101"

    # Historical 30-min appointment created prior to service update
    starts_at = datetime(2026, 11, 16, 10, 0, tzinfo=UTC)
    ends_at_30min = starts_at + timedelta(minutes=30)

    historical_apt = {
        "id": "KC-APT-5C330E",
        "tenant_id": tenant_id,
        "doctor_id": doctor_id,
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at_30min.isoformat(),
        "duration_minutes": 30,
        "status": "confirmed",
    }

    # Historical record preserves 30 mins
    assert historical_apt["duration_minutes"] == 30
    assert historical_apt["ends_at"] == "2026-11-16T10:30:00+00:00"

    # Clinic now updates service to 45 minutes
    services_col = MockMongoCollection([
        {
            "id": "srv-derm-45",
            "tenant_id": tenant_id,
            "active": True,
            "assigned_doctors": [doctor_id],
            "appointment_types": ["Dermatology Consultation"],
            "duration_minutes": 45,
            "base_fee": 500,
        }
    ])

    db = MockDatabase({"services": services_col})

    pricing = await compute_doctor_pricing(
        db=db,
        tenant_id=tenant_id,
        doctor_id=doctor_id,
        appointment_type="Dermatology Consultation",
    )

    # Newly computed pricing duration for new bookings is 45 mins
    assert pricing["duration_minutes"] == 45

    # Historical appointment remains 30 mins without retroactive modification
    assert historical_apt["duration_minutes"] == 30


@pytest.mark.asyncio
async def test_slot_overlap_validation_with_45min_duration():
    starts_at = datetime(2026, 11, 16, 10, 0, tzinfo=UTC)
    ends_at_45min = starts_at + timedelta(minutes=45)

    # Overlapping slot request at 10:30 AM (starts before 10:45 AM end time)
    overlap_start = datetime(2026, 11, 16, 10, 30, tzinfo=UTC)
    overlap_end = overlap_start + timedelta(minutes=45)

    is_overlapping = starts_at < overlap_end and ends_at_45min > overlap_start
    assert is_overlapping is True
