"""Add clinician MFA data and clinical note amendment history."""
import sqlalchemy as sa
from alembic import op

revision = "0018_doctor_mfa_note_amendments"
down_revision = "0017_doctor_identity"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("user_accounts", sa.Column("mfa_secret", sa.String(64)), schema="identity")
    op.add_column("user_accounts", sa.Column("mfa_recovery_codes", sa.JSON(), nullable=False, server_default="[]"), schema="identity")
    op.create_table("clinical_note_amendments",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("note_id", sa.UUID(), nullable=False), sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content_reference", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), schema="consultation")

def downgrade() -> None:
    op.drop_table("clinical_note_amendments", schema="consultation")
    op.drop_column("user_accounts", "mfa_recovery_codes", schema="identity")
    op.drop_column("user_accounts", "mfa_secret", schema="identity")
