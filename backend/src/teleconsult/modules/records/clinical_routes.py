import json
from collections.abc import AsyncIterator
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, UTC
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.config.settings import get_settings
from teleconsult.modules.records.clinical_models import ConsultationSummary, Prescription
from teleconsult.modules.records.clinical_schemas import ClinicalOutputResponse
from teleconsult.modules.notifications.models import Notification
from teleconsult.modules.notifications.service import queue_patient_notification
from teleconsult.modules.patient_portal.models import Appointment

router = APIRouter(prefix="/patient/clinical-outputs", tags=["clinical-outputs"])
clinician_router = APIRouter(prefix="/clinician/clinical-outputs", tags=["clinical-publication"])


async def clinical_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


class ClinicalPublication(BaseModel):
    appointment_id: UUID
    content: str = Field(min_length=2, max_length=100_000)


@router.get("/summaries", response_model=list[ClinicalOutputResponse])
async def list_summaries(session: AsyncSession | None = Depends(clinical_session), principal: Principal = Depends(require("records:read"))) -> list[ConsultationSummary]:
    if get_settings().mongodb_enabled:
        documents = mongo_database.database()["consultation_summaries"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id, "status": "released",
        }).sort("released_at", -1)
        output = []
        async for summary in documents:
            try:
                details = json.loads(summary.get("content", ""))
            except (TypeError, json.JSONDecodeError):
                details = {"discussion": summary.get("content", ""), "recommendations": [], "follow_up": []}
            output.append({"id": summary["id"], "appointment_id": summary["appointment_id"], "content": summary.get("content", ""), "status": summary["status"], "created_at": summary["created_at"], "released_at": summary.get("released_at"), "title": details.get("title"), "doctor": details.get("doctor", {}), "discussion": details.get("discussion"), "recommendations": details.get("recommendations", []), "follow_up": details.get("follow_up", []), "vitals": details.get("vitals", {})})
        return output
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(ConsultationSummary).where(
        ConsultationSummary.tenant_id == UUID(principal.tenant_id), ConsultationSummary.patient_id == UUID(principal.user_id), ConsultationSummary.status == "released"
    ).order_by(ConsultationSummary.released_at.desc()))
    output = []
    for summary in result:
        try:
            details = json.loads(summary.content)
        except (TypeError, json.JSONDecodeError):
            details = {"discussion": summary.content, "recommendations": [], "follow_up": []}
        output.append({"id": summary.id, "appointment_id": summary.appointment_id, "content": summary.content,
            "status": summary.status, "created_at": summary.created_at, "released_at": summary.released_at,
            "title": details.get("title"), "doctor": details.get("doctor", {}),
            "consultation_started_at": details.get("consultation_started_at"), "consultation_ended_at": details.get("consultation_ended_at"),
            "discussion": details.get("discussion"), "recommendations": details.get("recommendations", []),
            "follow_up": details.get("follow_up", []), "vitals": details.get("vitals", {})})
    return output


@router.get("/summaries/{summary_id}/download")
async def download_summary(summary_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("records:read"))):
    summary = await session.scalar(select(ConsultationSummary).where(
        ConsultationSummary.id == summary_id, ConsultationSummary.tenant_id == UUID(principal.tenant_id),
        ConsultationSummary.patient_id == UUID(principal.user_id), ConsultationSummary.status == "released"))
    if summary is None:
        raise HTTPException(status_code=404, detail="Consultation summary not found")
    return PlainTextResponse(summary.content, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="consultation-summary-{summary.id}.txt"'})


@router.get("/prescriptions", response_model=list[ClinicalOutputResponse])
async def list_prescriptions(session: AsyncSession | None = Depends(clinical_session), principal: Principal = Depends(require("prescription:read"))) -> list[dict]:
    if get_settings().mongodb_enabled:
        documents = mongo_database.database()["prescriptions"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id, "status": "released",
        }).sort("released_at", -1)
        output = []
        async for prescription in documents:
            try:
                details = json.loads(prescription.get("content", ""))
            except (TypeError, json.JSONDecodeError):
                details = {"instructions": prescription.get("content", ""), "medicines": []}
            output.append({"id": prescription["id"], "appointment_id": prescription["appointment_id"], "content": prescription.get("content", ""), "status": prescription["status"], "created_at": prescription["created_at"], "released_at": prescription.get("released_at"), "medication_name": details.get("medication_name"), "dosage": details.get("dosage"), "instructions": details.get("instructions"), "medicines": details.get("medicines", []), "prescriber_name": details.get("prescriber_name")})
        return output
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(Prescription).where(
        Prescription.tenant_id == UUID(principal.tenant_id), Prescription.patient_id == UUID(principal.user_id), Prescription.status == "released"
    ).order_by(Prescription.released_at.desc()))
    output = []
    for prescription in result:
        existing_notification = await session.scalar(select(Notification).where(
            Notification.tenant_id == prescription.tenant_id,
            Notification.patient_id == prescription.patient_id,
            Notification.event_type == "prescription_available",
            Notification.body.contains(str(prescription.id)),
        ))
        if existing_notification is None:
            session.add(Notification(
                tenant_id=prescription.tenant_id, patient_id=prescription.patient_id,
                event_type="prescription_available", subject="New prescription available",
                body=f"Prescription {prescription.id} is available in your patient portal.",
                channel="in_app", status="queued",
            ))
        try:
            details = json.loads(prescription.content)
        except (TypeError, json.JSONDecodeError):
            details = {"instructions": prescription.content, "medicines": []}
        output.append({
            "id": prescription.id, "appointment_id": prescription.appointment_id,
            "content": prescription.content, "status": prescription.status,
            "created_at": prescription.created_at, "released_at": prescription.released_at,
            "medication_name": details.get("medication_name"), "dosage": details.get("dosage"),
            "instructions": details.get("instructions"), "medicines": details.get("medicines", []),
            "prescriber_name": details.get("prescriber_name"),
        })
    return output


@router.get("/prescriptions/{prescription_id}/download")
async def download_prescription(prescription_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("prescription:read"))):
    prescription = await session.scalar(select(Prescription).where(
        Prescription.id == prescription_id, Prescription.tenant_id == UUID(principal.tenant_id),
        Prescription.patient_id == UUID(principal.user_id), Prescription.status == "released"))
    if prescription is None:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return PlainTextResponse(
        prescription.content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="prescription-{prescription.id}.txt"'},
    )


@clinician_router.post("/summaries", status_code=201)
async def publish_summary(payload: ClinicalPublication, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:publish"))):
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == payload.appointment_id, Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.doctor_id == UUID(principal.user_id), Appointment.status == "completed"))
    if appointment is None:
        raise HTTPException(status_code=409, detail="Only the assigned clinician can publish a completed consultation")
    summary = ConsultationSummary(tenant_id=appointment.tenant_id, appointment_id=appointment.id,
        patient_id=appointment.patient_id, author_id=UUID(principal.user_id), content=payload.content,
        status="released", released_at=datetime.now(UTC))
    session.add(summary)
    queue_patient_notification(session, tenant_id=appointment.tenant_id, patient_id=appointment.patient_id,
        event_type="summary_available", subject="Consultation summary available",
        body="Your clinician published a consultation summary in your portal.")
    await session.flush()
    return {"id": str(summary.id), "status": summary.status}


@clinician_router.post("/prescriptions", status_code=201)
async def publish_prescription(payload: ClinicalPublication, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinical:publish"))):
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == payload.appointment_id, Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.doctor_id == UUID(principal.user_id), Appointment.status == "completed"))
    if appointment is None:
        raise HTTPException(status_code=409, detail="Only the assigned clinician can publish after consultation completion")
    prescription = Prescription(tenant_id=appointment.tenant_id, appointment_id=appointment.id,
        patient_id=appointment.patient_id, author_id=UUID(principal.user_id), content=payload.content,
        status="released", released_at=datetime.now(UTC))
    session.add(prescription)
    queue_patient_notification(session, tenant_id=appointment.tenant_id, patient_id=appointment.patient_id,
        event_type="prescription_available", subject="Prescription available",
        body="Your clinician published a prescription in your portal.")
    await session.flush()
    return {"id": str(prescription.id), "status": prescription.status}
