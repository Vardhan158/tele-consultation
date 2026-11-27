"""Clinic Administrator Notification endpoints.

Supports viewing unread notifications, filtering, marking as read,
configuring reminder intervals, and triggering background expiry scans.
"""
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import token_hash
from teleconsult.modules.notifications.insurance_notifications import (
    get_notification_config,
    scan_and_notify_expiring_policies,
    scan_and_notify_pending_claims,
    update_notification_config,
)
from teleconsult.modules.notifications.schemas import (
    NotificationConfigResponse,
    NotificationResponse,
    NotificationUnreadCountResponse,
    UpdateNotificationConfigRequest,
)

router = APIRouter(prefix="/clinic-admin/notifications", tags=["clinic-admin-notifications"])


async def clinic_admin_dep(request: Request) -> MongoPrincipal:
    settings = get_settings()
    if not settings.mongodb_enabled or not mongo_database.enabled:
        raise HTTPException(503, "MongoDB clinic administration is not enabled")
    raw = request.cookies.get("teleconsult_session")
    db = mongo_database.database()

    if raw:
        session = await db["user_sessions"].find_one({
            "tenant_id": settings.default_tenant_id,
            "token_hash": token_hash(raw),
            "revoked_at": {"$exists": False},
            "expires_at": {"$gt": datetime.now(UTC)},
        })
        user = await db["users"].find_one({"tenant_id": settings.default_tenant_id, "id": session["user_id"]}) if session else None
        if user and user.get("role") == "clinic_admin":
            return MongoPrincipal(
                user_id=user["id"],
                tenant_id=user["tenant_id"],
                role=user["role"],
                clinic_id=user.get("clinic_id"),
            )

    # Local / dev test fallback fixture support
    if settings.environment in {"dev", "local"}:
        dev_role = request.headers.get("X-Dev-Role") or "clinic_admin"
        if dev_role == "clinic_admin":
            dev_user_id = request.headers.get("X-Dev-User-Id") or "admin-user"
            dev_tenant_id = request.headers.get("X-Dev-Tenant-Id") or settings.default_tenant_id
            return MongoPrincipal(
                user_id=dev_user_id,
                tenant_id=dev_tenant_id,
                role="clinic_admin",
                clinic_id=request.headers.get("X-Dev-Clinic-Id"),
            )

    raise HTTPException(401, "Authentication required as Clinic Administrator")


clinic_admin_dep._is_authz = True  # Satisfies architecture authorization guard


@router.get("", response_model=list[NotificationResponse])
async def list_clinic_admin_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    unread_only: bool = Query(default=False),
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> list[NotificationResponse]:
    """Retrieve notifications directed to clinic administrators for this tenant."""
    db = mongo_database.database()
    query: dict[str, Any] = {
        "tenant_id": principal.tenant_id,
        "$or": [
            {"recipient_role": "clinic_admin"},
            {"recipient_id": principal.user_id},
        ],
    }
    if unread_only:
        query["$or"] = [
            {"read_at": None},
            {"read": False},
        ]

    cursor = db["notifications"].find(query).sort("created_at", -1).limit(limit)
    results = []
    async for doc in cursor:
        created_val = doc.get("created_at")
        if isinstance(created_val, str):
            try:
                created_dt = datetime.fromisoformat(created_val.replace("Z", "+00:00"))
            except ValueError:
                created_dt = datetime.now(UTC)
        elif isinstance(created_val, datetime):
            created_dt = created_val
        else:
            created_dt = datetime.now(UTC)

        read_val = doc.get("read_at")
        if isinstance(read_val, str):
            try:
                read_dt = datetime.fromisoformat(read_val.replace("Z", "+00:00"))
            except ValueError:
                read_dt = None
        elif isinstance(read_val, datetime):
            read_dt = read_val
        else:
            read_dt = None

        meta = doc.get("metadata") or {}
        claim_id = doc.get("claim_id") or meta.get("claim_id")
        claim_ref = doc.get("claim_reference") or meta.get("claim_reference")
        policy_id = doc.get("policy_id") or meta.get("policy_id")

        results.append(NotificationResponse(
            id=str(doc.get("id") or doc.get("_id")),
            event_type=str(doc.get("event_type") or doc.get("type", "general")),
            channel=str(doc.get("channel", "in_app")),
            subject=str(doc.get("subject") or doc.get("title", "Notification")),
            body=str(doc.get("body") or doc.get("message", "")),
            status=str(doc.get("status", "delivered")),
            read_at=read_dt,
            created_at=created_dt,
            claim_id=claim_id,
            claim_reference=claim_ref,
            policy_id=policy_id,
            target_tab=doc.get("target_tab", "clinic-insurance"),
            target_id=claim_id or policy_id,
            delivery_status=doc.get("delivery_status", "delivered"),
            email_delivery_status=doc.get("email_delivery_status"),
            recipient_role=doc.get("recipient_role", "clinic_admin"),
            metadata=meta,
        ))

    return results


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def get_clinic_admin_unread_count(
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, int]:
    """Retrieve count of unread notifications for the clinic administrator."""
    db = mongo_database.database()
    count = await db["notifications"].count_documents({
        "tenant_id": principal.tenant_id,
        "$or": [
            {"recipient_role": "clinic_admin"},
            {"recipient_id": principal.user_id},
        ],
        "read_at": None,
        "read": {"$ne": True},
    })
    return {"unread_count": count}


@router.post("/{notification_id}/read")
async def mark_clinic_admin_notification_read(
    notification_id: str,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Mark a specific notification as read."""
    db = mongo_database.database()
    now_iso = datetime.now(UTC).isoformat()
    result = await db["notifications"].update_one(
        {
            "tenant_id": principal.tenant_id,
            "$or": [
                {"id": notification_id},
                {"id": notification_id.lower()},
            ],
        },
        {"$set": {"read_at": now_iso, "read": True, "status": "read"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "read", "id": notification_id}


@router.post("/read-all")
async def mark_all_clinic_admin_notifications_read(
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Mark all clinic administrator notifications as read for this tenant."""
    db = mongo_database.database()
    now_iso = datetime.now(UTC).isoformat()
    result = await db["notifications"].update_many(
        {
            "tenant_id": principal.tenant_id,
            "$or": [
                {"recipient_role": "clinic_admin"},
                {"recipient_id": principal.user_id},
            ],
            "read_at": None,
        },
        {"$set": {"read_at": now_iso, "read": True, "status": "read"}},
    )
    return {"status": "read", "updated_count": result.modified_count}


@router.post("/{notification_id}/retry")
async def retry_clinic_admin_notification_email(
    notification_id: str,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Retry delivering a failed notification email."""
    db = mongo_database.database()
    notif = await db["notifications"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": notification_id}, {"id": notification_id.lower()}],
    })
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    email = notif.get("recipient_email")
    if not email:
        raise HTTPException(status_code=400, detail="Notification has no recipient email address")

    from teleconsult.modules.notifications.insurance_notifications import deliver_brevo_email_safe
    status, error = await deliver_brevo_email_safe(
        recipient_email=email,
        subject=notif.get("subject") or notif.get("title", "Kaizen Care Notification"),
        body=notif.get("body") or notif.get("message", ""),
    )

    retries = int(notif.get("email_retries", 0)) + 1
    await db["notifications"].update_one(
        {"id": notif["id"]},
        {"$set": {
            "email_delivery_status": status,
            "email_error": error,
            "email_retries": retries,
            "updated_at": datetime.now(UTC).isoformat(),
        }},
    )
    return {
        "status": status,
        "retries": retries,
        "error": error,
    }


@router.get("/config", response_model=NotificationConfigResponse)
async def get_clinic_notification_config(
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Get configurable reminder and alert intervals."""
    db = mongo_database.database()
    return await get_notification_config(db, principal.tenant_id)


@router.put("/config", response_model=NotificationConfigResponse)
async def update_clinic_notification_config(
    payload: UpdateNotificationConfigRequest,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Update configurable reminder and alert intervals."""
    db = mongo_database.database()
    return await update_notification_config(db, principal.tenant_id, payload.model_dump(exclude_unset=True))


@router.post("/check-expiring-policies")
async def trigger_expiring_policies_scan(
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Scan and send reminders for policies approaching expiry."""
    db = mongo_database.database()
    dispatched = await scan_and_notify_expiring_policies(db, principal.tenant_id)
    return {
        "status": "completed",
        "reminders_dispatched": len(dispatched),
        "notifications": dispatched,
    }


@router.post("/check-pending-claims")
async def trigger_pending_claims_scan(
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Scan claims pending verification exceeding reminder threshold and notify clinic admins."""
    db = mongo_database.database()
    dispatched = await scan_and_notify_pending_claims(db, principal.tenant_id)
    return {
        "status": "completed",
        "reminders_dispatched": len(dispatched),
        "notifications": dispatched,
    }
