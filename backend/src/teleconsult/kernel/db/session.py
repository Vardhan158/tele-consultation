from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from teleconsult.config.settings import get_settings
from teleconsult.kernel.tenancy.context import apply_rls_context


@lru_cache
def get_engine() -> AsyncEngine:
    database_url = get_settings().database_url.strip()
    if not database_url:
        raise RuntimeError(
            "PostgreSQL runtime database is not configured. "
            "Set TELECONSULT_DATABASE_URL before using PostgreSQL-backed APIs."
        )
    if not database_url.startswith(("postgresql+asyncpg://", "postgresql://")):
        raise RuntimeError(
            "TELECONSULT_DATABASE_URL must be a PostgreSQL URL using asyncpg "
            "(postgresql+asyncpg://) or an explicitly supported PostgreSQL scheme."
        )
    return create_async_engine(database_url, pool_pre_ping=True)


async def tenant_session() -> AsyncIterator[AsyncSession]:
    """One transaction per request, bound to the current tenant for row-level security."""
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session, session.begin():
        await apply_rls_context(session)
        yield session
