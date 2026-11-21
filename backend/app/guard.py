"""Database operations shared by guard routes and incoming readings."""

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .detection import picked_up_angle
from .models import Alert, ArmSession, Event, EventLocation, SessionLocation
from .schemas import AlertResponse, GuardStatus, Location


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def lock_device(db: Session, device_id: str) -> None:
    """Serialize mutations for each phone, even across PostgreSQL API workers.

    A transaction-level advisory lock also covers the first arm, when no row
    exists to lock yet. It is released by commit/rollback, including on failure.
    SQLite is used only by sequential, in-memory unit tests.
    """
    if db.get_bind().dialect.name == "postgresql":
        key = int.from_bytes(hashlib.sha256(device_id.encode()).digest()[:8], signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def open_session(db: Session, device_id: str) -> ArmSession | None:
    return db.scalar(select(ArmSession).where(
        ArmSession.device_id == device_id, ArmSession.disarmed_at.is_(None),
    ))


def require_device(db: Session, device_id: str) -> None:
    has_event = db.scalar(select(Event.id).where(Event.device_id == device_id).limit(1))
    has_session = db.scalar(select(ArmSession.id).where(ArmSession.device_id == device_id).limit(1))
    if has_event is None and has_session is None:
        raise HTTPException(status_code=404, detail="Device not found")


def alert_response(alert: Alert) -> AlertResponse:
    return AlertResponse(
        id=alert.id, device_id=alert.device_id, type=alert.type,
        timestamp=alert.timestamp, angle_deg=alert.angle_deg, value=alert.value, unit="g",
        axes={"x": alert.x, "y": alert.y, "z": alert.z},
    )


def device_status(db: Session, device_id: str) -> GuardStatus:
    session = open_session(db, device_id)
    alert = db.scalar(select(Alert).where(Alert.session_id == session.id)) if session else None
    armed_location = db.get(SessionLocation, session.id) if session else None
    latest_location = db.scalar(select(EventLocation).join(Event, Event.id == EventLocation.event_id)
                                .where(Event.device_id == device_id)
                                .order_by(Event.timestamp.desc(), Event.id.desc()).limit(1))
    locations = {}
    if armed_location:
        locations["location"] = Location(lat=armed_location.lat, lon=armed_location.lon,
                                         accuracy_m=armed_location.accuracy_m)
    if latest_location:
        locations["last_location"] = Location(lat=latest_location.lat, lon=latest_location.lon,
                                              accuracy_m=latest_location.accuracy_m)
    last_seen, last_received = db.execute(select(
        func.max(Event.timestamp), func.max(Event.received_at),
    ).where(Event.device_id == device_id)).one()
    # Online is based on server arrival, not the phone clock. last_seen remains
    # the newest reading timestamp even when readings arrive out of order.
    online = False
    if last_received is not None:
        arrived = last_received.replace(tzinfo=last_received.tzinfo or timezone.utc)
        online = timedelta(0) <= utc_now() - arrived <= timedelta(minutes=5)
    return GuardStatus(
        device_id=device_id,
        state="DISARMED" if session is None else "ALERT" if alert else "GUARDING",
        armed_at=session.armed_at if session else None,
        last_seen=last_seen, online=online,
        last_alert=alert_response(alert) if alert else None,
        **locations,
    )


def detect_reading(db: Session, event: Event) -> None:
    """Called under the device lock; save any alert in the reading transaction."""
    session = open_session(db, event.device_id)
    if session is None:
        return
    if db.scalar(select(Alert.id).where(Alert.session_id == session.id)) is not None:
        return
    angle = picked_up_angle(
        (session.rest_x, session.rest_y, session.rest_z), (event.x, event.y, event.z),
    )
    if angle is not None:
        db.add(Alert(
            device_id=event.device_id, session_id=session.id,
            type="picked_up", timestamp=event.timestamp, angle_deg=angle,
            value=event.value, x=event.x, y=event.y, z=event.z,
        ))
