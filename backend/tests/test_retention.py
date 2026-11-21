import importlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.live import LiveTelemetry, live_telemetry
from backend.app.models import Alert, ArmSession, Event, EventLocation, EventSnapshot
from backend.app.schemas import EventResponse

BASE = "/api/devices/demo-phone-01"
REST = {"x": 0, "y": 0, "z": -1}
MOVED = {"x": 0, "y": 1, "z": 0}
FIX = {"lat": 46.77, "lon": 23.59, "accuracy_m": 5}


def count(engine, model):
    with Session(engine) as db:
        return db.scalar(select(func.count()).select_from(model))


def arm(client):
    assert client.post(f"{BASE}/arm", json={
        "timestamp": "2026-11-21T11:00:00Z", "axes": REST,
    }).status_code == 200


def test_routine_samples_never_create_history(client, engine, payload):
    for _ in range(10):
        response = client.post("/api/events", json=payload)
        assert response.status_code == 201
        assert response.json()["stored"] is False
        assert response.json()["id"] == 0
    assert count(engine, Event) == 0
    assert count(engine, EventLocation) == 0
    assert count(engine, EventSnapshot) == 0
    assert client.get(f"{BASE}/status").json()["online"] is True
    assert client.get(f"{BASE}/live").json()["axes"] == payload["axes"]


def test_only_transitions_are_retained_without_gps(client, engine, payload):
    arm(client)
    payload.update(axes=REST, timestamp="2026-11-21T11:00:01Z")
    for _ in range(100):
        assert client.post("/api/events", json=payload).json()["stored"] is False
    assert count(engine, Event) == 1
    payload.update(axes=MOVED, timestamp="2026-11-21T11:00:02Z")
    triggered = client.post("/api/events", json=payload).json()
    assert triggered["stored"] is True
    assert triggered["id"] > 0
    for _ in range(100):
        assert client.post("/api/events", json=payload).json()["stored"] is False
    assert count(engine, Event) == 2
    assert count(engine, Alert) == 1
    assert client.post(f"{BASE}/disarm").json()["state"] == "DISARMED"
    assert count(engine, Event) == 3
    client.post(f"{BASE}/disarm")
    assert count(engine, Event) == 3
    with Session(engine) as db:
        reasons = db.scalars(select(EventSnapshot.reason).order_by(EventSnapshot.event_id)).all()
        assert reasons == ["armed", "picked_up", "disarmed"]


def test_rearm_records_both_session_boundaries(client, engine):
    arm(client)
    arm(client)
    assert count(engine, ArmSession) == 2
    with Session(engine) as db:
        reasons = db.scalars(select(EventSnapshot.reason).order_by(EventSnapshot.event_id)).all()
        assert reasons == ["armed", "disarmed", "armed"]


@pytest.fixture
def clock(monkeypatch):
    current = [datetime(2026, 11, 21, 11, 0, 1, tzinfo=timezone.utc)]
    routes = importlib.import_module("backend.app.routes.events")
    monkeypatch.setattr(routes, "utc_now", lambda: current[0])
    return current


def gps_send(client, payload, clock, location, axes=MOVED, timestamp=None):
    body = {**payload, "axes": axes, "timestamp": timestamp or clock[0].isoformat()}
    if location is not None:
        body["location"] = location
    response = client.post("/api/events", json=body)
    assert response.status_code == 201
    return response.json()


def test_gps_trail_requires_elapsed_time_and_distance(client, engine, payload, clock):
    arm(client)
    assert gps_send(client, payload, clock, FIX)["stored"] is True  # alert
    clock[0] += timedelta(seconds=1)
    far = {**FIX, "lat": 46.78}
    assert gps_send(client, payload, clock, far)["stored"] is False
    assert client.get(f"{BASE}/status").json()["last_location"] == far  # live, unsaved
    clock[0] += timedelta(seconds=29)
    assert gps_send(client, payload, clock, far)["stored"] is True
    assert count(engine, Event) == 3  # arm, alert, one GPS update
    clock[0] += timedelta(seconds=31)
    assert gps_send(client, payload, clock, far)["stored"] is False  # stationary
    noisy = {**far, "lat": 46.78001}
    assert gps_send(client, payload, clock, noisy)["stored"] is False
    inaccurate = {**far, "lat": 46.781, "accuracy_m": 500}
    assert gps_send(client, payload, clock, inaccurate)["stored"] is False
    assert count(engine, Event) == 3
    with Session(engine) as db:
        assert db.scalars(select(EventSnapshot.reason).order_by(EventSnapshot.event_id)).all() == [
            "armed", "picked_up", "gps_update",
        ]


def test_first_post_alert_fix_is_saved_and_old_fixes_are_skipped(client, engine, payload, clock):
    arm(client)
    assert gps_send(client, payload, clock, None)["stored"] is True
    clock[0] += timedelta(seconds=1)
    assert gps_send(client, payload, clock, FIX)["stored"] is True
    clock[0] += timedelta(seconds=40)
    older = {**FIX, "lat": 46.80}
    assert gps_send(client, payload, clock, older, timestamp="2026-11-21T10:59:00Z")["stored"] is False
    assert count(engine, Event) == 3


def test_no_gps_history_while_guarding(client, engine, payload, clock):
    arm(client)
    for index in range(10):
        clock[0] += timedelta(seconds=40)
        assert gps_send(client, payload, clock, {**FIX, "lat": 46.77 + index / 100}, axes=REST)["stored"] is False
    assert count(engine, Event) == 1
    assert count(engine, EventLocation) == 0


def test_gps_limits_reset_for_a_new_session(client, engine, payload, clock):
    arm(client)
    assert gps_send(client, payload, clock, FIX)["stored"] is True
    arm(client)
    clock[0] += timedelta(seconds=1)
    assert gps_send(client, payload, clock, FIX)["stored"] is True
    assert count(engine, Alert) == 2


def test_live_cache_can_clear_without_losing_saved_history(client, engine, payload):
    arm(client)
    payload.update(axes=MOVED, timestamp="2026-11-21T11:00:02Z", location=FIX)
    assert client.post("/api/events", json=payload).json()["stored"] is True
    saved = client.get("/api/events").json()
    live_telemetry.clear()
    assert client.get(f"{BASE}/live").json() is None
    assert client.get(f"{BASE}/status").json()["state"] == "ALERT"
    assert client.get(f"{BASE}/status").json()["last_location"] == FIX
    assert client.get("/api/events").json() == saved
    assert count(engine, Event) == 2


def test_failed_transaction_does_not_publish_live_data(client, engine, payload, monkeypatch):
    arm(client)
    payload["axes"] = MOVED

    def fail_commit(self):
        raise RuntimeError("simulated database failure")

    with monkeypatch.context() as context:
        context.setattr(Session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="simulated database failure"):
            client.post("/api/events", json=payload)
    assert live_telemetry.get(payload["device_id"]) is None
    assert count(engine, Alert) == 0
    assert count(engine, Event) == 1


def test_cache_has_capacity_and_expiry_limits(payload, monkeypatch):
    current = [0.0]
    monkeypatch.setattr("backend.app.live.monotonic", lambda: current[0])
    cache = LiveTelemetry(capacity=2, ttl_seconds=60)
    for device in ("first-phone", "second-phone", "third-phone"):
        cache.put(EventResponse(**{**payload, "device_id": device}, id=0,
                                received_at=datetime.now(timezone.utc)))
    assert cache.get("first-phone") is None
    assert cache.get("second-phone") is not None
    current[0] = 61
    assert cache.get("second-phone") is None
    assert cache.get("third-phone") is None
