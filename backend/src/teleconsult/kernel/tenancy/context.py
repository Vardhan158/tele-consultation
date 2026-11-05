from contextvars import ContextVar

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_current_tenant: ContextVar[str | None] = ContextVar("current_tenant", default=None)


def set_tenant(tenant_id: str) -> None:
    _current_tenant.set(tenant_id)


def get_tenant() -> str:
    tenant = _current_tenant.get()
    if tenant is None:
        from teleconsult.config.settings import get_settings
        tenant = get_settings().default_tenant_id
    return tenant


async def apply_rls_context(session: AsyncSession) -> None:
    """Bind the tenant to the DB transaction so row-level security policies can use it.

    Policies read current_setting('app.tenant_id'). See migrations/rls/.
    """
    await session.execute(
        text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
        {"tenant_id": get_tenant()},
    )
