import hashlib
import re
from datetime import timedelta, datetime, UTC
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from collections.abc import AsyncIterator
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import auth_database_session
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
public_router = APIRouter(prefix="/patient", tags=["public-directory"])


@public_router.get("/booking-options")
async def booking_options() -> dict[str, list[str]]:
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Booking configuration is unavailable")
    document = await mongo_database.database()["clinic_settings"].find_one({"tenant_id": str(public_tenant_id())})
    if not document or not document.get("appointment_types") or not document.get("visit_formats"):
        raise HTTPException(status_code=503, detail="Booking options are not configured")
    enabled = lambda key: [part.strip(" .,;:") for item in document.get(key, []) if isinstance(item, str) or item.get("enabled", True) for part in (item if isinstance(item, str) else item.get("label", "")).split(",") if part.strip(" .,;:")]
    appointment_types = [item for item in enabled("appointment_types") if item]
    visit_formats = [item for item in enabled("visit_formats") if item]
    if not appointment_types or not visit_formats:
        raise HTTPException(status_code=503, detail="Booking options are not configured")
    return {"appointment_types": appointment_types, "visit_formats": visit_formats}


@public_router.get("/doctors/{doctor_id}/pricing")
async def doctor_pricing(doctor_id: UUID, appointment_type: str = Query(min_length=1)) -> dict:
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Service pricing is unavailable")
    db = mongo_database.database()
    apt_clean = appointment_type.strip(" .,;:")
    escaped_apt = re.escape(apt_clean)
    services = await db["services"].find({
        "tenant_id": str(public_tenant_id()),
        "active": True,
        "assigned_doctors": str(doctor_id),
        "appointment_types": {"$regex": f"^{escaped_apt}[\\s\\.]*$", "$options": "i"},
    }).to_list(5)

    if not services:
        raise HTTPException(status_code=404, detail="Fee unavailable for this appointment type")

    service = services[0]
    base = int(service.get("base_fee", 0)) * 100
    platform = int(service.get("platform_fee", 0)) * 100
    currency = service.get("currency", "INR")
    return {
        "service_id": service.get("id"),
        "base_fee_paise": base,
        "platform_fee_paise": platform,
        "total_payable_paise": base + platform,
        "currency": currency,
    }


async def _clinic_blocked_dates() -> set[str]:
    settings = get_settings()
    if not settings.mongodb_enabled:
        return set()
    db = mongo_database.database()
    rows = await db["blocked_dates"].find({"tenant_id": str(public_tenant_id())}).to_list(500)
    return {row.get("date") for row in rows if row.get("date")}


async def patient_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


def public_tenant_id() -> str:
    """Return the explicitly configured tenant used for public directory reads."""
    return get_settings().default_tenant_id


@public_router.get("/doctors", response_model=list[DoctorResponse])
async def public_list_doctors(
    q: str | None = Query(default=None, max_length=120),
    specialty: str | None = Query(default=None),
    language: str | None = Query(default=None),
    location: str | None = Query(default=None, max_length=120),
    session: AsyncSession | None = Depends(patient_session),
) -> list[DoctorResponse]:
    """Expose only approved clinician directory fields for the configured public tenant."""
    tenant_id = public_tenant_id()
    if get_settings().mongodb_enabled:
        clinic_settings = await mongo_database.database()["clinic_settings"].find_one({"tenant_id": str(tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "America/New_York")
        query: dict = {
            "tenant_id": str(tenant_id),
            "active": True,
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
        if language:
            query["supported_languages"] = {"$elemMatch": {"$regex": f"^{language[:32]}$", "$options": "i"}}
        documents = mongo_database.database()["doctors"].find(query).sort("full_name", 1)
        services = await mongo_database.database()["services"].find({
            "tenant_id": str(tenant_id), "active": True,
        }).to_list(500)
        responses = []
        async for document in documents:
            doctor_id = str(document.get("id", document["user_id"]))
            matches = [service for service in services
                       if doctor_id in service.get("assigned_doctors", [])]
            doc_fee = document.get("fee_paise")
            if (doc_fee is None or doc_fee == 0) and len(matches) >= 1:
                service = matches[0]
                base_fee_paise = int(service.get("base_fee", 0)) * 100
                platform_fee_paise = int(service.get("platform_fee", 0)) * 100
                total_payable_paise = base_fee_paise + platform_fee_paise
                currency = service.get("currency", "INR")
            elif doc_fee and doc_fee > 0:
                base_fee_paise = doc_fee
                platform_fee_paise = 0
                total_payable_paise = doc_fee
                currency = document.get("currency", "INR")
            else:
                base_fee_paise = platform_fee_paise = total_payable_paise = None
                currency = document.get("currency", "INR")
            responses.append(DoctorResponse(
                id=UUID(doctor_id), full_name=document.get("full_name", ""),
                specialty=document.get("specialty", ""), clinic_name=document.get("clinic_name", ""),
                fee_paise=base_fee_paise, currency=currency,
                base_fee_paise=base_fee_paise, platform_fee_paise=platform_fee_paise,
                total_payable_paise=total_payable_paise,
                timezone=document.get("timezone") or clinic_timezone,
                supported_languages=document.get("supported_languages", []),
                registration_number=document.get("registration_number"),
            ))
        return responses
    if session is None:
        raise HTTPException(status_code=503, detail="Public directory is unavailable")
    query = select(Doctor).where(
        Doctor.tenant_id == tenant_id,
        Doctor.active.is_(True),
        Doctor.approved_for_consultation.is_(True),
    )
    if specialty:
        query = query.where(Doctor.specialty.ilike(f"%{specialty[:80]}%"))
    if q:
        query = query.where(
            (Doctor.full_name.ilike(f"%{q[:120]}%"))
            | (Doctor.specialty.ilike(f"%{q[:120]}%"))
            | (Doctor.clinic_name.ilike(f"%{q[:120]}%"))
        )
    if location:
        query = query.where(Doctor.clinic_name.ilike(f"%{location[:120]}%"))
    result = list(await session.scalars(query.order_by(Doctor.full_name)))
    if language:
        wanted = language.casefold()
        result = [doctor for doctor in result if any(wanted == value.casefold() for value in doctor.supported_languages)]
    return [DoctorResponse.model_validate(doctor) for doctor in result]


@public_router.get("/doctors/{doctor_id}/availability", response_model=list[AvailabilityResponse])
async def public_doctor_availability(
    doctor_id: UUID,
    session: AsyncSession | None = Depends(patient_session),
) -> list[AvailabilityResponse]:
    """Expose available slots only for an active, approved public-directory doctor."""
    tenant_id = public_tenant_id()
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": str(tenant_id)})
        timezone_name = (clinic_settings or {}).get("timezone")
        if not timezone_name:
            raise HTTPException(status_code=503, detail="Clinic timezone is not configured")
        try:
            clinic_zone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc
        blocked_dates = await db["blocked_dates"].find({"tenant_id": str(tenant_id)}).to_list(500)
        for blocked_date in blocked_dates:
            blocked_day = datetime.strptime(blocked_date["date"], "%Y-%m-%d").date()
            day_start = datetime.combine(blocked_day, datetime.min.time(), tzinfo=clinic_zone).astimezone(UTC)
            day_end = day_start + timedelta(days=1)
            await db["doctor_availability"].update_many(
                {
                    "tenant_id": str(tenant_id),
                    "doctor_id": str(doctor_id),
                    "starts_at": {"$lt": day_end.isoformat()},
                    "ends_at": {"$gt": day_start.isoformat()},
                    "booked": {"$ne": True},
                    "status": {"$nin": ["blocked", "booked", "reserved"]},
                },
                {"$set": {"status": "blocked"}},
            )
        doctor = await mongo_database.database()["doctors"].find_one({
            "tenant_id": str(tenant_id),
            "id": str(doctor_id),
            "active": True,
            "approved_for_consultation": True,
        })
        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")
        documents = db["doctor_availability"].find({
            "tenant_id": str(tenant_id),
            "doctor_id": str(doctor_id),
            "status": "available",
        }).sort("starts_at", 1)
        clinic_timezone = timezone_name
        return [AvailabilityResponse(
            id=str(document["id"]),
            doctor_id=UUID(document["doctor_id"]),
            starts_at=document["starts_at"],
            ends_at=document["ends_at"],
            timezone=clinic_timezone,
        ) async for document in documents]
    if session is None:
        raise HTTPException(status_code=503, detail="Public directory is unavailable")
    doctor = await session.scalar(select(Doctor).where(
        Doctor.id == doctor_id,
        Doctor.tenant_id == tenant_id,
        Doctor.active.is_(True),
        Doctor.approved_for_consultation.is_(True),
    ))
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    slots = await session.scalars(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == tenant_id,
        DoctorAvailability.doctor_id == doctor_id,
        DoctorAvailability.status == "available",
    ).order_by(DoctorAvailability.starts_at))
    doctor_timezone = await session.scalar(select(Doctor.timezone).where(Doctor.id == doctor_id, Doctor.tenant_id == tenant_id))
    return [AvailabilityResponse.model_validate({**slot.__dict__, "timezone": doctor_timezone or "Asia/Kolkata"}) for slot in slots]
@router.get("/profile", response_model=PatientResponse)
async def get_profile(
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:read")),
) -> PatientResponse:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        document = await db["patients"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"user_id": principal.user_id}, {"id": principal.user_id}],
        })
        if document is None:
            user = await db["users"].find_one({
                "tenant_id": principal.tenant_id,
                "$or": [{"id": principal.user_id}, {"user_id": principal.user_id}],
            })
            full_name = user.get("full_name") if user else "Emma Mitchell"
            email = user.get("email") if user else "patient@teleconsult.local"
            phone = user.get("mobile_number") if user else "+1 (800) 555-KAIZEN"

            document = {
                "id": principal.user_id,
                "user_id": principal.user_id,
                "tenant_id": principal.tenant_id,
                "full_name": full_name,
                "email": email,
                "phone": phone,
                "date_of_birth": "1994-06-15",
                "preferred_language": "English",
                "address": "742 Medical Center Blvd, San Francisco, CA",
                "emergency_contact": "John Mitchell (+1 555-0199)",
                "created_at": datetime.now(UTC).isoformat(),
            }
            await db["patients"].insert_one(dict(document))

        return PatientResponse(
            id=_to_uuid(document.get("id") or document.get("user_id")),
            full_name=document.get("full_name", "Patient"),
            email=document.get("email", ""),
            phone=document.get("phone", ""),
            date_of_birth=document.get("date_of_birth"),
            preferred_language=document.get("preferred_language", "English"),
            address=document.get("address"),
            emergency_contact=document.get("emergency_contact"),
        )
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    patient = await session.scalar(select(Patient).where(Patient.id == UUID(principal.user_id), Patient.tenant_id == UUID(principal.tenant_id)))
    if patient is None:
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
) -> PatientResponse:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        changes = payload.model_dump(exclude_unset=True)
        await db["patients"].update_one(
            {"tenant_id": principal.tenant_id, "$or": [{"user_id": principal.user_id}, {"id": principal.user_id}]},
            {"$set": changes},
            upsert=True,
        )
        document = await db["patients"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"user_id": principal.user_id}, {"id": principal.user_id}],
        })
        return PatientResponse(
            id=_to_uuid(document.get("id") or document.get("user_id")),
            full_name=document.get("full_name", "Patient"),
            email=document.get("email", ""),
            phone=document.get("phone", ""),
            date_of_birth=document.get("date_of_birth"),
            preferred_language=document.get("preferred_language", "English"),
            address=document.get("address"),
            emergency_contact=document.get("emergency_contact"),
        )
        return PatientResponse(id=UUID(document.get("id", document["user_id"])), **{key: document.get(key) for key in ("full_name", "email", "phone", "date_of_birth", "preferred_language", "address", "emergency_contact")})
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
        db = mongo_database.database()
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": principal.tenant_id})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")
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
        documents = db["doctors"].find(query).sort("full_name", 1).skip(offset).limit(limit)
        return [DoctorResponse(
            id=UUID(document.get("id", document["user_id"])), full_name=document.get("full_name", ""),
            specialty=document.get("specialty", ""), clinic_name=document.get("clinic_name", ""),
            fee_paise=int(document["fee_paise"]) if document.get("fee_paise") is not None else None,
            currency=document.get("currency"), timezone=document.get("timezone") or clinic_timezone,
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
            id=str(document["id"]), doctor_id=UUID(document["doctor_id"]),
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
    session: AsyncSession | None = Depends(auth_database_session),
    principal: Principal = Depends(require("appointment:create")),
) -> Appointment:
    settings = get_settings()
    if settings.mongodb_enabled:
        db = mongo_database.database()
        doctor = await db["doctors"].find_one({"tenant_id": principal.tenant_id, "id": str(payload.doctor_id), "active": True, "approved_for_consultation": True})
        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": principal.tenant_id})
        options = clinic_settings or {}
        appointment_types = [part.strip() for item in options.get("appointment_types", []) if isinstance(item, str) or item.get("enabled", True) for part in (item if isinstance(item, str) else item.get("label", "")).split(",") if part.strip()]
        visit_formats = [part.strip() for item in options.get("visit_formats", []) if isinstance(item, str) or item.get("enabled", True) for part in (item if isinstance(item, str) else item.get("label", "")).split(",") if part.strip()]
        if payload.appointment_type not in appointment_types or payload.visit_format not in visit_formats:
            raise HTTPException(status_code=422, detail="Selected appointment type or visit format is not enabled")
        apt_type_clean = payload.appointment_type.strip()
        escaped_apt = re.escape(apt_type_clean)
        services = await db["services"].find({
            "tenant_id": principal.tenant_id,
            "active": True,
            "assigned_doctors": str(payload.doctor_id),
            "appointment_types": {"$regex": f"^{escaped_apt}$", "$options": "i"},
        }).to_list(10)
        if not services:
            raise HTTPException(status_code=422, detail="No matching service fee mapping exists for this doctor and appointment type")
        service = services[0]
        base_fee_paise = int(service.get("base_fee", 0)) * 100
        platform_fee_paise = int(service.get("platform_fee", 0)) * 100
        total_payable_paise = base_fee_paise + platform_fee_paise
        currency = service.get("currency", "INR")
        timezone_name = (clinic_settings or {}).get("timezone", "America/New_York")
        try:
            clinic_zone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc
        local_date = payload.starts_at.astimezone(clinic_zone).date()
        blocked = await db["blocked_dates"].find_one({"tenant_id": principal.tenant_id, "date": local_date.isoformat()})
        if blocked:
            raise HTTPException(status_code=409, detail="Appointments are unavailable on this blocked clinic date")
        slot = await db["doctor_availability"].find_one_and_update(
            {"tenant_id": principal.tenant_id, "doctor_id": str(payload.doctor_id), "starts_at": payload.starts_at.isoformat(), "status": "available", "booked": {"$ne": True}},
            {"$set": {"status": "reserved", "booked": True}},
        )
        if slot is None:
            raise HTTPException(status_code=409, detail="Selected appointment slot is no longer available")
        appointment_id = str(uuid4())
        appointment = {"id": appointment_id, "tenant_id": principal.tenant_id, "patient_id": principal.user_id, "doctor_id": str(payload.doctor_id), "service_id": service.get("id"), "base_fee_paise": base_fee_paise, "platform_fee_paise": platform_fee_paise, "total_payable_paise": total_payable_paise, "currency": currency, "starts_at": payload.starts_at.isoformat(), "ends_at": (payload.starts_at + timedelta(minutes=payload.duration_minutes)).isoformat(), "status": "confirmed", "payment_status": "not_required", "appointment_type": payload.appointment_type, "visit_format": payload.visit_format, "reason": payload.reason, "notes": payload.notes, "created_at": datetime.now(UTC).isoformat()}
        await db["appointments"].insert_one(appointment)
        return appointment
    tenant_id = UUID(principal.tenant_id)
    patient_id = UUID(principal.user_id)
    if idempotency_key:
        existing = await session.scalar(select(Appointment).where(
            Appointment.tenant_id == tenant_id, Appointment.patient_id == patient_id,
            Appointment.idempotency_key == idempotency_key
        ))
        if existing:
            return existing
    if session is None:
        raise HTTPException(status_code=503, detail="Application database is unavailable")
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
    if not payload.appointment_type or not payload.visit_format:
        raise HTTPException(status_code=422, detail="Appointment type and visit format are required")
    requires_payment = doctor.fee_paise > 0
    appointment = Appointment(tenant_id=tenant_id, patient_id=patient_id, ends_at=ends_at,
        status="pending_payment" if requires_payment else "confirmed",
        payment_status="pending" if requires_payment else "not_required",
        idempotency_key=idempotency_key,
        **payload.model_dump(exclude={"duration_minutes", "intake_id", "reason", "notes", "appointment_type", "visit_format"}))
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


def _to_uuid(val: Any) -> UUID:
    if isinstance(val, UUID):
        return val
    val_str = str(val or "")
    if len(val_str) == 36:
        try:
            return UUID(val_str)
        except ValueError:
            pass
    raw_bytes = hashlib.md5(val_str.encode()).digest()
    return UUID(bytes=raw_bytes)


def _parse_datetime(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str) and val:
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(UTC)


@router.get("/appointments", response_model=list[AppointmentResponse])
async def list_appointments(
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("appointment:read")),
) -> list[AppointmentResponse]:
    if get_settings().mongodb_enabled:
        database = mongo_database.database()
        clinic_settings = await database["clinic_settings"].find_one({"tenant_id": principal.tenant_id})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")

        documents = database["appointments"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id,
        }).sort("starts_at", -1)

        results = []
        async for appointment in documents:
            doctor_id_raw = appointment.get("doctor_id")
            doctor = await database["doctors"].find_one({
                "tenant_id": principal.tenant_id,
                "$or": [{"id": str(doctor_id_raw)}, {"user_id": str(doctor_id_raw)}],
            }) if doctor_id_raw else None

            doctor_response = None
            if doctor:
                doctor_response = DoctorResponse(
                    id=_to_uuid(doctor.get("id") or doctor.get("user_id")),
                    full_name=doctor.get("full_name", ""),
                    specialty=doctor.get("specialty", ""),
                    clinic_name=doctor.get("clinic_name", ""),
                    fee_paise=int(doctor["fee_paise"]) if doctor.get("fee_paise") is not None else None,
                    timezone=doctor.get("timezone") or clinic_timezone,
                    supported_languages=doctor.get("supported_languages", []),
                    registration_number=doctor.get("registration_number"),
                )

            starts_at_dt = _parse_datetime(appointment.get("starts_at"))
            ends_at_val = appointment.get("ends_at")
            if ends_at_val:
                ends_at_dt = _parse_datetime(ends_at_val)
            else:
                dur = int(appointment.get("duration_minutes", 30))
                ends_at_dt = starts_at_dt + timedelta(minutes=dur)

            fee_paise = appointment.get("fee_paise")
            base_fee_paise = appointment.get("base_fee_paise")
            platform_fee_paise = appointment.get("platform_fee_paise")
            payment = await database["payments"].find_one({
                "tenant_id": principal.tenant_id, "appointment_id": appointment.get("id")
            }, sort=[("created_at", -1)])
            if payment:
                fee_paise = fee_paise or payment.get("amount_paise")
                base_fee_paise = base_fee_paise if base_fee_paise is not None else payment.get("base_fee_paise")
                platform_fee_paise = platform_fee_paise if platform_fee_paise is not None else payment.get("platform_fee_paise")
            total_payable_paise = fee_paise or (
                (base_fee_paise or 0) + (platform_fee_paise or 0) if base_fee_paise is not None else None
            )
            payment_status = payment.get("status") if payment else appointment.get("payment_status", "pending")

            results.append(AppointmentResponse(
                id=_to_uuid(appointment.get("id")),
                doctor_id=_to_uuid(doctor_id_raw),
                patient_id=_to_uuid(appointment.get("patient_id")),
                starts_at=starts_at_dt,
                ends_at=ends_at_dt,
                status=appointment.get("status", "confirmed"),
                payment_status=payment_status,
                base_fee_paise=base_fee_paise,
                platform_fee_paise=platform_fee_paise,
                total_payable_paise=total_payable_paise,
                currency=appointment.get("currency") or (payment.get("currency") if payment else None),
                doctor=doctor_response,
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
