"""Add patient profile fields and medical intake."""
import sqlalchemy as sa
from alembic import op

revision = "0005_patient_profile_intake"
down_revision = "0004_identity_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("date_of_birth", sa.DateTime(timezone=True)), schema="patient_portal")
    op.add_column("patients", sa.Column("preferred_language", sa.String(32), nullable=False, server_default="en"), schema="patient_portal")
    op.add_column("patients", sa.Column("address", sa.String(500)), schema="patient_portal")
    op.add_column("patients", sa.Column("emergency_contact", sa.String(160)), schema="patient_portal")
    op.create_table("medical_intakes",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False), sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("symptoms", sa.String(2000), nullable=False), sa.Column("symptom_duration", sa.String(120), nullable=False),
        sa.Column("medical_history", sa.String(4000)), sa.Column("allergies", sa.String(2000)),
        sa.Column("current_medications", sa.String(2000)), sa.Column("supporting_reports", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False), schema="patient_portal")


def downgrade() -> None:
    op.drop_table("medical_intakes", schema="patient_portal")
    for column in ("emergency_contact", "address", "preferred_language", "date_of_birth"):
        op.drop_column("patients", column, schema="patient_portal")
