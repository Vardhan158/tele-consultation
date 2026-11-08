"""Keep independent short-lived signaling tokens for each participant."""
import sqlalchemy as sa
from alembic import op

revision = "0020_video_participant_tokens"
down_revision = "0019_session_mfa"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("video_sessions", sa.Column("patient_token_hash", sa.String(length=128), nullable=True), schema="consultation")
    op.add_column("video_sessions", sa.Column("doctor_token_hash", sa.String(length=128), nullable=True), schema="consultation")

def downgrade() -> None:
    op.drop_column("video_sessions", "doctor_token_hash", schema="consultation")
    op.drop_column("video_sessions", "patient_token_hash", schema="consultation")
