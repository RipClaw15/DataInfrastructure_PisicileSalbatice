from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_device, current_phone_any_token
from ..db import get_db
from ..guard import alert_response, device_status, lock_device, open_session, utc_now
from ..live import live_telemetry
from ..models import Alert, ArmSession, Device, SessionLocation
from ..retention import save_session_snapshot
from ..schemas import AlertsResponse, ArmRequest, EventResponse, GuardStatus

router = APIRouter(prefix="/api/me", tags=["guard"])
Database = Annotated[Session, Depends(get_db)]


@router.post("/arm", response_model=GuardStatus, response_model_exclude_unset=True)
def arm(
    payload: ArmRequest,
    device: Annotated[Device, Depends(current_device)],
    db: Database,
):
    device_id = device.device_id
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


@router.post("/disarm", response_model=GuardStatus, response_model_exclude_unset=True)
def disarm(
    device: Annotated[Device, Depends(current_device)],
    db: Database,
):
    device_id = device.device_id
    lock_device(db, device_id)
    session = open_session(db, device_id)
    if session:
        session.disarmed_at = utc_now()
        save_session_snapshot(db, session, "disarmed", session.disarmed_at)
        db.flush()
    result = device_status(db, device_id)
    db.commit()
    return result


@router.get("/status", response_model=GuardStatus, response_model_exclude_unset=True)
def status(
    device: Annotated[Device, Depends(current_phone_any_token)],
    db: Database,
):
    return device_status(db, device.device_id)


@router.get("/live", response_model=EventResponse | None, response_model_exclude_unset=True)
def live_reading(
    device: Annotated[Device, Depends(current_phone_any_token)],
):
    """Latest accepted reading only; ephemeral, not a database history."""
    sample = live_telemetry.get(device.device_id)
    return sample.reading if sample else None


@router.get("/alerts", response_model=AlertsResponse)
def alerts(
    device: Annotated[Device, Depends(current_phone_any_token)],
    db: Database,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
):
    device_id = device.device_id
    rows = db.scalars(
        select(Alert)
        .where(Alert.device_id == device_id)
        .order_by(Alert.timestamp.desc(), Alert.id.desc())
        .limit(limit)
    )
    return AlertsResponse(device_id=device_id, alerts=[alert_response(row) for row in rows])
