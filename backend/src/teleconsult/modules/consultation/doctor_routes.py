import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.audit.models import AuditRecord
from teleconsult.modules.consultation.clinical_models import ClinicalNote, ClinicalNoteAmendment
from teleconsult.modules.consultation.video_models import VideoSession
from teleconsult.modules.identity.auth_routes import auth_database_session
from teleconsult.modules.patient_portal.models import (
    Appointment,
    Doctor,
    DoctorAvailability,
    Patient,
)

router = APIRouter(prefix="/doctor", tags=["doctor-portal"])


async def _doctor(session: AsyncSession, principal: Principal) -> Doctor:
    doctor = await session.scalar(select(Doctor).where(
        Doctor.user_account_id == UUID(principal.user_id), Doctor.tenant_id == UUID(principal.tenant_id)))
    if doctor is None or doctor.approval_status != "approved" or not doctor.active:
        raise HTTPException(status_code=403, detail="Approved doctor access is required")
    return doctor


@router.post("/consultations/{appointment_id}/join")
async def doctor_join_consultation(appointment_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("consultation:admit"))):
    doctor = await _doctor(session, principal)
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_id, Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id,
        Appointment.status.in_(["confirmed", "checked_in", "in_progress"])))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Eligible consultation not found")
    now = datetime.now(UTC)
    room_name = f"teleconsult-{appointment.id}"
    raw_token = secrets.token_urlsafe(48)
    video = await session.scalar(select(VideoSession).where(VideoSession.appointment_id == appointment.id, VideoSession.patient_id == appointment.patient_id))
    if video is None:
        video = VideoSession(tenant_id=doctor.tenant_id, appointment_id=appointment.id, patient_id=appointment.patient_id, provider="webrtc", room_id=room_name, status="waiting")
        session.add(video)
    video.token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    video.doctor_token_hash = video.token_hash
    video.token_expires_at = now + timedelta(minutes=15)
    video.provider = "webrtc"
    return {"session_id": video.id, "room_id": room_name, "room_url": None, "token": raw_token, "status": video.status}


class DoctorSlot(BaseModel):
    starts_at: datetime
    ends_at: datetime


class NotePayload(BaseModel):
    content_reference: str


@router.get("/dashboard")
async def dashboard(session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:appointment:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": principal.user_id}, {"user_id": principal.user_id}, {"user_account_id": principal.user_id}],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        now = datetime.now(UTC)
        appointments = await db["appointments"].find({
            "tenant_id": principal.tenant_id,
            "doctor_id": doctor.get("id"),
            "starts_at": {"$gte": now},
        }).sort("starts_at", 1).to_list(100)
        completed = await db["appointments"].count_documents({"tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"), "status": "completed"})
        pending_notes = await db["clinical_notes"].count_documents({"tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"), "status": "draft"})
        return {"today": sum(1 for item in appointments if str(item.get("starts_at", ""))[:10] == now.date().isoformat()), "upcoming": len(appointments), "completed": completed, "pending_notes": pending_notes}
    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    doctor = await _doctor(session, principal)
    now = datetime.now(UTC)
    appointments = await session.scalars(select(Appointment).where(
        Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id,
        Appointment.starts_at >= now).order_by(Appointment.starts_at).limit(100))
    items = list(appointments)
    return {"today": sum(1 for item in items if item.starts_at.date() == now.date()),
        "upcoming": len(items), "completed": await session.scalar(select(func.count(Appointment.id)).where(
            Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id, Appointment.status == "completed")),
        "pending_notes": await session.scalar(select(func.count(ClinicalNote.id)).where(
            ClinicalNote.tenant_id == doctor.tenant_id, ClinicalNote.doctor_id == doctor.id, ClinicalNote.status == "draft"))}


@router.get("/appointments")
async def doctor_appointments(session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:appointment:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": principal.user_id}, {"user_id": principal.user_id}, {"user_account_id": principal.user_id}],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        result = await db["appointments"].find({
            "tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"),
        }).sort("starts_at", -1).to_list(200)
        return [{"id": item.get("id") or str(item.get("_id")), "patient_id": item.get("patient_id"), "starts_at": item.get("starts_at"), "ends_at": item.get("ends_at"), "status": item.get("status"), "payment_status": item.get("payment_status", "not_required")} for item in result]
    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    doctor = await _doctor(session, principal)
    result = await session.scalars(select(Appointment).where(
        Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id).order_by(Appointment.starts_at.desc()).limit(200))
    return [{"id": item.id, "patient_id": item.patient_id, "starts_at": item.starts_at, "ends_at": item.ends_at,
        "status": item.status, "payment_status": item.payment_status} for item in result]


@router.get("/availability")
async def doctor_availability(session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("doctor:availability:read"))):
    doctor = await _doctor(session, principal)
    result = await session.scalars(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == doctor.tenant_id, DoctorAvailability.doctor_id == doctor.id).order_by(DoctorAvailability.starts_at))
    return list(result)


@router.post("/availability", status_code=201)
async def create_availability(payload: DoctorSlot, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("doctor:availability:write"))):
    doctor = await _doctor(session, principal)
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="Slot end must be after slot start")
    conflict = await session.scalar(select(DoctorAvailability.id).where(
        DoctorAvailability.tenant_id == doctor.tenant_id, DoctorAvailability.doctor_id == doctor.id,
        DoctorAvailability.starts_at < payload.ends_at, DoctorAvailability.ends_at > payload.starts_at,
        DoctorAvailability.status == "available"))
    if conflict:
        raise HTTPException(status_code=409, detail="Availability overlaps an existing slot")
    slot = DoctorAvailability(tenant_id=doctor.tenant_id, doctor_id=doctor.id, status="available", **payload.model_dump())
    session.add(slot)
    await session.flush()
    return slot


@router.post("/appointments/{appointment_id}/notes", status_code=201)
async def save_note(appointment_id: UUID, payload: NotePayload, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:write"))):
    doctor = await _doctor(session, principal)
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_id, Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id,
        Appointment.status.in_(["in_progress", "completed"])))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
    note = ClinicalNote(tenant_id=doctor.tenant_id, consultation_id=appointment.id, doctor_id=doctor.id,
        content_reference=payload.content_reference, status="draft")
    session.add(note)
    await session.flush()
    return {"id": note.id, "status": note.status}


@router.get("/appointments/{appointment_id}/notes")
async def appointment_notes(appointment_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:read"))):
    doctor = await _doctor(session, principal)
    appointment = await session.scalar(select(Appointment).where(Appointment.id == appointment_id, Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
    notes = await session.scalars(select(ClinicalNote).where(ClinicalNote.consultation_id == appointment_id, ClinicalNote.doctor_id == doctor.id).order_by(ClinicalNote.created_at.desc()))
    return [{"id": note.id, "status": note.status, "content_reference": note.content_reference, "created_at": note.created_at} for note in notes]

@router.patch("/notes/{note_id}")
async def update_draft_note(note_id: UUID, payload: NotePayload, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:write"))):
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(ClinicalNote.id == note_id, ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None:
        raise HTTPException(status_code=404, detail="Clinical note not found")
    if note.status != "draft":
        raise HTTPException(status_code=409, detail="Finalized notes cannot be edited; create an amendment")
    note.content_reference = payload.content_reference
    return {"id": note.id, "status": note.status}


@router.get("/patients")
async def doctor_patients(session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:read"))):
    doctor = await _doctor(session, principal)
    rows = await session.execute(select(Patient, Appointment).join(Appointment, Appointment.patient_id == Patient.id).where(
        Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id).distinct())
    result = []
    seen = set()
    for patient, _appointment in rows:
        if patient.id in seen:
            continue
        seen.add(patient.id)
        session.add(AuditRecord(tenant_id=doctor.tenant_id, actor_id=UUID(principal.user_id), action="patient.list",
            resource_type="patient", resource_id=patient.id, purpose="authorized clinical relationship", metadata_json={}))
        result.append({"id": patient.id, "full_name": patient.full_name, "preferred_language": patient.preferred_language})
    return result


@router.get("/patients/{patient_id}")
async def doctor_patient_detail(patient_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:read"))):
    doctor = await _doctor(session, principal)
    appointments = list(await session.scalars(select(Appointment).where(
        Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id, Appointment.patient_id == patient_id
    ).order_by(Appointment.starts_at.desc()).limit(100)))
    if not appointments:
        raise HTTPException(status_code=404, detail="Patient is not linked to this doctor")
    patient = await session.get(Patient, patient_id)
    notes = list(await session.scalars(select(ClinicalNote).where(
        ClinicalNote.tenant_id == doctor.tenant_id, ClinicalNote.doctor_id == doctor.id,
        ClinicalNote.consultation_id.in_([item.id for item in appointments])
    ).order_by(ClinicalNote.created_at.desc())))
    return {
        "patient": {"id": patient.id, "full_name": patient.full_name, "preferred_language": patient.preferred_language},
        "appointments": [{"id": item.id, "starts_at": item.starts_at, "ends_at": item.ends_at, "status": item.status, "reason": item.reason} for item in appointments],
        "notes": [{"id": item.id, "appointment_id": item.consultation_id, "status": item.status, "content_reference": item.content_reference, "created_at": item.created_at} for item in notes],
    }


@router.post("/appointments/{appointment_id}/notes/{note_id}/finalize")
async def finalize_note(appointment_id: UUID, note_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:write"))):
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(
        ClinicalNote.id == note_id, ClinicalNote.consultation_id == appointment_id,
        ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None:
        raise HTTPException(status_code=404, detail="Clinical note not found")
    if note.status == "finalized":
        raise HTTPException(status_code=409, detail="Clinical note is already finalized")
    note.status = "finalized"
    session.add(AuditRecord(tenant_id=doctor.tenant_id, actor_id=doctor.user_account_id, action="clinical_note.finalize",
        resource_type="clinical_note", resource_id=note.id, purpose="clinical documentation", metadata_json={}))
    return {"id": note.id, "status": note.status}


@router.get("/notes/{note_id}/amendments")
async def note_amendments(note_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:read"))):
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(ClinicalNote.id == note_id, ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None:
        raise HTTPException(status_code=404, detail="Clinical note not found")
    rows = await session.scalars(select(ClinicalNoteAmendment).where(ClinicalNoteAmendment.note_id == note_id, ClinicalNoteAmendment.tenant_id == doctor.tenant_id).order_by(ClinicalNoteAmendment.version))
    return list(rows)


@router.post("/notes/{note_id}/amend", status_code=201)
async def amend_note(note_id: UUID, payload: NotePayload, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:write"))):
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(ClinicalNote.id == note_id, ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None or note.status != "finalized":
        raise HTTPException(status_code=409, detail="Only finalized notes can be amended")
    latest = await session.scalar(select(func.max(ClinicalNoteAmendment.version)).where(ClinicalNoteAmendment.note_id == note_id))
    amendment = ClinicalNoteAmendment(tenant_id=doctor.tenant_id, note_id=note.id, author_id=UUID(principal.user_id), version=(latest or 0) + 1, content_reference=payload.content_reference)
    session.add(amendment)
    session.add(AuditRecord(tenant_id=doctor.tenant_id, actor_id=UUID(principal.user_id), action="clinical_note.amend", resource_type="clinical_note", resource_id=note.id, purpose="clinical documentation amendment", metadata_json={"version": amendment.version}))
    await session.flush()
    return {"id": amendment.id, "version": amendment.version}
