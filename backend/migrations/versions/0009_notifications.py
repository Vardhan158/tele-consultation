"""Add patient notification ledger."""
import sqlalchemy as sa
from alembic import op

revision = "0009_notifications"
down_revision = "0008_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS notifications"))
    op.create_table("notifications",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False), sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False, server_default="in_app"), sa.Column("subject", sa.String(160), nullable=False),
        sa.Column("body", sa.String(1000), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("delivered_at", sa.DateTime(timezone=True)), schema="notifications")


def downgrade() -> None:
    op.drop_table("notifications", schema="notifications")
    op.execute(sa.text("DROP SCHEMA IF EXISTS notifications"))
