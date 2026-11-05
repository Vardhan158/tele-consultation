import logging

# Prefer allow-listing loggable fields. This deny-list is a safety net, not the primary control.
SENSITIVE_KEYS = frozenset({
    "password", "token", "authorization", "secret", "name", "email", "phone",
    "address", "dob", "symptoms", "notes", "diagnosis", "prescription", "body",
})


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key in SENSITIVE_KEYS:
            if hasattr(record, key):
                setattr(record, key, "[REDACTED]")
        return True


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RedactingFilter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
