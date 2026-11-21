from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.app.models import PairingCode


def test_missing_or_invalid_token_returns_401(client, payload):
    for method, path, body in [
        ("get", "/api/me", None),
        ("get", "/api/me/events", None),
        ("get", "/api/me/status", None),
        ("get", "/api/me/alerts", None),
        ("post", "/api/me/events", payload),
        ("post", "/api/me/arm", {"timestamp": "2026-11-20T19:10:00Z", "axes": {"x": 0, "y": 0, "z": -1}}),
        ("post", "/api/me/disarm", None),
        ("post", "/api/me/pairing-code", None),
    ]:
        kwargs = {"json": body} if body is not None else {}
        res = getattr(client, method)(path, **kwargs)
        assert res.status_code == 401
        assert res.json() == {"detail": "Invalid or missing token"}

        bad = getattr(client, method)(path, headers={"Authorization": "Bearer wrong-token"}, **kwargs)
        assert bad.status_code == 401
        assert bad.json() == {"detail": "Invalid or missing token"}


def test_pairing_lifecycle_and_viewer_permissions(client, auth_headers, payload):
    # 1. Phone generates a 6-digit pairing code
    code_res = client.post("/api/me/pairing-code", headers=auth_headers)
    assert code_res.status_code == 201
    code_body = code_res.json()
    code = code_body["code"]
    assert len(code) == 6 and code.isdigit()
    assert code_body["expires_at"].endswith("Z")

    # 2. Dashboard pairs with the code
    pair_res = client.post("/api/pair", json={"code": code})
    assert pair_res.status_code == 200
    pair_body = pair_res.json()
    assert pair_body["device_id"] == "demo-phone-01"
    viewer_headers = {"Authorization": f"Bearer {pair_body['viewer_token']}"}

    # 3. Code is single-use
    reuse = client.post("/api/pair", json={"code": code})
    assert reuse.status_code == 400
    assert reuse.json() == {"detail": "Invalid or expired code"}

    # 4. Phone arms and sends a reading; viewer can read stored snapshots + live reading via GET /api/me/*
    assert client.post("/api/me/arm", json={
        "timestamp": "2026-11-20T18:50:00Z", "axes": {"x": 0, "y": 0, "z": -1},
    }, headers=auth_headers).status_code == 200
    assert client.post("/api/me/events", json=payload, headers=auth_headers).status_code == 201
    assert client.get("/api/me", headers=viewer_headers).json()["device_id"] == "demo-phone-01"
    assert len(client.get("/api/me/events", headers=viewer_headers).json()["events"]) >= 1
    assert client.get("/api/me/live", headers=viewer_headers).json()["axes"] == payload["axes"]
    assert client.get("/api/me/status", headers=viewer_headers).json()["device_id"] == "demo-phone-01"
    assert client.get("/api/me/alerts", headers=viewer_headers).json()["device_id"] == "demo-phone-01"

    # 5. Viewer token is read-only -> 403 on all POST routes
    for path, body in [
        ("/api/me/events", payload),
        ("/api/me/arm", {"timestamp": "2026-11-20T19:10:00Z", "axes": {"x": 0, "y": 0, "z": -1}}),
        ("/api/me/disarm", None),
        ("/api/me/pairing-code", None),
    ]:
        kwargs = {"json": body} if body is not None else {}
        res = client.post(path, headers=viewer_headers, **kwargs)
        assert res.status_code == 403
        assert res.json() == {"detail": "Not allowed"}


def test_new_pairing_code_replaces_unused_code(client, auth_headers):
    first = client.post("/api/me/pairing-code", headers=auth_headers).json()["code"]
    second = client.post("/api/me/pairing-code", headers=auth_headers).json()["code"]
    assert client.post("/api/pair", json={"code": first}).status_code == 400
    assert client.post("/api/pair", json={"code": second}).status_code == 200


def test_expired_pairing_code_is_rejected(client, auth_headers, engine):
    code = client.post("/api/me/pairing-code", headers=auth_headers).json()["code"]
    with Session(engine) as db:
        db.execute(
            update(PairingCode)
            .where(PairingCode.code == code)
            .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        )
        db.commit()
    res = client.post("/api/pair", json={"code": code})
    assert res.status_code == 400
    assert res.json() == {"detail": "Invalid or expired code"}


def test_mismatched_device_id_in_event_returns_403(client, auth_headers, payload):
    payload["device_id"] = "other-phone-99"
    res = client.post("/api/me/events", json=payload, headers=auth_headers)
    assert res.status_code == 403
    assert res.json() == {"detail": "Not allowed"}


def test_pair_rate_limit_blocks_after_5_failures(client, auth_headers):
    valid_code = client.post("/api/me/pairing-code", headers=auth_headers).json()["code"]
    for _ in range(5):
        res = client.post("/api/pair", json={"code": "000000"})
        assert res.status_code == 400

    blocked = client.post("/api/pair", json={"code": valid_code})
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Too many attempts. Try again in a minute."}
