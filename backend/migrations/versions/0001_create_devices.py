"""Create the devices table."""
from alembic import op
import sqlalchemy as sa


revision = "0001_create_devices"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("device_name", sa.String(64), nullable=True),
        sa.Column("device_token_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("device_id"),
        sa.UniqueConstraint("device_token_hash"),
        sa.CheckConstraint(
            "device_id ~ '^[a-z0-9-]{3,64}$'",
            name="ck_devices_device_id_format",
        ),
        sa.CheckConstraint(
            "device_token_hash ~ '^[0-9a-f]{64}$'",
            name="ck_devices_device_token_hash_format",
        ),
    )


def downgrade() -> None:
    op.drop_table("devices")
