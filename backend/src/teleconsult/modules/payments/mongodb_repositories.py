"""Inactive MongoDB Razorpay persistence repositories."""
import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection

from teleconsult.kernel.mongodb.repository import serialize_document

PAYMENT_STATUSES = frozenset({"initiated", "pending", "success", "failed", "cancelled", "refunded", "refund_failed"})


class PaymentConflict(Exception):
    pass


class PaymentAuthorizationError(PermissionError):
    pass


def verify_webhook_signature(*, body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_payment_signature(*, order_id: str, payment_id: str, signature: str, secret: str) -> bool:
    if not order_id or not payment_id or not signature or not secret:
        return False
    payload = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def ensure_payment_transition(current: str, target: str) -> None:
    allowed = {
        "initiated": {"initiated", "pending", "success", "failed", "cancelled"},
        "pending": {"pending", "success", "failed", "cancelled"},
        "success": {"success", "refund_failed", "refunded"},
        "failed": {"failed", "initiated", "pending"},
        "refund_failed": {"refund_failed", "refunded"},
        "cancelled": {"cancelled"},
        "refunded": {"refunded"},
    }
    if target not in allowed.get(current, set()):
        raise PaymentConflict("Invalid payment status transition")


class PaymentMongoRepository:
    def __init__(
        self,
        payments: AsyncCollection,
        attempts: AsyncCollection,
        history: AsyncCollection,
        webhooks: AsyncCollection,
        refunds: AsyncCollection,
    ) -> None:
        self.payments = payments
        self.attempts = attempts
        self.history = history
        self.webhooks = webhooks
        self.refunds = refunds

    async def create_or_get_order(self, *, payment: dict[str, Any], session=None) -> dict:
        tenant_id = str(payment["tenant_id"])
        patient_id = str(payment["patient_id"])
        key = str(payment["idempotency_key"])
        existing = await self.payments.find_one(
            {"tenant_id": tenant_id, "patient_id": patient_id, "idempotency_key": key},
            session=session,
        )
        if existing:
            return existing
        value = serialize_document({**payment, "status": payment.get("status", "initiated")})
        ensure_payment_transition("initiated", value["status"])
        try:
            await self.payments.insert_one(value, session=session)
        except Exception as exc:
            existing = await self.payments.find_one(
                {"tenant_id": tenant_id, "patient_id": patient_id, "idempotency_key": key},
                session=session,
            )
            if existing:
                return existing
            raise PaymentConflict("Payment order already exists or conflicts") from exc
        await self._record_status(value, value["status"], session=session)
        return value

    async def record_provider_order(self, *, tenant_id: str, payment_id: str, order_id: str, session=None) -> dict | None:
        return await self.payments.find_one_and_update(
            {"tenant_id": tenant_id, "id": payment_id, "provider_order_id": None},
            {"$set": {"provider_order_id": order_id}},
            return_document=ReturnDocument.AFTER,
            session=session,
        )

    async def verify_success(
        self, *, tenant_id: str, patient_id: str, payment_id: str,
        provider_order_id: str, provider_transaction_id: str, amount_paise: int,
        currency: str = "INR", session=None,
    ) -> dict:
        payment = await self.payments.find_one(
            {"tenant_id": tenant_id, "id": payment_id, "patient_id": patient_id},
            session=session,
        )
        if payment is None:
            raise PaymentAuthorizationError("Payment is not accessible")
        if payment["provider_order_id"] != provider_order_id or payment["amount_paise"] != amount_paise or payment["currency"] != currency:
            raise PaymentConflict("Provider payment does not match expected order")
        if payment["status"] == "success":
            return payment
        ensure_payment_transition(payment["status"], "success")
        updated = await self.payments.find_one_and_update(
            {"tenant_id": tenant_id, "id": payment_id, "status": payment["status"]},
            {"$set": {
                "status": "success", "provider_transaction_id": provider_transaction_id,
                "verified_at": datetime.now(UTC).isoformat(),
            }},
            return_document=ReturnDocument.AFTER,
            session=session,
        )
        if updated is None:
            raise PaymentConflict("Payment status changed concurrently")
        await self._record_status(updated, "success", session=session)
        return updated

    async def record_webhook(self, *, event_id: str, event: dict[str, Any], session=None) -> bool:
        try:
            await self.webhooks.insert_one({
                "provider": "razorpay", "event_id": event_id,
                "received_at": datetime.now(UTC).isoformat(), "event": serialize_document(event),
            }, session=session)
            return True
        except Exception:
            return False

    async def create_refund(self, *, tenant_id: str, patient_id: str, payment_id: str, amount_paise: int, session=None) -> dict:
        payment = await self.payments.find_one(
            {"tenant_id": tenant_id, "id": payment_id, "patient_id": patient_id}, session=session,
        )
        if payment is None:
            raise PaymentAuthorizationError("Payment is not accessible")
        if payment["status"] not in {"success", "refund_failed"}:
            raise PaymentConflict("Payment is not eligible for refund")
        existing = await self.refunds.find_one({"tenant_id": tenant_id, "payment_id": payment_id}, session=session)
        if existing:
            return existing
        refund = {
            "id": f"refund-{payment_id}", "tenant_id": tenant_id, "payment_id": payment_id,
            "amount_paise": amount_paise, "status": "refund_pending",
            "created_at": datetime.now(UTC).isoformat(),
        }
        await self.refunds.insert_one(refund, session=session)
        return refund

    async def _record_status(self, payment: dict, status: str, *, session=None) -> None:
        await self.history.insert_one({
            "id": f"{payment['id']}:{status}:{datetime.now(UTC).timestamp()}",
            "tenant_id": payment["tenant_id"], "payment_id": payment["id"],
            "status": status, "occurred_at": datetime.now(UTC).isoformat(),
        }, session=session)
