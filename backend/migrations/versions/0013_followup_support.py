"""Add patient follow-up and least-privilege support tickets."""
import sqlalchemy as sa
from alembic import op

revision = "0013_followup_support"
down_revision = "0012_clinical_outputs"
branch_labels = None
depends_on = None


def _table(name, columns):
    op.create_table(name, *columns, schema="support_access")


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS support_access"))
    common = [sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False), sa.Column("patient_id", sa.UUID(), nullable=False)]
    _table("follow_up_actions", common + [sa.Column("appointment_id", sa.UUID(), nullable=False), sa.Column("advice", sa.Text(), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="released"), sa.Column("next_appointment_id", sa.UUID()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)])
    _table("support_tickets", common + [sa.Column("category", sa.String(40), nullable=False), sa.Column("description", sa.String(2000), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="open"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)])


def downgrade() -> None:
    op.drop_table("support_tickets", schema="support_access")
    op.drop_table("follow_up_actions", schema="support_access")
    op.execute(sa.text("DROP SCHEMA IF EXISTS support_access"))
