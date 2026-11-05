"""Explicit application-level authorization for MongoDB repositories."""
from dataclasses import dataclass


ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "patient": frozenset({"patient:read:self", "patient:write:self", "appointment:create:self"}),
    "doctor": frozenset({"doctor:read:self", "doctor:write:self", "clinical:read:authorized"}),
    "clinic_admin": frozenset({"clinic:doctor:read", "clinic:doctor:approve"}),
    "platform_support": frozenset({"support:read:scoped"}),
    "security_operations": frozenset({"security:audit:read"}),
}


@dataclass(frozen=True)
class MongoPrincipal:
    user_id: str
    tenant_id: str
    role: str
    clinic_id: str | None = None

    @property
    def permissions(self) -> frozenset[str]:
        return ROLE_PERMISSIONS.get(self.role, frozenset())


def require_permission(principal: MongoPrincipal, permission: str) -> None:
    if permission not in principal.permissions:
        raise PermissionError("MongoDB repository permission denied")


def require_same_tenant(principal: MongoPrincipal, tenant_id: str) -> None:
    if principal.tenant_id != tenant_id:
        raise PermissionError("MongoDB repository tenant scope denied")


def require_self(principal: MongoPrincipal, subject_id: str) -> None:
    if principal.user_id != subject_id:
        raise PermissionError("MongoDB repository subject scope denied")
