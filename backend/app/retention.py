"""Persist state snapshots and a limited GPS trail, never routine samples."""

import math
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .live import live_telemetry
from .models import ArmSession, Event, EventLocation, EventSnapshot, SessionLocation
from .schemas import Location

STATE_SNAPSHOTS = ("armed", "disarmed")


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc)


def save_snapshot(db: Session, event: Event, session: ArmSession, reason: str,
                  location: Location | None = None) -> None:
    db.add(event)
    db.flush()
    db.add(EventSnapshot(event_id=event.id, session_id=session.id, reason=reason))
    if location is not None:
        db.add(EventLocation(event_id=event.id, **location.model_dump()))


def save_session_snapshot(db: Session, session: ArmSession, reason: str, timestamp: datetime) -> None:
    sample = live_telemetry.get(session.device_id) if reason == "disarmed" else None
    if sample:
        axes = sample.reading.axes
        x, y, z, value = axes.x, axes.y, axes.z, sample.reading.value
        location = sample.location
    else:
        x, y, z = session.rest_x, session.rest_y, session.rest_z
        value = math.hypot(x, y, z)
        stored_location = db.get(SessionLocation, session.id)
        location = Location(lat=stored_location.lat, lon=stored_location.lon,
                            accuracy_m=stored_location.accuracy_m) if stored_location else None
    event = Event(
        device_id=session.device_id, event_type="accelerometer", unit="g", value=value,
        x=x, y=y, z=z, timestamp=timestamp, received_at=datetime.now(timezone.utc),
    )
    save_snapshot(db, event, session, reason, location)


def distance_meters(a: Location, b: Location) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    delta_lat = lat2 - lat1
    delta_lon = math.radians(b.lon - a.lon)
    h = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(max(0.0, min(1.0, h))))


def should_save_gps(db: Session, session: ArmSession, event: Event, location: Location | None) -> bool:
    if location is None:
        return False
    previous = db.execute(
        select(Event, EventLocation).join(EventLocation, EventLocation.event_id == Event.id)
        .join(EventSnapshot, EventSnapshot.event_id == Event.id)
        .where(EventSnapshot.session_id == session.id,
               EventSnapshot.reason.in_(("picked_up", "gps_update")))
        .order_by(Event.received_at.desc(), Event.id.desc()).limit(1)
    ).first()
    if previous is None:
        return True
    saved, fix = previous
    if as_utc(event.timestamp) <= as_utc(saved.timestamp):
        return False
    if (as_utc(event.received_at) - as_utc(saved.received_at)).total_seconds() < settings.alert_gps_interval_seconds:
        return False
    rest = Location(lat=fix.lat, lon=fix.lon, accuracy_m=fix.accuracy_m)
    # Avoid retaining small movements that are within either fix's uncertainty.
    threshold = max(settings.alert_gps_distance_meters, rest.accuracy_m or 0, location.accuracy_m or 0)
    return distance_meters(rest, location) >= threshold
