from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from teleconsult.config.settings import get_settings


class MongoDatabase:
    def __init__(self) -> None:
        self._client: AsyncMongoClient[dict[str, Any]] | None = None

    @property
    def enabled(self) -> bool:
        settings = get_settings()
        return settings.mongodb_enabled and bool(settings.mongodb_uri)

    async def connect(self) -> None:
        if not self.enabled:
            return
        settings = get_settings()
        self._client = AsyncMongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=settings.mongodb_server_selection_timeout_ms,
            connectTimeoutMS=settings.mongodb_connect_timeout_ms,
            maxPoolSize=settings.mongodb_max_pool_size,
            minPoolSize=settings.mongodb_min_pool_size,
            appname="kaizentrix-care",
        )
        await self._client.admin.command("ping")

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    def database(self) -> AsyncDatabase[dict[str, Any]]:
        if self._client is None:
            raise RuntimeError("MongoDB is not connected")
        return self._client[get_settings().mongodb_database]

    async def ping(self) -> dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "status": "disabled"}
        if self._client is None:
            await self.connect()
        assert self._client is not None
        result = await self._client.admin.command("ping")
        return {"enabled": True, "status": "ok", "ok": result.get("ok", 0)}

    async def transaction_probe(self) -> dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "supported": False, "reason": "MongoDB is disabled"}
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
