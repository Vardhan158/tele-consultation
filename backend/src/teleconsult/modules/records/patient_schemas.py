from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentCreate(BaseModel):
    category: str = Field(min_length=2, max_length=48)
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=3, max_length=120)
    size_bytes: int = Field(gt=0, le=25_000_000)


class DocumentResponse(BaseModel):
    id: UUID
    category: str
    file_name: str
    content_type: str
    size_bytes: int
    status: str
    uploaded_by: str | None = "You"
    uploaded_by_role: str | None = "patient"
    created_at: datetime
    released_at: datetime | None
