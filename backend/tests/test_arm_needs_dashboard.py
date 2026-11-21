from backend.app.config import settings

ARM = {"timestamp": "2026-11-21T10:00:00Z", "axes": {"x": 0, "y": 0, "z": -1}}


def register(client, device_id="phone-aaaa1111"):
    res = client.post("/api/register", json={"device_id": device_id})
    return {"Authorization": f"Bearer {res.json()['device_token']}"}


def pair(client, headers):
    code = client.post("/api/me/pairing-code", headers=headers).json()["code"]
    return {"Authorization": f"Bearer {client.post('/api/pair', json={'code': code}).json()['viewer_token']}"}


def test_arm_needs_a_paired_dashboard(client):
    settings.require_dashboard_to_arm = True
    phone = register(client)
    assert client.get("/api/me", headers=phone).json()["paired_dashboards"] == 0

    refused = client.post("/api/me/arm", json=ARM, headers=phone)
    assert refused.status_code == 409
    assert "Pair a dashboard first" in refused.json()["detail"]
    assert client.get("/api/me/status", headers=phone).json()["state"] == "DISARMED"

    viewer = pair(client, phone)
    assert client.get("/api/me", headers=phone).json()["paired_dashboards"] == 1
    assert client.get("/api/me", headers=viewer).json()["paired_dashboards"] == 1
    assert client.post("/api/me/arm", json=ARM, headers=phone).status_code == 200


def test_another_phones_dashboard_does_not_count(client):
    settings.require_dashboard_to_arm = True
    a, b = register(client, "phone-aaaa1111"), register(client, "phone-bbbb2222")
    pair(client, b)
    assert client.get("/api/me", headers=a).json()["paired_dashboards"] == 0
    assert client.post("/api/me/arm", json=ARM, headers=a).status_code == 409


def test_renaming_reports_the_count_too(client):
    phone = register(client)
    pair(client, phone)
    assert client.patch("/api/me", json={"device_name": "Kitchen"}, headers=phone).json()["paired_dashboards"] == 1


def test_one_dashboard_per_phone_a_new_pairing_replaces_the_old(client):
    phone = register(client)
    first = pair(client, phone)
    paired_at = client.get("/api/me", headers=phone).json()["dashboard_paired_at"]
    assert paired_at is not None

    second = pair(client, phone)
    me = client.get("/api/me", headers=phone).json()
    assert me["paired_dashboards"] == 1
    assert me["dashboard_paired_at"] != paired_at
    assert client.get("/api/me/status", headers=first).status_code == 401
    assert client.get("/api/me/status", headers=second).status_code == 200


def test_a_new_code_for_the_same_phone_shows_the_same_data(client):
    phone = register(client)
    first = pair(client, phone)
    assert client.post("/api/me/arm", json=ARM, headers=phone).status_code == 200
    picked_up = {"device_id": "phone-aaaa1111", "event_type": "accelerometer", "value": 1.0, "unit": "g",
                 "timestamp": "2026-11-21T10:00:05Z", "axes": {"x": 0, "y": 1, "z": 0}}
    assert client.post("/api/me/events", json=picked_up, headers=phone).status_code == 201
    before = {path: client.get(f"/api/me/{path}", headers=first).json() for path in ("status", "alerts", "events")}

    # Refresh, new code, same phone: a new key, the same data.
    second = pair(client, phone)
    after = {path: client.get(f"/api/me/{path}", headers=second).json() for path in ("status", "alerts", "events")}
    # Pairing marks the phone as just seen (so the dashboard shows it connected); everything else is the same.
    for snapshot in (before, after):
        snapshot["status"].pop("last_seen")
    assert after == before
    assert after["status"]["state"] == "ALERT"
