import sqlalchemy as sa
from alembic import op

revision = "0015_user_settings"
down_revision = "0014_core_entities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False, index=True),
        sa.Column("user_id", sa.UUID(), nullable=False, index=True),
        sa.Column("email_reminders", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sms_reminders", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("wellness_updates", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("language", sa.String(64), nullable=False, server_default="English (US)"),
        sa.Column("time_zone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("accessibility", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("privacy", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_user_settings_tenant_user"),
        schema="identity",
    )


def downgrade() -> None:
    op.drop_table("user_settings", schema="identity")
