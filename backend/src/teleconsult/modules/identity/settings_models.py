from datetime import datetime, UTC
from uuid import UUID, uuid4

from sqlalchemy import DateTime, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from teleconsult.kernel.db.base import Base


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_user_settings_tenant_user"), {"schema": "identity"})

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    user_id: Mapped[UUID] = mapped_column(index=True)
    email_reminders: Mapped[bool] = mapped_column(default=True)
    sms_reminders: Mapped[bool] = mapped_column(default=True)
    wellness_updates: Mapped[bool] = mapped_column(default=False)
    language: Mapped[str] = mapped_column(String(64), default="English (US)")
    time_zone: Mapped[str] = mapped_column(String(64), default="UTC")
    accessibility: Mapped[dict] = mapped_column(JSON, default=dict)
    privacy: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
