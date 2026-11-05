from datetime import timedelta, datetime, UTC
from uuid import UUID

from collections.abc import AsyncIterator
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.patient_portal.consent import PatientConsent
from teleconsult.modules.patient_portal.intake import MedicalIntake
from teleconsult.modules.audit.models import AuditRecord
from teleconsult.modules.notifications.service import queue_patient_notification
from teleconsult.modules.patient_portal.models import Appointment, AppointmentEvent, Doctor, DoctorAvailability, Patient
from teleconsult.modules.patient_portal.schemas import (
    AppointmentCreate,
    AppointmentResponse,
    DoctorResponse,
    PatientCreate,
    PatientResponse,
    ConsentCreate,
    ConsentResponse,
    AppointmentReschedule,
    PatientProfileUpdate,
    MedicalIntakeCreate,
    MedicalIntakeResponse,
    AvailabilityResponse,
)

router = APIRouter(prefix="/patient", tags=["patient-journey"])


async def patient_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


@router.get("/profile", response_model=PatientResponse)
async def get_profile(
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:read")),
) -> Patient:
    if get_settings().mongodb_enabled:
        document = await mongo_database.database()["patients"].find_one({
            "tenant_id": principal.tenant_id, "user_id": principal.user_id,
        })
        if document is None:
            raise HTTPException(status_code=404, detail="Profile not found")
        return PatientResponse(
            id=UUID(document.get("id", document["user_id"])),
            full_name=document["full_name"], email=document["email"], phone=document["phone"],
        )
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    patient = await session.scalar(select(Patient).where(Patient.id == UUID(principal.user_id), Patient.tenant_id == UUID(principal.tenant_id)))
    if patient is None:
        # Keep the checked-in local frontend usable against a fresh development DB.
        # Never create records implicitly outside dev/local environments.
        if get_settings().environment in {"dev", "local"}:
            patient_id = UUID(principal.user_id)
            patient = Patient(
                id=patient_id,
                tenant_id=UUID(principal.tenant_id),
                full_name="Demo Patient",
                email=f"dev+{patient_id}@teleconsult.local",
                phone="0000000000",
            )
            session.add(patient)
            await session.flush()
            return patient
        raise HTTPException(status_code=404, detail="Profile not found")
    return patient


@router.patch("/profile", response_model=PatientResponse)
async def update_profile(
    payload: PatientProfileUpdate,
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:write")),
) -> Patient:
    if get_settings().mongodb_enabled:
        changes = payload.model_dump(exclude_unset=True)
        result = await mongo_database.database()["patients"].update_one(
            {"tenant_id": principal.tenant_id, "user_id": principal.user_id}, {"$set": changes}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Profile not found")
        document = await mongo_database.database()["patients"].find_one({
            "tenant_id": principal.tenant_id, "user_id": principal.user_id,
        })
        return PatientResponse(
            id=UUID(document.get("id", document["user_id"])),
            full_name=document["full_name"], email=document["email"], phone=document["phone"],
        )
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    patient = await session.scalar(select(Patient).where(Patient.id == UUID(principal.user_id), Patient.tenant_id == UUID(principal.tenant_id)))
    if patient is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, key, value)
    return patient


@router.post("/intake", response_model=MedicalIntakeResponse, status_code=status.HTTP_201_CREATED)
async def submit_intake(
    payload: MedicalIntakeCreate,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("patient:intake:write")),
) -> MedicalIntake:
    intake = MedicalIntake(tenant_id=UUID(principal.tenant_id), patient_id=UUID(principal.user_id), **payload.model_dump())
    session.add(intake)
    await session.flush()
    return intake


async def audit(session: AsyncSession, principal: Principal, action: str, resource_id: UUID) -> None:
    session.add(AuditRecord(
        tenant_id=UUID(principal.tenant_id), actor_id=UUID(principal.user_id), action=action,
        resource_type="appointment", resource_id=resource_id, purpose="patient journey", metadata_json={}
    ))


@router.post("/consents", response_model=ConsentResponse, status_code=status.HTTP_201_CREATED)
async def grant_consent(
    payload: ConsentCreate,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("patient:profile:write")),
) -> PatientConsent:
    consent = PatientConsent(tenant_id=UUID(principal.tenant_id), patient_id=UUID(principal.user_id),
        ends_at=datetime(9999, 12, 31, tzinfo=UTC), **payload.model_dump())
    session.add(consent)
    await session.flush()
    session.add(AuditRecord(tenant_id=consent.tenant_id, actor_id=consent.patient_id, action="consent.grant",
        resource_type="patient_consent", resource_id=consent.id, purpose=consent.consent_type,
        metadata_json={"version": consent.version, "status": consent.status}))
    return consent


@router.get("/consents", response_model=list[ConsentResponse])
async def list_consents(
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:read")),
) -> list[PatientConsent]:
    if get_settings().mongodb_enabled:
        documents = mongo_database.database()["consents"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id,
        }).sort("granted_at", -1)
        return [ConsentResponse(
            id=UUID(document["id"]), consent_type=document["consent_type"],
            version=document["version"], status=document.get("status", "active"),
            granted_at=document.get("granted_at", document.get("created_at")),
        ) async for document in documents]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(PatientConsent).where(
        PatientConsent.tenant_id == UUID(principal.tenant_id), PatientConsent.patient_id == UUID(principal.user_id)
    ).order_by(PatientConsent.granted_at.desc()))
    return list(result)


@router.post("/consents/{consent_id}/withdraw", response_model=ConsentResponse)
async def withdraw_consent(
    consent_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("patient:profile:write")),
) -> PatientConsent:
    consent = await session.scalar(select(PatientConsent).where(
        PatientConsent.id == consent_id, PatientConsent.tenant_id == UUID(principal.tenant_id),
        PatientConsent.patient_id == UUID(principal.user_id)
    ))
    if consent is None:
        raise HTTPException(status_code=404, detail="Consent not found")
    consent.status = "withdrawn"
    consent.withdrawn_at = datetime.now(UTC)
    session.add(AuditRecord(tenant_id=consent.tenant_id, actor_id=consent.patient_id, action="consent.withdraw",
        resource_type="patient_consent", resource_id=consent.id, purpose=consent.consent_type,
        metadata_json={"version": consent.version}))
    return consent


@router.post("/profile", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    payload: PatientCreate,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("patient:profile:write")),
) -> Patient:
    patient = Patient(tenant_id=UUID(principal.tenant_id), **payload.model_dump())
    session.add(patient)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Patient profile already exists") from exc
    return patient


@router.get("/doctors", response_model=list[DoctorResponse])
async def list_doctors(
    q: str | None = Query(default=None, max_length=120),
    specialty: str | None = Query(default=None),
    language: str | None = Query(default=None),
    location: str | None = Query(default=None, max_length=120),
    fee_min_paise: int | None = Query(default=None, ge=0),
    fee_max_paise: int | None = Query(default=None, ge=0),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("directory:read")),
) -> list[Doctor]:
    if get_settings().mongodb_enabled:
        query: dict = {
            "tenant_id": principal.tenant_id, "active": True,
            "approved_for_consultation": True,
        }
        if specialty:
            query["specialty"] = {"$regex": specialty[:80], "$options": "i"}
        if location:
            query["clinic_name"] = {"$regex": location[:120], "$options": "i"}
        if q:
            query["$or"] = [
                {"full_name": {"$regex": q[:120], "$options": "i"}},
                {"specialty": {"$regex": q[:120], "$options": "i"}},
                {"clinic_name": {"$regex": q[:120], "$options": "i"}},
            ]
        if fee_min_paise is not None or fee_max_paise is not None:
            query["fee_paise"] = {}
            if fee_min_paise is not None:
                query["fee_paise"]["$gte"] = fee_min_paise
            if fee_max_paise is not None:
                query["fee_paise"]["$lte"] = fee_max_paise
        if language:
            query["supported_languages"] = {"$elemMatch": {"$regex": f"^{language[:32]}$", "$options": "i"}}
        documents = mongo_database.database()["doctors"].find(query).sort("full_name", 1).skip(offset).limit(limit)
        return [DoctorResponse(
            id=UUID(document.get("id", document["user_id"])), full_name=document.get("full_name", ""),
            specialty=document.get("specialty", ""), clinic_name=document.get("clinic_name", ""),
            fee_paise=int(document.get("fee_paise", 0)), timezone=document.get("timezone", "UTC"),
            supported_languages=document.get("supported_languages", []),
            registration_number=document.get("registration_number"),
        ) async for document in documents]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    query = select(Doctor).where(Doctor.tenant_id == UUID(principal.tenant_id), Doctor.active.is_(True), Doctor.approved_for_consultation.is_(True))
    if specialty:
        query = query.where(Doctor.specialty.ilike(f"%{specialty}%"))
    if q:
        query = query.where((Doctor.full_name.ilike(f"%{q}%")) | (Doctor.specialty.ilike(f"%{q}%")) | (Doctor.clinic_name.ilike(f"%{q}%")))
    if location:
        query = query.where(Doctor.clinic_name.ilike(f"%{location}%"))
    if fee_min_paise is not None:
        query = query.where(Doctor.fee_paise >= fee_min_paise)
    if fee_max_paise is not None:
        query = query.where(Doctor.fee_paise <= fee_max_paise)
    result = list(await session.scalars(query.order_by(Doctor.full_name).offset(offset).limit(limit)))
    if language:
        wanted = language.casefold()
        result = [doctor for doctor in result if any(wanted == value.casefold() for value in doctor.supported_languages)]
    return result


@router.get("/doctors/{doctor_id}/availability", response_model=list[AvailabilityResponse])
async def doctor_availability(
    doctor_id: UUID,
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("directory:read")),
) -> list[DoctorAvailability]:
    if get_settings().mongodb_enabled:
        documents = mongo_database.database()["doctor_availability"].find({
            "tenant_id": principal.tenant_id, "doctor_id": str(doctor_id), "status": "available",
        }).sort("starts_at", 1)
        return [AvailabilityResponse(
            id=UUID(document["id"]), doctor_id=UUID(document["doctor_id"]),
            starts_at=document["starts_at"], ends_at=document["ends_at"],
        ) async for document in documents]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == UUID(principal.tenant_id), DoctorAvailability.doctor_id == doctor_id,
        DoctorAvailability.status == "available"
    ).order_by(DoctorAvailability.starts_at))
    return list(result)


@router.post("/appointments", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    payload: AppointmentCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("appointment:create")),
) -> Appointment:
    tenant_id = UUID(principal.tenant_id)
    patient_id = UUID(principal.user_id)
    if idempotency_key:
        existing = await session.scalar(select(Appointment).where(
            Appointment.tenant_id == tenant_id, Appointment.patient_id == patient_id,
            Appointment.idempotency_key == idempotency_key
        ))
        if existing:
            return existing
    doctor = await session.scalar(select(Doctor).where(Doctor.id == payload.doctor_id, Doctor.tenant_id == tenant_id, Doctor.active.is_(True)))
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    slot = await session.scalar(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == tenant_id, DoctorAvailability.doctor_id == payload.doctor_id,
        DoctorAvailability.starts_at == payload.starts_at, DoctorAvailability.status == "available"
    ).with_for_update())
    if slot is None:
        raise HTTPException(status_code=409, detail="Selected appointment slot is no longer available")
    ends_at = slot.ends_at
    conflict = await session.scalar(select(Appointment.id).where(
        Appointment.tenant_id == tenant_id,
        Appointment.doctor_id == payload.doctor_id,
        Appointment.status.in_(["requested", "confirmed", "checked_in"]),
        Appointment.starts_at < ends_at,
        Appointment.ends_at > payload.starts_at,
    ).limit(1))
    if conflict:
        raise HTTPException(status_code=409, detail="Doctor is not available for this time")
    requires_payment = doctor.fee_paise > 0
    appointment = Appointment(tenant_id=tenant_id, patient_id=patient_id, ends_at=ends_at,
        status="pending_payment" if requires_payment else "confirmed",
        payment_status="pending" if requires_payment else "not_required",
        idempotency_key=idempotency_key,
        **payload.model_dump(exclude={"duration_minutes", "intake_id"}))
    slot.status = "reserved"
    session.add(appointment)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Appointment conflicts with an existing booking") from exc
    await audit(session, principal, "appointment.create", appointment.id)
    session.add(AppointmentEvent(tenant_id=tenant_id, appointment_id=appointment.id, actor_id=patient_id,
        from_status="draft", to_status=appointment.status))
    queue_patient_notification(session, tenant_id=tenant_id, patient_id=patient_id,
        event_type="appointment_created", subject="Appointment booking update",
        body="Your appointment request has been received. Check the portal for the current payment and confirmation status.")
    doc_resp = DoctorResponse.model_validate(doctor) if doctor else None
    return AppointmentResponse(
        id=appointment.id,
        doctor_id=appointment.doctor_id,
        patient_id=appointment.patient_id,
        starts_at=appointment.starts_at,
        ends_at=appointment.ends_at,
        status=appointment.status,
        payment_status=appointment.payment_status,
        doctor=doc_resp,
    )


@router.get("/appointments", response_model=list[AppointmentResponse])
async def list_appointments(
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("appointment:read")),
) -> list[AppointmentResponse]:
    if get_settings().mongodb_enabled:
        database = mongo_database.database()
        documents = database["appointments"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id,
        }).sort("starts_at", -1)
        results = []
        async for appointment in documents:
            doctor = await database["doctors"].find_one({
                "tenant_id": principal.tenant_id, "user_id": appointment.get("doctor_id"),
            })
            doctor_response = None
            if doctor:
                doctor_response = DoctorResponse(
                    id=UUID(doctor.get("id", doctor["user_id"])),
                    full_name=doctor.get("full_name", ""), specialty=doctor.get("specialty", ""),
                    clinic_name=doctor.get("clinic_name", ""), fee_paise=int(doctor.get("fee_paise", 0)),
                    timezone=doctor.get("timezone", "UTC"),
                    supported_languages=doctor.get("supported_languages", []),
                    registration_number=doctor.get("registration_number"),
                )
            results.append(AppointmentResponse(
                id=UUID(appointment["id"]), doctor_id=UUID(appointment["doctor_id"]),
                patient_id=UUID(appointment["patient_id"]), starts_at=appointment["starts_at"],
                ends_at=appointment["ends_at"], status=appointment["status"],
                payment_status=appointment.get("payment_status", "pending"), doctor=doctor_response,
            ))
        return results
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    appointments = list(await session.scalars(select(Appointment).where(
        Appointment.tenant_id == UUID(principal.tenant_id), Appointment.patient_id == UUID(principal.user_id)
    ).order_by(Appointment.starts_at.desc())))
    doctor_ids = {a.doctor_id for a in appointments}
    doctors_map = {}
    if doctor_ids:
        docs = await session.scalars(select(Doctor).where(Doctor.id.in_(doctor_ids)))
        doctors_map = {d.id: d for d in docs}
    return [
        AppointmentResponse(
            id=a.id,
            doctor_id=a.doctor_id,
            patient_id=a.patient_id,
            starts_at=a.starts_at,
            ends_at=a.ends_at,
            status=a.status,
            payment_status=a.payment_status,
            doctor=DoctorResponse.model_validate(doctors_map[a.doctor_id]) if a.doctor_id in doctors_map else None,
        )
        for a in appointments
    ]


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_appointment(
    appointment_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("appointment:write")),
) -> Appointment:
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_id, Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.patient_id == UUID(principal.user_id)
    ))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status in {"completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Appointment cannot be cancelled")
    old_slot = await session.scalar(select(DoctorAvailability).where(
        DoctorAvailability.doctor_id == appointment.doctor_id, DoctorAvailability.starts_at == appointment.starts_at
    ).with_for_update())
    if old_slot:
        old_slot.status = "available"
    previous_status = appointment.status
    appointment.status = "cancelled"
    session.add(AppointmentEvent(tenant_id=appointment.tenant_id, appointment_id=appointment.id, actor_id=UUID(principal.user_id),
        from_status=previous_status, to_status="cancelled"))
    await audit(session, principal, "appointment.cancel", appointment.id)
    queue_patient_notification(session, tenant_id=appointment.tenant_id, patient_id=appointment.patient_id,
        event_type="appointment_cancelled", subject="Appointment cancelled", body="Your appointment cancellation has been recorded.")
    return appointment


@router.post("/appointments/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appointment(
    appointment_id: UUID,
    payload: AppointmentReschedule,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("appointment:write")),
) -> Appointment:
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_id, Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.patient_id == UUID(principal.user_id)
    ))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status in {"completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Appointment cannot be rescheduled")
    new_end = payload.starts_at + (appointment.ends_at - appointment.starts_at)
    new_slot = await session.scalar(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == UUID(principal.tenant_id), DoctorAvailability.doctor_id == appointment.doctor_id,
        DoctorAvailability.starts_at == payload.starts_at, DoctorAvailability.status == "available"
    ).with_for_update())
    if new_slot is None:
        raise HTTPException(status_code=409, detail="Selected slot is no longer available")
    conflict = await session.scalar(select(Appointment.id).where(
        Appointment.id != appointment.id, Appointment.doctor_id == appointment.doctor_id,
        Appointment.status.in_(["requested", "confirmed", "checked_in"]),
        Appointment.starts_at < new_end, Appointment.ends_at > payload.starts_at
    ).limit(1))
    if conflict:
        raise HTTPException(status_code=409, detail="Doctor is not available for this time")
    old_slot = await session.scalar(select(DoctorAvailability).where(
        DoctorAvailability.doctor_id == appointment.doctor_id, DoctorAvailability.starts_at == appointment.starts_at
    ).with_for_update())
    if old_slot:
        old_slot.status = "available"
    new_slot.status = "reserved"
    previous_status = appointment.status
    appointment.starts_at, appointment.ends_at, appointment.status = payload.starts_at, new_end, "rescheduled"
    session.add(AppointmentEvent(tenant_id=appointment.tenant_id, appointment_id=appointment.id, actor_id=UUID(principal.user_id),
        from_status=previous_status, to_status="rescheduled"))
    await audit(session, principal, "appointment.reschedule", appointment.id)
    queue_patient_notification(session, tenant_id=appointment.tenant_id, patient_id=appointment.patient_id,
        event_type="appointment_rescheduled", subject="Appointment rescheduled", body="Your appointment time has been updated.")
    return appointment
