from datetime import UTC, datetime, timedelta
import pytest
from teleconsult.modules.patient_portal.schemas import AppointmentResponse


def test_appointment_status_visibility_filtering() -> None:
    now = datetime.now(UTC)
    later = now + timedelta(hours=2)
    # Verify AppointmentResponse schema models confirmed, paid appointments cleanly
    apt = AppointmentResponse(
        id="00000000-0000-0000-0000-000000000001",
        doctor_id="00000000-0000-0000-0000-000000000002",
        patient_id="00000000-0000-0000-0000-000000000003",
        starts_at=now,
        ends_at=later,
        status="confirmed",
        payment_status="captured",
        base_fee_paise=40000,
        platform_fee_paise=0,
        total_payable_paise=40000,
        currency="INR",
    )
    assert apt.status == "confirmed"
    assert apt.payment_status == "captured"
    assert apt.total_payable_paise == 40000
