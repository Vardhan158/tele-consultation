import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
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
CREDENTIAL_TYPES = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}
MAX_CREDENTIAL_BYTES = 10 * 1024 * 1024
PRIVATE_CREDENTIAL_ROOT = Path(__file__).resolve().parents[4] / "private_storage" / "credentials"


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
async def register_doctor(
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
):
    credential = None
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        values = {key: form.get(key) for key in DoctorRegistration.model_fields}
        values["qualifications"] = [v.strip() for v in str(values.get("qualifications") or "").split(",") if v.strip()]
        values["languages"] = [v.strip() for v in str(values.get("languages") or "").split(",") if v.strip()]
        payload = DoctorRegistration.model_validate(values)
        upload = form.get("credential_document")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(status_code=422, detail="Credential document is required")
        content_type = getattr(upload, "content_type", "") or ""
        if content_type not in CREDENTIAL_TYPES:
            raise HTTPException(status_code=415, detail="Credential must be a PDF, JPG, or PNG file")
        raw_name = Path(getattr(upload, "filename", "credential") or "credential")
        if raw_name.suffix.lower() != CREDENTIAL_TYPES[content_type]:
            raise HTTPException(status_code=415, detail="Credential file extension does not match its type")
        data = await upload.read(MAX_CREDENTIAL_BYTES + 1)
        if len(data) > MAX_CREDENTIAL_BYTES:
            raise HTTPException(status_code=413, detail="Credential file exceeds the 10 MB limit")
        credential = (raw_name.name, content_type, data)
    else:
        try:
            payload = DoctorRegistration.model_validate(await request.json())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Registration payload is invalid") from exc
    email = payload.email.strip().lower()
    settings = get_settings()
    if settings.mongodb_enabled:
        if not mongo_database.enabled:
            raise HTTPException(status_code=503, detail="MongoDB is enabled but not connected")
        tenant_id = settings.default_tenant_id
        db = mongo_database.database()
        if await db["doctors"].find_one({"tenant_id": tenant_id, "registration_number": payload.registration_number.strip()}):
            raise HTTPException(status_code=409, detail="This professional registration number is already registered.")
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
        credential_path = None
        credential_meta = None
        if credential:
            filename, content_type, data = credential
            credential_path = PRIVATE_CREDENTIAL_ROOT / tenant_id / f"{user_id}{CREDENTIAL_TYPES[content_type]}"
            credential_path.parent.mkdir(parents=True, exist_ok=True)
            credential_path.write_bytes(data)
            credential_meta = {
                "doctor_id": user_id,
                "tenant_id": tenant_id,
                "registration_number": payload.registration_number.strip(),
                "storage_key": str(credential_path.relative_to(PRIVATE_CREDENTIAL_ROOT)),
                "file_name": filename,
                "content_type": content_type,
                "size_bytes": len(data),
                "status": "pending_verification",
                "created_at": now,
                "uploaded_at": now,
                "uploaded_by": user_id,
            }
        try:
            await db["users"].insert_one(user)
            await db["doctors"].insert_one(doctor)
            if credential_meta:
                await db["doctor_credentials"].insert_one(credential_meta)
            await db["recovery_tokens"].insert_one({
                "id": str(uuid4()), "user_id": user_id, "token_hash": token_hash(code),
                "expires_at": otp_expiry(now), "used_at": None, "attempts": 0,
            })
            await send_verification_email(email, code)
        except DuplicateKeyError:
            if credential_path and credential_path.is_file():
                credential_path.unlink()
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
    if credential:
        raise HTTPException(status_code=503, detail="Credential storage is unavailable for this database backend")
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
        credential = await db["doctor_credentials"].find_one({"tenant_id": settings.default_tenant_id, "doctor_id": str(doctor_id)})
        if not credential or not credential.get("storage_key"):
            raise HTTPException(status_code=409, detail="Credential document must be uploaded before approval.")
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
                    "approval_decided_by": str(principal.user_id),
                    "approval_decided_at": datetime.now(UTC),
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        await db["audit_logs"].insert_one({"id": str(uuid4()), "tenant_id": settings.default_tenant_id, "actor_id": str(principal.user_id), "action": "doctor.approval", "resource_type": "doctor", "resource_id": str(doctor_id), "purpose": "credential verification", "metadata": {"decision": "approved"}, "occurred_at": datetime.now(UTC)})
        await db["doctor_credentials"].update_one({"tenant_id": settings.default_tenant_id, "doctor_id": str(doctor_id)}, {"$set": {"status": "approved", "reviewed_by": str(principal.user_id), "reviewed_at": datetime.now(UTC)}})
        return {"status": "approved", "doctor_id": str(doctor_id)}

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    raise HTTPException(status_code=409, detail="Credential document must be uploaded before approval.")
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


@router.get("/{doctor_id}/credentials")
async def get_doctor_credentials(doctor_id: str, request: Request):
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if principal.user_id != str(doctor_id) and "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Credential storage is unavailable for this database backend")
    document = await mongo_database.database()["doctor_credentials"].find_one({
        "tenant_id": settings.default_tenant_id,
        "doctor_id": str(doctor_id),
    })
    if not document:
        raise HTTPException(status_code=404, detail="Credential document not found")
    path = (PRIVATE_CREDENTIAL_ROOT / document["storage_key"]).resolve()
    if PRIVATE_CREDENTIAL_ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Credential content is unavailable")
    return FileResponse(path, media_type=document["content_type"], filename=document["file_name"], content_disposition_type="attachment")


@router.post("/{doctor_id}/credentials")
async def upload_doctor_credentials(doctor_id: str, request: Request):
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if principal.user_id != str(doctor_id) and "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Credential storage is unavailable for this database backend")
    form = await request.form()
    upload = form.get("credential_document")
    if upload is None or not hasattr(upload, "read"):
        raise HTTPException(status_code=422, detail="Credential document is required")
    content_type = getattr(upload, "content_type", "") or ""
    if content_type not in CREDENTIAL_TYPES:
        raise HTTPException(status_code=415, detail="Credential must be a PDF, JPG, or PNG file")
    raw_name = Path(getattr(upload, "filename", "credential") or "credential")
    if raw_name.suffix.lower() != CREDENTIAL_TYPES[content_type]:
        raise HTTPException(status_code=415, detail="Credential file extension does not match its type")
    data = await upload.read(MAX_CREDENTIAL_BYTES + 1)
    if len(data) > MAX_CREDENTIAL_BYTES:
        raise HTTPException(status_code=413, detail="Credential file exceeds the 10 MB limit")
    db = mongo_database.database()
    doctor = await db["doctors"].find_one({"tenant_id": settings.default_tenant_id, "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}]})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    now = datetime.now(UTC)
    path = PRIVATE_CREDENTIAL_ROOT / settings.default_tenant_id / f"{doctor.get('id') or doctor.get('user_id')}{CREDENTIAL_TYPES[content_type]}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    await db["doctor_credentials"].update_one(
        {"tenant_id": settings.default_tenant_id, "doctor_id": str(doctor.get("id") or doctor.get("user_id"))},
        {"$set": {"registration_number": doctor.get("registration_number"), "storage_key": str(path.relative_to(PRIVATE_CREDENTIAL_ROOT)), "file_name": raw_name.name, "content_type": content_type, "size_bytes": len(data), "status": "pending_verification", "created_at": now, "uploaded_at": now, "uploaded_by": str(principal.user_id)}},
        upsert=True,
    )
    return {"status": "stored", "doctor_id": str(doctor.get("id") or doctor.get("user_id")), "file_name": raw_name.name, "uploaded_at": now, "approval_status": doctor.get("approval_status", "pending")}


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
                    "approval_decided_by": str(principal.user_id),
                    "approval_decided_at": datetime.now(UTC),
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        await db["audit_logs"].insert_one({"id": str(uuid4()), "tenant_id": settings.default_tenant_id, "actor_id": str(principal.user_id), "action": "doctor.approval", "resource_type": "doctor", "resource_id": str(doctor_id), "purpose": "credential verification", "metadata": {"decision": "rejected"}, "occurred_at": datetime.now(UTC)})
        await db["doctor_credentials"].update_one({"tenant_id": settings.default_tenant_id, "doctor_id": str(doctor_id)}, {"$set": {"status": "rejected", "reviewed_by": str(principal.user_id), "reviewed_at": datetime.now(UTC)}})
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
async def enroll_mfa(session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:profile:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        user = await db["users"].find_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id), "role": "doctor"})
        if user is None:
            raise HTTPException(status_code=404, detail="Doctor account not found")
        secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
        recovery_codes = [secrets.token_urlsafe(8) for _ in range(8)]
        await db["users"].update_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)}, {"$set": {"mfa_secret": secret, "mfa_recovery_codes": recovery_codes, "mfa_enabled": False}})
        return {"secret": secret, "recovery_codes": recovery_codes}
    if session is None:
        raise HTTPException(status_code=503, detail="Application database is unavailable")
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    user.mfa_secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
    user.mfa_recovery_codes = [secrets.token_urlsafe(8) for _ in range(8)]
    return {"secret": user.mfa_secret, "recovery_codes": user.mfa_recovery_codes}


@router.post("/mfa/verify")
async def verify_mfa(payload: MfaCode, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:profile:write"))):
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        user = await db["users"].find_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id), "role": "doctor"})
        secret = user.get("mfa_secret") if user else None
        if user is None or not secret or not any(hmac.compare_digest(_totp(secret, int(time.time() // 30) + offset), payload.code) for offset in (-1, 0, 1)):
            raise HTTPException(status_code=400, detail="Invalid MFA code")
        await db["users"].update_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)}, {"$set": {"mfa_enabled": True}})
        return {"status": "enabled"}
    if session is None:
        raise HTTPException(status_code=503, detail="Application database is unavailable")
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None or not user.mfa_secret or not any(hmac.compare_digest(_totp(user.mfa_secret, int(time.time() // 30) + offset), payload.code) for offset in (-1, 0, 1)):
        raise HTTPException(status_code=400, detail="Invalid MFA code")
    user.mfa_enabled = True
    return {"status": "enabled"}
