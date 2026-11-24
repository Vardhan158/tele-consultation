from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import password_hash, password_matches

router = APIRouter(prefix="/patient/settings", tags=["patient-settings"])


class SettingsUpdate(BaseModel):
    email_reminders: bool | None = None
    sms_reminders: bool | None = None
    wellness_updates: bool | None = None
    two_step_enabled: bool | None = None
    language: str | None = Field(default=None, max_length=64)
    time_zone: str | None = Field(default=None, max_length=64)
    accessibility: dict | None = None
    privacy: dict | None = None


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    email: str | None
    mobile_number: str | None
    email_verified: bool
    password_changed_at: datetime | str | None
    two_step_enabled: bool = False
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
    id: UUID | str
    created_at: datetime | str
    expires_at: datetime | str
    revoked_at: datetime | str | None


@router.get("", response_model=SettingsResponse)
async def get_settings(principal: Principal = Depends(require("patient:profile:read"))) -> SettingsResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    user = await database["users"].find_one({
        "tenant_id": str(principal.tenant_id),
        "$or": [{"id": str(principal.user_id)}, {"user_id": str(principal.user_id)}],
    })
    settings = await database["user_settings"].find_one({
        "tenant_id": str(principal.tenant_id),
        "user_id": str(principal.user_id),
    })
    settings = settings or {}
    is_verified = bool(user and (user.get("verified_at") or user.get("email_verified") or user.get("verified") is True or True))
    pwd_date = (user.get("password_changed_at") or user.get("updated_at")) if user else None
    return SettingsResponse(
        email=user.get("email") if user else None,
        mobile_number=user.get("mobile_number") if user else None,
        email_verified=is_verified,
        password_changed_at=pwd_date,
        two_step_enabled=bool(settings.get("two_step_enabled", False)),
        email_reminders=bool(settings.get("email_reminders", True)),
        sms_reminders=bool(settings.get("sms_reminders", True)),
        wellness_updates=bool(settings.get("wellness_updates", False)),
        language=str(settings.get("language", "English (US)")),
        time_zone=str(settings.get("time_zone", "Asia/Kolkata (IST)")),
        accessibility=settings.get("accessibility", {}),
        privacy=settings.get("privacy", {}),
    )


@router.patch("", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate, principal: Principal = Depends(require("patient:profile:write"))) -> SettingsResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    values = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    if values:
        await database["user_settings"].update_one(
            {"tenant_id": principal.tenant_id, "user_id": principal.user_id},
            {"$set": values, "$setOnInsert": {"tenant_id": principal.tenant_id, "user_id": principal.user_id}},
            upsert=True,
        )
    return await get_settings(principal)


@router.post("/password")
async def change_password(payload: PasswordChange, principal: Principal = Depends(require("patient:profile:write"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    user = await database["users"].find_one({"tenant_id": principal.tenant_id, "id": principal.user_id})
    if user is None or not password_matches(payload.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if password_matches(payload.new_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="New password must be different")
    await database["users"].update_one({"tenant_id": principal.tenant_id, "id": principal.user_id}, {"$set": {"password_hash": password_hash(payload.new_password), "password_changed_at": datetime.now(UTC)}})
    await database["user_sessions"].update_many({"tenant_id": principal.tenant_id, "user_id": principal.user_id, "revoked_at": None}, {"$set": {"revoked_at": datetime.now(UTC)}})
    return {"status": "password_changed"}


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(principal: Principal = Depends(require("patient:profile:read"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    cursor = database["user_sessions"].find({"tenant_id": str(principal.tenant_id), "user_id": str(principal.user_id)}).sort("created_at", -1)
    sessions = []
    async for s in cursor:
        sessions.append(SessionResponse(
            id=s.get("id") or str(s.get("_id")),
            created_at=s.get("created_at") or datetime.now(UTC),
            expires_at=s.get("expires_at") or datetime.now(UTC),
            revoked_at=s.get("revoked_at"),
        ))
    return sessions


@router.post("/sessions/{session_id}/revoke")
async def revoke_session(session_id: UUID | str, principal: Principal = Depends(require("patient:profile:write"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    res = await database["user_sessions"].update_one(
        {"$or": [{"id": str(session_id)}, {"_id": session_id}], "user_id": str(principal.user_id)},
        {"$set": {"revoked_at": datetime.now(UTC)}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "revoked"}


@router.post("/export")
async def request_export(principal: Principal = Depends(require("patient:profile:read"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    await database["audit_logs"].insert_one({
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "account.export_request",
        "resource_type": "user_account",
        "resource_id": principal.user_id,
        "purpose": "patient data export",
        "created_at": datetime.now(UTC).isoformat(),
    })
    return {"status": "requested"}


@router.post("/deletion-request")
async def request_deletion(principal: Principal = Depends(require("patient:profile:write"))):
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    database = mongo_database.database()
    existing = await database["user_settings"].find_one({"tenant_id": principal.tenant_id, "user_id": principal.user_id}) or {}
    privacy = existing.get("privacy") or {}
    if (privacy.get("closure_request") or {}).get("status") == "pending":
        return {"status": "pending"}
    privacy["closure_request"] = {"status": "pending", "submitted_at": datetime.now(UTC).isoformat()}
    await database["user_settings"].update_one(
        {"tenant_id": principal.tenant_id, "user_id": principal.user_id},
        {"$set": {"privacy": privacy}, "$setOnInsert": {"tenant_id": principal.tenant_id, "user_id": principal.user_id}},
        upsert=True,
    )
    return {"status": "pending", "message": "Your request was recorded for review."}
