from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PaymentInitiateRequest(BaseModel):
    appointment_id: UUID


class PaymentResponse(BaseModel):
    id: UUID | str
    appointment_id: UUID | str
    amount_paise: int
    currency: str = "INR"
    status: str
    provider: str = "razorpay"
    provider_transaction_id: str | None = None
    order_id: str | None = None
    razorpay_key_id: str | None = None
    receipt: str | None = None
    created_at: datetime | str | None = None
    doctor_name: str | None = None
    doctor_specialty: str | None = None
    patient_name: str | None = None
    appointment_date: str | None = None
    appointment_type: str | None = None
    formatted_amount: str | None = None
    formatted_status: str | None = None


class PaymentVerifyRequest(BaseModel):
    provider_transaction_id: str = Field(min_length=3, max_length=160)
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None


class RefundResponse(BaseModel):
    id: UUID | str
    status: str
    amount_paise: int
