"""Safe timezone resolution utility with fallback for systems lacking tzdata."""
from datetime import datetime, timezone, timedelta
from typing import Any

def get_ist_timezone() -> Any:
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Asia/Kolkata")
    except Exception:
        return timezone(timedelta(hours=5, minutes=30), name="IST")

def get_safe_timezone(tz_name: str | None = None) -> Any:
    if not tz_name or "kolkata" in tz_name.lower() or "ist" in tz_name.lower() or "calcutta" in tz_name.lower():
        return get_ist_timezone()
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.utc
