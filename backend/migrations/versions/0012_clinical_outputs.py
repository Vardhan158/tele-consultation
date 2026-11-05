"""Add released consultation summaries and prescriptions."""
from alembic import op
import sqlalchemy as sa

revision = "0012_clinical_outputs"
down_revision = "0011_patient_documents"
branch_labels = None
depends_on = None


def _table(name):
    return op.create_table(name,
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("appointment_id", sa.UUID(), nullable=False), sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False), sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="draft"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True)), schema="records")


def upgrade() -> None:
    _table("consultation_summaries")
    _table("prescriptions")


def downgrade() -> None:
    op.drop_table("prescriptions", schema="records")
    op.drop_table("consultation_summaries", schema="records")
