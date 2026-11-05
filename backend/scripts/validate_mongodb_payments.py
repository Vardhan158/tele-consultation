"""Real Atlas validation for inactive MongoDB payment repositories."""
import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from pymongo import AsyncMongoClient

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.schema import ensure_schema
from teleconsult.modules.payments.mongodb_repositories import (
    PaymentMongoRepository,
    PaymentConflict,
    verify_payment_signature,
    verify_webhook_signature,
)
import hashlib
import hmac


async def main() -> int:
    settings = get_settings()
    if settings.mongodb_enabled or settings.mongodb_repositories_enabled:
        raise RuntimeError("Validation requires both MongoDB application flags to remain false.")
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is required for Atlas payment validation.")

    tenant_id, patient_id, appointment_id, payment_id = (str(uuid4()) for _ in range(4))
    client = AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000,
                              appname="phase34-payment-test")
    db = None
    try:
        await client.admin.command("ping")
        db = client[settings.mongodb_database]
        await ensure_schema(db)
        repo = PaymentMongoRepository(
            db["payments"], db["payment_attempts"], db["payment_status_history"],
            db["payment_webhooks"], db["refunds"],
        )
        payment = {
            "id": payment_id, "tenant_id": tenant_id, "appointment_id": appointment_id,
            "patient_id": patient_id, "provider": "razorpay", "amount_paise": 125000,
            "currency": "INR", "status": "initiated", "idempotency_key": f"phase34-{appointment_id}",
            "provider_order_id": None, "provider_transaction_id": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
        first = await repo.create_or_get_order(payment=payment)
        second = await repo.create_or_get_order(payment=payment)
        assert first["id"] == second["id"]

        order_id, provider_id, secret = "order_phase34", "pay_phase34", "synthetic-razorpay-secret"
        await repo.record_provider_order(tenant_id=tenant_id, payment_id=payment_id, order_id=order_id)
        payment_signature = hmac.new(secret.encode(), f"{order_id}|{provider_id}".encode(), hashlib.sha256).hexdigest()
        assert verify_payment_signature(order_id=order_id, payment_id=provider_id, signature=payment_signature, secret=secret)
        verified = await repo.verify_success(
            tenant_id=tenant_id, patient_id=patient_id, payment_id=payment_id,
            provider_order_id=order_id, provider_transaction_id=provider_id,
            amount_paise=125000,
        )
        assert verified["status"] == "success"
        assert (await repo.verify_success(
            tenant_id=tenant_id, patient_id=patient_id, payment_id=payment_id,
            provider_order_id=order_id, provider_transaction_id=provider_id,
            amount_paise=125000,
        ))["status"] == "success"

        webhook_body = b'{"event":"payment.captured","id":"evt_phase34"}'
        webhook_signature = hmac.new(secret.encode(), webhook_body, hashlib.sha256).hexdigest()
        assert verify_webhook_signature(body=webhook_body, signature=webhook_signature, secret=secret)
        assert await repo.record_webhook(event_id="evt_phase34", event={"event": "payment.captured"})
        assert not await repo.record_webhook(event_id="evt_phase34", event={"event": "payment.captured"})

        refund_one = await repo.create_refund(
            tenant_id=tenant_id, patient_id=patient_id, payment_id=payment_id, amount_paise=125000,
        )
        refund_two = await repo.create_refund(
            tenant_id=tenant_id, patient_id=patient_id, payment_id=payment_id, amount_paise=125000,
        )
        assert refund_one["id"] == refund_two["id"]

        rollback_payment_id = str(uuid4())
        async with client.start_session() as session:
            try:
                async with await session.start_transaction():
                    await repo.create_or_get_order(payment={**payment, "id": rollback_payment_id}, session=session)
                    raise RuntimeError("synthetic rollback")
            except RuntimeError:
                pass
        assert await db["payments"].find_one({"id": rollback_payment_id}) is None

        indexes = await db["payments"].index_information()
        webhook_indexes = await db["payment_webhooks"].index_information()
        assert any("idempotency_key" in str(value["key"]) and value.get("unique") for value in indexes.values())
        assert any("provider_order_id" in str(value["key"]) and value.get("unique") for value in indexes.values())
        assert any("event_id" in str(value["key"]) and value.get("unique") for value in webhook_indexes.values())
        print({
            "duplicate_order_idempotency": True,
            "payment_signature_verified": True,
            "duplicate_success_verification_safe": True,
            "webhook_signature_verified": True,
            "duplicate_webhook_rejected": True,
            "refund_idempotency": True,
            "transaction_rollback": True,
            "payment_indexes_verified": True,
        })
        return 0
    finally:
        if db is not None:
            for collection in ("payments", "payment_status_history", "payment_webhooks", "refunds", "payment_attempts"):
                await db[collection].delete_many({"tenant_id": tenant_id})
        await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
