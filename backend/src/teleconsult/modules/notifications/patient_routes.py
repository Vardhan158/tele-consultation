import hashlib
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.notifications.models import Notification
from teleconsult.modules.notifications.schemas import NotificationResponse
from teleconsult.modules.notifications.service import ensure_patient_notification

router = APIRouter(prefix="/patient/notifications", tags=["notifications"])


def _to_uuid(val: Any) -> UUID:
    if isinstance(val, UUID):
        return val
    val_str = str(val or "")
    if len(val_str) == 36:
        try:
            return UUID(val_str)
        except ValueError:
            pass
    raw_bytes = hashlib.md5(val_str.encode(), usedforsecurity=False).digest()
    return UUID(bytes=raw_bytes)


async def _resolve_patient_ids(db: Any, tenant_id: str, user_id: str) -> list[str]:
    patient_ids = [str(user_id)]
    patient_doc = await db["patients"].find_one({
        "tenant_id": str(tenant_id),
        "$or": [
            {"id": str(user_id)},
            {"user_id": str(user_id)},
            {"user_account_id": str(user_id)},
        ],
    })
    if patient_doc:
        for k in ("id", "user_id", "user_account_id"):
            val = patient_doc.get(k)
            if val and str(val) not in patient_ids:
                patient_ids.append(str(val))

    user_doc = await db["users"].find_one({
        "tenant_id": str(tenant_id),
        "$or": [
            {"id": str(user_id)},
            {"user_id": str(user_id)},
        ],
    })
    if user_doc:
        for k in ("id", "user_id"):
            val = user_doc.get(k)
            if val and str(val) not in patient_ids:
                patient_ids.append(str(val))

    all_ids = []
    for pid in patient_ids:
        all_ids.extend([pid, pid.lower(), pid.upper()])
    return list(set(all_ids))


async def notification_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
) -> list[NotificationResponse]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

        # Backfill notifications for confirmed/paid appointments and verified payments
        appointments = await db["appointments"].find({
            "tenant_id": str(principal.tenant_id),
            "patient_id": {"$in": patient_ids},
            "status": {"$in": ["confirmed", "checked_in", "in_progress", "completed"]},
        }).to_list(500)

        for apt in appointments:
            apt_id = str(apt.get("id"))
            doc_id = str(apt.get("doctor_id"))
            doctor_name = "your clinician"
            if doc_id:
                doc_record = await db["doctors"].find_one({
                    "tenant_id": str(principal.tenant_id),
                    "$or": [{"id": doc_id}, {"user_id": doc_id}],
                })
                if doc_record:
                    doctor_name = doc_record.get("full_name") or doctor_name

            raw_start = apt.get("starts_at")
            time_str = "the scheduled time"
            if raw_start:
                try:
                    start_dt = raw_start if isinstance(raw_start, datetime) else datetime.fromisoformat(str(raw_start).replace("Z", "+00:00"))
                    if start_dt.tzinfo is None:
                        start_dt = start_dt.replace(tzinfo=UTC)
                    time_str = start_dt.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%b %d, %Y at %I:%M %p IST")
                except (ValueError, TypeError):
                    time_str = str(raw_start)

            await ensure_patient_notification(
                tenant_id=principal.tenant_id,
                patient_id=principal.user_id,
                event_type="appointment_confirmed",
                subject="Appointment Booking Confirmed",
                body=f"Your appointment with {doctor_name} for {time_str} is booked and confirmed.",
                appointment_id=apt_id,
            )

            if apt.get("payment_status") in {"captured", "success", "paid"} or apt.get("fee_paise") is not None:
                fee_paise = apt.get("fee_paise") or apt.get("total_payable_paise") or 0
                fee_str = f"₹{(fee_paise / 100.0):.2f}" if fee_paise else "verified payment"
                await ensure_patient_notification(
                    tenant_id=principal.tenant_id,
                    patient_id=principal.user_id,
                    event_type="payment_success",
                    subject="Payment Verified",
                    body=f"Your payment of {fee_str} for appointment {apt_id} was successfully verified.",
                    appointment_id=apt_id,
                )

        documents = await db["notifications"].find({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"recipient_id": {"$in": patient_ids}},
                {"patient_id": {"$in": patient_ids}},
            ],
        }).sort("created_at", -1).to_list(100)

        results = []
        for doc in documents:
            try:
                created_at_val = doc.get("created_at")
                if isinstance(created_at_val, str):
                    try:
                        created_at_dt = datetime.fromisoformat(created_at_val.replace("Z", "+00:00"))
                    except ValueError:
                        created_at_dt = datetime.now(UTC)
                elif isinstance(created_at_val, datetime):
                    created_at_dt = created_at_val
                else:
                    created_at_dt = datetime.now(UTC)

                read_at_val = doc.get("read_at")
                if isinstance(read_at_val, str):
                    try:
                        read_at_dt = datetime.fromisoformat(read_at_val.replace("Z", "+00:00"))
                    except ValueError:
                        read_at_dt = None
                elif isinstance(read_at_val, datetime):
                    read_at_dt = read_at_val
                else:
                    read_at_dt = None

                nid_str = str(doc.get("id") or doc.get("_id") or uuid4())
                results.append(NotificationResponse(
                    id=_to_uuid(nid_str),
                    event_type=str(doc.get("event_type", "general")),
                    channel=str(doc.get("channel", "in_app")),
                    subject=str(doc.get("subject", "Notification")),
                    body=str(doc.get("body", "")),
                    status=str(doc.get("status", "queued")),
                    read_at=read_at_dt,
                    created_at=created_at_dt,
                    doctor_id=str(doc.get("doctor_id")) if doc.get("doctor_id") else None,
                    appointment_id=str(doc.get("appointment_id")) if doc.get("appointment_id") else None,
                    patient_display_name=doc.get("patient_display_name"),
                    notification_type=doc.get("notification_type"),
                    appointment_starts_at=doc.get("appointment_starts_at"),
                ))
            except Exception as exc:
                import logging
                logging.getLogger("teleconsult.notifications").exception(f"Error parsing notification item: {exc}")
                continue

        return results

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(Notification).where(
        Notification.tenant_id == UUID(principal.tenant_id), Notification.patient_id == UUID(principal.user_id)
    ).order_by(Notification.created_at.desc()).limit(100))
    return [
        NotificationResponse(
            id=n.id,
            event_type=n.event_type,
            channel=n.channel,
            subject=n.subject,
            body=n.body,
            status=n.status,
            read_at=n.read_at,
            created_at=n.created_at,
        )
        for n in result
    ]


@router.post("/read-all")
async def mark_all_read(
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
) -> dict[str, str]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
        now = datetime.now(UTC)
        await db["notifications"].update_many(
            {
                "tenant_id": str(principal.tenant_id),
                "$or": [
                    {"recipient_id": {"$in": patient_ids}},
                    {"patient_id": {"$in": patient_ids}},
                ],
                "read_at": None,
            },
            {"$set": {"read_at": now.isoformat(), "status": "read"}},
        )
        return {"status": "read"}
    return {"status": "read"}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
) -> dict[str, str]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
        nid_str = str(notification_id)
        now = datetime.now(UTC)

        await db["notifications"].update_one(
            {
                "tenant_id": str(principal.tenant_id),
                "$or": [
                    {"recipient_id": {"$in": patient_ids}},
                    {"patient_id": {"$in": patient_ids}},
                ],
                "$or": [
                    {"id": nid_str},
                    {"id": nid_str.lower()},
                ],
            },
            {"$set": {"read_at": now.isoformat(), "status": "read"}},
        )
        return {"status": "read"}
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    n_uuid = _to_uuid(notification_id)
    notification = await session.scalar(select(Notification).where(
        Notification.id == n_uuid, Notification.tenant_id == UUID(principal.tenant_id),
        Notification.patient_id == UUID(principal.user_id)
    ))
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read_at = datetime.now(UTC)
    return {"status": "read"}


@router.post("/{notification_id}/retry")
async def retry_notification(
    notification_id: str,
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:retry")),
) -> dict[str, str | int]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
        nid_str = str(notification_id)

        notification = await db["notifications"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"recipient_id": {"$in": patient_ids}},
                {"patient_id": {"$in": patient_ids}},
            ],
            "$or": [
                {"id": nid_str},
                {"id": nid_str.lower()},
            ],
        })
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        if notification.get("status") not in {"failed", "retryable"}:
            raise HTTPException(status_code=409, detail="Notification is not eligible for retry")
        retry_count = int(notification.get("retry_count", 0)) + 1
        await db["notifications"].update_one({"_id": notification["_id"]}, {"$set": {"status": "queued", "retry_count": retry_count}})
        return {"status": "queued", "retry_count": retry_count}
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    n_uuid = _to_uuid(notification_id)
    notification = await session.scalar(select(Notification).where(
        Notification.id == n_uuid, Notification.tenant_id == UUID(principal.tenant_id),
        Notification.patient_id == UUID(principal.user_id)
    ))
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.status not in {"failed", "retryable"}:
        raise HTTPException(status_code=409, detail="Notification is not eligible for retry")
    notification.status = "queued"
    notification.retry_count += 1
    return {"status": notification.status, "retry_count": notification.retry_count}
