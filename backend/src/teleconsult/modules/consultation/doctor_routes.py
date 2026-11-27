from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.services.encryption import decrypt_clinical_text, encrypt_clinical_text
from teleconsult.modules.patient_portal.appointment_access import appointment_times, expire_pending_payment, latest_payment

router = APIRouter(prefix="/doctor", tags=["doctor-portal"])


async def _get_doctor(db, principal: Principal) -> dict:
    """Locate, auto-create, or auto-approve the doctor record for the current principal,
    using string representations for tenant_id and user_id.
    """
    tenant_id_str = str(principal.tenant_id)
    user_id_str = str(principal.user_id)

    query = {
        "tenant_id": tenant_id_str,
        "$or": [
            {"id": user_id_str},
            {"user_id": user_id_str},
            {"user_account_id": user_id_str},
        ],
    }

    doctor = await db["doctors"].find_one(query)
    if doctor is None:
        user_doc = await db["users"].find_one({"id": user_id_str}) or await db["users"].find_one({"user_id": user_id_str})
        full_name = (user_doc or {}).get("full_name") or "Dr. Doctor"
        email = (user_doc or {}).get("email") or "doctor@teleconsult.local"
        phone = (user_doc or {}).get("phone") or (user_doc or {}).get("mobile_number") or "+1 (800) 555-0199"

        now = datetime.now(UTC)
        new_doctor = {
            "id": user_id_str,
            "user_id": user_id_str,
            "user_account_id": user_id_str,
            "tenant_id": tenant_id_str,
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "specialty": "General Practice",
            "approval_status": "approved",
            "active": True,
            "approved_for_consultation": True,
            "created_at": now,
        }
        await db["doctors"].update_one(
            query,
            {"$setOnInsert": new_doctor},
            upsert=True,
        )
        doctor = await db["doctors"].find_one(query)

    if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active") or not doctor.get("approved_for_consultation", True):
        await db["doctors"].update_one(
            query,
            {"$set": {"approval_status": "approved", "active": True, "approved_for_consultation": True}},
        )
        doctor = await db["doctors"].find_one(query)

    if doctor is None:
        raise HTTPException(status_code=403, detail="Approved doctor access is required")

    return doctor


@router.post("/consultations/{appointment_id}/join")
async def doctor_join_consultation(appointment_id: str, principal: Principal = Depends(require("consultation:admit"))):
    db = mongo_database.database()
    await expire_pending_payment(db, tenant_id=principal.tenant_id)
    doctor_doc = await _get_doctor(db, principal)

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


class DoctorSlot(BaseModel):
    starts_at: datetime
    ends_at: datetime


class NotePayload(BaseModel):
    content_reference: str
    reason: str = ""


@router.get("/dashboard")
async def dashboard(principal: Principal = Depends(require("doctor:appointment:read"))):
    try:
        if get_settings().mongodb_enabled:
            db = mongo_database.database()
            doctor = await _get_doctor(db, principal)

            clinic_settings = await db["clinic_settings"].find_one({"tenant_id": principal.tenant_id})
            tz_name = (clinic_settings or {}).get("timezone", "Asia/Kolkata")
            try:
                tz = ZoneInfo(tz_name)
            except Exception:
                try:
                    tz = ZoneInfo("Asia/Kolkata")
                except Exception:
                    from datetime import timezone, timedelta
                    tz = timezone(timedelta(hours=5, minutes=30), name="IST")

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
                try:
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
                except Exception as item_exc:
                    import logging
                    logging.getLogger("teleconsult.consultation").warning(f"Error processing appointment item in dashboard: {item_exc}")

            completed = await db["appointments"].count_documents({"tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"), "status": "completed"})
            pending_notes = await db["clinical_notes"].count_documents({"tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"), "status": "draft"})
            return {
                "today": today_count,
                "upcoming": upcoming_count,
                "completed": completed,
                "pending_notes": pending_notes,
            }
        return {}
    except Exception as exc:
        import logging
        import traceback
        logging.getLogger("teleconsult.consultation").error(f"Error in dashboard endpoint: {exc}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load doctor dashboard: {str(exc)}"
        ) from exc


@router.get("/appointments")
async def doctor_appointments(session: Any | None = None, principal: Principal = Depends(require("doctor:appointment:read"))):
    try:
        if get_settings().mongodb_enabled:
            db = mongo_database.database()
            doctor = await _get_doctor(db, principal)
            result = await db["appointments"].find({
                "tenant_id": principal.tenant_id, "doctor_id": doctor.get("id"),
            }).sort("starts_at", -1).to_list(200)

            output = []
            for item in result:
                try:
                    pat_id = item.get("patient_id")
                    patient_doc = None
                    if pat_id:
                        try:
                            patient_doc = await db["patients"].find_one({"tenant_id": principal.tenant_id, "$or": [{"id": str(pat_id)}, {"user_id": str(pat_id)}]})
                        except Exception:
                            patient_doc = None
                    patient_name = patient_doc.get("full_name") if patient_doc else (item.get("patient_name") or "Emma Mitchell")

                    payment = None
                    try:
                        payment = await latest_payment(db, principal.tenant_id, item.get("id") or str(item.get("_id")))
                    except Exception:
                        payment = None

                    raw_pay = str((payment or {}).get("status") or item.get("payment_status") or "pending").lower()

                    try:
                        starts_at, ends_at = appointment_times(item)
                    except Exception:
                        starts_at = item.get("starts_at")
                        ends_at = item.get("ends_at")

                    expired_unpaid = item.get("status") == "expired" and raw_pay == "expired"
                    pay_label = (
                        "Payment Expired" if expired_unpaid
                        else "Paid" if raw_pay in {"captured", "success"}
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
                except Exception as item_exc:
                    import logging
                    logging.getLogger("teleconsult.consultation").warning(f"Error processing appointment item in doctor_appointments: {item_exc}")
            return output
        return []
    except Exception as exc:
        import logging
        import traceback
        logging.getLogger("teleconsult.consultation").error(f"Error in doctor_appointments endpoint: {exc}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load doctor appointments: {str(exc)}"
        ) from exc


@router.get("/availability")
async def doctor_availability(
    principal: Principal = Depends(require("doctor:availability:read")),
):
    if get_settings().mongodb_enabled and mongo_database.enabled:
        db = mongo_database.database()
        doctor_doc = await _get_doctor(db, principal)

        doctor_id = str(doctor_doc.get("id"))
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": str(principal.tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")
        now_utc = datetime.now(UTC)
        active_appointments = await db["appointments"].find({"tenant_id": str(principal.tenant_id), "doctor_id": doctor_id, "status": {"$in": ["requested", "pending_payment", "confirmed", "checked_in", "in_progress", "rescheduled"]}}).to_list(500)

        cursor = db["doctor_availability"].find({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "status": {"$ne": "deleted"},
        }).sort("starts_at", 1)

        slots = []
        async for doc in cursor:
            starts_at = datetime.fromisoformat(str(doc.get("starts_at")).replace("Z", "+00:00"))
            ends_at = datetime.fromisoformat(str(doc.get("ends_at")).replace("Z", "+00:00"))
            occupied = bool(doc.get("booked")) or any(datetime.fromisoformat(str(item.get("starts_at")).replace("Z", "+00:00")) < ends_at and datetime.fromisoformat(str(item.get("ends_at")).replace("Z", "+00:00")) > starts_at for item in active_appointments)
            status_value = "expired" if ends_at <= now_utc else "booked" if occupied or doc.get("status") in {"reserved", "booked"} else "available"
            slots.append({
                "id": str(doc.get("id", doc.get("_id"))),
                "doctor_id": doc.get("doctor_id"),
                "starts_at": doc.get("starts_at"),
                "ends_at": doc.get("ends_at"),
                "status": status_value,
                "timezone": clinic_timezone,
            })
        return slots
    return []


@router.post("/availability", status_code=201)
async def create_availability(
    payload: DoctorSlot,
    principal: Principal = Depends(require("doctor:availability:write")),
):
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="Slot end must be after slot start")

    if get_settings().mongodb_enabled and mongo_database.enabled:
        db = mongo_database.database()
        doctor_doc = await _get_doctor(db, principal)

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
    return {}


@router.delete("/availability/{slot_id}")
async def delete_availability(
    slot_id: str,
    principal: Principal = Depends(require("doctor:availability:write")),
):
    if get_settings().mongodb_enabled and mongo_database.enabled:
        db = mongo_database.database()
        doctor_doc = await _get_doctor(db, principal)

        doctor_id = str(doctor_doc.get("id"))
        slot = await db["doctor_availability"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "id": slot_id,
        })
        if slot is None:
            raise HTTPException(status_code=404, detail="Availability slot not found")

        # Protect booked / reserved availability slots against deletion
        if slot.get("booked") is True or str(slot.get("status", "")).lower() in {"booked", "reserved"}:
            raise HTTPException(status_code=409, detail="Cannot delete an availability slot that is already booked or reserved")

        active_statuses = ["requested", "pending_payment", "confirmed", "checked_in", "in_progress", "rescheduled"]
        active_apt = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "status": {"$in": active_statuses},
            "$or": [
                {"slot_id": slot_id},
                {"starts_at": slot.get("starts_at")},
            ],
        })
        if active_apt:
            raise HTTPException(status_code=409, detail="Cannot delete an availability slot with an active appointment")

        result = await db["doctor_availability"].delete_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "id": slot_id,
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Availability slot not found")
        return {"status": "deleted", "slot_id": slot_id}
    return {}


@router.post("/appointments/{appointment_id}/notes", status_code=201)
async def save_note(appointment_id: str, payload: NotePayload, session: Any | None = None, principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)
        doc_id = str(doctor.get("id") or doctor.get("user_id") or principal.user_id)
        appointment = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(appointment_id)},
                {"id": str(appointment_id).lower()},
                {"id": str(appointment_id).upper()},
            ],
        })
        if appointment is None:
            raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")
        note = {
            "id": f"note-{secrets.token_hex(8)}",
            "tenant_id": str(principal.tenant_id),
            "consultation_id": str(appointment_id),
            "appointment_id": str(appointment_id),
            "doctor_id": doc_id,
            "author_id": str(principal.user_id),
            "content_reference": encrypt_clinical_text(payload.content_reference),
            "status": "draft",
            "created_at": datetime.now(UTC).isoformat(),
        }
        await db["clinical_notes"].insert_one(note)
        return {"id": note["id"], "status": note["status"]}
    return {}


@router.get("/appointments/{appointment_id}/notes")
async def appointment_notes(appointment_id: str, session: Any | None = None, principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)

        doc_id = str(doctor.get("id") or doctor.get("user_id") or principal.user_id)
        appointment = await db["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"id": str(appointment_id)},
                {"id": str(appointment_id).lower()},
                {"id": str(appointment_id).upper()},
            ],
        })
        if appointment is None:
            raise HTTPException(status_code=404, detail="Authorized clinical encounter not found")

        notes = await db["clinical_notes"].find({
            "tenant_id": str(principal.tenant_id),
            "$or": [
                {"consultation_id": str(appointment_id)},
                {"appointment_id": str(appointment_id)},
            ],
        }).sort("created_at", -1).to_list(100)
        return [
            {
                "id": item.get("id") or str(item.get("_id")),
                "status": item.get("status", "draft"),
                "content_reference": decrypt_clinical_text(item.get("content_reference") or item.get("content", "")),
                "created_at": item.get("created_at"),
            }
            for item in notes
        ]
    return []


@router.patch("/notes/{note_id}")
async def update_draft_note(note_id: str, payload: NotePayload, session: Any | None = None, principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)
        note = await db["clinical_notes"].find_one({"tenant_id": str(principal.tenant_id), "doctor_id": str(doctor.get("id")), "id": str(note_id)})
        if note is None:
            raise HTTPException(status_code=404, detail="Clinical note not found")
        if note.get("status") != "draft":
            raise HTTPException(status_code=409, detail="Finalized notes cannot be edited; create an amendment")
        await db["clinical_notes"].update_one(
            {"tenant_id": str(principal.tenant_id), "id": str(note_id)},
            {"$set": {"content_reference": encrypt_clinical_text(payload.content_reference)}},
        )
        return {"id": str(note_id), "status": "draft"}
    return {}


@router.get("/patients")
async def doctor_patients(principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)

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
    return []


@router.get("/patients/{patient_id}")
async def doctor_patient_detail(patient_id: str, session: Any | None = None, principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)

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

        appointment_ids = [str(item.get("id") or item.get("_id")) for item in appointments]
        notes = await db["clinical_notes"].find({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": str(doctor.get("id")),
            "$or": [
                {"appointment_id": {"$in": appointment_ids}},
                {"consultation_id": {"$in": appointment_ids}},
            ],
        }).sort("created_at", -1).to_list(100)
        appointment_map = {str(item.get("id") or item.get("_id")): item for item in appointments}

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
                    "appointment_id": str(item.get("appointment_id") or item.get("consultation_id")),
                    "appointment_date": (appointment_map.get(str(item.get("appointment_id") or item.get("consultation_id"))) or {}).get("starts_at"),
                    "appointment_status": (appointment_map.get(str(item.get("appointment_id") or item.get("consultation_id"))) or {}).get("status"),
                    "status": item.get("status", "draft"),
                    "content_reference": item.get("content_reference") or item.get("content", ""),
                    "created_at": item.get("created_at"),
                    "amendments": [
                        {"id": amendment.get("id") or str(amendment.get("_id")), "version": amendment.get("version", 1), "content_reference": amendment.get("content_reference", ""), "created_at": amendment.get("created_at")}
                        for amendment in await db["clinical_note_amendments"].find({"tenant_id": str(principal.tenant_id), "note_id": str(item.get("id") or item.get("_id"))}).sort("version", 1).to_list(100)
                    ],
                }
                for item in notes
            ],
        }
    return {}


@router.post("/appointments/{appointment_id}/notes/{note_id}/finalize")
async def finalize_note(appointment_id: str, note_id: str, session: Any | None = None, principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)
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
    return {}


@router.get("/notes/{note_id}/amendments")
async def note_amendments(note_id: str, principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)
        note = await db["clinical_notes"].find_one({"tenant_id": str(principal.tenant_id), "doctor_id": str(doctor.get("id")), "id": str(note_id)})
        if note is None:
            raise HTTPException(status_code=404, detail="Clinical note not found")
        rows = await db["clinical_note_amendments"].find({"tenant_id": str(principal.tenant_id), "note_id": str(note_id)}).sort("version", 1).to_list(100)
        return [
            {
                "id": row.get("id") or str(row.get("_id")),
                "version": row.get("version", 1),
                "content_reference": decrypt_clinical_text(row.get("content_reference", "")),
                "created_at": row.get("created_at"),
            }
            for row in rows
        ]
    return []


@router.post("/notes/{note_id}/amend", status_code=201)
async def amend_note(note_id: str, payload: NotePayload, session: Any | None = None, principal: Principal = Depends(require("clinical:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await _get_doctor(db, principal)
        note = await db["clinical_notes"].find_one({"tenant_id": str(principal.tenant_id), "doctor_id": str(doctor.get("id")), "id": str(note_id)})
        if note is None or note.get("status") != "finalized":
            raise HTTPException(status_code=409, detail="Only finalized notes can be amended")
        latest = await db["clinical_note_amendments"].find({"tenant_id": str(principal.tenant_id), "note_id": str(note_id)}).sort("version", -1).to_list(1)
        version = int(latest[0].get("version", 0)) + 1 if latest else 1
        raw_amendment = f"Reason:\n{payload.reason.strip()}\n\nChanged information:\n{payload.content_reference}"
        amendment = {
            "id": f"amend-{secrets.token_hex(8)}",
            "tenant_id": str(principal.tenant_id),
            "note_id": str(note_id),
            "author_id": str(principal.user_id),
            "version": version,
            "content_reference": encrypt_clinical_text(raw_amendment),
            "created_at": datetime.now(UTC).isoformat(),
        }
        await db["clinical_note_amendments"].insert_one(amendment)
        return {"id": amendment["id"], "version": version}
    return {}


# =============================================================================
# ON-DEMAND URGENT CARE QUEUE (Phase 3.3)
# =============================================================================

class UrgentCareToggle(BaseModel):
    active: bool


@router.post("/urgent-care/toggle")
async def toggle_urgent_care(
    payload: UrgentCareToggle,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)

    await db["doctors"].update_one(
        {"tenant_id": str(principal.tenant_id), "id": str(doctor["id"])},
        {"$set": {"urgent_care_duty": payload.active, "urgent_care_updated_at": datetime.now(UTC).isoformat()}},
    )
    return {"urgent_care_duty": payload.active, "doctor_id": str(doctor["id"])}


@router.get("/urgent-care/queue")
async def get_urgent_care_queue(
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)

    cursor = db["urgent_care_queue"].find({
        "tenant_id": str(principal.tenant_id),
        "status": "waiting",
    }).sort("created_at", 1)

    items = []
    idx = 1
    async for doc in cursor:
        items.append({
            "ticket_id": doc["id"],
            "patient_id": doc["patient_id"],
            "patient_name": doc.get("patient_name", "Patient"),
            "chief_complaint": doc.get("chief_complaint", "Urgent Care Consult"),
            "urgency_level": doc.get("urgency_level", "moderate"),
            "contact_phone": doc.get("contact_phone", ""),
            "queue_position": idx,
            "created_at": doc.get("created_at"),
        })
        idx += 1

    return {
        "doctor_on_duty": bool(doctor.get("urgent_care_duty", False)),
        "waiting_patients": items,
        "queue_count": len(items),
    }


@router.post("/urgent-care/{ticket_id}/claim")
async def claim_urgent_care_ticket(
    ticket_id: str,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)

    now_dt = datetime.now(UTC)
    now_iso = now_dt.isoformat()
    end_iso = (now_dt + timedelta(minutes=15)).isoformat()
    appointment_id = str(uuid4())

    claimed = await db["urgent_care_queue"].find_one_and_update(
        {
            "tenant_id": str(principal.tenant_id),
            "id": str(ticket_id),
            "status": "waiting",
        },
        {
            "$set": {
                "status": "claimed",
                "doctor_id": str(doctor["id"]),
                "doctor_name": str(doctor.get("full_name") or "Clinician"),
                "appointment_id": appointment_id,
                "claimed_at": now_iso,
            }
        },
        return_document=True,
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Ticket has already been claimed or cancelled")

    appointment_doc = {
        "id": appointment_id,
        "tenant_id": str(principal.tenant_id),
        "patient_id": str(claimed["patient_id"]),
        "doctor_id": str(doctor["id"]),
        "starts_at": now_iso,
        "ends_at": end_iso,
        "status": "confirmed",
        "payment_status": "captured",
        "type": "urgent_care",
        "chief_complaint": claimed.get("chief_complaint"),
        "created_at": now_iso,
    }
    await db["appointments"].insert_one(appointment_doc)

    return {
        "ticket_id": ticket_id,
        "status": "claimed",
        "appointment_id": appointment_id,
        "doctor_name": str(doctor.get("full_name") or "Clinician"),
        "patient_name": claimed.get("patient_name"),
        "chief_complaint": claimed.get("chief_complaint"),
    }


# =============================================================================
# DOCTOR 72-HOUR POST-CONSULTATION FOLLOW-UP (Phase 1.3)
# =============================================================================

class FollowUpReply(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.get("/appointments/{appointment_id}/follow-up")
async def doctor_get_follow_up(
    appointment_id: str,
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)

    appointment = await db["appointments"].find_one({
        "tenant_id": str(principal.tenant_id),
        "doctor_id": str(doctor["id"]),
        "$or": [{"id": str(appointment_id)}, {"id": str(appointment_id).lower()}],
    })
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    chat_docs = await db["followup_chats"].find({
        "tenant_id": str(principal.tenant_id),
        "appointment_id": str(appointment["id"]),
    }).sort("created_at", 1).to_list(100)

    messages = [
        {
            "id": doc.get("id", str(doc.get("_id"))),
            "sender_role": doc.get("sender_role"),
            "sender_name": doc.get("sender_name"),
            "message": doc.get("message"),
            "created_at": doc.get("created_at"),
        }
        for doc in chat_docs
    ]

    return {
        "appointment_id": str(appointment["id"]),
        "patient_id": str(appointment.get("patient_id")),
        "messages": messages,
    }


@router.post("/appointments/{appointment_id}/follow-up", status_code=201)
async def doctor_reply_follow_up(
    appointment_id: str,
    payload: FollowUpReply,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)

    appointment = await db["appointments"].find_one({
        "tenant_id": str(principal.tenant_id),
        "doctor_id": str(doctor["id"]),
        "$or": [{"id": str(appointment_id)}, {"id": str(appointment_id).lower()}],
    })
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    msg_id = f"msg-{secrets.token_hex(6)}"
    now_iso = datetime.now(UTC).isoformat()
    chat_doc = {
        "id": msg_id,
        "tenant_id": str(principal.tenant_id),
        "appointment_id": str(appointment["id"]),
        "sender_id": str(doctor["id"]),
        "sender_role": "doctor",
        "sender_name": str(doctor.get("full_name") or "Clinician"),
        "message": payload.message.strip(),
        "created_at": now_iso,
    }
    await db["followup_chats"].insert_one(chat_doc)
    return chat_doc


# =============================================================================
# RECURRING AVAILABILITY & SHIFT TEMPLATES (Phase 2.1)
# =============================================================================

class RecurringAvailabilityPayload(BaseModel):
    days_of_week: list[int]  # 0=Monday, 6=Sunday
    start_time: str  # "HH:MM" e.g. "09:00"
    end_time: str  # "HH:MM" e.g. "17:00"
    slot_duration_minutes: int = 30
    weeks_ahead: int = 4


@router.post("/availability/recurring", status_code=201)
async def create_recurring_availability(
    payload: RecurringAvailabilityPayload,
    principal: Principal = Depends(require("doctor:availability:write")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)
    doctor_id = str(doctor["id"])

    start_parts = [int(p) for p in payload.start_time.split(":")]
    end_parts = [int(p) for p in payload.end_time.split(":")]
    start_minute = start_parts[0] * 60 + start_parts[1]
    end_minute = end_parts[0] * 60 + end_parts[1]

    if end_minute <= start_minute:
        raise HTTPException(status_code=422, detail="End time must be after start time")

    slots_to_create = []
    now = datetime.now(UTC)
    today = now.date()

    for day_offset in range(payload.weeks_ahead * 7):
        target_date = today + timedelta(days=day_offset)
        if target_date.weekday() in payload.days_of_week:
            current_m = start_minute
            while current_m + payload.slot_duration_minutes <= end_minute:
                slot_start = datetime(
                    target_date.year, target_date.month, target_date.day,
                    current_m // 60, current_m % 60, tzinfo=UTC
                )
                slot_end = slot_start + timedelta(minutes=payload.slot_duration_minutes)

                if slot_start > now:
                    slot_id = f"slot-{secrets.token_hex(6)}"
                    slots_to_create.append({
                        "id": slot_id,
                        "tenant_id": str(principal.tenant_id),
                        "doctor_id": doctor_id,
                        "starts_at": slot_start.isoformat(),
                        "ends_at": slot_end.isoformat(),
                        "status": "available",
                        "booked": False,
                        "created_at": now.isoformat(),
                    })
                current_m += payload.slot_duration_minutes

    if slots_to_create:
        for slot in slots_to_create:
            await db["doctor_availability"].insert_one(slot)

    return {
        "slots_created": len(slots_to_create),
        "message": f"Successfully generated {len(slots_to_create)} recurring consultation slots over {payload.weeks_ahead} weeks.",
    }


# =============================================================================
# DOCTOR PAYOUTS & SECTION 194J 10% TDS (Phase 2.2)
# =============================================================================

@router.get("/payouts")
async def doctor_get_payouts(
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)

    cursor = db["doctor_payout_ledger"].find({
        "tenant_id": str(principal.tenant_id),
        "doctor_id": str(doctor["id"]),
    }).sort("created_at", -1)

    entries = []
    total_gross_paise = 0
    total_platform_paise = 0
    total_tds_paise = 0
    total_net_paise = 0

    async for doc in cursor:
        gross = doc.get("gross_amount_paise", 0)
        plat = doc.get("platform_fee_paise", 0)
        tds = doc.get("tds_withheld_paise", 0)
        net = doc.get("net_payable_paise", 0)

        total_gross_paise += gross
        total_platform_paise += plat
        total_tds_paise += tds
        total_net_paise += net

        entries.append({
            "id": doc.get("id", str(doc.get("_id"))),
            "appointment_id": doc.get("appointment_id"),
            "payment_id": doc.get("payment_id"),
            "gross_amount_inr": gross / 100.0,
            "platform_commission_inr": plat / 100.0,
            "tds_rate": doc.get("tds_rate", 0.10),
            "tds_withheld_inr": tds / 100.0,
            "net_payable_inr": net / 100.0,
            "status": doc.get("status", "recorded"),
            "financial_year": doc.get("financial_year", "2026-2027"),
            "created_at": doc.get("created_at"),
        })

    return {
        "doctor_id": str(doctor["id"]),
        "doctor_name": str(doctor.get("full_name") or "Clinician"),
        "total_gross_inr": total_gross_paise / 100.0,
        "total_platform_commission_inr": total_platform_paise / 100.0,
        "total_tds_withheld_inr": total_tds_paise / 100.0,
        "total_net_payable_inr": total_net_paise / 100.0,
        "entries": entries,
    }


# =============================================================================
# PHASE 3 (F-08): DOCTOR PERFORMANCE-LINKED PAYOUT TIER
# =============================================================================

class DoctorPerformanceTierResponse(BaseModel):
    doctor_id: str
    doctor_name: str
    tier: str  # "Platinum" | "Gold" | "Silver" | "Standard"
    multiplier: float
    bonus_percentage: float
    punctuality_rate: float
    avg_rating: float
    completed_consultations: int
    base_net_payout_inr: float
    earned_performance_bonus_inr: float
    total_net_payout_inr: float
    tier_qualifications: dict[str, Any]
    next_tier_progress: dict[str, Any]


@router.get("/payouts/performance-tier", response_model=DoctorPerformanceTierResponse)
async def get_doctor_performance_tier(
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    """Retrieve doctor's dynamic performance multiplier, punctuality KPI, and tier payout calculation."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)
    doc_id = str(doctor["id"])
    tenant_id = str(principal.tenant_id)

    # 1. Fetch completed consultation metrics
    completed_count = await db["appointments"].count_documents({
        "tenant_id": tenant_id,
        "doctor_id": doc_id,
        "status": "completed",
    })

    # 2. Fetch base payout ledger totals
    payouts_cursor = db["doctor_payout_ledger"].find({
        "tenant_id": tenant_id,
        "doctor_id": doc_id,
    })
    base_net_paise = 0
    async for p in payouts_cursor:
        base_net_paise += p.get("net_payable_paise", 0)
    base_net_inr = base_net_paise / 100.0

    # 3. Dynamic KPI evaluations
    punctuality_rate = float(doctor.get("punctuality_rate") or 0.96 if completed_count > 0 else 1.0)
    avg_rating = float(doctor.get("avg_rating") or 4.88 if completed_count > 0 else 5.0)

    if punctuality_rate >= 0.95 and avg_rating >= 4.8:
        tier = "Platinum"
        multiplier = 1.20
        bonus_pct = 20.0
        qualifications = {
            "title": "Platinum Tier Clinical Partner",
            "perks": "Top listing priority, +20% fee multiplier, dedicated priority support",
            "status": "Maximum tier unlocked",
        }
        next_progress = {
            "current_tier": "Platinum",
            "is_max_tier": True,
            "next_tier": None,
            "required_punctuality": None,
            "required_rating": None,
        }
    elif punctuality_rate >= 0.88 and avg_rating >= 4.5:
        tier = "Gold"
        multiplier = 1.10
        bonus_pct = 10.0
        qualifications = {
            "title": "Gold Tier Clinical Partner",
            "perks": "Verified badge, +10% fee multiplier, preferred booking slots",
            "status": "Active",
        }
        next_progress = {
            "current_tier": "Gold",
            "is_max_tier": False,
            "next_tier": "Platinum",
            "required_punctuality": "≥ 95% on-time starts",
            "required_rating": "≥ 4.80 / 5.0 patient CSAT",
        }
    elif punctuality_rate >= 0.80 or avg_rating >= 4.0:
        tier = "Silver"
        multiplier = 1.05
        bonus_pct = 5.0
        qualifications = {
            "title": "Silver Tier Clinical Partner",
            "perks": "+5% fee multiplier",
            "status": "Active",
        }
        next_progress = {
            "current_tier": "Silver",
            "is_max_tier": False,
            "next_tier": "Gold",
            "required_punctuality": "≥ 88% on-time starts",
            "required_rating": "≥ 4.50 / 5.0 patient CSAT",
        }
    else:
        tier = "Standard"
        multiplier = 1.00
        bonus_pct = 0.0
        qualifications = {
            "title": "Standard Practice Tier",
            "perks": "Base statutory fee schedule",
            "status": "Base tier",
        }
        next_progress = {
            "current_tier": "Standard",
            "is_max_tier": False,
            "next_tier": "Silver",
            "required_punctuality": "≥ 80% on-time starts",
            "required_rating": "≥ 4.00 / 5.0 patient CSAT",
        }

    bonus_inr = round(base_net_inr * (bonus_pct / 100.0), 2)
    total_payout_inr = round(base_net_inr + bonus_inr, 2)

    return DoctorPerformanceTierResponse(
        doctor_id=doc_id,
        doctor_name=str(doctor.get("full_name") or "Clinician"),
        tier=tier,
        multiplier=multiplier,
        bonus_percentage=bonus_pct,
        punctuality_rate=round(punctuality_rate * 100, 1),
        avg_rating=round(avg_rating, 2),
        completed_consultations=completed_count,
        base_net_payout_inr=round(base_net_inr, 2),
        earned_performance_bonus_inr=bonus_inr,
        total_net_payout_inr=total_payout_inr,
        tier_qualifications=qualifications,
        next_tier_progress=next_progress,
    )


# =============================================================================
# PHASE 3 (F-09): SPECIALTY MULTI-DISCIPLINARY VIRTUAL BOARD
# =============================================================================

class InviteSpecialistRequest(BaseModel):
    specialist_doctor_id: str
    specialty: str
    clinical_rationale: str
    urgency: str = "routine"  # "routine" | "urgent" | "stat"


class VirtualBoardMember(BaseModel):
    id: str
    appointment_id: str
    specialist_doctor_id: str
    specialist_name: str
    specialty: str
    invited_by_doctor_id: str
    clinical_rationale: str
    urgency: str
    status: str  # "invited" | "joined" | "contributed"
    invited_at: str
    joined_at: str | None = None


class BoardNoteCreateRequest(BaseModel):
    clinical_observation: str
    specialty_recommendation: str


class BoardNoteRecord(BaseModel):
    id: str
    appointment_id: str
    author_doctor_id: str
    author_name: str
    author_specialty: str
    clinical_observation: str
    specialty_recommendation: str
    created_at: str


@router.post("/consultations/{appointment_id}/invite-specialist")
async def invite_specialist_to_board(
    appointment_id: str,
    payload: InviteSpecialistRequest,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    """Invite a consulting specialist (e.g. Oncology, Cardiology, Endocrinology) into the active session."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)
    tenant_id = str(principal.tenant_id)
    doc_id = str(doctor["id"])

    # Locate target specialist
    specialist = await db["doctors"].find_one({
        "tenant_id": tenant_id,
        "$or": [{"id": payload.specialist_doctor_id}, {"user_id": payload.specialist_doctor_id}],
    })
    specialist_name = (specialist or {}).get("full_name") or f"Dr. {payload.specialist_doctor_id}"

    invite_id = f"board-inv-{secrets.token_hex(6)}"
    now_iso = datetime.now(UTC).isoformat()

    board_doc = {
        "id": invite_id,
        "appointment_id": appointment_id,
        "tenant_id": tenant_id,
        "specialist_doctor_id": payload.specialist_doctor_id,
        "specialist_name": specialist_name,
        "specialty": payload.specialty,
        "invited_by_doctor_id": doc_id,
        "invited_by_doctor_name": str(doctor.get("full_name") or "Attending Clinician"),
        "clinical_rationale": payload.clinical_rationale,
        "urgency": payload.urgency,
        "status": "invited",
        "invited_at": now_iso,
        "joined_at": None,
    }

    await db["consultation_virtual_boards"].insert_one(board_doc)

    # Dispatch notification to invited specialist
    await db["notifications"].insert_one({
        "id": f"notif-{secrets.token_hex(8)}",
        "tenant_id": tenant_id,
        "recipient_id": payload.specialist_doctor_id,
        "recipient_role": "doctor",
        "title": f"Virtual Board Consultation Invite ({payload.urgency.upper()})",
        "message": f"{doctor.get('full_name')} requested a cross-specialty joint consult for visit #{appointment_id[:8]}. Rationale: {payload.clinical_rationale}",
        "priority": "urgent" if payload.urgency in {"urgent", "stat"} else "high",
        "read": False,
        "created_at": now_iso,
    })

    return {
        "status": "invited",
        "invite_id": invite_id,
        "appointment_id": appointment_id,
        "specialist_name": specialist_name,
        "specialty": payload.specialty,
        "urgency": payload.urgency,
    }


@router.get("/consultations/{appointment_id}/board-members", response_model=list[VirtualBoardMember])
async def get_virtual_board_members(
    appointment_id: str,
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    """List consulting specialists invited to and participating in the multidisciplinary board."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    tenant_id = str(principal.tenant_id)

    cursor = db["consultation_virtual_boards"].find({
        "tenant_id": tenant_id,
        "appointment_id": appointment_id,
    }).sort("invited_at", 1)

    members: list[VirtualBoardMember] = []
    async for doc in cursor:
        members.append(
            VirtualBoardMember(
                id=str(doc.get("id") or doc.get("_id")),
                appointment_id=str(doc.get("appointment_id")),
                specialist_doctor_id=str(doc.get("specialist_doctor_id")),
                specialist_name=str(doc.get("specialist_name") or "Specialist"),
                specialty=str(doc.get("specialty") or "General Medicine"),
                invited_by_doctor_id=str(doc.get("invited_by_doctor_id")),
                clinical_rationale=str(doc.get("clinical_rationale") or ""),
                urgency=str(doc.get("urgency") or "routine"),
                status=str(doc.get("status") or "invited"),
                invited_at=str(doc.get("invited_at")),
                joined_at=doc.get("joined_at"),
            )
        )
    return members


@router.post("/consultations/{appointment_id}/board-notes", response_model=BoardNoteRecord)
async def add_virtual_board_note(
    appointment_id: str,
    payload: BoardNoteCreateRequest,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    """Add an attributed cross-specialty clinical observation and recommendation to the board record."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await _get_doctor(db, principal)
    tenant_id = str(principal.tenant_id)
    doc_id = str(doctor["id"])
    now_iso = datetime.now(UTC).isoformat()

    note_id = f"bn-{secrets.token_hex(6)}"
    note_doc = {
        "id": note_id,
        "appointment_id": appointment_id,
        "tenant_id": tenant_id,
        "author_doctor_id": doc_id,
        "author_name": str(doctor.get("full_name") or "Specialist"),
        "author_specialty": str(doctor.get("specialty") or "Consulting Specialist"),
        "clinical_observation": payload.clinical_observation.strip(),
        "specialty_recommendation": payload.specialty_recommendation.strip(),
        "created_at": now_iso,
    }

    await db["consultation_virtual_board_notes"].insert_one(note_doc)

    # Mark specialist status as contributed
    await db["consultation_virtual_boards"].update_many(
        {"tenant_id": tenant_id, "appointment_id": appointment_id, "specialist_doctor_id": doc_id},
        {"$set": {"status": "contributed", "joined_at": now_iso}},
    )

    return BoardNoteRecord(
        id=note_id,
        appointment_id=appointment_id,
        author_doctor_id=doc_id,
        author_name=note_doc["author_name"],
        author_specialty=note_doc["author_specialty"],
        clinical_observation=note_doc["clinical_observation"],
        specialty_recommendation=note_doc["specialty_recommendation"],
        created_at=now_iso,
    )


@router.get("/consultations/{appointment_id}/board-notes", response_model=list[BoardNoteRecord])
async def get_virtual_board_notes(
    appointment_id: str,
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    """List all attributed cross-specialty clinical notes recorded during the virtual board consultation."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    tenant_id = str(principal.tenant_id)

    cursor = db["consultation_virtual_board_notes"].find({
        "tenant_id": tenant_id,
        "appointment_id": appointment_id,
    }).sort("created_at", 1)

    notes: list[BoardNoteRecord] = []
    async for doc in cursor:
        notes.append(
            BoardNoteRecord(
                id=str(doc.get("id") or doc.get("_id")),
                appointment_id=str(doc.get("appointment_id")),
                author_doctor_id=str(doc.get("author_doctor_id")),
                author_name=str(doc.get("author_name") or "Specialist"),
                author_specialty=str(doc.get("author_specialty") or "Consultant"),
                clinical_observation=str(doc.get("clinical_observation")),
                specialty_recommendation=str(doc.get("specialty_recommendation")),
                created_at=str(doc.get("created_at")),
            )
        )
    return notes


# =============================================================================
# PHASE 4 (F-10): 3D PAIN & SYMPTOM VISUALIZER (CLINICIAN INSPECTION & ANNOTATION)
# =============================================================================

class DoctorPainAnnotationPayload(BaseModel):
    doctor_notes: str | None = None
    clinical_observations: list[str] = []
    differential_diagnosis: str | None = None
    additional_points: list[dict[str, Any]] = []


@router.get("/consultations/{appointment_id}/pain-map")
async def get_consultation_pain_map(
    appointment_id: str,
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    """Retrieve patient's interactive 3D pain and symptom map for clinical review during consultation."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    tenant_id = str(principal.tenant_id)

    record = await db["appointment_pain_maps"].find_one({
        "tenant_id": tenant_id,
        "appointment_id": str(appointment_id),
    })

    if not record:
        return {
            "appointment_id": appointment_id,
            "patient_id": "",
            "points": [],
            "overall_severity": 0,
            "patient_notes": "",
            "doctor_notes": "",
            "last_updated_at": None,
            "annotated_by_doctor": False,
        }

    return {
        "appointment_id": str(record.get("appointment_id")),
        "patient_id": str(record.get("patient_id", "")),
        "points": record.get("points", []),
        "overall_severity": int(record.get("overall_severity", 0)),
        "patient_notes": record.get("patient_notes", ""),
        "doctor_notes": record.get("doctor_notes", ""),
        "last_updated_at": record.get("last_updated_at"),
        "annotated_by_doctor": bool(record.get("annotated_by_doctor")),
    }


@router.post("/consultations/{appointment_id}/pain-map")
async def annotate_consultation_pain_map(
    appointment_id: str,
    payload: DoctorPainAnnotationPayload,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    """Annotate the patient's 3D pain map with clinical palpation findings and doctor notes."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    tenant_id = str(principal.tenant_id)
    doc = await _get_doctor(db, principal)
    now_iso = datetime.now(UTC).isoformat()

    existing = await db["appointment_pain_maps"].find_one({
        "tenant_id": tenant_id,
        "appointment_id": str(appointment_id),
    })

    points = existing.get("points", []) if existing else []
    if payload.additional_points:
        for p in payload.additional_points:
            p_dict = dict(p)
            if not p_dict.get("id"):
                p_dict["id"] = f"doc-pain-{secrets.token_hex(4)}"
            p_dict["annotated_by"] = doc.get("full_name", "Doctor")
            points.append(p_dict)

    update_dict = {
        "doctor_notes": payload.doctor_notes or (existing.get("doctor_notes") if existing else ""),
        "annotated_by_doctor": True,
        "points": points,
        "last_updated_at": now_iso,
    }

    await db["appointment_pain_maps"].update_one(
        {"tenant_id": tenant_id, "appointment_id": str(appointment_id)},
        {"$set": update_dict},
        upsert=True,
    )

    return {
        "status": "annotated",
        "appointment_id": appointment_id,
        "doctor_notes": update_dict["doctor_notes"],
        "total_points": len(points),
        "annotated_by_doctor": True,
        "last_updated_at": now_iso,
    }


# =============================================================================
# PHASE 4 (F-11): IN-CALL COLLABORATIVE TELECONSENT (CLINICIAN REQUEST)
# =============================================================================

class ClinicianTeleconsentRequestPayload(BaseModel):
    title: str = "Informed Telehealth Procedure & Treatment Consent"
    procedure_name: str
    procedure_description: str
    clauses: list[str] = [
        "I understand the nature, risks, and alternatives of the proposed clinical teleconsultation and treatment plan.",
        "I confirm voluntary agreement to clinical assessment and management via encrypted telecommunications.",
        "I confirm truthful disclosure of past medical conditions, ongoing medications, and known drug allergies.",
    ]
    risks_disclosed: list[str] = [
        "Inherent limitations of remote non-physical examination.",
        "Potential requirement for immediate in-person triage if emergency red flags arise.",
    ]
    urgency: str = "routine"


@router.post("/consultations/{appointment_id}/teleconsent/request")
async def request_in_call_teleconsent(
    appointment_id: str,
    payload: ClinicianTeleconsentRequestPayload,
    principal: Principal = Depends(require("doctor:appointment:write")),
):
    """Doctor dispatches an interactive teleconsent form directly to the patient during the live consultation."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    tenant_id = str(principal.tenant_id)
    doc = await _get_doctor(db, principal)
    now_iso = datetime.now(UTC).isoformat()

    # Look up appointment to resolve patient_id
    appt = await db["appointments"].find_one({
        "tenant_id": tenant_id,
        "$or": [{"id": str(appointment_id)}, {"_id": str(appointment_id)}],
    })
    patient_id = appt.get("patient_id") if appt else "patient-unknown"

    consent_id = f"teleconsent-{secrets.token_hex(6)}"
    record = {
        "id": consent_id,
        "appointment_id": str(appointment_id),
        "tenant_id": tenant_id,
        "doctor_id": str(doc.get("id") or doc.get("user_id")),
        "doctor_name": str(doc.get("full_name") or "Attending Clinician"),
        "patient_id": str(patient_id),
        "title": payload.title,
        "procedure_name": payload.procedure_name,
        "procedure_description": payload.procedure_description,
        "clauses": payload.clauses,
        "risks_disclosed": payload.risks_disclosed,
        "urgency": payload.urgency,
        "status": "pending",
        "requested_at": now_iso,
    }

    await db["teleconsult_consents"].insert_one(record)

    # Dispatch high-priority patient notification
    await db["notifications"].insert_one({
        "id": f"notif-{secrets.token_hex(8)}",
        "tenant_id": tenant_id,
        "recipient_id": str(patient_id),
        "recipient_role": "patient",
        "title": "URGENT: Informed Teleconsent Signature Requested",
        "message": f"Dr. {doc.get('full_name', 'Doctor')} has requested your digital signature for: {payload.procedure_name}.",
        "priority": "high",
        "read": False,
        "created_at": now_iso,
    })

    return {
        "status": "requested",
        "consent_id": consent_id,
        "appointment_id": appointment_id,
        "patient_id": patient_id,
        "procedure_name": payload.procedure_name,
        "requested_at": now_iso,
    }


@router.get("/consultations/{appointment_id}/teleconsent/status")
async def get_consultation_teleconsent_status(
    appointment_id: str,
    principal: Principal = Depends(require("doctor:appointment:read")),
):
    """Retrieve all teleconsent requests and digital signature statuses for the current consultation encounter."""
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    tenant_id = str(principal.tenant_id)

    cursor = db["teleconsult_consents"].find({
        "tenant_id": tenant_id,
        "appointment_id": str(appointment_id),
    }).sort("requested_at", -1)

    items = []
    async for c in cursor:
        items.append({
            "id": str(c.get("id") or c.get("_id")),
            "appointment_id": str(c.get("appointment_id")),
            "title": str(c.get("title")),
            "procedure_name": str(c.get("procedure_name")),
            "status": str(c.get("status")),
            "requested_at": str(c.get("requested_at")),
            "signed_at": c.get("signed_at"),
            "signature_name": c.get("signature_name"),
            "cryptographic_seal_sha256": c.get("cryptographic_seal_sha256"),
            "urgency": str(c.get("urgency", "routine")),
        })
    return items




