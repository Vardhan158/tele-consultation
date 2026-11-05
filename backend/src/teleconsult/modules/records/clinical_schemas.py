from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class ClinicalOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    appointment_id: UUID
    content: str
    status: str
    created_at: datetime
    released_at: datetime | None
    medication_name: str | None = None
    dosage: str | None = None
    instructions: str | None = None
    medicines: list[dict] = []
    prescriber_name: str | None = None
