from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from teleconsult.modules.notifications.models import Notification


def queue_patient_notification(
    session: AsyncSession, *, tenant_id: UUID, patient_id: UUID, event_type: str,
    subject: str, body: str, channel: str = "in_app",
) -> Notification:
    """Queue an operational notification; delivery is deliberately independent of core state."""
    notification = Notification(tenant_id=tenant_id, patient_id=patient_id, event_type=event_type,
        subject=subject, body=body, channel=channel, status="queued")
    session.add(notification)
    return notification
