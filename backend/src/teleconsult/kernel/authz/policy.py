"""The single authorization entry point. Every non-public route must depend on require()."""
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database


@dataclass(frozen=True)
class Principal:
    user_id: str
    tenant_id: str
    roles: frozenset[str]
    permissions: frozenset[str]
    mfa_verified: bool = False


async def get_principal(request: Request) -> Principal:
    """Resolve the authenticated principal.

    TODO: validate the OIDC token (issuer, audience, signature, expiry, revocation),
    load roles/permissions, and bind the tenant. Fails closed until implemented.
    """
    raw_token = request.cookies.get("teleconsult_session")
    if not raw_token or not mongo_database.enabled:
        if get_settings().environment in {"dev", "local"}:
            if request.headers.get("X-Dev-Doctor-Id"):
                user_id = request.headers["X-Dev-Doctor-Id"]
                tenant_id = request.headers.get("X-Dev-Tenant-Id") or get_settings().default_tenant_id
                return Principal(
                    user_id=user_id,
                    tenant_id=tenant_id,
                    roles=frozenset({"doctor"}),
                    permissions=frozenset({
                        "doctor:profile:read", "doctor:profile:write", "doctor:availability:read",
                        "doctor:availability:write", "doctor:appointment:read", "doctor:appointment:write",
                        "consultation:join", "consultation:admit", "consultation:complete", "clinical:read",
                        "clinical:write", "clinical:publish", "records:read", "prescription:read", "notification:read",
                    }),
                )
            if request.headers.get("X-Dev-Patient-Id"):
                user_id = request.headers["X-Dev-Patient-Id"]
                tenant_id = request.headers.get("X-Dev-Tenant-Id") or get_settings().default_tenant_id
                return Principal(
                    user_id=user_id,
                    tenant_id=tenant_id,
                    roles=frozenset({"patient"}),
                    permissions=frozenset({"patient:profile:read", "patient:profile:write", "patient:intake:write", "directory:read", "appointment:create", "appointment:read", "appointment:write", "payment:create", "payment:read", "payment:verify", "payment:refund", "notification:read", "notification:retry", "consultation:join", "records:read", "records:upload", "prescription:read", "followup:read", "support:create", "support:read", "insurance:read", "insurance:write"}),
                )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    else:
        import hashlib
        database = mongo_database.database()
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        now_dt = datetime.now(UTC)
        now_iso = now_dt.isoformat()
        auth_session = await database["user_sessions"].find_one({
            "tenant_id": get_settings().default_tenant_id,
            "token_hash": token_hash,
            "revoked_at": {"$exists": False},
            "$or": [
                {"expires_at": {"$gt": now_iso}},
                {"expires_at": {"$gt": now_dt}},
            ],
        })
        user = await database["users"].find_one({"id": auth_session["user_id"]}) if auth_session else None
        if user:
            role = user.get("role", "patient")
            if role == "clinic_admin":
                permissions = {"clinic:admin", "clinic:doctor:read", "clinic:doctor:approve"}
            elif role == "doctor":
                permissions = {
                    "doctor:profile:read", "doctor:profile:write", "doctor:availability:read",
                    "doctor:availability:write", "doctor:appointment:read", "doctor:appointment:write",
                    "consultation:join", "consultation:admit", "consultation:complete", "clinical:read",
                    "clinical:write", "clinical:publish", "records:read", "prescription:read", "notification:read",
                }
            else:
                permissions = {
                    "notification:read", "notification:retry", "patient:profile:read", "patient:profile:write",
                    "patient:intake:write", "appointment:read", "appointment:create", "appointment:write",
                    "records:read", "records:upload", "prescription:read", "followup:read", "support:read",
                    "support:create", "payment:read", "payment:create", "payment:verify", "payment:refund",
                    "directory:read", "consultation:join", "insurance:read", "insurance:write",
                }
            return Principal(
                user_id=user["id"], tenant_id=user["tenant_id"], roles=frozenset({role}),
                permissions=frozenset(permissions), mfa_verified=bool(auth_session.get("mfa_verified")),
            )

    # Local-only fixture authentication. Production must use the OIDC adapter.
    if get_settings().environment in {"dev", "local"}:
        user_id = request.headers.get("X-Dev-Patient-Id") or "00000000-0000-0000-0000-000000000101"
        tenant_id = request.headers.get("X-Dev-Tenant-Id") or get_settings().default_tenant_id
        return Principal(
            user_id=user_id,
            tenant_id=tenant_id,
            roles=frozenset({"patient"}),
            permissions=frozenset({"patient:profile:read", "patient:profile:write", "patient:intake:write", "directory:read", "appointment:create", "appointment:read", "appointment:write", "payment:create", "payment:read", "payment:verify", "payment:refund", "notification:read", "notification:retry", "consultation:join", "records:read", "records:upload", "prescription:read", "followup:read", "support:create", "support:read", "insurance:read", "insurance:write"}),
        )
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


def require(
    permission: str, *, step_up: bool = False
) -> Callable[..., Awaitable[Principal]]:
    """Dependency factory. Also add context checks (tenant, patient-clinician relationship,
    appointment, purpose) in the module's permissions.py / service layer."""

    async def _dependency(
        principal: Principal = Depends(get_principal),  # noqa: B008 - FastAPI idiom
    ) -> Principal:
        if permission not in principal.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if step_up and not principal.mfa_verified:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Step-up required")
        return principal

    setattr(_dependency, "_is_authz", True)  # noqa: B010 - marker checked by architecture test
    return _dependency
