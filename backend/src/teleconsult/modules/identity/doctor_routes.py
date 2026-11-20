import base64
import binascii
import hashlib
import hmac
import secrets
import struct
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import re
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
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
ALLOWED_CREDENTIAL_EXTENSIONS = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
}
MAX_CREDENTIAL_BYTES = 10 * 1024 * 1024
PRIVATE_CREDENTIAL_ROOT = Path(__file__).resolve().parents[4] / "private_storage" / "credentials"

DOCUMENT_DEFINITIONS = {
    "medical_council_certificate": {
        "title": "Medical Council Registration Certificate",
        "mandatory": True,
        "aliases": ["credential_document", "council_certificate"],
    },
    "qualification_certificate": {
        "title": "Recognized Medical Qualification Certificate (MBBS / Applicable)",
        "mandatory": True,
        "aliases": ["mbbs_certificate", "degree_certificate"],
    },
    "identity_proof": {
        "title": "Government-Issued Identity Proof",
        "mandatory": True,
        "aliases": ["id_proof", "govt_id"],
    },
    "specialty_certificate": {
        "title": "Postgraduate / Specialty Certificate",
        "mandatory": False,
        "aliases": ["pg_certificate"],
    },
    "renewal_proof": {
        "title": "Registration Renewal Proof",
        "mandatory": False,
        "aliases": ["renewal_certificate"],
    },
    "clinic_authorization": {
        "title": "Clinic Authorization Letter",
        "mandatory": False,
        "aliases": ["authorization_letter"],
    },
    "indemnity_insurance": {
        "title": "Professional Indemnity Insurance Policy",
        "mandatory": False,
        "aliases": ["insurance_policy"],
    },
}


def generate_verification_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_expiry(now: datetime) -> datetime:
    return now + timedelta(minutes=OTP_EXPIRY_MINUTES)


class DoctorRegistration(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str
    mobile_number: str = Field(min_length=7, max_length=32)
    date_of_birth: str | None = Field(default=None, max_length=30)
    gender: str | None = Field(default=None, max_length=50)
    state: str | None = Field(default=None, max_length=100)
    state_of_practice: str | None = Field(default=None, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    specialty: str = Field(default="General Medicine", max_length=120)
    clinic_name: str = Field(default="Kaizen Care Telehealth", max_length=180)
    registration_number: str = Field(min_length=2, max_length=64)
    medical_council: str | None = Field(default=None, max_length=160)
    qualifications: list[str] = Field(default_factory=list, max_length=20)
    experience_years: int = Field(default=0, ge=0, le=80)
    languages: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile_number(cls, v: str) -> str:
        clean = re.sub(r"[\s()\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("0") or clean.startswith("+"):
            clean = clean[1:]
        if not (len(clean) == 10 and clean.isdigit()):
            raise ValueError("Mobile number must be exactly 10 digits")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: str | None) -> str | None:
        if not v:
            return None
        v_str = str(v).strip()
        try:
            dob = datetime.strptime(v_str, "%Y-%m-%d").date()
            today = datetime.now(UTC).date()
            age = (today - dob).days // 365
            if age < 21:
                raise ValueError("Doctor must be at least 21 years of age")
            if age > 100:
                raise ValueError("Invalid date of birth")
        except ValueError as e:
            if "at least 21" in str(e) or "Invalid date of birth" in str(e):
                raise e
            raise ValueError("Date of birth must be in YYYY-MM-DD format") from e
        return v_str


class MfaCode(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def _totp(secret: str, counter: int | None = None) -> str:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8), casefold=True)
    raw = struct.pack(">Q", int(time.time() // 30) if counter is None else counter)
    digest = hmac.new(key, raw, hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000).zfill(6)


def _mfa_expired(value) -> bool:
    if not value:
        return False
    try:
        expiry = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=UTC)
        return expiry <= datetime.now(UTC)
    except (TypeError, ValueError, OverflowError):
        return True


def _valid_mfa_code(secret: str | None, code: str) -> bool:
    if not secret:
        return False
    try:
        return any(hmac.compare_digest(_totp(secret, int(time.time() // 30) + offset), code) for offset in (-1, 0, 1))
    except (ValueError, TypeError, binascii.Error):
        return False


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_doctor(
    request: Request,
    session: AsyncSession | None = Depends(auth_database_session),
):
    uploaded_docs = []  # list of tuples: (doc_type, doc_title, filename, content_type, data)
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        values = {}
        for key in DoctorRegistration.model_fields:
            val = form.get(key)
            if val is not None:
                values[key] = val
        if "state" not in values and "state_of_practice" in values:
            values["state"] = values["state_of_practice"]
        elif "state_of_practice" not in values and "state" in values:
            values["state_of_practice"] = values["state"]
        values["qualifications"] = [v.strip() for v in str(values.get("qualifications") or "").split(",") if v.strip()]
        values["languages"] = [v.strip() for v in str(values.get("languages") or "").split(",") if v.strip()]
        payload = DoctorRegistration.model_validate(values)

        found_types = set()
        for doc_type, meta in DOCUMENT_DEFINITIONS.items():
            field_names = [doc_type] + meta["aliases"]
            upload = None
            for fname in field_names:
                fval = form.get(fname)
                if fval is not None and hasattr(fval, "read") and getattr(fval, "filename", None):
                    upload = fval
                    break
            if upload is not None and getattr(upload, "filename", None):
                content_type = getattr(upload, "content_type", "") or ""
                if content_type not in ALLOWED_CREDENTIAL_EXTENSIONS:
                    raise HTTPException(status_code=415, detail=f"{meta['title']} must be a PDF, JPG, or PNG file")
                raw_name = Path(getattr(upload, "filename", doc_type) or doc_type)
                if raw_name.suffix.lower() not in ALLOWED_CREDENTIAL_EXTENSIONS[content_type]:
                    raise HTTPException(status_code=415, detail=f"{meta['title']} file extension does not match its type")
                data = await upload.read(MAX_CREDENTIAL_BYTES + 1)
                if len(data) > MAX_CREDENTIAL_BYTES:
                    raise HTTPException(status_code=413, detail=f"{meta['title']} exceeds the 10 MB limit")
                if len(data) > 0:
                    found_types.add(doc_type)
                    uploaded_docs.append((doc_type, meta["title"], raw_name.name, content_type, data))

        # Check for mandatory council certificate
        if "medical_council_certificate" not in found_types:
            raise HTTPException(status_code=422, detail="Medical council registration certificate is required")
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
            "date_of_birth": payload.date_of_birth,
            "gender": payload.gender,
            "state_of_practice": payload.state_of_practice or payload.state,
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
            "medical_council": payload.medical_council,
            "state": payload.state or payload.state_of_practice,
            "state_of_practice": payload.state_of_practice or payload.state,
            "date_of_birth": payload.date_of_birth,
            "gender": payload.gender,
            "qualifications": payload.qualifications,
            "experience_years": payload.experience_years,
            "languages": payload.languages,
            "supported_languages": payload.languages,
            "active": False,
            "approved_for_consultation": False,
            "approval_status": "pending",
            "approval_reason": None,
            "rejection_reason": None,
            "created_at": now,
        }
        code = generate_verification_otp()
        created_file_paths = []
        credential_metas = []

        for doc_type, doc_title, filename, content_type, data in uploaded_docs:
            doc_id = str(uuid4())
            rel_path = f"{tenant_id}/{user_id}_{doc_type}{CREDENTIAL_TYPES[content_type]}"
            file_path = PRIVATE_CREDENTIAL_ROOT / tenant_id / f"{user_id}_{doc_type}{CREDENTIAL_TYPES[content_type]}"
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(data)
            created_file_paths.append(file_path)

            if doc_type == "medical_council_certificate":
                legacy_path = PRIVATE_CREDENTIAL_ROOT / tenant_id / f"{user_id}{CREDENTIAL_TYPES[content_type]}"
                legacy_path.write_bytes(data)
                created_file_paths.append(legacy_path)

            file_b64 = base64.b64encode(data).decode('utf-8')
            credential_metas.append({
                "id": doc_id,
                "doctor_id": user_id,
                "tenant_id": tenant_id,
                "registration_number": payload.registration_number.strip(),
                "document_type": doc_type,
                "document_title": doc_title,
                "storage_key": rel_path,
                "file_name": filename,
                "content_type": content_type,
                "size_bytes": len(data),
                "file_data_base64": file_b64,
                "status": "pending_verification",
                "created_at": now,
                "uploaded_at": now,
                "uploaded_by": user_id,
            })

        try:
            await db["users"].insert_one(user)
            await db["doctors"].insert_one(doctor)
            if credential_metas:
                await db["doctor_credentials"].insert_many(credential_metas)
            await db["recovery_tokens"].insert_one({
                "id": str(uuid4()), "user_id": user_id, "token_hash": token_hash(code),
                "expires_at": otp_expiry(now), "used_at": None, "attempts": 0,
            })
            await send_verification_email(email, code)
        except DuplicateKeyError:
            for p in created_file_paths:
                if p.is_file():
                    p.unlink(missing_ok=True)
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
    if uploaded_docs:
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

    notes = "Credentials verified and approved"
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
            if isinstance(body, dict):
                notes = body.get("notes") or body.get("reason") or notes
        except Exception:
            pass

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
                    "approval_reason": notes,
                    "rejection_reason": None,
                    "approval_decided_by": str(principal.user_id),
                    "approval_decided_at": datetime.now(UTC),
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        await db["audit_logs"].insert_one({
            "id": str(uuid4()),
            "tenant_id": settings.default_tenant_id,
            "actor_id": str(principal.user_id),
            "action": "doctor.approval",
            "resource_type": "doctor",
            "resource_id": str(doctor_id),
            "purpose": "credential verification",
            "metadata": {"decision": "approved", "notes": notes},
            "occurred_at": datetime.now(UTC),
        })
        await db["doctor_credentials"].update_many(
            {
                "tenant_id": settings.default_tenant_id,
                "$or": [{"doctor_id": str(doctor_id)}],
            },
            {
                "$set": {
                    "status": "approved",
                    "reviewed_by": str(principal.user_id),
                    "reviewed_at": datetime.now(UTC),
                }
            },
        )
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

    reason = "Credentials verification rejected"
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
            if isinstance(body, dict):
                reason = body.get("reason") or body.get("notes") or reason
        except Exception:
            pass

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
                    "rejection_reason": reason,
                    "approval_decided_by": str(principal.user_id),
                    "approval_decided_at": datetime.now(UTC),
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        await db["audit_logs"].insert_one({
            "id": str(uuid4()),
            "tenant_id": settings.default_tenant_id,
            "actor_id": str(principal.user_id),
            "action": "doctor.rejection",
            "resource_type": "doctor",
            "resource_id": str(doctor_id),
            "purpose": "credential verification",
            "metadata": {"decision": "rejected", "reason": reason},
            "occurred_at": datetime.now(UTC),
        })
        await db["doctor_credentials"].update_many(
            {
                "tenant_id": settings.default_tenant_id,
                "$or": [{"doctor_id": str(doctor_id)}],
            },
            {
                "$set": {
                    "status": "rejected",
                    "reviewed_by": str(principal.user_id),
                    "reviewed_at": datetime.now(UTC),
                }
            },
        )
        return {"status": "rejected", "doctor_id": str(doctor_id), "reason": reason}

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


@router.get("/{doctor_id}/documents")
async def list_doctor_documents(doctor_id: str, request: Request):
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if principal.user_id != str(doctor_id) and "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Document storage is unavailable for this database backend")

    db = mongo_database.database()
    doctor = await db["doctors"].find_one({
        "tenant_id": settings.default_tenant_id,
        "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
    })
    doc_target_id = str(doctor.get("id") or doctor.get("user_id") or doctor_id) if doctor else str(doctor_id)

    docs = await db["doctor_credentials"].find({
        "tenant_id": settings.default_tenant_id,
        "$or": [{"doctor_id": doc_target_id}, {"doctor_id": str(doctor_id)}],
    }).to_list(100)

    return [
        {
            "id": doc.get("id") or str(doc.get("_id")),
            "doctor_id": doc.get("doctor_id"),
            "document_type": doc.get("document_type", "medical_council_certificate"),
            "document_title": doc.get("document_title") or DOCUMENT_DEFINITIONS.get(doc.get("document_type", ""), {}).get("title", "Credential Document"),
            "file_name": doc.get("file_name", "document.pdf"),
            "content_type": doc.get("content_type", "application/pdf"),
            "size_bytes": doc.get("size_bytes", 0),
            "status": doc.get("status", "pending_verification"),
            "uploaded_at": doc.get("uploaded_at") or doc.get("created_at"),
        }
        for doc in docs
    ]


@router.get("/{doctor_id}/documents/{document_type}/download")
async def download_doctor_document(doctor_id: str, document_type: str, request: Request):
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if principal.user_id != str(doctor_id) and "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Credential storage is unavailable for this database backend")

    db = mongo_database.database()
    doctor = await db["doctors"].find_one({
        "tenant_id": settings.default_tenant_id,
        "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
    })
    doc_target_id = str(doctor.get("id") or doctor.get("user_id") or doctor_id) if doctor else str(doctor_id)

    aliases = [document_type]
    for dt, dmeta in DOCUMENT_DEFINITIONS.items():
        if document_type in [dt] + dmeta["aliases"]:
            aliases = list(set([dt] + dmeta["aliases"]))
            break

    document = await db["doctor_credentials"].find_one({
        "tenant_id": settings.default_tenant_id,
        "$or": [
            {"doctor_id": doc_target_id, "document_type": {"$in": aliases}},
            {"doctor_id": str(doctor_id), "document_type": {"$in": aliases}},
            {"doctor_id": doc_target_id, "id": document_type},
            {"doctor_id": str(doctor_id), "id": document_type},
        ],
    })
    if not document:
        if "medical_council_certificate" in aliases or document_type in ("credentials", "credential"):
            document = await db["doctor_credentials"].find_one({
                "tenant_id": settings.default_tenant_id,
                "$or": [{"doctor_id": doc_target_id}, {"doctor_id": str(doctor_id)}],
            })
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_bytes = None
    path = (PRIVATE_CREDENTIAL_ROOT / document.get("storage_key", "")).resolve()
    if PRIVATE_CREDENTIAL_ROOT.resolve() in path.parents and path.is_file():
        file_bytes = path.read_bytes()
    elif document.get("file_data_base64"):
        try:
            file_bytes = base64.b64decode(document["file_data_base64"])
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(file_bytes)
        except Exception:
            pass

    if not file_bytes:
        raise HTTPException(
            status_code=404,
            detail="Document content is unavailable. Please re-upload.",
        )

    is_inline = request.query_params.get("inline") == "true"
    disposition = "inline" if is_inline else "attachment"
    safe_filename = document.get("file_name", f"{document_type}.pdf")
    content_type = document.get("content_type", "application/pdf")

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f'{disposition}; filename="{safe_filename}"'},
    )


@router.get("/{doctor_id}/credentials")
async def get_doctor_credentials(doctor_id: str, request: Request):
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if principal.user_id != str(doctor_id) and "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Credential storage is unavailable for this database backend")

    db = mongo_database.database()
    doctor = await db["doctors"].find_one({
        "tenant_id": settings.default_tenant_id,
        "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
    })
    doc_target_id = str(doctor.get("id") or doctor.get("user_id") or doctor_id) if doctor else str(doctor_id)

    document = await db["doctor_credentials"].find_one({
        "tenant_id": settings.default_tenant_id,
        "$or": [{"doctor_id": doc_target_id}, {"doctor_id": str(doctor_id)}],
    })
    if not document:
        raise HTTPException(status_code=404, detail="Credential document not found")

    file_bytes = None
    path = (PRIVATE_CREDENTIAL_ROOT / document.get("storage_key", "")).resolve()
    if PRIVATE_CREDENTIAL_ROOT.resolve() in path.parents and path.is_file():
        file_bytes = path.read_bytes()
    elif document.get("file_data_base64"):
        try:
            file_bytes = base64.b64decode(document["file_data_base64"])
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(file_bytes)
        except Exception:
            pass

    if not file_bytes:
        raise HTTPException(
            status_code=404,
            detail="Credential content is unavailable. Please re-upload the clinician's credential document.",
        )

    is_inline = request.query_params.get("inline") == "true"
    disposition = "inline" if is_inline else "attachment"
    safe_filename = document.get("file_name", "credential_document.pdf")
    content_type = document.get("content_type", "application/pdf")

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f'{disposition}; filename="{safe_filename}"'},
    )


@router.post("/{doctor_id}/documents/{document_type}")
async def upload_doctor_document(doctor_id: str, document_type: str, request: Request):
    from teleconsult.kernel.authz.policy import get_principal
    principal = await get_principal(request)
    if principal.user_id != str(doctor_id) and "clinic:doctor:read" not in principal.permissions and "clinic_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = get_settings()
    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="Credential storage is unavailable for this database backend")

    form = await request.form()
    upload = form.get("file") or form.get("document") or form.get(document_type) or form.get("credential_document")
    if upload is None or not hasattr(upload, "read"):
        raise HTTPException(status_code=422, detail="Document file is required")
    content_type = getattr(upload, "content_type", "") or ""
    if content_type not in ALLOWED_CREDENTIAL_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Document must be a PDF, JPG, or PNG file")
    raw_name = Path(getattr(upload, "filename", document_type) or document_type)
    if raw_name.suffix.lower() not in ALLOWED_CREDENTIAL_EXTENSIONS[content_type]:
        raise HTTPException(status_code=415, detail="Document file extension does not match its type")
    data = await upload.read(MAX_CREDENTIAL_BYTES + 1)
    if len(data) > MAX_CREDENTIAL_BYTES:
        raise HTTPException(status_code=413, detail="Document file exceeds the 10 MB limit")

    db = mongo_database.database()
    doctor = await db["doctors"].find_one({
        "tenant_id": settings.default_tenant_id,
        "$or": [{"id": str(doctor_id)}, {"user_id": str(doctor_id)}, {"user_account_id": str(doctor_id)}],
    })
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    target_id = str(doctor.get("id") or doctor.get("user_id"))
    now = datetime.now(UTC)
    rel_path = f"{settings.default_tenant_id}/{target_id}_{document_type}{CREDENTIAL_TYPES[content_type]}"
    path = PRIVATE_CREDENTIAL_ROOT / settings.default_tenant_id / f"{target_id}_{document_type}{CREDENTIAL_TYPES[content_type]}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    file_b64 = base64.b64encode(data).decode('utf-8')

    doc_title = DOCUMENT_DEFINITIONS.get(document_type, {}).get("title", document_type.replace("_", " ").title())

    aliases = [document_type]
    if document_type in DOCUMENT_DEFINITIONS:
        aliases = list(set([document_type] + DOCUMENT_DEFINITIONS[document_type]["aliases"]))

    await db["doctor_credentials"].update_one(
        {
            "tenant_id": settings.default_tenant_id,
            "$or": [{"doctor_id": target_id}, {"doctor_id": str(doctor_id)}],
            "document_type": {"$in": aliases},
        },
        {"$set": {
            "doctor_id": target_id,
            "registration_number": doctor.get("registration_number"),
            "document_type": document_type,
            "document_title": doc_title,
            "storage_key": rel_path,
            "file_name": raw_name.name,
            "content_type": content_type,
            "size_bytes": len(data),
            "file_data_base64": file_b64,
            "status": "pending_verification",
            "created_at": now,
            "uploaded_at": now,
            "uploaded_by": str(principal.user_id),
        }},
        upsert=True,
    )
    return {
        "status": "stored",
        "doctor_id": target_id,
        "document_type": document_type,
        "document_title": doc_title,
        "file_name": raw_name.name,
        "uploaded_at": now,
        "approval_status": doctor.get("approval_status", "pending"),
    }


@router.post("/{doctor_id}/credentials")
async def upload_doctor_credentials(doctor_id: str, request: Request):
    return await upload_doctor_document(doctor_id=doctor_id, document_type="medical_council_certificate", request=request)


@router.post("/mfa/enroll")
async def enroll_mfa(response: Response, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:profile:write"))):
    response.headers["Cache-Control"] = "no-store"
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        user = await db["users"].find_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id), "role": "doctor"})
        if user is None:
            raise HTTPException(status_code=404, detail="Doctor account not found")
        secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
        await db["users"].update_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)}, {"$set": {"mfa_secret": secret, "mfa_recovery_code_hashes": [], "mfa_enabled": False, "mfa_enrollment_expires_at": datetime.now(UTC) + timedelta(minutes=10), "mfa_last_counter": None, "mfa_failed_attempts": 0}})
        return {"secret": secret, "otpauth_uri": f"otpauth://totp/Kaizentrix%20Care?secret={secret}&issuer=Kaizentrix%20Care", "expires_in_minutes": 10}
    if session is None:
        raise HTTPException(status_code=503, detail="Application database is unavailable")
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    user.mfa_secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
    user.mfa_recovery_codes = []
    return {"secret": user.mfa_secret, "otpauth_uri": f"otpauth://totp/Kaizentrix%20Care?secret={user.mfa_secret}&issuer=Kaizentrix%20Care", "expires_in_minutes": 10}


@router.post("/mfa/verify")
async def verify_mfa(payload: MfaCode, response: Response, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:profile:write"))):
    response.headers["Cache-Control"] = "no-store"
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        user = await db["users"].find_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id), "role": "doctor"})
        secret = user.get("mfa_secret") if user else None
        if user is None or _mfa_expired(user.get("mfa_enrollment_expires_at")) or user.get("mfa_failed_attempts", 0) >= 5 or not _valid_mfa_code(secret, payload.code):
            if user:
                await db["users"].update_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)}, {"$inc": {"mfa_failed_attempts": 1}})
            raise HTTPException(status_code=400, detail="Invalid MFA code")
        recovery_codes = [secrets.token_urlsafe(8) for _ in range(8)]
        await db["users"].update_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)}, {"$set": {"mfa_enabled": True, "mfa_recovery_code_hashes": [hashlib.sha256(code.encode()).hexdigest() for code in recovery_codes], "mfa_enrollment_expires_at": None, "mfa_failed_attempts": 0, "mfa_last_counter": int(time.time() // 30)}})
        return {"status": "enabled", "recovery_codes": recovery_codes}
    if session is None:
        raise HTTPException(status_code=503, detail="Application database is unavailable")
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None or not _valid_mfa_code(user.mfa_secret if user else None, payload.code):
        raise HTTPException(status_code=400, detail="Invalid MFA code")
    recovery_codes = [secrets.token_urlsafe(8) for _ in range(8)]
    user.mfa_recovery_codes = recovery_codes
    user.mfa_enabled = True
    return {"status": "enabled", "recovery_codes": recovery_codes}


@router.post("/mfa/enroll/cancel")
async def cancel_mfa_enrollment(response: Response, session: AsyncSession | None = Depends(auth_database_session), principal: Principal = Depends(require("doctor:profile:write"))):
    response.headers["Cache-Control"] = "no-store"
    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        user = await db["users"].find_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id), "role": "doctor"})
        if user is None:
            raise HTTPException(status_code=404, detail="Doctor account not found")
        if user.get("mfa_enabled"):
            raise HTTPException(status_code=409, detail="Active MFA must be reset through reauthentication")
        await db["users"].update_one({"tenant_id": str(principal.tenant_id), "id": str(principal.user_id), "mfa_enabled": {"$ne": True}}, {"$set": {"mfa_secret": None, "mfa_enrollment_expires_at": None, "mfa_failed_attempts": 0}})
        return {"status": "cancelled"}
    if session is None:
        raise HTTPException(status_code=503, detail="Application database is unavailable")
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    if user.mfa_enabled:
        raise HTTPException(status_code=409, detail="Active MFA must be reset through reauthentication")
    user.mfa_secret = None
    user.mfa_recovery_codes = []
    return {"status": "cancelled"}
