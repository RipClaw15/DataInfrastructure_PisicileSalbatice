import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.main import app
from backend.app.models import Alert, ArmSession, Event, EventLocation, EventSnapshot, SessionLocation
from backend.app.live import live_telemetry

SAMPLES = Path(__file__).resolve().parents[2] / "contracts/backend"


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[Event.__table__, ArmSession.__table__, Alert.__table__,
                                            EventLocation.__table__, SessionLocation.__table__, EventSnapshot.__table__])
    yield engine
    engine.dispose()


@pytest.fixture
def client(engine):
    live_telemetry.clear()
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


@pytest.fixture
def payload():
    return json.loads((SAMPLES / "post_event_request.json").read_text())
