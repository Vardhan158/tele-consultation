from datetime import datetime, UTC, timedelta
import base64, hashlib, hmac, secrets, struct, time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.modules.identity.auth_routes import password_hash, send_verification_email, token_hash
from teleconsult.modules.identity.models import AuthSession, RecoveryToken, UserAccount
from teleconsult.modules.patient_portal.models import Doctor
from teleconsult.config.settings import get_settings

router = APIRouter(prefix="/doctor", tags=["doctor-onboarding"])


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
async def register_doctor(payload: DoctorRegistration, session: AsyncSession = Depends(tenant_session)):
    email = payload.email.strip().lower()
    if await session.scalar(select(UserAccount.id).where(UserAccount.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
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
    code = "000000" if get_settings().environment in {"dev", "local"} else __import__("secrets").randbelow(1_000_000).__format__("06d")
    session.add(RecoveryToken(user_id=user.id, token_hash=token_hash(code), expires_at=datetime.now(UTC) + timedelta(minutes=10)))
    await send_verification_email(user.email, code)
    return {"status": "verification_required", "user_id": str(user.id), "approval_status": "pending"}


@router.post("/{doctor_id}/approve")
async def approve_doctor(doctor_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinic:doctor:approve"))):
    doctor = await session.scalar(select(Doctor).where(Doctor.id == doctor_id, Doctor.tenant_id == UUID(principal.tenant_id)))
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.approval_status, doctor.active, doctor.approved_for_consultation = "approved", True, True
    return {"status": doctor.approval_status, "doctor_id": str(doctor.id)}

@router.get("/pending")
async def pending_doctors(session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinic:doctor:read"))):
    rows = await session.scalars(select(Doctor).where(Doctor.tenant_id == UUID(principal.tenant_id), Doctor.approval_status == "pending"))
    return [{"id": row.id, "full_name": row.full_name, "specialty": row.specialty, "clinic_name": row.clinic_name, "registration_number": row.registration_number} for row in rows]


@router.post("/{doctor_id}/reject")
async def reject_doctor(doctor_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("clinic:doctor:approve"))):
    doctor = await session.scalar(select(Doctor).where(Doctor.id == doctor_id, Doctor.tenant_id == UUID(principal.tenant_id)))
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
