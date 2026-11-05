"""Add private patient document registry."""
from alembic import op
import sqlalchemy as sa

revision = "0011_patient_documents"
down_revision = "0010_video_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS records"))
    op.create_table("patient_documents",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False), sa.Column("category", sa.String(48), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False), sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False), sa.Column("private_storage_key", sa.String(255), nullable=False, unique=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="scanning"), sa.Column("released_to_patient", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("released_at", sa.DateTime(timezone=True)), schema="records")


def downgrade() -> None:
    op.drop_table("patient_documents", schema="records")
    op.execute(sa.text("DROP SCHEMA IF EXISTS records"))
