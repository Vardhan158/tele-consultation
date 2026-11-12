import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import (
    auth_database_session,
    password_hash,
    send_verification_email,
    token_hash,
)
from teleconsult.modules.identity.models import RecoveryToken, UserAccount
from teleconsult.modules.patient_portal.models import Doctor

router = APIRouter(prefix="/doctor", tags=["doctor-onboarding"])
OTP_EXPIRY_MINUTES = 5


def generate_verification_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_expiry(now: datetime) -> datetime:
    return now + timedelta(minutes=OTP_EXPIRY_MINUTES)


class DoctorRegistration(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str
    mobile_number: str = Field(min_length=7, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    specialty: str = Field(min_length=2, max_length=120)
    clinic_name: str = Field(min_length=2, max_length=180)
    registration_number: str = Field(min_length=2, max_length=64)
    qualifications: list[str] = Field(default_factory=list, max_length=20)
    experience_years: int = Field(ge=0, le=80)
    languages: list[str] = Field(default_factory=list, max_length=20)

class MfaCode(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")

def _totp(secret: str, counter: int | None = None) -> str:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8), casefold=True)
    raw = struct.pack(">Q", int(time.time() // 30) if counter is None else counter)
    digest = hmac.new(key, raw, hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000).zfill(6)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_doctor(payload: DoctorRegistration, session: AsyncSession | None = Depends(auth_database_session)):
    email = payload.email.strip().lower()
    settings = get_settings()
    if settings.mongodb_enabled:
        if not mongo_database.enabled:
            raise HTTPException(status_code=503, detail="MongoDB is enabled but not connected")
        tenant_id = settings.default_tenant_id
        user_id = str(uuid4())
        now = datetime.now(UTC)
        user = {
            "id": user_id,
            "user_id": user_id,
            "tenant_id": tenant_id,
            "full_name": payload.full_name.strip(),
            "email": email,
            "phone": payload.mobile_number,
            "mobile_number": payload.mobile_number,
            "password_hash": password_hash(payload.password),
            "terms_version": "doctor-terms-current",
            "terms_accepted_at": now,
            "role": "doctor",
            "verified_at": None,
            "created_at": now,
        }
        doctor = {
            "id": user_id,
            "user_id": user_id,
            "user_account_id": user_id,
            "tenant_id": tenant_id,
            "full_name": user["full_name"],
            "specialty": payload.specialty,
            "clinic_name": payload.clinic_name,
            "registration_number": payload.registration_number,
            "qualifications": payload.qualifications,
            "experience_years": payload.experience_years,
            "languages": payload.languages,
            "supported_languages": payload.languages,
            "active": False,
            "approved_for_consultation": False,
            "approval_status": "pending",
            "created_at": now,
        }
        code = generate_verification_otp()
        try:
            await mongo_database.database()["users"].insert_one(user)
            await mongo_database.database()["doctors"].insert_one(doctor)
            await mongo_database.database()["recovery_tokens"].insert_one({
                "id": str(uuid4()), "user_id": user_id, "token_hash": token_hash(code),
                "expires_at": otp_expiry(now), "used_at": None, "attempts": 0,
            })
            await send_verification_email(email, code)
        except DuplicateKeyError:
            existing_user = await mongo_database.database()["users"].find_one({
                "tenant_id": tenant_id, "email": email
            })
            if existing_user and existing_user.get("verified_at") is None:
                code = generate_verification_otp()
                await mongo_database.database()["recovery_tokens"].update_many(
                    {"user_id": existing_user["id"], "used_at": None},
                    {"$set": {"used_at": now}},
                )
                await mongo_database.database()["recovery_tokens"].insert_one({
                    "id": str(uuid4()), "user_id": existing_user["id"],
                    "token_hash": token_hash(code),
                    "expires_at": otp_expiry(now), "used_at": None, "attempts": 0,
                })
                await send_verification_email(email, code)
                return {
                    "status": "verification_required",
                    "user_id": existing_user["id"],
                    "email": email,
                    "approval_status": "pending",
                }
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.") from None
        return {"status": "verification_required", "user_id": user_id, "email": email, "approval_status": "pending"}

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    existing_user = await session.scalar(select(UserAccount).where(UserAccount.email == email))
    if existing_user:
        if existing_user.verified_at is None:
            code = generate_verification_otp()
            session.add(RecoveryToken(
                user_id=existing_user.id,
                token_hash=token_hash(code),
                expires_at=otp_expiry(datetime.now(UTC)),
            ))
            await send_verification_email(existing_user.email, code)
            return {
                "status": "verification_required",
                "user_id": str(existing_user.id),
                "email": email,
                "approval_status": "pending",
            }
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")

    tenant_id = UUID(get_settings().default_tenant_id)
    user = UserAccount(tenant_id=tenant_id, full_name=payload.full_name.strip(), email=email,
        mobile_number=payload.mobile_number, password_hash=password_hash(payload.password),
        terms_version="doctor-terms-current", terms_accepted_at=datetime.now(UTC), role="doctor")
    session.add(user)
    await session.flush()
    session.add(Doctor(tenant_id=tenant_id, user_account_id=user.id, full_name=user.full_name,
        specialty=payload.specialty, clinic_name=payload.clinic_name, registration_number=payload.registration_number,
        qualifications=payload.qualifications, experience_years=payload.experience_years,
        languages=payload.languages, supported_languages=payload.languages, active=False,
        approved_for_consultation=False, approval_status="pending"))
    code = generate_verification_otp()
    session.add(RecoveryToken(user_id=user.id, token_hash=token_hash(code), expires_at=otp_expiry(datetime.now(UTC)), attempts=0))
    await send_verification_email(user.email, code)
    return {"status": "verification_required", "user_id": str(user.id), "email": email, "approval_status": "pending"}


@router.post("/{doctor_id}/approve")
async def approve_doctor(
    doctor_id: str,
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
):
    settings = get_settings()
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if "clinic:doctor:approve" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")

    if settings.mongodb_enabled:
        db = mongo_database.database()
        result = await db["doctors"].update_one(
            {
                "tenant_id": settings.default_tenant_id,
                "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
            },
            {
                "$set": {
                    "approval_status": "approved",
                    "active": True,
                    "approved_for_consultation": True,
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return {"status": "approved", "doctor_id": str(doctor_id)}

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    doctor = await session.scalar(
        select(Doctor).where(
            Doctor.id == UUID(doctor_id), Doctor.tenant_id == UUID(principal.tenant_id)
        )
    )
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.approval_status, doctor.active, doctor.approved_for_consultation = "approved", True, True
    return {"status": doctor.approval_status, "doctor_id": str(doctor.id)}


@router.get("/pending")
async def pending_doctors(
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
):
    settings = get_settings()
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")

    if settings.mongodb_enabled:
        db = mongo_database.database()
        doctors = await db["doctors"].find({
            "tenant_id": settings.default_tenant_id,
            "approval_status": "pending",
        }).to_list(100)
        return [
            {
                "id": doc.get("id") or doc.get("user_id"),
                "full_name": doc.get("full_name"),
                "specialty": doc.get("specialty"),
                "clinic_name": doc.get("clinic_name"),
                "registration_number": doc.get("registration_number"),
            }
            for doc in doctors
        ]

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    rows = await session.scalars(
        select(Doctor).where(
            Doctor.tenant_id == UUID(principal.tenant_id),
            Doctor.approval_status == "pending",
        )
    )
    return [
        {
            "id": str(row.id),
            "full_name": row.full_name,
            "specialty": row.specialty,
            "clinic_name": row.clinic_name,
            "registration_number": row.registration_number,
        }
        for row in rows
    ]


@router.post("/{doctor_id}/reject")
async def reject_doctor(
    doctor_id: str,
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
):
    settings = get_settings()
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if "clinic:doctor:approve" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")

    if settings.mongodb_enabled:
        db = mongo_database.database()
        result = await db["doctors"].update_one(
            {
                "tenant_id": settings.default_tenant_id,
                "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
            },
            {
                "$set": {
                    "approval_status": "rejected",
                    "active": False,
                    "approved_for_consultation": False,
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return {"status": "rejected", "doctor_id": str(doctor_id)}

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    doctor = await session.scalar(
        select(Doctor).where(
            Doctor.id == UUID(doctor_id), Doctor.tenant_id == UUID(principal.tenant_id)
        )
    )
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.approval_status, doctor.active, doctor.approved_for_consultation = "rejected", False, False
    return {"status": doctor.approval_status, "doctor_id": str(doctor.id)}


@router.post("/mfa/enroll")
async def enroll_mfa(session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("doctor:profile:write"))):
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    user.mfa_secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
    user.mfa_recovery_codes = [secrets.token_urlsafe(8) for _ in range(8)]
    return {"secret": user.mfa_secret, "recovery_codes": user.mfa_recovery_codes}


@router.post("/mfa/verify")
async def verify_mfa(payload: MfaCode, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("doctor:profile:write"))):
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None or not user.mfa_secret or not any(hmac.compare_digest(_totp(user.mfa_secret, int(time.time() // 30) + offset), payload.code) for offset in (-1, 0, 1)):
        raise HTTPException(status_code=400, detail="Invalid MFA code")
    user.mfa_enabled = True
    return {"status": "enabled"}
