from datetime import datetime, UTC
from collections.abc import AsyncIterator
from uuid import UUID
import secrets
import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.patient_portal.models import Appointment, Doctor
from teleconsult.modules.payments.models import PaymentTransaction
from teleconsult.modules.payments.schemas import PaymentInitiateRequest, PaymentResponse, PaymentVerifyRequest, RefundResponse
from teleconsult.modules.notifications.service import queue_patient_notification
from teleconsult.config.settings import get_settings
try:
    import razorpay
except ModuleNotFoundError:  # Allows route-contract tests to run before optional provider install.
    razorpay = None

router = APIRouter(prefix="/patient/payments", tags=["payments"])


async def payment_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


def get_razorpay_client():
    settings = get_settings()
    if razorpay is None:
        return None
    if (
        settings.razorpay_key_id
        and settings.razorpay_key_secret
        and not settings.razorpay_key_id.startswith("rzp_test_placeholder")
    ):
        try:
            return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
        except Exception:
            return None
    return None


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    session: AsyncSession | None = Depends(payment_session),
    principal: Principal = Depends(require("payment:read")),
) -> list[PaymentResponse]:
    if get_settings().mongodb_enabled:
        documents = mongo_database.database()["payments"].find({
            "tenant_id": principal.tenant_id, "patient_id": principal.user_id,
        }).sort("created_at", -1)
        return [PaymentResponse(
            id=UUID(document["id"]), appointment_id=UUID(document["appointment_id"]),
            amount_paise=int(document["amount_paise"]), currency=document.get("currency", "INR"),
            status=document["status"], provider=document.get("provider", "razorpay"),
            provider_transaction_id=document.get("provider_transaction_id"),
            order_id=document.get("provider_order_id"), receipt=document.get("receipt"),
        ) async for document in documents]
    if session is None:
        raise HTTPException(status_code=503, detail="No application database is configured")
    result = await session.scalars(select(PaymentTransaction).where(
        PaymentTransaction.tenant_id == UUID(principal.tenant_id), PaymentTransaction.patient_id == UUID(principal.user_id)
    ).order_by(PaymentTransaction.created_at.desc()))
    return [
        PaymentResponse(
            id=tx.id,
            appointment_id=tx.appointment_id,
            amount_paise=tx.amount_paise,
            currency=tx.currency,
            status=tx.status,
            provider=tx.provider,
            provider_transaction_id=tx.provider_transaction_id,
        )
        for tx in result
    ]


@router.post("/initiate", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def initiate_payment(
    payload: PaymentInitiateRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("payment:create")),
) -> PaymentResponse:
    tenant_id, patient_id = UUID(principal.tenant_id), UUID(principal.user_id)
    settings = get_settings()
    existing = await session.scalar(select(PaymentTransaction).where(PaymentTransaction.idempotency_key == idempotency_key))
    if existing:
        return PaymentResponse(
            id=existing.id,
            appointment_id=existing.appointment_id,
            amount_paise=existing.amount_paise,
            currency=existing.currency,
            status=existing.status,
            provider=existing.provider,
            provider_transaction_id=existing.provider_transaction_id,
            order_id=existing.provider_order_id,
            razorpay_key_id=settings.razorpay_key_id or "rzp_test_placeholder"
        )
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == payload.appointment_id, Appointment.tenant_id == tenant_id, Appointment.patient_id == patient_id
    ))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status not in {"pending_payment", "payment_failed"}:
        raise HTTPException(status_code=409, detail="Appointment is not payable")
    doctor = await session.get(Doctor, appointment.doctor_id)
    if doctor is None:
        raise HTTPException(status_code=409, detail="Fee configuration unavailable")

    transaction = PaymentTransaction(
        tenant_id=tenant_id,
        appointment_id=appointment.id,
        patient_id=patient_id,
        idempotency_key=idempotency_key,
        amount_paise=doctor.fee_paise,
        currency="INR",
        provider="razorpay",
        status="initiated"
    )
    appointment.payment_status = "pending"
    session.add(transaction)
    await session.flush()

    rzp_client = get_razorpay_client()
    if rzp_client is None:
        raise HTTPException(status_code=503, detail="Razorpay test credentials are not configured")
    try:
        order_data = rzp_client.order.create({
            "amount": transaction.amount_paise,
            "currency": transaction.currency,
            "receipt": str(transaction.id)[:40],
            "notes": {"appointment_id": str(appointment.id), "patient_id": str(patient_id)}
        })
        order_id = order_data["id"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to create Razorpay order") from exc
    transaction.provider_order_id = order_id

    return PaymentResponse(
        id=transaction.id,
        appointment_id=transaction.appointment_id,
        amount_paise=transaction.amount_paise,
        currency=transaction.currency,
        status=transaction.status,
        provider=transaction.provider,
        provider_transaction_id=transaction.provider_transaction_id,
        order_id=order_id,
        razorpay_key_id=settings.razorpay_key_id or "rzp_test_placeholder"
    )


@router.post("/{payment_id}/verify", response_model=PaymentResponse)
async def verify_payment(
    payment_id: UUID,
    payload: PaymentVerifyRequest,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("payment:verify")),
) -> PaymentResponse:
    transaction = await session.scalar(select(PaymentTransaction).where(
        PaymentTransaction.id == payment_id, PaymentTransaction.tenant_id == UUID(principal.tenant_id),
        PaymentTransaction.patient_id == UUID(principal.user_id)
    ))
    if transaction is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    if transaction.status == "success":
        return PaymentResponse(
            id=transaction.id,
            appointment_id=transaction.appointment_id,
            amount_paise=transaction.amount_paise,
            currency=transaction.currency,
            status=transaction.status,
            provider=transaction.provider,
            provider_transaction_id=transaction.provider_transaction_id,
        )

    settings = get_settings()
    rzp_client = get_razorpay_client()
    provider_success = False

    if rzp_client and payload.razorpay_signature and payload.razorpay_order_id == transaction.provider_order_id:
        try:
            rzp_client.utility.verify_payment_signature({
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.provider_transaction_id,
                "razorpay_signature": payload.razorpay_signature,
            })
            provider_success = True
        except Exception:
            provider_success = False
    provider_uncertain = False
    transaction.provider_transaction_id = payload.provider_transaction_id
    appointment = await session.get(Appointment, transaction.appointment_id)

    if provider_success:
        transaction.status, transaction.verified_at = "success", datetime.now(UTC)
        if appointment:
            appointment.payment_status = "success"
            appointment.status = "confirmed"
            queue_patient_notification(session, tenant_id=transaction.tenant_id, patient_id=transaction.patient_id,
                event_type="payment_success", subject="Payment received", body="Your payment was verified and your appointment is confirmed.")
    elif provider_uncertain:
        transaction.status = "pending"
        if appointment:
            appointment.payment_status = "pending"
    else:
        transaction.status = "failed"
        if appointment:
            appointment.payment_status = "failed"
        queue_patient_notification(session, tenant_id=transaction.tenant_id, patient_id=transaction.patient_id,
            event_type="payment_failed", subject="Payment needs attention", body="Your payment could not be verified. Your appointment details have been preserved for retry.")

    return PaymentResponse(
        id=transaction.id,
        appointment_id=transaction.appointment_id,
        amount_paise=transaction.amount_paise,
        currency=transaction.currency,
        status=transaction.status,
        provider=transaction.provider,
        provider_transaction_id=transaction.provider_transaction_id,
    )


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
    session: AsyncSession = Depends(tenant_session),
) -> None:
    settings = get_settings()
    body = await request.body()
    if not settings.razorpay_webhook_secret or not x_razorpay_signature:
        raise HTTPException(status_code=401, detail="Webhook verification is not configured")
    expected = hmac.new(settings.razorpay_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    event = json.loads(body)
    payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id")
    if not order_id:
        return
    transaction = await session.scalar(select(PaymentTransaction).where(PaymentTransaction.provider_order_id == order_id))
    if transaction is None:
        return
    appointment = await session.get(Appointment, transaction.appointment_id)
    if event.get("event") == "payment.captured":
        transaction.status = "success"
        transaction.provider_transaction_id = payment_entity.get("id")
        transaction.verified_at = datetime.now(UTC)
        if appointment:
            appointment.payment_status = "success"
            appointment.status = "confirmed"
    elif event.get("event") in {"payment.failed", "order.payment_failed"}:
        transaction.status = "failed"
        if appointment:
            appointment.payment_status = "failed"


@router.post("/{payment_id}/refund", response_model=RefundResponse)
async def request_refund(
    payment_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("payment:refund")),
) -> RefundResponse:
    transaction = await session.scalar(select(PaymentTransaction).where(
        PaymentTransaction.id == payment_id, PaymentTransaction.tenant_id == UUID(principal.tenant_id),
        PaymentTransaction.patient_id == UUID(principal.user_id)
    ))
    if transaction is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    if transaction.status not in {"success", "refund_failed"}:
        raise HTTPException(status_code=409, detail="Payment is not eligible for refund")

    rzp_client = get_razorpay_client()
    if rzp_client and transaction.provider_transaction_id:
        try:
            rzp_client.payment.refund(transaction.provider_transaction_id, {"amount": transaction.amount_paise})
        except Exception as exc:
            transaction.status = "refund_failed"
            raise HTTPException(status_code=502, detail="Razorpay refund could not be completed") from exc
    elif rzp_client is None:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")

    transaction.status = "refunded"
    appointment = await session.get(Appointment, transaction.appointment_id)
    if appointment:
        appointment.payment_status = "refunded"
    return RefundResponse(
        id=transaction.id,
        status=transaction.status,
        amount_paise=transaction.amount_paise
    )
    transaction.status = "refunded"
    return transaction
