from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.notifications.schemas import NotificationResponse
from teleconsult.modules.notifications.service import format_appointment_message

router = APIRouter(prefix="/doctor/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_doctor_notifications(
    principal: Principal = Depends(require("notification:read")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    cursor = mongo_database.database()["notifications"].find(
        {"tenant_id": principal.tenant_id, "recipient_id": principal.user_id}
    ).sort("created_at", -1).limit(100)
    results = []
    async for document in cursor:
        if document.get("notification_type") == "APPOINTMENT_CONFIRMED" and document.get("appointment_starts_at"):
            document = dict(document)
            document["body"] = format_appointment_message(
                document.get("body", ""), document.get("patient_display_name") or "Patient", document["appointment_starts_at"]
            )
        results.append(NotificationResponse.model_validate(document))
    return results


@router.post("/read-all")
async def mark_all_doctor_notifications_read(
    principal: Principal = Depends(require("notification:read")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    result = await mongo_database.database()["notifications"].update_many(
        {"tenant_id": principal.tenant_id, "recipient_id": principal.user_id, "read_at": None},
        {"$set": {"read_at": datetime.now(UTC)}},
    )
    return {"status": "read", "updated": result.modified_count}


@router.post("/{notification_id}/read")
async def mark_doctor_notification_read(
    notification_id: UUID | str,
    principal: Principal = Depends(require("notification:read")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    result = await mongo_database.database()["notifications"].update_one(
        {"id": str(notification_id), "tenant_id": principal.tenant_id, "recipient_id": principal.user_id},
        {"$set": {"read_at": datetime.now(UTC)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "read"}
