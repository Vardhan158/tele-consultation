from alembic import op
import sqlalchemy as sa

revision = "0016_payment_order_webhook"
down_revision = "0015_user_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payment_transactions", sa.Column("provider_order_id", sa.String(160), nullable=True), schema="payments")
    op.create_index("ix_payments_payment_transactions_provider_order_id", "payment_transactions", ["provider_order_id"], schema="payments")


def downgrade() -> None:
    op.drop_index("ix_payments_payment_transactions_provider_order_id", table_name="payment_transactions", schema="payments")
    op.drop_column("payment_transactions", "provider_order_id", schema="payments")
