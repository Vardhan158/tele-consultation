from datetime import UTC, datetime
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.modules.notifications.models import Notification
from teleconsult.kernel.mongodb.client import mongo_database


def queue_patient_notification(
    session: AsyncSession, *, tenant_id: UUID, patient_id: UUID, event_type: str,
    subject: str, body: str, channel: str = "in_app",
) -> Notification:
    """Queue an operational notification; delivery is deliberately independent of core state."""
    notification = Notification(tenant_id=tenant_id, patient_id=patient_id, event_type=event_type,
        subject=subject, body=body, channel=channel, status="queued")
    session.add(notification)
    return notification


async def ensure_doctor_appointment_notification(*, tenant_id: str, doctor_id: str, appointment: dict, patient_display_name: str) -> None:
    """Persist exactly one doctor notification for a confirmed appointment."""
    if not mongo_database.enabled:
        return
    database = mongo_database.database()
    raw_start = appointment.get("starts_at")
    try:
        start = raw_start if isinstance(raw_start, datetime) else datetime.fromisoformat(str(raw_start).replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        appointment_time = start.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %b %Y, %I:%M %p IST")
    except (TypeError, ValueError):
        appointment_time = "the scheduled time (IST)"
    await database["notifications"].update_one(
        {"tenant_id": str(tenant_id), "recipient_id": str(doctor_id), "appointment_id": str(appointment.get("id")), "notification_type": "APPOINTMENT_CONFIRMED"},
        {"$setOnInsert": {
            "id": str(uuid4()), "tenant_id": str(tenant_id), "recipient_id": str(doctor_id),
            "doctor_id": str(doctor_id), "appointment_id": str(appointment.get("id")),
            "appointment_starts_at": appointment.get("starts_at"),
            "patient_display_name": patient_display_name, "notification_type": "APPOINTMENT_CONFIRMED",
            "event_type": "appointment_confirmed", "channel": "in_app", "subject": "Appointment confirmed",
            "body": f"{patient_display_name} booked an appointment for {appointment_time}.",
            "status": "queued", "read_at": None, "created_at": datetime.now(UTC),
        }},
        upsert=True,
    )
