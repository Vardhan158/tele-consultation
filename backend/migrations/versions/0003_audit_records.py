"""Add the durable audit event sink."""
import sqlalchemy as sa
from alembic import op

revision = "0003_audit_records"
down_revision = "0002_patient_consent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS audit"))
    op.create_table(
        "audit_records",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(96), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(160)),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        schema="audit",
    )


def downgrade() -> None:
    op.drop_table("audit_records", schema="audit")
