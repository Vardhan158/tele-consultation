"""Track MFA verification on authenticated sessions."""
import sqlalchemy as sa
from alembic import op

revision = "0019_session_mfa"
down_revision = "0018_doctor_mfa_note_amendments"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("mfa_verified", sa.Boolean(), nullable=False, server_default=sa.false()), schema="identity")

def downgrade() -> None:
    op.drop_column("auth_sessions", "mfa_verified", schema="identity")
