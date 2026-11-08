from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from teleconsult.kernel.db.base import Base


class FollowUpAction(Base):
    __tablename__ = "follow_up_actions"
    __table_args__ = {"schema": "support_access"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    patient_id: Mapped[UUID] = mapped_column(index=True)
    appointment_id: Mapped[UUID] = mapped_column(index=True)
    advice: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="released")
    next_appointment_id: Mapped[UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = {"schema": "support_access"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    patient_id: Mapped[UUID] = mapped_column(index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(String(2000))
    status: Mapped[str] = mapped_column(String(24), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
