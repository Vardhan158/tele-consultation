from datetime import datetime, UTC
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from teleconsult.kernel.db.base import Base


class VideoSession(Base):
    __tablename__ = "video_sessions"
    __table_args__ = {"schema": "consultation"}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    appointment_id: Mapped[UUID] = mapped_column(index=True)
    patient_id: Mapped[UUID] = mapped_column(index=True)
    provider: Mapped[str] = mapped_column(String(40), default="stub")
    room_id: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32), default="not_ready", index=True)
    token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    patient_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    doctor_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VideoSessionEvent(Base):
    __tablename__ = "video_session_events"
    __table_args__ = {"schema": "consultation"}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    session_id: Mapped[UUID] = mapped_column(index=True)
    appointment_id: Mapped[UUID] = mapped_column(index=True)
    actor_id: Mapped[UUID] = mapped_column(index=True)
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
