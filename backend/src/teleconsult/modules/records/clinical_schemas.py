from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ClinicalOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID | str
    appointment_id: UUID | str
    content: str
    status: str
    created_at: datetime
    released_at: datetime | None
    medication_name: str | None = None
    dosage: str | None = None
    instructions: str | None = None
    medicines: list[dict] = []
    prescriber_name: str | None = None


# =====================================================================
# Phase 2 (F-05): Drug-Drug Interaction & Dosage Safety Copilot Schemas
# =====================================================================

class DrugInteractionItem(BaseModel):
    name: str
    dosage: str | None = None
    frequency: str | None = None
    duration: str | None = None


class DrugSafetyCheckRequest(BaseModel):
    appointment_id: str | None = None
    patient_id: str | None = None
    medications: list[DrugInteractionItem]
    allergies: list[str] = []
    existing_medications: list[str] = []


class DrugInteractionAlert(BaseModel):
    severity: str  # "contraindicated", "major", "moderate", "info"
    source_drug: str
    interacting_drug_or_allergy: str
    interaction_type: str  # "drug_drug", "drug_allergy", "schedule_x_intercept"
    clinical_effect: str
    recommendation: str


class DrugSafetyCheckResponse(BaseModel):
    safe_to_prescribe: bool
    overall_risk_level: str  # "low", "medium", "high", "critical"
    total_alerts: int
    alerts: list[DrugInteractionAlert]
    schedule_x_intercepted: bool = False
    summary: str

