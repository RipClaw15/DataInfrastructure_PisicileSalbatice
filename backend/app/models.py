from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Device(Base):
    """A guard phone. Dashboard credentials and guard sessions belong separately."""

    __tablename__ = "devices"

    
    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_name: Mapped[str | None] = mapped_column(String(64))

    
    device_token_hash: Mapped[str] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ViewerToken(Base):
    """Read-only dashboard token bound to a single phone."""

    __tablename__ = "viewer_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.device_id"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PairingCode(Base):
    """Short-lived, single-use 6-digit code to pair a dashboard with a phone."""

    __tablename__ = "pairing_codes"

    code: Mapped[str] = mapped_column(String(6), primary_key=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.device_id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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



Index(
    "uq_arm_sessions_open_device", ArmSession.device_id, unique=True,
    postgresql_where=ArmSession.disarmed_at.is_(None),
    sqlite_where=ArmSession.disarmed_at.is_(None),
)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64))
    
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
