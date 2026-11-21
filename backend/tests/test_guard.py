import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.app.models import ArmSession
from backend.app.live import live_telemetry

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "contracts/backend"
DEVICE = "demo-phone-01"
BASE = f"/api/devices/{DEVICE}"


def sample(name):
    return json.loads((SAMPLES / name).read_text())


def reading(axes, timestamp="2026-11-20T19:10:12Z", value=0.973, device_id=DEVICE):
    return {
        "device_id": device_id, "event_type": "accelerometer", "unit": "g",
        "timestamp": timestamp, "value": value,
        "axes": dict(zip("xyz", axes)),
    }


def send(client, *args, **kwargs):
    response = client.post("/api/events", json=reading(*args, **kwargs))
    assert response.status_code == 201, response.text
    return response.json()


def test_demo_session_matches_contract(client):
    armed = client.post(f"{BASE}/arm", json=sample("arm_request.json"))
    assert armed.status_code == 200
    assert armed.json()["state"] == "GUARDING"
    assert armed.json()["last_seen"] is None
    assert armed.json()["online"] is False
    send(client, (0.025, -0.028, -0.980), "2026-11-20T19:10:05Z", 0.980)
    assert client.get(f"{BASE}/status").json() == sample("status_guarding.json")
    send(client, (0.020, -0.628, -0.744))
    send(client, (-3.193, -1.261, -0.596), "2026-11-20T19:10:20Z", 3.484)
    send(client, (-0.169, 0.087, 0.963), "2026-11-20T19:10:30Z", 0.982)
    assert client.get(f"{BASE}/status").json() == sample("status_alert.json")
    assert client.get(f"{BASE}/alerts").json() == sample("alerts.json")
    assert client.post(f"{BASE}/disarm").json() == sample("status_disarmed.json")
    assert client.post(f"{BASE}/disarm").json() == sample("status_disarmed.json")
    
    assert client.get(f"{BASE}/alerts").json() == sample("alerts.json")


def test_recorded_phone_session(client):
    session = json.loads((ROOT / "mobile/dev-server/captured-guard-session.json").read_text())
    base = f"/api/devices/{session['device_id']}"
    assert client.post(f"{base}/arm", json=session["arm_request"]).status_code == 200
    for event in session["events"]:
        assert client.post("/api/events", json=event).status_code == 201
        state = "GUARDING" if event["id"] <= 11 else "ALERT"
        assert client.get(f"{base}/status").json()["state"] == state
    alerts = client.get(f"{base}/alerts").json()["alerts"]
    assert [{k: v for k, v in a.items() if k != "id"} for a in alerts] == session["expected"]["alerts"]


def test_disarmed_readings_do_not_alert(client):
    send(client, (0, 1, 0))
    assert client.get(f"{BASE}/status").json()["state"] == "DISARMED"
    assert client.get(f"{BASE}/alerts").json()["alerts"] == []


def test_rearm_closes_old_session_and_retains_history(client, engine):
    arm = sample("arm_request.json")
    client.post(f"{BASE}/arm", json=arm)
    send(client, (0, 1, 0))
    first = client.get(f"{BASE}/alerts").json()["alerts"][0]
    result = client.post(f"{BASE}/arm", json=arm).json()
    assert result["state"] == "GUARDING"
    assert result["last_alert"] is None
    with Session(engine) as db:
        sessions = db.scalars(select(ArmSession).order_by(ArmSession.id)).all()
        assert len(sessions) == 2
        assert sessions[0].disarmed_at is not None
        assert sessions[1].disarmed_at is None
    send(client, (0, 1, 0), "2026-11-20T19:11:00Z")
    history = client.get(f"{BASE}/alerts").json()["alerts"]
    assert len(history) == 2
    assert history[1] == first
    assert client.get(f"{BASE}/alerts?limit=1").json()["alerts"] == history[:1]


def test_rearm_while_guarding(client, engine):
    client.post(f"{BASE}/arm", json=sample("arm_request.json"))
    result = client.post(f"{BASE}/arm", json={
        "timestamp": "2026-11-20T21:11:00+02:00", "axes": {"x": 0, "y": 1, "z": 0},
    })
    assert result.status_code == 200
    assert result.json()["armed_at"] == "2026-11-20T19:11:00Z"
    send(client, (0, 1, 0))
    assert client.get(f"{BASE}/status").json()["state"] == "GUARDING"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(ArmSession)) == 2


def test_devices_are_independent(client):
    client.post(f"{BASE}/arm", json=sample("arm_request.json"))
    send(client, (0, 1, 0), device_id="other-phone")
    assert client.get(f"{BASE}/status").json()["state"] == "GUARDING"
    assert client.get("/api/devices/other-phone/status").json()["state"] == "DISARMED"
    assert client.get(f"{BASE}/alerts").json()["alerts"] == []


def test_table_readings_do_not_alert(client):
    client.post(f"{BASE}/arm", json=sample("arm_request.json"))
    table_readings = [e for e in sample("events.json")["events"] if 186 <= e["id"] <= 189]
    assert len(table_readings) == 4
    for event in table_readings:
        assert client.post("/api/events", json=event).status_code == 201
    assert client.get(f"{BASE}/status").json()["state"] == "GUARDING"
    assert client.get(f"{BASE}/alerts").json()["alerts"] == []


def test_online_uses_arrival_and_last_seen_uses_newest_timestamp(client, monkeypatch):
    send(client, (0, 0, -1), "2026-11-20T19:10:30Z")
    send(client, (0, 0, -1), "2026-11-20T19:00:00Z")
    status = client.get(f"{BASE}/status").json()
    assert status["last_seen"] == "2026-11-20T19:10:30Z"
    assert status["online"] is True
    monkeypatch.setattr("backend.app.guard.utc_now", lambda: datetime.now(timezone.utc) + timedelta(minutes=6))
    assert client.get(f"{BASE}/status").json()["online"] is False


@pytest.mark.parametrize("endpoint", ["status", "alerts"])
def test_unknown_device(client, endpoint):
    result = client.get(f"{BASE}/{endpoint}")
    assert result.status_code == 404
    assert result.json() == {"detail": "Device not found"}


def test_disarm_unknown_is_idempotent(client):
    response = client.post(f"{BASE}/disarm")
    assert response.status_code == 200
    assert response.json()["state"] == "DISARMED"
    assert response.json()["last_seen"] is None
    assert client.get(f"{BASE}/status").status_code == 404


@pytest.mark.parametrize("body", [
    {}, {"timestamp": "2026-11-20T19:10:00Z"},
    {"timestamp": "2026-11-20T19:10:00", "axes": {"x": 0, "y": 0, "z": -1}},
    {"timestamp": 123, "axes": {"x": 0, "y": 0, "z": -1}},
    {"timestamp": "1795258800", "axes": {"x": 0, "y": 0, "z": -1}},
    {"timestamp": "2026-11-20T19:10:00Z", "axes": {"x": 0, "y": 0}},
    {"timestamp": "2026-11-20T19:10:00Z", "axes": {"x": True, "y": 0, "z": -1}},
])
def test_invalid_arm_requests(client, body):
    assert client.post(f"{BASE}/arm", json=body).status_code == 422
    assert client.get(f"{BASE}/status").status_code == 404


@pytest.mark.parametrize("suffix", ["/arm", "/disarm", "/status", "/alerts"])
def test_invalid_device_id(client, suffix):
    method = client.post if suffix in ("/arm", "/disarm") else client.get
    kwargs = {"json": sample("arm_request.json")} if suffix == "/arm" else {}
    assert method("/api/devices/INVALID" + suffix, **kwargs).status_code == 422


@pytest.mark.parametrize("limit", [0, 201, -1, "abc"])
def test_alert_limit_validation(client, limit):
    assert client.get(f"{BASE}/alerts?limit={limit}").status_code == 422


def test_new_client_reads_persisted_guard_state(client):
    client.post(f"{BASE}/arm", json=sample("arm_request.json"))
    send(client, (0, 1, 0))
    live_telemetry.clear()
    
    
    restarted = TestClient(app)
    try:
        assert restarted.get(f"{BASE}/status").json()["state"] == "ALERT"
        assert len(restarted.get(f"{BASE}/alerts").json()["alerts"]) == 1
    finally:
        restarted.close()
