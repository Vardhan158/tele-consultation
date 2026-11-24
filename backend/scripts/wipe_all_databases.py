"""Comprehensive script to completely wipe and reset MongoDB data."""
import asyncio
from pymongo import AsyncMongoClient

from teleconsult.config.settings import get_settings


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
        await client.close()
    except Exception as e:
        print(f"Error wiping MongoDB: {e}")

async def main():
    settings = get_settings()
    print("=== STARTING COMPLETE MONGODB WIPE ===")
    await wipe_mongodb(settings)
    print("=== DATABASE WIPE COMPLETED ===")

if __name__ == "__main__":
    asyncio.run(main())
