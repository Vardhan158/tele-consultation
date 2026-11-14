"""Shared, read-only appointment ownership and joining rules."""
from datetime import UTC, datetime, timedelta
from typing import Any

from teleconsult.kernel.authz.policy import Principal

JOINABLE_STATUSES = {"confirmed", "checked_in", "in_progress"}
SETTLED_STATUSES = {"captured", "success", "not_required", "no_payment_required", "not_needed"}


def utc_datetime(value: Any) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def appointment_times(appointment: dict[str, Any]) -> tuple[datetime, datetime]:
    start = utc_datetime(appointment["starts_at"])
    end = utc_datetime(appointment["ends_at"]) if appointment.get("ends_at") else start + timedelta(minutes=int(appointment.get("duration_minutes") or 30))
    return start, end


def join_eligible(appointment: dict[str, Any], payment_status: str, now: datetime, window_minutes: int) -> bool:
    if str(appointment.get("status", "")).lower() not in JOINABLE_STATUSES:
        return False
    if str(payment_status).lower() not in SETTLED_STATUSES:
        return False
    try:
        start, end = appointment_times(appointment)
    except (ValueError, TypeError, KeyError):
        return False
    return start - timedelta(minutes=window_minutes) <= now <= end


async def patient_identity_ids(database: Any, principal: Principal) -> list[str]:
    """Resolve only explicit account/profile links within the authenticated tenant."""
    ids = {str(principal.user_id)}
    for collection, fields in (("users", ("id", "user_id")), ("patients", ("id", "user_id", "user_account_id"))):
        documents = await database[collection].find({
            "tenant_id": str(principal.tenant_id),
            "$or": [{field: {"$in": list(ids)}} for field in fields],
        }).to_list(None)
        for document in documents:
            ids.update(str(document[field]) for field in fields if document.get(field))
    return sorted(ids)


async def latest_payment(database: Any, tenant_id: str, appointment_id: str) -> dict[str, Any] | None:
    return await database["payments"].find_one(
        {"tenant_id": str(tenant_id), "appointment_id": str(appointment_id)},
        sort=[("created_at", -1)],
    )
