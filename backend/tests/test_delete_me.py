from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.live import live_telemetry
from backend.app.models import (
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

LOCATION = {"lat": 46.7712, "lon": 23.6236, "accuracy_m": 15}


def register(client, device_id):
    res = client.post("/api/register", json={"device_id": device_id})
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['device_token']}"}


def reading(device_id, axes, timestamp, location=None):
    body = {"device_id": device_id, "event_type": "accelerometer", "value": 1.0, "unit": "g",
            "timestamp": timestamp, "axes": dict(zip("xyz", axes))}
    return {**body, "location": location} if location else body


def fill(client, device_id):
    """Arm with a location, get picked up, report a GPS fix, pair a dashboard and leave an unused code."""
    headers = register(client, device_id)
    arm = {"timestamp": "2026-11-21T10:00:00Z", "axes": {"x": 0, "y": 0, "z": -1}, "location": LOCATION}
    assert client.post("/api/me/arm", json=arm, headers=headers).status_code == 200
    for body in (
        reading(device_id, (0, 1, 0), "2026-11-21T10:00:05Z", LOCATION),
        reading(device_id, (0, 1, 0), "2026-11-21T10:00:06Z", {**LOCATION, "lat": 46.78}),
    ):
        assert client.post("/api/me/events", json=body, headers=headers).status_code == 201
    code = client.post("/api/me/pairing-code", headers=headers).json()["code"]
    viewer = {"Authorization": f"Bearer {client.post('/api/pair', json={'code': code}).json()['viewer_token']}"}
    assert client.post("/api/me/pairing-code", headers=headers).status_code == 201
    return headers, viewer


def rows(engine, device_id):
    """How many rows of each table still belong to this phone."""
    with Session(engine) as db:
        events = select(Event.id).where(Event.device_id == device_id)
        sessions = select(ArmSession.id).where(ArmSession.device_id == device_id)
        count = lambda query: db.scalar(select(func.count()).select_from(query.subquery()))
        return {
            "devices": count(select(Device).where(Device.device_id == device_id)),
            "events": count(select(Event).where(Event.device_id == device_id)),
            "event_locations": count(select(EventLocation).where(EventLocation.event_id.in_(events))),
            "event_snapshots": count(select(EventSnapshot).where(EventSnapshot.session_id.in_(sessions))),
            "arm_sessions": count(select(ArmSession).where(ArmSession.device_id == device_id)),
            "session_locations": count(select(SessionLocation).where(SessionLocation.session_id.in_(sessions))),
            "alerts": count(select(Alert).where(Alert.device_id == device_id)),
            "pairing_codes": count(select(PairingCode).where(PairingCode.device_id == device_id)),
            "viewer_tokens": count(select(ViewerToken).where(ViewerToken.device_id == device_id)),
        }


def test_delete_removes_everything_about_the_phone_and_nothing_else(client, engine):
    a, a_viewer = fill(client, "phone-aaaa1111")
    b, b_viewer = fill(client, "phone-bbbb2222")
    before_b = rows(engine, "phone-bbbb2222")
    assert all(before_b.values()), before_b  # the fixture really creates every kind of row

    assert client.delete("/api/me", headers=a).status_code == 204

    assert set(rows(engine, "phone-aaaa1111").values()) == {0}
    assert live_telemetry.get("phone-aaaa1111") is None
    # Neither the phone's token nor its dashboard's token works any more.
    assert client.get("/api/me/status", headers=a).status_code == 401
    assert client.get("/api/me/status", headers=a_viewer).status_code == 401
    # The other phone is untouched.
    assert rows(engine, "phone-bbbb2222") == before_b
    assert client.get("/api/me/status", headers=b_viewer).json()["state"] == "ALERT"
    # The ID is free again: the app can start over as a new phone.
    assert client.post("/api/register", json={"device_id": "phone-aaaa1111"}).status_code == 201


def test_only_the_phone_can_delete(client, engine):
    a, a_viewer = fill(client, "phone-aaaa1111")
    assert client.delete("/api/me", headers=a_viewer).status_code == 403
    assert client.delete("/api/me").status_code == 401
    assert client.delete("/api/me", headers={"Authorization": "Bearer made-up"}).status_code == 401
    assert rows(engine, "phone-aaaa1111")["devices"] == 1
