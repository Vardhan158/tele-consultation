from datetime import UTC, datetime, timedelta

from teleconsult.modules.patient_portal.routes import _slot_status

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)


def test_expired_slot_is_expired_even_if_marked_available():
    assert _slot_status("2026-11-14T16:00:00+05:30", "2026-11-14T16:30:00+05:30", now=NOW) == "expired"


def test_booked_slot_is_booked_before_end_time():
    assert _slot_status(NOW + timedelta(minutes=20), NOW + timedelta(minutes=50), booked=True, now=NOW) == "booked"


def test_future_unbooked_slot_is_available():
    assert _slot_status(NOW + timedelta(hours=1), NOW + timedelta(hours=2), now=NOW) == "available"
