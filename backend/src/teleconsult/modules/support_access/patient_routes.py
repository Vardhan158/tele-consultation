from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

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
    subject: str = Field(default="Support Request", max_length=120)
    description: str = Field(min_length=2, max_length=2000)


class SupportTicketResponse(SupportTicketCreate):
    id: UUID
    status: str
    created_at: datetime


class FollowUpResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID | str
    appointment_id: UUID | str
    advice: str
    status: str
    next_appointment_id: UUID | str | None = None
    created_at: datetime


class BloodPressureReadingCreate(BaseModel):
    systolic: int = Field(ge=40, le=260)
    diastolic: int = Field(ge=20, le=180)
    pulse: int | None = Field(default=None, ge=30, le=220)
    reading_at: datetime | str | None = None
    notes: str | None = Field(default=None, max_length=500)


class BloodPressureReadingResponse(BaseModel):
    id: str
    systolic: int
    diastolic: int
    pulse: int | None = None
    reading_at: datetime
    notes: str | None = None


@router.get("/vitals/blood-pressure", response_model=list[BloodPressureReadingResponse])
async def list_bp_readings(
    session: AsyncSession | None = Depends(followup_session),
    principal: Principal = Depends(require("followup:read")),
):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = [str(principal.user_id)]
        patient_doc = await db["patients"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(principal.user_id)},
                {"user_id": str(principal.user_id)},
                {"user_account_id": str(principal.user_id)},
            ],
        })
        if patient_doc:
            for k in ("id", "user_id", "user_account_id"):
                val = patient_doc.get(k)
                if val and str(val) not in patient_ids:
                    patient_ids.append(str(val))

        all_ids = []
        for pid in patient_ids:
            all_ids.extend([pid, pid.lower(), pid.upper()])
        all_ids = list(set(all_ids))

        cursor = db["vitals_blood_pressure"].find({
            "tenant_id": str(principal.tenant_id),
            "patient_id": {"$in": all_ids},
        }).sort("reading_at", 1)

        documents = await cursor.to_list(500)
        results = []
        for doc in documents:
            dt_val = doc.get("reading_at")
            if isinstance(dt_val, str):
                try:
                    dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
                except ValueError:
                    dt = datetime.now(UTC)
            elif isinstance(dt_val, datetime):
                dt = dt_val
            else:
                dt = datetime.now(UTC)

            results.append(BloodPressureReadingResponse(
                id=str(doc.get("id") or doc.get("_id") or uuid4()),
                systolic=int(doc.get("systolic", 120)),
                diastolic=int(doc.get("diastolic", 80)),
                pulse=int(doc["pulse"]) if doc.get("pulse") is not None else None,
                reading_at=dt,
                notes=doc.get("notes"),
            ))
        return results
    return []


@router.post("/vitals/blood-pressure", response_model=BloodPressureReadingResponse, status_code=201)
async def create_bp_reading(
    payload: BloodPressureReadingCreate,
    session: AsyncSession | None = Depends(followup_session),
    principal: Principal = Depends(require("followup:read")),
):
    reading_id = str(uuid4())
    if isinstance(payload.reading_at, datetime):
        reading_dt = payload.reading_at
    elif isinstance(payload.reading_at, str) and payload.reading_at:
        try:
            reading_dt = datetime.fromisoformat(payload.reading_at.replace("Z", "+00:00"))
        except ValueError:
            reading_dt = datetime.now(UTC)
    else:
        reading_dt = datetime.now(UTC)

    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        iso_reading = reading_dt.isoformat()
        # Deduplication check: prevent duplicate submissions with identical values and timestamp
        recent = await db["vitals_blood_pressure"].find_one({
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(principal.user_id),
            "systolic": payload.systolic,
            "diastolic": payload.diastolic,
            "reading_at": iso_reading,
        })
        if recent:
            return BloodPressureReadingResponse(
                id=str(recent.get("id") or recent.get("_id")),
                systolic=int(recent["systolic"]),
                diastolic=int(recent["diastolic"]),
                pulse=int(recent["pulse"]) if recent.get("pulse") is not None else None,
                reading_at=reading_dt,
                notes=recent.get("notes"),
            )

        doc = {
            "id": reading_id,
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(principal.user_id),
            "systolic": payload.systolic,
            "diastolic": payload.diastolic,
            "pulse": payload.pulse,
            "reading_at": iso_reading,
            "notes": payload.notes or "",
            "created_at": datetime.now(UTC).isoformat(),
        }
        await db["vitals_blood_pressure"].insert_one(dict(doc))
        return BloodPressureReadingResponse(
            id=reading_id,
            systolic=payload.systolic,
            diastolic=payload.diastolic,
            pulse=payload.pulse,
            reading_at=reading_dt,
            notes=payload.notes,
        )

    return BloodPressureReadingResponse(
        id=reading_id,
        systolic=payload.systolic,
        diastolic=payload.diastolic,
        pulse=payload.pulse,
        reading_at=reading_dt,
        notes=payload.notes,
    )


@router.get("/follow-up", response_model=list[FollowUpResponse])
async def follow_up(session: AsyncSession | None = Depends(followup_session), principal: Principal = Depends(require("followup:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        documents = db["follow_up_plans"].find({
            "tenant_id": str(principal.tenant_id),
            "$or": [{"patient_id": str(principal.user_id)}, {"patient_id": principal.user_id}],
        }).sort("created_at", -1)
        results = []
        async for document in documents:
            dt_val = document.get("created_at")
            dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00")) if isinstance(dt_val, str) else (dt_val or datetime.now(UTC))
            results.append(FollowUpResponse(
                id=str(document.get("id") or document.get("_id") or uuid4()),
                appointment_id=str(document.get("appointment_id") or uuid4()),
                advice=str(document.get("advice") or ""),
                status=str(document.get("status") or "pending"),
                next_appointment_id=document.get("next_appointment_id"),
                created_at=dt,
            ))
        return results
    if session is None:
        raise RuntimeError("No application database is configured")
    result = await session.scalars(select(FollowUpAction).where(FollowUpAction.tenant_id == UUID(principal.tenant_id), FollowUpAction.patient_id == UUID(principal.user_id)).order_by(FollowUpAction.created_at.desc()))
    return list(result)


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
