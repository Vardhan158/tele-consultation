from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=3, max_length=320)
    phone: str = Field(min_length=8, max_length=32)


class PatientResponse(PatientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class DoctorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    full_name: str
    specialty: str
    clinic_name: str
    fee_paise: int
    timezone: str
    supported_languages: list[str]
    registration_number: str | None


class AvailabilityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    doctor_id: UUID
    starts_at: datetime
    ends_at: datetime


class AppointmentCreate(BaseModel):
    doctor_id: UUID
    starts_at: datetime
    duration_minutes: int = Field(default=30, ge=15, le=120)
    intake_id: UUID | None = None


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    doctor_id: UUID
    patient_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: str
    payment_status: str
    doctor: DoctorResponse | None = None


class AppointmentReschedule(BaseModel):
    starts_at: datetime


class ConsentCreate(BaseModel):
    consent_type: str = Field(min_length=2, max_length=64)
    version: str = Field(min_length=1, max_length=32)


class ConsentResponse(ConsentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    granted_at: datetime


class PatientProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160, pattern=r"^[A-Za-z\s.'-]+$")
    date_of_birth: datetime | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=32, pattern=r"^\+?[0-9\s().-]{7,32}$")
    preferred_language: str | None = Field(default=None, min_length=2, max_length=32)
    address: str | None = Field(default=None, max_length=500)
    emergency_contact: str | None = Field(default=None, max_length=160)


class MedicalIntakeCreate(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    symptoms: str = Field(min_length=2, max_length=2000)
    symptom_duration: str = Field(min_length=1, max_length=120)
    medical_history: str | None = Field(default=None, max_length=4000)
    allergies: str | None = Field(default=None, max_length=2000)
    current_medications: str | None = Field(default=None, max_length=2000)
    supporting_reports: list[str] = Field(default_factory=list, max_length=10)


class MedicalIntakeResponse(MedicalIntakeCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    submitted_at: datetime
