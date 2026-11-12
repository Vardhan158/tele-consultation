from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_type: str
    channel: str
    subject: str
    body: str
    status: str
    read_at: datetime | None
    created_at: datetime
