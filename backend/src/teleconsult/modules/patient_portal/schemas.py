from typing import Any
import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=3, max_length=320)
    phone: str = Field(min_length=8, max_length=32)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r"[\s()\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("0") or clean.startswith("+"):
            clean = clean[1:]
        if not (len(clean) == 10 and clean.isdigit()):
            raise ValueError("Mobile number must be exactly 10 digits")
        return v


class PatientResponse(PatientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    phone: str | None = None
    date_of_birth: datetime | str | None = None
    gender: str | None = None
    preferred_language: str | None = None
    address: str | None = None
    street_address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    emergency_contact: str | dict | None = None
    preferred_pharmacy: str | None = None
    pharmacy_address: str | None = None
    pharmacy_phone: str | None = None
    allergies: str | list | None = None
    created_at: datetime | str | None = None
    primary_care_provider: str | None = None
    avatar_url: str | None = None


class DoctorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    full_name: str
    specialty: str
    clinic_name: str
    fee_paise: int | None = None
    currency: str | None = None
    base_fee_paise: int | None = None
    platform_fee_paise: int | None = None
    total_payable_paise: int | None = None
    timezone: str = "Asia/Kolkata"
    supported_languages: list[str]
    registration_number: str | None


class AvailabilityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    doctor_id: UUID
    starts_at: datetime
    ends_at: datetime
    timezone: str


class FamilyMemberCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    relationship: str = Field(min_length=2, max_length=50)  # spouse, child, parent, sibling, other
    gender: str | None = Field(default=None, max_length=20)
    date_of_birth: str | None = Field(default=None, max_length=30)
    blood_group: str | None = Field(default=None, max_length=10)
    allergies: str | None = Field(default=None, max_length=500)
    medical_conditions: str | None = Field(default=None, max_length=500)


class FamilyMemberResponse(FamilyMemberCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    patient_id: str
    created_at: str


class FollowUpMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class AppointmentCreate(BaseModel):
    doctor_id: UUID
    starts_at: datetime
    duration_minutes: int = Field(default=30, ge=15, le=120)
    intake_id: UUID | None = None
    reason: str = ""
    notes: str = ""
    appointment_type: str = ""
    visit_format: str = ""
    patient_profile_id: str | None = None
    booking_for: str = "myself"
    family_member_name: str | None = None
    family_member_relation: str | None = None


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID | str
    doctor_id: UUID | str
    patient_id: UUID | str
    starts_at: datetime
    ends_at: datetime
    status: str
    payment_status: str
    base_fee_paise: int | None = None
    platform_fee_paise: int | None = None
    total_payable_paise: int | None = None
    currency: str | None = None
    doctor: DoctorResponse | None = None
    join_window_minutes: int = 30


class AppointmentReschedule(BaseModel):
    starts_at: datetime | None = None
    slot_id: str | None = None


class AppointmentCancelRequest(BaseModel):
    reason: str | None = None



class ConsentCreate(BaseModel):
    consent_type: str = Field(min_length=2, max_length=64)
    version: str = Field(default="v2.1", min_length=1, max_length=32)


class ConsentResponse(ConsentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID | str
    status: str
    granted_at: datetime
    withdrawn_at: datetime | None = None
    document_title: str | None = None
    category: str | None = None
    required: bool | None = None


class ConsentDocumentSection(BaseModel):
    heading: str
    body: str


class ConsentDocumentDefinition(BaseModel):
    id: str
    consent_type: str
    title: str
    category: str  # "essential" | "optional"
    required: bool
    version: str
    effective_date: str
    summary: str
    sections: list[ConsentDocumentSection]


class ConsentHistoryItem(BaseModel):
    id: str
    consent_type: str
    title: str
    version: str
    action: str  # "Granted" | "Withdrawn"
    occurred_at: datetime
    source: str = "Patient portal"


class PatientProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160, pattern=r"^[A-Za-z\s.'-]+$")
    date_of_birth: datetime | str | None = None
    gender: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, min_length=8, max_length=32)
    preferred_language: str | None = Field(default=None, min_length=2, max_length=32)
    address: str | None = Field(default=None, max_length=500)
    street_address: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    zip_code: str | None = Field(default=None, max_length=32)
    emergency_contact: str | None = Field(default=None, max_length=160)
    preferred_pharmacy: str | None = Field(default=None, max_length=160)
    pharmacy_address: str | None = Field(default=None, max_length=500)
    pharmacy_phone: str | None = Field(default=None, max_length=32)
    allergies: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=1000)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if not v:
            return v
        clean = re.sub(r"[\s()\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("0") or clean.startswith("+"):
            clean = clean[1:]
        if not (len(clean) == 10 and clean.isdigit()):
            raise ValueError("Mobile number must be exactly 10 digits")
        return v

    @field_validator("pharmacy_phone")
    @classmethod
    def validate_pharmacy_phone(cls, v: str | None) -> str | None:
        if not v:
            return v
        clean = re.sub(r"[\s()\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("0") or clean.startswith("+"):
            clean = clean[1:]
        if not (len(clean) == 10 and clean.isdigit()):
            raise ValueError("Pharmacy phone number must be exactly 10 digits")
        return v


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


class EmergencyContactInfo(BaseModel):
    name: str | None = None
    phone: str | None = None
    relationship: str | None = None


class EmergencyParamedicCardResponse(BaseModel):
    patient_id: str
    full_name: str
    date_of_birth: str | None = None
    gender: str | None = None
    blood_group: str | None = None
    emergency_contact: EmergencyContactInfo | None = None
    allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    active_medications: list[str] = Field(default_factory=list)
    clinic_name: str = "Kaizen Care Telehealth Center"
    clinic_phone: str = "+91 80 4567 8900"
    emergency_hotlines: list[dict[str, str]] = Field(default_factory=list)
    generated_at: str


# =====================================================================
# Phase 2 (F-04): Chrono-Care Timeline & Longitudinal Trends Schemas
# =====================================================================

class ChronoTimelineEvent(BaseModel):
    id: str
    event_type: str  # "consultation", "prescription", "summary", "record", "follow_up", "vital_reading"
    title: str
    timestamp: str
    clinician_name: str | None = None
    specialty: str | None = None
    summary: str | None = None
    status: str | None = None
    badge: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class PatientHealthTimelineResponse(BaseModel):
    patient_id: str
    patient_name: str
    total_events: int
    events: list[ChronoTimelineEvent]
    vital_trends: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


# =====================================================================
# Phase 2 (F-06): Granular Purpose-Bound Consent Ledger Schemas
# =====================================================================

class GranularConsentCreateRequest(BaseModel):
    purpose_code: str = Field(description="CARE, CLAIM, LAB, EMERGENCY, RESEARCH")
    purpose_title: str
    data_types: list[str] = Field(default_factory=lambda: ["prescriptions", "summaries"])
    validity_days: int = 365
    delegate_entity: str | None = None


class GranularConsentRevokeRequest(BaseModel):
    reason: str | None = None


class GranularConsentRecord(BaseModel):
    id: str
    patient_id: str
    purpose_code: str
    purpose_title: str
    data_types: list[str]
    granted_at: str
    expires_at: str | None = None
    status: str  # "active", "revoked", "expired"
    revoked_at: str | None = None
    revocation_reason: str | None = None
    delegate_entity: str | None = None
    abdm_artifact_id: str
    hip_id: str = "IN-KAIZEN-CARE-01"


