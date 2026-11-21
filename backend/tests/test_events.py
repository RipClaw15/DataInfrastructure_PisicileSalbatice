import json
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from backend.app.models import Event

SAMPLES = Path(__file__).resolve().parents[2] / "contracts/backend"


def test_round_trip(client, payload):
    assert client.get("/api/events").json() == {"events": []}
    response = client.post("/api/events", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert set(created) == {"id", "device_id", "received_at", "stored"}
    assert created["stored"] is False
    assert created["id"] == 0
    assert created["received_at"].endswith("Z")
    assert client.get("/api/events").json() == {"events": []}
    event = client.get(f"/api/devices/{payload['device_id']}/live").json()
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
    for device_id, timestamp in [("newer-phone", "2026-11-20T21:00:00+02:00"),
                                 ("older-phone", "2026-11-20T18:00:00Z")]:
        assert client.post(f"/api/devices/{device_id}/arm", json={
            "timestamp": timestamp, "axes": payload["axes"],
        }).status_code == 200
    events = client.get("/api/events?limit=1").json()["events"]
    assert len(events) == 1
    assert events[0]["timestamp"] == "2026-11-20T19:00:00Z"


def test_preserves_reported_magnitude(client, payload):
    client.post(f"/api/devices/{payload['device_id']}/arm", json={
        "timestamp": "2026-11-20T18:00:00Z", "axes": {"x": 0, "y": 0, "z": -1},
    })
    payload["value"] = 99
    assert client.post("/api/events", json=payload).status_code == 201
    assert client.get("/api/events").json()["events"][0]["value"] == 99


def test_existing_history_remains_readable(client, engine):
    samples = json.loads((SAMPLES / "events.json").read_text())["events"]
    # Existing, pre-retention history must keep its response shape and ordering.
    with Session(engine) as db:
        for event in reversed(samples):
            db.add(Event(
                device_id=event["device_id"], event_type=event["event_type"], value=event["value"], unit=event["unit"],
                **event["axes"], timestamp=datetime.fromisoformat(event["timestamp"]),
                received_at=datetime.fromisoformat(event["received_at"]),
            ))
        db.commit()
    actual = client.get("/api/events").json()["events"]
    strip = lambda e: {k: v for k, v in e.items() if k not in {"id", "received_at"}}
    assert [strip(e) for e in actual] == [strip(e) for e in samples]


@pytest.mark.parametrize("origin", [
    "https://porsche.csongorosz.com", "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8000", "http://127.0.0.1:8000",
    "https://another-development-dashboard.example",
])
def test_cors(client, origin):
    response = client.options("/api/events", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    # Browsers also need the header on the actual response, not just preflight.
    actual = client.get("/api/events", headers={"Origin": origin})
    assert actual.status_code == 200
    assert actual.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in actual.headers
