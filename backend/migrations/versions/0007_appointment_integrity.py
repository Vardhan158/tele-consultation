"""Add appointment idempotency and transition history."""
from alembic import op
import sqlalchemy as sa

revision = "0007_appointment_integrity"
down_revision = "0006_directory_availability"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("appointments", sa.Column("idempotency_key", sa.String(128)), schema="patient_portal")
    op.create_index("ix_appointment_idempotency", "appointments", ["idempotency_key"], schema="patient_portal")
    op.create_table("appointment_events",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("appointment_id", sa.UUID(), sa.ForeignKey("patient_portal.appointments.id"), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False), sa.Column("from_status", sa.String(32)),
        sa.Column("to_status", sa.String(32), nullable=False), sa.Column("reason", sa.String(500)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False), schema="patient_portal")


def downgrade() -> None:
    op.drop_table("appointment_events", schema="patient_portal")
    op.drop_index("ix_appointment_idempotency", table_name="appointments", schema="patient_portal")
    op.drop_column("appointments", "idempotency_key", schema="patient_portal")
