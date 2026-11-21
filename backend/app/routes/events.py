from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_device, current_phone_any_token, forbidden
from ..db import get_db
from ..guard import detect_reading, lock_device, open_session, utc_now
from ..live import live_telemetry
from ..models import Alert, Device, Event, EventLocation, EventSnapshot
from ..retention import save_snapshot, should_save_gps
from ..schemas import EventCreated, EventRequest, EventResponse, EventsResponse

router = APIRouter(prefix="/api/me/events", tags=["events"])
Database = Annotated[Session, Depends(get_db)]


@router.post("", status_code=201, response_model=EventCreated)
def post_event(
    payload: EventRequest,
    device: Annotated[Device, Depends(current_device)],
    db: Database,
):
    if payload.device_id != device.device_id:
        raise forbidden()

    lock_device(db, device.device_id)
    event = Event(
        **payload.model_dump(exclude={"axes", "location"}),
        **payload.axes.model_dump(),
        received_at=utc_now(),
    )
    if device.last_seen is None:
        device.last_seen = payload.timestamp
    else:
        existing = device.last_seen.replace(tzinfo=device.last_seen.tzinfo or timezone.utc)
        if payload.timestamp > existing:
            device.last_seen = payload.timestamp

    alert = detect_reading(db, event)
    session = open_session(db, device.device_id)
    reason = None
    if alert is not None:
        reason = "picked_up"
    elif session is not None and db.scalar(select(Alert.id).where(Alert.session_id == session.id)) is not None:
        if should_save_gps(db, session, event, payload.location):
            reason = "gps_update"
    if reason is not None:
        save_snapshot(db, event, session, reason, payload.location)
    db.commit()
    if reason is not None:
        db.refresh(event)
    receipt_id = event.id if reason is not None else 0
    live_telemetry.put(EventResponse(
        **payload.model_dump(), id=receipt_id, received_at=event.received_at,
    ))
    return EventCreated(id=receipt_id, device_id=event.device_id,
                        received_at=event.received_at, stored=reason is not None)


@router.get("", response_model=EventsResponse, response_model_exclude_unset=True)
def get_events(
    device: Annotated[Device, Depends(current_phone_any_token)],
    db: Database,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
):
    events = db.execute(
        select(Event, EventLocation, EventSnapshot)
        .outerjoin(EventLocation, Event.id == EventLocation.event_id)
        .outerjoin(EventSnapshot, Event.id == EventSnapshot.event_id)
        .where(Event.device_id == device.device_id)
        .order_by(Event.timestamp.desc(), Event.id.desc())
        .limit(limit)
    )
    return EventsResponse(events=[
        EventResponse(
            id=e.id, device_id=e.device_id, event_type=e.event_type,
            value=e.value, unit=e.unit,
            timestamp=e.timestamp.replace(tzinfo=e.timestamp.tzinfo or timezone.utc),
            received_at=e.received_at,
            axes={"x": e.x, "y": e.y, "z": e.z},
            **({"location": {"lat": location.lat, "lon": location.lon, "accuracy_m": location.accuracy_m}}
               if location is not None else {}),
            **({"snapshot_reason": snapshot.reason} if snapshot is not None else {}),
        ) for e, location, snapshot in events
    ])
