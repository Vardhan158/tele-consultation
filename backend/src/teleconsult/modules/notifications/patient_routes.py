import hashlib
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.notifications.schemas import (
    NotificationResponse,
    NotificationUnreadCountResponse,
)
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


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    principal: Principal = Depends(require("notification:read")),
) -> list[NotificationResponse]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

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

            nid_raw = str(doc.get("id") or doc.get("_id") or uuid4())
            uuid_obj = _to_uuid(nid_raw)
            uuid_str = str(uuid_obj)
            if doc.get("id") != uuid_str:
                try:
                    await db["notifications"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"id": uuid_str}},
                    )
                except Exception:
                    pass

            meta = doc.get("metadata") or {}
            claim_id = doc.get("claim_id") or meta.get("claim_id")
            claim_ref = doc.get("claim_reference") or meta.get("claim_reference")
            policy_id = doc.get("policy_id") or meta.get("policy_id")
            raw_event = str(doc.get("event_type") or doc.get("type", "general"))
            target_tab = doc.get("target_tab") or ("my-insurance" if (claim_id or policy_id or "insurance" in raw_event or "claim" in raw_event) else None)

            results.append(NotificationResponse(
                id=uuid_obj,
                event_type=raw_event,
                channel=str(doc.get("channel", "in_app")),
                subject=str(doc.get("subject") or doc.get("title", "Notification")),
                body=str(doc.get("body") or doc.get("message", "")),
                status=str(doc.get("status", "delivered")),
                read_at=read_at_dt,
                created_at=created_at_dt,
                doctor_id=str(doc.get("doctor_id")) if doc.get("doctor_id") else None,
                appointment_id=str(doc.get("appointment_id") or meta.get("appointment_id")) if (doc.get("appointment_id") or meta.get("appointment_id")) else None,
                patient_display_name=doc.get("patient_display_name"),
                notification_type=doc.get("notification_type"),
                appointment_starts_at=doc.get("appointment_starts_at"),
                claim_id=claim_id,
                claim_reference=claim_ref,
                policy_id=policy_id,
                target_tab=target_tab,
                target_id=claim_id or policy_id,
                delivery_status=doc.get("delivery_status", "delivered"),
                email_delivery_status=doc.get("email_delivery_status"),
                recipient_role="patient",
                metadata=meta,
            ))
        except Exception as exc:
            import logging
            logging.getLogger("teleconsult.notifications").exception(f"Error parsing notification item: {exc}")
            continue

    return results


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def get_patient_unread_count(
    principal: Principal = Depends(require("notification:read")),
) -> dict[str, int]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    count = await db["notifications"].count_documents({
        "tenant_id": str(principal.tenant_id),
        "$or": [
            {"recipient_id": {"$in": patient_ids}},
            {"patient_id": {"$in": patient_ids}},
        ],
        "read_at": None,
        "read": {"$ne": True},
    })
    return {"unread_count": count}


@router.post("/read-all")
async def mark_all_read(
    session: Any | None = None,
    principal: Principal = Depends(require("notification:read")),
) -> dict[str, str]:
    if not get_settings().mongodb_enabled and not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
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


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    principal: Principal = Depends(require("notification:read")),
) -> dict[str, str]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    nid_str = str(notification_id)
    now = datetime.now(UTC)

    result = await db["notifications"].update_one(
        {
            "tenant_id": str(principal.tenant_id),
            "id": {"$in": [nid_str, nid_str.lower()]},
            "$or": [
                {"recipient_id": {"$in": patient_ids}},
                {"patient_id": {"$in": patient_ids}},
            ],
        },
        {"$set": {"read_at": now.isoformat(), "status": "read"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "read"}


@router.post("/{notification_id}/retry")
async def retry_notification(
    notification_id: str,
    principal: Principal = Depends(require("notification:retry")),
) -> dict[str, str | int]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    nid_str = str(notification_id)

    notification = await db["notifications"].find_one({
        "tenant_id": str(principal.tenant_id),
        "id": {"$in": [nid_str, nid_str.lower()]},
        "$or": [
            {"recipient_id": {"$in": patient_ids}},
            {"patient_id": {"$in": patient_ids}},
        ],
    })
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.get("status") not in {"failed", "retryable"}:
        raise HTTPException(status_code=409, detail="Notification is not eligible for retry")
    retry_count = int(notification.get("retry_count", 0)) + 1
    await db["notifications"].update_one({"_id": notification["_id"]}, {"$set": {"status": "queued", "retry_count": retry_count}})
    return {"status": "queued", "retry_count": retry_count}
