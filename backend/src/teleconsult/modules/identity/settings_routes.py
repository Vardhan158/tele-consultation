from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings as app_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.audit.models import AuditRecord
from teleconsult.modules.identity.auth_routes import password_hash, password_matches
from teleconsult.modules.identity.models import AuthSession, UserAccount
from teleconsult.modules.identity.settings_models import UserSettings

router = APIRouter(prefix="/patient/settings", tags=["patient-settings"])


async def settings_session() -> AsyncIterator[AsyncSession | None]:
    if app_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


class SettingsUpdate(BaseModel):
    email_reminders: bool | None = None
    sms_reminders: bool | None = None
    wellness_updates: bool | None = None
    language: str | None = Field(default=None, max_length=64)
    time_zone: str | None = Field(default=None, max_length=64)
    accessibility: dict | None = None
    privacy: dict | None = None


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    email: str | None
    mobile_number: str | None
    email_verified: bool
    password_changed_at: datetime | None
    email_reminders: bool
    sms_reminders: bool
    wellness_updates: bool
    language: str
    time_zone: str
    accessibility: dict
    privacy: dict


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=8)
    new_password: str = Field(min_length=8, max_length=128)


class SessionResponse(BaseModel):
    id: UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


async def _settings(session: AsyncSession, principal: Principal) -> UserSettings:
    current = await session.scalar(select(UserSettings).where(UserSettings.tenant_id == UUID(principal.tenant_id), UserSettings.user_id == UUID(principal.user_id)))
    if current is None:
        current = UserSettings(tenant_id=UUID(principal.tenant_id), user_id=UUID(principal.user_id))
        session.add(current)
        await session.flush()
    return current


@router.get("", response_model=SettingsResponse)
async def get_settings(session: AsyncSession | None = Depends(settings_session), principal: Principal = Depends(require("patient:profile:read"))) -> SettingsResponse:
    if app_settings().mongodb_enabled:
        database = mongo_database.database()
        user = await database["users"].find_one({"tenant_id": principal.tenant_id, "id": principal.user_id})
        settings = await database["user_settings"].find_one({"tenant_id": principal.tenant_id, "user_id": principal.user_id})
        settings = settings or {}
        return SettingsResponse(
            email=user.get("email") if user else None, mobile_number=user.get("mobile_number") if user else None,
            email_verified=bool(user and user.get("verified_at")), password_changed_at=user.get("password_changed_at") if user else None,
            email_reminders=settings.get("email_reminders", True), sms_reminders=settings.get("sms_reminders", False),
            wellness_updates=settings.get("wellness_updates", False), language=settings.get("language", "en"),
            time_zone=settings.get("time_zone", "UTC"), accessibility=settings.get("accessibility", {}),
            privacy=settings.get("privacy", {}),
        )
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    user = await session.get(UserAccount, UUID(principal.user_id))
    settings = await _settings(session, principal)
    return SettingsResponse(
        email=user.email if user else None,
        mobile_number=user.mobile_number if user else None,
        email_verified=bool(user and user.verified_at),
        password_changed_at=None,
        **{key: getattr(settings, key) for key in ("email_reminders", "sms_reminders", "wellness_updates", "language", "time_zone", "accessibility", "privacy")},
    )


@router.patch("", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate, session: AsyncSession | None = Depends(settings_session), principal: Principal = Depends(require("patient:profile:write"))) -> SettingsResponse:
    if app_settings().mongodb_enabled:
        database = mongo_database.database()
        values = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
        if values:
            await database["user_settings"].update_one(
                {"tenant_id": principal.tenant_id, "user_id": principal.user_id},
                {"$set": values, "$setOnInsert": {"tenant_id": principal.tenant_id, "user_id": principal.user_id}},
                upsert=True,
            )
        return await get_settings(None, principal)
    settings = await _settings(session, principal)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    return await get_settings(session, principal)


@router.post("/password")
async def change_password(payload: PasswordChange, session: AsyncSession | None = Depends(settings_session), principal: Principal = Depends(require("patient:profile:write"))):
    if app_settings().mongodb_enabled:
        database = mongo_database.database()
        user = await database["users"].find_one({"tenant_id": principal.tenant_id, "id": principal.user_id})
        if user is None or not password_matches(payload.current_password, user.get("password_hash", "")):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if password_matches(payload.new_password, user.get("password_hash", "")):
            raise HTTPException(status_code=400, detail="New password must be different")
        await database["users"].update_one({"tenant_id": principal.tenant_id, "id": principal.user_id}, {"$set": {"password_hash": password_hash(payload.new_password), "password_changed_at": datetime.now(UTC)}})
        await database["user_sessions"].update_many({"tenant_id": principal.tenant_id, "user_id": principal.user_id, "revoked_at": None}, {"$set": {"revoked_at": datetime.now(UTC)}})
        return {"status": "password_changed"}
    user = await session.get(UserAccount, UUID(principal.user_id))
    if user is None or not password_matches(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if password_matches(payload.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different")
    user.password_hash = password_hash(payload.new_password)
    await session.execute(update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
    session.add(AuditRecord(tenant_id=UUID(principal.tenant_id), actor_id=user.id, action="account.password_change", resource_type="user_account", resource_id=user.id, purpose="patient settings", metadata_json={}))
    return {"status": "password_changed"}


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("patient:profile:read"))):
    result = await session.scalars(select(AuthSession).where(AuthSession.user_id == UUID(principal.user_id)).order_by(AuthSession.created_at.desc()))
    return list(result)


@router.post("/sessions/{session_id}/revoke")
async def revoke_session(session_id: UUID, session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("patient:profile:write"))):
    auth_session = await session.scalar(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == UUID(principal.user_id)))
    if auth_session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    auth_session.revoked_at = datetime.now(UTC)
    return {"status": "revoked"}


@router.post("/export")
async def request_export(session: AsyncSession = Depends(tenant_session), principal: Principal = Depends(require("patient:profile:read"))):
    session.add(AuditRecord(tenant_id=UUID(principal.tenant_id), actor_id=UUID(principal.user_id), action="account.export_request", resource_type="user_account", resource_id=UUID(principal.user_id), purpose="patient data export", metadata_json={}))
    return {"status": "requested"}


@router.post("/deletion-request")
async def request_deletion(session: AsyncSession | None = Depends(settings_session), principal: Principal = Depends(require("patient:profile:write"))):
    if app_settings().mongodb_enabled:
        database = mongo_database.database()
        existing = await database["user_settings"].find_one({"tenant_id": principal.tenant_id, "user_id": principal.user_id}) or {}
        privacy = existing.get("privacy") or {}
        if (privacy.get("closure_request") or {}).get("status") == "pending":
            return {"status": "pending"}
        privacy["closure_request"] = {"status": "pending", "submitted_at": datetime.now(UTC)}
        await database["user_settings"].update_one(
            {"tenant_id": principal.tenant_id, "user_id": principal.user_id},
            {"$set": {"privacy": privacy}, "$setOnInsert": {"tenant_id": principal.tenant_id, "user_id": principal.user_id}},
            upsert=True,
        )
        return {"status": "pending"}
    session.add(AuditRecord(tenant_id=UUID(principal.tenant_id), actor_id=UUID(principal.user_id), action="account.deletion_request", resource_type="user_account", resource_id=UUID(principal.user_id), purpose="account closure review", metadata_json={"retention_applies": True}))
    return {"status": "pending", "message": "Your request was recorded for review."}
