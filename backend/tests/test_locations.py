import importlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.app.models import EventLocation, SessionLocation

BASE = "/api/devices/demo-phone-01"
ARM = {"timestamp": "2026-11-21T11:00:00Z", "axes": {"x": 0, "y": 0, "z": -1}}
REST = {"lat": 46.77, "lon": 23.59, "accuracy_m": 12}
MOVED = {"lat": 46.78, "lon": 23.60, "accuracy_m": None}


def test_startup_adds_gps_tables_without_losing_readings(client, engine, payload, monkeypatch):
    client.post(f"{BASE}/arm", json=ARM)
    created = client.get("/api/events").json()["events"][0]
    
    EventLocation.__table__.drop(engine)
    SessionLocation.__table__.drop(engine)
    main = importlib.import_module("backend.app.main")
    monkeypatch.setattr(main, "get_engine", lambda: engine)
    monkeypatch.setattr(main.settings, "database_url", "configured-for-test")
    
    with TestClient(app) as restarted:
        events = restarted.get("/api/events").json()["events"]
        assert events[0]["id"] == created["id"]
        response = restarted.post(f"{BASE}/arm", json={**ARM, "location": REST})
        assert response.status_code == 200
        assert response.json()["location"] == REST


def test_arm_location_persists_and_resets_on_rearm(client, engine):
    result = client.post(f"{BASE}/arm", json={**ARM, "location": REST})
    assert result.status_code == 200
    assert result.json()["location"] == REST
    assert client.get(f"{BASE}/status").json()["location"] == REST
    with Session(engine) as db:
        saved = db.scalar(select(SessionLocation))
        assert saved.lat == REST["lat"]
        assert saved.lon == REST["lon"]
        assert saved.accuracy_m == REST["accuracy_m"]
    assert "location" not in client.post(f"{BASE}/disarm").json()
    
    assert "location" not in client.post(f"{BASE}/arm", json=ARM).json()
    assert "location" not in client.get(f"{BASE}/status").json()


def test_reading_location_persists_and_updates_map_status(client, engine, payload):
    client.post(f"{BASE}/arm", json={**ARM, "location": REST})
    payload.update(timestamp="2026-11-21T11:00:01Z", axes={"x": 0, "y": 1, "z": 0}, location=MOVED)
    result = client.post("/api/events", json=payload)
    assert result.status_code == 201
    event = client.get("/api/events").json()["events"][0]
    assert event["location"] == MOVED
    status = client.get(f"{BASE}/status").json()
    assert status["state"] == "ALERT"
    assert status["location"] == REST
    assert status["last_location"] == MOVED
    with Session(engine) as db:
        saved = db.get(EventLocation, result.json()["id"])
        assert saved.lat == MOVED["lat"]
        assert saved.accuracy_m is None


def test_latest_gps_ignores_missing_and_out_of_order_fixes(client, payload):
    payload.update(timestamp="2026-11-21T11:05:00Z", location=MOVED)
    assert client.post("/api/events", json=payload).status_code == 201
    payload.update(timestamp="2026-11-21T11:00:00Z", location=REST)
    assert client.post("/api/events", json=payload).status_code == 201
    payload.update(timestamp="2026-11-21T11:06:00Z")
    del payload["location"]
    assert client.post("/api/events", json=payload).status_code == 201
    assert client.get(f"{BASE}/status").json()["last_location"] == MOVED
    assert client.get("/api/events").json()["events"] == []
    assert client.get(f"{BASE}/live").json()["location"] is None


def test_locations_are_scoped_to_the_phone(client, payload):
    payload["location"] = REST
    client.post("/api/events", json=payload)
    payload.update(device_id="another-phone", location=MOVED)
    client.post("/api/events", json=payload)
    assert client.get(f"{BASE}/status").json()["last_location"] == REST
    assert client.get("/api/devices/another-phone/status").json()["last_location"] == MOVED


def test_gps_optional_accuracy_and_zero_coordinates(client, payload):
    payload["location"] = {"lat": 0, "lon": 0}
    assert client.post("/api/events", json=payload).status_code == 201
    expected = {"lat": 0, "lon": 0, "accuracy_m": None}
    assert client.get(f"{BASE}/status").json()["last_location"] == expected
    payload["location"] = None
    assert client.post("/api/events", json=payload).status_code == 201


@pytest.mark.parametrize("location", [
    {"lat": 91, "lon": 0}, {"lat": -91, "lon": 0},
    {"lat": 0, "lon": 181}, {"lat": 0, "lon": -181},
    {"lat": 0, "lon": 0, "accuracy_m": -1},
    {"lat": True, "lon": 0}, {"lat": "46.77", "lon": 0},
    {"lon": 0}, {"lat": 0},
])
def test_invalid_coordinates_are_rejected(client, payload, location):
    payload["location"] = location
    assert client.post("/api/events", json=payload).status_code == 422
    assert client.post(f"{BASE}/arm", json={**ARM, "location": location}).status_code == 422
    assert client.get("/api/events").json() == {"events": []}
