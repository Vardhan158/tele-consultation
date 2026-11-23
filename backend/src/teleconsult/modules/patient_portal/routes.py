import hashlib
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.audit.models import AuditRecord
from teleconsult.modules.identity.auth_routes import auth_database_session
from teleconsult.modules.notifications.service import queue_patient_notification
from teleconsult.modules.patient_portal.appointment_access import (
    appointment_times,
    expire_pending_payment,
    latest_payment,
    patient_identity_ids,
)
from teleconsult.modules.patient_portal.consent import PatientConsent
from teleconsult.modules.patient_portal.intake import MedicalIntake
from teleconsult.modules.patient_portal.models import (
    Appointment,
    AppointmentEvent,
    Doctor,
    DoctorAvailability,
    Patient,
)
import secrets
from teleconsult.modules.patient_portal.schemas import (
    AppointmentCancelRequest,
    AppointmentCreate,
    AppointmentReschedule,
    AppointmentResponse,
    AvailabilityResponse,
    ConsentCreate,
    ConsentResponse,
    DoctorResponse,
    MedicalIntakeCreate,
    MedicalIntakeResponse,
    PatientCreate,
    PatientProfileUpdate,
    PatientResponse,
)

router = APIRouter(prefix="/patient", tags=["patient-journey"])
public_router = APIRouter(prefix="/patient", tags=["public-directory"])

ACTIVE_BOOKING_STATUSES = {"requested", "pending_payment", "confirmed", "checked_in", "in_progress", "rescheduled"}


def _slot_status(starts_at: Any, ends_at: Any, booked: bool = False, now: datetime | None = None) -> str:
    now_utc = now or datetime.now(UTC)
    start = _parse_datetime(starts_at)
    end = _parse_datetime(ends_at)
    if end <= now_utc or start <= now_utc and booked:
        return "expired" if end <= now_utc else "booked"
    return "booked" if booked else "available"


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


async def compute_doctor_pricing(
    db: Any,
    tenant_id: str,
    doctor_id: Any,
    appointment_type: str | None = None,
) -> dict[str, Any]:
    """Compute the single authoritative consultation fee for a doctor and appointment type."""
    doc_id_str = str(doctor_id)
    t_id_str = str(tenant_id)
    apt_clean = (appointment_type or "").strip(" .,;:")
    escaped_apt = re.escape(apt_clean) if apt_clean else ""

    services = []
    if escaped_apt:
        # 1. Active service matching assigned doctor & appointment_type
        services = await db["services"].find({
            "tenant_id": t_id_str,
            "active": True,
            "assigned_doctors": doc_id_str,
            "appointment_types": {"$regex": f"^{escaped_apt}[\\s\\.]*$", "$options": "i"},
        }).to_list(5)

        # 2. Active service matching appointment_type for clinic
        if not services:
            services = await db["services"].find({
                "tenant_id": t_id_str,
                "active": True,
                "appointment_types": {"$regex": f"^{escaped_apt}[\\s\\.]*$", "$options": "i"},
            }).to_list(5)

    # 3. Any active service assigned to doctor
    if not services:
        services = await db["services"].find({
            "tenant_id": t_id_str,
            "active": True,
            "assigned_doctors": doc_id_str,
        }).to_list(5)

    # 4. Any active service in clinic
    if not services:
        services = await db["services"].find({
            "tenant_id": t_id_str,
            "active": True,
        }).to_list(5)

    if services:
        service = services[0]
        base_fee = int(service.get("base_fee_paise", int(service.get("base_fee", 0)) * 100))
        platform_fee = int(service.get("platform_fee_paise", int(service.get("platform_fee", 0)) * 100))
        currency = service.get("currency", "INR")
        duration = int(service.get("duration_minutes", 30))
        return {
            "service_id": str(service.get("id", service.get("_id"))),
            "base_fee_paise": base_fee,
            "platform_fee_paise": platform_fee,
            "total_payable_paise": base_fee + platform_fee,
            "currency": currency,
            "duration_minutes": duration,
        }

    # 5. Doctor document fee_paise
    doctor_doc = await db["doctors"].find_one({
        "tenant_id": t_id_str,
        "$or": [{"id": doc_id_str}, {"user_id": doc_id_str}, {"user_account_id": doc_id_str}],
    })

    if doctor_doc and doctor_doc.get("fee_paise") is not None and int(doctor_doc.get("fee_paise", 0)) > 0:
        base_fee = int(doctor_doc.get("fee_paise"))
        platform_fee = int(doctor_doc.get("platform_fee_paise", 0))
        currency = doctor_doc.get("currency", "INR")
        return {
            "service_id": f"doctor_fee_{doc_id_str}",
            "base_fee_paise": base_fee,
            "platform_fee_paise": platform_fee,
            "total_payable_paise": base_fee + platform_fee,
            "currency": currency,
            "duration_minutes": 30,
        }

    # Standard fallback if fee is unconfigured
    return {
        "service_id": f"default_fee_{doc_id_str}",
        "base_fee_paise": 40000,
        "platform_fee_paise": 0,
        "total_payable_paise": 40000,
        "currency": "INR",
        "duration_minutes": 30,
    }


@public_router.get("/doctors/{doctor_id}/pricing")
async def doctor_pricing(doctor_id: UUID, appointment_type: str = Query(min_length=1)) -> dict:
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Service pricing is unavailable")
    db = mongo_database.database()
    return await compute_doctor_pricing(db, public_tenant_id(), doctor_id, appointment_type)


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
        responses = []
        async for document in documents:
            doctor_id = str(document.get("id", document["user_id"]))
            pricing = await compute_doctor_pricing(mongo_database.database(), tenant_id, doctor_id)
            base_fee_paise = pricing["base_fee_paise"]
            platform_fee_paise = pricing["platform_fee_paise"]
            total_payable_paise = pricing["total_payable_paise"]
            currency = pricing["currency"]

            responses.append(DoctorResponse(
                id=UUID(doctor_id), full_name=document.get("full_name", ""),
                specialty=document.get("specialty", ""), clinic_name=document.get("clinic_name", ""),
                fee_paise=total_payable_paise, currency=currency,
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
        now_utc = datetime.now(UTC)
        active_appointments = await db["appointments"].find({
            "tenant_id": str(tenant_id), "doctor_id": str(doctor_id), "status": {"$in": list(ACTIVE_BOOKING_STATUSES)},
        }).to_list(500)
        result = []
        async for document in documents:
            start = _parse_datetime(document["starts_at"])
            end = _parse_datetime(document["ends_at"])
            occupied = any(_parse_datetime(item.get("starts_at")) < end and _parse_datetime(item.get("ends_at")) > start for item in active_appointments)
            if end <= now_utc or occupied:
                continue
            result.append(AvailabilityResponse(id=str(document["id"]), doctor_id=UUID(document["doctor_id"]), starts_at=start, ends_at=end, timezone=clinic_timezone))
        return result
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

        allergies_val = document.get("allergies")
        if not allergies_val:
            intake_doc = await db["intake"].find_one({
                "tenant_id": principal.tenant_id,
                "$or": [{"patient_id": str(principal.user_id)}, {"patient_id": principal.user_id}],
            }) or await db["medical_intakes"].find_one({
                "tenant_id": principal.tenant_id,
                "$or": [{"patient_id": str(principal.user_id)}, {"patient_id": principal.user_id}],
            })
            if intake_doc and intake_doc.get("allergies"):
                allergies_val = intake_doc.get("allergies")

        return PatientResponse(
            id=_to_uuid(document.get("id") or document.get("user_id")),
            full_name=document.get("full_name", "Patient"),
            email=document.get("email", ""),
            phone=document.get("phone", ""),
            date_of_birth=document.get("date_of_birth"),
            preferred_language=document.get("preferred_language", "English"),
            address=document.get("address"),
            emergency_contact=document.get("emergency_contact"),
            preferred_pharmacy=document.get("preferred_pharmacy"),
            pharmacy_address=document.get("pharmacy_address"),
            pharmacy_phone=document.get("pharmacy_phone"),
            allergies=allergies_val,
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
            preferred_pharmacy=document.get("preferred_pharmacy"),
            pharmacy_address=document.get("pharmacy_address"),
            pharmacy_phone=document.get("pharmacy_phone"),
            allergies=document.get("allergies"),
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
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:write")),
) -> ConsentResponse:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        consent_id = str(uuid4())
        now = datetime.now(UTC)
        doc = {
            "id": consent_id,
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(principal.user_id),
            "consent_type": payload.consent_type,
            "version": payload.version,
            "status": "granted",
            "granted_at": now.isoformat(),
            "created_at": now.isoformat(),
        }
        await db["consents"].insert_one(dict(doc))
        audit_doc = {
            "id": str(uuid4()),
            "tenant_id": str(principal.tenant_id),
            "actor_id": str(principal.user_id),
            "action": "consent.grant",
            "resource_type": "patient_consent",
            "resource_id": consent_id,
            "purpose": payload.consent_type,
            "occurred_at": now.isoformat(),
        }
        await db["audit_logs"].insert_one(dict(audit_doc))
        return ConsentResponse(
            id=_to_uuid(consent_id),
            consent_type=payload.consent_type,
            version=payload.version,
            status="granted",
            granted_at=now,
        )
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    consent = PatientConsent(tenant_id=UUID(principal.tenant_id), patient_id=UUID(principal.user_id),
        ends_at=datetime(9999, 12, 31, tzinfo=UTC), **payload.model_dump())
    session.add(consent)
    await session.flush()
    session.add(AuditRecord(tenant_id=consent.tenant_id, actor_id=consent.patient_id, action="consent.grant",
        resource_type="patient_consent", resource_id=consent.id, purpose=consent.consent_type,
        metadata_json={"version": consent.version, "status": consent.status}))
    return ConsentResponse(
        id=consent.id,
        consent_type=consent.consent_type,
        version=consent.version,
        status=consent.status,
        granted_at=consent.granted_at,
    )


@router.get("/consents", response_model=list[ConsentResponse])
async def list_consents(
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:read")),
) -> list[ConsentResponse]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

        documents = await db["consents"].find({
            "tenant_id": str(principal.tenant_id),
            "patient_id": {"$in": patient_ids},
        }).sort("granted_at", -1).to_list(500)

        results = []
        for document in documents:
            dt_val = document.get("granted_at") or document.get("created_at")
            if isinstance(dt_val, str):
                try:
                    dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
                except ValueError:
                    dt = datetime.now(UTC)
            elif isinstance(dt_val, datetime):
                dt = dt_val
            else:
                dt = datetime.now(UTC)

            results.append(ConsentResponse(
                id=_to_uuid(document.get("id") or document.get("_id")),
                consent_type=document.get("consent_type", "general"),
                version=document.get("version", "v1.0"),
                status=document.get("status", "granted"),
                granted_at=dt,
            ))
        return results

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(PatientConsent).where(
        PatientConsent.tenant_id == UUID(principal.tenant_id), PatientConsent.patient_id == UUID(principal.user_id)
    ).order_by(PatientConsent.granted_at.desc()))
    return [
        ConsentResponse(
            id=c.id,
            consent_type=c.consent_type,
            version=c.version,
            status=c.status,
            granted_at=c.granted_at,
        )
        for c in result
    ]


@router.post("/consents/{consent_id}/withdraw", response_model=ConsentResponse)
async def withdraw_consent(
    consent_id: str,
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("patient:profile:write")),
) -> ConsentResponse:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
        now = datetime.now(UTC)

        doc = await db["consents"].find_one({
            "tenant_id": str(principal.tenant_id),
            "patient_id": {"$in": patient_ids},
            "$or": [{"id": str(consent_id)}, {"id": str(consent_id).lower()}],
        })
        if not doc:
            raise HTTPException(status_code=404, detail="Consent record not found")

        await db["consents"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "withdrawn", "withdrawn_at": now.isoformat()}},
        )

        audit_doc = {
            "id": str(uuid4()),
            "tenant_id": str(principal.tenant_id),
            "actor_id": str(principal.user_id),
            "action": "consent.withdraw",
            "resource_type": "patient_consent",
            "resource_id": str(doc["id"]),
            "purpose": doc.get("consent_type", "general"),
            "occurred_at": now.isoformat(),
        }
        await db["audit_logs"].insert_one(dict(audit_doc))

        return ConsentResponse(
            id=_to_uuid(doc["id"]),
            consent_type=doc.get("consent_type", "general"),
            version=doc.get("version", "v1.0"),
            status="withdrawn",
            granted_at=now,
        )

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    c_uuid = _to_uuid(consent_id)
    consent = await session.scalar(select(PatientConsent).where(
        PatientConsent.id == c_uuid, PatientConsent.tenant_id == UUID(principal.tenant_id),
        PatientConsent.patient_id == UUID(principal.user_id)
    ))
    if consent is None:
        raise HTTPException(status_code=404, detail="Consent not found")
    consent.status = "withdrawn"
    consent.withdrawn_at = datetime.now(UTC)
    session.add(AuditRecord(tenant_id=consent.tenant_id, actor_id=consent.patient_id, action="consent.withdraw",
        resource_type="patient_consent", resource_id=consent.id, purpose=consent.consent_type,
        metadata_json={"version": consent.version}))
    return ConsentResponse(
        id=consent.id,
        consent_type=consent.consent_type,
        version=consent.version,
        status=consent.status,
        granted_at=consent.granted_at,
    )


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
) -> list[AvailabilityResponse]:
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        clinic_settings = await db["clinic_settings"].find_one({"tenant_id": principal.tenant_id})
        doctor = await db["doctors"].find_one({"tenant_id": principal.tenant_id, "id": str(doctor_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone") or (doctor or {}).get("timezone") or "Asia/Kolkata"
        documents = db["doctor_availability"].find({
            "tenant_id": principal.tenant_id, "doctor_id": str(doctor_id), "status": "available",
        }).sort("starts_at", 1)
        active_appointments = await db["appointments"].find({"tenant_id": principal.tenant_id, "doctor_id": str(doctor_id), "status": {"$in": list(ACTIVE_BOOKING_STATUSES)}}).to_list(500)
        now_utc = datetime.now(UTC)
        result = []
        async for document in documents:
            start, end = _parse_datetime(document["starts_at"]), _parse_datetime(document["ends_at"])
            occupied = any(_parse_datetime(item.get("starts_at")) < end and _parse_datetime(item.get("ends_at")) > start for item in active_appointments)
            if end <= now_utc or occupied:
                continue
            result.append(AvailabilityResponse(
                id=str(document["id"]),
                doctor_id=UUID(document["doctor_id"]),
                starts_at=start,
                ends_at=end,
                timezone=clinic_timezone,
            ))
        return result
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == UUID(principal.tenant_id), DoctorAvailability.doctor_id == doctor_id,
        DoctorAvailability.status == "available"
    ).order_by(DoctorAvailability.starts_at))
    now_utc = datetime.now(UTC)
    appointments = list(await session.scalars(select(Appointment).where(
        Appointment.tenant_id == UUID(principal.tenant_id), Appointment.doctor_id == doctor_id,
        Appointment.status.in_(ACTIVE_BOOKING_STATUSES))))
    doctor_timezone = await session.scalar(select(Doctor.timezone).where(Doctor.id == doctor_id, Doctor.tenant_id == UUID(principal.tenant_id)))
    clinic_timezone = doctor_timezone or "Asia/Kolkata"
    return [
        AvailabilityResponse.model_validate({**slot.__dict__, "timezone": clinic_timezone})
        for slot in result
        if slot.ends_at > now_utc and not any(item.starts_at < slot.ends_at and item.ends_at > slot.starts_at for item in appointments)
    ]


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
        effective_idempotency_key = (idempotency_key or "").strip()
        if effective_idempotency_key:
            existing_apt = await db["appointments"].find_one({
                "tenant_id": principal.tenant_id,
                "idempotency_key": effective_idempotency_key,
            })
            if existing_apt:
                return existing_apt
        else:
            effective_idempotency_key = f"apt-idemp-{uuid4()}"

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
        timezone_name = (clinic_settings or {}).get("timezone", "Asia/Kolkata")
        try:
            clinic_zone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Clinic timezone is not configured correctly.") from exc
        local_date = payload.starts_at.astimezone(clinic_zone).date()
        blocked = await db["blocked_dates"].find_one({"tenant_id": principal.tenant_id, "date": local_date.isoformat()})
        if blocked:
            raise HTTPException(status_code=409, detail="Appointments are unavailable on this blocked clinic date")
        now_utc = datetime.now(UTC)
        slot_end = payload.starts_at + timedelta(minutes=payload.duration_minutes)
        if payload.starts_at <= now_utc or slot_end <= now_utc:
            raise HTTPException(status_code=409, detail="Selected appointment slot has expired")
        occupied = await db["appointments"].find_one({
            "tenant_id": principal.tenant_id,
            "doctor_id": str(payload.doctor_id),
            "status": {"$in": list(ACTIVE_BOOKING_STATUSES)},
            "starts_at": {"$lt": slot_end.isoformat()},
            "ends_at": {"$gt": payload.starts_at.isoformat()},
        })
        if occupied:
            raise HTTPException(status_code=409, detail="Doctor is not available for this time")
        slot = await db["doctor_availability"].find_one_and_update(
            {"tenant_id": principal.tenant_id, "doctor_id": str(payload.doctor_id), "starts_at": payload.starts_at.isoformat(), "ends_at": {"$gt": now_utc.isoformat()}, "status": "available", "booked": {"$ne": True}},
            {"$set": {"status": "reserved", "booked": True}},
        )
        if slot is None:
            raise HTTPException(status_code=409, detail="Selected appointment slot is no longer available")
        appointment_id = str(uuid4())
        appointment = {
            "id": appointment_id,
            "tenant_id": principal.tenant_id,
            "patient_id": principal.user_id,
            "doctor_id": str(payload.doctor_id),
            "service_id": service.get("id"),
            "base_fee_paise": base_fee_paise,
            "platform_fee_paise": platform_fee_paise,
            "total_payable_paise": total_payable_paise,
            "currency": currency,
            "starts_at": payload.starts_at.isoformat(),
            "ends_at": (payload.starts_at + timedelta(minutes=payload.duration_minutes)).isoformat(),
            "status": "confirmed",
            "payment_status": "not_required",
            "appointment_type": payload.appointment_type,
            "visit_format": payload.visit_format,
            "reason": payload.reason,
            "notes": payload.notes,
            "idempotency_key": effective_idempotency_key,
            "created_at": datetime.now(UTC).isoformat(),
        }
        try:
            await db["appointments"].insert_one(appointment)
        except Exception as exc:
            from pymongo.errors import DuplicateKeyError
            if isinstance(exc, DuplicateKeyError):
                if slot and slot.get("id"):
                    await db["doctor_availability"].update_one(
                        {"tenant_id": principal.tenant_id, "id": slot.get("id")},
                        {"$set": {"status": "available", "booked": False}},
                    )
                if effective_idempotency_key:
                    existing = await db["appointments"].find_one({
                        "tenant_id": principal.tenant_id,
                        "idempotency_key": effective_idempotency_key,
                    })
                    if existing:
                        return existing
                raise HTTPException(status_code=409, detail="Selected appointment slot is no longer available") from exc
            raise
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
    now_utc = datetime.now(UTC)
    if payload.starts_at <= now_utc:
        raise HTTPException(status_code=409, detail="Selected appointment slot has expired")
    slot = await session.scalar(select(DoctorAvailability).where(
        DoctorAvailability.tenant_id == tenant_id, DoctorAvailability.doctor_id == payload.doctor_id,
        DoctorAvailability.starts_at == payload.starts_at, DoctorAvailability.ends_at > now_utc, DoctorAvailability.status == "available"
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


def _to_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _to_uuid(val: Any) -> UUID:
    if isinstance(val, UUID):
        return val
    val_str = str(val or "")
    if len(val_str) == 36:
        try:
            return UUID(val_str)
        except ValueError:
            pass
    # Preserve stable legacy IDs; this hash is not used for authentication.
    raw_bytes = hashlib.md5(val_str.encode(), usedforsecurity=False).digest()
    return UUID(bytes=raw_bytes)


async def _resolve_patient_ids(db: Any, tenant_id: str, user_id: str) -> list[str]:
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

    user_doc = await db["users"].find_one({
        "tenant_id": str(tenant_id),
        "$or": [
            {"id": str(user_id)},
            {"user_id": str(user_id)},
        ],
    })
    if user_doc:
        for k in ("id", "user_id"):
            val = user_doc.get(k)
            if val and str(val) not in patient_ids:
                patient_ids.append(str(val))

    all_ids = []
    for pid in patient_ids:
        all_ids.extend([pid, pid.lower(), pid.upper()])
    return list(set(all_ids))


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
        await expire_pending_payment(database, tenant_id=principal.tenant_id)
        clinic_settings = await database["clinic_settings"].find_one({"tenant_id": str(principal.tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")

        patient_ids = await patient_identity_ids(database, principal)

        cursor = database["appointments"].find({
            "tenant_id": str(principal.tenant_id),
            "patient_id": {"$in": patient_ids},
        }).sort("starts_at", -1)

        documents = await cursor.to_list(500)
        results = []
        for appointment in documents:
            try:
                doctor_id_raw = appointment.get("doctor_id")
                doctor = None
                if doctor_id_raw:
                    doctor = await database["doctors"].find_one({
                        "tenant_id": str(principal.tenant_id),
                        "$or": [{"id": str(doctor_id_raw)}, {"user_id": str(doctor_id_raw)}, {"user_account_id": str(doctor_id_raw)}],
                    })

                doctor_response = None
                if doctor:
                    doc_fee = _to_int(doctor.get("fee_paise"))
                    doctor_response = DoctorResponse(
                        id=_to_uuid(doctor.get("id") or doctor.get("user_id") or doctor_id_raw),
                        full_name=str(doctor.get("full_name") or "Doctor"),
                        specialty=str(doctor.get("specialty") or "General Specialist"),
                        clinic_name=str(doctor.get("clinic_name") or "Kaizen Care Telehealth Center"),
                        fee_paise=doc_fee,
                        timezone=str(doctor.get("timezone") or clinic_timezone),
                        supported_languages=doctor.get("supported_languages") if isinstance(doctor.get("supported_languages"), list) else ["English"],
                        registration_number=doctor.get("registration_number"),
                    )

                starts_at_dt, ends_at_dt = appointment_times(appointment)

                fee_paise = _to_int(appointment.get("total_payable_paise", appointment.get("fee_paise")))
                base_fee_paise = _to_int(appointment.get("base_fee_paise"))
                platform_fee_paise = _to_int(appointment.get("platform_fee_paise"))

                apt_id_str = str(appointment.get("id") or appointment.get("_id") or "")
                payment = await latest_payment(database, principal.tenant_id, apt_id_str)

                if payment:
                    fee_paise = fee_paise or _to_int(payment.get("amount_paise") or payment.get("amount"))
                    base_fee_paise = base_fee_paise if base_fee_paise is not None else _to_int(payment.get("base_fee_paise"))
                    platform_fee_paise = platform_fee_paise if platform_fee_paise is not None else _to_int(payment.get("platform_fee_paise"))

                total_payable_paise = fee_paise or (
                    (base_fee_paise or 0) + (platform_fee_paise or 0) if base_fee_paise is not None else None
                )
                payment_status = str((payment or {}).get("status") or appointment.get("payment_status") or "pending")

                apt_status = str(appointment.get("status", "confirmed")).lower()
                v_session = await database["video_sessions"].find_one({
                    "tenant_id": str(principal.tenant_id),
                    "appointment_id": apt_id_str,
                })
                c_session = await database["consultation_sessions"].find_one({
                    "tenant_id": str(principal.tenant_id),
                    "appointment_id": apt_id_str,
                })

                if (
                    (v_session and str(v_session.get("status", "")).lower() in {"completed", "ended"})
                    or (c_session and str(c_session.get("status", "")).lower() in {"completed", "ended"})
                ):
                    apt_status = "completed"
                    if appointment.get("status") != "completed":
                        await database["appointments"].update_one(
                            {"tenant_id": str(principal.tenant_id), "id": apt_id_str},
                            {"$set": {"status": "completed"}},
                        )

                results.append(AppointmentResponse(
                    id=apt_id_str,
                    doctor_id=str(doctor_id_raw or principal.user_id),
                    patient_id=str(appointment.get("patient_id") or principal.user_id),
                    starts_at=starts_at_dt,
                    ends_at=ends_at_dt,
                    status=apt_status,
                    payment_status=payment_status.lower(),
                    join_window_minutes=get_settings().video_join_window_minutes,
                    base_fee_paise=base_fee_paise,
                    platform_fee_paise=platform_fee_paise,
                    total_payable_paise=total_payable_paise,
                    currency=str(appointment.get("currency") or (payment.get("currency") if payment else "INR")),
                    doctor=doctor_response,
                ))
            except Exception as exc:
                import logging
                logging.getLogger("teleconsult.portal").exception(f"Error parsing appointment item: {exc}")
                raise HTTPException(status_code=500, detail="Unable to load appointments") from exc

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
            join_window_minutes=get_settings().video_join_window_minutes,
            doctor=DoctorResponse.model_validate(doctors_map[a.doctor_id]) if a.doctor_id in doctors_map else None,
        )
        for a in appointments
    ]


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_appointment(
    appointment_id: str,
    payload: AppointmentCancelRequest | None = None,
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("appointment:write")),
) -> AppointmentResponse:
    if get_settings().mongodb_enabled:
        database = mongo_database.database()
        patient_ids = await patient_identity_ids(database, principal)

        appointment = await database["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [{"id": str(appointment_id)}, {"_id": str(appointment_id)}],
            "patient_id": {"$in": patient_ids},
        })
        if not appointment:
            other_apt = await database["appointments"].find_one({
                "tenant_id": str(principal.tenant_id),
                "$or": [{"id": str(appointment_id)}, {"_id": str(appointment_id)}],
            })
            if other_apt:
                raise HTTPException(status_code=403, detail="Forbidden: You cannot cancel another patient's appointment")
            raise HTTPException(status_code=404, detail="Appointment not found")

        current_status = str(appointment.get("status", "")).lower()
        if current_status in {"completed", "cancelled"}:
            raise HTTPException(status_code=409, detail=f"Appointment cannot be cancelled (current status: {current_status})")

        starts_at_dt, ends_at_dt = appointment_times(appointment)
        if starts_at_dt <= datetime.now(UTC) and current_status == "completed":
            raise HTTPException(status_code=409, detail="Completed consultations cannot be cancelled")

        doctor_id = str(appointment.get("doctor_id") or "")
        # Release doctor's availability slot
        await database["doctor_availability"].update_many(
            {
                "tenant_id": str(principal.tenant_id),
                "doctor_id": doctor_id,
                "$or": [
                    {"starts_at": appointment.get("starts_at")},
                    {"starts_at": starts_at_dt.isoformat()},
                    {"starts_at": starts_at_dt.strftime("%Y-%m-%dT%H:%M:%SZ")},
                ],
            },
            {"$set": {"status": "available", "booked": False, "is_booked": False}},
        )

        reason_text = payload.reason if payload and payload.reason else "Patient requested cancellation"
        new_payment_status = str(appointment.get("payment_status", "pending")).lower()
        payment = await latest_payment(database, principal.tenant_id, str(appointment_id))

        if payment:
            pay_status = str(payment.get("status", "")).lower()
            if pay_status in {"captured", "success", "paid"}:
                amount_paise = int(payment.get("amount_paise") or payment.get("amount") or 0)
                refund_id = f"rfnd_{secrets.token_hex(8)}"
                now_iso = datetime.now(UTC).isoformat()

                refund_type = "simulated"
                from teleconsult.modules.payments.patient_routes import get_razorpay_client
                rzp_client = get_razorpay_client()
                tx_id = payment.get("provider_transaction_id") or payment.get("razorpay_payment_id")
                if rzp_client and tx_id and not tx_id.startswith("tx_pending"):
                    if not tx_id.startswith("pay_synth_"):
                        try:
                            rzp_res = rzp_client.payment.refund(
                                tx_id,
                                {"amount": amount_paise},
                            )
                            if isinstance(rzp_res, dict) and rzp_res.get("id"):
                                refund_id = rzp_res["id"]
                                refund_type = "provider_confirmed"
                            else:
                                raise HTTPException(status_code=502, detail="Provider refund failed to return confirmation")
                        except HTTPException:
                            raise
                        except Exception as rzp_err:
                            import logging
                            logging.getLogger("teleconsult.payments").warning("Razorpay refund error: %s", rzp_err)
                            raise HTTPException(status_code=502, detail=f"Provider refund failed: {str(rzp_err)}") from rzp_err
                    else:
                        refund_type = "simulated"

                await database["payments"].update_one(
                    {"_id": payment["_id"]},
                    {"$set": {
                        "status": "refunded",
                        "refund_id": refund_id,
                        "refund_type": refund_type,
                        "refund_status": "confirmed" if refund_type == "provider_confirmed" else "simulated",
                        "refund_reason": reason_text,
                        "refunded_at": now_iso,
                    }},
                )
                await database["refunds"].update_one(
                    {"tenant_id": str(principal.tenant_id), "payment_id": str(payment.get("id") or payment["_id"])},
                    {"$set": {
                        "id": f"refund-{payment.get('id') or payment['_id']}",
                        "tenant_id": str(principal.tenant_id),
                        "payment_id": str(payment.get("id") or payment["_id"]),
                        "appointment_id": str(appointment_id),
                        "amount_paise": amount_paise,
                        "status": "refunded",
                        "refund_type": refund_type,
                        "reason": reason_text,
                        "razorpay_refund_id": refund_id,
                        "created_at": now_iso,
                    }},
                    upsert=True,
                )
                new_payment_status = "refunded"

        now_iso = datetime.now(UTC).isoformat()
        await database["appointments"].update_one(
            {"_id": appointment["_id"]},
            {"$set": {
                "status": "cancelled",
                "payment_status": new_payment_status,
                "cancellation_reason": reason_text,
                "cancelled_at": now_iso,
            }},
        )

        await database["appointment_events"].insert_one({
            "id": f"evt-{secrets.token_hex(8)}",
            "tenant_id": str(principal.tenant_id),
            "appointment_id": str(appointment_id),
            "actor_id": str(principal.user_id),
            "from_status": current_status,
            "to_status": "cancelled",
            "created_at": now_iso,
        })

        await database["notifications"].insert_one({
            "id": str(uuid4()),
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(appointment.get("patient_id")),
            "recipient_id": str(appointment.get("patient_id")),
            "event_type": "appointment_cancelled",
            "subject": "Appointment Cancelled",
            "body": f"Your appointment on {starts_at_dt.strftime('%b %d, %Y')} has been cancelled. Cancellation recorded.",
            "channel": "in_app",
            "status": "queued",
            "created_at": now_iso,
        })

        doctor = None
        if doctor_id:
            doctor = await database["doctors"].find_one({
                "tenant_id": str(principal.tenant_id),
                "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
            })
        clinic_settings = await database["clinic_settings"].find_one({"tenant_id": str(principal.tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")

        doctor_response = None
        if doctor:
            doctor_response = DoctorResponse(
                id=_to_uuid(doctor.get("id") or doctor.get("user_id") or doctor_id),
                full_name=str(doctor.get("full_name") or "Doctor"),
                specialty=str(doctor.get("specialty") or "Specialist"),
                clinic_name=str(doctor.get("clinic_name") or "Kaizen Care Telehealth Center"),
                fee_paise=_to_int(doctor.get("fee_paise")),
                timezone=str(doctor.get("timezone") or clinic_timezone),
                supported_languages=doctor.get("supported_languages") if isinstance(doctor.get("supported_languages"), list) else ["English"],
                registration_number=doctor.get("registration_number"),
            )

        fee_paise = _to_int(appointment.get("total_payable_paise", appointment.get("fee_paise")))
        base_fee_paise = _to_int(appointment.get("base_fee_paise"))
        platform_fee_paise = _to_int(appointment.get("platform_fee_paise"))

        return AppointmentResponse(
            id=str(appointment_id),
            doctor_id=str(doctor_id or principal.user_id),
            patient_id=str(appointment.get("patient_id") or principal.user_id),
            starts_at=starts_at_dt,
            ends_at=ends_at_dt,
            status="cancelled",
            payment_status=new_payment_status,
            join_window_minutes=get_settings().video_join_window_minutes,
            base_fee_paise=base_fee_paise,
            platform_fee_paise=platform_fee_paise,
            total_payable_paise=fee_paise,
            currency=str(appointment.get("currency") or "INR"),
            doctor=doctor_response,
        )

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == UUID(appointment_id), Appointment.tenant_id == UUID(principal.tenant_id),
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
    return AppointmentResponse(
        id=appointment.id,
        doctor_id=appointment.doctor_id,
        patient_id=appointment.patient_id,
        starts_at=appointment.starts_at,
        ends_at=appointment.ends_at,
        status=appointment.status,
        payment_status=appointment.payment_status,
        join_window_minutes=get_settings().video_join_window_minutes,
    )


@router.post("/appointments/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appointment(
    appointment_id: str,
    payload: AppointmentReschedule,
    session: AsyncSession | None = Depends(patient_session),
    principal: Principal = Depends(require("appointment:write")),
) -> AppointmentResponse:
    if get_settings().mongodb_enabled:
        database = mongo_database.database()
        patient_ids = await patient_identity_ids(database, principal)

        appointment = await database["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "$or": [{"id": str(appointment_id)}, {"_id": str(appointment_id)}],
            "patient_id": {"$in": patient_ids},
        })
        if not appointment:
            other_apt = await database["appointments"].find_one({
                "tenant_id": str(principal.tenant_id),
                "$or": [{"id": str(appointment_id)}, {"_id": str(appointment_id)}],
            })
            if other_apt:
                raise HTTPException(status_code=403, detail="Forbidden: You cannot reschedule another patient's appointment")
            raise HTTPException(status_code=404, detail="Appointment not found")

        current_status = str(appointment.get("status", "")).lower()
        if current_status in {"completed", "cancelled"}:
            raise HTTPException(status_code=409, detail="Appointment cannot be rescheduled")

        doctor_id = str(appointment.get("doctor_id") or "")
        new_starts_at = None
        duration_min = 30
        matching_slot = None

        if payload.slot_id:
            matching_slot = await database["doctor_availability"].find_one({
                "tenant_id": str(principal.tenant_id),
                "$or": [{"id": str(payload.slot_id)}, {"_id": str(payload.slot_id)}],
            })
            if not matching_slot:
                raise HTTPException(status_code=404, detail="Selected slot not found")
            new_starts_at = _parse_datetime(matching_slot["starts_at"])
            duration_min = int(matching_slot.get("duration_minutes") or 30)
        elif payload.starts_at:
            new_starts_at = payload.starts_at
            matching_slot = await database["doctor_availability"].find_one({
                "tenant_id": str(principal.tenant_id),
                "doctor_id": doctor_id,
                "$or": [
                    {"starts_at": new_starts_at},
                    {"starts_at": new_starts_at.isoformat()},
                    {"starts_at": new_starts_at.strftime("%Y-%m-%dT%H:%M:%SZ")},
                    {"starts_at": new_starts_at.strftime("%Y-%m-%dT%H:%M:%S+00:00")},
                ],
            })
            if matching_slot:
                duration_min = int(matching_slot.get("duration_minutes") or 30)
        else:
            raise HTTPException(status_code=400, detail="Missing starts_at or slot_id in reschedule request")

        if new_starts_at <= datetime.now(UTC):
            raise HTTPException(status_code=400, detail="Cannot reschedule to a past date or time")

        if matching_slot:
            is_occupied = (
                matching_slot.get("booked") is True
                or matching_slot.get("is_booked") is True
                or str(matching_slot.get("status", "")).lower() in {"booked", "occupied", "reserved"}
            )
            if is_occupied:
                raise HTTPException(status_code=409, detail="Selected slot is no longer available")

        new_ends_at = new_starts_at + timedelta(minutes=duration_min)

        conflict = await database["appointments"].find_one({
            "tenant_id": str(principal.tenant_id),
            "doctor_id": doctor_id,
            "$or": [{"id": {"$ne": str(appointment.get("id") or appointment.get("_id"))}}, {"_id": {"$ne": appointment["_id"]}}],
            "status": {"$in": ["requested", "confirmed", "checked_in", "rescheduled"]},
            "starts_at": {"$lt": new_ends_at.isoformat()},
            "ends_at": {"$gt": new_starts_at.isoformat()},
        })
        if conflict:
            raise HTTPException(status_code=409, detail="Doctor is not available for this time")

        old_starts_at = appointment.get("starts_at")
        await database["doctor_availability"].update_many(
            {
                "tenant_id": str(principal.tenant_id),
                "doctor_id": doctor_id,
                "$or": [
                    {"starts_at": old_starts_at},
                    {"starts_at": _parse_datetime(old_starts_at).isoformat() if old_starts_at else None},
                ],
            },
            {"$set": {"status": "available", "booked": False, "is_booked": False}},
        )

        if matching_slot:
            await database["doctor_availability"].update_one(
                {"_id": matching_slot["_id"]},
                {"$set": {"status": "booked", "booked": True, "is_booked": True}},
            )

        now_iso = datetime.now(UTC).isoformat()
        new_starts_str = new_starts_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        new_ends_str = new_ends_at.strftime("%Y-%m-%dT%H:%M:%SZ")

        await database["appointments"].update_one(
            {"_id": appointment["_id"]},
            {"$set": {
                "starts_at": new_starts_str,
                "ends_at": new_ends_str,
                "status": "rescheduled",
                "rescheduled_at": now_iso,
            }},
        )

        await database["appointment_events"].insert_one({
            "id": f"evt-{secrets.token_hex(8)}",
            "tenant_id": str(principal.tenant_id),
            "appointment_id": str(appointment_id),
            "actor_id": str(principal.user_id),
            "from_status": current_status,
            "to_status": "rescheduled",
            "created_at": now_iso,
        })

        await database["notifications"].insert_one({
            "id": str(uuid4()),
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(appointment.get("patient_id")),
            "recipient_id": str(appointment.get("patient_id")),
            "event_type": "appointment_rescheduled",
            "subject": "Appointment Rescheduled",
            "body": f"Your appointment has been updated to {new_starts_at.strftime('%b %d, %Y at %I:%M %p')}.",
            "channel": "in_app",
            "status": "queued",
            "created_at": now_iso,
        })

        doctor = None
        if doctor_id:
            doctor = await database["doctors"].find_one({
                "tenant_id": str(principal.tenant_id),
                "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
            })
        clinic_settings = await database["clinic_settings"].find_one({"tenant_id": str(principal.tenant_id)})
        clinic_timezone = (clinic_settings or {}).get("timezone", "Asia/Kolkata")

        doctor_response = None
        if doctor:
            doctor_response = DoctorResponse(
                id=_to_uuid(doctor.get("id") or doctor.get("user_id") or doctor_id),
                full_name=str(doctor.get("full_name") or "Doctor"),
                specialty=str(doctor.get("specialty") or "Specialist"),
                clinic_name=str(doctor.get("clinic_name") or "Kaizen Care Telehealth Center"),
                fee_paise=_to_int(doctor.get("fee_paise")),
                timezone=str(doctor.get("timezone") or clinic_timezone),
                supported_languages=doctor.get("supported_languages") if isinstance(doctor.get("supported_languages"), list) else ["English"],
                registration_number=doctor.get("registration_number"),
            )

        fee_paise = _to_int(appointment.get("total_payable_paise", appointment.get("fee_paise")))
        base_fee_paise = _to_int(appointment.get("base_fee_paise"))
        platform_fee_paise = _to_int(appointment.get("platform_fee_paise"))

        return AppointmentResponse(
            id=str(appointment_id),
            doctor_id=str(doctor_id or principal.user_id),
            patient_id=str(appointment.get("patient_id") or principal.user_id),
            starts_at=new_starts_at,
            ends_at=new_ends_at,
            status="rescheduled",
            payment_status=str(appointment.get("payment_status", "captured")).lower(),
            join_window_minutes=get_settings().video_join_window_minutes,
            base_fee_paise=base_fee_paise,
            platform_fee_paise=platform_fee_paise,
            total_payable_paise=fee_paise,
            currency=str(appointment.get("currency") or "INR"),
            doctor=doctor_response,
        )

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == UUID(appointment_id), Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.patient_id == UUID(principal.user_id)
    ))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status in {"completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Appointment cannot be rescheduled")
    if payload.starts_at is None:
        raise HTTPException(status_code=400, detail="starts_at is required")
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
    return AppointmentResponse(
        id=appointment.id,
        doctor_id=appointment.doctor_id,
        patient_id=appointment.patient_id,
        starts_at=appointment.starts_at,
        ends_at=appointment.ends_at,
        status=appointment.status,
        payment_status=appointment.payment_status,
        join_window_minutes=get_settings().video_join_window_minutes,
    )

