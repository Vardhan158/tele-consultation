"""Add clinician identity, approval, and profile metadata."""
import sqlalchemy as sa
from alembic import op

revision = "0017_doctor_identity"
down_revision = "0016_payment_order_webhook"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_accounts", sa.Column("role", sa.String(24), nullable=False, server_default="patient"), schema="identity")
    op.add_column("user_accounts", sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()), schema="identity")
    op.create_index("ix_identity_user_accounts_role", "user_accounts", ["role"], schema="identity")
    op.add_column("doctors", sa.Column("user_account_id", sa.UUID(), nullable=True), schema="patient_portal")
    op.add_column("doctors", sa.Column("approval_status", sa.String(24), nullable=False, server_default="pending"), schema="patient_portal")
    op.add_column("doctors", sa.Column("qualifications", sa.JSON(), nullable=False, server_default="[]"), schema="patient_portal")
    op.add_column("doctors", sa.Column("experience_years", sa.Integer(), nullable=True), schema="patient_portal")
    op.add_column("doctors", sa.Column("languages", sa.JSON(), nullable=False, server_default="[]"), schema="patient_portal")
    op.create_index("ix_patient_portal_doctors_user_account_id", "doctors", ["user_account_id"], schema="patient_portal")
    op.create_index("ix_patient_portal_doctors_approval_status", "doctors", ["approval_status"], schema="patient_portal")


def downgrade() -> None:
    op.drop_index("ix_patient_portal_doctors_approval_status", table_name="doctors", schema="patient_portal")
    op.drop_index("ix_patient_portal_doctors_user_account_id", table_name="doctors", schema="patient_portal")
    for column in ("languages", "experience_years", "qualifications", "approval_status", "user_account_id"):
        op.drop_column("doctors", column, schema="patient_portal")
    op.drop_index("ix_identity_user_accounts_role", table_name="user_accounts", schema="identity")
    op.drop_column("user_accounts", "mfa_enabled", schema="identity")
    op.drop_column("user_accounts", "role", schema="identity")
