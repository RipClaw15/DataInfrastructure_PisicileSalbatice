from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Event
from ..schemas import EventCreated, EventRequest, EventResponse, EventsResponse

router = APIRouter(prefix="/api/events", tags=["events"])
Database = Annotated[Session, Depends(get_db)]


@router.post("", status_code=201, response_model=EventCreated)
def post_event(payload: EventRequest, db: Database):
    event = Event(
        **payload.model_dump(exclude={"axes"}),
        **payload.axes.model_dump(),
        received_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventCreated(id=event.id, device_id=event.device_id, received_at=event.received_at)


@router.get("", response_model=EventsResponse)
def get_events(db: Database, limit: Annotated[int, Query(ge=1, le=500)] = 50):
    events = db.scalars(select(Event).order_by(Event.timestamp.desc(), Event.id.desc()).limit(limit))
    return EventsResponse(events=[
        EventResponse(
            id=e.id, device_id=e.device_id, event_type=e.event_type,
            value=e.value, unit=e.unit,
            timestamp=e.timestamp.replace(tzinfo=e.timestamp.tzinfo or timezone.utc),
            received_at=e.received_at,
            axes={"x": e.x, "y": e.y, "z": e.z},
        ) for e in events
    ])
