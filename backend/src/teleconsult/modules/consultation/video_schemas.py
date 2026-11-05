from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class VideoJoinResponse(BaseModel):
    session_id: UUID
    room_id: str
    room_url: str | None = None
    token: str
    token_expires_at: datetime
    status: str


class VideoStatusResponse(BaseModel):
    session_id: UUID
    status: str
