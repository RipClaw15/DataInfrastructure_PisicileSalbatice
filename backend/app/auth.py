import hashlib
import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Device, ViewerToken


device_bearer = HTTPBearer(
    scheme_name="BearerToken",
    description="Device token (phone) or viewer token (dashboard).",
    auto_error=False,
)


def invalid_token() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def forbidden() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail="Not allowed",
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
    """Device-token-only dependency for write routes. Viewer tokens get 403."""
    digest = hash_token(token)
    device = db.scalar(select(Device).where(Device.device_token_hash == digest))
    if device is not None:
        return device
    viewer = db.get(ViewerToken, digest)
    if viewer is not None:
        raise forbidden()
    raise invalid_token()


def current_phone_any_token(
    token: Annotated[str, Depends(require_device_token)],
    db: Annotated[Session, Depends(get_db)],
) -> Device:
    """Accept either a device token or a read-only viewer token for GET routes."""
    digest = hash_token(token)
    device = db.scalar(select(Device).where(Device.device_token_hash == digest))
    if device is not None:
        return device
    viewer = db.get(ViewerToken, digest)
    if viewer is not None:
        device = db.get(Device, viewer.device_id)
        if device is not None:
            viewer.last_used_at = datetime.now(timezone.utc)
            db.commit()
            return device
    raise invalid_token()
