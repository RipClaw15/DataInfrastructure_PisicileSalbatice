from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..guard import detect_reading, lock_device
from ..models import Event, EventLocation
from ..schemas import EventCreated, EventRequest, EventResponse, EventsResponse

router = APIRouter(prefix="/api/events", tags=["events"])
Database = Annotated[Session, Depends(get_db)]


@router.post("", status_code=201, response_model=EventCreated)
def post_event(payload: EventRequest, db: Database):
    lock_device(db, payload.device_id)
    event = Event(
        **payload.model_dump(exclude={"axes", "location"}),
        **payload.axes.model_dump(),
        received_at=datetime.now(timezone.utc),
    )
    db.add(event)
    if payload.location is not None:
        db.flush()
        db.add(EventLocation(event_id=event.id, **payload.location.model_dump()))
    detect_reading(db, event)
    db.commit()
    db.refresh(event)
    return EventCreated(id=event.id, device_id=event.device_id, received_at=event.received_at)


@router.get("", response_model=EventsResponse, response_model_exclude_unset=True)
def get_events(db: Database, limit: Annotated[int, Query(ge=1, le=500)] = 50):
    events = db.execute(select(Event, EventLocation).outerjoin(EventLocation, Event.id == EventLocation.event_id)
                        .order_by(Event.timestamp.desc(), Event.id.desc()).limit(limit))
    return EventsResponse(events=[
        EventResponse(
            id=e.id, device_id=e.device_id, event_type=e.event_type,
            value=e.value, unit=e.unit,
            timestamp=e.timestamp.replace(tzinfo=e.timestamp.tzinfo or timezone.utc),
            received_at=e.received_at,
            axes={"x": e.x, "y": e.y, "z": e.z},
            **({"location": {"lat": location.lat, "lon": location.lon, "accuracy_m": location.accuracy_m}}
               if location is not None else {}),
        ) for e, location in events
    ])
