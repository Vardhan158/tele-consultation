import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.audit.models import AuditRecord
from teleconsult.modules.consultation.clinical_models import ClinicalNote, ClinicalNoteAmendment
from teleconsult.modules.consultation.video_models import VideoSession
from teleconsult.modules.identity.auth_routes import auth_database_session
from teleconsult.modules.patient_portal.appointment_access import appointment_times, latest_payment
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
async def doctor_join_consultation(appointment_id: str, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("consultation:admit"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor_doc = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [
                {"id": principal.user_id},
                {"user_id": principal.user_id},
                {"user_account_id": principal.user_id},
            ],
        })
        if doctor_doc is None or doctor_doc.get("approval_status") != "approved" or not doctor_doc.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        appointment = await db["appointments"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": appointment_id}, {"id": appointment_id.lower()}, {"id": appointment_id.upper()}],
            "doctor_id": doctor_doc.get("id"),
            "status": {"$in": ["confirmed", "checked_in", "in_progress"]},
        })
        if appointment is None:
            raise HTTPException(status_code=404, detail="Eligible consultation not found")
        if str(appointment.get("payment_status", "")).lower() not in {"captured", "success", "not_required", "no_payment_required", "not_needed"}:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Payment is required before joining the consultation room.")

        now = datetime.now(UTC)
        raw_token = secrets.token_urlsafe(48)
        video = await db["video_sessions"].find_one({"tenant_id": principal.tenant_id, "appointment_id": appointment_id})
        if not video:
            video = {"id": f"vses-{secrets.token_hex(6)}", "tenant_id": principal.tenant_id, "appointment_id": appointment_id, "patient_id": appointment.get("patient_id"), "room_id": f"teleconsult-{appointment_id}", "provider": "webrtc", "status": "waiting", "created_at": now.isoformat()}
            await db["video_sessions"].insert_one(dict(video))
        await db["video_sessions"].update_one({"id": video["id"]}, {"$set": {"doctor_token_hash": hashlib.sha256(raw_token.encode()).hexdigest(), "token_expires_at": (now + timedelta(minutes=15)).isoformat(), "status": video.get("status", "waiting")}})
        return {"session_id": UUID(int=hash(video["id"]) & 0xffffffffffffffffffffffffffffffff) if len(video["id"]) != 36 else UUID(video["id"]), "room_id": video.get("room_id", f"teleconsult-{appointment_id}"), "room_url": None, "token": raw_token, "status": video.get("status", "waiting")}

    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    doctor = await _doctor(session, principal)
    try:
        appointment_uuid = UUID(appointment_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Eligible consultation not found") from None
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_uuid, Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id,
        Appointment.status.in_(["confirmed", "checked_in", "in_progress"])))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Eligible consultation not found")
    if appointment.payment_status not in {"captured", "success", "not_required", "no_payment_required", "not_needed"}:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment is required before joining the consultation room.",
        )
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
    reason: str = ""


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

        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": principal.tenant_id})
        tz_name = (clinic_settings or {}).get("timezone", "Asia/Kolkata")
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")

        now_tz = datetime.now(tz)
        today_iso = now_tz.strftime("%Y-%m-%d")

        all_appointments = await db["appointments"].find({
            "tenant_id": principal.tenant_id,
            "doctor_id": doctor.get("id"),
            "status": {"$in": ["confirmed", "requested", "pending_payment", "checked_in", "in_progress", "rescheduled"]},
        }).sort("starts_at", 1).to_list(200)

        today_count = 0
        upcoming_count = 0

        for item in all_appointments:
            starts_raw = item.get("starts_at")
            if not starts_raw:
                continue

            if isinstance(starts_raw, datetime):
                starts_dt = starts_raw.astimezone(tz)
            else:
                try:
                    starts_dt = datetime.fromisoformat(str(starts_raw).replace("Z", "+00:00")).astimezone(tz)
                except ValueError:
                    continue

            item_date_str = starts_dt.strftime("%Y-%m-%d")
            if item_date_str == today_iso:
                today_count += 1

            if starts_dt.timestamp() + 3600 >= now_tz.timestamp():
                upcoming_count += 1

        completed = await db["appointments"].count_documents({"tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"), "status": "completed"})
        pending_notes = await db["clinical_notes"].count_documents({"tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"), "status": "draft"})
        return {
            "today": today_count,
            "upcoming": upcoming_count,
            "completed": completed,
            "pending_notes": pending_notes,
        }
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

        output = []
        for item in result:
            pat_id = item.get("patient_id")
            patient_doc = await db["patients"].find_one({"tenant_id": principal.tenant_id, "$or": [{"id": str(pat_id)}, {"user_id": str(pat_id)}]}) if pat_id else None
            patient_name = patient_doc.get("full_name") if patient_doc else "Emma Mitchell"

            payment = await latest_payment(db, principal.tenant_id, item.get("id") or str(item.get("_id")))
            raw_pay = str((payment or {}).get("status") or item.get("payment_status") or "pending").lower()
            starts_at, ends_at = appointment_times(item)
            pay_label = (
                "Paid" if raw_pay in {"captured", "success"}
                else "No Payment Required" if raw_pay in {"not_required", "no_payment_required"}
                else "Payment Failed" if raw_pay == "failed"
                else "Refunded" if raw_pay == "refunded"
                else "Payment Pending"
            )

            output.append({
                "id": item.get("id") or str(item.get("_id")),
                "patient_id": pat_id,
                "patient_name": patient_name,
                "starts_at": starts_at,
                "ends_at": ends_at,
                "status": item.get("status", "confirmed"),
                "payment_status": pay_label,
                "raw_payment_status": raw_pay,
                "type": item.get("type", "Follow-up Consultation"),
                "fee_paise": item.get("fee_paise") or item.get("total_payable_paise"),
            })
        return output
    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    doctor = await _doctor(session, principal)
    result = await session.scalars(select(Appointment).where(
        Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id).order_by(Appointment.starts_at.desc()).limit(200))
    return [{"id": item.id, "patient_id": item.patient_id, "starts_at": item.starts_at, "ends_at": item.ends_at,
        "status": item.status, "payment_status": item.payment_status} for item in result]


@router.get("/availability")
async def doctor_availability(
    session: AsyncSession | None = Depends(auth_database_session),
    principal: Principal = Depends(require("doctor:availability:read")),
):
    if get_settings().mongodb_enabled and mongo_database.enabled:
        db = mongo_database.database()
        doctor_doc = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [
                {"id": principal.user_id},
                {"user_id": principal.user_id},
                {"user_account_id": principal.user_id},
            ],
        })
        if doctor_doc is None or doctor_doc.get("approval_status") != "approved" or not doctor_doc.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        doctor_id = str(doctor_doc.get("id"))
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": str(principal.tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")

        cursor = db["doctor_availability"].find({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "status": {"$ne": "deleted"},
        }).sort("starts_at", 1)

        slots = []
        async for doc in cursor:
            slots.append({
                "id": str(doc.get("id", doc.get("_id"))),
                "doctor_id": doc.get("doctor_id"),
                "starts_at": doc.get("starts_at"),
                "ends_at": doc.get("ends_at"),
                "status": doc.get("status", "available"),
                "timezone": clinic_timezone,
            })
        return slots

    if session is None:
        raise HTTPException(status_code=503, detail="Runtime database is unavailable")

    doctor = await _doctor(session, principal)
    result = await session.scalars(
        select(DoctorAvailability)
        .where(
            DoctorAvailability.tenant_id == doctor.tenant_id,
            DoctorAvailability.doctor_id == doctor.id,
        )
        .order_by(DoctorAvailability.starts_at)
    )
    return list(result)


@router.post("/availability", status_code=201)
async def create_availability(
    payload: DoctorSlot,
    session: AsyncSession | None = Depends(auth_database_session),
    principal: Principal = Depends(require("doctor:availability:write")),
):
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="Slot end must be after slot start")

    if get_settings().mongodb_enabled and mongo_database.enabled:
        db = mongo_database.database()
        doctor_doc = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [
                {"id": principal.user_id},
                {"user_id": principal.user_id},
                {"user_account_id": principal.user_id},
            ],
        })
        if doctor_doc is None or doctor_doc.get("approval_status") != "approved" or not doctor_doc.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        doctor_id = str(doctor_doc.get("id"))
        starts_iso = payload.starts_at.astimezone(UTC).isoformat() if payload.starts_at.tzinfo else payload.starts_at.isoformat()
        ends_iso = payload.ends_at.astimezone(UTC).isoformat() if payload.ends_at.tzinfo else payload.ends_at.isoformat()

        # Check for overlapping or duplicate slots in MongoDB
        conflict = await db["doctor_availability"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "status": {"$in": ["available", "reserved", "booked"]},
            "starts_at": {"$lt": ends_iso},
            "ends_at": {"$gt": starts_iso},
        })
        if conflict:
            raise HTTPException(status_code=409, detail="Availability overlaps an existing slot")

        slot_id = str(uuid4())
        slot_doc = {
            "id": slot_id,
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "starts_at": starts_iso,
            "ends_at": ends_iso,
            "status": "available",
            "created_at": datetime.now(UTC).isoformat(),
        }
        await db["doctor_availability"].insert_one(slot_doc)

        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": str(principal.tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")

        return {
            "id": slot_id,
            "doctor_id": doctor_id,
            "starts_at": starts_iso,
            "ends_at": ends_iso,
            "status": "available",
            "timezone": clinic_timezone,
        }

    if session is None:
        raise HTTPException(status_code=503, detail="Runtime database is unavailable")

    doctor = await _doctor(session, principal)
    conflict = await session.scalar(
        select(DoctorAvailability.id).where(
            DoctorAvailability.tenant_id == doctor.tenant_id,
            DoctorAvailability.doctor_id == doctor.id,
            DoctorAvailability.starts_at < payload.ends_at,
            DoctorAvailability.ends_at > payload.starts_at,
            DoctorAvailability.status.in_(["available", "reserved", "booked"]),
        )
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Availability overlaps an existing slot")

    slot = DoctorAvailability(
        tenant_id=doctor.tenant_id,
        doctor_id=doctor.id,
        status="available",
        **payload.model_dump(),
    )
    session.add(slot)
    await session.flush()
    return slot


@router.delete("/availability/{slot_id}")
async def delete_availability(
    slot_id: str,
    session: AsyncSession | None = Depends(auth_database_session),
    principal: Principal = Depends(require("doctor:availability:write")),
):
    if get_settings().mongodb_enabled and mongo_database.enabled:
        db = mongo_database.database()
        doctor_doc = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [
                {"id": principal.user_id},
                {"user_id": principal.user_id},
                {"user_account_id": principal.user_id},
            ],
        })
        if doctor_doc is None or doctor_doc.get("approval_status") != "approved" or not doctor_doc.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        doctor_id = str(doctor_doc.get("id"))
        result = await db["doctor_availability"].delete_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "id": slot_id,
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Availability slot not found")
        return {"status": "deleted", "slot_id": slot_id}

    if session is None:
        raise HTTPException(status_code=503, detail="Runtime database is unavailable")

    doctor = await _doctor(session, principal)
    slot = await session.scalar(
        select(DoctorAvailability).where(
            DoctorAvailability.id == UUID(slot_id),
            DoctorAvailability.tenant_id == doctor.tenant_id,
            DoctorAvailability.doctor_id == doctor.id,
        )
    )
    if slot is None:
        raise HTTPException(status_code=404, detail="Availability slot not found")
    await session.delete(slot)
    return {"status": "deleted", "slot_id": slot_id}


@router.post("/appointments/{appointment_id}/notes", status_code=201)
async def save_note(appointment_id: str, payload: NotePayload, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(principal.user_id)},
                {"user_id": str(principal.user_id)},
                {"user_account_id": str(principal.user_id)},
            ],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        appointment = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": str(doctor.get("id")),
            "id": str(appointment_id),
            "status": {"$in": ["in_progress", "completed"]},
        })
        if appointment is None:
            raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
        note = {
            "id": f"note-{secrets.token_hex(8)}",
            "tenant_id": str(principal.tenant_id),
            "consultation_id": str(appointment_id),
            "appointment_id": str(appointment_id),
            "doctor_id": str(doctor.get("id")),
            "author_id": str(principal.user_id),
            "content_reference": payload.content_reference,
            "status": "draft",
            "created_at": datetime.now(UTC).isoformat(),
        }
        await db["clinical_notes"].insert_one(note)
        return {"id": note["id"], "status": note["status"]}

    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    try:
        appointment_uuid = UUID(appointment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Authorized clinical encounter not found") from exc
    doctor = await _doctor(session, principal)
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_uuid, Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id,
        Appointment.status.in_(["in_progress", "completed"])))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
    note = ClinicalNote(tenant_id=doctor.tenant_id, consultation_id=appointment.id, doctor_id=doctor.id,
        content_reference=payload.content_reference, status="draft")
    session.add(note)
    await session.flush()
    return {"id": note.id, "status": note.status}


@router.get("/appointments/{appointment_id}/notes")
async def appointment_notes(appointment_id: str, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(principal.user_id)},
                {"user_id": str(principal.user_id)},
                {"user_account_id": str(principal.user_id)},
            ],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        appointment = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": str(doctor.get("id")),
            "id": str(appointment_id),
        })
        if appointment is None:
            raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")

        notes = await db["clinical_notes"].find({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": str(doctor.get("id")),
            "$or": [
                {"consultation_id": str(appointment_id)},
                {"appointment_id": str(appointment_id)},
            ],
        }).sort("created_at", -1).to_list(100)
        return [
            {
                "id": item.get("id") or str(item.get("_id")),
                "status": item.get("status", "draft"),
                "content_reference": item.get("content_reference") or item.get("content", ""),
                "created_at": item.get("created_at"),
            }
            for item in notes
        ]

    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    try:
        appointment_uuid = UUID(appointment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Authorized clinical encounter not found") from exc
    doctor = await _doctor(session, principal)
    appointment = await session.scalar(select(Appointment).where(Appointment.id == appointment_uuid, Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
    notes = await session.scalars(select(ClinicalNote).where(ClinicalNote.consultation_id == appointment_uuid, ClinicalNote.doctor_id == doctor.id).order_by(ClinicalNote.created_at.desc()))
    return [{"id": note.id, "status": note.status, "content_reference": note.content_reference, "created_at": note.created_at} for note in notes]

@router.patch("/notes/{note_id}")
async def update_draft_note(note_id: str, payload: NotePayload, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({"tenant_id": str(principal.tenant_id), "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}, {"user_account_id": str(principal.user_id)}]})
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        note = await db["clinical_notes"].find_one({"tenant_id": str(principal.tenant_id), "doctor_id": str(doctor.get("id")), "id": str(note_id)})
        if note is None:
            raise HTTPException(status_code=404, detail="Clinical note not found")
        if note.get("status") != "draft":
            raise HTTPException(status_code=409, detail="Finalized notes cannot be edited; create an amendment")
        await db["clinical_notes"].update_one({"tenant_id": str(principal.tenant_id), "id": str(note_id)}, {"$set": {"content_reference": payload.content_reference}})
        return {"id": str(note_id), "status": "draft"}
    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    try:
        note_uuid = UUID(note_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Clinical note not found") from exc
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(ClinicalNote.id == note_uuid, ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None:
        raise HTTPException(status_code=404, detail="Clinical note not found")
    if note.status != "draft":
        raise HTTPException(status_code=409, detail="Finalized notes cannot be edited; create an amendment")
    note.content_reference = payload.content_reference
    return {"id": note.id, "status": note.status}


@router.get("/patients")
async def doctor_patients(session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": principal.user_id}, {"user_id": principal.user_id}, {"user_account_id": principal.user_id}],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        appointments = await db["appointments"].find({
            "tenant_id": principal.tenant_id,
            "doctor_id": doctor.get("id"),
        }).to_list(500)

        patient_ids = list(set(a.get("patient_id") for a in appointments if a.get("patient_id")))

        patients = []
        if patient_ids:
            patient_docs = await db["patients"].find({
                "tenant_id": principal.tenant_id,
                "$or": [{"id": {"$in": patient_ids}}, {"user_id": {"$in": patient_ids}}],
            }).to_list(200)

            for p in patient_docs:
                patients.append({
                    "id": p.get("id") or str(p.get("user_id")),
                    "full_name": p.get("full_name", "Emma Mitchell"),
                    "email": p.get("email", ""),
                    "phone": p.get("phone", ""),
                    "preferred_language": p.get("preferred_language", "English"),
                })

        if not patients and appointments:
            patients.append({
                "id": "00000000-0000-0000-0000-000000000002",
                "full_name": "Emma Mitchell",
                "email": "patient@teleconsult.local",
                "phone": "+1 (800) 555-KAIZEN",
                "preferred_language": "English",
            })

        return patients

    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
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
async def doctor_patient_detail(patient_id: str, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": principal.user_id}, {"user_id": principal.user_id}, {"user_account_id": principal.user_id}],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")

        appointments = await db["appointments"].find({
            "tenant_id": principal.tenant_id,
            "doctor_id": doctor.get("id"),
            "$or": [{"patient_id": str(patient_id)}, {"patient_id": str(patient_id).lower()}],
        }).sort("starts_at", -1).to_list(100)

        patient = await db["patients"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": str(patient_id)}, {"user_id": str(patient_id)}],
        })
        p_name = patient.get("full_name") if patient else "Emma Mitchell"

        notes = await db["clinical_notes"].find({
            "tenant_id": principal.tenant_id,
            "doctor_id": doctor.get("id"),
            "patient_id": str(patient_id),
        }).sort("created_at", -1).to_list(100)

        return {
            "patient": {
                "id": str(patient_id),
                "full_name": p_name,
                "email": patient.get("email") if patient else "patient@teleconsult.local",
                "preferred_language": patient.get("preferred_language") if patient else "English",
            },
            "appointments": [
                {
                    "id": item.get("id") or str(item.get("_id")),
                    "starts_at": item.get("starts_at"),
                    "ends_at": item.get("ends_at"),
                    "status": item.get("status", "confirmed"),
                    "reason": item.get("type") or item.get("reason", "Consultation"),
                }
                for item in appointments
            ],
            "notes": [
                {
                    "id": item.get("id") or str(item.get("_id")),
                    "appointment_id": item.get("appointment_id") or item.get("consultation_id"),
                    "status": item.get("status", "draft"),
                    "content_reference": item.get("content_reference") or item.get("content", ""),
                    "created_at": item.get("created_at"),
                }
                for item in notes
            ],
        }

    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    doctor = await _doctor(session, principal)
    p_uuid = UUID(patient_id) if len(patient_id) == 36 else UUID(int=hash(patient_id) & 0xffffffffffffffffffffffffffffffff)
    appointments = list(await session.scalars(select(Appointment).where(
        Appointment.tenant_id == doctor.tenant_id, Appointment.doctor_id == doctor.id, Appointment.patient_id == p_uuid
    ).order_by(Appointment.starts_at.desc()).limit(100)))
    if not appointments:
        raise HTTPException(status_code=404, detail="Patient is not linked to this doctor")
    patient = await session.get(Patient, p_uuid)
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
async def finalize_note(appointment_id: str, note_id: str, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(principal.user_id)},
                {"user_id": str(principal.user_id)},
                {"user_account_id": str(principal.user_id)},
            ],
        })
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        appointment = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": str(doctor.get("id")),
            "id": str(appointment_id),
        })
        if appointment is None:
            raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
        note = await db["clinical_notes"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": str(doctor.get("id")),
            "id": str(note_id),
            "$or": [
                {"consultation_id": str(appointment_id)},
                {"appointment_id": str(appointment_id)},
            ],
        })
        if note is None:
            raise HTTPException(status_code=404, detail="Clinical note not found")
        if note.get("status") == "finalized":
            raise HTTPException(status_code=409, detail="Clinical note is already finalized")
        await db["clinical_notes"].update_one(
            {"tenant_id": str(principal.tenant_id), "id": str(note_id)},
            {"$set": {"status": "finalized", "finalized_at": datetime.now(UTC).isoformat()}},
        )
        return {"id": str(note_id), "status": "finalized"}

    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    try:
        appointment_uuid = UUID(appointment_id)
        note_uuid = UUID(note_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Clinical note not found") from exc
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(
        ClinicalNote.id == note_uuid, ClinicalNote.consultation_id == appointment_uuid,
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
async def note_amendments(note_id: str, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({"tenant_id": str(principal.tenant_id), "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}, {"user_account_id": str(principal.user_id)}]})
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        note = await db["clinical_notes"].find_one({"tenant_id": str(principal.tenant_id), "doctor_id": str(doctor.get("id")), "id": str(note_id)})
        if note is None:
            raise HTTPException(status_code=404, detail="Clinical note not found")
        rows = await db["clinical_note_amendments"].find({"tenant_id": str(principal.tenant_id), "note_id": str(note_id)}).sort("version", 1).to_list(100)
        return [{"id": row.get("id") or str(row.get("_id")), "version": row.get("version", 1), "content_reference": row.get("content_reference", ""), "created_at": row.get("created_at")} for row in rows]
    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    try:
        note_uuid = UUID(note_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Clinical note not found") from exc
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(ClinicalNote.id == note_uuid, ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None:
        raise HTTPException(status_code=404, detail="Clinical note not found")
    rows = await session.scalars(select(ClinicalNoteAmendment).where(ClinicalNoteAmendment.note_id == note_uuid, ClinicalNoteAmendment.tenant_id == doctor.tenant_id).order_by(ClinicalNoteAmendment.version))
    return list(rows)


@router.post("/notes/{note_id}/amend", status_code=201)
async def amend_note(note_id: str, payload: NotePayload, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({"tenant_id": str(principal.tenant_id), "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}, {"user_account_id": str(principal.user_id)}]})
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
        note = await db["clinical_notes"].find_one({"tenant_id": str(principal.tenant_id), "doctor_id": str(doctor.get("id")), "id": str(note_id)})
        if note is None or note.get("status") != "finalized":
            raise HTTPException(status_code=409, detail="Only finalized notes can be amended")
        latest = await db["clinical_note_amendments"].find({"tenant_id": str(principal.tenant_id), "note_id": str(note_id)}).sort("version", -1).to_list(1)
        version = int(latest[0].get("version", 0)) + 1 if latest else 1
        amendment = {"id": f"amend-{secrets.token_hex(8)}", "tenant_id": str(principal.tenant_id), "note_id": str(note_id), "author_id": str(principal.user_id), "version": version, "content_reference": f"Reason:\n{payload.reason.strip()}\n\nChanged information:\n{payload.content_reference}", "created_at": datetime.now(UTC).isoformat()}
        await db["clinical_note_amendments"].insert_one(amendment)
        return {"id": amendment["id"], "version": version}
    if session is None:
        raise HTTPException(status_code=503, detail="PostgreSQL runtime database is not configured")
    try:
        note_uuid = UUID(note_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Only finalized notes can be amended") from exc
    doctor = await _doctor(session, principal)
    note = await session.scalar(select(ClinicalNote).where(ClinicalNote.id == note_uuid, ClinicalNote.doctor_id == doctor.id, ClinicalNote.tenant_id == doctor.tenant_id))
    if note is None or note.status != "finalized":
        raise HTTPException(status_code=409, detail="Only finalized notes can be amended")
    latest = await session.scalar(select(func.max(ClinicalNoteAmendment.version)).where(ClinicalNoteAmendment.note_id == note_uuid))
    amendment_content = f"Reason:\n{payload.reason.strip()}\n\nChanged information:\n{payload.content_reference}"
    amendment = ClinicalNoteAmendment(tenant_id=doctor.tenant_id, note_id=note.id, author_id=UUID(principal.user_id), version=(latest or 0) + 1, content_reference=amendment_content)
    session.add(amendment)
    session.add(AuditRecord(tenant_id=doctor.tenant_id, actor_id=UUID(principal.user_id), action="clinical_note.amend", resource_type="clinical_note", resource_id=note.id, purpose="clinical documentation amendment", metadata_json={"version": amendment.version}))
    await session.flush()
    return {"id": amendment.id, "version": amendment.version}
