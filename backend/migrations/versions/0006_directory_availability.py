"""Add doctor eligibility, public profile metadata, and slots."""
import sqlalchemy as sa
from alembic import op

revision = "0006_directory_availability"
down_revision = "0005_patient_profile_intake"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("doctors", sa.Column("approved_for_consultation", sa.Boolean(), nullable=False, server_default=sa.false()), schema="patient_portal")
    op.add_column("doctors", sa.Column("supported_languages", sa.JSON(), nullable=False, server_default="[]"), schema="patient_portal")
    op.add_column("doctors", sa.Column("registration_number", sa.String(64)), schema="patient_portal")
    op.create_table("doctor_availability",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("doctor_id", sa.UUID(), sa.ForeignKey("patient_portal.doctors.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="available"),
        sa.UniqueConstraint("doctor_id", "starts_at", name="uq_doctor_availability_slot"), schema="patient_portal")


def downgrade() -> None:
    op.drop_table("doctor_availability", schema="patient_portal")
    for column in ("registration_number", "supported_languages", "approved_for_consultation"):
        op.drop_column("doctors", column, schema="patient_portal")
