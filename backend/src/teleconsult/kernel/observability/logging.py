"""Structured Logging and Observability with Correlation ID & Sensitive Data Redaction.

Checklist References:
- BE-13: Request ID / Correlation ID Propagation
- MON-02: Structured Logging with Correlation Context
- SEC-08: Sensitive Data Redaction in Telemetry
"""

import contextvars
import logging
import re
from typing import Any

# ContextVar for propagating the current request's correlation ID across async coroutines
_correlation_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="-")


def get_correlation_id() -> str:
    """Retrieve the correlation ID for the current async execution context."""
    return _correlation_id_ctx.get()


def set_correlation_id(correlation_id: str) -> None:
    """Set the correlation ID for the current async execution context."""
    _correlation_id_ctx.set(correlation_id)


# Prefer allow-listing loggable fields. This deny-list is a safety net, not the primary control.
SENSITIVE_KEYS = frozenset({
    "password", "token", "authorization", "secret", "name", "email", "phone",
    "address", "dob", "symptoms", "notes", "diagnosis", "prescription", "body",
})

# Regex pattern for sanitizing accidental sensitive key=value pairs in message text
_SENSITIVE_TEXT_PATTERN = re.compile(
    r'(?i)\b(password|token|secret|authorization|pin|otp)\b\s*[:=]\s*["\']?([^"\'\s,;]+)["\']?'
)


class CorrelationIdAndRedactingFilter(logging.Filter):
    """Filter that attaches correlation_id to log records and redacts sensitive attributes."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Attach current correlation ID if not already present on record
        if not hasattr(record, "correlation_id") or record.correlation_id == "-":
            record.correlation_id = get_correlation_id()

        # Redact known sensitive attributes
        for key in SENSITIVE_KEYS:
            if hasattr(record, key):
                setattr(record, key, "[REDACTED]")

        # Redact any obvious sensitive key=value credentials embedded in record message strings
        if isinstance(record.msg, str) and ("password" in record.msg.lower() or "token" in record.msg.lower() or "secret" in record.msg.lower()):
            record.msg = _SENSITIVE_TEXT_PATTERN.sub(r'\1=[REDACTED]', record.msg)

        return True


# Backward compatibility alias
RedactingFilter = CorrelationIdAndRedactingFilter


def configure_logging() -> None:
    """Configure root logger with structured correlation formatting and redaction filter."""
    handler = logging.StreamHandler()
    handler.addFilter(CorrelationIdAndRedactingFilter())
    formatter = logging.Formatter(
        fmt="[%(asctime)s] [%(levelname)s] [req:%(correlation_id)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
