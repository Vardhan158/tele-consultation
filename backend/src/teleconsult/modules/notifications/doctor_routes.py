from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.notifications.schemas import NotificationResponse

router = APIRouter(prefix="/doctor/notifications", tags=["notifications"])


async def notification_session():
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


@router.get("", response_model=list[NotificationResponse])
async def list_doctor_notifications(
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
):
    if get_settings().mongodb_enabled:
        cursor = mongo_database.database()["notifications"].find(
            {"tenant_id": principal.tenant_id, "recipient_id": principal.user_id}
        ).sort("created_at", -1).limit(100)
        return [NotificationResponse.model_validate(document) async for document in cursor]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    # SQL notifications predate doctor recipients; never broaden this query to another user.
    return []


@router.post("/read-all")
async def mark_all_doctor_notifications_read(
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
):
    if get_settings().mongodb_enabled:
        result = await mongo_database.database()["notifications"].update_many(
            {"tenant_id": principal.tenant_id, "recipient_id": principal.user_id, "read_at": None},
            {"$set": {"read_at": datetime.now(UTC)}},
        )
        return {"status": "read", "updated": result.modified_count}
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    return {"status": "read", "updated": 0}


@router.post("/{notification_id}/read")
async def mark_doctor_notification_read(
    notification_id: UUID,
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
):
    if get_settings().mongodb_enabled:
        result = await mongo_database.database()["notifications"].update_one(
            {"id": str(notification_id), "tenant_id": principal.tenant_id, "recipient_id": principal.user_id},
            {"$set": {"read_at": datetime.now(UTC)}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"status": "read"}
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    raise HTTPException(status_code=404, detail="Notification not found")
