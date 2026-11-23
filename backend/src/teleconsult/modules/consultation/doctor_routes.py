import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.services.encryption import decrypt_clinical_text, encrypt_clinical_text
from teleconsult.modules.patient_portal.appointment_access import appointment_times, expire_pending_payment, latest_payment

router = APIRouter(prefix="/doctor", tags=["doctor-portal"])


@router.post("/consultations/{appointment_id}/join")
async def doctor_join_consultation(appointment_id: str, principal: Principal = Depends(require("consultation:admit"))):
    db = mongo_database.database()
    await expire_pending_payment(db, tenant_id=principal.tenant_id)
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


class DoctorSlot(BaseModel):
    starts_at: datetime
    ends_at: datetime


class NotePayload(BaseModel):
    content_reference: str
    reason: str = ""


@router.get("/dashboard")
async def dashboard(principal: Principal = Depends(require("doctor:appointment:read"))):
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
    return {}


@router.get("/appointments")
async def doctor_appointments(principal: Principal = Depends(require("doctor:appointment:read"))):
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
        return output
    return []


@router.get("/availability")
async def doctor_availability(
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
    return {}


@router.delete("/availability/{slot_id}")
async def delete_availability(
    slot_id: str,
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
async def save_note(appointment_id: str, payload: NotePayload, principal: Principal = Depends(require("clinical:write"))):
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
async def appointment_notes(appointment_id: str, principal: Principal = Depends(require("clinical:read"))):
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
async def update_draft_note(note_id: str, payload: NotePayload, principal: Principal = Depends(require("clinical:write"))):
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
    return []


@router.get("/patients/{patient_id}")
async def doctor_patient_detail(patient_id: str, principal: Principal = Depends(require("clinical:read"))):
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
async def finalize_note(appointment_id: str, note_id: str, principal: Principal = Depends(require("clinical:write"))):
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
    return {}


@router.get("/notes/{note_id}/amendments")
async def note_amendments(note_id: str, principal: Principal = Depends(require("clinical:read"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({"tenant_id": str(principal.tenant_id), "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}, {"user_account_id": str(principal.user_id)}]})
        if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
            raise HTTPException(status_code=403, detail="Approved doctor access is required")
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
async def amend_note(note_id: str, payload: NotePayload, principal: Principal = Depends(require("clinical:write"))):
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
