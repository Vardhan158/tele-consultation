from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database

router = APIRouter(prefix="/admin/doctors", tags=["clinic-scheduling"])


class SlotCreate(BaseModel):
    starts_at: datetime
    ends_at: datetime


@router.post("/{doctor_id}/availability", status_code=201)
async def publish_slot(
    doctor_id: UUID | str,
    payload: SlotCreate,
    principal: Principal = Depends(require("clinic:schedule:write")),
) -> dict[str, str]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await db["doctors"].find_one({"id": str(doctor_id), "tenant_id": str(principal.tenant_id)})
    if not doctor:
        doctor = await db["doctors"].find_one({"user_id": str(doctor_id), "tenant_id": str(principal.tenant_id)})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="Slot end must be after slot start")

    doc_id_str = str(doctor.get("id") or doctor.get("user_id") or doctor_id)
    starts_val = payload.starts_at.isoformat() if isinstance(payload.starts_at, datetime) else payload.starts_at
    ends_val = payload.ends_at.isoformat() if isinstance(payload.ends_at, datetime) else payload.ends_at

    existing = await db["doctor_availability"].find_one({
        "tenant_id": str(principal.tenant_id),
        "doctor_id": doc_id_str,
        "starts_at": starts_val,
    })
    if existing:
        confirmed = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doc_id_str,
            "starts_at": starts_val,
            "status": {"$in": ["pending_payment", "confirmed", "checked_in", "in_progress"]}
        })
        if confirmed:
            raise HTTPException(status_code=409, detail="Confirmed appointment protects this slot")
        await db["doctor_availability"].update_one(
            {"_id": existing["_id"]},
            {"$set": {"ends_at": ends_val, "status": "available"}}
        )
    else:
        await db["doctor_availability"].insert_one({
            "id": str(uuid4()),
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doc_id_str,
            "starts_at": starts_val,
            "ends_at": ends_val,
            "status": "available",
        })
    return {"status": "published"}
