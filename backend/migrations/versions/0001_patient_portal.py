"""Create the patient portal core tables."""

import sqlalchemy as sa
from alembic import op

revision = "0001_patient_portal"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS patient_portal"))
    op.create_table(
        "patients", sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False, index=True),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), schema="patient_portal",
    )
    op.create_table(
        "doctors", sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False, index=True),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("specialty", sa.String(120), nullable=False),
        sa.Column("clinic_name", sa.String(180), nullable=False),
        sa.Column("fee_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()), schema="patient_portal",
    )
    op.create_table(
        "appointments", sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False, index=True),
        sa.Column("patient_id", sa.UUID(), sa.ForeignKey("patient_portal.patients.id"), nullable=False),
        sa.Column("doctor_id", sa.UUID(), sa.ForeignKey("patient_portal.doctors.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="requested"),
        sa.Column("payment_status", sa.String(32), nullable=False, server_default="not_required"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("doctor_id", "starts_at", name="uq_doctor_slot"), schema="patient_portal",
    )


def downgrade() -> None:
    op.drop_table("appointments", schema="patient_portal")
    op.drop_table("doctors", schema="patient_portal")
    op.drop_table("patients", schema="patient_portal")
    op.execute(sa.text("DROP SCHEMA IF EXISTS patient_portal"))
