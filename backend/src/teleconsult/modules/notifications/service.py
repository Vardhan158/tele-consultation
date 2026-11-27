from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from teleconsult.kernel.mongodb.client import mongo_database


def format_appointment_message(body: str, patient_display_name: str, starts_at) -> str:
    try:
        start = starts_at if isinstance(starts_at, datetime) else datetime.fromisoformat(str(starts_at).replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        local = start.astimezone(ZoneInfo("Asia/Kolkata"))
        formatted = f"{local.day:02d} {local.strftime('%b %Y at %I:%M %p')} IST".replace(" at 0", " at ")
        return f"{patient_display_name} booked an appointment for {formatted}."
    except (TypeError, ValueError):
        return body


async def queue_patient_notification(
    *args, tenant_id: UUID | str, patient_id: UUID | str, event_type: str,
    subject: str, body: str, channel: str = "in_app", **kwargs
) -> None:
    """Queue an operational notification using MongoDB."""
    await ensure_patient_notification(
        tenant_id=str(tenant_id),
        patient_id=str(patient_id),
        event_type=event_type,
        subject=subject,
        body=body,
        channel=channel,
    )


async def ensure_patient_notification(
    *,
    tenant_id: str,
    patient_id: str,
    event_type: str,
    subject: str,
    body: str,
    appointment_id: str | None = None,
    channel: str = "in_app",
) -> None:
    """Persist an in-app notification document for a patient in MongoDB idempotently."""
    try:
        database = mongo_database.database()
    except Exception:
        return
    t_id_str = str(tenant_id)
    p_id_str = str(patient_id)
    now_dt = datetime.now(UTC)

    query: dict[str, Any] = {
        "tenant_id": t_id_str,
        "event_type": event_type,
    }
    if appointment_id:
        query["appointment_id"] = str(appointment_id)
    else:
        query["recipient_id"] = p_id_str
        query["subject"] = subject

    existing = await database["notifications"].find_one(query)
    if existing:
        return

    notification_id = str(uuid4())
    doc = {
        "id": notification_id,
        "tenant_id": t_id_str,
        "recipient_id": p_id_str,
        "patient_id": p_id_str,
        "event_type": event_type,
        "subject": subject,
        "body": body,
        "channel": channel,
        "status": "queued",
        "read_at": None,
        "created_at": now_dt.isoformat(),
    }
    if appointment_id:
        doc["appointment_id"] = str(appointment_id)

    await database["notifications"].insert_one(dict(doc))

    if channel in {"whatsapp", "omnichannel"}:
        try:
            from teleconsult.adapters.whatsapp import whatsapp_client
            patient_doc = await database["patients"].find_one({"tenant_id": t_id_str, "$or": [{"id": p_id_str}, {"user_id": p_id_str}]})
            phone = (patient_doc or {}).get("phone") or (patient_doc or {}).get("mobile_number")
            if phone:
                await whatsapp_client.send_message(to_phone=phone, message=f"{subject}\n\n{body}")
        except Exception:
            pass


async def ensure_doctor_appointment_notification(*, tenant_id: str, doctor_id: str, appointment: dict, patient_display_name: str) -> None:
    """Persist exactly one doctor notification for a confirmed appointment."""
    try:
        database = mongo_database.database()
    except Exception:
        return
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
