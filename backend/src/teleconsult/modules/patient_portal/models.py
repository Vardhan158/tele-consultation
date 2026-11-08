from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from teleconsult.kernel.db.base import Base

SCHEMA = "patient_portal"


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(32))
    date_of_birth: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(32), default="en")
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Doctor(Base):
    __tablename__ = "doctors"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    specialty: Mapped[str] = mapped_column(String(120), index=True)
    clinic_name: Mapped[str] = mapped_column(String(180))
    fee_paise: Mapped[int] = mapped_column(default=0)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    active: Mapped[bool] = mapped_column(default=True)
    approved_for_consultation: Mapped[bool] = mapped_column(default=False, index=True)
    supported_languages: Mapped[list] = mapped_column(JSON, default=list)
    registration_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_account_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)
    approval_status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    qualifications: Mapped[list] = mapped_column(JSON, default=list)
    experience_years: Mapped[int | None] = mapped_column(nullable=True)
    languages: Mapped[list] = mapped_column(JSON, default=list)


class DoctorAvailability(Base):
    __tablename__ = "doctor_availability"
    __table_args__ = (
        UniqueConstraint("doctor_id", "starts_at", name="uq_doctor_availability_slot"),
        {"schema": SCHEMA},
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    doctor_id: Mapped[UUID] = mapped_column(ForeignKey(f"{SCHEMA}.doctors.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24), default="available", index=True)


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        UniqueConstraint("doctor_id", "starts_at", name="uq_doctor_slot"),
        Index("ix_appointment_patient_start", "patient_id", "starts_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey(f"{SCHEMA}.patients.id"))
    doctor_id: Mapped[UUID] = mapped_column(ForeignKey(f"{SCHEMA}.doctors.id"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="requested", index=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="not_required")
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class AppointmentEvent(Base):
    __tablename__ = "appointment_events"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    appointment_id: Mapped[UUID] = mapped_column(ForeignKey(f"{SCHEMA}.appointments.id"), index=True)
    actor_id: Mapped[UUID] = mapped_column(index=True)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
