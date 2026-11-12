from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from teleconsult.kernel.db.base import Base


class MedicalIntake(Base):
    __tablename__ = "medical_intakes"
    __table_args__ = {"schema": "patient_portal"}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    patient_id: Mapped[UUID] = mapped_column(index=True)
    reason: Mapped[str] = mapped_column(String(500))
    symptoms: Mapped[str] = mapped_column(String(2000))
    symptom_duration: Mapped[str] = mapped_column(String(120))
    medical_history: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    allergies: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    current_medications: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    supporting_reports: Mapped[list] = mapped_column(JSON, default=list)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
