"""Add auditable patient consent records."""

from alembic import op
import sqlalchemy as sa

revision = "0002_patient_consent"
down_revision = "0001_patient_portal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_consents",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("consent_type", sa.String(64), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="granted"),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        schema="patient_portal",
    )


def downgrade() -> None:
    op.drop_table("patient_consents", schema="patient_portal")
