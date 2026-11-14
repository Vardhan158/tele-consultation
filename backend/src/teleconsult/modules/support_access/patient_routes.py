from collections.abc import AsyncIterator
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.notifications.models import Notification
from teleconsult.modules.notifications.service import queue_patient_notification
from teleconsult.modules.support_access.patient_models import FollowUpAction, SupportTicket

router = APIRouter(prefix="/patient", tags=["follow-up-support"])


async def followup_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


class SupportTicketCreate(BaseModel):
    category: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=2, max_length=2000)


class SupportTicketResponse(SupportTicketCreate):
    id: UUID
    status: str


class FollowUpResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    appointment_id: UUID
    advice: str
    status: str
    next_appointment_id: UUID | None
    created_at: datetime


@router.get("/follow-up", response_model=list[FollowUpResponse])
async def follow_up(session: AsyncSession | None = Depends(followup_session), principal: Principal = Depends(require("followup:read"))) -> list[FollowUpAction]:
    if get_settings().mongodb_enabled:
        documents = mongo_database.database()["follow_up_plans"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id,
        }).sort("created_at", -1)
        return [FollowUpResponse(
            id=UUID(document["id"]), appointment_id=UUID(document["appointment_id"]),
            advice=document.get("advice", ""), status=document.get("status", "pending"),
            next_appointment_id=UUID(document["next_appointment_id"]) if document.get("next_appointment_id") else None,
            created_at=document["created_at"],
        ) async for document in documents]
    if session is None:
        raise RuntimeError("No application database is configured")
    result = await session.scalars(select(FollowUpAction).where(FollowUpAction.tenant_id == UUID(principal.tenant_id), FollowUpAction.patient_id == UUID(principal.user_id)).order_by(FollowUpAction.created_at.desc()))
    actions = list(result)
    for action in actions:
        if action.status not in {"completed", "cancelled"}:
            existing = await session.scalar(select(Notification).where(
                Notification.tenant_id == action.tenant_id, Notification.patient_id == action.patient_id,
                Notification.event_type == "follow_up_reminder", Notification.body.contains(str(action.id))))
            if existing is None:
                session.add(Notification(
                    tenant_id=action.tenant_id, patient_id=action.patient_id,
                    event_type="follow_up_reminder", channel="in_app", status="queued",
                    subject="Follow-up care reminder", body=f"Follow-up activity {action.id}: {action.advice}"))
    return actions


@router.post("/support/tickets", response_model=SupportTicketResponse, status_code=201)
async def create_ticket(
    payload: SupportTicketCreate,
    session: AsyncSession | None = Depends(followup_session),
    principal: Principal = Depends(require("support:create")),
):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        ticket_id = str(uuid4())
        now = datetime.now(UTC)
        doc = {
            "id": ticket_id,
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(principal.user_id),
            "category": payload.category,
            "subject": payload.subject,
            "description": payload.description,
            "status": "open",
            "created_at": now.isoformat(),
        }
        await db["support_tickets"].insert_one(dict(doc))
        return SupportTicketResponse(
            id=UUID(ticket_id),
            category=payload.category,
            subject=payload.subject,
            description=payload.description,
            status="open",
            created_at=now,
        )
    if session is None:
        raise RuntimeError("No application database is configured")
    ticket = SupportTicket(tenant_id=UUID(principal.tenant_id), patient_id=UUID(principal.user_id), **payload.model_dump())
    session.add(ticket)
    await session.flush()
    queue_patient_notification(session, tenant_id=ticket.tenant_id, patient_id=ticket.patient_id,
        event_type="support_ticket_created", subject="Support request received",
        body=f"Your support request {ticket.id} was received and is open.")
    return ticket


@router.get("/support/tickets", response_model=list[SupportTicketResponse])
async def list_tickets(
    session: AsyncSession | None = Depends(followup_session),
    principal: Principal = Depends(require("support:read")),
):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        documents = db["support_tickets"].find({
            "tenant_id": str(principal.tenant_id),
            "$or": [{"patient_id": str(principal.user_id)}, {"patient_id": principal.user_id}],
        }).sort("created_at", -1)
        return [SupportTicketResponse(
            id=UUID(doc["id"]) if len(doc.get("id", "")) == 36 else UUID(int=hash(doc.get("id", "")) & 0xffffffffffffffffffffffffffffffff),
            category=doc.get("category", "general"),
            subject=doc.get("subject", ""),
            description=doc.get("description", ""),
            status=doc.get("status", "open"),
            created_at=datetime.fromisoformat(doc["created_at"].replace("Z", "+00:00")) if isinstance(doc.get("created_at"), str) else doc.get("created_at", datetime.now(UTC)),
        ) async for doc in documents]
    if session is None:
        raise RuntimeError("No application database is configured")
    result = await session.scalars(select(SupportTicket).where(SupportTicket.tenant_id == UUID(principal.tenant_id), SupportTicket.patient_id == UUID(principal.user_id)).order_by(SupportTicket.created_at.desc()))
    return list(result)
