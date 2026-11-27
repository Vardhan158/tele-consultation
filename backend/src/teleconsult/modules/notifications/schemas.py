from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID | str
    event_type: str
    channel: str = "in_app"
    subject: str
    body: str
    status: str = "queued"
    read_at: datetime | None = None
    created_at: datetime
    doctor_id: str | None = None
    appointment_id: str | None = None
    patient_display_name: str | None = None
    notification_type: str | None = None
    appointment_starts_at: datetime | str | None = None
    claim_id: str | None = None
    claim_reference: str | None = None
    policy_id: str | None = None
    target_tab: str | None = None
    target_id: str | None = None
    delivery_status: str | None = None
    email_delivery_status: str | None = None
    recipient_role: str | None = None
    metadata: dict[str, Any] | None = None


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int = Field(default=0, ge=0)


class NotificationConfigResponse(BaseModel):
    policy_expiry_reminder_days: int = Field(default=30, ge=1, le=120)
    claim_pending_reminder_hours: int = Field(default=24, ge=1, le=720)
    pending_claim_reminder_hours: int = Field(default=24, ge=1, le=720)
    notification_dedup_window_minutes: int = Field(default=60, ge=1, le=1440)
    dedup_window_minutes: int = Field(default=60, ge=1, le=1440)
    email_notifications_enabled: bool = True
    email_enabled: bool = True
    in_app_notifications_enabled: bool = True
    in_app_enabled: bool = True


class UpdateNotificationConfigRequest(BaseModel):
    policy_expiry_reminder_days: int | None = Field(default=None, ge=1, le=120)
    claim_pending_reminder_hours: int | None = Field(default=None, ge=1, le=720)
    pending_claim_reminder_hours: int | None = Field(default=None, ge=1, le=720)
    notification_dedup_window_minutes: int | None = Field(default=None, ge=1, le=1440)
    dedup_window_minutes: int | None = Field(default=None, ge=1, le=1440)
    email_notifications_enabled: bool | None = None
    email_enabled: bool | None = None
    in_app_notifications_enabled: bool | None = None
    in_app_enabled: bool | None = None
