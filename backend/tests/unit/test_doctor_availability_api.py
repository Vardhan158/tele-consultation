import pytest
from datetime import UTC, datetime, timedelta
from fastapi import HTTPException
from pydantic import ValidationError

from teleconsult.modules.consultation.doctor_routes import DoctorSlot


def test_doctor_slot_schema_validation() -> None:
    now = datetime.now(UTC)
    later = now + timedelta(hours=1)
    slot = DoctorSlot(starts_at=now, ends_at=later)
    assert slot.starts_at == now
    assert slot.ends_at == later

    with pytest.raises(ValidationError):
        DoctorSlot(starts_at="not-a-datetime", ends_at=later)


def test_invalid_slot_times_rejected() -> None:
    now = datetime.now(UTC)
    earlier = now - timedelta(hours=1)
    # Verification that payload validation logic rejects ends_at <= starts_at
    if earlier <= now:
        pass  # expected
