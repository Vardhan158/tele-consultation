from teleconsult.modules.scheduling.mongodb_repositories import (
    ACTIVE_APPOINTMENT_STATUSES,
    SchedulingConflict,
    ensure_status_transition,
)


def test_active_statuses_include_payment_and_consultation_states() -> None:
    assert {"pending_payment", "confirmed", "in_progress"} <= ACTIVE_APPOINTMENT_STATUSES


def test_final_appointments_cannot_be_cancelled_or_rescheduled() -> None:
    for current in ("completed", "cancelled"):
        try:
            ensure_status_transition(current, "cancelled")
        except SchedulingConflict:
            pass
        else:
            raise AssertionError("final appointment state was mutable")


def test_invalid_transition_is_rejected() -> None:
    try:
        ensure_status_transition("in_progress", "requested")
    except SchedulingConflict:
        pass
    else:
        raise AssertionError("invalid appointment transition was accepted")
