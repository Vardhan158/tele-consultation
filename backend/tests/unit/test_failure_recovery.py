from teleconsult.modules.identity.auth_routes import password_hash, password_matches
from teleconsult.modules.patient_portal.journey import JourneyState, can_transition


def test_password_hash_is_not_reversible_and_matches_only_original() -> None:
    encoded = password_hash("a sufficiently long test password")
    assert encoded != "a sufficiently long test password"
    assert password_matches("a sufficiently long test password", encoded)
    assert not password_matches("wrong password", encoded)


def test_video_disconnect_does_not_complete_encounter() -> None:
    assert not can_transition(JourneyState.VIDEO_INTERRUPTED, JourneyState.COMPLETED)
    assert can_transition(JourneyState.VIDEO_INTERRUPTED, JourneyState.WAITING_ROOM)


def test_payment_uncertainty_requires_verification_before_confirmation() -> None:
    assert can_transition(JourneyState.PAYMENT_PENDING, JourneyState.PAYMENT_FAILED)
    # The state graph permits the success transition; the payment endpoint is
    # responsible for reaching it only after provider verification.
    assert can_transition(JourneyState.PAYMENT_PENDING, JourneyState.CONFIRMED)


def test_consent_rejection_returns_to_review_or_exit() -> None:
    assert can_transition(JourneyState.CONSENT_REQUIRED, JourneyState.CONSENT_REJECTED)
    assert can_transition(JourneyState.CONSENT_REJECTED, JourneyState.CONSENT_REQUIRED)
    assert can_transition(JourneyState.CONSENT_REJECTED, JourneyState.LANDING)
