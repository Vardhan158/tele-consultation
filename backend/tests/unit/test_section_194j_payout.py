import pytest
from datetime import UTC, datetime
from teleconsult.services.payout_ledger import (
    calculate_doctor_payout_breakdown,
    get_current_financial_year,
)


def test_section_194j_payout_calculation():
    """Verify Section 194J 10% TDS and 15% platform fee on consultation fee."""
    # Example: Patient pays ₹1,000 (100,000 paise)
    gross_paise = 100_000

    breakdown = calculate_doctor_payout_breakdown(
        gross_amount_paise=gross_paise,
        platform_commission_rate=0.15,
        tds_rate=0.10,
    )

    # 15% platform fee on ₹1,000 = ₹150 (15,000 paise)
    assert breakdown["platform_fee_paise"] == 15_000
    assert breakdown["platform_fee_inr"] == 150.0

    # 10% Section 194J TDS on ₹1,000 = ₹100 (10,000 paise)
    assert breakdown["tds_section"] == "194J"
    assert breakdown["tds_rate"] == 0.10
    assert breakdown["tds_withheld_paise"] == 10_000
    assert breakdown["tds_withheld_inr"] == 100.0

    # Net payable to doctor = ₹1,000 - ₹150 - ₹100 = ₹750 (75,000 paise)
    assert breakdown["net_payable_paise"] == 75_000
    assert breakdown["net_payable_inr"] == 750.0

    # Sum of parts must exactly equal gross
    assert (
        breakdown["platform_fee_paise"]
        + breakdown["tds_withheld_paise"]
        + breakdown["net_payable_paise"]
        == gross_paise
    )


def test_section_194j_higher_fee_calculation():
    """Verify Section 194J calculation on specialist fee (₹2,500 = 250,000 paise)."""
    gross_paise = 250_000

    breakdown = calculate_doctor_payout_breakdown(gross_amount_paise=gross_paise)

    # Platform fee (15%): ₹375 (37,500 paise)
    assert breakdown["platform_fee_paise"] == 37_500
    # TDS (10%): ₹250 (25,000 paise)
    assert breakdown["tds_withheld_paise"] == 25_000
    # Net doctor payout: ₹1,875 (187,500 paise)
    assert breakdown["net_payable_paise"] == 187_500


def test_negative_gross_amount_raises_error():
    """Negative consultation fees must be rejected with ValueError."""
    with pytest.raises(ValueError):
        calculate_doctor_payout_breakdown(gross_amount_paise=-500)


def test_financial_year_calculation():
    """Financial year must map April to March correctly under Indian tax calendar."""
    # May 2026 -> FY 2026-2027
    may_date = datetime(2026, 5, 15, tzinfo=UTC)
    assert get_current_financial_year(may_date) == "2026-2027"

    # January 2027 -> FY 2026-2027
    jan_date = datetime(2027, 1, 10, tzinfo=UTC)
    assert get_current_financial_year(jan_date) == "2026-2027"

    # March 2027 -> FY 2026-2027
    mar_date = datetime(2027, 3, 31, tzinfo=UTC)
    assert get_current_financial_year(mar_date) == "2026-2027"

    # April 2027 -> FY 2027-2028
    apr_date = datetime(2027, 4, 1, tzinfo=UTC)
    assert get_current_financial_year(apr_date) == "2027-2028"
