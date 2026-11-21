import json
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from backend.app.models import Event

SAMPLES = Path(__file__).resolve().parents[2] / "contracts/backend"


def test_round_trip(client, auth_headers, payload):
    assert client.get("/api/me/events", headers=auth_headers).json() == {"events": []}
    response = client.post("/api/me/events", json=payload, headers=auth_headers)
    assert response.status_code == 201
    created = response.json()
    assert set(created) == {"id", "device_id", "received_at", "stored"}
    assert created["stored"] is False
    assert created["id"] == 0
    assert created["received_at"].endswith("Z")
    assert client.get("/api/me/events", headers=auth_headers).json() == {"events": []}
    event = client.get("/api/me/live", headers=auth_headers).json()
    assert event["axes"] == payload["axes"]
    assert event["timestamp"] == payload["timestamp"]


@pytest.mark.parametrize("field,value", [
    ("device_id", "INVALID"), ("device_id", "ab"),
    ("event_type", "other"), ("unit", "m/s2"),
    ("value", -1), ("value", True), ("value", "1.0"),
    ("timestamp", "2026-11-20T18:57:59"), ("timestamp", 123),
    ("axes", {"x": 0, "y": 0}),
    ("axes", {"x": "0", "y": 0, "z": 1}),
])
def test_invalid_values(client, auth_headers, payload, field, value):
    payload[field] = value
    assert client.post("/api/me/events", json=payload, headers=auth_headers).status_code == 422
    assert client.get("/api/me/events", headers=auth_headers).json() == {"events": []}


@pytest.mark.parametrize("field", ["device_id", "event_type", "unit", "value", "timestamp", "axes"])
def test_required_fields(client, auth_headers, payload, field):
    del payload[field]
    assert client.post("/api/me/events", json=payload, headers=auth_headers).status_code == 422


@pytest.mark.parametrize("limit", [0, 501, -1, "abc"])
def test_invalid_limits(client, auth_headers, limit):
    assert client.get(f"/api/me/events?limit={limit}", headers=auth_headers).status_code == 422


def test_order_limit_and_utc(client, auth_headers, payload):
    assert client.post("/api/me/arm", json={
        "timestamp": "2026-11-20T18:00:00Z", "axes": {"x": 0, "y": 0, "z": -1},
    }, headers=auth_headers).status_code == 200
    payload.update(timestamp="2026-11-20T21:00:00+02:00", axes={"x": 0, "y": 1, "z": 0})
    assert client.post("/api/me/events", json=payload, headers=auth_headers).status_code == 201
    events = client.get("/api/me/events?limit=1", headers=auth_headers).json()["events"]
    assert len(events) == 1
    assert events[0]["timestamp"] == "2026-11-20T19:00:00Z"


def test_preserves_reported_magnitude(client, auth_headers, payload):
    client.post("/api/me/arm", json={
        "timestamp": "2026-11-20T18:00:00Z", "axes": {"x": 0, "y": 0, "z": -1},
    }, headers=auth_headers)
    payload["value"] = 99
    assert client.post("/api/me/events", json=payload, headers=auth_headers).status_code == 201
    assert client.get("/api/me/events", headers=auth_headers).json()["events"][0]["value"] == 99


def test_existing_history_remains_readable(client, auth_headers, engine):
    samples = json.loads((SAMPLES / "events.json").read_text())["events"]
    
    with Session(engine) as db:
        for event in reversed(samples):
            db.add(Event(
                device_id=event["device_id"], event_type=event["event_type"], value=event["value"], unit=event["unit"],
                **event["axes"], timestamp=datetime.fromisoformat(event["timestamp"]),
                received_at=datetime.fromisoformat(event["received_at"]),
            ))
        db.commit()
    actual = client.get("/api/me/events", headers=auth_headers).json()["events"]
    strip = lambda e: {k: v for k, v in e.items() if k not in {"id", "received_at"}}
    assert [strip(e) for e in actual] == [strip(e) for e in samples]


@pytest.mark.parametrize("origin", [
    "https://porsche.csongorosz.com", "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8000", "http://127.0.0.1:8000",
    "https://another-development-dashboard.example",
])
def test_cors(client, auth_headers, origin):
    response = client.options("/api/me/events", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    # Browsers also need the header on the actual response, not just preflight.
    actual = client.get("/api/me/events", headers={**auth_headers, "Origin": origin})
    assert actual.status_code == 200
    assert actual.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in actual.headers
