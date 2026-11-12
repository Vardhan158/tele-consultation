"""Add logical core entities for clinics, specialties, refunds, and encounters."""
import sqlalchemy as sa
from alembic import op

revision = "0014_core_entities"
down_revision = "0013_followup_support"
branch_labels = None
depends_on = None


def table(schema, name, columns):
    op.create_table(name, *columns, schema=schema)


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS tenancy"))
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS directory"))
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS payments"))
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS consultation"))
    table("tenancy", "clinics", [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False), sa.Column("name", sa.String(180), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="active"), sa.Column("configuration", sa.JSON(), nullable=False)])
    table("directory", "specialties", [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False), sa.Column("name", sa.String(120), nullable=False, unique=True), sa.Column("status", sa.String(24), nullable=False, server_default="active")])
    table("payments", "refunds", [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False), sa.Column("payment_id", sa.UUID(), nullable=False), sa.Column("amount_paise", sa.Integer(), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="refund_pending"), sa.Column("provider_reference", sa.String(160)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)])
    table("consultation", "consultations", [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False), sa.Column("appointment_id", sa.UUID(), nullable=False), sa.Column("session_status", sa.String(32), nullable=False, server_default="not_ready"), sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("ended_at", sa.DateTime(timezone=True))])
    table("consultation", "clinical_notes", [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False), sa.Column("consultation_id", sa.UUID(), nullable=False), sa.Column("doctor_id", sa.UUID(), nullable=False), sa.Column("content_reference", sa.Text(), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="draft"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)])


def downgrade() -> None:
    op.drop_table("clinical_notes", schema="consultation")
    op.drop_table("consultations", schema="consultation")
    op.drop_table("refunds", schema="payments")
    op.drop_table("specialties", schema="directory")
    op.drop_table("clinics", schema="tenancy")
