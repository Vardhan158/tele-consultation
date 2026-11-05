"""Inactive MongoDB availability and appointment repositories."""
from datetime import datetime
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection

from teleconsult.kernel.mongodb.repository import serialize_document

ACTIVE_APPOINTMENT_STATUSES = frozenset({
    "requested", "pending_payment", "confirmed", "checked_in", "in_progress", "rescheduled",
})
FINAL_APPOINTMENT_STATUSES = frozenset({"completed", "cancelled"})


class SchedulingConflict(Exception):
    """A slot, idempotency key, or appointment state conflicts with the request."""


class AppointmentNotFound(Exception):
    pass


def ensure_status_transition(current: str, target: str) -> None:
    if current in FINAL_APPOINTMENT_STATUSES:
        raise SchedulingConflict("Final appointments cannot be changed")
    allowed = {
        "requested": ACTIVE_APPOINTMENT_STATUSES | {"cancelled"},
        "pending_payment": ACTIVE_APPOINTMENT_STATUSES | {"cancelled"},
        "confirmed": ACTIVE_APPOINTMENT_STATUSES | {"cancelled"},
        "checked_in": ACTIVE_APPOINTMENT_STATUSES | {"cancelled"},
        "in_progress": {"in_progress", "completed"},
        "rescheduled": ACTIVE_APPOINTMENT_STATUSES | {"cancelled"},
    }
    if target not in allowed.get(current, set()):
        raise SchedulingConflict("Invalid appointment status transition")


class AvailabilityMongoRepository:
    def __init__(self, collection: AsyncCollection) -> None:
        self.collection = collection

    async def create_slot(self, document: dict[str, Any], *, session=None) -> dict:
        value = serialize_document(document)
        await self.collection.insert_one(value, session=session)
        return value

    async def list_available(self, *, tenant_id: str, doctor_id: str, start: datetime | None = None, limit: int = 100) -> list[dict]:
        query: dict[str, Any] = {
            "tenant_id": tenant_id, "doctor_id": doctor_id, "status": "available",
        }
        if start is not None:
            query["starts_at"] = {"$gte": start.isoformat()}
        cursor = self.collection.find(query).sort("starts_at", 1).limit(limit)
        return [item async for item in cursor]

    async def reserve(self, *, tenant_id: str, doctor_id: str, starts_at: str, reservation_id: str, session=None) -> dict:
        slot = await self.collection.find_one_and_update(
            {
                "tenant_id": tenant_id, "doctor_id": doctor_id,
                "starts_at": starts_at, "status": "available",
            },
            {"$set": {"status": "reserved", "reservation_id": reservation_id}},
            return_document=ReturnDocument.AFTER,
            session=session,
        )
        if slot is None:
            raise SchedulingConflict("Selected appointment slot is no longer available")
        return slot

    async def release(self, *, tenant_id: str, doctor_id: str, starts_at: str, session=None) -> bool:
        result = await self.collection.update_one(
            {"tenant_id": tenant_id, "doctor_id": doctor_id, "starts_at": starts_at, "status": "reserved"},
            {"$set": {"status": "available"}, "$unset": {"reservation_id": ""}},
            session=session,
        )
        return result.modified_count == 1


class AppointmentMongoRepository:
    def __init__(self, collection: AsyncCollection, availability: AvailabilityMongoRepository, events: AsyncCollection) -> None:
        self.collection = collection
        self.availability = availability
        self.events = events

    async def book(
        self,
        *,
        appointment: dict[str, Any],
        idempotency_key: str | None,
        session=None,
    ) -> dict:
        tenant_id = str(appointment["tenant_id"])
        patient_id = str(appointment["patient_id"])
        if idempotency_key:
            existing = await self.collection.find_one({
                "tenant_id": tenant_id, "patient_id": patient_id, "idempotency_key": idempotency_key,
            }, session=session)
            if existing:
                return existing
        value = serialize_document({**appointment, "idempotency_key": idempotency_key})
        await self.availability.reserve(
            tenant_id=tenant_id,
            doctor_id=str(value["doctor_id"]),
            starts_at=str(value["starts_at"]),
            reservation_id=str(value["id"]),
            session=session,
        )
        try:
            await self.collection.insert_one(value, session=session)
            await self.events.insert_one({
                "id": f"{value['id']}:created",
                "tenant_id": tenant_id,
                "appointment_id": str(value["id"]),
                "actor_id": patient_id,
                "from_status": "draft",
                "to_status": value["status"],
                "occurred_at": datetime.utcnow().isoformat(),
            }, session=session)
        except Exception as exc:
            raise SchedulingConflict("Appointment conflicts with an existing booking") from exc
        return value

    async def list_for_patient(self, *, tenant_id: str, patient_id: str, limit: int = 100) -> list[dict]:
        cursor = self.collection.find({"tenant_id": tenant_id, "patient_id": patient_id}).sort("starts_at", -1).limit(limit)
        return [item async for item in cursor]

    async def list_for_doctor(self, *, tenant_id: str, doctor_id: str, limit: int = 100) -> list[dict]:
        cursor = self.collection.find({"tenant_id": tenant_id, "doctor_id": doctor_id}).sort("starts_at", 1).limit(limit)
        return [item async for item in cursor]

    async def cancel(self, *, tenant_id: str, appointment_id: str, actor_id: str, session=None) -> dict:
        appointment = await self.collection.find_one({
            "tenant_id": tenant_id, "id": appointment_id, "patient_id": actor_id,
        }, session=session)
        if appointment is None:
            raise AppointmentNotFound("Appointment not found")
        ensure_status_transition(appointment["status"], "cancelled")
        updated = await self.collection.find_one_and_update(
            {"tenant_id": tenant_id, "id": appointment_id, "status": appointment["status"]},
            {"$set": {"status": "cancelled", "cancellation_actor_id": actor_id}},
            return_document=ReturnDocument.AFTER,
            session=session,
        )
        await self.availability.release(
            tenant_id=tenant_id, doctor_id=str(appointment["doctor_id"]),
            starts_at=str(appointment["starts_at"]), session=session,
        )
        await self._event(appointment, actor_id, "cancelled", session=session)
        return updated

    async def _event(self, appointment: dict, actor_id: str, target: str, *, session=None) -> None:
        await self.events.insert_one({
            "id": f"{appointment['id']}:{target}:{datetime.utcnow().timestamp()}",
            "tenant_id": str(appointment["tenant_id"]),
            "appointment_id": str(appointment["id"]),
            "actor_id": actor_id,
            "from_status": appointment["status"],
            "to_status": target,
            "occurred_at": datetime.utcnow().isoformat(),
        }, session=session)
