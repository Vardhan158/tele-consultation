"""Add patient account, session, and recovery tables."""
import sqlalchemy as sa
from alembic import op

revision = "0004_identity_auth"
down_revision = "0003_audit_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS identity"))
    op.create_table("user_accounts",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(100), nullable=False), sa.Column("email", sa.String(320), nullable=False),
        sa.Column("mobile_number", sa.String(32), nullable=False), sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("terms_version", sa.String(32), nullable=False), sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True)), sa.Column("restricted_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "email", name="uq_identity_email"), schema="identity")
    op.create_table("auth_sessions",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), schema="identity")
    op.create_table("recovery_tokens",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)), schema="identity")


def downgrade() -> None:
    op.drop_table("recovery_tokens", schema="identity")
    op.drop_table("auth_sessions", schema="identity")
    op.drop_table("user_accounts", schema="identity")
    op.execute(sa.text("DROP SCHEMA IF EXISTS identity"))
