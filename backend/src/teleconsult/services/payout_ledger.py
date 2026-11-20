"""Section 194J Statutory Tax Withholding & Doctor Payout Ledger Service.

Under Section 194J of the Indian Income Tax Act (1961), payments made to medical
professionals (doctors) for professional services are subject to 10% Tax Deducted
at Source (TDS).

This service manages:
1. Computation of Gross consultation revenue, 15% platform commission, 10% Section 194J TDS, and Net doctor payable.
2. Idempotent recording of structured entries into the `doctor_payout_ledger` collection upon payment capture.
3. Accounting reconciliation and audit trail for clinician financial settlements.

Checklist References:
- AUD-05: Section 194J 10% TDS Withholding
- GL-07: Statutory Compliance Gate
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("teleconsult.finance.payout_ledger")

# Statutory Defaults
DEFAULT_PLATFORM_COMMISSION_RATE = 0.15  # 15% platform fee
DEFAULT_SECTION_194J_TDS_RATE = 0.10     # 10% TDS on professional medical fees


def get_current_financial_year(dt: datetime | None = None) -> str:
    """Calculate the Indian Financial Year (April 1 to March 31)."""
    target = dt or datetime.now(UTC)
    year = target.year
    # In India, Financial Year starts April 1
    if target.month >= 4:
        return f"{year}-{year + 1}"
    return f"{year - 1}-{year}"


def calculate_doctor_payout_breakdown(
    gross_amount_paise: int,
    platform_commission_rate: float = DEFAULT_PLATFORM_COMMISSION_RATE,
    tds_rate: float = DEFAULT_SECTION_194J_TDS_RATE,
) -> dict[str, Any]:
    """Calculate the authoritative financial breakdown for a teleconsultation payment.

    Args:
        gross_amount_paise: Total patient-paid consultation fee in paise.
        platform_commission_rate: Fraction withheld by clinic platform (default 0.15).
        tds_rate: Section 194J statutory tax withholding fraction (default 0.10).

    Returns:
        Structured financial breakdown in paise and formatted INR.
    """
    if gross_amount_paise < 0:
        raise ValueError("Gross consultation amount cannot be negative")

    platform_fee_paise = round(gross_amount_paise * platform_commission_rate)
    tds_withheld_paise = round(gross_amount_paise * tds_rate)
    net_payable_paise = gross_amount_paise - platform_fee_paise - tds_withheld_paise

    return {
        "gross_amount_paise": gross_amount_paise,
        "gross_amount_inr": gross_amount_paise / 100.0,
        "platform_fee_rate": platform_commission_rate,
        "platform_fee_paise": platform_fee_paise,
        "platform_fee_inr": platform_fee_paise / 100.0,
        "tds_section": "194J",
        "tds_rate": tds_rate,
        "tds_withheld_paise": tds_withheld_paise,
        "tds_withheld_inr": tds_withheld_paise / 100.0,
        "net_payable_paise": net_payable_paise,
        "net_payable_inr": net_payable_paise / 100.0,
    }


async def record_doctor_payout_ledger_entry(
    db: Any,
    tenant_id: str,
    payment: dict[str, Any],
    appointment_id: str,
    doctor_id: str,
    platform_commission_rate: float = DEFAULT_PLATFORM_COMMISSION_RATE,
    tds_rate: float = DEFAULT_SECTION_194J_TDS_RATE,
) -> dict[str, Any]:
    """Idempotently record a statutory doctor payout ledger entry upon payment capture.

    Ensures zero duplicate ledger rows if payment verification is re-attempted.
    """
    payment_id = str(payment.get("id"))
    idempotency_key = f"payout-{payment_id}"

    # 1. Idempotency Check: return existing ledger record if already created
    existing = await db["doctor_payout_ledger"].find_one({
        "tenant_id": str(tenant_id),
        "$or": [
            {"payment_id": payment_id},
            {"idempotency_key": idempotency_key},
        ],
    })
    if existing:
        logger.info("Doctor payout ledger entry already exists for payment %s", payment_id)
        return existing

    gross_amount_paise = int(payment.get("amount_paise") or payment.get("amount") or 0)
    breakdown = calculate_doctor_payout_breakdown(
        gross_amount_paise=gross_amount_paise,
        platform_commission_rate=platform_commission_rate,
        tds_rate=tds_rate,
    )

    now_iso = datetime.now(UTC).isoformat()
    financial_year = get_current_financial_year()

    ledger_doc = {
        "id": f"payout-{secrets.token_hex(8)}",
        "tenant_id": str(tenant_id),
        "payment_id": payment_id,
        "appointment_id": str(appointment_id),
        "doctor_id": str(doctor_id),
        "currency": payment.get("currency", "INR"),
        "financial_year": financial_year,
        "idempotency_key": idempotency_key,

        # Financial breakdown
        "gross_amount_paise": breakdown["gross_amount_paise"],
        "platform_fee_rate": breakdown["platform_fee_rate"],
        "platform_fee_paise": breakdown["platform_fee_paise"],
        "tds_section": breakdown["tds_section"],
        "tds_rate": breakdown["tds_rate"],
        "tds_withheld_paise": breakdown["tds_withheld_paise"],
        "net_payable_paise": breakdown["net_payable_paise"],

        # Status & reconciliation
        "status": "accrued",
        "settlement_status": "pending",
        "created_at": now_iso,
        "reconciled_at": now_iso,
    }

    try:
        await db["doctor_payout_ledger"].insert_one(ledger_doc)
        logger.info(
            "Created Section 194J payout ledger entry %s for Doctor %s (Net: ₹%.2f, TDS: ₹%.2f)",
            ledger_doc["id"],
            doctor_id,
            breakdown["net_payable_inr"],
            breakdown["tds_withheld_inr"],
        )
    except Exception as exc:
        # Handle concurrent insert race condition gracefully
        logger.warning("Concurrent insert detected for payout ledger %s: %s", idempotency_key, exc)
        found = await db["doctor_payout_ledger"].find_one({"idempotency_key": idempotency_key})
        if found:
            return found
        raise

    return ledger_doc
