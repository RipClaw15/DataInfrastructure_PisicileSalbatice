import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.live import live_telemetry
from backend.app.main import app
from backend.app.models import (  # noqa: F401
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
from backend.app.config import settings
from backend.app.rate_limit import pair_rate_limiter

SAMPLES = Path(__file__).resolve().parents[2] / "contracts/backend"


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(engine):
    live_telemetry.clear()
    pair_rate_limiter.reset()
    # Most tests are about detection, not pairing, so they arm without a dashboard; test_arm_needs_dashboard turns it on.
    require_dashboard = settings.require_dashboard_to_arm
    settings.require_dashboard_to_arm = False

    def database():
        with Session(engine) as session:
            yield session

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = database
    
    client = TestClient(app)
    try:
        yield client
    finally:
        client.close()
        live_telemetry.clear()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        pair_rate_limiter.reset()
        settings.require_dashboard_to_arm = require_dashboard


@pytest.fixture
def auth_headers(client):
    """Register demo-phone-01 and return its Bearer Authorization header dict."""
    res = client.post("/api/register", json={"device_id": "demo-phone-01", "device_name": "Demo Phone"})
    assert res.status_code == 201, res.text
    token = res.json()["device_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def payload():
    return json.loads((SAMPLES / "post_event_request.json").read_text())
