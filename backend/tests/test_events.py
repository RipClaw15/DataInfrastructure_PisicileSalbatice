import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.db import get_db
from backend.app.main import app
from backend.app.models import Event

SAMPLES = Path(__file__).resolve().parents[2] / "contracts/backend"


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Event.__table__.create(engine)

    def database():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = database
    # No lifespan: tests create their own table and never touch the configured DB.
    client = TestClient(app)
    yield client
    client.close()
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def payload():
    return json.loads((SAMPLES / "post_event_request.json").read_text())


def test_round_trip(client, payload):
    assert client.get("/api/events").json() == {"events": []}
    response = client.post("/api/events", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert set(created) == {"id", "device_id", "received_at"}
    assert created["received_at"].endswith("Z")
    event = client.get("/api/events").json()["events"][0]
    assert event == {**payload, **created}


@pytest.mark.parametrize("field,value", [
    ("device_id", "INVALID"), ("device_id", "ab"),
    ("event_type", "other"), ("unit", "m/s2"),
    ("value", -1), ("value", True), ("value", "1.0"),
    ("timestamp", "2026-11-20T18:57:59"), ("timestamp", 123),
    ("axes", {"x": 0, "y": 0}),
    ("axes", {"x": "0", "y": 0, "z": 1}),
])
def test_invalid_values(client, payload, field, value):
    payload[field] = value
    assert client.post("/api/events", json=payload).status_code == 422
    assert client.get("/api/events").json() == {"events": []}


@pytest.mark.parametrize("field", ["device_id", "event_type", "unit", "value", "timestamp", "axes"])
def test_required_fields(client, payload, field):
    del payload[field]
    assert client.post("/api/events", json=payload).status_code == 422


@pytest.mark.parametrize("limit", [0, 501, -1, "abc"])
def test_invalid_limits(client, limit):
    assert client.get(f"/api/events?limit={limit}").status_code == 422


def test_order_limit_and_utc(client, payload):
    payload["timestamp"] = "2026-11-20T21:00:00+02:00"
    assert client.post("/api/events", json=payload).status_code == 201
    payload["timestamp"] = "2026-11-20T18:00:00Z"
    client.post("/api/events", json=payload)
    events = client.get("/api/events?limit=1").json()["events"]
    assert len(events) == 1
    assert events[0]["timestamp"] == "2026-11-20T19:00:00Z"


def test_preserves_reported_magnitude(client, payload):
    payload["value"] = 99
    assert client.post("/api/events", json=payload).status_code == 201
    assert client.get("/api/events").json()["events"][0]["value"] == 99


def test_samples(client):
    samples = json.loads((SAMPLES / "events.json").read_text())["events"]
    # Replay oldest first; the samples use descending IDs to break equal timestamps.
    for event in reversed(samples):
        body = {k: v for k, v in event.items() if k not in {"id", "received_at"}}
        assert client.post("/api/events", json=body).status_code == 201
    actual = client.get("/api/events").json()["events"]
    strip = lambda e: {k: v for k, v in e.items() if k not in {"id", "received_at"}}
    assert [strip(e) for e in actual] == [strip(e) for e in samples]


def test_cors(client):
    response = client.options("/api/events", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
