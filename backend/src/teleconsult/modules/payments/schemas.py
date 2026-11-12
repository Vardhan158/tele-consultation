from uuid import UUID

from pydantic import BaseModel, Field


class PaymentInitiateRequest(BaseModel):
    appointment_id: UUID


class PaymentResponse(BaseModel):
    id: UUID
    appointment_id: UUID
    amount_paise: int
    currency: str
    status: str
    provider: str
    provider_transaction_id: str | None = None
    order_id: str | None = None
    razorpay_key_id: str | None = None
    receipt: str | None = None


class PaymentVerifyRequest(BaseModel):
    provider_transaction_id: str = Field(min_length=3, max_length=160)
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None


class RefundResponse(BaseModel):
    id: UUID
    status: str
    amount_paise: int
