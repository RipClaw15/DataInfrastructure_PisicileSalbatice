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
