"""Scoped, synthetic Atlas persistence probe; never uses the default DB name."""
import asyncio
from datetime import UTC, datetime

from pymongo import AsyncMongoClient

from teleconsult.config.settings import get_settings


async def main() -> None:
    settings = get_settings()
    database_name = "kaizentrix_admin_test_20261105"
    client = AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000, appname="kaizentrix-care-phase3-probe")
    try:
        database = client[database_name]
        await client.admin.command("ping")
        collection = database["__phase3_probe"]
        document = {"id": "phase3-probe-20261105", "created_at": datetime.now(UTC).isoformat(), "synthetic": True}
        await collection.insert_one(document)
        found = await collection.find_one({"id": document["id"]})
        await collection.delete_one({"id": document["id"]})
        print({"database_isolated": database_name.startswith("kaizentrix_admin_test_"), "persisted": found is not None, "cleanup_remaining": await collection.count_documents({"id": document["id"]})})
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
