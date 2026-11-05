"""Verify MongoDB Atlas without enabling application database traffic.

This command never prints the URI, credentials, database contents, or patient
data. It may create the foundation collections and indexes in the configured
database, but it does not alter PostgreSQL or enable MongoDB application use.
"""
import asyncio
import sys

from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.schema import ensure_schema


async def verify() -> int:
    settings = get_settings()
    if not settings.mongodb_uri.strip():
        print("MongoDB verification blocked: MONGODB_URI is not configured.")
        return 2

    client = AsyncMongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=settings.mongodb_server_selection_timeout_ms,
        connectTimeoutMS=settings.mongodb_connect_timeout_ms,
        maxPoolSize=settings.mongodb_max_pool_size,
        minPoolSize=settings.mongodb_min_pool_size,
        appname="kaizentrix-care-verifier",
    )
    try:
        ping = await client.admin.command("ping")
        hello = await client.admin.command("hello")
        db = client[settings.mongodb_database]
        async with client.start_session() as session:
            async with await session.start_transaction():
                probe = db["__foundation_transaction_probe"]
                await probe.insert_one({"probe": True}, session=session)
                await probe.delete_many({"probe": True}, session=session)
        schema = await ensure_schema(db)
        print({
            "application_enabled": settings.mongodb_enabled,
            "ping_ok": ping.get("ok") == 1,
            "authenticated_database_access": True,
            "topology": "replica_set" if hello.get("setName") else hello.get("msg", "unknown"),
            "replica_set_name_present": bool(hello.get("setName")),
            "transaction_supported": True,
            "collections_defined": schema["collections"],
            "collections_created": len(schema["created"]),
            "index_groups_created": schema["indexed"],
        })
        return 0
    except PyMongoError as exc:
        message = str(exc).replace(settings.mongodb_uri, "<redacted-mongodb-uri>")
        print({
            "application_enabled": settings.mongodb_enabled,
            "ping_ok": False,
            "error_type": type(exc).__name__,
            "error": message[:240],
            "action": "Check Atlas network access, database user permissions, URI, and replica-set topology.",
        })
        return 1
    finally:
        await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(verify()))
