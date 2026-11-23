"""Comprehensive script to completely wipe and reset both PostgreSQL and MongoDB data."""
import asyncio
import asyncpg
from pymongo import AsyncMongoClient

from teleconsult.config.settings import get_settings

APP_SCHEMAS = (
    "patient_portal",
    "identity",
    "payments",
    "records",
    "notifications",
    "consultation",
    "support_access",
    "audit",
    "directory",
    "tenancy",
)

async def wipe_postgres(settings):
    if not settings.database_url:
        print("PostgreSQL DATABASE_URL not configured. Skipping PostgreSQL wipe.")
        return
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    try:
        connection = await asyncpg.connect(url)
        try:
            tables = await connection.fetch(
                "SELECT table_schema, table_name FROM information_schema.tables "
                "WHERE table_schema = ANY($1::text[]) AND table_type = 'BASE TABLE'",
                list(APP_SCHEMAS),
            )
            if tables:
                qualified = ", ".join(
                    f'"{row["table_schema"]}"."{row["table_name"]}"' for row in tables
                )
                await connection.execute(f"TRUNCATE TABLE {qualified} RESTART IDENTITY CASCADE")
                print(f"Successfully truncated {len(tables)} PostgreSQL tables across schemas: {list(APP_SCHEMAS)}")
            else:
                print("No PostgreSQL base tables found in app schemas.")
        finally:
            await connection.close()
    except Exception as e:
        print(f"Error wiping PostgreSQL: {e}")

async def wipe_mongodb(settings):
    if not settings.mongodb_uri:
        print("MongoDB URI not configured. Skipping MongoDB wipe.")
        return
    try:
        client = AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        db_name = settings.mongodb_database or "kaizentrix_care"
        db = client[db_name]
        collections = await db.list_collection_names()
        if collections:
            for coll in collections:
                if coll.startswith("system."):
                    continue
                await db[coll].drop()
            print(f"Successfully dropped {len(collections)} MongoDB collections in database '{db_name}': {collections}")
        else:
            print(f"No MongoDB collections found in database '{db_name}'.")
        client.close()
    except Exception as e:
        print(f"Error wiping MongoDB: {e}")

async def main():
    settings = get_settings()
    print("=== STARTING COMPLETE DATABASE WIPE ===")
    await wipe_postgres(settings)
    await wipe_mongodb(settings)
    print("=== DATABASE WIPE COMPLETED ===")

if __name__ == "__main__":
    asyncio.run(main())
