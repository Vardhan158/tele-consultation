from teleconsult.modules.patient_portal.journey import JourneyState, can_transition, transition


def test_payment_failure_returns_to_retryable_payment_state() -> None:
    assert can_transition(JourneyState.PAYMENT_PENDING, JourneyState.PAYMENT_FAILED)
    assert transition(JourneyState.PAYMENT_FAILED, JourneyState.PAYMENT_PENDING) == JourneyState.PAYMENT_PENDING


def test_interrupted_video_cannot_complete_without_recovery() -> None:
    assert not can_transition(JourneyState.VIDEO_INTERRUPTED, JourneyState.COMPLETED)
    assert transition(JourneyState.VIDEO_INTERRUPTED, JourneyState.WAITING_ROOM) == JourneyState.WAITING_ROOM


def test_invalid_transition_is_rejected() -> None:
    try:
        transition(JourneyState.LANDING, JourneyState.COMPLETED)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid journey transition was accepted")
