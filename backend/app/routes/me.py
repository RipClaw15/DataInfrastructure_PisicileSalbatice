from typing import Annotated

from fastapi import APIRouter, Depends

from ..auth import current_device
from ..models import Device
from ..schemas import DeviceResponse

router = APIRouter(prefix="/api", tags=["devices"])


@router.get("/me", response_model=DeviceResponse)
def get_me(device: Annotated[Device, Depends(current_device)]) -> Device:
    return device
