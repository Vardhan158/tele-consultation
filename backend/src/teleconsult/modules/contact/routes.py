import logging
import re
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database

log = logging.getLogger("teleconsult.contact")


async def public_access() -> None:
    """Explicitly mark intentionally public contact endpoints for route audits."""


public_access._is_authz = True

router = APIRouter(
    prefix="/contact",
    tags=["contact"],
    dependencies=[Depends(public_access)],
)


class ContactInquiryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    subject: str = Field(min_length=2, max_length=150)
    message: str = Field(min_length=5, max_length=3000)
    privacy_consent: bool = Field(...)

    @field_validator("name", "subject", "message")
    @classmethod
    def strip_and_validate_non_empty(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty or whitespace.")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            return None
        # Normalize digits
        digits = re.sub(r"[\s()\-]", "", cleaned)
        if digits.startswith("+91"):
            digits = digits[3:]
        elif digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]
        elif digits.startswith("+") and len(digits) == 11:
            digits = digits[1:]
        if not re.fullmatch(r"\d{10}", digits):
            raise ValueError("Phone number must be exactly 10 digits.")
        return digits

    @field_validator("privacy_consent")
    @classmethod
    def validate_privacy_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Privacy consent is required.")
        return v


class ContactInquiryResponse(BaseModel):
    id: str
    status: str
    message: str


@router.post(
    "/inquiries",
    status_code=status.HTTP_201_CREATED,
    response_model=ContactInquiryResponse,
)
async def create_contact_inquiry(
    payload: ContactInquiryCreate,
    request: Request,
) -> ContactInquiryResponse:
    settings = get_settings()
    tenant_id = settings.default_tenant_id or "1"
    inquiry_id = str(uuid4())
    now = datetime.now(UTC)

    inquiry_doc = {
        "id": inquiry_id,
        "tenant_id": tenant_id,
        "name": payload.name,
        "email": payload.email.casefold(),
        "phone": payload.phone,
        "subject": payload.subject,
        "message": payload.message,
        "privacy_consent": payload.privacy_consent,
        "status": "received",
        "created_at": now.isoformat(),
        "client_ip": request.client.host if request.client else None,
    }

    if settings.mongodb_enabled:
        try:
            db = mongo_database.database()
            await db["contact_inquiries"].insert_one(inquiry_doc)
        except Exception as exc:
            log.warning("Could not persist contact inquiry to MongoDB: %s", exc)

    log.info(
        "Contact inquiry received [id=%s, subject=%s, email=%s]",
        inquiry_id,
        payload.subject,
        payload.email,
    )

    return ContactInquiryResponse(
        id=inquiry_id,
        status="received",
        message="Your inquiry has been received. Our team will get back to you shortly.",
    )
