import base64
import hashlib
import hmac
import logging
import secrets
import struct
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.adapters.email.templates import (
    render_recovery_email_html,
    render_verification_email_html,
)
from teleconsult.config.settings import get_settings
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.models import AuthSession, RecoveryToken, UserAccount
from teleconsult.modules.identity.schemas import (
    LoginRequest,
    RecoveryRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from teleconsult.modules.patient_portal.consent import PatientConsent
from teleconsult.modules.patient_portal.models import Doctor, Patient

router = APIRouter(prefix="/auth", tags=["authentication"])
GENERIC_AUTH_ERROR = "Unable to authenticate with those details"


def session_cookie_options() -> dict[str, object]:
    """Use a cross-site cookie in production for the Vercel-to-Render deployment."""
    secure = get_settings().environment not in {"dev", "local"}
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "none" if secure else "lax",
        "max_age": 8 * 3600,
        "path": "/",
    }


async def auth_database_session() -> AsyncIterator[AsyncSession | None]:
    """Use SQL only when MongoDB is disabled and PostgreSQL database_url is explicitly configured."""
    settings = get_settings()
    if settings.mongodb_enabled or not settings.database_url.strip():
        yield None
        return
    async for session in tenant_session():
        yield session


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return f"pbkdf2_sha256$210000${salt.hex()}${derived.hex()}"


def password_matches(password: str, encoded: str) -> bool:
    try:
        _, rounds, salt, expected = encoded.split("$")
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def valid_totp(secret: str, code: str) -> bool:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8), casefold=True)
    for counter in range(int(datetime.now(UTC).timestamp()) // 30 - 1, int(datetime.now(UTC).timestamp()) // 30 + 2):
        digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
        offset = digest[-1] & 15
        expected = str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000).zfill(6)
        if hmac.compare_digest(expected, code):
            return True
    return False


async def send_verification_email(email: str, code: str) -> None:
    html = render_verification_email_html(code)
    await send_brevo_email(
        email,
        "Verify your Kaizentrix Care account",
        f"Your verification code is {code}. It expires in 5 minutes.",
        html_content=html,
    )


async def send_recovery_email(email: str, token: str) -> None:
    html = render_recovery_email_html(token)
    await send_brevo_email(
        email,
        "Reset your Kaizentrix Care password",
        f"Use this password reset token within 15 minutes: {token}",
        html_content=html,
    )


async def _rollback_mongodb_registration(database: Any, user_id: str) -> None:
    """Remove documents created by a registration attempt that did not complete."""
    try:
        await database["recovery_tokens"].delete_many({"user_id": user_id})
        await database["consents"].delete_many({"patient_id": user_id})
        await database["patients"].delete_many(
            {"$or": [{"user_id": user_id}, {"id": user_id}]}
        )
        await database["users"].delete_one({"id": user_id})
    except Exception:
        logging.getLogger("teleconsult.auth").exception(
            "Could not fully roll back failed registration for user %s", user_id
        )


async def send_brevo_email(
    email: str, subject: str, text: str, html_content: str | None = None
) -> None:
    settings = get_settings()
    sender = settings.brevo_sender_email or settings.email_from
    if not settings.brevo_api_key or not sender:
        raise HTTPException(status_code=503, detail="Brevo email delivery is not configured")
    import aiohttp
    payload = {
        "sender": {"name": settings.brevo_sender_name, "email": sender},
        "to": [{"email": email}],
        "subject": subject,
        "textContent": text,
    }
    if html_content:
        payload["htmlContent"] = html_content

    timeout = aiohttp.ClientTimeout(total=15)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as client:
            async with client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "accept": "application/json",
                    "api-key": settings.brevo_api_key,
                    "content-type": "application/json",
                },
                json=payload,
            ) as result:
                if result.status >= 400:
                    raise HTTPException(status_code=503, detail="Verification email could not be delivered")
    except (aiohttp.ClientError, TimeoutError):
        logging.getLogger("teleconsult.auth").exception("Brevo email request failed")
        raise HTTPException(
            status_code=503,
            detail="Verification email service is temporarily unavailable; please retry",
        ) from None


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, session: AsyncSession | None = Depends(auth_database_session)) -> dict[str, str]:
    if payload.full_name.strip() != payload.full_name or len(payload.full_name.strip()) < 2:
        raise HTTPException(status_code=422, detail="Enter a valid full name")
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=422, detail="Passwords do not match")
    if not payload.terms_accepted:
        raise HTTPException(status_code=422, detail="Terms and privacy acknowledgment is required")
    email = payload.email.strip().lower()

    settings = get_settings()
    if settings.mongodb_enabled:
        if not mongo_database.enabled:
            raise HTTPException(status_code=503, detail="MongoDB is enabled but not connected")
        if not settings.brevo_api_key or not (settings.brevo_sender_email or settings.email_from):
            raise HTTPException(status_code=503, detail="Email delivery is not configured")
        from uuid import uuid4

        from pymongo.errors import DuplicateKeyError

        database = mongo_database.database()
        existing_user = await database["users"].find_one(
            {"tenant_id": settings.default_tenant_id, "email": email}
        )
        if existing_user and existing_user.get("verified_at") is None:
            now = datetime.now(UTC)
            code = f"{secrets.randbelow(1_000_000):06d}"
            token_id = str(uuid4())
            await database["recovery_tokens"].insert_one(
                {
                    "id": token_id,
                    "user_id": existing_user["id"],
                    "token_hash": token_hash(code),
                    "expires_at": now + timedelta(minutes=10),
                    "used_at": None,
                    "attempts": 0,
                    "created_at": now,
                }
            )
            try:
                await send_verification_email(email, code)
            except HTTPException:
                await database["recovery_tokens"].delete_one({"id": token_id})
                raise
            return {
                "status": "verification_required",
                "user_id": existing_user["id"],
                "email": email,
            }
        if existing_user:
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
        user_id = str(uuid4())
        now = datetime.now(UTC)
        code = f"{secrets.randbelow(1_000_000):06d}"
        user = {
            "id": user_id,
            "tenant_id": settings.default_tenant_id,
            "full_name": payload.full_name.strip(),
            "email": email,
            "mobile_number": payload.mobile_number,
            "password_hash": password_hash(payload.password),
            "terms_version": payload.terms_version,
            "terms_accepted_at": now,
            "verified_at": None,
            "role": "patient",
            "mfa_enabled": False,
            "created_at": now,
        }
        registration_stage = "user"
        try:
            await database["users"].insert_one(user)
            registration_stage = "patient"
            await database["patients"].insert_one({
                "id": user_id, "user_id": user_id, "tenant_id": settings.default_tenant_id,
                "full_name": user["full_name"], "email": email,
                "phone": payload.mobile_number, "created_at": now,
            })
            registration_stage = "consent"
            await database["consents"].insert_one({
                "id": str(uuid4()), "tenant_id": settings.default_tenant_id,
                "patient_id": user_id, "consent_type": "registration_terms",
                "version": payload.terms_version, "created_at": now,
            })
            registration_stage = "verification_token"
            await database["recovery_tokens"].insert_one({
                "id": str(uuid4()), "user_id": user_id,
                "token_hash": token_hash(code),
                "expires_at": now + timedelta(minutes=10), "used_at": None,
                "attempts": 0, "created_at": now,
            })
            registration_stage = "verification_email"
            await send_verification_email(email, code)
        except DuplicateKeyError:
            await _rollback_mongodb_registration(database, user_id)
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.") from None
        except HTTPException:
            await _rollback_mongodb_registration(database, user_id)
            raise
        except Exception:
            logging.getLogger("teleconsult.auth").exception(
                "Patient registration failed during %s", registration_stage
            )
            await _rollback_mongodb_registration(database, user_id)
            raise HTTPException(
                status_code=503,
                detail=f"Registration service is temporarily unavailable during {registration_stage}; please retry",
            ) from None
        return {"status": "verification_required", "user_id": user_id, "email": email}

    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    existing = await session.scalar(select(UserAccount.id).where(UserAccount.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
    tenant_id = UUID(get_settings().default_tenant_id)
    user = UserAccount(
        tenant_id=tenant_id,
        full_name=payload.full_name.strip(),
        email=email,
        mobile_number=payload.mobile_number,
        password_hash=password_hash(payload.password),
        terms_version=payload.terms_version,
        terms_accepted_at=datetime.now(UTC),
        verified_at=None
    )
    session.add(user)
    await session.flush()

    patient = await session.get(Patient, user.id)
    if patient is None:
        patient = Patient(
            id=user.id,
            tenant_id=tenant_id,
            full_name=user.full_name,
            email=user.email,
            phone=user.mobile_number,
        )
        session.add(patient)
        await session.flush()
    session.add(PatientConsent(
        tenant_id=tenant_id,
        patient_id=user.id,
        consent_type="registration_terms",
        version=payload.terms_version,
    ))

    code = f"{secrets.randbelow(1_000_000):06d}"
    session.add(RecoveryToken(user_id=user.id, token_hash=token_hash(code), expires_at=datetime.now(UTC) + timedelta(minutes=10)))
    await send_verification_email(user.email, code)
    return {"status": "verification_required", "user_id": str(user.id), "email": user.email}


@router.post("/login")
async def login(payload: LoginRequest, response: Response, session: AsyncSession | None = Depends(auth_database_session)) -> dict[str, str]:
    settings = get_settings()
    if settings.mongodb_enabled:
        if not mongo_database.enabled:
            raise HTTPException(status_code=503, detail="MongoDB is enabled but not connected")
        database = mongo_database.database()
        user = await database["users"].find_one({
            "tenant_id": settings.default_tenant_id,
            "email": payload.email.strip().lower(),
        })
        if user is None or not password_matches(payload.password, user.get("password_hash", "")):
            raise HTTPException(status_code=401, detail=GENERIC_AUTH_ERROR)
        restricted_until = user.get("restricted_until")
        if restricted_until and restricted_until > datetime.now(UTC):
            raise HTTPException(status_code=423, detail="Account temporarily restricted; try again later")
        if user.get("verified_at") is None:
            raise HTTPException(status_code=403, detail="Email verification is required before sign in")
        if user.get("role") == "doctor" and user.get("mfa_enabled"):
            secret = user.get("mfa_secret")
            if not payload.mfa_code or not secret or not valid_totp(secret, payload.mfa_code):
                raise HTTPException(status_code=401, detail="MFA verification is required")
        now = datetime.now(UTC)
        raw_token = secrets.token_urlsafe(48)
        await database["user_sessions"].insert_one({
            "id": secrets.token_hex(16), "tenant_id": settings.default_tenant_id,
            "user_id": user["id"], "token_hash": token_hash(raw_token),
            "expires_at": now + timedelta(hours=8),
            "mfa_verified": bool(user.get("role") != "doctor" or not user.get("mfa_enabled") or payload.mfa_code),
            "created_at": now,
        })
        response.set_cookie("teleconsult_session", raw_token, **session_cookie_options())
        return {
            "status": "authenticated", "user_id": user["id"],
            "full_name": user.get("full_name", "User"), "email": user.get("email", ""),
            "role": user.get("role", "patient"),
        }
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    user = await session.scalar(select(UserAccount).where(UserAccount.email == payload.email.strip().lower()))
    if user is None or not password_matches(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail=GENERIC_AUTH_ERROR)
    if user.restricted_until and user.restricted_until > datetime.now(UTC):
        raise HTTPException(status_code=423, detail="Account temporarily restricted; try again later")
    if user.verified_at is None:
        raise HTTPException(status_code=403, detail="Email verification is required before sign in")
    if user.role == "doctor" and user.mfa_enabled and (not payload.mfa_code or not user.mfa_secret or not valid_totp(user.mfa_secret, payload.mfa_code)):
        raise HTTPException(status_code=401, detail="MFA verification is required")
    patient = await session.get(Patient, user.id)
    if patient is None:
        patient = Patient(
            id=user.id,
            tenant_id=user.tenant_id,
            full_name=user.full_name,
            email=user.email,
            phone=user.mobile_number,
        )
        session.add(patient)
        await session.flush()

    raw_token = secrets.token_urlsafe(48)
    session.add(AuthSession(user_id=user.id, token_hash=token_hash(raw_token), expires_at=datetime.now(UTC) + timedelta(hours=8), mfa_verified=bool(user.role != "doctor" or not user.mfa_enabled or payload.mfa_code)))
    response.set_cookie("teleconsult_session", raw_token, **session_cookie_options())
    return {"status": "authenticated", "user_id": str(user.id), "full_name": user.full_name, "email": user.email, "role": user.role}


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, response: Response, session: AsyncSession | None = Depends(auth_database_session)) -> dict[str, str]:
    settings = get_settings()
    if settings.mongodb_enabled:
        if not mongo_database.enabled:
            raise HTTPException(status_code=503, detail="MongoDB is enabled but not connected")
        database = mongo_database.database()
        email = payload.email.strip().lower()
        user = await database["users"].find_one({"tenant_id": settings.default_tenant_id, "email": email})
        token = await database["recovery_tokens"].find_one({
            "user_id": user["id"] if user else None,
            "used_at": None,
            "expires_at": {"$gt": datetime.now(UTC)},
        }, sort=[("created_at", -1)])
        if user is None or token is None or token.get("attempts", 0) >= 5:
            raise HTTPException(status_code=400, detail="Invalid or expired verification code")
        if not hmac.compare_digest(token.get("token_hash", ""), token_hash(payload.code)):
            await database["recovery_tokens"].update_one({"_id": token["_id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(status_code=400, detail="Invalid verification code")
        now = datetime.now(UTC)
        await database["recovery_tokens"].update_one({"_id": token["_id"]}, {"$set": {"used_at": now}})
        await database["users"].update_one({"_id": user["_id"]}, {"$set": {"verified_at": now}})
        raw_token = secrets.token_urlsafe(48)
        await database["user_sessions"].insert_one({
            "id": secrets.token_hex(16), "tenant_id": settings.default_tenant_id,
            "user_id": user["id"], "token_hash": token_hash(raw_token),
            "expires_at": now + timedelta(hours=8), "mfa_verified": False,
            "created_at": now,
        })
        response.set_cookie("teleconsult_session", raw_token, **session_cookie_options())
        doctor = await database["doctors"].find_one({"tenant_id": settings.default_tenant_id, "$or": [{"id": user["id"]}, {"user_id": user["id"]}]}) if user.get("role") == "doctor" else None
        return {"status": "authenticated", "user_id": user["id"], "full_name": user["full_name"], "email": user["email"], "approval_status": doctor.get("approval_status", "pending") if doctor else "approved"}
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    user = await session.scalar(select(UserAccount).where(UserAccount.email == payload.email.strip().lower()))
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    token = await session.scalar(select(RecoveryToken).where(
        RecoveryToken.user_id == user.id,
        RecoveryToken.used_at.is_(None),
        RecoveryToken.expires_at > datetime.now(UTC),
    ).order_by(RecoveryToken.created_at.desc()))
    if token is None or token.attempts >= 5:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    if not hmac.compare_digest(token.token_hash, token_hash(payload.code)):
        token.attempts += 1
        raise HTTPException(status_code=400, detail="Invalid verification code")
    token.used_at = datetime.now(UTC)
    user.verified_at = datetime.now(UTC)
    raw_token = secrets.token_urlsafe(48)
    session.add(AuthSession(user_id=user.id, token_hash=token_hash(raw_token), expires_at=datetime.now(UTC) + timedelta(hours=8)))
    response.set_cookie("teleconsult_session", raw_token, **session_cookie_options())
    return {"status": "authenticated", "user_id": str(user.id), "full_name": user.full_name, "email": user.email}


@router.get("/me")
async def get_me(request: Request) -> dict[str, object]:
    from teleconsult.kernel.authz.policy import get_principal
    settings = get_settings()
    if not settings.database_url.strip() and not settings.mongodb_enabled:
        return {"authenticated": False}
    if settings.mongodb_enabled:
        try:
            if not mongo_database.enabled:
                return {"authenticated": False}
            raw_token = request.cookies.get("teleconsult_session")
            if not raw_token:
                return {"authenticated": False}
            database = mongo_database.database()
            session = await database["user_sessions"].find_one({
                "tenant_id": settings.default_tenant_id,
                "token_hash": token_hash(raw_token),
                "revoked_at": {"$exists": False},
                "expires_at": {"$gt": datetime.now(UTC)},
            })
            if not session:
                return {"authenticated": False}
            user = await database["users"].find_one({
                "tenant_id": settings.default_tenant_id, "id": session["user_id"]
            })
            if not user:
                return {"authenticated": False}
            approval_status = "approved"
            if user.get("role") == "doctor":
                doc = await database["doctors"].find_one({
                    "tenant_id": settings.default_tenant_id,
                    "$or": [{"id": user["id"]}, {"user_id": user["id"]}, {"user_account_id": user["id"]}]
                })
                approval_status = doc.get("approval_status", "pending") if doc else "pending"
            return {
                "authenticated": True, "user_id": user["id"],
                "tenant_id": user["tenant_id"], "full_name": user.get("full_name"),
                "email": user.get("email"), "phone": user.get("mobile_number"),
                "role": user.get("role", "patient"),
                "approval_status": approval_status,
                "email_verified": bool(user.get("verified_at")),
            }
        except Exception:
            return {"authenticated": False}
    try:
        from teleconsult.kernel.db.session import tenant_session
        async for session in tenant_session():
            principal = await get_principal(request)
            user = await session.get(UserAccount, UUID(principal.user_id))
            patient = await session.get(Patient, UUID(principal.user_id))
            approval_status = "approved"
            if user and user.role == "doctor":
                doctor = await session.scalar(select(Doctor).where(
                    Doctor.user_account_id == user.id, Doctor.tenant_id == user.tenant_id
                ))
                approval_status = doctor.approval_status if doctor else "pending"
            return {
                "authenticated": True,
                "user_id": principal.user_id,
                "tenant_id": principal.tenant_id,
                "full_name": user.full_name if user else (patient.full_name if patient else None),
                "email": user.email if user else (patient.email if patient else None),
                "phone": user.mobile_number if user else (patient.phone if patient else None),
                "role": user.role if user else "patient",
                "approval_status": approval_status,
                "email_verified": bool(user.verified_at) if user else True,
            }
    except Exception:
        return {"authenticated": False}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, session: AsyncSession | None = Depends(auth_database_session)) -> None:
    raw_token = request.cookies.get("teleconsult_session")
    if raw_token:
        if get_settings().mongodb_enabled:
            if mongo_database.enabled:
                await mongo_database.database()["user_sessions"].update_one(
                    {"token_hash": token_hash(raw_token), "tenant_id": get_settings().default_tenant_id},
                    {"$set": {"revoked_at": datetime.now(UTC)}},
                )
            response.delete_cookie(
                "teleconsult_session",
                path="/",
                secure=bool(session_cookie_options()["secure"]),
                samesite=str(session_cookie_options()["samesite"]),
            )
            return
        if session is None:
            raise HTTPException(status_code=503, detail="No application database is configured")
        auth_session = await session.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(raw_token)))
        if auth_session:
            auth_session.revoked_at = datetime.now(UTC)
    response.delete_cookie(
        "teleconsult_session",
        path="/",
        secure=bool(session_cookie_options()["secure"]),
        samesite=str(session_cookie_options()["samesite"]),
    )


@router.post("/recovery")
async def recovery(payload: RecoveryRequest, session: AsyncSession = Depends(tenant_session)) -> dict[str, str]:
    user = await session.scalar(select(UserAccount).where(UserAccount.email == payload.email.strip().lower()))
    if user:
        raw_token = secrets.token_urlsafe(32)
        session.add(RecoveryToken(user_id=user.id, token_hash=token_hash(raw_token), expires_at=datetime.now(UTC) + timedelta(minutes=15)))
        await send_recovery_email(user.email, raw_token)
    return {"status": "accepted", "message": "If the account exists, recovery instructions will be sent"}


@router.post("/recovery/reset")
async def reset_password(payload: ResetPasswordRequest, session: AsyncSession = Depends(tenant_session)) -> dict[str, str]:
    recovery = await session.scalar(select(RecoveryToken).where(RecoveryToken.token_hash == token_hash(payload.token)))
    if recovery is None or recovery.used_at or recovery.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Recovery token is invalid or expired")
    user = await session.get(UserAccount, recovery.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Recovery token is invalid or expired")
    user.password_hash = password_hash(payload.password)
    recovery.used_at = datetime.now(UTC)
    return {"status": "password_updated"}
