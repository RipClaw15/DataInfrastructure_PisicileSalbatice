from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from ..auth import current_device, current_phone_any_token
from ..db import get_db
from ..guard import lock_device, paired_dashboards, utc_now
from ..live import live_telemetry
from ..models import (
    Alert,
    ArmSession,
    Device,
    Event,
    EventLocation,
    EventSnapshot,
    PairingCode,
    SessionLocation,
    ViewerToken,
)
from ..schemas import DeviceResponse, DeviceUpdateRequest

router = APIRouter(prefix="/api", tags=["devices"])


def device_response(db: Session, device: Device) -> DeviceResponse:
    return DeviceResponse.model_validate(device).model_copy(update={"paired_dashboards": paired_dashboards(db, device.device_id)})


@router.get("/me", response_model=DeviceResponse)
def get_me(
    device: Annotated[Device, Depends(current_phone_any_token)],
    db: Annotated[Session, Depends(get_db)],
) -> DeviceResponse:
    return device_response(db, device)


@router.patch("/me", response_model=DeviceResponse)
def update_me(
    payload: DeviceUpdateRequest,
    device: Annotated[Device, Depends(current_device)],
    db: Annotated[Session, Depends(get_db)],
) -> DeviceResponse:
    name = payload.device_name.strip() if payload.device_name is not None else None
    device.device_name = name or None
    device.last_seen = utc_now()
    db.commit()
    db.refresh(device)
    return device_response(db, device)


@router.delete("/me", status_code=204)
def delete_me(
    device: Annotated[Device, Depends(current_device)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Delete this phone and everything stored about it. Only the phone's own token can do this, not a dashboard."""
    device_id = device.device_id
    lock_device(db, device_id)
    events = select(Event.id).where(Event.device_id == device_id)
    sessions = select(ArmSession.id).where(ArmSession.device_id == device_id)
    # Children first, so no foreign key is left pointing at a deleted row.
    db.execute(delete(EventLocation).where(EventLocation.event_id.in_(events)))
    db.execute(delete(EventSnapshot).where(or_(EventSnapshot.event_id.in_(events), EventSnapshot.session_id.in_(sessions))))
    db.execute(delete(SessionLocation).where(SessionLocation.session_id.in_(sessions)))
    db.execute(delete(Alert).where(or_(Alert.device_id == device_id, Alert.session_id.in_(sessions))))
    db.execute(delete(Event).where(Event.device_id == device_id))
    db.execute(delete(ArmSession).where(ArmSession.device_id == device_id))
    db.execute(delete(PairingCode).where(PairingCode.device_id == device_id))
    db.execute(delete(ViewerToken).where(ViewerToken.device_id == device_id))
    db.execute(delete(Device).where(Device.device_id == device_id))
    db.commit()
    live_telemetry.forget(device_id)
    return Response(status_code=204)
