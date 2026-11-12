"""Add secure video session state and short-lived room tokens."""
import sqlalchemy as sa
from alembic import op

revision = "0010_video_sessions"
down_revision = "0009_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS consultation"))
    op.create_table("video_sessions",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("appointment_id", sa.UUID(), nullable=False), sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False, server_default="stub"), sa.Column("room_id", sa.String(160), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="not_ready"), sa.Column("token_hash", sa.String(128)),
        sa.Column("token_expires_at", sa.DateTime(timezone=True)), sa.Column("connected_at", sa.DateTime(timezone=True)),
        sa.Column("disconnected_at", sa.DateTime(timezone=True)), sa.Column("ended_at", sa.DateTime(timezone=True)), schema="consultation")


def downgrade() -> None:
    op.drop_table("video_sessions", schema="consultation")
    op.execute(sa.text("DROP SCHEMA IF EXISTS consultation"))
