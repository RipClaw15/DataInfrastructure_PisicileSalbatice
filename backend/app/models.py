from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Index, func
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


class ArmSession(Base):
    __tablename__ = "arm_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    rest_x: Mapped[float]
    rest_y: Mapped[float]
    rest_z: Mapped[float]
    armed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    disarmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# A phone can have many historical sessions, but only one open session.
Index(
    "uq_arm_sessions_open_device", ArmSession.device_id, unique=True,
    postgresql_where=ArmSession.disarmed_at.is_(None),
    sqlite_where=ArmSession.disarmed_at.is_(None),
)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64))
    # Database constraint also enforces one alert per session.
    session_id: Mapped[int] = mapped_column(ForeignKey("arm_sessions.id"), unique=True)
    type: Mapped[str] = mapped_column(String(32), default="picked_up")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    angle_deg: Mapped[float]
    value: Mapped[float]
    x: Mapped[float]
    y: Mapped[float]
    z: Mapped[float]


Index("ix_alerts_device_timestamp", Alert.device_id, Alert.timestamp.desc())


class SessionLocation(Base):
    """Optional GPS fix saved with an arm session, without altering existing rows."""

    __tablename__ = "session_locations"

    session_id: Mapped[int] = mapped_column(ForeignKey("arm_sessions.id"), primary_key=True)
    lat: Mapped[float]
    lon: Mapped[float]
    accuracy_m: Mapped[float | None]


class EventLocation(Base):
    """Optional GPS fix associated with an individual stored reading."""

    __tablename__ = "event_locations"

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), primary_key=True)
    lat: Mapped[float]
    lon: Mapped[float]
    accuracy_m: Mapped[float | None]


class EventSnapshot(Base):
    """Why a reading was retained. Legacy events have no metadata row."""

    __tablename__ = "event_snapshots"

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("arm_sessions.id"), index=True)
    reason: Mapped[str] = mapped_column(String(32))
