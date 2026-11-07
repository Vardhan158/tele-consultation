import asyncio
import hashlib
import hmac
import os
import secrets
import pytest
from httpx import AsyncClient, ASGITransport
from teleconsult.main import app
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.config.settings import get_settings
from teleconsult.modules.identity.auth_routes import password_hash


@pytest.mark.asyncio
async def test_appointment_access_rules_regression() -> None:
    settings = get_settings()
    if settings.mongodb_enabled:
        await mongo_database.connect()

    # Ensure test patient user exists with known password_hash
    patient_id = "00000000-0000-0000-0000-000000000002"
    db = mongo_database.database()
    await db["users"].update_one(
        {"tenant_id": settings.default_tenant_id, "email": "patient-e2e@teleconsult.local"},
        {
            "$set": {
                "id": patient_id,
                "user_id": patient_id,
                "tenant_id": settings.default_tenant_id,
                "email": "patient-e2e@teleconsult.local",
                "password_hash": password_hash("PatientPassword123!"),
                "role": "patient",
                "verified_at": "2026-01-01T00:00:00Z",
            }
        },
        upsert=True,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as verified patient user
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "patient-e2e@teleconsult.local", "password": "PatientPassword123!"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"

        me_res = await client.get("/api/v1/auth/me")
        patient_id = me_res.json()["user_id"]

        doc_id = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"

        # Scenario 1: Unpaid / Pending Payment Appointment -> Video Join Rejected (402)
        unpaid_apt_id = f"apt-unpaid-{secrets.token_hex(4)}"
        rand_yr = secrets.randbelow(5) + 2035
        await db["appointments"].insert_one({
            "id": unpaid_apt_id,
            "tenant_id": settings.default_tenant_id,
            "patient_id": patient_id,
            "doctor_id": doc_id,
            "starts_at": f"{rand_yr}-{secrets.randbelow(11)+1:02d}-{secrets.randbelow(20)+1:02d}T{secrets.randbelow(12)+1:02d}:00:00Z",
            "status": "pending_payment",
            "payment_status": "pending_payment",
            "idempotency_key": f"idemp-{unpaid_apt_id}",
            "fee_paise": 47500,
        })

        unpaid_join = await client.post(f"/patient/consultations/{unpaid_apt_id}/join")
        assert unpaid_join.status_code == 402, f"Expected 402, got {unpaid_join.status_code}: {unpaid_join.text}"
        assert "Payment is required" in unpaid_join.json()["detail"]

        # Scenario 2: Legitimately Free / NOT_REQUIRED Appointment (e.g. KC-APT-12EB)
        free_apt_id = "12ebf1ef-b3a3-440f-ba50-15e7f361182e"
        free_join = await client.post(f"/patient/consultations/{free_apt_id}/join")
        assert free_join.status_code == 200, f"Expected 200 for free appointment, got {free_join.status_code}: {free_join.text}"

        # Scenario 3: Paid & Verified Appointment -> Video Join Allowed
        paid_apt_id = f"apt-paid-{secrets.token_hex(4)}"
        await db["appointments"].insert_one({
            "id": paid_apt_id,
            "tenant_id": settings.default_tenant_id,
            "patient_id": patient_id,
            "doctor_id": doc_id,
            "starts_at": f"{rand_yr+1}-{secrets.randbelow(11)+1:02d}-{secrets.randbelow(20)+1:02d}T{secrets.randbelow(12)+1:02d}:00:00Z",
            "status": "confirmed",
            "payment_status": "captured",
            "idempotency_key": f"idemp-{paid_apt_id}",
            "fee_paise": 47500,
        })

        paid_join = await client.post(f"/patient/consultations/{paid_apt_id}/join")
        assert paid_join.status_code == 200, f"Expected 200 for paid appointment, got {paid_join.status_code}: {paid_join.text}"
