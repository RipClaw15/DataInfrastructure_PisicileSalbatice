from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Device(Base):
    """A guard phone. Dashboard credentials and guard sessions belong separately."""

    __tablename__ = "devices"
    __table_args__ = (
        CheckConstraint(
            "device_id ~ '^[a-z0-9-]{3,64}$'",
            name="ck_devices_device_id_format",
        ),
        CheckConstraint(
            "device_token_hash ~ '^[0-9a-f]{64}$'",
            name="ck_devices_device_token_hash_format",
        ),
    )

    # No ID default yet: existing mobile clients already generate phone IDs.
    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_name: Mapped[str | None] = mapped_column(String(64))

    # SHA-256 hex digest only. Never store the raw device token here.
    device_token_hash: Mapped[str] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Timestamp of the newest sensor reading; None until the first reading.
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64))
    event_type: Mapped[str] = mapped_column(String(32))
    value: Mapped[float]
    unit: Mapped[str] = mapped_column(String(8))
    x: Mapped[float]
    y: Mapped[float]
    z: Mapped[float]
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


Index("ix_events_device_timestamp", Event.device_id, Event.timestamp.desc())
Index("ix_events_timestamp", Event.timestamp.desc())
