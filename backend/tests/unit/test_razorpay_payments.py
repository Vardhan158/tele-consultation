import asyncio
import hashlib
import hmac
import json
import os
import secrets
import pytest
from httpx import AsyncClient, ASGITransport
from teleconsult.main import app
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.config.settings import get_settings


@pytest.mark.asyncio
async def test_razorpay_payment_workflow_end_to_end() -> None:
    settings = get_settings()
    if settings.mongodb_enabled:
        await mongo_database.connect()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as synthetic patient or admin
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "clinic-admin@teleconsult.local", "password": "AdminPassword123!"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"

        doc_id = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"
        random_day = secrets.randbelow(20) + 10
        starts_at = f"2029-05-{random_day:02d}T09:00:00Z"

        # 2. Test Server-side Order Creation with Pricing Recalculation
        order_res = await client.post(
            "/patient/payments/create-order",
            json={
                "doctor_id": doc_id,
                "appointment_type": "Follow-up Consultation",
                "starts_at": starts_at,
                "visit_format": "Video consultation",
                "visit_reason": "Follow-up test visit",
            },
        )
        assert order_res.status_code == 200, f"Order creation failed: {order_res.text}"
        data = order_res.json()
        assert data["amount_paise"] == 47500  # ₹400 base + ₹75 platform
        assert data["base_fee_paise"] == 40000
        assert data["platform_fee_paise"] == 7500
        assert data["currency"] == "INR"
        assert "order_id" in data
        assert "payment_id" in data

        payment_id = data["payment_id"]
        order_id = data["order_id"]

        # 3. Test Invalid Signature Verification (Rejection)
        invalid_verify = await client.post(
            "/patient/payments/verify",
            json={
                "payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_payment_id": "pay_fake_123",
                "razorpay_signature": "invalid_signature_hash_xyz",
            },
        )
        assert invalid_verify.status_code == 400

        # 4. Test Valid Signature Verification
        key_secret = settings.razorpay_key_secret or os.getenv("RAZORPAY_KEY_SECRET") or "WidTX3FijxB03ePRSecret"
        mock_payment_id = f"pay_test_{secrets.token_hex(6)}"
        msg = f"{order_id}|{mock_payment_id}"
        valid_sig = hmac.new(key_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

        valid_verify = await client.post(
            "/patient/payments/verify",
            json={
                "payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_payment_id": mock_payment_id,
                "razorpay_signature": valid_sig,
            },
        )
        assert valid_verify.status_code == 200, f"Verification failed: {valid_verify.text}"
        verify_data = valid_verify.json()
        assert verify_data["status"] == "success"
        assert verify_data["amount_paise"] == 47500

        # 5. Test Duplicate Verification Idempotency
        dup_verify = await client.post(
            "/patient/payments/verify",
            json={
                "payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_payment_id": mock_payment_id,
                "razorpay_signature": valid_sig,
            },
        )
        assert dup_verify.status_code == 200
        assert dup_verify.json()["already_verified"] is True

        # 6. Test Webhook Verification & Idempotent Event Handling
        webhook_secret = settings.razorpay_webhook_secret or os.getenv("RAZORPAY_WEBHOOK_SECRET") or "whsec_kaizentrix_test_secret"
        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": mock_payment_id,
                        "order_id": order_id,
                        "amount": 47500,
                        "status": "captured",
                    }
                }
            }
        }).encode()
        wh_sig = hmac.new(webhook_secret.encode(), webhook_body, hashlib.sha256).hexdigest()

        wh_res = await client.post(
            "/patient/payments/webhook",
            content=webhook_body,
            headers={"X-Razorpay-Signature": wh_sig, "Content-Type": "application/json"},
        )
        assert wh_res.status_code == 204
