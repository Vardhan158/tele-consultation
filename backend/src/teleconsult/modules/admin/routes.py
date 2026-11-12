"""Clinic Administrator endpoints for the 8-screen admin dashboard."""
import secrets
from datetime import UTC, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pymongo.errors import DuplicateKeyError

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, get_principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.audit.models import AuditRecord
from teleconsult.modules.identity.auth_routes import auth_database_session
from teleconsult.modules.identity.models import UserAccount
from teleconsult.modules.patient_portal.models import Appointment, Doctor, Patient
from teleconsult.modules.payments.models import PaymentTransaction

router = APIRouter(
    prefix="/admin",
    tags=["clinic-admin"],
    dependencies=[Depends(require("clinic:admin"))],
)


async def _verify_admin(request: Request) -> Principal:
    principal = await get_principal(request)
    if (
        "clinic_admin" not in principal.roles
        and "clinic:doctor:approve" not in principal.permissions
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clinic Administrator access required",
        )
    return principal


async def _audit_log(
    principal: Principal,
    action: str,
    resource_type: str,
    resource_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    item = {
        "id": f"audit-{secrets.token_hex(8)}",
        "actor_id": principal.user_id,
        "tenant_id": principal.tenant_id or settings.default_tenant_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "metadata": metadata or {},
        "occurred_at": now.isoformat(),
        "created_at": now.isoformat(),
    }
    if settings.mongodb_enabled:
        db = mongo_database.database()
        await db["audit_logs"].insert_one(dict(item))


# --- 01. Clinic Overview ---
@router.get("/overview")
async def get_overview(
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
) -> dict[str, Any]:
    await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        t_id = settings.default_tenant_id
        now = datetime.now(UTC)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        total_doctors = await db["doctors"].count_documents({"tenant_id": t_id})
        pending_approvals = await db["doctors"].count_documents({
            "tenant_id": t_id,
            "approval_status": "pending",
        })
        active_doctors = await db["doctors"].count_documents({
            "tenant_id": t_id,
            "approval_status": "approved",
            "active": True,
        })
        total_appointments = await db["appointments"].count_documents({"tenant_id": t_id})
        confirmed_appointments = await db["appointments"].count_documents({
            "tenant_id": t_id,
            "status": "confirmed",
        })
        completed_consultations = await db["appointments"].count_documents({
            "tenant_id": t_id,
            "status": "completed",
        })
        today_appointments = await db["appointments"].count_documents({
            "tenant_id": t_id,
            "starts_at": {"$gte": day_start, "$lt": day_end},
        })
        payments = await db["payments"].find({
            "tenant_id": t_id,
            "status": "captured",
        }).to_list(1000)
        total_revenue = sum(p.get("amount", 0) for p in payments) / 100.0

        alerts = []
        if pending_approvals > 0:
            alerts.append({
                "id": "alert-pending-docs",
                "type": "warning",
                "message": (
                    f"{pending_approvals} doctor credential application(s) "
                    f"awaiting verification."
                ),
            })
        alerts.append({
            "id": "alert-sys-normal",
            "type": "info",
            "message": "System running normally. WebRTC signaling & MongoDB Atlas connected.",
        })

        recent_activity = [
            {
                "id": "act-1",
                "timestamp": "10 mins ago",
                "text": "New clinician application received from Dr. Vance",
            },
            {
                "id": "act-2",
                "timestamp": "30 mins ago",
                "text": "Patient consultation completed by Dr. Chen",
            },
            {
                "id": "act-3",
                "timestamp": "1 hour ago",
                "text": "Payment verified via Razorpay for appointment #apt-402",
            },
        ]

        alerts = [alert for alert in alerts if alert.get("id") != "alert-sys-normal"]
        recent_activity = []
        audit_documents = db["audit_logs"].find({"tenant_id": t_id}).sort("occurred_at", -1).limit(10)
        async for event in audit_documents:
            occurred_at = event.get("occurred_at") or event.get("created_at")
            recent_activity.append({
                "id": str(event.get("id", event.get("_id"))),
                "timestamp": occurred_at.isoformat() if hasattr(occurred_at, "isoformat") else str(occurred_at or ""),
                "text": event.get("action", "Clinic activity recorded").replace(".", " ").replace("_", " ").strip().title(),
            })
        return {
            "kpis": {
                "total_doctors": total_doctors,
                "active_doctors": active_doctors,
                "pending_approvals": pending_approvals,
                "total_appointments": total_appointments,
                "confirmed_appointments": confirmed_appointments,
                "completed_consultations": completed_consultations,
                "today_appointments": today_appointments,
                "total_revenue": total_revenue,
            },
            "alerts": alerts,
            "recent_activity": recent_activity,
        }

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    tenant_id = UUID(settings.default_tenant_id)
    total_doctors = (
        await session.scalar(
            select(func.count(Doctor.id)).where(Doctor.tenant_id == tenant_id)
        )
        or 0
    )
    pending_approvals = (
        await session.scalar(
            select(func.count(Doctor.id)).where(
                Doctor.tenant_id == tenant_id, Doctor.approval_status == "pending"
            )
        )
        or 0
    )
    active_doctors = (
        await session.scalar(
            select(func.count(Doctor.id)).where(
                Doctor.tenant_id == tenant_id,
                Doctor.approval_status == "approved",
                Doctor.active.is_(True),
            )
        )
        or 0
    )
    total_appointments = (
        await session.scalar(
            select(func.count(Appointment.id)).where(
                Appointment.tenant_id == tenant_id
            )
        )
        or 0
    )
    confirmed_appointments = (
        await session.scalar(
            select(func.count(Appointment.id)).where(
                Appointment.tenant_id == tenant_id, Appointment.status == "confirmed"
            )
        )
        or 0
    )
    total_revenue_paise = (
        await session.scalar(
            select(func.sum(PaymentTransaction.amount_paise)).where(
                PaymentTransaction.tenant_id == tenant_id,
                PaymentTransaction.status == "captured",
            )
        )
        or 0
    )
    total_revenue = total_revenue_paise / 100.0
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    completed_consultations = await session.scalar(select(func.count(Appointment.id)).where(Appointment.tenant_id == tenant_id, Appointment.status == "completed")) or 0
    today_appointments = await session.scalar(select(func.count(Appointment.id)).where(Appointment.tenant_id == tenant_id, Appointment.starts_at >= day_start, Appointment.starts_at < day_end)) or 0
    audit_records = await session.scalars(select(AuditRecord).where(AuditRecord.tenant_id == tenant_id).order_by(AuditRecord.occurred_at.desc()).limit(10))
    recent_activity = [{
        "id": str(event.id),
        "timestamp": event.occurred_at.isoformat(),
        "text": event.action.replace(".", " ").replace("_", " ").strip().title(),
    } for event in audit_records]

    return {
        "kpis": {
            "total_doctors": total_doctors,
            "active_doctors": active_doctors,
            "pending_approvals": pending_approvals,
            "total_appointments": total_appointments,
            "confirmed_appointments": confirmed_appointments,
            "completed_consultations": completed_consultations,
            "today_appointments": today_appointments,
            "total_revenue": total_revenue,
        },
        "alerts": ([{"id": "alert-pending-docs", "type": "warning", "message": f"{pending_approvals} doctor credential application(s) awaiting verification."}] if pending_approvals else []),
        "recent_activity": recent_activity,
    }


# --- 02. Doctor Management ---
@router.get("/doctors")
async def get_doctors(
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
) -> list[dict[str, Any]]:
    await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        docs = await db["doctors"].find({"tenant_id": settings.default_tenant_id}).to_list(200)
        users_by_id = {}
        user_ids = [
            d.get("user_account_id") or d.get("user_id") or d.get("id") for d in docs
        ]
        users = await db["users"].find({"id": {"$in": user_ids}}).to_list(200)
        for u in users:
            users_by_id[u["id"]] = u

        result = []
        for d in docs:
            u_id = d.get("user_account_id") or d.get("user_id") or d.get("id")
            u_info = users_by_id.get(u_id, {})
            result.append({
                "id": d.get("id") or d.get("user_id"),
                "user_account_id": u_id,
                "full_name": d.get("full_name") or u_info.get("full_name", "Doctor"),
                "email": u_info.get("email", ""),
                "mobile_number": u_info.get("mobile_number") or u_info.get("phone", ""),
                "specialty": d.get("specialty", "General"),
                "clinic_name": d.get("clinic_name", "Kaizentrix Care Clinic"),
                "registration_number": d.get("registration_number", "N/A"),
                "experience_years": d.get("experience_years", 0),
                "qualifications": d.get("qualifications", []),
                "languages": d.get("languages", ["English"]),
                "approval_status": d.get("approval_status", "pending"),
                "approval_reason": d.get("approval_reason"),
                "active": d.get("active", False),
                "approved_for_consultation": d.get("approved_for_consultation", False),
                "email_verified": bool(u_info.get("verified_at")),
                "created_at": d.get("created_at"),
            })
        return result

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    tenant_id = UUID(settings.default_tenant_id)
    doctors = await session.scalars(select(Doctor).where(Doctor.tenant_id == tenant_id))
    res = []
    for d in doctors:
        u = await session.get(UserAccount, d.user_account_id)
        res.append({
            "id": str(d.id),
            "user_account_id": str(d.user_account_id),
            "full_name": d.full_name,
            "email": u.email if u else "",
            "mobile_number": u.mobile_number if u else "",
            "specialty": d.specialty,
            "clinic_name": d.clinic_name,
            "registration_number": d.registration_number,
            "experience_years": d.experience_years,
            "qualifications": d.qualifications,
            "languages": d.languages,
            "approval_status": d.approval_status,
            "active": d.active,
            "approved_for_consultation": d.approved_for_consultation,
            "email_verified": bool(u.verified_at) if u else False,
        })
    return res


class ToggleDoctorStatusRequest(BaseModel):
    active: bool
    reason: str | None = None


@router.patch("/doctors/{doctor_id}/status")
async def toggle_doctor_status(
    doctor_id: str,
    payload: ToggleDoctorStatusRequest,
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()
    update_dict = {"active": payload.active}
    if payload.reason:
        update_dict["suspension_reason"] = payload.reason

    if settings.mongodb_enabled:
        db = mongo_database.database()
        res = await db["doctors"].update_one(
            {
                "tenant_id": settings.default_tenant_id,
                "$or": [
                    {"id": doctor_id},
                    {"user_id": doctor_id},
                    {"user_account_id": doctor_id},
                ],
            },
            {"$set": update_dict},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        await _audit_log(
            principal,
            action="doctor.status_toggle",
            resource_type="doctor",
            resource_id=doctor_id,
            metadata={"active": payload.active, "reason": payload.reason},
        )
        return {"status": "success", "doctor_id": doctor_id, "active": payload.active}

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    d = await session.scalar(select(Doctor).where(Doctor.id == UUID(doctor_id)))
    if d is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    d.active = payload.active
    await _audit_log(
        principal,
        action="doctor.status_toggle",
        resource_type="doctor",
        resource_id=doctor_id,
        metadata={"active": payload.active, "reason": payload.reason},
    )
    return {"status": "success", "doctor_id": doctor_id, "active": payload.active}


# --- 03. Service & Fee Configuration ---
DEFAULT_SERVICES = [
    {
        "id": "srv-1",
        "name": "General Teleconsultation",
        "specialty": "General Medicine",
        "duration_minutes": 30,
        "currency": "INR",
        "base_fee": 500,
        "platform_fee": 50,
        "active": True,
        "effective_date": "2026-01-01",
    },
    {
        "id": "srv-2",
        "name": "Cardiology Consultation",
        "specialty": "Cardiology",
        "duration_minutes": 45,
        "currency": "INR",
        "base_fee": 1200,
        "platform_fee": 100,
        "active": True,
        "effective_date": "2026-01-01",
    },
    {
        "id": "srv-3",
        "name": "Dermatology Skin Audit",
        "specialty": "Dermatology",
        "duration_minutes": 30,
        "currency": "INR",
        "base_fee": 800,
        "platform_fee": 75,
        "active": True,
        "effective_date": "2026-01-01",
    },
    {
        "id": "srv-4",
        "name": "Pediatric Consultation",
        "specialty": "Pediatrics",
        "duration_minutes": 30,
        "currency": "INR",
        "base_fee": 600,
        "platform_fee": 50,
        "active": True,
        "effective_date": "2026-01-01",
    },
    {
        "id": "srv-5",
        "name": "Neurology Evaluation",
        "specialty": "Neurology",
        "duration_minutes": 60,
        "currency": "INR",
        "base_fee": 1500,
        "platform_fee": 150,
        "active": True,
        "effective_date": "2026-01-01",
    },
    {
        "id": "srv-6",
        "name": "Orthopedic Checkup",
        "specialty": "Orthopedics",
        "duration_minutes": 30,
        "currency": "INR",
        "base_fee": 900,
        "platform_fee": 80,
        "active": True,
        "effective_date": "2026-01-01",
    },
]


@router.get("/services")
async def get_services(request: Request) -> list[dict[str, Any]]:
    await _verify_admin(request)
    settings = get_settings()
    if settings.mongodb_enabled:
        db = mongo_database.database()
        services = (
            await db["services"]
            .find({"tenant_id": settings.default_tenant_id})
            .to_list(100)
        )
        return [
            {
                "id": s.get("id") or str(s.get("_id")),
                "name": s.get("name"),
                "specialty": s.get("specialty"),
                "duration_minutes": s.get("duration_minutes", 30),
                "currency": s.get("currency", "INR"),
                "base_fee": s.get("base_fee", 0),
                "platform_fee": s.get("platform_fee", 0),
                "active": s.get("active", True),
                "effective_date": s.get("effective_date", datetime.now(UTC).strftime("%Y-%m-%d")),
                "assigned_doctors": s.get("assigned_doctors", []),
                "appointment_types": s.get("appointment_types", []),
            }
            for s in services
        ]
    return []


class ServiceSavePayload(BaseModel):
    id: str | None = None
    name: str = Field(min_length=2, max_length=120)
    specialty: str = Field(min_length=2, max_length=120)
    duration_minutes: int = Field(ge=10, le=240, default=30)
    currency: str = Field(default="INR")
    base_fee: int = Field(ge=0)
    platform_fee: int = Field(ge=0)
    active: bool = True
    effective_date: str = Field(default="2026-01-01")
    assigned_doctors: list[str] = Field(default_factory=list)
    appointment_types: list[str] = Field(default_factory=list)


@router.post("/services")
async def save_service(
    payload: ServiceSavePayload,
    request: Request,
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()
    srv_id = payload.id or f"srv-{secrets.token_hex(4)}"
    item = {
        "id": srv_id,
        "name": payload.name,
        "specialty": payload.specialty,
        "duration_minutes": payload.duration_minutes,
        "currency": payload.currency,
        "base_fee": payload.base_fee,
        "platform_fee": payload.platform_fee,
        "active": payload.active,
        "effective_date": payload.effective_date,
        "tenant_id": settings.default_tenant_id,
        "assigned_doctors": payload.assigned_doctors,
        "appointment_types": payload.appointment_types,
    }
    if settings.mongodb_enabled:
        db = mongo_database.database()
        await db["services"].update_one(
            {"tenant_id": settings.default_tenant_id, "id": srv_id},
            {"$set": item},
            upsert=True,
        )
    await _audit_log(
        principal,
        action="service.save_fee",
        resource_type="service",
        resource_id=srv_id,
        metadata={"base_fee": payload.base_fee, "platform_fee": payload.platform_fee, "assigned_doctors": payload.assigned_doctors, "appointment_types": payload.appointment_types},
    )
    return item


@router.delete("/services/{service_id}")
async def delete_service(
    service_id: str,
    request: Request,
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()
    if settings.mongodb_enabled:
        db = mongo_database.database()
        res = await db["services"].delete_one({"tenant_id": settings.default_tenant_id, "id": service_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Service configuration not found")
    await _audit_log(
        principal,
        action="service.delete",
        resource_type="service",
        resource_id=service_id,
        metadata={"deleted": True},
    )
    return {"status": "deleted", "id": service_id}


# --- 04. Schedule Management ---
class BlockDatePayload(BaseModel):
    date: str
    reason: str = Field(default="Clinic holiday / maintenance")


@router.get("/schedules")
async def get_schedules(request: Request, doctor_id: str | None = None) -> dict[str, Any]:
    await _verify_admin(request)
    settings = get_settings()
    if settings.mongodb_enabled:
        db = mongo_database.database()
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": settings.default_tenant_id})
        clinic_timezone = clinic_settings.get("timezone", DEFAULT_CLINIC_SETTINGS["timezone"]) if clinic_settings else DEFAULT_CLINIC_SETTINGS["timezone"]
        try:
            clinic_zone = ZoneInfo(clinic_timezone)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc
        active_blocked_dates = await db["blocked_dates"].find({
            "tenant_id": settings.default_tenant_id,
        }).to_list(500)
        reconciled_slots = 0
        for blocked_date in active_blocked_dates:
            blocked_day = datetime.strptime(blocked_date["date"], "%Y-%m-%d").date()
            day_start = datetime.combine(blocked_day, time.min, tzinfo=clinic_zone).astimezone(UTC)
            day_end = day_start + timedelta(days=1)
            result = await db["doctor_availability"].update_many(
                {
                    "tenant_id": settings.default_tenant_id,
                    "starts_at": {"$lt": day_end.isoformat()},
                    "ends_at": {"$gt": day_start.isoformat()},
                    "booked": {"$ne": True},
                    "status": {"$nin": ["blocked", "booked", "reserved"]},
                },
                {"$set": {"status": "blocked"}},
            )
            reconciled_slots += result.modified_count
        q = {"tenant_id": settings.default_tenant_id}
        if doctor_id:
            q["doctor_id"] = doctor_id
        slots = await db["doctor_availability"].find(q).to_list(500)
        slots.sort(key=lambda slot: (slot.get("starts_at") or "", slot.get("ends_at") or ""))
        doctors = await db["doctors"].find({"tenant_id": settings.default_tenant_id}).to_list(200)
        blocked = active_blocked_dates
        docs_by_id = {
            d.get("id") or d.get("user_id"): d.get("full_name") for d in doctors
        }

        slot_list = [
            {
                "id": s.get("id") or str(s.get("_id")),
                "doctor_id": s.get("doctor_id"),
                "doctor_name": docs_by_id.get(s.get("doctor_id"), "Dr. Clinician"),
                "starts_at": s.get("starts_at"),
                "ends_at": s.get("ends_at"),
                "booked": s.get("booked", False),
                "status": s.get("status", "available"),
                "blocked": s.get("status") == "blocked",
            }
            for s in slots
        ]

        seen_dates = set()
        blocked_list = []
        for b in blocked:
            b_date = b.get("date")
            if b_date and b_date not in seen_dates:
                seen_dates.add(b_date)
                blocked_list.append({
                    "id": b.get("id") or str(b.get("_id")),
                    "date": b_date,
                    "reason": b.get("reason"),
                })

        return {
            "slots": slot_list,
            "blocked_dates": blocked_list,
            "doctors": list(docs_by_id.items()),
            "timezone": clinic_timezone,
            "reconciled_blocked_slots": reconciled_slots,
        }
    return {"slots": [], "blocked_dates": [], "doctors": [], "timezone": "UTC"}


@router.post("/schedules/block-date")
async def block_clinic_date(
    payload: BlockDatePayload,
    request: Request,
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()
    now = datetime.now(UTC)

    if settings.mongodb_enabled:
        db = mongo_database.database()
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": settings.default_tenant_id})
        timezone_name = clinic_settings.get("timezone", DEFAULT_CLINIC_SETTINGS["timezone"]) if clinic_settings else DEFAULT_CLINIC_SETTINGS["timezone"]
        try:
            clinic_timezone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc
        existing = await db["blocked_dates"].find_one({
            "tenant_id": settings.default_tenant_id,
            "date": payload.date,
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This clinic date is already blocked.",
            )

        block_id = f"blk-{secrets.token_hex(4)}"
        item = {
            "id": block_id,
            "date": payload.date,
            "reason": payload.reason,
            "tenant_id": settings.default_tenant_id,
            "created_at": now.isoformat(),
        }
        try:
            await db["blocked_dates"].insert_one(dict(item))
        except DuplicateKeyError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This clinic date is already blocked.",
            ) from None
        local_day_start = datetime.combine(datetime.strptime(payload.date, "%Y-%m-%d").date(), time.min, tzinfo=clinic_timezone).astimezone(UTC)
        local_day_end = local_day_start + timedelta(days=1)
        await db["doctor_availability"].update_many(
            {
                "tenant_id": settings.default_tenant_id,
                "starts_at": {"$lt": local_day_end.isoformat()},
                "ends_at": {"$gt": local_day_start.isoformat()},
                "booked": {"$ne": True},
                "status": {"$nin": ["booked", "reserved"]},
            },
            {"$set": {"status": "blocked"}},
        )
        await _audit_log(
            principal,
            action="schedule.block_date",
            resource_type="blocked_date",
            resource_id=block_id,
            metadata={"date": payload.date, "reason": payload.reason},
        )
        return item

    block_id = f"blk-{secrets.token_hex(4)}"
    return {
        "id": block_id,
        "date": payload.date,
        "reason": payload.reason,
        "tenant_id": settings.default_tenant_id,
        "created_at": now.isoformat(),
    }


@router.delete("/schedules/block-date/{blocked_date}")
async def unblock_clinic_date(blocked_date: str, request: Request) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Schedule database is unavailable")
    db = mongo_database.database()
    clinic_settings = await db["clinic_settings"].find_one({"tenant_id": settings.default_tenant_id})
    timezone_name = clinic_settings.get("timezone", DEFAULT_CLINIC_SETTINGS["timezone"]) if clinic_settings else DEFAULT_CLINIC_SETTINGS["timezone"]
    try:
        clinic_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc
    local_day_start = datetime.combine(datetime.strptime(blocked_date, "%Y-%m-%d").date(), time.min, tzinfo=clinic_timezone).astimezone(UTC)
    local_day_end = local_day_start + timedelta(days=1)
    result = await db["blocked_dates"].delete_one({"tenant_id": settings.default_tenant_id, "date": blocked_date})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Blocked clinic date not found")
    await db["doctor_availability"].update_many(
        {
            "tenant_id": settings.default_tenant_id,
            "starts_at": {"$lt": local_day_end.isoformat()},
            "ends_at": {"$gt": local_day_start.isoformat()},
            "status": "blocked",
            "booked": {"$ne": True},
        },
        {"$set": {"status": "available"}},
    )
    await _audit_log(principal, action="schedule.unblock_date", resource_type="blocked_date", resource_id=blocked_date)
    return {"status": "unblocked", "date": blocked_date}


class AddShiftPayload(BaseModel):
    doctor_id: str
    date: str
    start_time: str
    end_time: str
    slot_duration_minutes: int = Field(default=30, ge=10, le=120)
    break_start_time: str | None = "13:00"
    break_duration_minutes: int = Field(default=60, ge=0, le=180)
    recurrence: str = Field(default="none")


@router.post("/schedules/shifts")
async def create_doctor_shift(
    payload: AddShiftPayload,
    request: Request,
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()

    base_dt = datetime.strptime(payload.date, "%Y-%m-%d").date()
    target_dates = [base_dt]
    if payload.recurrence == "daily_5d":
        target_dates = [base_dt + timedelta(days=i) for i in range(5)]
    elif payload.recurrence == "weekly_4w":
        target_dates = [base_dt + timedelta(weeks=i) for i in range(4)]

    start_h, start_m = map(int, payload.start_time.split(":"))
    end_h, end_m = map(int, payload.end_time.split(":"))
    start_minutes = start_h * 60 + start_m
    end_minutes = end_h * 60 + end_m
    if end_minutes <= start_minutes:
        raise HTTPException(status_code=422, detail="Shift end time must be after shift start time.")
    b_start_h, b_start_m = (
        map(int, payload.break_start_time.split(":"))
        if payload.break_start_time
        else (13, 0)
    )
    b_dur = payload.break_duration_minutes
    break_start_minutes = b_start_h * 60 + b_start_m
    break_end_minutes = break_start_minutes + b_dur
    if b_dur and (break_start_minutes < start_minutes or break_end_minutes > end_minutes):
        raise HTTPException(status_code=422, detail="Break window must be fully within the shift.")

    created_slots = []
    total_slots = 0
    if settings.mongodb_enabled:
        db = mongo_database.database()
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": settings.default_tenant_id})
        clinic_timezone_name = clinic_settings.get("timezone", DEFAULT_CLINIC_SETTINGS["timezone"]) if clinic_settings else DEFAULT_CLINIC_SETTINGS["timezone"]
        try:
            clinic_timezone = ZoneInfo(clinic_timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc

        for dt in target_dates:
            shift_start = datetime.combine(dt, time(start_h, start_m), tzinfo=clinic_timezone).astimezone(UTC)
            shift_end = datetime.combine(dt, time(end_h, end_m), tzinfo=clinic_timezone).astimezone(UTC)
            break_start = datetime.combine(dt, time(b_start_h, b_start_m), tzinfo=clinic_timezone).astimezone(UTC)
            break_end = break_start + timedelta(minutes=b_dur)

            local_day_start = datetime.combine(dt, time.min, tzinfo=clinic_timezone).astimezone(UTC)
            local_day_end = local_day_start + timedelta(days=1)
            day_slots = await db["doctor_availability"].find({
                "tenant_id": settings.default_tenant_id,
                "doctor_id": payload.doctor_id,
                "starts_at": {"$lt": local_day_end.isoformat()},
                "ends_at": {"$gt": local_day_start.isoformat()},
            }).to_list(500)

            # Repair only unbooked malformed test slots. Booked appointments and
            # records outside this clinic-local date are never touched.
            existing = []
            for item in day_slots:
                if not item.get("starts_at") or not item.get("ends_at"):
                    continue
                item_start = datetime.fromisoformat(item["starts_at"].replace("Z", "+00:00"))
                item_end = datetime.fromisoformat(item["ends_at"].replace("Z", "+00:00"))
                malformed = (
                    item_start < shift_start
                    or item_end > shift_end
                    or (b_dur > 0 and item_start < break_end and item_end > break_start)
                )
                is_booked = item.get("booked") is True or item.get("status") == "booked"
                if malformed and not is_booked and item.get("id"):
                    await db["doctor_availability"].delete_one({
                        "tenant_id": settings.default_tenant_id,
                        "id": item.get("id"),
                    })
                    continue
                if item_start < shift_end and item_end > shift_start:
                    existing.append(item)

            curr = shift_start
            slot_delta = timedelta(minutes=payload.slot_duration_minutes)
            while curr + slot_delta <= shift_end:
                curr_end = curr + slot_delta
                # Reject any slot that intersects the break, including partial overlaps.
                overlaps_break = b_dur > 0 and curr < break_end and curr_end > break_start
                if not overlaps_break:
                    total_slots += 1
                overlaps_existing = any(
                    curr < datetime.fromisoformat(item["ends_at"].replace("Z", "+00:00"))
                    and curr_end > datetime.fromisoformat(item["starts_at"].replace("Z", "+00:00"))
                    for item in existing
                    if item.get("starts_at") and item.get("ends_at")
                )
                if not overlaps_break and not overlaps_existing:
                    slot_id = f"slot-{secrets.token_hex(6)}"
                    slot_doc = {
                        "id": slot_id,
                        "tenant_id": settings.default_tenant_id,
                        "doctor_id": payload.doctor_id,
                        "starts_at": curr.isoformat(),
                        "ends_at": curr_end.isoformat(),
                        "status": "available",
                        "booked": False,
                        "created_at": datetime.now(UTC).isoformat(),
                    }
                    await db["doctor_availability"].insert_one(dict(slot_doc))
                    created_slots.append(slot_id)
                    existing.append(slot_doc)
                curr = curr_end

        await _audit_log(
            principal,
            action="schedule.create_shift",
            resource_type="doctor_shift",
            resource_id=payload.doctor_id,
            metadata={"date": payload.date, "created_slots": len(created_slots)},
        )

    return {
        "status": "success",
        "created_slots_count": len(created_slots),
        "total_slots_count": total_slots,
        "doctor_id": payload.doctor_id,
    }


@router.delete("/schedules/slots/{slot_id}")
async def cancel_doctor_slot(
    slot_id: str,
    request: Request,
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        slot = await db["doctor_availability"].find_one({
            "tenant_id": settings.default_tenant_id,
            "id": slot_id,
        })
        if not slot:
            raise HTTPException(status_code=404, detail="Slot not found")
        if slot.get("booked") or slot.get("status") == "booked":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete a slot with an active patient booking.",
            )
        await db["doctor_availability"].delete_one({"id": slot_id})
        await _audit_log(
            principal,
            action="schedule.delete_slot",
            resource_type="doctor_slot",
            resource_id=slot_id,
        )
        return {"status": "deleted", "id": slot_id}

    return {"status": "deleted", "id": slot_id}


# --- 05. Appointment Management ---
class CancelAppointmentPayload(BaseModel):
    reason: str = Field(default="Administrative scheduling adjustment")


@router.get("/appointments")
async def get_appointments(
    request: Request,
    status_filter: str | None = None,
    q: str | None = None,
    session: AsyncSession | None = Depends(auth_database_session),
) -> list[dict[str, Any]]:
    await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        query = {"tenant_id": settings.default_tenant_id}
        if status_filter and status_filter != "all":
            query["status"] = status_filter
        apts = await db["appointments"].find(query).sort("starts_at", -1).to_list(300)

        docs = {
            d["id"]: d.get("full_name")
            for d in await db["doctors"].find().to_list(300)
        }
        patients = {
            p["id"]: p.get("full_name")
            for p in await db["patients"].find().to_list(300)
        }

        res = []
        for a in apts:
            doc_name = docs.get(a.get("doctor_id"), "Dr. Clinician")
            patient_name = patients.get(a.get("patient_id"), "Patient")
            if q and q.strip():
                query_str = q.strip().lower()
                if (
                    query_str not in doc_name.lower()
                    and query_str not in patient_name.lower()
                ):
                    continue
            res.append({
                "id": a.get("id"),
                "patient_id": a.get("patient_id"),
                "patient_name": patient_name,
                "doctor_id": a.get("doctor_id"),
                "doctor_name": doc_name,
                "starts_at": a.get("starts_at"),
                "duration_minutes": a.get("duration_minutes", 30),
                "status": a.get("status", "confirmed"),
                "cancel_reason": a.get("cancel_reason"),
                "type": a.get("type", "Video Consultation"),
                "fee": a.get("fee", 500),
                "created_at": a.get("created_at"),
            })
        return res

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    tenant_id = UUID(settings.default_tenant_id)
    stmt = (
        select(Appointment)
        .where(Appointment.tenant_id == tenant_id)
        .order_by(Appointment.starts_at.desc())
    )
    if status_filter and status_filter != "all":
        stmt = stmt.where(Appointment.status == status_filter)
    apts = await session.scalars(stmt)
    res = []
    for a in apts:
        d = await session.get(Doctor, a.doctor_id)
        p = await session.get(Patient, a.patient_id)
        res.append({
            "id": str(a.id),
            "patient_id": str(a.patient_id),
            "patient_name": p.full_name if p else "Patient",
            "doctor_id": str(a.doctor_id),
            "doctor_name": d.full_name if d else "Dr. Clinician",
            "starts_at": a.starts_at.isoformat() if a.starts_at else "",
            "duration_minutes": a.duration_minutes,
            "status": a.status,
            "type": "Video Consultation",
            "fee": 500,
        })
    return res


@router.post("/appointments/{appointment_id}/cancel")
async def cancel_appointment_admin(
    appointment_id: str,
    payload: CancelAppointmentPayload,
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        res = await db["appointments"].update_one(
            {"tenant_id": settings.default_tenant_id, "id": appointment_id},
            {
                "$set": {
                    "status": "cancelled",
                    "cancelled_by": "admin",
                    "cancel_reason": payload.reason,
                }
            },
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Appointment not found")
        await _audit_log(
            principal,
            action="appointment.cancel",
            resource_type="appointment",
            resource_id=appointment_id,
            metadata={"reason": payload.reason},
        )
        return {"status": "cancelled", "id": appointment_id, "reason": payload.reason}

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    apt = await session.scalar(select(Appointment).where(Appointment.id == UUID(appointment_id)))
    if apt is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    apt.status = "cancelled"
    await _audit_log(
        principal,
        action="appointment.cancel",
        resource_type="appointment",
        resource_id=appointment_id,
        metadata={"reason": payload.reason},
    )
    return {"status": "cancelled", "id": appointment_id, "reason": payload.reason}


# --- 06. Payment Oversight ---
class RefundPayload(BaseModel):
    reason: str = Field(default="Customer service goodwill / Administrative refund")


@router.get("/payments")
async def get_payments(
    request: Request,
    status_filter: str | None = None,
    session: AsyncSession | None = Depends(auth_database_session),
) -> list[dict[str, Any]]:
    await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        q = {"tenant_id": settings.default_tenant_id}
        if status_filter and status_filter != "all":
            q["status"] = status_filter
        records = (
            await db["payments"]
            .find(q)
            .sort("created_at", -1)
            .to_list(300)
        )
        patients = {
            p["id"]: p.get("full_name")
            for p in await db["patients"].find().to_list(300)
        }
        return [
            {
                "id": r.get("id"),
                "appointment_id": r.get("appointment_id"),
                "patient_name": patients.get(r.get("patient_id"), "Patient"),
                "amount": (r.get("amount") or 0) / 100.0,
                "currency": r.get("currency", "INR"),
                "status": r.get("status", "captured"),
                "provider": r.get("provider", "razorpay"),
                "provider_transaction_id": r.get("provider_transaction_id"),
                "razorpay_order_id": r.get("razorpay_order_id"),
                "refund_reason": r.get("refund_reason"),
                "created_at": r.get("created_at"),
            }
            for r in records
        ]

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    tenant_id = UUID(settings.default_tenant_id)
    records = await session.scalars(
        select(PaymentTransaction)
        .where(PaymentTransaction.tenant_id == tenant_id)
        .order_by(PaymentTransaction.created_at.desc())
    )
    return [
        {
            "id": str(r.id),
            "appointment_id": str(r.appointment_id),
            "patient_name": "Patient",
            "amount": r.amount_paise / 100.0,
            "currency": r.currency,
            "status": r.status,
            "provider": r.provider,
            "provider_transaction_id": r.provider_transaction_id,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in records
    ]


@router.post("/payments/{payment_id}/refund")
async def refund_payment_admin(
    payment_id: str,
    payload: RefundPayload,
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        res = await db["payments"].update_one(
            {"tenant_id": settings.default_tenant_id, "id": payment_id},
            {
                "$set": {
                    "status": "refunded",
                    "refund_reason": payload.reason,
                    "refunded_at": datetime.now(UTC),
                }
            },
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Payment record not found")
        await _audit_log(
            principal,
            action="payment.refund",
            resource_type="payment",
            resource_id=payment_id,
            metadata={"reason": payload.reason},
        )
        return {"status": "refunded", "id": payment_id, "reason": payload.reason}

    if session is None:
        raise HTTPException(status_code=503, detail="No database configured")
    rec = await session.scalar(
        select(PaymentTransaction).where(PaymentTransaction.id == UUID(payment_id))
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="Payment record not found")
    rec.status = "refunded"
    await _audit_log(
        principal,
        action="payment.refund",
        resource_type="payment",
        resource_id=payment_id,
        metadata={"reason": payload.reason},
    )
    return {"status": "refunded", "id": payment_id, "reason": payload.reason}


# --- 07. Operational Reports ---
@router.get("/reports")
async def get_reports(
    request: Request,
    time_range: str = "30d",
    session: AsyncSession | None = Depends(auth_database_session),
) -> dict[str, Any]:
    await _verify_admin(request)
    settings = get_settings()
    if time_range not in {"7d", "30d", "90d", "ytd"}:
        raise HTTPException(status_code=422, detail="Unsupported report time range")

    end_at = datetime.now(UTC)
    if time_range == "7d":
        start_at = end_at - timedelta(days=7)
    elif time_range == "90d":
        start_at = end_at - timedelta(days=90)
    elif time_range == "ytd":
        start_at = datetime(end_at.year, 1, 1, tzinfo=UTC)
    else:
        start_at = end_at - timedelta(days=30)

    def parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=UTC)
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
            except ValueError:
                return None
        return None

    def percent(value: int, total: int) -> str | None:
        return f"{(value / total) * 100:.1f}%" if total else None

    if settings.mongodb_enabled:
        db = mongo_database.database()
        tenant_id = settings.default_tenant_id
        raw_appointments = await db["appointments"].find({"tenant_id": tenant_id}).to_list(10000)
        doctors = {
            item.get("id"): item
            for item in await db["doctors"].find({"tenant_id": tenant_id}).to_list(10000)
        }
        raw_payments = await db["payments"].find({"tenant_id": tenant_id, "status": "captured"}).to_list(10000)
    else:
        if session is None:
            raise HTTPException(status_code=503, detail="No database configured")
        tenant_id = UUID(settings.default_tenant_id)
        raw_appointments = list(await session.scalars(select(Appointment).where(Appointment.tenant_id == tenant_id)))
        doctors = {
            str(item.id): {"specialty": item.specialty}
            for item in await session.scalars(select(Doctor).where(Doctor.tenant_id == tenant_id))
        }
        raw_payments = list(await session.scalars(select(PaymentTransaction).where(
            PaymentTransaction.tenant_id == tenant_id,
            PaymentTransaction.status == "captured",
        )))

    appointments = []
    for appointment in raw_appointments:
        starts_at = parse_datetime(appointment.get("starts_at") if isinstance(appointment, dict) else appointment.starts_at)
        if starts_at and start_at <= starts_at <= end_at:
            appointments.append(appointment)

    def field(item: Any, name: str, default: Any = None) -> Any:
        return item.get(name, default) if isinstance(item, dict) else getattr(item, name, default)

    payment_by_appointment = {
        str(field(payment, "appointment_id")): int(field(payment, "amount_paise", 0) or 0) / 100
        for payment in raw_payments
    }
    by_specialty: dict[str, dict[str, Any]] = {}
    by_month: dict[tuple[int, int], dict[str, Any]] = {}
    status_counts: dict[str, int] = {}
    total_minutes = 0
    completed = cancelled = no_show = 0
    for appointment in appointments:
        status_value = field(appointment, "status", "unknown")
        status_counts[status_value] = status_counts.get(status_value, 0) + 1
        completed += status_value == "completed"
        cancelled += status_value == "cancelled"
        no_show += status_value in {"no_show", "no-show"}
        starts_at = parse_datetime(field(appointment, "starts_at"))
        ends_at = parse_datetime(field(appointment, "ends_at"))
        if starts_at and ends_at:
            total_minutes += max(0, int((ends_at - starts_at).total_seconds() / 60))
        doctor = doctors.get(str(field(appointment, "doctor_id")), {})
        specialty = doctor.get("specialty") if isinstance(doctor, dict) else None
        if not specialty:
            specialty = "Unspecified"
        revenue = field(appointment, "total_payable_paise")
        revenue = float(revenue) / 100 if revenue is not None else payment_by_appointment.get(str(field(appointment, "id")), 0)
        row = by_specialty.setdefault(specialty, {"specialty": specialty, "count": 0, "revenue": 0})
        row["count"] += 1
        row["revenue"] += revenue
        if starts_at:
            month = by_month.setdefault((starts_at.year, starts_at.month), {"month": starts_at.strftime("%b %Y"), "revenue": 0, "consultations": 0})
            month["consultations"] += 1
            month["revenue"] += revenue

    total = len(appointments)
    active = total - cancelled
    return {
        "time_range": time_range,
        "summary": {
            "total_consultations": total,
            "doctor_utilization_rate": percent(completed, active),
            "completion_rate": percent(completed, total),
            "cancellation_rate": percent(cancelled, total),
            "no_show_rate": percent(no_show, total),
            "avg_consultation_duration": f"{round(total_minutes / total)} mins" if total else None,
            "patient_satisfaction": None,
            "by_status": status_counts,
        },
        "by_specialty": sorted(by_specialty.values(), key=lambda item: item["count"], reverse=True),
        "monthly_revenue": [by_month[key] for key in sorted(by_month)],
    }


# --- 08. Clinic Settings ---
class ClinicSettingsPayload(BaseModel):
    clinic_name: str = Field(min_length=2, max_length=150)
    address: str = Field(min_length=2, max_length=300)
    contact_email: str = Field(min_length=3, max_length=320)
    contact_phone: str = Field(min_length=7, max_length=32)
    timezone: str = Field(default="America/New_York")
    cancellation_deadline_hours: int = Field(ge=1, le=168)
    intake_policy: str = Field(min_length=2, max_length=50)
    prescriptions_enabled: bool = True
    operating_hours: str = Field(min_length=2, max_length=100)
    authorized_administrators: list[str] = Field(default_factory=list)
    email_alerts_new_doctor: bool = True
    email_alerts_daily_summary: bool = True
    email_alerts_payment_failures: bool = True
    appointment_types: list[Any] = Field(default_factory=list)
    visit_formats: list[Any] = Field(default_factory=list)


DEFAULT_CLINIC_SETTINGS = {
    "clinic_name": "Kaizentrix Care Telehealth Center",
    "address": "742 Medical Center Blvd, San Francisco, CA 94107",
    "contact_email": "support@kaizentrixcare.local",
    "contact_phone": "+1 (800) 555-KAIZEN",
    "timezone": "America/New_York",
    "cancellation_deadline_hours": 24,
    "intake_policy": "clinic_configured",
    "prescriptions_enabled": True,
    "operating_hours": "Mon - Sat: 08:00 AM - 08:00 PM EST",
    "authorized_administrators": ["clinic-admin@teleconsult.local"],
    "email_alerts_new_doctor": True,
    "email_alerts_daily_summary": True,
    "email_alerts_payment_failures": True,
}


@router.get("/settings")
async def get_clinic_settings(request: Request) -> dict[str, Any]:
    await _verify_admin(request)
    settings = get_settings()
    if settings.mongodb_enabled:
        db = mongo_database.database()
        doc = await db["clinic_settings"].find_one({"tenant_id": settings.default_tenant_id})
        if doc:
            return {
                "clinic_name": doc.get("clinic_name", DEFAULT_CLINIC_SETTINGS["clinic_name"]),
                "address": doc.get("address", DEFAULT_CLINIC_SETTINGS["address"]),
                "contact_email": doc.get(
                    "contact_email", DEFAULT_CLINIC_SETTINGS["contact_email"]
                ),
                "contact_phone": doc.get(
                    "contact_phone", DEFAULT_CLINIC_SETTINGS["contact_phone"]
                ),
                "timezone": doc.get("timezone", DEFAULT_CLINIC_SETTINGS["timezone"]),
                "cancellation_deadline_hours": doc.get("cancellation_deadline_hours", 24),
                "intake_policy": doc.get("intake_policy", "clinic_configured"),
                "prescriptions_enabled": doc.get("prescriptions_enabled", True),
                "operating_hours": doc.get(
                    "operating_hours", DEFAULT_CLINIC_SETTINGS["operating_hours"]
                ),
                "authorized_administrators": doc.get(
                    "authorized_administrators",
                    DEFAULT_CLINIC_SETTINGS["authorized_administrators"],
                ),
                "email_alerts_new_doctor": doc.get("email_alerts_new_doctor", True),
                "email_alerts_daily_summary": doc.get("email_alerts_daily_summary", True),
                "email_alerts_payment_failures": doc.get("email_alerts_payment_failures", True),
                "appointment_types": doc.get("appointment_types", []),
                "visit_formats": doc.get("visit_formats", []),
            }
    return DEFAULT_CLINIC_SETTINGS


@router.patch("/settings")
async def update_clinic_settings(
    payload: ClinicSettingsPayload,
    request: Request,
) -> dict[str, Any]:
    principal = await _verify_admin(request)
    settings = get_settings()
    data = payload.model_dump()
    data["tenant_id"] = settings.default_tenant_id

    if settings.mongodb_enabled:
        db = mongo_database.database()
        await db["clinic_settings"].update_one(
            {"tenant_id": settings.default_tenant_id},
            {"$set": data},
            upsert=True,
        )
    await _audit_log(
        principal,
        action="settings.update",
        resource_type="clinic_settings",
        resource_id=settings.default_tenant_id,
        metadata={"clinic_name": payload.clinic_name, "timezone": payload.timezone},
    )
    return data
