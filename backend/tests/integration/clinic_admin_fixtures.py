"""Create and clean synthetic Clinic Administrator Atlas fixtures.

Usage is intentionally explicit: this module requires the isolated test
database variables and never reads the application's default database name.
"""
import asyncio
import json
import os
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from clinic_admin_atlas_config import atlas_test_config
from pymongo import AsyncMongoClient

from teleconsult.config.settings import get_settings
from teleconsult.modules.identity.auth_routes import password_hash

RUN_ID = os.getenv("CLINIC_ADMIN_TEST_RUN_ID", f"run_{secrets.token_hex(8)}")
ROOT = Path(__file__).resolve().parents[3]
CREDENTIALS_FILE = ROOT / "frontend" / ".env.clinic-admin-test"


def _id(prefix: str) -> str:
    return f"{prefix}_{RUN_ID}_{uuid4().hex[:8]}"


async def create_fixtures() -> dict[str, str]:
    uri, database_name = atlas_test_config()
    client = AsyncMongoClient(uri, serverSelectionTimeoutMS=10000, appname="kaizentrix-care-clinic-admin-fixtures")
    db = client[database_name]
    now = datetime.now(UTC)
    password = secrets.token_urlsafe(24)
    admin_id, clinic_a, clinic_b = _id("admin_a"), _id("clinic_a"), _id("clinic_b")
    admin_b = _id("admin_b")
    doctor_a, doctor_b, pending_a, pending_a2, pending_b = (_id(x) for x in ("doctor_a", "doctor_b", "pending_a", "pending_a2", "pending_b"))
    patient_a, patient_b = _id("patient_a"), _id("patient_b")
    appointment = _id("appointment")
    email = f"clinic-admin-{RUN_ID}@example.test"
    common = {"tenant_id": get_settings().default_tenant_id, "test_run_id": RUN_ID}
    await client.admin.command("ping")
    await db["clinics"].insert_many([
        {"id": clinic_a, **common, "clinic_id": clinic_a, "name": "Synthetic Clinic A", "contact_email": "a@example.test"},
        {"id": clinic_b, **common, "clinic_id": clinic_b, "name": "Synthetic Clinic B", "contact_email": "b@example.test"},
    ])
    await db["users"].insert_many([
        {"id": admin_id, **common, "clinic_id": clinic_a, "full_name": "Synthetic Clinic Admin A", "email": email, "password_hash": password_hash(password), "role": "clinic_admin", "verified_at": now, "created_at": now},
        {"id": admin_b, **common, "clinic_id": clinic_b, "full_name": "Synthetic Clinic Admin B", "email": f"clinic-admin-b-{RUN_ID}@example.test", "password_hash": password_hash(secrets.token_urlsafe(24)), "role": "clinic_admin", "verified_at": now, "created_at": now},
    ])
    doctors = [{"id": did, **common, "clinic_id": cid, "user_id": did, "full_name": name, "email": f"{did}@example.test", "specialty": "General Medicine", "approval_status": status, "active": status == "approved", "approved_for_consultation": status == "approved", "created_at": now} for did, cid, name, status in [(doctor_a, clinic_a, "Synthetic Doctor A", "approved"), (doctor_b, clinic_b, "Synthetic Doctor B", "approved"), (pending_a, clinic_a, "Synthetic Pending A", "pending"), (pending_a2, clinic_a, "Synthetic Pending A2", "pending"), (pending_b, clinic_b, "Synthetic Pending B", "pending")]]
    await db["doctors"].insert_many(doctors)
    await db["patients"].insert_many([{"id": patient_a, **common, "clinic_id": clinic_a, "user_id": patient_a, "full_name": "Synthetic Patient A", "email": "patient-a@example.test", "phone": "+10000000001", "created_at": now}, {"id": patient_b, **common, "clinic_id": clinic_b, "user_id": patient_b, "full_name": "Synthetic Patient B", "email": "patient-b@example.test", "phone": "+10000000002", "created_at": now}])
    starts = (now + timedelta(days=1)).replace(microsecond=0).isoformat()
    await db["appointments"].insert_one({"id": appointment, **common, "clinic_id": clinic_a, "patient_id": patient_a, "patient_name": "Synthetic Patient A", "doctor_id": doctor_a, "doctor_name": "Synthetic Doctor A", "starts_at": starts, "status": "confirmed", "created_at": now})
    await db["notifications"].insert_one({"id": _id("notification"), **common, "clinic_id": clinic_a, "recipient_id": doctor_a, "type": "fixture", "title": "Synthetic notification", "created_at": now})
    await db["audit_logs"].insert_one({"id": _id("audit"), **common, "clinic_id": clinic_a, "actor_id": admin_id, "action": "fixture.created", "target_id": appointment, "metadata": {"synthetic": True}, "created_at": now})
    CREDENTIALS_FILE.write_text(f"VITE_CLINIC_ADMIN_E2E_EMAIL={email}\nVITE_CLINIC_ADMIN_E2E_PASSWORD={password}\nCLINIC_ADMIN_E2E=true\nCLINIC_ADMIN_PENDING_APPROVE_ID={pending_a}\nCLINIC_ADMIN_PENDING_REJECT_ID={pending_a2}\nCLINIC_ADMIN_APPOINTMENT_ID={appointment}\n", encoding="utf-8")
    return {"run_id": RUN_ID, "tenant_id": common["tenant_id"], "clinic_a": clinic_a, "clinic_b": clinic_b, "admin_id": admin_id, "pending_a": pending_a, "pending_a2": pending_a2, "patient_a": patient_a, "appointment": appointment, "email": email}


async def cleanup() -> None:
    uri, database_name = atlas_test_config()
    client = AsyncMongoClient(uri, serverSelectionTimeoutMS=10000, appname="kaizentrix-care-clinic-admin-cleanup")
    db = client[database_name]
    try:
        for name in ("users", "clinics", "doctors", "patients", "appointments", "notifications", "audit_logs", "user_sessions", "doctor_availability"):
            await db[name].delete_many({"test_run_id": RUN_ID})
    finally:
        await client.close()


if __name__ == "__main__":
    result = asyncio.run(create_fixtures())
    print(json.dumps({"run_id": result["run_id"], "email": result["email"], "credentials_file": str(CREDENTIALS_FILE)}))
