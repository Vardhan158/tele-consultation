from datetime import datetime, UTC
from uuid import UUID

from collections.abc import AsyncIterator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.config.settings import get_settings
from teleconsult.modules.notifications.models import Notification
from teleconsult.modules.notifications.schemas import NotificationResponse

router = APIRouter(prefix="/patient/notifications", tags=["notifications"])


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
) -> list[Notification]:
    if get_settings().mongodb_enabled:
        database = mongo_database.database()
        documents = database["notifications"].find({
            "tenant_id": principal.tenant_id, "recipient_id": principal.user_id,
        }).sort("created_at", -1).limit(100)
        return [NotificationResponse.model_validate(document) for document in [document async for document in documents]]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(Notification).where(
        Notification.tenant_id == UUID(principal.tenant_id), Notification.patient_id == UUID(principal.user_id)
    ).order_by(Notification.created_at.desc()).limit(100))
    return list(result)


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:read")),
) -> dict[str, str]:
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
    notification = await session.scalar(select(Notification).where(
        Notification.id == notification_id, Notification.tenant_id == UUID(principal.tenant_id),
        Notification.patient_id == UUID(principal.user_id)
    ))
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read_at = datetime.now(UTC)
    return {"status": "read"}


@router.post("/{notification_id}/retry")
async def retry_notification(
    notification_id: UUID,
    session: AsyncSession | None = Depends(notification_session),
    principal: Principal = Depends(require("notification:retry")),
) -> dict[str, str | int]:
    if get_settings().mongodb_enabled:
        collection = mongo_database.database()["notifications"]
        notification = await collection.find_one({
            "id": str(notification_id), "tenant_id": principal.tenant_id,
            "recipient_id": principal.user_id,
        })
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        if notification.get("status") not in {"failed", "retryable"}:
            raise HTTPException(status_code=409, detail="Notification is not eligible for retry")
        retry_count = int(notification.get("retry_count", 0)) + 1
        await collection.update_one({"_id": notification["_id"]}, {"$set": {"status": "queued", "retry_count": retry_count}})
        return {"status": "queued", "retry_count": retry_count}
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    notification = await session.scalar(select(Notification).where(
        Notification.id == notification_id, Notification.tenant_id == UUID(principal.tenant_id),
        Notification.patient_id == UUID(principal.user_id)
    ))
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.status not in {"failed", "retryable"}:
        raise HTTPException(status_code=409, detail="Notification is not eligible for retry")
    notification.status = "queued"
    notification.retry_count += 1
    return {"status": notification.status, "retry_count": notification.retry_count}
