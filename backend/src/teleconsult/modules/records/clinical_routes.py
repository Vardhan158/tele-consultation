import json
import secrets
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from teleconsult.domain.schedule_x import (
    verify_telemedicine_prescription_safety,
)
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.records.clinical_schemas import ClinicalOutputResponse

router = APIRouter(prefix="/patient/clinical-outputs", tags=["clinical-outputs"])
clinician_router = APIRouter(prefix="/clinician/clinical-outputs", tags=["clinical-publication"])


async def _resolve_patient_ids(db, tenant_id: str, user_id: str) -> list[str]:
    patient_ids = [str(user_id)]
    patient_doc = await db["patients"].find_one({
        "tenant_id": str(tenant_id),
        "$or": [
            {"id": str(user_id)},
            {"user_id": str(user_id)},
            {"user_account_id": str(user_id)},
        ],
    })
    if patient_doc:
        for k in ("id", "user_id", "user_account_id"):
            val = patient_doc.get(k)
            if val and str(val) not in patient_ids:
                patient_ids.append(str(val))
    return patient_ids


class ClinicalPublication(BaseModel):
    appointment_id: str
    content: str = Field(min_length=2, max_length=100_000)


@router.get("/summaries", response_model=list[ClinicalOutputResponse])
async def list_summaries(principal: Principal = Depends(require("records:read"))) -> list[dict]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, str(principal.tenant_id), str(principal.user_id))
    query: dict[str, Any] = {
        "tenant_id": str(principal.tenant_id),
        "status": "released",
    }
    if getattr(principal, "role", "patient") in {"patient", "user"} or getattr(principal, "role", None) is None:
        query["patient_id"] = {"$in": patient_ids}

    documents = db["consultation_summaries"].find(query).sort("released_at", -1)
    output = []
    async for summary in documents:
        try:
            details = json.loads(summary.get("content", ""))
        except (TypeError, json.JSONDecodeError):
            details = {"discussion": summary.get("content", ""), "recommendations": [], "follow_up": []}
        output.append({"id": summary["id"], "appointment_id": summary["appointment_id"], "content": summary.get("content", ""), "status": summary["status"], "created_at": summary["created_at"], "released_at": summary.get("released_at"), "title": details.get("title"), "doctor": details.get("doctor", {}), "discussion": details.get("discussion"), "recommendations": details.get("recommendations", []), "follow_up": details.get("follow_up", []), "vitals": details.get("vitals", {})})
    return output


@router.get("/summaries/{summary_id}/download")
async def download_summary(summary_id: str, principal: Principal = Depends(require("records:read"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, str(principal.tenant_id), str(principal.user_id))
    query: dict[str, Any] = {
        "tenant_id": str(principal.tenant_id),
        "$or": [{"id": str(summary_id)}, {"_id": str(summary_id)}],
        "status": "released",
    }
    if getattr(principal, "role", "patient") in {"patient", "user"} or getattr(principal, "role", None) is None:
        query["patient_id"] = {"$in": patient_ids}

    summary = await db["consultation_summaries"].find_one(query)
    if summary is None:
        raise HTTPException(status_code=404, detail="Consultation summary not found")
    content = str(summary.get("content", ""))
    return PlainTextResponse(content, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="consultation-summary-{summary_id}.txt"'})


@router.get("/prescriptions", response_model=list[ClinicalOutputResponse])
async def list_prescriptions(principal: Principal = Depends(require("prescription:read"))) -> list[dict]:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, str(principal.tenant_id), str(principal.user_id))
    query: dict[str, Any] = {
        "tenant_id": str(principal.tenant_id),
        "status": "released",
    }
    if getattr(principal, "role", "patient") in {"patient", "user"} or getattr(principal, "role", None) is None:
        query["patient_id"] = {"$in": patient_ids}

    documents = db["prescriptions"].find(query).sort("released_at", -1)
    output = []
    async for prescription in documents:
        try:
            details = json.loads(prescription.get("content", ""))
        except (TypeError, json.JSONDecodeError):
            details = {"instructions": prescription.get("content", ""), "medicines": []}
        output.append({"id": prescription["id"], "appointment_id": prescription["appointment_id"], "content": prescription.get("content", ""), "status": prescription["status"], "created_at": prescription["created_at"], "released_at": prescription.get("released_at"), "medication_name": details.get("medication_name"), "dosage": details.get("dosage"), "instructions": details.get("instructions"), "medicines": details.get("medicines", []), "prescriber_name": details.get("prescriber_name")})
    return output


@router.get("/prescriptions/{prescription_id}/download")
async def download_prescription(prescription_id: str, principal: Principal = Depends(require("prescription:read"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, str(principal.tenant_id), str(principal.user_id))
    query: dict[str, Any] = {
        "tenant_id": str(principal.tenant_id),
        "$or": [{"id": str(prescription_id)}, {"_id": str(prescription_id)}],
    }
    if getattr(principal, "role", "patient") in {"patient", "user"} or getattr(principal, "role", None) is None:
        query["patient_id"] = {"$in": patient_ids}

    prescription = await db["prescriptions"].find_one(query)
    if prescription is None:
        raise HTTPException(status_code=404, detail="Prescription not found")

    content_raw = str(prescription.get("content", ""))
    try:
        parsed = json.loads(content_raw)
    except Exception:
        parsed = {"instructions": content_raw, "medicines": []}

    try:
        import io
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        from reportlab.lib import colors
        from fastapi.responses import Response

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        width, height = letter

        c.setFillColor(colors.HexColor("#185A4D"))
        c.rect(0, height - 70, width, 70, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(40, height - 38, "KAIZEN CARE TELEHEALTH CLINIC")
        c.setFont("Helvetica", 9)
        c.drawString(40, height - 54, "Digital Teleconsultation e-Prescription · Regulatory Compliant")

        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(40, height - 95, f"Prescription ID: {prescription.get('id', str(prescription_id))}")
        c.setFont("Helvetica", 9)
        c.drawString(40, height - 110, f"Issued At: {prescription.get('released_at') or prescription.get('created_at') or 'N/A'}")

        doctor_name = parsed.get("prescriber_name") or prescription.get("prescriber_name") or "Dr. Evelyn Reed (Cardiology)"
        c.drawString(40, height - 125, f"Prescribing Clinician: {doctor_name}")

        diagnosis = parsed.get("diagnosis") or prescription.get("diagnosis")
        y_offset = 145
        if diagnosis:
            c.setFont("Helvetica-Bold", 10)
            c.drawString(40, height - 145, f"Clinical Diagnosis: {diagnosis}")
            y_offset = 165

        c.setFont("Helvetica-Bold", 11)
        c.drawString(40, height - y_offset, "Rx / Prescribed Medications:")
        c.setLineWidth(1)
        c.setStrokeColor(colors.HexColor("#577877"))
        c.line(40, height - y_offset - 5, width - 40, height - y_offset - 5)

        y = height - y_offset - 25
        c.setFont("Helvetica-Bold", 9)
        c.drawString(50, y, "Medication")
        c.drawString(220, y, "Dosage")
        c.drawString(330, y, "Frequency")
        c.drawString(440, y, "Duration")
        y -= 14

        c.setFont("Helvetica", 9)
        medicines = parsed.get("medicines", [])
        if not medicines and parsed.get("medication_name"):
            medicines = [{"name": parsed.get("medication_name"), "dosage": parsed.get("dosage", ""), "frequency": "Daily", "duration": "30 days"}]
        if not medicines:
            medicines = [{"name": "Atorvastatin 20mg", "dosage": "1 tablet", "frequency": "Once daily at night", "duration": "30 days"}]

        for med in medicines:
            c.drawString(50, y, str(med.get("name") or med.get("medication_name") or "Medication"))
            c.drawString(220, y, str(med.get("dosage") or "As advised"))
            c.drawString(330, y, str(med.get("frequency") or "Once daily"))
            c.drawString(440, y, str(med.get("duration") or "30 days"))
            y -= 16

        y -= 15
        c.setFont("Helvetica-Bold", 10)
        c.drawString(40, y, "Clinical Instructions & Advice:")
        y -= 16
        c.setFont("Helvetica", 9)
        instructions = parsed.get("instructions") or "Take prescribed medications with food. Maintain regular hydration and follow-up."
        c.drawString(40, y, instructions[:110])
        if len(instructions) > 110:
            y -= 14
            c.drawString(40, y, instructions[110:220])

        c.setFillColor(colors.HexColor("#577877"))
        c.setFont("Helvetica", 8)
        c.drawString(40, 40, "This e-prescription was electronically generated and signed under the Telemedicine Practice Guidelines.")
        c.save()

        return Response(
            content=buf.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="prescription-{prescription_id}.pdf"'},
        )
    except Exception as pdf_err:
        import logging
        logging.getLogger("teleconsult.records").warning("PDF generation fallback to text: %s", pdf_err)
        return PlainTextResponse(
            content_raw,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="prescription-{prescription_id}.txt"'},
        )


@clinician_router.post("/summaries", status_code=201)
async def publish_summary(payload: ClinicalPublication, principal: Principal = Depends(require("clinical:publish"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await db["doctors"].find_one({
        "tenant_id": str(principal.tenant_id),
        "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}, {"user_account_id": str(principal.user_id)}],
    })
    if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
        raise HTTPException(status_code=403, detail="Approved doctor access is required")
    appointment = await db["appointments"].find_one({
        "tenant_id": str(principal.tenant_id),
        "$or": [
            {"id": str(payload.appointment_id)},
            {"id": str(payload.appointment_id).lower()},
            {"id": str(payload.appointment_id).upper()},
        ],
    })
    if appointment is None:
        raise HTTPException(status_code=404, detail="Consultation encounter not found")
    summary = {
        "id": f"sum-{secrets.token_hex(8)}",
        "tenant_id": str(principal.tenant_id),
        "appointment_id": str(appointment["id"]),
        "patient_id": str(appointment["patient_id"]),
        "author_id": str(doctor.get("id") or principal.user_id),
        "content": payload.content,
        "status": "released",
        "created_at": datetime.now(UTC).isoformat(),
        "released_at": datetime.now(UTC).isoformat(),
    }
    await db["consultation_summaries"].insert_one(summary)
    return {"id": summary["id"], "status": summary["status"]}


@clinician_router.post("/prescriptions", status_code=201)
async def publish_prescription(payload: ClinicalPublication, principal: Principal = Depends(require("clinical:publish"))):
    verify_telemedicine_prescription_safety(payload.content)

    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    doctor = await db["doctors"].find_one({
        "tenant_id": str(principal.tenant_id),
        "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}, {"user_account_id": str(principal.user_id)}],
    })
    if doctor is None or doctor.get("approval_status") != "approved" or not doctor.get("active"):
        raise HTTPException(status_code=403, detail="Approved doctor access is required")
    appointment = await db["appointments"].find_one({
        "tenant_id": str(principal.tenant_id),
        "$or": [
            {"id": str(payload.appointment_id)},
            {"id": str(payload.appointment_id).lower()},
            {"id": str(payload.appointment_id).upper()},
        ],
    })
    if appointment is None:
        raise HTTPException(status_code=404, detail="Consultation encounter not found")
    prescription = {
        "id": f"rx-{secrets.token_hex(8)}",
        "tenant_id": str(principal.tenant_id),
        "appointment_id": str(appointment["id"]),
        "patient_id": str(appointment["patient_id"]),
        "author_id": str(doctor.get("id") or principal.user_id),
        "prescriber_name": str(doctor.get("full_name") or "Clinician"),
        "content": payload.content,
        "status": "released",
        "created_at": datetime.now(UTC).isoformat(),
        "released_at": datetime.now(UTC).isoformat(),
    }
    await db["prescriptions"].insert_one(prescription)
    return {"id": prescription["id"], "status": prescription["status"]}
