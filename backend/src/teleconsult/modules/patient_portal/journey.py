"""Authoritative patient journey transitions.

The client may request an action, but it cannot assign an arbitrary journey
state. Recovery states preserve valid data and direct the patient to the next
safe workflow.
"""
from enum import StrEnum


class JourneyState(StrEnum):
    LANDING = "landing"
    AUTHENTICATED = "authenticated"
    CONSENT_REQUIRED = "consent_required"
    CONSENT_REJECTED = "consent_rejected"
    SLOT_SELECTION = "slot_selection"
    HEALTH_DETAILS = "health_details"
    PAYMENT_PENDING = "payment_pending"
    PAYMENT_FAILED = "payment_failed"
    CONFIRMED = "confirmed"
    WAITING_ROOM = "waiting_room"
    VIDEO_INTERRUPTED = "video_interrupted"
    IN_CONSULTATION = "in_consultation"
    DOCUMENTS_PENDING = "documents_pending"
    COMPLETED = "completed"
    FOLLOW_UP = "follow_up"
    DOCTOR_UNAVAILABLE = "doctor_unavailable"
    INVALID_HEALTH_DETAILS = "invalid_health_details"
    MISSED_APPOINTMENT = "missed_appointment"
    DOCUMENTS_UNAVAILABLE = "documents_unavailable"


TRANSITIONS: dict[JourneyState, frozenset[JourneyState]] = {
    JourneyState.LANDING: frozenset({JourneyState.AUTHENTICATED}),
    JourneyState.AUTHENTICATED: frozenset({JourneyState.CONSENT_REQUIRED}),
    JourneyState.CONSENT_REQUIRED: frozenset({JourneyState.SLOT_SELECTION, JourneyState.CONSENT_REJECTED}),
    JourneyState.CONSENT_REJECTED: frozenset({JourneyState.CONSENT_REQUIRED, JourneyState.LANDING}),
    JourneyState.SLOT_SELECTION: frozenset({JourneyState.HEALTH_DETAILS, JourneyState.DOCTOR_UNAVAILABLE}),
    JourneyState.DOCTOR_UNAVAILABLE: frozenset({JourneyState.SLOT_SELECTION}),
    JourneyState.HEALTH_DETAILS: frozenset({JourneyState.PAYMENT_PENDING, JourneyState.CONFIRMED, JourneyState.INVALID_HEALTH_DETAILS}),
    JourneyState.INVALID_HEALTH_DETAILS: frozenset({JourneyState.HEALTH_DETAILS}),
    JourneyState.PAYMENT_PENDING: frozenset({JourneyState.CONFIRMED, JourneyState.PAYMENT_FAILED}),
    JourneyState.PAYMENT_FAILED: frozenset({JourneyState.PAYMENT_PENDING, JourneyState.SLOT_SELECTION}),
    JourneyState.CONFIRMED: frozenset({JourneyState.WAITING_ROOM, JourneyState.MISSED_APPOINTMENT}),
    JourneyState.WAITING_ROOM: frozenset({JourneyState.IN_CONSULTATION, JourneyState.VIDEO_INTERRUPTED, JourneyState.MISSED_APPOINTMENT}),
    JourneyState.VIDEO_INTERRUPTED: frozenset({JourneyState.WAITING_ROOM, JourneyState.FOLLOW_UP}),
    JourneyState.IN_CONSULTATION: frozenset({JourneyState.DOCUMENTS_PENDING, JourneyState.COMPLETED}),
    JourneyState.DOCUMENTS_PENDING: frozenset({JourneyState.COMPLETED, JourneyState.DOCUMENTS_UNAVAILABLE}),
    JourneyState.DOCUMENTS_UNAVAILABLE: frozenset({JourneyState.FOLLOW_UP, JourneyState.COMPLETED}),
    JourneyState.MISSED_APPOINTMENT: frozenset({JourneyState.FOLLOW_UP, JourneyState.SLOT_SELECTION}),
    JourneyState.COMPLETED: frozenset({JourneyState.FOLLOW_UP}),
    JourneyState.FOLLOW_UP: frozenset({JourneyState.SLOT_SELECTION, JourneyState.COMPLETED}),
}


def can_transition(current: JourneyState, target: JourneyState) -> bool:
    return target in TRANSITIONS.get(current, frozenset())


def transition(current: JourneyState, target: JourneyState) -> JourneyState:
    if not can_transition(current, target):
        raise ValueError(f"Invalid patient journey transition: {current} -> {target}")
    return target
