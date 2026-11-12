"""Add idempotent payment transactions."""
import sqlalchemy as sa
from alembic import op

revision = "0008_payments"
down_revision = "0007_appointment_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS payments"))
    op.create_table("payment_transactions",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("appointment_id", sa.UUID(), nullable=False), sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False, server_default="stub"),
        sa.Column("provider_transaction_id", sa.String(160)), sa.Column("idempotency_key", sa.String(128), nullable=False, unique=True),
        sa.Column("amount_paise", sa.Integer(), nullable=False), sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("status", sa.String(24), nullable=False, server_default="initiated"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("verified_at", sa.DateTime(timezone=True)), schema="payments")


def downgrade() -> None:
    op.drop_table("payment_transactions", schema="payments")
    op.execute(sa.text("DROP SCHEMA IF EXISTS payments"))
