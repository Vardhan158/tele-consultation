from contextvars import ContextVar

_current_tenant: ContextVar[str | None] = ContextVar("current_tenant", default=None)


def set_tenant(tenant_id: str) -> None:
    _current_tenant.set(tenant_id)


def get_tenant() -> str:
    tenant = _current_tenant.get()
    if tenant is None:
        from teleconsult.config.settings import get_settings
        tenant = get_settings().default_tenant_id
    return tenant
