from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import current_device, current_phone_any_token
from ..db import get_db
from ..guard import utc_now
from ..models import Device
from ..schemas import DeviceResponse, DeviceUpdateRequest

router = APIRouter(prefix="/api", tags=["devices"])


@router.get("/me", response_model=DeviceResponse)
def get_me(device: Annotated[Device, Depends(current_phone_any_token)]) -> Device:
    return device


@router.patch("/me", response_model=DeviceResponse)
def update_me(
    payload: DeviceUpdateRequest,
    device: Annotated[Device, Depends(current_device)],
    db: Annotated[Session, Depends(get_db)],
) -> Device:
    name = payload.device_name.strip() if payload.device_name is not None else None
    device.device_name = name or None
    device.last_seen = utc_now()
    db.commit()
    db.refresh(device)
    return device
