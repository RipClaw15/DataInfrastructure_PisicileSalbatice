from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import generate_token, hash_token
from ..db import get_db
from ..models import Device
from ..schemas import RegisterRequest, RegisterResponse

router = APIRouter(prefix="/api", tags=["devices"])


@router.post("/register", status_code=201, response_model=RegisterResponse)
def register_device(
    payload: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
) -> RegisterResponse:
    if db.get(Device, payload.device_id) is not None:
        raise HTTPException(status_code=409, detail="Device already registered")

    token = generate_token()
    device = Device(
        device_id=payload.device_id,
        device_name=payload.device_name,
        device_token_hash=hash_token(token),
    )
    db.add(device)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        
        if db.get(Device, payload.device_id) is not None:
            raise HTTPException(status_code=409, detail="Device already registered") from None
        raise

    db.refresh(device)
    
    return RegisterResponse(
        device_id=device.device_id,
        device_token=token,
        created_at=device.created_at,
    )
