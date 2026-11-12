from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.modules.patient_portal.models import Appointment, Doctor, DoctorAvailability

router = APIRouter(prefix="/admin/doctors", tags=["clinic-scheduling"])


class SlotCreate(BaseModel):
    starts_at: datetime
    ends_at: datetime


@router.post("/{doctor_id}/availability", status_code=201)
async def publish_slot(
    doctor_id: UUID,
    payload: SlotCreate,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("clinic:schedule:write")),
) -> dict[str, str]:
    doctor = await session.scalar(select(Doctor).where(Doctor.id == doctor_id, Doctor.tenant_id == UUID(principal.tenant_id)))
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="Slot end must be after slot start")
    existing = await session.scalar(select(DoctorAvailability).where(
        DoctorAvailability.doctor_id == doctor_id, DoctorAvailability.starts_at == payload.starts_at
    ))
    if existing:
        confirmed = await session.scalar(select(Appointment.id).where(
            Appointment.doctor_id == doctor_id, Appointment.starts_at == payload.starts_at,
            Appointment.status.in_(["pending_payment", "confirmed", "checked_in", "in_progress"])
        ))
        if confirmed:
            raise HTTPException(status_code=409, detail="Confirmed appointment protects this slot")
        existing.ends_at, existing.status = payload.ends_at, "available"
    else:
        session.add(DoctorAvailability(tenant_id=UUID(principal.tenant_id), doctor_id=doctor_id,
            starts_at=payload.starts_at, ends_at=payload.ends_at, status="available"))
    return {"status": "published"}
