from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..guard import alert_response, device_status, lock_device, open_session, require_device, utc_now
from ..models import Alert, ArmSession, SessionLocation
from ..schemas import AlertsResponse, ArmRequest, DeviceId, EventResponse, GuardStatus
from ..live import live_telemetry
from ..retention import save_session_snapshot

router = APIRouter(prefix="/api/devices", tags=["guard"])
Database = Annotated[Session, Depends(get_db)]


@router.post("/{device_id}/arm", response_model=GuardStatus, response_model_exclude_unset=True)
def arm(device_id: DeviceId, payload: ArmRequest, db: Database):
    lock_device(db, device_id)
    previous = open_session(db, device_id)
    if previous:
        previous.disarmed_at = utc_now()
        save_session_snapshot(db, previous, "disarmed", previous.disarmed_at)
        # Close the previous session before inserting, satisfying the unique index.
        db.flush()
    session = ArmSession(
        device_id=device_id, armed_at=payload.timestamp,
        rest_x=payload.axes.x, rest_y=payload.axes.y, rest_z=payload.axes.z,
    )
    db.add(session)
    db.flush()
    if payload.location is not None:
        db.add(SessionLocation(session_id=session.id, **payload.location.model_dump()))
        db.flush()
    save_session_snapshot(db, session, "armed", payload.timestamp)
    result = device_status(db, device_id)
    db.commit()
    return result


@router.post("/{device_id}/disarm", response_model=GuardStatus, response_model_exclude_unset=True)
def disarm(device_id: DeviceId, db: Database):
    lock_device(db, device_id)
    session = open_session(db, device_id)
    if session:
        session.disarmed_at = utc_now()
        save_session_snapshot(db, session, "disarmed", session.disarmed_at)
        db.flush()
    result = device_status(db, device_id)
    db.commit()
    return result


@router.get("/{device_id}/status", response_model=GuardStatus, response_model_exclude_unset=True)
def status(device_id: DeviceId, db: Database):
    require_device(db, device_id)
    return device_status(db, device_id)


@router.get("/{device_id}/live", response_model=EventResponse | None, response_model_exclude_unset=True)
def live_reading(device_id: DeviceId, db: Database):
    """Latest accepted reading only; ephemeral, not a database history."""
    require_device(db, device_id)
    sample = live_telemetry.get(device_id)
    return sample.reading if sample else None


@router.get("/{device_id}/alerts", response_model=AlertsResponse)
def alerts(device_id: DeviceId, db: Database, limit: Annotated[int, Query(ge=1, le=200)] = 20):
    require_device(db, device_id)
    rows = db.scalars(select(Alert).where(Alert.device_id == device_id)
                      .order_by(Alert.timestamp.desc(), Alert.id.desc()).limit(limit))
    return AlertsResponse(device_id=device_id, alerts=[alert_response(row) for row in rows])
