"""Persist non-media consultation lifecycle events."""
import sqlalchemy as sa
from alembic import op

revision = "0021_video_session_events"
down_revision = "0020_video_participant_tokens"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "video_session_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("appointment_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        schema="consultation",
    )
    op.create_index("ix_video_session_events_session_id", "video_session_events", ["session_id"], schema="consultation")
    op.create_index("ix_video_session_events_appointment_id", "video_session_events", ["appointment_id"], schema="consultation")

def downgrade() -> None:
    op.drop_table("video_session_events", schema="consultation")
