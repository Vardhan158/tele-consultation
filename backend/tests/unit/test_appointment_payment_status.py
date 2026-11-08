import hashlib
import hmac
import os
import secrets

import pytest
from httpx import ASGITransport, AsyncClient

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.main import app


@pytest.mark.asyncio
async def test_appointment_payment_status_scenarios() -> None:
    settings = get_settings()
    if settings.mongodb_enabled:
        await mongo_database.connect()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "clinic-admin@teleconsult.local", "password": "AdminPassword123!"},
        )
        assert login_res.status_code == 200

        doc_id = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"
        rand_y = secrets.randbelow(5) + 2038
        starts_at = f"{rand_y}-{secrets.randbelow(11)+1:02d}-{secrets.randbelow(20)+1:02d}T{secrets.randbelow(12)+1:02d}:00:00Z"

        # Scenario 1: Pending Payment Appointment Creation
        order_res = await client.post(
            "/patient/payments/create-order",
            json={
                "doctor_id": doc_id,
                "appointment_type": "Follow-up Consultation",
                "starts_at": starts_at,
                "visit_format": "Video consultation",
                "visit_reason": "Pending payment status test",
            },
        )
        assert order_res.status_code == 200
        order_data = order_res.json()
        assert order_data["amount_paise"] > 0
        payment_id = order_data["payment_id"]
        order_id = order_data["order_id"]

        # Verify payment record in DB is 'created' / 'pending'
        db = mongo_database.database()
        pay_doc = await db["payments"].find_one({"id": payment_id})
        assert pay_doc["status"] == "created"
        assert pay_doc["amount_paise"] > 0

        # Scenario 2: Failed Payment Attempt
        failed_verify = await client.post(
            "/patient/payments/verify",
            json={
                "payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_payment_id": "pay_failed_xyz",
                "razorpay_signature": "invalid_signature_hash_123",
            },
        )
        assert failed_verify.status_code == 400
        failed_doc = await db["payments"].find_one({"id": payment_id})
        assert failed_doc["status"] == "failed"

        # Scenario 3: Successful Retry & Paid Confirmation
        mock_pay_id = f"pay_success_{secrets.token_hex(6)}"
        key_secret = settings.razorpay_key_secret or os.getenv("RAZORPAY_KEY_SECRET") or "WidTX3FijxB03ePRSecret"
        msg = f"{order_id}|{mock_pay_id}"
        valid_sig = hmac.new(key_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

        success_verify = await client.post(
            "/patient/payments/verify",
            json={
                "payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_payment_id": mock_pay_id,
                "razorpay_signature": valid_sig,
            },
        )
        assert success_verify.status_code == 200
        success_data = success_verify.json()
        assert success_data["status"] == "success"

        # Scenario 4: Verify Appointment Confirmed & Paid
        apt_doc = await db["appointments"].find_one({"id": order_data["appointment_id"]})
        assert apt_doc["status"] == "confirmed"
        assert apt_doc["payment_status"] == "captured"
