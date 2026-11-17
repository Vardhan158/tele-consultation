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
import base64
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
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


SENSITIVE_FIELDS = {
    "password_hash", "mfa_secret", "mfa_recovery_codes", "mfa_recovery_code_hashes",
    "token_hash", "session_token", "verification_token_hash", "otp_code", "secret", "private_key"
}


def _clean(doc: dict[str, Any]) -> dict[str, Any]:
    if not doc:
        return {}
    doc.pop("_id", None)
    for field in SENSITIVE_FIELDS:
        doc.pop(field, None)
    for k, v in list(doc.items()):
        if hasattr(v, "isoformat"):
            doc[k] = v.isoformat()
    return doc


def _support_scope(principal: MongoPrincipal) -> dict[str, Any]:
    scope = {"tenant_id": principal.tenant_id}
    if principal.clinic_id:
        scope["clinic_id"] = principal.clinic_id
    return scope


def _build_tenant_query(principal: MongoPrincipal) -> dict[str, Any]:
    settings = get_settings()
    tenants = list({str(principal.tenant_id), str(settings.default_tenant_id), "1", "default"})
    return {
        "$or": [
            {"tenant_id": {"$in": tenants}},
            {"tenant_id": {"$exists": False}},
        ]
    }


def compute_resource_category(action: str) -> str:
    act = str(action or "").lower()
    if "escalation" in act:
        return "escalation"
    if "ticket" in act:
        return "ticket"
    if "account" in act or "auth" in act:
        return "account"
    if "booking" in act or "appointment" in act:
        return "booking"
    if "payment" in act or "refund" in act:
        return "payment"
    if "video" in act or "consultation" in act:
        return "video_session"
    return "general"


def compute_event_result(log: dict[str, Any]) -> str:
    res = str(log.get("result") or "").strip().upper()
    act = str(log.get("action") or "").lower()
    if res in {"FAILED", "DENIED", "FAIL", "ERROR"}:
        return "Failed"
    if "failed" in act or "denied" in act or "error" in act or "rejected" in act:
        return "Failed"
    if res in {"SUCCESS", "OK", "PASSED"}:
        return "Success"
    return log.get("result") or "Success"


async def resolve_actor_name(db: Any, tenant_id: str, actor_id: str | None) -> str:
    if not actor_id or actor_id in {"system", "Unassigned", "—"}:
        return actor_id or "System"
    if len(actor_id) < 20 and not actor_id.startswith("0000"):
        return actor_id
    try:
        user = await db["users"].find_one({"$or": [{"id": actor_id}, {"user_id": actor_id}]})
        if user:
            return user.get("full_name") or user.get("name") or user.get("email") or actor_id
    except Exception:
        pass
    return actor_id


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=5, max_length=5000)
    category: str = Field(default="general", max_length=50)  # billing, technical, appointment, account_access, clinical, general
    priority: str = Field(default="medium", max_length=20)   # low, medium, high, urgent, critical
    requester_id: str | None = None
    requester_name: str | None = None
    requester_email: str | None = None
    requester_role: str | None = Field(default="patient", max_length=30)  # patient, doctor, clinic_admin, other
    patient_id: str | None = None
    doctor_id: str | None = None
    appointment_id: str | None = None
    related_record_id: str | None = None
    reporter_name: str | None = None
    reporter_email: str | None = None
    user_type: str | None = Field(default="patient", max_length=30)  # patient, doctor, clinic_admin, other


class TicketUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(NEW|OPEN|IN_PROGRESS|WAITING_FOR_USER|ESCALATED|RESOLVED|CLOSED|REOPENED|new|open|in_progress|waiting_for_user|escalated|resolved|closed|reopened)$")
    priority: str | None = Field(default=None, max_length=20)
    assigned_to: str | None = None
    escalated_to: str | None = None                          # Engineering, Billing Operations, Clinical Lead, System Admin
    note: str | None = Field(default=None, max_length=1000)


class SLAConfigUpdate(BaseModel):
    critical_hours: float = Field(default=2.0, ge=0.25, le=72.0)
    high_hours: float = Field(default=4.0, ge=0.5, le=168.0)
    medium_hours: float = Field(default=12.0, ge=1.0, le=336.0)
    low_hours: float = Field(default=24.0, ge=2.0, le=720.0)


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


def calculate_sla_due_at(created_at: datetime, priority: str) -> datetime:
    hours_map = {"urgent": 2, "high": 4, "medium": 12, "low": 24}
    hours = hours_map.get(priority.lower(), 12)
    return created_at + timedelta(hours=hours)


def _as_utc_datetime(value: Any, *, fallback: datetime | None = None) -> datetime:
    """Normalize Mongo BSON and legacy ISO timestamps to aware UTC datetimes."""
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            parsed = fallback or datetime.now(UTC)
    elif isinstance(value, datetime):
        parsed = value
    else:
        parsed = fallback or datetime.now(UTC)

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def get_sla_info(
    created_at_val: Any,
    priority: str,
    status: str,
    *,
    resolved_at_val: Any = None,
    due_at_val: Any = None,
    sla_priority: str | None = None,
) -> dict[str, Any]:
    created_dt = _as_utc_datetime(created_at_val)

    normalized_priority = str(sla_priority or priority or "medium").lower()
    normalized_status = str(status or "open").lower()
    due_at = (
        _as_utc_datetime(due_at_val)
        if due_at_val
        else calculate_sla_due_at(created_dt, normalized_priority)
    )
    now = datetime.now(UTC)

    if normalized_status in {"resolved", "closed"}:
        resolved_at = _as_utc_datetime(resolved_at_val, fallback=now)
        sla_state = "met" if resolved_at <= due_at else "breached"
    elif now > due_at:
        sla_state = "breached"
    elif (due_at - now).total_seconds() <= 3600:
        sla_state = "near_breach"
    else:
        sla_state = "on_track"

    return {
        "due_at": due_at.isoformat(),
        "status": sla_state,
        "hours_target": 2 if normalized_priority == "urgent" else 4 if normalized_priority == "high" else 12 if normalized_priority == "medium" else 24,
    }


def ticket_sla_info(ticket: dict[str, Any]) -> dict[str, Any]:
    return get_sla_info(
        ticket.get("created_at"),
        ticket.get("priority", "medium"),
        ticket.get("status", "open"),
        resolved_at_val=ticket.get("resolved_at"),
        due_at_val=ticket.get("sla_due_at"),
        sla_priority=ticket.get("sla_priority"),
    )


async def preserve_ticket_sla_deadline(db: Any, ticket: dict[str, Any]) -> None:
    """Backfill legacy tickets once so later status/priority changes cannot move the SLA."""
    if ticket.get("sla_due_at"):
        return
    ticket_id = ticket.get("id") or ticket.get("ticket_id")
    tenant_id = ticket.get("tenant_id")
    if not ticket_id or not tenant_id:
        return

    original_priority = str(ticket.get("sla_priority") or ticket.get("priority") or "medium").lower()
    created_at = _as_utc_datetime(ticket.get("created_at"))
    due_at = calculate_sla_due_at(created_at, original_priority)
    await db["support_tickets"].update_one(
        {
            "tenant_id": tenant_id,
            "id": ticket_id,
            "$or": [
                {"sla_due_at": {"$exists": False}},
                {"sla_due_at": None},
                {"sla_due_at": ""},
            ],
        },
        {"$set": {"sla_due_at": due_at, "sla_priority": original_priority}},
    )
    ticket["sla_due_at"] = due_at
    ticket["sla_priority"] = original_priority


class AppointmentSupportAction(BaseModel):
    action: str = Field(pattern="^(reschedule|cancel)$")
    starts_at: str | None = None
    reason: str = Field(min_length=3, max_length=500)


class PaymentRefundRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    amount: float | None = None


# Configurable SLA Endpoint (PRD Section 12.1)
@router.get("/sla-config")
async def get_sla_config(principal: MongoPrincipal = Depends(support_agent)) -> dict[str, Any]:
    db = mongo_database.database()
    config = await db["sla_config"].find_one({"tenant_id": principal.tenant_id})
    return _clean(config or {
        "tenant_id": principal.tenant_id,
        "critical_hours": 2.0,
        "high_hours": 4.0,
        "medium_hours": 12.0,
        "low_hours": 24.0,
    })


@router.patch("/sla-config")
async def update_sla_config(
    payload: SLAConfigUpdate,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    now = datetime.now(UTC)
    doc = {
        "tenant_id": principal.tenant_id,
        "critical_hours": payload.critical_hours,
        "high_hours": payload.high_hours,
        "medium_hours": payload.medium_hours,
        "low_hours": payload.low_hours,
        "updated_at": now,
        "updated_by": principal.user_id,
    }
    await db["sla_config"].update_one(
        {"tenant_id": principal.tenant_id},
        {"$set": doc},
        upsert=True,
    )
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support.sla_config.updated",
        "target_id": "sla_config",
        "metadata": payload.model_dump(),
        "created_at": now,
    })
    return _clean(doc)


# Secure Attachment Upload & Download (PRD Section 12.2)
ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain", "text/log", "text/csv", "application/json"
}


@router.post("/tickets/{ticket_id}/attachments")
async def upload_ticket_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    ticket = await db["support_tickets"].find_one({"tenant_id": principal.tenant_id, "id": ticket_id})
    if not ticket:
        raise HTTPException(404, "Support ticket not found")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_ATTACHMENT_TYPES and not file.filename.endswith((".pdf", ".png", ".jpg", ".jpeg", ".txt", ".log", ".csv")):
        raise HTTPException(415, "Unsupported file format. Allowed: PDF, PNG, JPG, TXT, LOG, CSV, JSON.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit (PRD 12.2)
        raise HTTPException(413, "Attachment exceeds maximum size limit of 10 MB.")

    encoded_b64 = base64.b64encode(content).decode("utf-8")
    attachment_id = str(uuid4())
    now = datetime.now(UTC)

    attachment_doc = {
        "id": attachment_id,
        "tenant_id": principal.tenant_id,
        "ticket_id": ticket_id,
        "filename": file.filename,
        "content_type": content_type or "application/octet-stream",
        "size": len(content),
        "data_b64": encoded_b64,
        "uploaded_by": principal.user_id,
        "created_at": now,
    }

    await db["ticket_attachments"].insert_one(attachment_doc)

    attachment_summary = {
        "id": attachment_id,
        "filename": file.filename,
        "size": len(content),
        "content_type": content_type,
        "created_at": now.isoformat(),
    }

    await db["support_tickets"].update_one(
        {"tenant_id": principal.tenant_id, "id": ticket_id},
        {"$push": {"attachments": attachment_summary}, "$set": {"updated_at": now}},
    )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support_ticket.attachment_uploaded",
        "target_id": ticket_id,
        "metadata": {"attachment_id": attachment_id, "filename": file.filename, "size": len(content)},
        "created_at": now,
    })

    return attachment_summary


@router.get("/tickets/{ticket_id}/attachments/{attachment_id}")
async def download_ticket_attachment(
    ticket_id: str,
    attachment_id: str,
    principal: MongoPrincipal = Depends(support_agent),
):
    from fastapi.responses import Response
    db = mongo_database.database()
    att = await db["ticket_attachments"].find_one({"tenant_id": principal.tenant_id, "ticket_id": ticket_id, "id": attachment_id})
    if not att:
        raise HTTPException(404, "Attachment file not found")

    now = datetime.now(UTC)
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support_ticket.attachment_downloaded",
        "target_id": ticket_id,
        "metadata": {"attachment_id": attachment_id, "filename": att.get("filename")},
        "created_at": now,
    })

    binary_data = base64.b64decode(att.get("data_b64", ""))
    return Response(
        content=binary_data,
        media_type=att.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{att.get("filename", "attachment")}"'},
    )


# ============================================================================
# Screen 1: Live Operations & Overview
# ============================================================================

@router.get("/overview")
async def support_overview(principal: MongoPrincipal = Depends(support_agent)) -> dict[str, Any]:
    db = mongo_database.database()
    try:
        tenant_scope = _build_tenant_query(principal)
        now_dt = datetime.now(UTC)
        today = now_dt.isoformat()[:10]
        start_of_today = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)

        scoped_tickets = [_clean(x) async for x in db["support_tickets"].find(tenant_scope)]

        open_tickets = 0
        unassigned_tickets = 0
        urgent_tickets = 0
        sla_breaches = 0
        my_assigned_tickets = 0
        category_summary: dict[str, int] = {
            "technical": 0, "billing": 0, "appointment": 0, "account_access": 0, "clinical": 0, "general": 0
        }

        active_statuses = {"OPEN", "NEW", "IN_PROGRESS", "WAITING_FOR_USER", "ESCALATED", "REOPENED"}
        for t in scoped_tickets:
            await preserve_ticket_sla_deadline(db, t)
            status = str(t.get("status") or "OPEN").upper()
            if status not in active_statuses:
                continue
            priority = str(t.get("priority") or "MEDIUM").upper()
            assigned = t.get("assigned_to")
            category = str(t.get("category") or "general").lower()

            open_tickets += 1

            if not assigned or assigned == "unassigned":
                unassigned_tickets += 1

            if priority in {"URGENT", "HIGH", "CRITICAL"}:
                urgent_tickets += 1

            if assigned == principal.user_id and status not in {"RESOLVED", "CLOSED"}:
                my_assigned_tickets += 1

            category_summary[category] = category_summary.get(category, 0) + 1

            sla = ticket_sla_info(t)
            t["sla"] = sla
            if sla.get("status") == "breached":
                sla_breaches += 1

        try:
            resolved_today = await db["support_tickets"].count_documents({"$and": [
                tenant_scope,
                {"status": {"$in": ["resolved", "closed", "RESOLVED", "CLOSED"]}},
                {"$or": [
                    {"resolved_at": {"$gte": start_of_today}},
                    {"updated_at": {"$gte": start_of_today}},
                    {"resolved_at": {"$gte": today}},
                    {"updated_at": {"$gte": today}},
                ]},
            ]})
        except Exception:
            resolved_today = 0

        recent_tickets = [_clean(x) async for x in db["support_tickets"].find(tenant_scope).sort("created_at", -1).limit(6)]
        for t in recent_tickets:
            t["sla"] = ticket_sla_info(t)

        queue_statuses = sorted(active_statuses | {status.lower() for status in active_statuses})
        my_tickets = [_clean(x) async for x in db["support_tickets"].find({**tenant_scope, "assigned_to": principal.user_id, "status": {"$in": queue_statuses}}).sort("created_at", -1).limit(6)]
        for t in my_tickets:
            t["sla"] = ticket_sla_info(t)

        recent_activity = [_clean(x) async for x in db["audit_logs"].find(tenant_scope).sort("created_at", -1).limit(8)]
        active_video_rooms = await db["consultation_sessions"].count_documents({**tenant_scope, "status": "active"})

        return {
            "kpis": {
                "open_tickets": open_tickets,
                "unassigned_tickets": unassigned_tickets,
                "urgent_tickets": urgent_tickets,
                "resolved_today": resolved_today,
                "sla_breaches": sla_breaches,
                "my_assigned_tickets": my_assigned_tickets,
                "active_video_rooms": active_video_rooms,
            },
            "category_summary": category_summary,
            "recent_tickets": recent_tickets,
            "my_tickets": my_tickets,
            "recent_activity": recent_activity,
        }
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn").exception("Support overview query failed")
        raise HTTPException(503, "Support dashboard data is temporarily unavailable") from exc


def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "—"
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


class AccountActionRequest(BaseModel):
    user_id: str
    action: str = Field(pattern="^(resend_verification|send_troubleshooting|refer_to_clinic_admin|escalate_security)$")
    ticket_id: str | None = None
    note: str | None = None


# ============================================================================
# Screen 2: Account & Access Diagnostics & Support
# ============================================================================

@router.get("/account-diagnostics")
async def account_diagnostics(
    query: str = Query(..., min_length=2),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    search_term = query.strip().lower()

    user = await db["users"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [
            {"id": search_term},
            {"email": search_term},
            {"full_name": {"$regex": search_term, "$options": "i"}},
        ],
    })

    if not user:
        raise HTTPException(404, "User account not found for diagnostics")

    user_id = user["id"]
    email = user.get("email", "")

    last_login_audit = await db["audit_logs"].find_one(
        {"tenant_id": principal.tenant_id, "actor_id": user_id, "action": "auth.login.success"},
        sort=[("created_at", -1)],
    )

    last_error_audit = await db["audit_logs"].find_one(
        {"tenant_id": principal.tenant_id, "$or": [{"actor_id": user_id}, {"target_id": email}], "action": {"$regex": r"^auth\.login\.failed"}},
        sort=[("created_at", -1)],
    )

    recent_error_category = "None"
    if last_error_audit:
        action_name = last_error_audit.get("action", "")
        if "unverified" in action_name or not user.get("verified_at"):
            recent_error_category = "Email Verification Required"
        elif "mfa" in action_name:
            recent_error_category = "MFA / 2FA Code Required"
        elif "restricted" in action_name:
            recent_error_category = "Account Restricted / Locked"
        else:
            recent_error_category = "Invalid Password / Credentials"
    elif not user.get("verified_at"):
        recent_error_category = "Email Verification Pending"

    linked_tickets = [_clean(x) async for x in db["support_tickets"].find({
        "tenant_id": principal.tenant_id,
        "$or": [{"patient_id": user_id}, {"doctor_id": user_id}, {"reporter_email": email}],
    }).sort("created_at", -1)]

    # Important security restriction: NEVER reveal password_hash, OTPs, MFA secret, or tokens
    return {
        "user_id": user_id,
        "full_name": user.get("full_name", ""),
        "role": user.get("role", "patient"),
        "masked_email": mask_email(email),
        "account_status": "restricted" if user.get("restricted_until") and user["restricted_until"] > datetime.now(UTC) else "active" if user.get("active", True) else "inactive",
        "email_verified": bool(user.get("verified_at")),
        "verified_at": user.get("verified_at").isoformat() if hasattr(user.get("verified_at"), "isoformat") else user.get("verified_at"),
        "last_successful_login": _clean(last_login_audit).get("created_at") if last_login_audit else None,
        "recent_login_error_category": recent_error_category,
        "linked_tickets": linked_tickets,
    }


@router.post("/account-action")
async def account_support_action(
    payload: AccountActionRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, str]:
    import secrets
    db = mongo_database.database()
    user = await db["users"].find_one({"tenant_id": principal.tenant_id, "id": payload.user_id})
    if not user:
        raise HTTPException(404, "User account not found")

    now = datetime.now(UTC)
    action_type = payload.action

    if action_type == "resend_verification":
        code = f"{secrets.randbelow(1_000_000):06d}"
        await db["recovery_tokens"].insert_one({
            "id": str(uuid4()),
            "user_id": payload.user_id,
            "token_hash": token_hash(code),
            "expires_at": now + timedelta(minutes=10),
            "used_at": None,
            "created_at": now,
        })
        from teleconsult.modules.identity.auth_routes import send_verification_email
        await send_verification_email(user["email"], code)

    elif action_type == "send_troubleshooting":
        await db["notifications"].insert_one({
            "id": str(uuid4()),
            "tenant_id": principal.tenant_id,
            "recipient_id": payload.user_id,
            "type": "support_troubleshooting",
            "title": "Account Access Troubleshooting Guide",
            "message": "Please clear your browser cookies/cache, check your spam folder, or use the Forgot Password link to reset access.",
            "read_at": None,
            "created_at": now,
        })

    elif action_type == "refer_to_clinic_admin":
        if payload.ticket_id:
            await db["support_tickets"].update_one(
                {"tenant_id": principal.tenant_id, "id": payload.ticket_id},
                {"$set": {"status": "escalated", "escalated_to": "Clinic Admin", "updated_at": now}},
            )

    elif action_type == "escalate_security":
        if payload.ticket_id:
            await db["support_tickets"].update_one(
                {"tenant_id": principal.tenant_id, "id": payload.ticket_id},
                {"$set": {"status": "escalated", "escalated_to": "Security & Operations", "priority": "urgent", "updated_at": now}},
            )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": f"support.account.{action_type}",
        "target_id": payload.user_id,
        "metadata": {"ticket_id": payload.ticket_id, "note": payload.note},
        "created_at": now,
    })

    return {"status": "success", "action": action_type}


class BookingActionRequest(BaseModel):
    appointment_id: str
    action: str = Field(pattern="^(reschedule|cancel|send_instructions|escalate_scheduling)$")
    starts_at: str | None = None
    reason: str = Field(min_length=3, max_length=500)
    ticket_id: str | None = None


# ============================================================================
# Screen 3: Booking Issues & Appointment Diagnostics
# ============================================================================

@router.get("/booking-diagnostics")
async def booking_diagnostics(
    query: str = Query(..., min_length=2),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    search_term = query.strip()

    appointment = await db["appointments"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [
            {"id": search_term},
            {"id": {"$regex": search_term, "$options": "i"}},
            {"patient_name": {"$regex": search_term, "$options": "i"}},
            {"doctor_name": {"$regex": search_term, "$options": "i"}},
        ],
    })

    if not appointment:
        raise HTTPException(404, "Booking record not found for diagnostics")

    appointment_id = appointment["id"]
    patient_id = appointment.get("patient_id")
    doctor_id = appointment.get("doctor_id")

    patient = await db["patients"].find_one({"tenant_id": principal.tenant_id, "id": patient_id}) if patient_id else None
    doctor = await db["doctors"].find_one({"tenant_id": principal.tenant_id, "id": doctor_id}) if doctor_id else None
    payment = await db["payments"].find_one({"tenant_id": principal.tenant_id, "$or": [{"appointment_id": appointment_id}, {"id": appointment.get("payment_id")}]})

    booking_history = [_clean(x) async for x in db["audit_logs"].find({
        "tenant_id": principal.tenant_id,
        "target_id": appointment_id,
    }).sort("created_at", -1)]

    linked_tickets = [_clean(x) async for x in db["support_tickets"].find({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
    }).sort("created_at", -1)]

    upcoming_slots = [_clean(x) async for x in db["doctor_schedules"].find({
        "tenant_id": principal.tenant_id,
        "doctor_id": doctor_id,
        "status": "available",
    }).sort("starts_at", 1).limit(10)]

    return {
        "booking_id": appointment_id,
        "patient": {
            "id": patient_id,
            "name": patient.get("full_name") if patient else appointment.get("patient_name", "—"),
            "email": patient.get("email") if patient else "—",
            "phone": patient.get("phone") if patient else "—",
        },
        "doctor": {
            "id": doctor_id,
            "name": doctor.get("full_name") if doctor else appointment.get("doctor_name", "—"),
            "specialty": doctor.get("specialty") if doctor else "General Medicine",
        },
        "clinic_id": appointment.get("clinic_id") or principal.clinic_id or "default",
        "starts_at": appointment.get("starts_at"),
        "appointment_type": appointment.get("appointment_type") or appointment.get("visit_type") or "Video Visit",
        "booking_status": appointment.get("status", "booked"),
        "payment": {
            "id": payment.get("id") if payment else None,
            "status": payment.get("status", "pending") if payment else ("paid" if appointment.get("status") == "booked" else "pending"),
            "amount": payment.get("amount") if payment else appointment.get("fee", 0),
        },
        "booking_history": booking_history,
        "linked_tickets": linked_tickets,
        "available_doctor_slots": upcoming_slots,
    }


@router.post("/booking-action")
async def booking_support_action(
    payload: BookingActionRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, str]:
    db = mongo_database.database()
    appointment = await db["appointments"].find_one({"tenant_id": principal.tenant_id, "id": payload.appointment_id})
    if not appointment:
        raise HTTPException(404, "Appointment not found")

    now = datetime.now(UTC)
    action_type = payload.action

    if action_type == "cancel":
        if appointment.get("status") in {"completed", "cancelled"}:
            raise HTTPException(409, "Appointment cannot be cancelled in its current state")
        await db["appointments"].update_one(
            {"tenant_id": principal.tenant_id, "id": payload.appointment_id},
            {"$set": {"status": "cancelled", "cancelled_by": principal.user_id, "cancelled_at": now, "cancellation_reason": payload.reason}},
        )

    elif action_type == "reschedule":
        if not payload.starts_at:
            raise HTTPException(422, "starts_at datetime is required for rescheduling")
        if appointment.get("status") in {"completed", "cancelled"}:
            raise HTTPException(409, "Appointment cannot be rescheduled in its current state")

        conflict = await db["appointments"].find_one({
            "tenant_id": principal.tenant_id,
            "doctor_id": appointment["doctor_id"],
            "starts_at": payload.starts_at,
            "status": {"$nin": ["cancelled", "completed"]},
            "id": {"$ne": payload.appointment_id},
        })
        if conflict:
            raise HTTPException(409, "Doctor is already booked for that requested time slot")

        await db["appointments"].update_one(
            {"tenant_id": principal.tenant_id, "id": payload.appointment_id},
            {"$set": {"starts_at": payload.starts_at, "status": "rescheduled", "rescheduled_by": principal.user_id, "rescheduled_at": now, "reschedule_reason": payload.reason}},
        )

    elif action_type == "send_instructions":
        recipient_id = appointment.get("patient_id")
        if recipient_id:
            await db["notifications"].insert_one({
                "id": str(uuid4()),
                "tenant_id": principal.tenant_id,
                "recipient_id": recipient_id,
                "type": "booking_instructions",
                "title": f"Appointment #{payload.appointment_id} Booking Confirmation & Access Guide",
                "message": f"Your appointment is confirmed for {appointment.get('starts_at')}. Access your video room from My Appointments 10 minutes prior.",
                "read_at": None,
                "created_at": now,
            })

    elif action_type == "escalate_scheduling":
        if payload.ticket_id:
            await db["support_tickets"].update_one(
                {"tenant_id": principal.tenant_id, "id": payload.ticket_id},
                {"$set": {"status": "escalated", "escalated_to": "Clinic Admin", "priority": "high", "updated_at": now}},
            )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": f"support.booking.{action_type}",
        "target_id": payload.appointment_id,
        "metadata": {"reason": payload.reason, "starts_at": payload.starts_at, "ticket_id": payload.ticket_id},
        "created_at": now,
    })

    return {"status": "success", "action": action_type}


class VideoActionRequest(BaseModel):
    session_id: str
    action: str = Field(pattern="^(send_permission_guide|send_connectivity_guide|end_stalled_session|escalate_technical_ops)$")
    ticket_id: str | None = None
    note: str | None = None


# ============================================================================
# Screen 5: Video Consultation & WebRTC Diagnostics
# ============================================================================

@router.get("/video-diagnostics")
async def video_diagnostics(
    query: str = Query(..., min_length=2),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    search_term = query.strip()

    session = await db["consultation_sessions"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [
            {"id": search_term},
            {"appointment_id": search_term},
            {"id": {"$regex": search_term, "$options": "i"}},
            {"appointment_id": {"$regex": search_term, "$options": "i"}},
        ],
    })

    if not session:
        appointment = await db["appointments"].find_one({"tenant_id": principal.tenant_id, "id": search_term})
        if appointment:
            session = {
                "id": f"SESS-{appointment['id']}",
                "appointment_id": appointment["id"],
                "status": "waiting" if appointment.get("status") == "booked" else appointment.get("status", "ended"),
                "created_at": datetime.now(UTC),
            }
        else:
            raise HTTPException(404, "Video consultation session not found for diagnostics")

    session_id = session["id"]
    appointment_id = session.get("appointment_id", "")
    appointment = await db["appointments"].find_one({"tenant_id": principal.tenant_id, "id": appointment_id}) if appointment_id else None

    connection_events = [_clean(x) async for x in db["audit_logs"].find({
        "tenant_id": principal.tenant_id,
        "$or": [{"target_id": session_id}, {"target_id": appointment_id}],
        "action": {"$regex": r"^(video|consultation|webrtc|signal)"},
    }).sort("created_at", -1)]

    status_str = session.get("status", "waiting")
    error_cat = session.get("error_category")
    if not error_cat:
        if status_str == "stalled":
            error_cat = "Peer Connection Stalled"
        elif status_str == "waiting" and appointment and appointment.get("status") == "booked":
            error_cat = "Participant Not Connected / Waiting"
        elif session.get("signaling_error"):
            error_cat = "Signaling Connection Timeout"
        else:
            error_cat = "None"

    # Important Privacy Restriction (PRD 9.3):
    # Support MUST NOT join private consultations as a hidden participant or access clinical audio/video content!
    return {
        "consultation_id": session_id,
        "appointment_id": appointment_id,
        "participant": {
            "patient_name": appointment.get("patient_name") if appointment else "Patient",
            "doctor_name": appointment.get("doctor_name") if appointment else "Doctor",
        },
        "session_status": status_str,
        "signaling_status": session.get("signaling_status", "Connected" if status_str == "active" else "Disconnected"),
        "camera_permission": session.get("camera_permission", "Granted" if status_str == "active" else "Unknown"),
        "microphone_permission": session.get("microphone_permission", "Granted" if status_str == "active" else "Unknown"),
        "error_category": error_cat,
        "disconnect_time": session.get("ended_at") or session.get("disconnect_time") or None,
        "connection_events": connection_events,
    }


@router.post("/video-action")
async def video_support_action(
    payload: VideoActionRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, str]:
    db = mongo_database.database()
    now = datetime.now(UTC)
    action_type = payload.action

    session = await db["consultation_sessions"].find_one({"tenant_id": principal.tenant_id, "id": payload.session_id})
    appointment_id = session.get("appointment_id") if session else payload.session_id.replace("SESS-", "")
    appointment = await db["appointments"].find_one({"tenant_id": principal.tenant_id, "id": appointment_id}) if appointment_id else None

    if action_type == "send_permission_guide":
        recipient_id = appointment.get("patient_id") if appointment else None
        if recipient_id:
            await db["notifications"].insert_one({
                "id": str(uuid4()),
                "tenant_id": principal.tenant_id,
                "recipient_id": recipient_id,
                "type": "video_permission_guide",
                "title": "Camera & Microphone Permission Guide",
                "message": "Click the lock icon near your browser address bar → ensure Camera & Microphone are set to 'Allow' → refresh your video page.",
                "read_at": None,
                "created_at": now,
            })

    elif action_type == "send_connectivity_guide":
        recipient_id = appointment.get("patient_id") if appointment else None
        if recipient_id:
            await db["notifications"].insert_one({
                "id": str(uuid4()),
                "tenant_id": principal.tenant_id,
                "recipient_id": recipient_id,
                "type": "video_connectivity_guide",
                "title": "WebRTC Network & Device Checklist",
                "message": "Check your internet connection, switch to Chrome or Safari, disable VPN/adblockers, and ensure no other application is using your camera.",
                "read_at": None,
                "created_at": now,
            })

    elif action_type == "end_stalled_session":
        if session:
            await db["consultation_sessions"].update_one(
                {"tenant_id": principal.tenant_id, "id": payload.session_id},
                {"$set": {"status": "ended", "ended_by_support": True, "ended_at": now}},
            )

    elif action_type == "escalate_technical_ops":
        if payload.ticket_id:
            await db["support_tickets"].update_one(
                {"tenant_id": principal.tenant_id, "id": payload.ticket_id},
                {"$set": {"status": "escalated", "escalated_to": "Engineering", "priority": "urgent", "updated_at": now}},
            )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": f"support.video.{action_type}",
        "target_id": payload.session_id,
        "metadata": {"ticket_id": payload.ticket_id, "note": payload.note},
        "created_at": now,
    })

    return {"status": "success", "action": action_type}


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

@router.get("/agents")
async def active_support_agents(
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    query: dict[str, Any] = {
        "tenant_id": principal.tenant_id,
        "role": "support",
        "active": {"$ne": False},
    }
    if principal.clinic_id:
        query["clinic_id"] = principal.clinic_id

    agents = []
    async for user in db["users"].find(query).sort("full_name", 1):
        agents.append({
            "id": str(user["id"]),
            "full_name": user.get("full_name") or user.get("name") or user.get("email") or "Support Agent",
            "email": user.get("email", ""),
        })
    return {"items": agents, "total": len(agents)}


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
    query: dict[str, Any] = _build_tenant_query(principal)
    if status:
        query["status"] = {"$regex": f"^{status}$", "$options": "i"}
    if priority:
        query["priority"] = {"$regex": f"^{priority}$", "$options": "i"}
    if category:
        query["category"] = {"$regex": f"^{category}$", "$options": "i"}
    items = [_clean(x) async for x in db["support_tickets"].find(query).sort("created_at", -1).skip(offset).limit(limit)]
    for item in items:
        await preserve_ticket_sla_deadline(db, item)
        t_id = item.get("id") or item.get("ticket_id")
        if t_id:
            esc = await db["escalations"].find_one({"tenant_id": principal.tenant_id, "original_ticket_id": t_id})
            if esc:
                item["escalation_id"] = esc.get("id")
                item["escalation_status"] = esc.get("status")
                if esc.get("status") == "RESOLVED":
                    item["escalation_resolved"] = True
                    item["escalation_resolved_team"] = esc.get("destination_team") or "Engineering"
        item["sla"] = ticket_sla_info(item)
    total = await db["support_tickets"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


async def dispatch_support_notification(
    db: Any,
    tenant_id: str,
    recipient_id: str | None,
    notif_type: str,
    title: str,
    message: str,
) -> None:
    if not recipient_id:
        return
    now = datetime.now(UTC)
    clean_message = message.replace("password_hash", "***").replace("mfa_secret", "***")
    await db["notifications"].insert_one({
        "id": str(uuid4()),
        "tenant_id": tenant_id,
        "recipient_id": recipient_id,
        "type": notif_type,
        "title": title,
        "message": clean_message,
        "read_at": None,
        "created_at": now,
    })


@router.post("/tickets")
async def create_support_ticket(
    payload: TicketCreate,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    ticket_id = f"SUP-{secrets_ticket_id()}"
    now = datetime.now(UTC)

    cat, prio = auto_triage_ticket(payload.category, payload.subject, payload.description, payload.priority)
    req_id = payload.requester_id or payload.patient_id or payload.doctor_id or principal.user_id
    req_name = payload.requester_name or payload.reporter_name or "Anonymous Requester"
    req_email = payload.requester_email or payload.reporter_email or ""
    req_role = (payload.requester_role or payload.user_type or "PATIENT").upper()

    history_entry = {
        "id": str(uuid4()),
        "action": "ticket_created",
        "actor_id": principal.user_id,
        "details": f"Support ticket created and triaged as {cat.upper()} ({prio.upper()} Priority) for {req_name} ({req_role})",
        "created_at": now.isoformat(),
    }

    ticket_doc = {
        "id": ticket_id,
        "ticket_id": ticket_id,
        "tenant_id": principal.tenant_id,
        "clinic_id": principal.clinic_id,
        "requester_id": req_id,
        "requester_name": req_name,
        "requester_email": req_email,
        "requester_role": req_role,
        "patient_id": payload.patient_id or (req_id if req_role == "PATIENT" else None),
        "doctor_id": payload.doctor_id or (req_id if req_role == "DOCTOR" else None),
        "appointment_id": payload.appointment_id or payload.related_record_id,
        "reporter_name": req_name,
        "reporter_email": req_email,
        "user_type": req_role.lower(),
        "subject": payload.subject,
        "description": payload.description,
        "category": cat.upper(),
        "priority": prio.upper(),
        "sla_priority": prio.lower(),
        "sla_due_at": calculate_sla_due_at(now, prio),
        "status": "OPEN",
        "created_by": principal.user_id,          # Logged-in support agent ID
        "created_by_agent_id": principal.user_id, # Explicit support agent reference
        "assigned_to": principal.user_id,         # Logged-in support agent
        "escalated_to": None,
        "related_resources": {
            "appointment_id": payload.appointment_id or payload.related_record_id,
            "doctor_id": payload.doctor_id,
            "related_record_id": payload.related_record_id,
        },
        "version": 1,
        "notes": [],
        "history": [history_entry],
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
    }

    insert_result = await db["support_tickets"].insert_one(ticket_doc)
    if not insert_result.acknowledged:
        raise HTTPException(503, "Support ticket could not be persisted")
    await db["support_ticket_events"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "ticket_id": ticket_id,
        "action": "ticket_created",
        "actor_id": principal.user_id,
        "details": f"Ticket created with category {cat.upper()} and priority {prio.upper()}",
        "created_at": now.isoformat(),
    })

    # Trigger 1: Ticket Created Confirmation to Requester (PRD Section 16)
    await dispatch_support_notification(
        db, principal.tenant_id, req_id,
        "support_ticket_created",
        f"Support Ticket #{ticket_id} Received",
        f"Your support request '{payload.subject}' has been received and assigned reference #{ticket_id}."
    )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "support_ticket.created",
        "target_id": ticket_id,
        "metadata": {"category": cat, "priority": prio},
        "created_at": now,
    })
    persisted_ticket = await db["support_tickets"].find_one({
        "tenant_id": principal.tenant_id,
        "id": ticket_id,
    })
    if not persisted_ticket:
        raise HTTPException(503, "Support ticket persistence could not be confirmed")

    res = _clean(persisted_ticket)
    res["sla"] = ticket_sla_info(res)
    res["persistence_confirmed"] = True
    return res


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
    if not ticket.get("sla_due_at"):
        original_priority = str(ticket.get("sla_priority") or ticket.get("priority") or "medium").lower()
        original_created_at = _as_utc_datetime(ticket.get("created_at"), fallback=now)
        updates["sla_priority"] = original_priority
        updates["sla_due_at"] = calculate_sla_due_at(original_created_at, original_priority)
    actor_name = await resolve_actor_name(db, principal.tenant_id, principal.user_id)
    history_logs = []
    assignment_changed = False
    assigned_agent: dict[str, Any] | None = None

    if payload.status:
        st_lower = payload.status.lower()
        st_upper = payload.status.upper()
        updates["status"] = st_lower
        if st_lower in {"resolved", "closed"}:
            res_summary = (payload.note or "").strip()
            if not res_summary and ticket.get("notes"):
                res_summary = ticket["notes"][-1].get("text", "")
            if not res_summary:
                res_summary = ticket.get("resolution_summary") or ticket.get("description") or f"Marked as {st_upper} by support agent"
            updates["resolved_at"] = now
            updates["resolved_by"] = principal.user_id

            history_logs.append({
                "id": str(uuid4()),
                "action": "ticket_resolution_verified",
                "actor_id": principal.user_id,
                "actor_name": actor_name,
                "details": f"Ticket Resolution Verified by Support Agent ({actor_name})",
                "created_at": now.isoformat(),
            })
            history_logs.append({
                "id": str(uuid4()),
                "action": "status_changed",
                "actor_id": principal.user_id,
                "actor_name": actor_name,
                "details": f"Support Ticket Status Changed to Resolved. Resolution: {res_summary}",
                "created_at": (now + timedelta(milliseconds=10)).isoformat(),
            })
        else:
            history_logs.append({
                "id": str(uuid4()),
                "action": "status_changed",
                "actor_id": principal.user_id,
                "actor_name": actor_name,
                "details": f"Status updated to {st_upper.replace('_', ' ').title()}",
                "created_at": now.isoformat(),
            })

    if payload.priority:
        updates["priority"] = payload.priority
        history_logs.append({
            "id": str(uuid4()),
            "action": "priority_changed",
            "actor_id": principal.user_id,
            "details": f"Priority updated to {payload.priority.title()}",
            "created_at": now.isoformat(),
        })

    if "assigned_to" in payload.model_fields_set:
        new_assignee_id = (payload.assigned_to or "").strip() or None
        previous_assignee_id = ticket.get("assigned_to") or None
        if new_assignee_id:
            agent_query: dict[str, Any] = {
                "tenant_id": principal.tenant_id,
                "$or": [{"id": new_assignee_id}, {"user_id": new_assignee_id}],
                "role": {"$in": ["support", "clinic_admin", "admin"]},
                "active": {"$ne": False},
            }
            if principal.clinic_id:
                agent_query["clinic_id"] = principal.clinic_id
            assigned_agent = await db["users"].find_one(agent_query)
            if not assigned_agent:
                # Fallback search without strict clinic_id scoping for platform support agents
                assigned_agent = await db["users"].find_one({"tenant_id": principal.tenant_id, "$or": [{"id": new_assignee_id}, {"user_id": new_assignee_id}]})
            if not assigned_agent:
                raise HTTPException(422, "Assignee must be an active support agent")

        assignment_changed = new_assignee_id != previous_assignee_id
        updates["assigned_to"] = new_assignee_id
        previous_name = ticket.get("assigned_to_name") or previous_assignee_id or "Unassigned"
        new_name = (
            assigned_agent.get("full_name") or assigned_agent.get("email") or new_assignee_id
            if assigned_agent
            else "Unassigned"
        )
        updates["assigned_to_name"] = new_name if new_assignee_id else None
        if assignment_changed:
            action = "unassigned" if not new_assignee_id else (
                "reassigned" if previous_assignee_id else "assigned"
            )
            history_logs.append({
                "id": str(uuid4()),
                "action": action,
                "actor_id": principal.user_id,
                "details": f"Assignment changed from {previous_name} to {new_name}",
                "created_at": now.isoformat(),
            })

    if payload.escalated_to:
        updates["escalated_to"] = payload.escalated_to
        if not payload.status:
            updates["status"] = "escalated"
        history_logs.append({
            "id": str(uuid4()),
            "action": "escalated",
            "actor_id": principal.user_id,
            "details": f"Escalated to specialist team: {payload.escalated_to}",
            "created_at": now.isoformat(),
        })

    for log_item in history_logs:
        await db["support_ticket_events"].insert_one({
            "id": log_item["id"],
            "tenant_id": principal.tenant_id,
            "ticket_id": ticket_id,
            "action": log_item["action"],
            "actor_id": principal.user_id,
            "details": log_item["details"],
            "created_at": log_item["created_at"],
        })

    if payload.note:
        note_entry = {
            "id": str(uuid4()),
            "author_id": principal.user_id,
            "text": payload.note,
            "created_at": now.isoformat(),
        }
        history_logs.append({
            "id": str(uuid4()),
            "action": "note_added",
            "actor_id": principal.user_id,
            "details": "Internal support note added",
            "created_at": now.isoformat(),
        })
        await db["support_ticket_events"].insert_one({
            "id": note_entry["id"],
            "tenant_id": principal.tenant_id,
            "ticket_id": ticket_id,
            "action": "note_added",
            "actor_id": principal.user_id,
            "details": payload.note,
            "created_at": now.isoformat(),
        })
        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": ticket_id},
            {"$push": {"notes": note_entry, "history": {"$each": history_logs}}, "$set": updates},
        )
    elif history_logs:
        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": ticket_id},
            {"$push": {"history": {"$each": history_logs}}, "$set": updates},
        )
    else:
        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": ticket_id},
            {"$set": updates},
        )

    if payload.escalated_to:
        await ensure_ticket_escalation(
            db,
            {**ticket, **updates, "escalated_to": payload.escalated_to},
            actor_id=principal.user_id,
            clinic_id=principal.clinic_id,
            now=now,
        )

    # PRD Section 16 Specific Notification Dispatch Triggers
    req_id = ticket.get("requester_id") or ticket.get("patient_id") or ticket.get("created_by")
    notification_assignee = payload.assigned_to or ticket.get("assigned_to")

    if assignment_changed and payload.assigned_to:
        # Trigger 2: Ticket assigned -> Alert to support agent
        await dispatch_support_notification(
            db, principal.tenant_id, payload.assigned_to,
            "support_ticket_assigned",
            f"Ticket #{ticket_id} Assigned to You",
            f"Support ticket #{ticket_id} ('{ticket.get('subject')}') has been assigned to you."
        )

    if payload.status:
        st_upper = payload.status.upper()
        if st_upper == "WAITING_FOR_USER":
            # Trigger 3: Agent requests info -> Message to requester
            await dispatch_support_notification(
                db, principal.tenant_id, req_id,
                "support_ticket_info_requested",
                f"Action Required: Ticket #{ticket_id}",
                f"Support agent requested additional information regarding ticket '{ticket.get('subject')}'. Please reply in your Help & Support portal."
            )
        elif st_upper == "RESOLVED":
            # Trigger 6: Ticket resolved -> Resolution notification to requester
            await dispatch_support_notification(
                db, principal.tenant_id, req_id,
                "support_ticket_resolved",
                f"Support Ticket #{ticket_id} Resolved",
                f"Your support ticket #{ticket_id} ('{ticket.get('subject')}') has been resolved."
            )
        elif st_upper == "REOPENED":
            # Trigger 7: Ticket reopened -> Alert to assigned agent
            await dispatch_support_notification(
                db, principal.tenant_id, notification_assignee,
                "support_ticket_reopened",
                f"Support Ticket #{ticket_id} Reopened",
                f"Ticket #{ticket_id} ('{ticket.get('subject')}') was reopened."
            )
        elif st_upper == "CLOSED":
            # Trigger 8: Ticket closed -> Closure confirmation to requester
            await dispatch_support_notification(
                db, principal.tenant_id, req_id,
                "support_ticket_closed",
                f"Support Ticket #{ticket_id} Closed",
                f"Support ticket #{ticket_id} has been closed."
            )

    if payload.escalated_to:
        # Trigger 4: Ticket escalated -> Notification to destination team
        await dispatch_support_notification(
            db, principal.tenant_id, payload.escalated_to,
            "support_ticket_escalated",
            f"Support Ticket #{ticket_id} Escalated",
            f"Ticket #{ticket_id} ('{ticket.get('subject')}') has been escalated to {payload.escalated_to}."
        )

    audit_metadata = {
        "status": payload.status,
        "priority": payload.priority,
        "escalated_to": payload.escalated_to,
    }
    audit_action = "support_ticket.updated"
    if assignment_changed:
        audit_action = "support_ticket.assignment_changed"
        audit_metadata.update({
            "previous_assigned_to": ticket.get("assigned_to"),
            "assigned_to": updates.get("assigned_to"),
            "assigned_to_name": updates.get("assigned_to_name"),
        })

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": audit_action,
        "target_id": ticket_id,
        "metadata": audit_metadata,
        "created_at": now,
    })

    updated_ticket = await db["support_tickets"].find_one({"tenant_id": principal.tenant_id, "id": ticket_id})
    res = _clean(updated_ticket or {})
    res["sla"] = ticket_sla_info(res)
    return res


def secrets_ticket_id() -> str:
    import secrets
    return f"{secrets.randbelow(899999) + 100000}"


class EscalationCreate(BaseModel):
    original_ticket_id: str = Field(min_length=3, max_length=100)
    escalation_category: str = Field(min_length=3, max_length=50) # account_security, video_infrastructure, refund_approval, doctor_approval, platform_outage, privacy_concern, application_defect
    destination_team: str = Field(min_length=3, max_length=100)  # Security & Operations, Technical Operations, Authorized Finance, Clinic Administrator, Operations, Security / Privacy Officer, Engineering
    priority: str = Field(default="high", max_length=20)          # low, medium, high, urgent
    reason: str = Field(min_length=3, max_length=1000)
    impact_description: str = Field(min_length=3, max_length=1000)
    supporting_references: dict[str, Any] | None = None
    expected_follow_up: str | None = Field(default="4 hours", max_length=50)
    incident_id: str | None = None                                # e.g. INC-8821


class EscalationUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(PENDING|ACCEPTED|IN_PROGRESS|REASSIGNED|REJECTED|RESOLVED|CLOSED)$")
    assigned_owner: str | None = None
    destination_team: str | None = None
    rejection_reason: str | None = Field(default=None, max_length=1000)
    incident_id: str | None = None
    resolution_summary: str | None = Field(default=None, max_length=1000)
    note: str | None = Field(default=None, max_length=1000)


ESCALATION_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"ACCEPTED", "IN_PROGRESS", "REASSIGNED", "RESOLVED", "REJECTED"},
    "ACCEPTED": {"IN_PROGRESS", "REASSIGNED", "RESOLVED", "REJECTED"},
    "IN_PROGRESS": {"REASSIGNED", "RESOLVED", "REJECTED"},
    "REASSIGNED": {"ACCEPTED", "IN_PROGRESS", "RESOLVED", "REJECTED"},
    "RESOLVED": {"CLOSED"},
    "REJECTED": set(),
    "CLOSED": set(),
}


ESCALATION_TEAM_MAP = {
    "account_security": "Security & Operations",
    "video_infrastructure": "Technical Operations",
    "refund_approval": "Authorized Finance",
    "doctor_approval": "Clinic Administrator",
    "platform_outage": "Operations",
    "privacy_concern": "Security / Privacy Officer",
    "application_defect": "Engineering",
}


async def ensure_ticket_escalation(
    db: Any,
    ticket: dict[str, Any],
    *,
    actor_id: str,
    clinic_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Persist one escalation record for an escalated support ticket."""
    ticket_id = str(ticket.get("id") or ticket.get("ticket_id") or "")
    tenant_id = str(ticket.get("tenant_id") or "")
    destination_team = str(ticket.get("escalated_to") or "").strip()
    if not ticket_id or not tenant_id or not destination_team:
        return None

    existing = await db["escalations"].find_one({
        "tenant_id": tenant_id,
        "original_ticket_id": ticket_id,
    })
    if existing:
        return existing

    timestamp = now or datetime.now(UTC)
    escalation_id = f"ESC-{secrets_ticket_id()}"
    priority = str(ticket.get("priority") or "high").lower()
    category = str(ticket.get("category") or "general").lower()
    issue = str(ticket.get("description") or ticket.get("subject") or "Escalated support issue")
    history_entry = {
        "id": str(uuid4()),
        "action": "escalation_created",
        "actor_id": actor_id,
        "details": f"Escalated to {destination_team} (Status: PENDING)",
        "created_at": timestamp.isoformat(),
    }
    doc = {
        "id": escalation_id,
        "tenant_id": tenant_id,
        "clinic_id": ticket.get("clinic_id") or clinic_id,
        "original_ticket_id": ticket_id,
        "ticket_subject": ticket.get("subject", ""),
        "issue": issue,
        "escalation_category": category,
        "destination_team": destination_team,
        "priority": priority,
        "reason": issue,
        "impact_description": issue,
        "status": "PENDING",
        "assigned_owner": None,
        "rejection_reason": None,
        "incident_id": None,
        "supporting_references": {
            "patient_id": ticket.get("patient_id"),
            "doctor_id": ticket.get("doctor_id"),
            "appointment_id": ticket.get("appointment_id"),
        },
        "expected_follow_up": "4 hours",
        "notes": [],
        "history": [history_entry],
        "created_by": actor_id,
        "created_at": timestamp,
        "escalation_timestamp": timestamp,
        "updated_at": timestamp,
        "source": "ticket_escalation",
    }
    result = await db["escalations"].insert_one(doc)
    if not result.acknowledged:
        raise HTTPException(503, "Escalation record could not be persisted")

    await db["support_tickets"].update_one(
        {"tenant_id": tenant_id, "id": ticket_id},
        {"$set": {"escalation_id": escalation_id, "updated_at": timestamp}},
    )
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": tenant_id,
        "actor_id": actor_id,
        "action": "escalation.created",
        "target_id": escalation_id,
        "metadata": {
            "ticket_id": ticket_id,
            "team": destination_team,
            "priority": priority,
            "source": "ticket_escalation",
        },
        "created_at": timestamp,
    })
    return doc


# ============================================================================
# Screen 6: Inter-Team Escalations Management (PRD Section 10)
# ============================================================================

@router.get("/escalations")
async def list_escalations(
    status: str = "",
    destination_team: str = "",
    priority: str = "",
    ticket_id: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    escalated_tickets = db["support_tickets"].find({
        "tenant_id": principal.tenant_id,
        "escalated_to": {"$nin": [None, ""]},
    })
    async for ticket in escalated_tickets:
        await ensure_ticket_escalation(
            db,
            ticket,
            actor_id=principal.user_id,
            clinic_id=principal.clinic_id,
        )

    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status:
        query["status"] = status
    if destination_team:
        query["destination_team"] = destination_team
    if priority:
        query["priority"] = priority
    if ticket_id:
        query["original_ticket_id"] = ticket_id

    items = [_clean(x) async for x in db["escalations"].find(query).sort("created_at", -1).skip(offset).limit(limit)]
    total = await db["escalations"].count_documents(query)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/escalations")
async def create_escalation(
    payload: EscalationCreate,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    ticket = await db["support_tickets"].find_one({"tenant_id": principal.tenant_id, "id": payload.original_ticket_id})
    if not ticket:
        raise HTTPException(404, "Original support ticket not found")
    existing = await db["escalations"].find_one({
        "tenant_id": principal.tenant_id,
        "original_ticket_id": payload.original_ticket_id,
    })
    if existing:
        return _clean(existing)

    now = datetime.now(UTC)
    escalation_id = f"ESC-{secrets_ticket_id()}"
    team = payload.destination_team or ESCALATION_TEAM_MAP.get(payload.escalation_category, "Engineering")

    history_entry = {
        "id": str(uuid4()),
        "action": "escalation_created",
        "actor_id": principal.user_id,
        "details": f"Escalated to {team} (Status: PENDING)",
        "created_at": now.isoformat(),
    }

    doc = {
        "id": escalation_id,
        "tenant_id": principal.tenant_id,
        "clinic_id": principal.clinic_id,
        "original_ticket_id": payload.original_ticket_id,
        "ticket_subject": ticket.get("subject", ""),
        "issue": ticket.get("description") or payload.reason,
        "escalation_category": payload.escalation_category,
        "destination_team": team,
        "priority": payload.priority,
        "reason": payload.reason,
        "impact_description": payload.impact_description,
        "status": "PENDING",
        "assigned_owner": None,
        "rejection_reason": None,
        "incident_id": payload.incident_id,
        "supporting_references": payload.supporting_references or {
            "patient_id": ticket.get("patient_id"),
            "doctor_id": ticket.get("doctor_id"),
            "appointment_id": ticket.get("appointment_id"),
        },
        "expected_follow_up": payload.expected_follow_up or "4 hours",
        "notes": [],
        "history": [history_entry],
        "created_by": principal.user_id,
        "created_at": now,
        "escalation_timestamp": now,
        "updated_at": now,
    }

    await db["escalations"].insert_one(doc)

    ticket_history_entry = {
        "id": str(uuid4()),
        "action": "escalated",
        "actor_id": principal.user_id,
        "details": f"Escalated via {escalation_id} to {team} ({payload.priority.upper()})",
        "created_at": now.isoformat(),
    }
    await db["support_tickets"].update_one(
        {"tenant_id": principal.tenant_id, "id": payload.original_ticket_id},
        {"$set": {"status": "escalated", "escalated_to": team, "priority": payload.priority, "updated_at": now},
         "$push": {"history": ticket_history_entry}},
    )

    # Trigger 4: Ticket escalated -> Notification to destination team (PRD Section 16)
    await dispatch_support_notification(
        db, principal.tenant_id, team,
        "support_ticket_escalated",
        f"Escalation {escalation_id} to {team}",
        f"Ticket #{payload.original_ticket_id} ('{ticket.get('subject')}') escalated to {team}."
    )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "escalation.created",
        "target_id": escalation_id,
        "metadata": {"ticket_id": payload.original_ticket_id, "team": team, "priority": payload.priority},
        "created_at": now,
    })

    return _clean(doc)


@router.patch("/escalations/{escalation_id}")
async def update_escalation(
    escalation_id: str,
    payload: EscalationUpdate,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    esc = await db["escalations"].find_one({"tenant_id": principal.tenant_id, "id": escalation_id})
    if not esc:
        raise HTTPException(404, "Escalation record not found")

    now = datetime.now(UTC)
    updates: dict[str, Any] = {"updated_at": now}
    history_logs = []
    current_status = str(esc.get("status") or "PENDING").upper()
    requested_status = payload.status
    if payload.destination_team:
        requested_status = "REASSIGNED"
    elif payload.assigned_owner and (not requested_status or requested_status == "PENDING"):
        requested_status = "ACCEPTED"

    if requested_status == current_status:
        raise HTTPException(409, f"Escalation is already {current_status}")
    if requested_status:
        allowed_statuses = ESCALATION_STATUS_TRANSITIONS.get(current_status, set())
        if requested_status not in allowed_statuses:
            raise HTTPException(
                409,
                f"Escalation cannot transition from {current_status} to {requested_status}",
            )

    if payload.status:
        if payload.status == "REJECTED" and not payload.rejection_reason:
            raise HTTPException(422, "A rejection_reason is required when status is REJECTED")
        if payload.status == "RESOLVED" and not (payload.resolution_summary or "").strip():
            raise HTTPException(422, "A resolution_summary is required when status is RESOLVED")
        updates["status"] = payload.status
        status_details = f"Escalation status changed to {payload.status}"
        if payload.status == "RESOLVED":
            status_details = f"Escalation resolved: {payload.resolution_summary.strip()}"
        history_logs.append({
            "id": str(uuid4()),
            "action": f"status_{payload.status.lower()}",
            "actor_id": principal.user_id,
            "details": status_details,
            "created_at": now.isoformat(),
        })
        if payload.status == "RESOLVED":
            updates["resolved_at"] = now
            updates["resolved_by"] = principal.user_id

    if payload.assigned_owner:
        updates["assigned_owner"] = payload.assigned_owner
        if not payload.status or payload.status == "PENDING":
            updates["status"] = "ACCEPTED"

    if payload.destination_team:
        updates["destination_team"] = payload.destination_team
        updates["status"] = "REASSIGNED"

    if payload.rejection_reason:
        updates["rejection_reason"] = payload.rejection_reason

    if payload.incident_id:
        updates["incident_id"] = payload.incident_id

    if payload.resolution_summary:
        updates["resolution_summary"] = payload.resolution_summary.strip()

    if payload.note:
        note_entry = {
            "id": str(uuid4()),
            "author_id": principal.user_id,
            "text": payload.note,
            "created_at": now.isoformat(),
        }
        await db["escalations"].update_one(
            {"tenant_id": principal.tenant_id, "id": escalation_id},
            {"$push": {"notes": note_entry, "history": {"$each": history_logs}}, "$set": updates},
        )
    elif history_logs:
        await db["escalations"].update_one(
            {"tenant_id": principal.tenant_id, "id": escalation_id},
            {"$push": {"history": {"$each": history_logs}}, "$set": updates},
        )
    else:
        await db["escalations"].update_one(
            {"tenant_id": principal.tenant_id, "id": escalation_id},
            {"$set": updates},
        )

    if requested_status == "ACCEPTED":
        team_name = esc.get("destination_team") or "Specialist Team"
        acc_details = f"{team_name} Escalation Accepted"
        ticket_accepted_entry = {
            "id": str(uuid4()),
            "action": "escalation_accepted",
            "actor_id": principal.user_id,
            "details": acc_details,
            "created_at": now.isoformat(),
        }
        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": esc["original_ticket_id"]},
            {"$push": {"history": ticket_accepted_entry}},
        )
        await db["support_ticket_events"].insert_one({
            "id": ticket_accepted_entry["id"],
            "tenant_id": principal.tenant_id,
            "ticket_id": esc["original_ticket_id"],
            "action": "escalation_accepted",
            "actor_id": principal.user_id,
            "details": acc_details,
            "created_at": now.isoformat(),
        })

    if payload.status == "RESOLVED":
        team_name = esc.get("destination_team") or "Specialist Team"
        res_summary = (payload.resolution_summary or "").strip()
        esc_resolved_details = f"{team_name} Escalation Resolved: {res_summary}" if res_summary else f"{team_name} Escalation Resolved"

        ticket_resolved_entry = {
            "id": str(uuid4()),
            "action": "escalation_resolved",
            "actor_id": principal.user_id,
            "details": esc_resolved_details,
            "created_at": now.isoformat(),
        }
        ticket_status_entry = {
            "id": str(uuid4()),
            "action": "status_changed",
            "actor_id": principal.user_id,
            "details": "Support ticket returned to IN_PROGRESS for agent verification",
            "created_at": (now + timedelta(milliseconds=10)).isoformat(),
        }

        orig_ticket = await db["support_tickets"].find_one({
            "tenant_id": principal.tenant_id,
            "id": esc["original_ticket_id"],
        })
        orig_status = str(orig_ticket.get("status") or "open").lower() if orig_ticket else "open"

        ticket_set_dict: dict[str, Any] = {"updated_at": now, "escalation_resolved": True}
        history_push = [ticket_resolved_entry]

        if orig_status in {"escalated", "open", "new"}:
            ticket_set_dict["status"] = "in_progress"
            history_push.append(ticket_status_entry)

        await db["support_tickets"].update_one(
            {"tenant_id": principal.tenant_id, "id": esc["original_ticket_id"]},
            {
                "$set": ticket_set_dict,
                "$push": {"history": {"$each": history_push}},
            },
        )

        await db["support_ticket_events"].insert_one({
            "id": ticket_resolved_entry["id"],
            "tenant_id": principal.tenant_id,
            "ticket_id": esc["original_ticket_id"],
            "action": "escalation_resolved",
            "actor_id": principal.user_id,
            "details": esc_resolved_details,
            "created_at": now.isoformat(),
        })

        if orig_status in {"escalated", "open", "new"}:
            await db["support_ticket_events"].insert_one({
                "id": ticket_status_entry["id"],
                "tenant_id": principal.tenant_id,
                "ticket_id": esc["original_ticket_id"],
                "action": "status_changed",
                "actor_id": principal.user_id,
                "details": "Support ticket returned to IN_PROGRESS for agent verification",
                "created_at": (now + timedelta(milliseconds=10)).isoformat(),
            })

    # Trigger 5: Escalation updated -> Update to relevant support owner (PRD Section 16)
    owner_id = esc.get("created_by") or esc.get("assigned_owner") or principal.user_id
    if payload.status or payload.assigned_owner or payload.resolution_summary:
        await dispatch_support_notification(
            db, principal.tenant_id, owner_id,
            "escalation_updated",
            f"Escalation {escalation_id} Updated",
            f"Escalation {escalation_id} status updated to {payload.status or 'In Progress'}."
        )

    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "escalation.updated",
        "target_id": escalation_id,
        "metadata": {
            "status": payload.status,
            "owner": payload.assigned_owner,
            "resolution_summary": updates.get("resolution_summary"),
        },
        "created_at": now,
    })

    updated_esc = await db["escalations"].find_one({"tenant_id": principal.tenant_id, "id": escalation_id})
    return _clean(updated_esc or {})


# ============================================================================
# Screen 7: Support Audit History & Export (PRD Section 11)
# ============================================================================

@router.get("/audit-history")
async def support_audit_history(
    start_date: str = "",
    end_date: str = "",
    actor_id: str = "",
    ticket_id: str = "",
    action: str = "",
    resource: str = "",
    result_filter: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    try:
        db = mongo_database.database()
        tenant_q = _build_tenant_query(principal)
        clauses: list[dict[str, Any]] = [tenant_q]

        if start_date or end_date:
            date_range: dict[str, datetime] = {}
            if start_date:
                date_range["$gte"] = _as_utc_datetime(f"{start_date}T00:00:00+00:00")
            if end_date:
                date_range["$lte"] = _as_utc_datetime(f"{end_date}T23:59:59.999999+00:00")
            clauses.append({"$or": [
                {"created_at": date_range},
                {"occurred_at": date_range},
            ]})

        if actor_id:
            clauses.append({"$or": [
                {"actor_id": {"$regex": actor_id, "$options": "i"}},
                {"actor_name": {"$regex": actor_id, "$options": "i"}},
            ]})

        if ticket_id:
            clauses.append({"$or": [
                {"target_id": ticket_id},
                {"ticket_id": ticket_id},
                {"metadata.ticket_id": ticket_id},
                {"metadata.original_ticket_id": ticket_id},
            ]})

        if action:
            clauses.append({"action": {"$regex": action, "$options": "i"}})

        query: dict[str, Any] = clauses[0] if len(clauses) == 1 else {"$and": clauses}

        audit_raw = [_clean(x) async for x in db["audit_logs"].find(query).sort("created_at", -1).limit(300)]

        ticket_events_query: dict[str, Any] = {**tenant_q}
        if ticket_id:
            ticket_events_query["ticket_id"] = ticket_id
        if actor_id:
            ticket_events_query["actor_id"] = {"$regex": actor_id, "$options": "i"}

        ticket_events_raw = [_clean(x) async for x in db["support_ticket_events"].find(ticket_events_query).sort("created_at", -1).limit(300)]

        merged_map: dict[str, dict[str, Any]] = {}

        for log in audit_raw:
            eid = log.get("id") or str(uuid4())
            merged_map[eid] = log

        for evt in ticket_events_raw:
            eid = evt.get("id") or str(uuid4())
            if eid not in merged_map:
                merged_map[eid] = {
                    "id": eid,
                    "tenant_id": evt.get("tenant_id"),
                    "actor_id": evt.get("actor_id"),
                    "actor_name": evt.get("actor_name"),
                    "action": f"support_ticket.{evt.get('action')}",
                    "target_id": evt.get("ticket_id"),
                    "metadata": {"ticket_id": evt.get("ticket_id"), "details": evt.get("details")},
                    "created_at": evt.get("created_at"),
                }

        all_events = sorted(
            list(merged_map.values()),
            key=lambda x: _as_utc_datetime(x.get("created_at") or x.get("occurred_at")),
            reverse=True,
        )

        if resource:
            target_res = str(resource).strip().lower()
            if target_res == "video":
                target_res = "video_session"
            all_events = [x for x in all_events if compute_resource_category(x.get("action", "")) == target_res]

        if result_filter:
            target_res_filter = str(result_filter).strip().upper()
            if target_res_filter in {"FAILED", "FAIL", "DENIED"}:
                all_events = [x for x in all_events if compute_event_result(x).upper() in {"FAILED", "DENIED", "FAIL"}]
            elif target_res_filter in {"SUCCESS", "OK", "PASSED"}:
                all_events = [x for x in all_events if compute_event_result(x).upper() in {"SUCCESS", "OK", "PASSED"}]
            else:
                all_events = [x for x in all_events if compute_event_result(x).upper() == target_res_filter]

        paginated_events = all_events[offset : offset + limit]
        total = len(all_events)

        formatted_items = []
        for log in paginated_events:
            act = log.get("action", "")
            res_cat = compute_resource_category(act)

            meta = log.get("metadata")
            meta_dict = meta if isinstance(meta, dict) else {}
            target_id = str(log.get("target_id") or "")
            t_id = meta_dict.get("ticket_id") or (
                target_id if target_id.startswith(("TICK-", "SUP-")) else "—"
            )

            actor_id_val = log.get("actor_id", "system")
            actor_name = log.get("actor_name") or await resolve_actor_name(db, principal.tenant_id, actor_id_val)

            formatted_items.append({
                "event_id": log.get("id", str(uuid4())),
                "timestamp": log.get("created_at") or log.get("occurred_at"),
                "agent": {
                    "id": actor_id_val,
                    "name": actor_name,
                },
                "action": act,
                "ticket_id": t_id,
                "resource": res_cat,
                "result": compute_event_result(log),
                "details": meta_dict if meta_dict else {"target_id": target_id},
            })

        return {"items": formatted_items, "total": total, "offset": offset, "limit": limit}
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").error(f"Error in support_audit_history: {e}")
        return {"items": [], "total": 0, "offset": offset, "limit": limit, "error": str(e)}


class AuditExportRequest(BaseModel):
    start_date: str = ""
    end_date: str = ""
    actor_id: str = ""
    ticket_id: str = ""
    action: str = ""
    resource: str = ""
    result_filter: str = ""


@router.post("/audit-export")
@router.get("/audit-export")
async def export_support_audit(
    start_date: str = "",
    end_date: str = "",
    actor_id: str = "",
    ticket_id: str = "",
    action: str = "",
    resource: str = "",
    result_filter: str = "",
    payload: AuditExportRequest | None = None,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    try:
        db = mongo_database.database()
        now = datetime.now(UTC)

        s_date = (payload.start_date if payload else "") or start_date
        e_date = (payload.end_date if payload else "") or end_date
        a_id = (payload.actor_id if payload else "") or actor_id
        t_id = (payload.ticket_id if payload else "") or ticket_id
        act_filter = (payload.action if payload else "") or action
        res_filter = (payload.resource if payload else "") or resource
        res_result = (payload.result_filter if payload else "") or result_filter

        tenant_q = _build_tenant_query(principal)
        clauses: list[dict[str, Any]] = [tenant_q]

        if s_date or e_date:
            date_range: dict[str, datetime] = {}
            if s_date:
                date_range["$gte"] = _as_utc_datetime(f"{s_date}T00:00:00+00:00")
            if e_date:
                date_range["$lte"] = _as_utc_datetime(f"{e_date}T23:59:59.999999+00:00")
            clauses.append({"$or": [
                {"created_at": date_range},
                {"occurred_at": date_range},
            ]})

        if a_id:
            clauses.append({"$or": [
                {"actor_id": {"$regex": a_id, "$options": "i"}},
                {"actor_name": {"$regex": a_id, "$options": "i"}},
            ]})

        if t_id:
            clauses.append({"$or": [
                {"target_id": t_id},
                {"ticket_id": t_id},
                {"metadata.ticket_id": t_id},
                {"metadata.original_ticket_id": t_id},
            ]})

        if act_filter:
            clauses.append({"action": {"$regex": act_filter, "$options": "i"}})

        query: dict[str, Any] = clauses[0] if len(clauses) == 1 else {"$and": clauses}

        audit_raw = [_clean(x) async for x in db["audit_logs"].find(query).sort("created_at", -1).limit(500)]

        ticket_events_query: dict[str, Any] = {**tenant_q}
        if t_id:
            ticket_events_query["ticket_id"] = t_id
        if a_id:
            ticket_events_query["actor_id"] = {"$regex": a_id, "$options": "i"}

        ticket_events_raw = [_clean(x) async for x in db["support_ticket_events"].find(ticket_events_query).sort("created_at", -1).limit(500)]

        merged_map: dict[str, dict[str, Any]] = {}

        for log in audit_raw:
            eid = log.get("id") or str(uuid4())
            merged_map[eid] = log

        for evt in ticket_events_raw:
            eid = evt.get("id") or str(uuid4())
            if eid not in merged_map:
                merged_map[eid] = {
                    "id": eid,
                    "tenant_id": evt.get("tenant_id"),
                    "actor_id": evt.get("actor_id"),
                    "actor_name": evt.get("actor_name"),
                    "action": f"support_ticket.{evt.get('action')}",
                    "target_id": evt.get("ticket_id"),
                    "metadata": {"ticket_id": evt.get("ticket_id"), "details": evt.get("details")},
                    "created_at": evt.get("created_at"),
                }

        all_events = sorted(
            list(merged_map.values()),
            key=lambda x: _as_utc_datetime(x.get("created_at") or x.get("occurred_at")),
            reverse=True,
        )

        if res_filter:
            target_res = str(res_filter).strip().lower()
            if target_res == "video":
                target_res = "video_session"
            all_events = [x for x in all_events if compute_resource_category(x.get("action", "")) == target_res]

        if res_result:
            target_res_filter = str(res_result).strip().upper()
            if target_res_filter in {"FAILED", "FAIL", "DENIED"}:
                all_events = [x for x in all_events if compute_event_result(x).upper() in {"FAILED", "DENIED", "FAIL"}]
            elif target_res_filter in {"SUCCESS", "OK", "PASSED"}:
                all_events = [x for x in all_events if compute_event_result(x).upper() in {"SUCCESS", "OK", "PASSED"}]
            else:
                all_events = [x for x in all_events if compute_event_result(x).upper() == target_res_filter]

        await db["audit_logs"].insert_one({
            "id": str(uuid4()),
            "tenant_id": principal.tenant_id,
            "actor_id": principal.user_id,
            "action": "support.audit.exported",
            "target_id": t_id or "audit_logs",
            "metadata": {"ticket_id": t_id, "filters": {"start_date": s_date, "end_date": e_date, "actor_id": a_id, "action": act_filter, "resource": res_filter, "result": res_result}},
            "created_at": now,
        })

        csv_lines = ["Event ID,Timestamp,Actor ID,Action,Target ID,Result"]
        for x in all_events:
            eid = x.get("id") or str(uuid4())
            ts = x.get("created_at") or x.get("occurred_at") or now.isoformat()
            act_id = x.get("actor_id") or "system"
            act_name = x.get("action") or "event"
            meta_dict = x.get("metadata") if isinstance(x.get("metadata"), dict) else {}
            target = meta_dict.get("ticket_id") or x.get("target_id") or "—"
            result_val = compute_event_result(x)
            csv_lines.append(f'"{eid}","{ts}","{act_id}","{act_name}","{target}","{result_val}"')

        return {"csv_data": "\n".join(csv_lines), "filename": f"support_audit_export_{now.strftime('%Y%m%d_%H%M%S')}.csv"}
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").error(f"Error in export_support_audit: {e}")
        return {"csv_data": "Event ID,Timestamp,Actor ID,Action,Target ID,Result\n", "filename": f"support_audit_export_error.csv"}


# ============================================================================
# Section 14: PRD Explicit Route Contracts & Helper Action Aliases
# ============================================================================

class TicketAssignRequest(BaseModel):
    assigned_to: str = Field(min_length=1, max_length=100)

class TicketNoteRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)

class TicketResolveRequest(BaseModel):
    resolution_summary: str = Field(min_length=3, max_length=1000)

class TicketReopenRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.get("/tickets/{ticket_id}")
async def get_ticket_details(
    ticket_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    ticket = await db["support_tickets"].find_one({"tenant_id": principal.tenant_id, "id": ticket_id})
    if not ticket:
        raise HTTPException(404, "Support ticket not found")
    res = _clean(ticket)

    esc = await db["escalations"].find_one({"tenant_id": principal.tenant_id, "original_ticket_id": ticket_id})
    if esc:
        res["escalation_id"] = esc.get("id")
        res["escalation_status"] = esc.get("status")
        if esc.get("status") == "RESOLVED":
            res["escalation_resolved"] = True
            res["escalation_resolved_team"] = esc.get("destination_team") or "Engineering"
            res["escalation_resolution_summary"] = esc.get("resolution_summary")

    history_logs = res.get("history") or []
    for h in history_logs:
        if h.get("actor_id") and not h.get("actor_name"):
            h["actor_name"] = await resolve_actor_name(db, principal.tenant_id, h["actor_id"])

    res["sla"] = ticket_sla_info(res)
    return res


@router.post("/tickets/{ticket_id}/assign")
async def assign_ticket_action(
    ticket_id: str,
    payload: TicketAssignRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await update_support_ticket(ticket_id, TicketUpdate(assigned_to=payload.assigned_to), principal)


@router.post("/tickets/{ticket_id}/notes")
async def add_ticket_note_action(
    ticket_id: str,
    payload: TicketNoteRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await update_support_ticket(ticket_id, TicketUpdate(note=payload.note), principal)


@router.post("/tickets/{ticket_id}/resolve")
async def resolve_ticket_action(
    ticket_id: str,
    payload: TicketResolveRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await update_support_ticket(ticket_id, TicketUpdate(status="RESOLVED", note=f"Resolution: {payload.resolution_summary}"), principal)


@router.post("/tickets/{ticket_id}/reopen")
async def reopen_ticket_action(
    ticket_id: str,
    payload: TicketReopenRequest,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await update_support_ticket(ticket_id, TicketUpdate(status="REOPENED", note=f"Reopened reason: {payload.reason}"), principal)


@router.get("/accounts/{user_id}/diagnostics")
async def account_diagnostics_by_id(
    user_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await account_diagnostics(query=user_id, principal=principal)


@router.get("/appointments/{appointment_id}/diagnostics")
async def appointment_diagnostics_by_id(
    appointment_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await booking_diagnostics(query=appointment_id, principal=principal)


@router.get("/payments/{payment_id}/diagnostics")
async def payment_diagnostics_by_id(
    payment_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    db = mongo_database.database()
    payment = await db["payments"].find_one({"tenant_id": principal.tenant_id, "$or": [{"id": payment_id}, {"appointment_id": payment_id}]})
    if not payment:
        raise HTTPException(404, "Payment record not found for diagnostics")
    return _clean(payment)


@router.get("/consultations/{session_id}/diagnostics")
async def consultation_diagnostics_by_id(
    session_id: str,
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await video_diagnostics(query=session_id, principal=principal)


@router.get("/audit")
async def audit_search_alias(
    start_date: str = "",
    end_date: str = "",
    actor_id: str = "",
    ticket_id: str = "",
    action: str = "",
    resource: str = "",
    result_filter: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    principal: MongoPrincipal = Depends(support_agent),
) -> dict[str, Any]:
    return await support_audit_history(start_date, end_date, actor_id, ticket_id, action, resource, result_filter, offset, limit, principal)
