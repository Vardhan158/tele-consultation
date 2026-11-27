from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from teleconsult.config.settings import get_settings

try:
    import dns.asyncresolver
    import dns.resolver
    for _r in (dns.asyncresolver.get_default_resolver(), dns.resolver.get_default_resolver()):
        _r.lifetime = 15.0
except Exception:
    pass


class MongoDatabase:
    def __init__(self) -> None:
        self._client: AsyncMongoClient[dict[str, Any]] | None = None
        self._loop: Any = None
        self._in_memory: Any = None

    @property
    def enabled(self) -> bool:
        settings = get_settings()
        if not settings.mongodb_enabled:
            return False
        return bool(settings.mongodb_uri) or settings.environment in {"dev", "local"}

    async def connect(self) -> None:
        if not self.enabled:
            return
        settings = get_settings()
        if settings.mongodb_uri in {"memory", "mock", "inmemory"} or (
            settings.environment in {"dev", "local"} and not settings.mongodb_uri
        ):
            if self._in_memory is None:
                from teleconsult.kernel.mongodb.in_memory import InMemoryDatabase, seed_enterprise_defaults
                self._in_memory = InMemoryDatabase()
                await seed_enterprise_defaults(self._in_memory)
            return

        import asyncio
        current_loop = asyncio.get_running_loop()
        if self._client is not None and self._loop is not None and self._loop is not current_loop:
            # Event loop changed (e.g. between pytest-asyncio tests); close/recreate client for current loop
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None
            self._loop = None

        if self._client is not None:
            return

        self._client = AsyncMongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=settings.mongodb_server_selection_timeout_ms,
            connectTimeoutMS=settings.mongodb_connect_timeout_ms,
            maxPoolSize=settings.mongodb_max_pool_size,
            minPoolSize=settings.mongodb_min_pool_size,
            appname="kaizentrix-care",
        )
        self._loop = current_loop
        for attempt in range(3):
            try:
                await self._client.admin.command("ping")
                break
            except Exception as exc:
                if attempt == 2:
                    raise exc
                import asyncio
                await asyncio.sleep(0.5)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None
            self._loop = None
        self._in_memory = None

    def database(self) -> AsyncDatabase[dict[str, Any]]:
        if self._in_memory is not None:
            return self._in_memory
        if self._client is None:
            settings = get_settings()
            if settings.mongodb_uri in {"memory", "mock", "inmemory"} or (
                settings.environment in {"dev", "local"} and not settings.mongodb_uri
            ):
                from teleconsult.kernel.mongodb.in_memory import InMemoryDatabase
                self._in_memory = InMemoryDatabase()
                return self._in_memory
            raise RuntimeError("MongoDB is not connected")
        return self._client[get_settings().mongodb_database]

    async def ping(self) -> dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "status": "disabled"}
        if self._in_memory is not None:
            return {"enabled": True, "status": "ok", "ok": 1}
        if self._client is None:
            await self.connect()
        assert self._client is not None
        result = await self._client.admin.command("ping")
        return {"enabled": True, "status": "ok", "ok": result.get("ok", 0)}

    async def transaction_probe(self) -> dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "supported": False, "reason": "MongoDB is disabled"}
        if self._in_memory is not None:
            return {"enabled": True, "supported": True}
        if self._client is None:
            await self.connect()
        assert self._client is not None
        async with self._client.start_session() as session:
            try:
                async with await session.start_transaction():
                    await self.database()["__foundation_transaction_probe"].insert_one(
                        {"probe": True}, session=session
                    )
                    await self.database()["__foundation_transaction_probe"].delete_one(
                        {"probe": True}, session=session
                    )
                return {"enabled": True, "supported": True}
            except Exception as exc:
                if session.in_transaction:
                    await session.abort_transaction()
                return {"enabled": True, "supported": False, "reason": type(exc).__name__}


mongo_database = MongoDatabase()


@asynccontextmanager
async def mongo_lifespan() -> AsyncIterator[None]:
    await mongo_database.connect()
    try:
        yield
    finally:
        await mongo_database.close()
