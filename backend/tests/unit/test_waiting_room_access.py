import secrets

import pytest
from httpx import ASGITransport, AsyncClient

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.main import app


@pytest.mark.asyncio
async def test_waiting_room_access_and_security() -> None:
    settings = get_settings()
    if settings.mongodb_enabled:
        await mongo_database.connect()

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

        db = mongo_database.database()
        doc_id = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"
        rand_y = secrets.randbelow(5) + 2035

        # 1. Test Valid Confirmed Appointment Join
        valid_apt_id = f"apt-valid-{secrets.token_hex(4)}"
        await db["appointments"].insert_one({
            "id": valid_apt_id,
            "tenant_id": settings.default_tenant_id,
            "patient_id": patient_id,
            "doctor_id": doc_id,
            "starts_at": f"{rand_y}-{secrets.randbelow(11)+1:02d}-{secrets.randbelow(20)+1:02d}T10:00:00Z",
            "status": "confirmed",
            "payment_status": "captured",
            "idempotency_key": f"idemp-{valid_apt_id}",
            "fee_paise": 47500,
        })

        valid_res = await client.post(f"/patient/consultations/{valid_apt_id}/join")
        assert valid_res.status_code == 200, f"Expected 200, got {valid_res.status_code}: {valid_res.text}"
        res_data = valid_res.json()
        assert res_data["status"] == "waiting"
        assert "room_id" in res_data
        assert "token" in res_data

        # 2. Test Pending Payment Appointment Join (Blocked with 402)
        unpaid_apt_id = f"apt-unpaid-{secrets.token_hex(4)}"
        await db["appointments"].insert_one({
            "id": unpaid_apt_id,
            "tenant_id": settings.default_tenant_id,
            "patient_id": patient_id,
            "doctor_id": doc_id,
            "starts_at": f"{rand_y+1}-{secrets.randbelow(11)+1:02d}-{secrets.randbelow(20)+1:02d}T10:00:00Z",
            "status": "pending_payment",
            "payment_status": "pending_payment",
            "idempotency_key": f"idemp-{unpaid_apt_id}",
            "fee_paise": 47500,
        })

        unpaid_res = await client.post(f"/patient/consultations/{unpaid_apt_id}/join")
        assert unpaid_res.status_code == 402, f"Expected 402, got {unpaid_res.status_code}: {unpaid_res.text}"

        # 3. Test Missing Appointment ID
        missing_res = await client.post("/patient/consultations/nonexistent-apt-99999/join")
        assert missing_res.status_code == 200 or missing_res.status_code == 404
