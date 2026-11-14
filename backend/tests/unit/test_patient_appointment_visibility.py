from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.consultation import doctor_routes, video_routes
from teleconsult.modules.patient_portal import routes
from teleconsult.modules.patient_portal.appointment_access import join_eligible

NOW = datetime(2026, 11, 16, 4, 30, tzinfo=UTC)
PATIENT = "00000000-0000-0000-0000-000000000003"
DOCTOR = "00000000-0000-0000-0000-000000000002"


def matches(document, query):
    for key, value in query.items():
        if key == "$or":
            if not any(matches(document, clause) for clause in value):
                return False
        elif isinstance(value, dict) and "$in" in value:
            if document.get(key) not in value["$in"]:
                return False
        elif document.get(key) != value:
            return False
    return True


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *args):
        return self

    async def to_list(self, count):
        return deepcopy(self.rows if count is None else self.rows[:count])


class Collection:
    def __init__(self, rows):
        self.rows = rows

    def find(self, query):
        return Cursor([row for row in self.rows if matches(row, query)])

    async def find_one(self, query, **kwargs):
        return next((deepcopy(row) for row in self.rows if matches(row, query)), None)

    async def insert_one(self, document):
        self.rows.append(deepcopy(document))


@pytest.fixture
def portal(monkeypatch):
    appointment = dict(id="apt-45bde4b19136", tenant_id="1", patient_id=PATIENT,
                       doctor_id=DOCTOR, starts_at="2026-11-16T04:30:00Z",
                       status="confirmed", payment_status="captured", fee_paise=47500)
    rows = {
        "appointments": [appointment],
        "patients": [],
        "users": [dict(id=PATIENT, tenant_id="1")],
        "doctors": [dict(id=DOCTOR, tenant_id="1", full_name="Test Doctor", active=True,
                         approval_status="approved")],
        "payments": [], "clinic_settings": [],
    }
    db = {key: Collection(value) for key, value in rows.items()}
    monkeypatch.setattr(routes.mongo_database, "database", lambda: db)
    settings = SimpleNamespace(mongodb_enabled=True, video_join_window_minutes=15)
    for module in (routes, video_routes, doctor_routes):
        monkeypatch.setattr(module, "get_settings", lambda: settings)
    principal = Principal(PATIENT, "1", frozenset({"patient"}), frozenset({"appointment:read", "consultation:join"}))
    return rows, principal


async def test_non_uuid_booking_visible_and_matches_doctor(portal):
    rows, principal = portal
    before = deepcopy(rows)
    patient = (await routes.list_appointments(None, principal))[0]
    doctor = (await doctor_routes.doctor_appointments(None, Principal(DOCTOR, "1", frozenset({"doctor"}), frozenset())))[0]
    assert patient.id == doctor["id"] == "apt-45bde4b19136"
    assert str(patient.patient_id) == doctor["patient_id"] == PATIENT
    assert patient.status == doctor["status"] == "confirmed"
    assert patient.payment_status == doctor["raw_payment_status"] == "captured"
    assert patient.starts_at == doctor["starts_at"] == NOW
    assert patient.ends_at == doctor["ends_at"] == NOW + timedelta(minutes=30)
    assert patient.join_window_minutes == 15
    assert rows == before  # Listing cannot create appointments or change payments.


@pytest.mark.parametrize("status", ["confirmed", "completed", "cancelled", "pending_payment", "checked_in", "in_progress", "no_show", "CONFIRMED"])
@pytest.mark.parametrize("start", ["2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z"])
async def test_listing_does_not_drop_status_or_time(portal, status, start):
    rows, principal = portal
    rows["appointments"][0].update(status=status, starts_at=start)
    result = await routes.list_appointments(None, principal)
    assert len(result) == 1
    assert result[0].status == status.lower()


async def test_identity_and_tenant_isolation(portal):
    rows, principal = portal
    original = rows["appointments"][0]
    rows["appointments"].extend([dict(original, id="other-owner", patient_id="other"),
                                  dict(original, id="other-tenant", tenant_id="2")])
    assert [a.id for a in await routes.list_appointments(None, principal)] == [original["id"]]


async def test_explicit_patient_profile_link(portal):
    rows, principal = portal
    rows["patients"].append(dict(id="patient-profile", user_account_id=PATIENT, tenant_id="1"))
    rows["appointments"][0]["patient_id"] = "patient-profile"
    assert (await routes.list_appointments(None, principal))[0].patient_id == "patient-profile"


async def test_payment_information_agrees_between_portals(portal):
    rows, principal = portal
    rows["payments"].append(dict(appointment_id="apt-45bde4b19136", tenant_id="1", status="refunded"))
    patient = (await routes.list_appointments(None, principal))[0]
    doctor = (await doctor_routes.doctor_appointments(None, Principal(DOCTOR, "1", frozenset({"doctor"}), frozenset())))[0]
    assert patient.payment_status == doctor["raw_payment_status"] == "refunded"


async def test_mongodb_doctor_notes_support_legacy_appointment_id(portal, monkeypatch):
    from teleconsult.modules.consultation import doctor_routes

    rows, _ = portal
    rows["clinical_notes"] = [{
        "id": "note-1",
        "tenant_id": "1",
        "doctor_id": DOCTOR,
        "appointment_id": "apt-45bde4b19136",
        "status": "draft",
        "content_reference": "Follow up",
        "created_at": "2026-11-16T04:30:00Z",
    }]
    db = {key: Collection(value) for key, value in rows.items()}
    monkeypatch.setattr(doctor_routes.mongo_database, "database", lambda: db)
    monkeypatch.setattr(doctor_routes, "get_settings", lambda: SimpleNamespace(mongodb_enabled=True))
    principal = Principal(DOCTOR, "1", frozenset({"doctor"}), frozenset({"clinical:read"}))
    assert await doctor_routes.appointment_notes("apt-45bde4b19136", None, principal) == [{
        "id": "note-1", "status": "draft", "content_reference": "Follow up", "created_at": "2026-11-16T04:30:00Z",
    }]


async def test_mongodb_doctor_can_save_note_for_legacy_appointment_id(portal, monkeypatch):
    from teleconsult.modules.consultation import doctor_routes

    rows, _ = portal
    rows["appointments"][0]["status"] = "completed"
    rows["clinical_notes"] = []
    db = {key: Collection(value) for key, value in rows.items()}
    monkeypatch.setattr(doctor_routes.mongo_database, "database", lambda: db)
    monkeypatch.setattr(doctor_routes, "get_settings", lambda: SimpleNamespace(mongodb_enabled=True))
    principal = Principal(DOCTOR, "1", frozenset({"doctor"}), frozenset({"clinical:write"}))
    result = await doctor_routes.save_note(
        "apt-45bde4b19136",
        doctor_routes.NotePayload(content_reference="Diagnosis:\nViral URI"),
        None,
        principal,
    )
    assert result["status"] == "draft"
    assert db["clinical_notes"].rows[0]["consultation_id"] == "apt-45bde4b19136"


@pytest.mark.parametrize("change", [{"id": "missing"}, {"patient_id": "other"}, {"tenant_id": "2"}])
async def test_join_not_found_never_creates_appointment(portal, change):
    rows, principal = portal
    rows["appointments"][0].update(change)
    before = deepcopy(rows)
    with pytest.raises(HTTPException) as error:
        await video_routes.join_waiting_room("apt-45bde4b19136", None, principal)
    assert error.value.status_code == 404
    assert rows == before


@pytest.mark.parametrize("change,code", [({"payment_status": "pending"}, 402),
    ({"status": "cancelled"}, 409), ({"status": "completed"}, 409),
    ({"starts_at": "2035-01-01T00:00:00Z"}, 409), ({"starts_at": "invalid"}, 409)])
async def test_join_enforces_status_payment_and_time(portal, change, code):
    rows, principal = portal
    rows["appointments"][0].update(change)
    with pytest.raises(HTTPException) as error:
        await video_routes.join_waiting_room("apt-45bde4b19136", None, principal)
    assert error.value.status_code == code


@pytest.mark.parametrize("offset,eligible", [(-16, False), (-15, True), (0, True), (30, True), (31, False)])
def test_configured_join_window(offset, eligible):
    appointment = dict(status="confirmed", starts_at="2026-11-16T10:00:00+05:30")
    assert join_eligible(appointment, "captured", NOW + timedelta(minutes=offset), 15) is eligible


def test_naive_mongo_datetime_is_utc():
    assert join_eligible(dict(status="confirmed", starts_at=NOW.replace(tzinfo=None)), "captured", NOW, 15)


async def test_http_listing_authentication_permissions_and_serialization(portal):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    from teleconsult.kernel.authz.policy import get_principal

    _, principal = portal
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[routes.patient_session] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/patient/appointments")).status_code == 401
        app.dependency_overrides[get_principal] = lambda: principal
        response = await client.get("/patient/appointments")
        assert response.status_code == 200
        assert response.json()[0]["id"] == "apt-45bde4b19136"
        app.dependency_overrides[get_principal] = lambda: Principal(PATIENT, "1", frozenset(), frozenset())
        assert (await client.get("/patient/appointments")).status_code == 403


async def test_eligible_join_uses_existing_booking_without_payment_changes(portal, monkeypatch):
    from unittest.mock import AsyncMock

    rows, principal = portal
    rows["appointments"][0]["starts_at"] = datetime.now(UTC).isoformat()
    rows["patients"].append(dict(id="profile", user_account_id=PATIENT, tenant_id="1"))
    rows["appointments"][0]["patient_id"] = "profile"
    before = deepcopy(rows)
    videos = Collection([])
    videos.insert_one = AsyncMock()
    videos.update_one = AsyncMock()
    routes.mongo_database.database()["video_sessions"] = videos
    result = await video_routes.join_waiting_room("apt-45bde4b19136", None, principal)
    assert result.room_id == "teleconsult-apt-45bde4b19136"
    videos.insert_one.assert_awaited_once()
    assert rows == before
