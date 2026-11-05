"""The ONLY way to record an audit event. The audit module registers the sink at startup."""
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True)
class AuditEvent:
    actor_id: str
    tenant_id: str
    action: str                 # e.g. "record.read", "consent.withdraw", "support.access.granted"
    resource_type: str
    resource_id: str            # stable internal ID only, never names or clinical content
    purpose: str | None = None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = field(default_factory=dict)


_sink: Callable[[AuditEvent], None] | None = None


def register_sink(sink: Callable[[AuditEvent], None]) -> None:
    global _sink
    _sink = sink


def emit(event: AuditEvent) -> None:
    if _sink is None:
        raise RuntimeError("Audit sink not registered; refusing to continue without auditing")
    _sink(event)
