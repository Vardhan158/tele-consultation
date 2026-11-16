"""Platform Support Dashboard API routes.

Provides support agents and administrators with full operational oversight:
1. Live Operations Queue & Overview
2. Patient Support & Profiles
3. Doctor Assistance & Roster
4. Appointment Operations (Reschedule/Cancel)
5. Payment & Refund Triage
6. Video Consultation Diagnostics & Control
7. Support Ticket & Escalation Desk
"""
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import token_hash

router = APIRouter(prefix="/api/v1/support-dashboard", tags=["platform-support"])


async def support_agent(request: Request) -> MongoPrincipal:
    settings = get_settings()
    if not settings.mongodb_enabled or not mongo_database.enabled:
        raise HTTPException(503, "MongoDB platform support is not enabled")
    raw = request.cookies.get("teleconsult_session")
    if not raw:
        raise HTTPException(401, "Authentication required")
    db = mongo_database.database()
    session = await db["user_sessions"].find_one({
        "tenant_id": settings.default_tenant_id,
        "token_hash": token_hash(raw),
        "revoked_at": {"$exists": False},
        "expires_at": {"$gt": datetime.now(UTC)},
    })
    user = await db["users"].find_one({"tenant_id": settings.default_tenant_id, "id": session["user_id"]}) if session else None
    if not user or user.get("role") not in {"support", "clinic_admin", "admin"}:
        raise HTTPException(403, "Platform support access required")
    return MongoPrincipal(user_id=user["id"], tenant_id=user["tenant_id"], role=user["role"], clinic_id=user.get("clinic_id"))


def _clean(doc: dict[str, Any]) -> dict[str, Any]:
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if hasattr(v, "isoformat"):
            doc[k] = v.isoformat()
    return doc


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=2000)
    category: str = Field(default="general", max_length=50)  # billing, technical, appointment, account_access, clinical, general
    priority: str = Field(default="medium", max_length=20)   # low, medium, high, urgent
    patient_id: str | None = None
    doctor_id: str | None = None
    appointment_id: str | None = None
    reporter_name: str | None = None
    reporter_email: str | None = None
    user_type: str | None = Field(default="patient", max_length=30)  # patient, doctor, clinic_admin


class TicketUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=30)  # open, in_progress, escalated, resolved, closed
    priority: str | None = Field(default=None, max_length=20)
    assigned_to: str | None = None
    escalated_to: str | None = None                          # Engineering, Billing Operations, Clinical Lead, System Admin
    note: str | None = Field(default=None, max_length=1000)


def auto_triage_ticket(category: str, subject: str, description: str, current_priority: str = "medium") -> tuple[str, str]:
    text = f"{subject} {description}".lower()
    cat = category
    prio = current_priority

    if any(k in text for k in ["payment", "refund", "charged", "receipt", "transaction", "billing", "money", "failed payment"]):
        cat = "billing"
        prio = "high" if prio != "urgent" else "urgent"
    elif any(k in text for k in ["video", "webrtc", "camera", "microphone", "mic", "cannot join", "call dropped", "black screen", "audio"]):
        cat = "technical"
        prio = "urgent"
    elif any(k in text for k in ["login", "password", "blocked", "account", "unauthorized", "verify", "access"]):
        cat = "account_access"
        prio = "high"
    elif any(k in text for k in ["doctor", "prescription", "medicine", "dosage", "clinical", "summary"]):
        cat = "clinical"

    return cat, prio


class AppointmentSupportAction(BaseModel):
    action: str = Field(pattern="^(reschedule|cancel)$")
    starts_at: str | None = None
    reason: str = Field(min_length=3, max_length=500)


class PaymentRefundRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    amount: float | None = None


# ============================================================================
# Screen 1: Live Operations & Overview
# ============================================================================

@router.get("/overview")
async def support_overview(principal: MongoPrincipal = Depends(support_agent)) -> dict[str, Any]:
    db = mongo_database.database()
    tenant_scope = {"tenant_id": principal.tenant_id}
    now = datetime.now(UTC).isoformat()
    today = now[:10]

    open_tickets = await db["support_tickets"].count_documents({**tenant_scope, "status": {"$in": ["open", "in_progress"]}})
    urgent_tickets = await db["support_tickets"].count_documents({**tenant_scope, "priority": "urgent", "status": {"$ne": "closed"}})
    active_video_rooms = await db["consultation_sessions"].count_documents({**tenant_scope, "status": "active"})
    today_appointments = await db["appointments"].count_documents({**tenant_scope, "starts_at": {"$regex": f"^{today}"}})
    total_patients = await db["patients"].count_documents(tenant_scope)
    total_doctors = await db["doctors"].count_documents(tenant_scope)

    recent_activity = [_clean(x) async for x in db["audit_logs"].find(tenant_scope).sort("created_at", -1).limit(10)]
    recent_tickets = [_clean(x) async for x in db["support_tickets"].find(tenant_scope).sort("created_at", -1).limit(5)]

    return {
        "kpis": {
            "open_tickets": open_tickets,
            "urgent_tickets": urgent_tickets,
            "active_video_rooms": active_video_rooms,
            "today_appointments": today_appointments,
            "total_patients": total_patients,
            "total_doctors": total_doctors,
        },
        "recent_activity": recent_activity,
        "recent_tickets": recent_tickets,
    }


# ============================================================================
# Screen 2: Patient Support & Identity
# ============================================================================

@router.get("/patients")
async def support_patients(
    search: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    items = [_clean(x) async for x in db["patients"].find(query).sort("created_at", -1).skip(offset).limit(limit)]
    total = await db["patients"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/patients/{patient_id}")
async def support_patient_detail(
    patient_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    patient = await db["patients"].find_one({"tenant_id": principal.tenant_id, "id": patient_id})
    if not patient:
        raise HTTPException(404, "Patient record not found")
    appointments = [_clean(x) async for x in db["appointments"].find({"tenant_id": principal.tenant_id, "patient_id": patient_id}).sort("starts_at", -1).limit(20)]
    consents = [_clean(x) async for x in db["consents"].find({"tenant_id": principal.tenant_id, "patient_id": patient_id})]
    tickets = [_clean(x) async for x in db["support_tickets"].find({"tenant_id": principal.tenant_id, "patient_id": patient_id}).sort("created_at", -1)]
    return {
        "profile": _clean(patient),
        "appointments": appointments,
        "consents": consents,
        "tickets": tickets,
    }


# ============================================================================
# Screen 3: Doctor Assistance & Roster
# ============================================================================

@router.get("/doctors")
async def support_doctors(
    search: str = "",
    status: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status:
        query["approval_status"] = status
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"specialty": {"$regex": search, "$options": "i"}},
        ]
    items = [_clean(x) async for x in db["doctors"].find(query).sort("created_at", -1).skip(offset).limit(limit)]
    total = await db["doctors"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/doctors/{doctor_id}")
async def support_doctor_detail(
    doctor_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    doctor = await db["doctors"].find_one({"tenant_id": principal.tenant_id, "id": doctor_id})
    if not doctor:
        raise HTTPException(404, "Doctor record not found")
    appointments = [_clean(x) async for x in db["appointments"].find({"tenant_id": principal.tenant_id, "doctor_id": doctor_id}).sort("starts_at", -1).limit(20)]
    return {
        "profile": _clean(doctor),
        "appointments": appointments,
    }


# ============================================================================
# Screen 4: Appointment Operations & Rescheduling
# ============================================================================

@router.get("/appointments")
async def support_appointments(
    search: str = "",
    status: str = "",
    date: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status:
        query["status"] = status
    if date:
        query["starts_at"] = {"$regex": f"^{date}"}
    if search:
        query["$or"] = [
            {"patient_name": {"$regex": search, "$options": "i"}},
            {"doctor_name": {"$regex": search, "$options": "i"}},
            {"id": {"$regex": search, "$options": "i"}},
        ]
    items = [_clean(x) async for x in db["appointments"].find(query).sort("starts_at", -1).skip(offset).limit(limit)]
    total = await db["appointments"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/appointments/{appointment_id}/action")
async def support_appointment_action(
    appointment_id: str,
    payload: AppointmentSupportAction,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, str]:
    db = mongo_database.database()
    appointment = await db["appointments"].find_one({"tenant_id": principal.tenant_id, "id": appointment_id})
    if not appointment:
        raise HTTPException(404, "Appointment not found")

    now = datetime.now(UTC)
    if payload.action == "cancel":
        await db["appointments"].update_one(
            {"tenant_id": principal.tenant_id, "id": appointment_id},
            {"$set": {"status": "cancelled", "cancelled_by": principal.user_id, "cancelled_at": now, "cancellation_reason": payload.reason}},
        )
    elif payload.action == "reschedule":
        if not payload.starts_at:
            raise HTTPException(422, "starts_at is required for rescheduling")
        await db["appointments"].update_one(
            {"tenant_id": principal.tenant_id, "id": appointment_id},
            {"$set": {"starts_at": payload.starts_at, "status": "rescheduled", "rescheduled_by": principal.user_id, "rescheduled_at": now, "reschedule_reason": payload.reason}},
        )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": f"support.appointment.{payload.action}",
        "target_id": appointment_id,
        "metadata": {"reason": payload.reason, "starts_at": payload.starts_at},
        "created_at": now,
    })
    return {"status": "success", "action": payload.action}


# ============================================================================
# Screen 5: Payment & Refund Triage
# ============================================================================

@router.get("/payments")
async def support_payments(
    search: str = "",
    status: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"id": {"$regex": search, "$options": "i"}},
            {"appointment_id": {"$regex": search, "$options": "i"}},
            {"patient_id": {"$regex": search, "$options": "i"}},
        ]
    items = [_clean(x) async for x in db["payments"].find(query).sort("created_at", -1).skip(offset).limit(limit)]
    total = await db["payments"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/payments/{payment_id}/refund")
async def support_payment_refund(
    payment_id: str,
    payload: PaymentRefundRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, str]:
    db = mongo_database.database()
    payment = await db["payments"].find_one({"tenant_id": principal.tenant_id, "id": payment_id})
    if not payment:
        raise HTTPException(404, "Payment record not found")

    now = datetime.now(UTC)
    await db["payments"].update_one(
        {"tenant_id": principal.tenant_id, "id": payment_id},
        {"$set": {"status": "refunded", "refunded_at": now, "refund_reason": payload.reason, "refunded_by": principal.user_id}},
    )
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support.payment.refunded",
        "target_id": payment_id,
        "metadata": {"reason": payload.reason, "amount": payload.amount},
        "created_at": now,
    })
    return {"status": "refunded"}


# ============================================================================
# Screen 6: Video Consultation & WebRTC Diagnostics
# ============================================================================

@router.get("/video-sessions")
async def support_video_sessions(
    status: str = "",
    principal: MongoPrincipal = Depends(support_agent),
) -> list[dict[str, Any]]:
    db = mongo_database.database()
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status:
        query["status"] = status
    items = [_clean(x) async for x in db["consultation_sessions"].find(query).sort("created_at", -1).limit(50)]
    return items


@router.post("/video-sessions/{session_id}/end")
async def support_end_video_session(
    session_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, str]:
    db = mongo_database.database()
    now = datetime.now(UTC)
    await db["consultation_sessions"].update_one(
        {"tenant_id": principal.tenant_id, "id": session_id},
        {"$set": {"status": "ended", "ended_by_support": True, "ended_at": now}},
    )
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support.video_session.ended",
        "target_id": session_id,
        "created_at": now,
    })
    return {"status": "ended"}


# ============================================================================
# Screen 7: Support Ticket & Escalation Desk
# ============================================================================

@router.get("/tickets")
async def support_tickets(
    status: str = "",
    priority: str = "",
    category: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if category:
        query["category"] = category
    items = [_clean(x) async for x in db["support_tickets"].find(query).sort("created_at", -1).skip(offset).limit(limit)]
    total = await db["support_tickets"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/tickets")
async def create_support_ticket(
    payload: TicketCreate,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    ticket_id = f"TICK-{secrets_ticket_id()}"
    now = datetime.now(UTC)

    cat, prio = auto_triage_ticket(payload.category, payload.subject, payload.description, payload.priority)

    ticket_doc = {
        "id": ticket_id,
        "tenant_id": principal.tenant_id,
        "clinic_id": principal.clinic_id,
        "subject": payload.subject,
        "description": payload.description,
        "category": cat,
        "priority": prio,
        "status": "open",
        "patient_id": payload.patient_id,
        "doctor_id": payload.doctor_id,
        "appointment_id": payload.appointment_id,
        "reporter_name": payload.reporter_name,
        "reporter_email": payload.reporter_email,
        "user_type": payload.user_type or "patient",
        "created_by": principal.user_id,
        "assigned_to": principal.user_id,
        "escalated_to": None,
        "notes": [],
        "created_at": now,
        "updated_at": now,
    }
    await db["support_tickets"].insert_one(ticket_doc)
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support_ticket.created",
        "target_id": ticket_id,
        "metadata": {"category": cat, "priority": prio},
        "created_at": now,
    })
    return _clean(ticket_doc)


@router.patch("/tickets/{ticket_id}")
async def update_support_ticket(
    ticket_id: str,
    payload: TicketUpdate,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    ticket = await db["support_tickets"].find_one({"tenant_id": principal.tenant_id, "id": ticket_id})
    if not ticket:
        raise HTTPException(404, "Support ticket not found")

    now = datetime.now(UTC)
    updates: dict[str, Any] = {"updated_at": now}
    if payload.status:
        updates["status"] = payload.status
    if payload.priority:
        updates["priority"] = payload.priority
    if payload.assigned_to:
        updates["assigned_to"] = payload.assigned_to
    if payload.escalated_to:
        updates["escalated_to"] = payload.escalated_to
        if not payload.status:
            updates["status"] = "escalated"

    if payload.note:
        note_entry = {
            "id": str(uuid4()),
            "author_id": principal.user_id,
            "text": payload.note,
            "created_at": now.isoformat(),
        }
        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": ticket_id},
            {"$push": {"notes": note_entry}, "$set": updates},
        )
    else:
        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": ticket_id},
            {"$set": updates},
        )

    # Notify recipient (patient / doctor / reporter) of ticket status update
    recipient_id = ticket.get("patient_id") or ticket.get("reporter_id") or ticket.get("created_by")
    if recipient_id and (payload.status or payload.note or payload.escalated_to):
        status_text = (payload.status or ticket.get("status", "updated")).replace("_", " ").title()
        await db["notifications"].insert_one({
            "id": str(uuid4()),
            "tenant_id": principal.tenant_id,
            "recipient_id": recipient_id,
            "type": "support_ticket_update",
            "title": f"Support Ticket #{ticket_id} {status_text}",
            "message": f"Your support ticket '{ticket.get('subject')}' was updated to {status_text}.",
            "read_at": None,
            "created_at": now,
        })

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support_ticket.updated",
        "target_id": ticket_id,
        "metadata": {"status": payload.status, "priority": payload.priority, "escalated_to": payload.escalated_to},
        "created_at": now,
    })

    updated_ticket = await db["support_tickets"].find_one({"tenant_id": principal.tenant_id, "id": ticket_id})
    return _clean(updated_ticket or {})


def secrets_ticket_id() -> str:
    import secrets
    return f"{secrets.randbelow(899999) + 100000}"
