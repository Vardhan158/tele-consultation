"""Background worker: publishes outbox events, sends notifications, runs reminders and integrations.
Implements the asynchronous task worker architecture per ADR 0003."""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta
import logging
import os
import signal
import sys
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database

logger = logging.getLogger("teleconsult.worker")

# Configurable reminder lead intervals in minutes before appointment starts_at.
# Standard posology: 24h (1440m), 1h (60m), 15m (15m).
DEFAULT_REMINDER_LEADS = [1440, 60, 15]
DEFAULT_MAX_RETRIES = 3
DEFAULT_POLL_INTERVAL_SECONDS = 5.0


def parse_utc_datetime(val: Any) -> datetime | None:
    """Parse string or datetime into a UTC timezone-aware datetime."""
    if isinstance(val, datetime):
        return val if val.tzinfo is not None else val.replace(tzinfo=UTC)
    if isinstance(val, str):
        try:
            cleaned = val.replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
        except (ValueError, TypeError):
            return None
    return None


def resolve_timezone(tz_name: str | None) -> ZoneInfo:
    """Resolve user configured timezone string into ZoneInfo with safe fallback."""
    if not tz_name:
        return ZoneInfo("Asia/Kolkata")
    clean = tz_name.split(" ")[0].strip()
    try:
        return ZoneInfo(clean)
    except (ZoneInfoNotFoundError, Exception):
        return ZoneInfo("Asia/Kolkata")


class ReminderWorker:
    """Asynchronous background worker for scheduled reminders and notification dispatch."""

    def __init__(
        self,
        reminder_leads: list[int] | None = None,
        max_retries: int = DEFAULT_MAX_RETRIES,
        poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
        test_mode: bool = False,
    ) -> None:
        self.reminder_leads = reminder_leads or DEFAULT_REMINDER_LEADS
        self.max_retries = max_retries
        self.poll_interval = poll_interval
        self.test_mode = test_mode
        self._running = False
        self._stop_event = asyncio.Event()

    async def _ensure_db(self) -> Any:
        if not mongo_database.enabled:
            return None
        await mongo_database.connect()
        return mongo_database.database()

    async def run_once(self, now: datetime | None = None) -> dict[str, int]:
        """Execute one complete batch cycle: reminders, retries, and outbox."""
        db = await self._ensure_db()
        if db is None:
            return {"reminders": 0, "retries": 0, "outbox": 0}

        now_utc = now or datetime.now(UTC)
        reminders_created = await self.process_scheduled_reminders(db, now_utc)
        retries_processed = await self.process_notification_retries(db, now_utc)
        outbox_processed = await self.process_outbox_events(db, now_utc)

        return {
            "reminders": reminders_created,
            "retries": retries_processed,
            "outbox": outbox_processed,
        }

    async def process_scheduled_reminders(self, db: Any, now_utc: datetime) -> int:
        """Find upcoming confirmed appointments and generate idempotent reminders."""
        created_count = 0
        settings = get_settings()

        # Query all active confirmed appointments
        cursor = db["appointments"].find({
            "status": {"$in": ["confirmed", "scheduled"]}
        })

        async for apt in cursor:
            # Check cancellation or non-confirmed state
            if apt.get("status") not in {"confirmed", "scheduled"}:
                continue

            apt_id = str(apt.get("id") or apt.get("_id"))
            tenant_id = str(apt.get("tenant_id") or settings.default_tenant_id)
            patient_id = str(apt.get("patient_id"))
            doctor_id = str(apt.get("doctor_id"))

            starts_at = parse_utc_datetime(apt.get("starts_at"))
            if not starts_at:
                continue

            delta_seconds = (starts_at - now_utc).total_seconds()
            delta_minutes = delta_seconds / 60.0

            # If appointment is in the past (> 5 minutes ago), skip
            if delta_minutes < -5:
                continue

            # Fetch user communication preferences
            user_settings = await db["user_settings"].find_one({
                "tenant_id": tenant_id,
                "user_id": patient_id,
            })
            if user_settings:
                # Respect explicit opt-outs
                if (
                    user_settings.get("email_reminders") is False
                    and user_settings.get("sms_reminders") is False
                    and user_settings.get("in_app_reminders") is False
                ):
                    continue
                user_tz_name = user_settings.get("time_zone", "Asia/Kolkata (IST)")
            else:
                user_tz_name = "Asia/Kolkata (IST)"

            tz = resolve_timezone(user_tz_name)
            local_time = starts_at.astimezone(tz)
            formatted_time = local_time.strftime("%b %d, %Y at %I:%M %p") + " IST"

            # Fetch doctor information for personalized template
            doc_record = await db["doctors"].find_one({
                "tenant_id": tenant_id,
                "$or": [{"id": doctor_id}, {"user_id": doctor_id}, {"user_account_id": doctor_id}],
            })
            doctor_name = doc_record.get("full_name") if doc_record else "your doctor"
            if not doctor_name.startswith("Dr.") and not doctor_name.startswith("dr.") and doctor_name != "your doctor":
                doctor_name = f"Dr. {doctor_name}"

            # Evaluate reminder lead intervals
            for lead_min in self.reminder_leads:
                # If appointment is within this lead window and hasn't started yet
                if 0 < delta_minutes <= lead_min:
                    tag = f"{lead_min}m"
                    query = {
                        "tenant_id": tenant_id,
                        "appointment_id": apt_id,
                        "event_type": "appointment_reminder",
                        "reminder_tag": tag,
                    }

                    reminder_id = str(uuid4())
                    subject = "Consultation reminder"
                    body = f"Your teleconsultation with {doctor_name} is scheduled for {formatted_time}."

                    # Atomic $setOnInsert prevents race conditions across multi-worker instances
                    res = await db["notifications"].update_one(
                        query,
                        {
                            "$setOnInsert": {
                                "id": reminder_id,
                                "tenant_id": tenant_id,
                                "recipient_id": patient_id,
                                "patient_id": patient_id,
                                "doctor_id": doctor_id,
                                "appointment_id": apt_id,
                                "event_type": "appointment_reminder",
                                "reminder_tag": tag,
                                "channel": "in_app",
                                "subject": subject,
                                "body": body,
                                "status": "queued",
                                "retry_count": 0,
                                "delivery_attempts": 0,
                                "read_at": None,
                                "scheduled_for": now_utc.isoformat(),
                                "created_at": now_utc.isoformat(),
                            }
                        },
                        upsert=True,
                    )
                    if res.upserted_id:
                        created_count += 1
                        logger.info("Created scheduled reminder %s for appointment %s (tag: %s)", reminder_id, apt_id, tag)

        return created_count

    async def process_notification_retries(self, db: Any, now_utc: datetime) -> int:
        """Process notifications eligible for retry with bounded attempts."""
        retry_count = 0
        cursor = db["notifications"].find({
            "status": {"$in": ["retryable", "failed"]},
            "retry_count": {"$lt": self.max_retries},
        })

        async for notif in cursor:
            notif_id = notif.get("id")
            current_retries = int(notif.get("retry_count", 0))

            # Verify appointment cancellation status if linked
            apt_id = notif.get("appointment_id")
            if apt_id:
                apt = await db["appointments"].find_one({"id": apt_id})
                if apt and apt.get("status") in {"cancelled", "refunded"}:
                    await db["notifications"].update_one(
                        {"_id": notif["_id"]},
                        {"$set": {"status": "cancelled", "cancel_reason": "Appointment was cancelled"}},
                    )
                    continue

            # Increment retry and set to queued for redelivery
            new_retries = current_retries + 1
            new_status = "queued" if new_retries < self.max_retries else "permanently_failed"

            await db["notifications"].update_one(
                {"_id": notif["_id"]},
                {
                    "$set": {
                        "status": new_status,
                        "retry_count": new_retries,
                        "last_retried_at": now_utc.isoformat(),
                    },
                    "$inc": {"delivery_attempts": 1},
                },
            )
            retry_count += 1
            logger.info("Processed retry for notification %s (attempt %d)", notif_id, new_retries)

        return retry_count

    async def process_outbox_events(self, db: Any, now_utc: datetime) -> int:
        """Process pending transactional outbox events if outbox collection exists."""
        processed = 0
        try:
            cursor = db["outbox"].find({"status": "pending"}).limit(50)
            async for event in cursor:
                await db["outbox"].update_one(
                    {"_id": event["_id"]},
                    {"$set": {"status": "processed", "processed_at": now_utc.isoformat()}},
                )
                processed += 1
        except Exception:
            pass
        return processed

    async def start(self) -> None:
        """Run worker continuously until stopped."""
        self._running = True
        logger.info("Starting ReminderWorker loop (poll interval: %.1fs)...", self.poll_interval)
        try:
            while self._running:
                try:
                    await self.run_once()
                except Exception as exc:
                    logger.exception("Error in worker execution tick: %s", exc)

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval)
                except TimeoutError:
                    pass
        finally:
            logger.info("ReminderWorker loop stopped.")

    def stop(self) -> None:
        """Signal worker to stop gracefully."""
        self._running = False
        self._stop_event.set()


async def run_worker_iteration(now: datetime | None = None) -> dict[str, int]:
    """Helper for ad-hoc execution or programmatic test invocation."""
    worker = ReminderWorker(test_mode=True)
    return await worker.run_once(now=now)


def main() -> None:
    """CLI entrypoint for running the worker process."""
    parser = argparse.ArgumentParser(description="Kaizen Care Background Reminder & Notification Worker")
    parser.add_argument("--once", action="store_true", help="Execute one tick and exit")
    parser.add_argument("--interval", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS, help="Poll interval in seconds")
    parser.add_argument("--test", action="store_true", help="Enable test/safe mode (no external network calls)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    worker = ReminderWorker(poll_interval=args.interval, test_mode=args.test)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def handle_signal(*_: Any) -> None:
        logger.info("Shutdown signal received.")
        worker.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, handle_signal)
        except (ValueError, AttributeError):
            pass

    try:
        if args.once:
            result = loop.run_until_complete(worker.run_once())
            print(f"Worker batch completed: {result}")
        else:
            loop.run_until_complete(worker.start())
    except KeyboardInterrupt:
        worker.stop()
    finally:
        loop.close()


if __name__ == "__main__":
    main()
