from uuid import UUID, uuid4

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from teleconsult.kernel.db.base import Base


class Clinic(Base):
    __tablename__ = "clinics"
    __table_args__ = {"schema": "tenancy"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(24), default="active")
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)


class Specialty(Base):
    __tablename__ = "specialties"
    __table_args__ = {"schema": "directory"}
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    status: Mapped[str] = mapped_column(String(24), default="active")
