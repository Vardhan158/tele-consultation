"""Real Atlas concurrency validation for inactive MongoDB scheduling repositories."""
import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.mongodb_policy import (
    MongoPrincipal,
    require_same_tenant,
    require_self,
)
from teleconsult.kernel.mongodb.schema import ensure_schema
from teleconsult.modules.scheduling.mongodb_repositories import (
    AppointmentMongoRepository,
    AvailabilityMongoRepository,
    SchedulingConflict,
)


async def main() -> int:
    settings = get_settings()
    if settings.mongodb_enabled or settings.mongodb_repositories_enabled:
        raise RuntimeError("Validation requires MONGODB_ENABLED=false and MONGODB_REPOSITORIES_ENABLED=false.")
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is required for real Atlas validation.")

    tenant_id = f"phase33-validation-{uuid4()}"
    doctor_id, patient_one, patient_two = (str(uuid4()) for _ in range(3))
    slot_id, rollback_slot_id, appointment_one, appointment_two = (str(uuid4()) for _ in range(4))
    starts = (datetime.now(UTC) + timedelta(hours=2)).replace(microsecond=0).isoformat()
    ends = (datetime.fromisoformat(starts) + timedelta(minutes=30)).isoformat()
    clients = [
        AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000, appname="phase33-test-one"),
        AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000, appname="phase33-test-two"),
    ]
    db = None
    result = {"successful_bookings": 0, "conflicted_bookings": 0, "active_appointments": 0}
    try:
        await clients[0].admin.command("ping")
        db = clients[0][settings.mongodb_database]
        await ensure_schema(db)
        slots = db["doctor_availability"]
        appointments = db["appointments"]
        events = db["appointment_events"]
        await slots.insert_one({
            "id": slot_id, "tenant_id": tenant_id, "doctor_id": doctor_id,
            "starts_at": starts, "ends_at": ends, "status": "available",
        })
        await slots.insert_one({
            "id": rollback_slot_id, "tenant_id": tenant_id, "doctor_id": doctor_id,
            "starts_at": (datetime.fromisoformat(starts) + timedelta(hours=1)).isoformat(),
            "ends_at": (datetime.fromisoformat(ends) + timedelta(hours=1)).isoformat(),
            "status": "available",
        })
        await db["doctors"].insert_one({
            "id": doctor_id, "tenant_id": tenant_id, "user_id": doctor_id,
            "approval_status": "approved", "active": True, "approved_for_consultation": True,
        })
        await db["patients"].insert_many([
            {"id": patient_one, "tenant_id": tenant_id, "user_id": patient_one},
            {"id": patient_two, "tenant_id": tenant_id, "user_id": patient_two},
        ])

        async def book(client, patient_id, appointment_id):
            availability = AvailabilityMongoRepository(client[settings.mongodb_database]["doctor_availability"])
            repo = AppointmentMongoRepository(
                client[settings.mongodb_database]["appointments"], availability,
                client[settings.mongodb_database]["appointment_events"],
            )
            async with client.start_session() as session:
                try:
                    async with await session.start_transaction():
                        return await repo.book(
                            appointment={
                                "id": appointment_id, "tenant_id": tenant_id, "patient_id": patient_id,
                                "doctor_id": doctor_id, "starts_at": starts, "ends_at": ends,
                                "status": "confirmed", "payment_status": "not_required",
                            },
                            idempotency_key=f"phase33-{patient_id}",
                            session=session,
                        )
                except (SchedulingConflict, DuplicateKeyError):
                    return None

        booked = await asyncio.gather(
            book(clients[0], patient_one, appointment_one),
            book(clients[1], patient_two, appointment_two),
        )
        result["successful_bookings"] = sum(item is not None for item in booked)
        result["conflicted_bookings"] = sum(item is None for item in booked)
        result["active_appointments"] = await appointments.count_documents({
            "tenant_id": tenant_id, "doctor_id": doctor_id, "starts_at": starts,
            "status": {"$in": ["requested", "pending_payment", "confirmed", "checked_in", "in_progress", "rescheduled"]},
        })
        assert result == {"successful_bookings": 1, "conflicted_bookings": 1, "active_appointments": 1}
        assert (await slots.find_one({"id": slot_id}))["status"] == "reserved"

        # A failed transaction must release its reservation.
        rollback_id = str(uuid4())
        async with clients[0].start_session() as session:
            try:
                async with await session.start_transaction():
                    availability = AvailabilityMongoRepository(slots)
                    await availability.reserve(
                        tenant_id=tenant_id, doctor_id=doctor_id,
                        starts_at=(datetime.fromisoformat(starts) + timedelta(hours=1)).isoformat(),
                        reservation_id=rollback_id, session=session,
                    )
                    raise RuntimeError("synthetic rollback")
            except RuntimeError:
                pass
        assert (await slots.find_one({"id": rollback_slot_id}))["status"] == "available"

        # Cancel the successful booking, release the slot, then rebook it.
        winner = next(item for item in booked if item is not None)
        availability = AvailabilityMongoRepository(slots)
        repo = AppointmentMongoRepository(appointments, availability, events)
        async with clients[0].start_session() as session:
            async with await session.start_transaction():
                cancelled = await repo.cancel(
                    tenant_id=tenant_id, appointment_id=winner["id"],
                    actor_id=winner["patient_id"], session=session,
                )
        assert cancelled["status"] == "cancelled"
        assert (await slots.find_one({"id": slot_id}))["status"] == "available"
        replacement = await book(clients[0], patient_two, appointment_two)
        assert replacement is not None

        # Direct repository scope guards must fail closed.
        principal = MongoPrincipal(patient_one, tenant_id, "patient")
        require_self(principal, patient_one)
        require_same_tenant(principal, tenant_id)
        for guard, value in ((require_self, patient_two), (require_same_tenant, "other-tenant")):
            try:
                guard(principal, value)
            except PermissionError:
                pass
            else:
                raise AssertionError("authorization scope bypass")

        index_info = await appointments.index_information()
        assert "uq_active_doctor_slot" in index_info
        assert index_info["uq_active_doctor_slot"]["unique"] is True
        assert "idempotency_key_1" in index_info or any("idempotency_key" in str(v["key"]) for v in index_info.values())
        print({**result, "rollback_released_reservation": True, "rebook_after_cancellation": True,
               "authorization_scope_guards": True, "active_slot_index_verified": True,
               "idempotency_index_verified": True})
        return 0
    finally:
        if db is not None:
            for collection in ("appointments", "appointment_events", "doctor_availability", "doctors", "patients"):
                await db[collection].delete_many({"tenant_id": tenant_id})
        for client in clients:
            await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
