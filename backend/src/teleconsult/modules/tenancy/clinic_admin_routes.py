"""MongoDB-backed clinic administrator operations.

These routes deliberately do not use the legacy SQL session. Every query carries
the authenticated tenant (and, where present, clinic) scope explicitly.
"""
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal, require_permission
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import token_hash

router = APIRouter(prefix="/clinic-admin", tags=["clinic-administration"])


async def clinic_admin(request: Request) -> MongoPrincipal:
    settings = get_settings()
    if not settings.mongodb_enabled or not mongo_database.enabled:
        raise HTTPException(503, "MongoDB clinic administration is not enabled")
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
    if not user or user.get("role") != "clinic_admin":
        raise HTTPException(403, "Clinic administrator access required")
    return MongoPrincipal(user_id=user["id"], tenant_id=user["tenant_id"], role=user["role"], clinic_id=user.get("clinic_id"))


def _scope(principal: MongoPrincipal) -> dict[str, Any]:
    scope = {"tenant_id": principal.tenant_id}
    if principal.clinic_id:
        scope["clinic_id"] = principal.clinic_id
    return scope


def _clean(document: dict[str, Any]) -> dict[str, Any]:
    document.pop("_id", None)
    for key, value in list(document.items()):
        if hasattr(value, "isoformat"):
            document[key] = value.isoformat()
    return document


class Decision(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class ClinicSettings(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    contact_email: str = Field(max_length=254)
    contact_phone: str = Field(max_length=40)
    timezone: str = Field(default="Asia/Calcutta", max_length=64)
    specialties: list[str] = Field(default_factory=list, max_length=30)
    operating_hours: dict[str, str] = Field(default_factory=dict)
    holidays: list[str] = Field(default_factory=list, max_length=100)


class AppointmentUpdate(BaseModel):
    starts_at: str | None = None
    reason: str | None = Field(default=None, max_length=1000)


@router.get("/dashboard")
async def dashboard(principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:doctor:read")
    db, scope = mongo_database.database(), _scope(principal)
    now = datetime.now(UTC).isoformat()
    today = now[:10]
    def count(collection: str, extra: dict[str, Any] | None = None):
        return db[collection].count_documents({**scope, **(extra or {})})
    appointments = db["appointments"]
    return {
        "doctors_total": await count("doctors"),
        "doctors_active": await count("doctors", {"active": True, "approval_status": "approved"}),
        "pending_approvals": await count("doctors", {"approval_status": "pending"}),
        "appointments_today": await appointments.count_documents({**scope, "starts_at": {"$regex": f"^{today}"}}),
        "upcoming_appointments": await appointments.count_documents({**scope, "starts_at": {"$gt": now}, "status": {"$nin": ["cancelled", "completed"]}}),
        "completed_appointments": await count("appointments", {"status": "completed"}),
        "cancelled_appointments": await count("appointments", {"status": "cancelled"}),
        "active_patients": await db["patients"].count_documents(scope),
        "recent_activity": [_clean(x) async for x in db["audit_logs"].find(scope).sort("created_at", -1).limit(8)],
    }


@router.get("/doctors")
async def doctors(search: str = "", status: str = "", offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100), principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:doctor:read")
    query: dict[str, Any] = _scope(principal)
    if status: query["approval_status"] = status
    if search: query["$or"] = [{"full_name": {"$regex": search, "$options": "i"}}, {"specialty": {"$regex": search, "$options": "i"}}]
    collection = mongo_database.database()["doctors"]
    items = [_clean(x) async for x in collection.find(query).sort("created_at", -1).skip(offset).limit(limit)]
    return {"items": items, "total": await collection.count_documents(query), "offset": offset, "limit": limit}


@router.get("/approvals")
async def approvals(principal: MongoPrincipal = Depends(clinic_admin)) -> list[dict[str, Any]]:
    require_permission(principal, "clinic:doctor:read")
    return [_clean(x) async for x in mongo_database.database()["doctors"].find({**_scope(principal), "approval_status": "pending"}).sort("created_at", -1)]


@router.get("/appointments")
async def appointments(status: str = "", doctor_id: str = "", date: str = "", search: str = "", offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100), principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:appointments:read")
    query: dict[str, Any] = _scope(principal)
    if status: query["status"] = status
    if doctor_id: query["doctor_id"] = doctor_id
    if date: query["starts_at"] = {"$regex": f"^{date}"}
    if search: query["$or"] = [{"patient_name": {"$regex": search, "$options": "i"}}, {"doctor_name": {"$regex": search, "$options": "i"}}]
    collection = mongo_database.database()["appointments"]
    items = [_clean(x) async for x in collection.find(query).sort("starts_at", 1).skip(offset).limit(limit)]
    return {"items": items, "total": await collection.count_documents(query), "offset": offset, "limit": limit}


@router.post("/appointments/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: str, payload: AppointmentUpdate = AppointmentUpdate(), principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, str]:
    require_permission(principal, "clinic:appointments:write")
    db, scope = mongo_database.database(), _scope(principal)
    now = datetime.now(UTC)
    result = await db["appointments"].update_one({**scope, "id": appointment_id, "status": {"$nin": ["cancelled", "completed"]}}, {"$set": {"status": "cancelled", "cancelled_by": principal.user_id, "cancelled_at": now, "cancellation_reason": payload.reason}})
    if result.modified_count != 1: raise HTTPException(409, "Appointment cannot be cancelled")
    await _appointment_audit(db, scope, principal, appointment_id, "appointment.cancelled", payload.reason)
    return {"status": "cancelled"}


@router.post("/appointments/{appointment_id}/reschedule")
async def reschedule_appointment(appointment_id: str, payload: AppointmentUpdate, principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, str]:
    require_permission(principal, "clinic:appointments:write")
    if not payload.starts_at: raise HTTPException(422, "starts_at is required")
    db, scope = mongo_database.database(), _scope(principal)
    appointment = await db["appointments"].find_one({**scope, "id": appointment_id})
    if not appointment or appointment.get("status") in {"cancelled", "completed"}: raise HTTPException(409, "Appointment cannot be rescheduled")
    conflict = await db["appointments"].find_one({**scope, "doctor_id": appointment["doctor_id"], "starts_at": payload.starts_at, "status": {"$nin": ["cancelled", "completed"]}, "id": {"$ne": appointment_id}})
    if conflict: raise HTTPException(409, "Doctor is already booked for that time")
    result = await db["appointments"].update_one({**scope, "id": appointment_id, "status": appointment["status"]}, {"$set": {"starts_at": payload.starts_at, "status": "rescheduled", "rescheduled_by": principal.user_id, "rescheduled_at": datetime.now(UTC), "reschedule_reason": payload.reason}})
    if result.modified_count != 1: raise HTTPException(409, "Appointment changed before rescheduling")
    await _appointment_audit(db, scope, principal, appointment_id, "appointment.rescheduled", payload.reason)
    return {"status": "rescheduled"}


async def _appointment_audit(db, scope, principal, appointment_id: str, action: str, reason: str | None) -> None:
    await db["audit_logs"].insert_one({"id": str(uuid4()), **scope, "actor_id": principal.user_id, "action": action, "target_id": appointment_id, "metadata": {"reason": reason}, "created_at": datetime.now(UTC)})


@router.get("/patients")
async def patients(search: str = "", offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100), principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:patients:read")
    query: dict[str, Any] = _scope(principal)
    if search: query["$or"] = [{"full_name": {"$regex": search, "$options": "i"}}, {"email": {"$regex": search, "$options": "i"}}]
    collection = mongo_database.database()["patients"]
    projection = {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "preferred_language": 1, "created_at": 1}
    items = [_clean(x) async for x in collection.find(query, projection).sort("full_name", 1).skip(offset).limit(limit)]
    return {"items": items, "total": await collection.count_documents(query), "offset": offset, "limit": limit}


@router.get("/reports")
async def reports(start: str = "", end: str = "", doctor_id: str = "", principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:reports:read")
    match: dict[str, Any] = _scope(principal)
    if doctor_id: match["doctor_id"] = doctor_id
    if start or end: match["starts_at"] = {**({"$gte": start} if start else {}), **({"$lte": end} if end else {})}
    collection = mongo_database.database()["appointments"]
    grouped = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    counts = {row["_id"]: row["count"] async for row in collection.aggregate([{"$match": match}, *grouped])}
    doctor_utilization = [row async for row in collection.aggregate([{"$match": match}, {"$group": {"_id": "$doctor_id", "appointments": {"$sum": 1}, "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}}}}, {"$sort": {"appointments": -1}}, {"$limit": 50}])]
    return {"total": sum(counts.values()), "by_status": counts, "doctor_utilization": [_clean(x) for x in doctor_utilization]}


@router.get("/audit")
async def audit(action: str = "", actor_id: str = "", offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:audit:read")
    query: dict[str, Any] = _scope(principal)
    if action: query["action"] = action
    if actor_id: query["actor_id"] = actor_id
    collection = mongo_database.database()["audit_logs"]
    items = [_clean(x) async for x in collection.find(query).sort("created_at", -1).skip(offset).limit(limit)]
    return {"items": items, "total": await collection.count_documents(query), "offset": offset, "limit": limit}


async def decide(doctor_id: str, decision: str, payload: Decision, principal: MongoPrincipal) -> dict[str, str]:
    require_permission(principal, "clinic:doctor:approve")
    if decision == "rejected" and not payload.reason:
        raise HTTPException(422, "A rejection reason is required")
    now = datetime.now(UTC)
    update = {"approval_status": decision, "active": decision == "approved", "approved_for_consultation": decision == "approved", "decision_by": principal.user_id, "decision_at": now, "decision_reason": payload.reason}
    result = await mongo_database.database()["doctors"].update_one({**_scope(principal), "id": doctor_id, "approval_status": "pending"}, {"$set": update})
    if result.modified_count != 1: raise HTTPException(409, "Doctor approval is no longer pending")
    await mongo_database.database()["notifications"].insert_one({"id": str(uuid4()), **_scope(principal), "recipient_id": doctor_id, "type": "doctor_approval", "title": f"Doctor application {decision}", "message": payload.reason, "read_at": None, "created_at": now})
    await mongo_database.database()["audit_logs"].insert_one({"id": str(uuid4()), **_scope(principal), "actor_id": principal.user_id, "action": f"doctor.{decision}", "target_id": doctor_id, "metadata": {"reason": payload.reason}, "created_at": now})
    return {"status": decision}


@router.post("/doctors/{doctor_id}/approve")
async def approve(doctor_id: str, payload: Decision = Decision(), principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, str]:
    return await decide(doctor_id, "approved", payload, principal)


@router.post("/doctors/{doctor_id}/reject")
async def reject(doctor_id: str, payload: Decision, principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, str]:
    return await decide(doctor_id, "rejected", payload, principal)


@router.get("/settings")
async def get_clinic_settings(principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, Any]:
    require_permission(principal, "clinic:doctor:read")
    return _clean(await mongo_database.database()["clinics"].find_one(_scope(principal)) or {**_scope(principal), "name": "", "specialties": [], "operating_hours": {}, "holidays": []})


@router.patch("/settings")
async def update_clinic_settings(payload: ClinicSettings, principal: MongoPrincipal = Depends(clinic_admin)) -> dict[str, str]:
    require_permission(principal, "clinic:settings:write")
    now = datetime.now(UTC)
    await mongo_database.database()["clinics"].update_one(_scope(principal), {"$set": {**payload.model_dump(), "updated_at": now}, "$setOnInsert": {"id": str(uuid4()), **_scope(principal)}}, upsert=True)
    await mongo_database.database()["audit_logs"].insert_one({"id": str(uuid4()), **_scope(principal), "actor_id": principal.user_id, "action": "clinic.settings.updated", "metadata": {"fields": list(payload.model_dump())}, "created_at": now})
    return {"status": "updated"}
