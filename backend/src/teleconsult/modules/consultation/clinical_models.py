from datetime import datetime, UTC
from uuid import UUID, uuid4
from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from teleconsult.kernel.db.base import Base


class Consultation(Base):
    __tablename__ = "consultations"
    __table_args__ = {"schema": "consultation"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    appointment_id: Mapped[UUID] = mapped_column(index=True)
    session_status: Mapped[str] = mapped_column(String(32), default="not_ready")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ClinicalNote(Base):
    __tablename__ = "clinical_notes"
    __table_args__ = {"schema": "consultation"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    consultation_id: Mapped[UUID] = mapped_column(index=True)
    doctor_id: Mapped[UUID] = mapped_column(index=True)
    content_reference: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class ClinicalNoteAmendment(Base):
    __tablename__ = "clinical_note_amendments"
    __table_args__ = {"schema": "consultation"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    note_id: Mapped[UUID] = mapped_column(index=True)
    author_id: Mapped[UUID] = mapped_column(index=True)
    version: Mapped[int] = mapped_column()
    content_reference: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
