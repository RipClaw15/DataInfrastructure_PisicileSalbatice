import secrets
from datetime import timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import current_device, generate_token, hash_token
from ..config import settings
from ..db import get_db
from ..guard import utc_now
from ..models import Device, PairingCode, ViewerToken
from ..rate_limit import pair_rate_limiter
from ..schemas import PairingCodeResponse, PairRequest, PairResponse

router = APIRouter(prefix="/api", tags=["pairing"])
Database = Annotated[Session, Depends(get_db)]


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _generate_unique_code(db: Session) -> str:
    for _ in range(20):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if db.get(PairingCode, code) is None:
            return code
    raise HTTPException(status_code=503, detail="Could not allocate pairing code")


@router.post("/me/pairing-code", status_code=201, response_model=PairingCodeResponse)
def create_pairing_code(
    device: Annotated[Device, Depends(current_device)],
    db: Database,
) -> PairingCodeResponse:
    now = utc_now()
    # Issuing a new code replaces any unused codes for this phone and clears expired ones.
    db.execute(
        delete(PairingCode).where(
            (PairingCode.device_id == device.device_id) & (PairingCode.used_at.is_(None))
        )
    )
    db.execute(delete(PairingCode).where(PairingCode.expires_at <= now))
    db.flush()

    code = _generate_unique_code(db)
    expires_at = now + timedelta(minutes=settings.pairing_code_ttl_minutes)
    device.last_seen = now
    db.add(PairingCode(code=code, device_id=device.device_id, expires_at=expires_at))
    db.commit()
    return PairingCodeResponse(code=code, expires_at=expires_at)


@router.post("/pair", status_code=200, response_model=PairResponse)
def pair_dashboard(
    payload: PairRequest,
    request: Request,
    db: Database,
) -> PairResponse:
    ip = _client_ip(request)
    pair_rate_limiter.check(ip)

    now = utc_now()
    entry = db.scalar(select(PairingCode).where(PairingCode.code == payload.code.strip()))
    if entry is None or entry.used_at is not None:
        pair_rate_limiter.record_failure(ip)
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    expires_at = entry.expires_at.replace(tzinfo=entry.expires_at.tzinfo or timezone.utc)
    if expires_at <= now:
        pair_rate_limiter.record_failure(ip)
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    entry.used_at = now
    device = db.get(Device, entry.device_id)
    if device is not None:
        device.last_seen = now
    viewer_token = generate_token()
    db.add(ViewerToken(token_hash=hash_token(viewer_token), device_id=entry.device_id))
    db.commit()
    return PairResponse(device_id=entry.device_id, viewer_token=viewer_token)
