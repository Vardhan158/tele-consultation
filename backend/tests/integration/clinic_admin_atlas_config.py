"""Safety gate for live Clinic Administrator Atlas tests.

The live suite must receive an explicitly isolated URI and database name. It
never falls back to backend/.env, preventing accidental writes to shared data.
"""
import os
import re

from pymongo import AsyncMongoClient


SAFE_NAME = re.compile(r"^kaizentrix_admin_test_[a-z0-9_-]+$")


def atlas_test_config() -> tuple[str, str]:
    uri = os.getenv("CLINIC_ADMIN_TEST_MONGODB_URI", "").strip()
    database = os.getenv("CLINIC_ADMIN_TEST_MONGODB_DATABASE", "").strip()
    if not uri or not database:
        raise RuntimeError("Set CLINIC_ADMIN_TEST_MONGODB_URI and CLINIC_ADMIN_TEST_MONGODB_DATABASE")
    if not SAFE_NAME.fullmatch(database):
        raise RuntimeError("Refusing live tests: database name is not an isolated clinic-admin test database")
    if "@" not in uri or "mongodb" not in uri.lower():
        raise RuntimeError("Refusing live tests: invalid MongoDB URI")
    return uri, database


async def connect_test_database():
    uri, database = atlas_test_config()
    client = AsyncMongoClient(uri, serverSelectionTimeoutMS=10000, appname="kaizentrix-care-clinic-admin-tests")
    await client.admin.command("ping")
    return client, client[database]
