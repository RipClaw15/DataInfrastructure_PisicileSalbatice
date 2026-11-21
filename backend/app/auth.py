import hashlib
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Device


device_bearer = HTTPBearer(
    scheme_name="DeviceToken",
    description="Device token returned once by POST /api/register.",
    auto_error=False,
)


def invalid_token() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def require_device_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(device_bearer)
    ],
) -> str:
    if credentials is None:
        raise invalid_token()
    return credentials.credentials


def current_device(
    token: Annotated[str, Depends(require_device_token)],
    db: Annotated[Session, Depends(get_db)],
) -> Device:
    
    device = db.scalar(select(Device).where(Device.device_token_hash == hash_token(token)))
    if device is None:
        raise invalid_token()
    return device
