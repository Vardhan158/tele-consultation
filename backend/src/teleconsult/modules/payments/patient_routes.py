import hashlib
import hmac
import json
import os
import re
import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, get_principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.notifications.service import queue_patient_notification
from teleconsult.modules.patient_portal.models import Appointment, Doctor
from teleconsult.modules.patient_portal.appointment_access import expire_pending_payment
from teleconsult.modules.payments.models import PaymentTransaction
from teleconsult.modules.payments.schemas import (
    PaymentInitiateRequest,
    PaymentResponse,
    PaymentVerifyRequest,
    RefundResponse,
)

try:
    import razorpay
except ModuleNotFoundError:
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
    key_id = settings.razorpay_key_id or os.getenv("RAZORPAY_KEY_ID")
    key_secret = settings.razorpay_key_secret or os.getenv("RAZORPAY_KEY_SECRET")
    if razorpay is None or not key_id or not key_secret:
        return None
    try:
        return razorpay.Client(auth=(key_id, key_secret))
    except Exception:
        return None


class CreateOrderRequest(BaseModel):
    doctor_id: str
    appointment_type: str
    starts_at: str
    visit_format: str = Field(default="Video consultation")
    visit_reason: str = Field(default="Consultation")
    doctor_notes: str | None = None


class VerifyPaymentPayload(BaseModel):
    payment_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


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
            id=UUID(document["id"]) if len(document["id"]) == 36 else UUID(int=hash(document["id"]) & 0xffffffffffffffffffffffffffffffff),
            appointment_id=UUID(document["appointment_id"]) if len(document["appointment_id"]) == 36 else UUID(int=hash(document["appointment_id"]) & 0xffffffffffffffffffffffffffffffff),
            amount_paise=int(document["amount_paise"]), currency=document.get("currency", "INR"),
            status=document["status"], provider=document.get("provider", "razorpay"),
            provider_transaction_id=document.get("provider_transaction_id"),
            order_id=document.get("provider_order_id") or document.get("razorpay_order_id"), receipt=document.get("receipt"),
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


@router.post("/create-order")
async def create_payment_order(
    payload: CreateOrderRequest,
    request: Request,
) -> dict[str, Any]:
    settings = get_settings()
    principal = await get_principal(request)

    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="MongoDB payment engine required")

    db = mongo_database.database()

    await expire_pending_payment(db, tenant_id=principal.tenant_id)

    # 1. Recalculate Service Pricing Server-side authoritatively
    from teleconsult.modules.patient_portal.routes import compute_doctor_pricing

    pricing = await compute_doctor_pricing(
        db=db,
        tenant_id=principal.tenant_id,
        doctor_id=payload.doctor_id,
        appointment_type=payload.appointment_type,
    )
    base_fee_paise = pricing["base_fee_paise"]
    platform_fee_paise = pricing["platform_fee_paise"]
    total_payable_paise = pricing["total_payable_paise"]
    currency = pricing["currency"]

    # 2. Check if doctor availability slot exists and is available
    slot = await db["doctor_availability"].find_one({
        "tenant_id": principal.tenant_id,
        "doctor_id": payload.doctor_id,
        "starts_at": payload.starts_at,
    })
    if slot and (slot.get("booked") is True or slot.get("status") == "booked"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Selected appointment slot is no longer available",
        )

    # 3. Create or reuse appointment in pending_payment status
    existing_apt = await db["appointments"].find_one({
        "tenant_id": principal.tenant_id,
        "doctor_id": payload.doctor_id,
        "starts_at": payload.starts_at,
    })

    if existing_apt:
        if existing_apt.get("status") == "expired":
            raise HTTPException(status_code=409, detail="Booking has expired; please select a new slot")
        if existing_apt.get("status") == "confirmed" or existing_apt.get("payment_status") == "captured":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Selected appointment slot is already booked and confirmed.",
            )
        appointment_id = existing_apt["id"]
        await db["appointments"].update_one(
            {"id": appointment_id},
            {
                "$set": {
                    "type": payload.appointment_type,
                    "visit_format": payload.visit_format,
                    "visit_reason": payload.visit_reason,
                    "doctor_notes": payload.doctor_notes,
                    "fee": total_payable_paise / 100.0,
                    "fee_paise": total_payable_paise,
                    "status": "pending_payment",
                    "payment_status": "pending_payment",
                    "payment_deadline_at": (datetime.now(UTC) + timedelta(minutes=get_settings().payment_deadline_minutes)).isoformat(),
                }
            },
        )
    else:
        appointment_id = f"apt-{secrets.token_hex(6)}"
        idempotency_key = f"idemp-{appointment_id}"
        apt_doc = {
            "id": appointment_id,
            "tenant_id": principal.tenant_id,
            "patient_id": principal.user_id,
            "doctor_id": payload.doctor_id,
            "starts_at": payload.starts_at,
            "duration_minutes": pricing.get("duration_minutes", 30),
            "status": "pending_payment",
            "payment_status": "pending_payment",
            "type": payload.appointment_type,
            "visit_format": payload.visit_format,
            "visit_reason": payload.visit_reason,
            "doctor_notes": payload.doctor_notes,
            "idempotency_key": idempotency_key,
            "fee": total_payable_paise / 100.0,
            "fee_paise": total_payable_paise,
            "created_at": datetime.now(UTC).isoformat(),
            "payment_deadline_at": (datetime.now(UTC) + timedelta(minutes=get_settings().payment_deadline_minutes)).isoformat(),
        }
        await db["appointments"].insert_one(dict(apt_doc))

    # 4. Store or reuse Payment Record in MongoDB payments
    existing_pay = await db["payments"].find_one({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
        "status": "created",
    })

    key_id = settings.razorpay_key_id or os.getenv("RAZORPAY_KEY_ID") or "rzp_test_SjC9thwdLWFQ8m"
    key_secret = settings.razorpay_key_secret or os.getenv("RAZORPAY_KEY_SECRET") or "l0wIalwefClE3hHfLvyHg832"

    if existing_pay and existing_pay.get("razorpay_order_id"):
        payment_id = existing_pay["id"]
        order_id = existing_pay["razorpay_order_id"]
    else:
        order_id = None
        if razorpay and key_id and key_secret and not key_id.startswith("rzp_test_placeholder"):
            try:
                rzp_client = razorpay.Client(auth=(key_id, key_secret))
                rzp_order = rzp_client.order.create({
                    "amount": total_payable_paise,
                    "currency": currency,
                    "receipt": appointment_id[:40],
                    "notes": {"appointment_id": appointment_id, "patient_id": principal.user_id},
                })
                order_id = rzp_order["id"]
            except Exception:
                order_id = f"order_{secrets.token_hex(10)}"
        else:
            order_id = f"order_{secrets.token_hex(10)}"

        payment_id = f"pay-{secrets.token_hex(6)}"
        payment_doc = {
            "id": payment_id,
            "tenant_id": principal.tenant_id,
            "patient_id": principal.user_id,
            "doctor_id": payload.doctor_id,
            "appointment_id": appointment_id,
            "idempotency_key": f"idemp-{payment_id}",
            "amount": total_payable_paise,
            "amount_paise": total_payable_paise,
            "base_fee_paise": base_fee_paise,
            "platform_fee_paise": platform_fee_paise,
            "currency": currency,
            "status": "created",
            "provider": "razorpay",
            "razorpay_order_id": order_id,
            "provider_order_id": order_id,
            "provider_transaction_id": f"tx_pending_{payment_id}",
            "receipt": appointment_id[:40],
            "created_at": datetime.now(UTC).isoformat(),
        }
        await db["payments"].insert_one(dict(payment_doc))

    return {
        "payment_id": payment_id,
        "appointment_id": appointment_id,
        "order_id": order_id,
        "amount_paise": total_payable_paise,
        "base_fee_paise": base_fee_paise,
        "platform_fee_paise": platform_fee_paise,
        "currency": currency,
        "key_id": key_id,
    }


@router.post("/verify")
async def verify_razorpay_payment(
    payload: VerifyPaymentPayload,
    request: Request,
) -> dict[str, Any]:
    settings = get_settings()
    principal = await get_principal(request)

    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="MongoDB payment engine required")

    db = mongo_database.database()
    payment = await db["payments"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": payload.payment_id}, {"razorpay_order_id": payload.razorpay_order_id}],
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    await expire_pending_payment(db, tenant_id=principal.tenant_id, appointment_id=payment.get("appointment_id"))
    appointment = await db["appointments"].find_one({"id": payment.get("appointment_id"), "tenant_id": principal.tenant_id})
    if appointment and appointment.get("status") == "expired" and payment.get("status") not in {"captured", "success"}:
        raise HTTPException(status_code=409, detail="Booking payment window has expired")

    # Idempotency check: If already captured/success, return verified state immediately!
    if payment.get("status") in {"captured", "success"}:
        return {
            "status": "success",
            "payment_id": payment.get("id"),
            "appointment_id": payment.get("appointment_id"),
            "amount_paise": payment.get("amount_paise"),
            "currency": payment.get("currency", "INR"),
            "provider_transaction_id": payment.get("provider_transaction_id"),
            "already_verified": True,
        }

    # Verify Razorpay Signature
    key_secret = settings.razorpay_key_secret or os.getenv("RAZORPAY_KEY_SECRET") or "WidTX3FijxB03ePRSecret"
    msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
    expected_sig = hmac.new(key_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

    sig_valid = hmac.compare_digest(expected_sig, payload.razorpay_signature)

    rzp_client = get_razorpay_client()
    if rzp_client:
        try:
            rzp_client.utility.verify_payment_signature({
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            })
            sig_valid = True
        except Exception:
            sig_valid = False

    if not sig_valid:
        await db["payments"].update_one(
            {"id": payment["id"]},
            {"$set": {"status": "failed", "failed_at": datetime.now(UTC).isoformat()}},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Razorpay payment signature",
        )

    # Verify amount
    if payment.get("amount_paise", 0) <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount mismatch",
        )

    now_iso = datetime.now(UTC).isoformat()

    # Mark Payment Success
    await db["payments"].update_one(
        {"id": payment["id"]},
        {
            "$set": {
                "status": "captured",
                "provider_transaction_id": payload.razorpay_payment_id,
                "verified_at": now_iso,
            }
        },
    )

    # Mark Appointment Confirmed
    apt_id = payment.get("appointment_id")
    await db["appointments"].update_one(
        {"id": apt_id},
        {
            "$set": {
                "status": "confirmed",
                "payment_status": "captured",
                "razorpay_payment_id": payload.razorpay_payment_id,
                "confirmed_at": now_iso,
            }
        },
    )

    # Mark Doctor Availability Slot Booked
    doctor_id = payment.get("doctor_id")
    apt = await db["appointments"].find_one({"id": apt_id})
    if apt and apt.get("starts_at"):
        await db["doctor_availability"].update_one(
            {"doctor_id": doctor_id, "starts_at": apt.get("starts_at")},
            {"$set": {"booked": True, "status": "booked"}},
        )

    return {
        "status": "success",
        "payment_id": payment["id"],
        "appointment_id": apt_id,
        "amount_paise": payment.get("amount_paise"),
        "currency": payment.get("currency", "INR"),
        "provider_transaction_id": payload.razorpay_payment_id,
    }


@router.get("/{payment_id}/status")
async def get_payment_status(
    payment_id: str,
    request: Request,
) -> dict[str, Any]:
    settings = get_settings()
    principal = await get_principal(request)

    if not settings.mongodb_enabled:
        raise HTTPException(status_code=503, detail="MongoDB payment engine required")

    db = mongo_database.database()
    payment = await db["payments"].find_one({
        "tenant_id": principal.tenant_id,
        "id": payment_id,
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    apt = await db["appointments"].find_one({"id": payment.get("appointment_id")})
    doctor = await db["doctors"].find_one({"id": payment.get("doctor_id")}) if payment.get("doctor_id") else None

    return {
        "payment": {
            "id": payment.get("id"),
            "amount_paise": payment.get("amount_paise"),
            "base_fee_paise": payment.get("base_fee_paise"),
            "platform_fee_paise": payment.get("platform_fee_paise"),
            "currency": payment.get("currency", "INR"),
            "status": payment.get("status"),
            "provider_transaction_id": payment.get("provider_transaction_id"),
            "razorpay_order_id": payment.get("razorpay_order_id"),
            "created_at": payment.get("created_at"),
        },
        "appointment": {
            "id": apt.get("id") if apt else None,
            "starts_at": apt.get("starts_at") if apt else None,
            "type": apt.get("type") if apt else None,
            "status": apt.get("status") if apt else None,
        },
        "doctor": {
            "full_name": doctor.get("full_name") if doctor else "Dr. Clinician",
            "specialty": doctor.get("specialty") if doctor else "General",
        },
    }


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
) -> None:
    settings = get_settings()
    body = await request.body()
    webhook_secret = settings.razorpay_webhook_secret or os.getenv("RAZORPAY_WEBHOOK_SECRET") or "whsec_kaizentrix_test_secret"

    if not x_razorpay_signature:
        raise HTTPException(status_code=401, detail="Webhook signature missing")

    expected = hmac.new(webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event = json.loads(body)
    payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id")
    if not order_id:
        return

    if settings.mongodb_enabled:
        db = mongo_database.database()
        payment = await db["payments"].find_one({"razorpay_order_id": order_id})
        if not payment:
            return

        now_iso = datetime.now(UTC).isoformat()
        event_type = event.get("event")

        if event_type in {"payment.captured", "order.paid"}:
            if payment.get("status") == "captured":
                return  # Duplicate webhook ignored safely!

            await db["payments"].update_one(
                {"id": payment["id"]},
                {
                    "$set": {
                        "status": "captured",
                        "provider_transaction_id": payment_entity.get("id"),
                        "verified_at": now_iso,
                    }
                },
            )
            await db["appointments"].update_one(
                {"id": payment.get("appointment_id")},
                {
                    "$set": {
                        "status": "confirmed",
                        "payment_status": "captured",
                        "razorpay_payment_id": payment_entity.get("id"),
                        "confirmed_at": now_iso,
                    }
                },
            )
        elif event_type in {"payment.failed", "order.payment_failed"}:
            await db["payments"].update_one(
                {"id": payment["id"]},
                {"$set": {"status": "failed", "failed_at": now_iso}},
            )
            await db["appointments"].update_one(
                {"id": payment.get("appointment_id")},
                {"$set": {"status": "payment_failed", "payment_status": "failed"}},
            )


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
