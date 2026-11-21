"""Dummy API for testing the mobile app on its own. Not the real backend.

Accepts readings (contract v0) and arm/disarm/status/alerts (contract v1), and applies
the contract's detection rules while armed, so it doubles as a reference for the real
backend. Prints everything and keeps it in memory. Standard library only, nothing to install.

    python mobile/dev-server/server.py [--port 8000]
"""

import argparse
import json
import math
import platform
import re
import socket
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

REQUIRED_FIELDS = ("device_id", "event_type", "value", "unit", "timestamp", "axes")


# Contract v1 detection: moved more than this from the resting position -> one picked_up alert.
PICKED_UP_DEG = 6.0

events: list[dict] = []
armed: dict[str, dict] = {}  # device_id -> {"armed_at", "axes" (resting position), "location" (where armed), "alert" (this session's, or None)}
alerts: list[dict] = []  # all sessions, oldest first
last_seen: dict[str, str] = {}
last_location: dict[str, dict] = {}  # device_id -> location of the newest reading that had one

DEVICE_PATH = re.compile(r"^/api/devices/([a-z0-9-]{3,64})/(arm|disarm|status|alerts)$")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def valid_axes(axes) -> bool:
    return isinstance(axes, dict) and all(isinstance(axes.get(k), (int, float)) for k in "xyz")


def angle_deg(a: dict, b: dict) -> float:
    """Angle between two x/y/z vectors, in degrees."""
    dot = sum(a[k] * b[k] for k in "xyz")
    norms = math.sqrt(sum(a[k] ** 2 for k in "xyz")) * math.sqrt(sum(b[k] ** 2 for k in "xyz"))
    return math.degrees(math.acos(max(-1.0, min(1.0, dot / norms)))) if norms else 0.0


def check_reading(session: dict, reading: dict) -> dict | None:
    """Contract v1: the first reading more than 6 deg from rest creates the session's one alert."""
    if session["alert"] or angle_deg(session["axes"], reading["axes"]) <= PICKED_UP_DEG:
        return None
    alert = {
        "id": len(alerts) + 1,
        "device_id": reading["device_id"],
        "type": "picked_up",
        "timestamp": reading["timestamp"],
        "angle_deg": round(angle_deg(session["axes"], reading["axes"]), 1),
        "value": reading["value"],
        "unit": "g",
        "axes": reading["axes"],
    }
    alerts.append(alert)
    session["alert"] = alert
    return alert


def status(device_id: str) -> dict:
    session = armed.get(device_id)
    state = "DISARMED" if not session else "ALERT" if session["alert"] else "GUARDING"
    result = {
        "device_id": device_id,
        "state": state,
        "armed_at": session["armed_at"] if session else None,
        "last_seen": last_seen.get(device_id),
        "online": device_id in last_seen,
        "last_alert": session["alert"] if session else None,
    }
    if session and session["location"]:
        result["location"] = session["location"]
    if device_id in last_location:
        result["last_location"] = last_location[device_id]
    return result


def validation_error(body) -> str | None:
    if not isinstance(body, dict):
        return "body must be a JSON object"
    missing = [f for f in REQUIRED_FIELDS if f not in body]
    if missing:
        return f"missing fields: {', '.join(missing)}"
    if not valid_axes(body["axes"]):
        return "axes must contain numeric x, y, z"
    if not isinstance(body["value"], (int, float)) or body["value"] < 0:
        return "value must be a number >= 0"
    return None


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/health":
            self.send_json(200, {"status": "ok"})
        elif match := DEVICE_PATH.match(url.path):
            device_id, action = match.groups()
            if action in ("arm", "disarm"):
                self.send_json(405, {"detail": "Use POST"})
            elif device_id not in last_seen and device_id not in armed:
                self.send_json(404, {"detail": "Device not found"})
            elif action == "status":
                self.send_json(200, status(device_id))
            else:
                try:
                    limit = int(parse_qs(url.query).get("limit", ["20"])[0])
                except ValueError:
                    self.send_json(422, {"detail": "limit must be an integer"})
                    return
                mine = [a for a in alerts if a["device_id"] == device_id]
                self.send_json(200, {"device_id": device_id, "alerts": mine[::-1][:limit]})
        elif url.path == "/api/events":
            try:
                limit = int(parse_qs(url.query).get("limit", ["50"])[0])
            except ValueError:
                self.send_json(422, {"detail": "limit must be an integer"})
                return
            self.send_json(200, {"events": events[::-1][:limit]})
        else:
            self.send_json(404, {"detail": "Not found"})

    def read_json(self):
        try:
            return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"null")
        except json.JSONDecodeError:
            return None

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if match := DEVICE_PATH.match(path):
            self.arm_or_disarm(*match.groups())
            return
        if path != "/api/events":
            self.send_json(404, {"detail": "Not found"})
            return

        body = self.read_json()

        error = validation_error(body)
        if error:
            print(f"  x rejected from {self.client_address[0]}: {error}")
            self.send_json(422, {"detail": error})
            return

        event = {"id": len(events) + 1, **body, "received_at": utc_now()}
        events.append(event)
        last_seen[body["device_id"]] = body["timestamp"]

        a = body["axes"]
        session = armed.get(body["device_id"])
        guard = f"  armed, {angle_deg(session['axes'], a):5.1f} deg from rest" if session else ""
        if session and session["alert"]:
            guard += "  [ALERT]"
        loc = body.get("location")
        gps = ""
        if isinstance(loc, dict):
            last_location[body["device_id"]] = loc
            gps = f"  gps={loc.get('lat')},{loc.get('lon')}"
        print(
            f"#{event['id']:<4} {body['timestamp']}  {body['device_id']}  "
            f"x={a['x']:+.3f} y={a['y']:+.3f} z={a['z']:+.3f}  |a|={body['value']:.3f} {body['unit']}{guard}{gps}"
        )
        if session and (alert := check_reading(session, body)):
            print(f"!! ALERT {alert['type']}: {alert['angle_deg']} deg, {alert['value']} g")
        self.send_json(201, {"id": event["id"], "device_id": body["device_id"], "received_at": event["received_at"]})

    def arm_or_disarm(self, device_id: str, action: str) -> None:
        if action in ("status", "alerts"):
            self.send_json(405, {"detail": "Use GET"})
            return
        if action == "disarm":
            session = armed.pop(device_id, None)
            alert = session and session["alert"]
            was = f" (was ALERT: {alert['type']} at {alert['timestamp']}, {alert['angle_deg']} deg)" if alert else ""
            print(f"== DISARMED {device_id}{was}")
            self.send_json(200, status(device_id))
            return

        body = self.read_json()
        if not isinstance(body, dict) or "timestamp" not in body or not valid_axes(body.get("axes")):
            print(f"  x arm rejected from {self.client_address[0]}: needs timestamp and numeric axes x, y, z")
            self.send_json(422, {"detail": "arm needs timestamp and axes with numeric x, y, z"})
            return
        loc = body.get("location") if isinstance(body.get("location"), dict) else None
        armed[device_id] = {"armed_at": body["timestamp"], "axes": body["axes"], "location": loc, "alert": None}
        a = body["axes"]
        gps = f", at {loc.get('lat')},{loc.get('lon')}" if loc else ""
        print(f"== ARMED {device_id} at {body['timestamp']}, resting position x={a['x']:+.3f} y={a['y']:+.3f} z={a['z']:+.3f}{gps}")
        self.send_json(200, status(device_id))

    def log_message(self, format, *args) -> None:
        pass  # readings are printed in do_POST; skip the default access log


def lan_ip() -> str:
    """IP of the interface used for outgoing traffic (no packet is actually sent)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def read_api_url(env_file: Path) -> str | None:
    """EXPO_PUBLIC_API_URL from mobile/.env, "" if set but empty, None if the file or the variable is missing."""
    if not env_file.exists():
        return None
    for line in env_file.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() == "EXPO_PUBLIC_API_URL":
            return value.strip().strip("'\"")
    return None


ON_WINDOWS = platform.system() == "Windows"


def print_env_status(expected_url: str) -> None:
    """One line: is mobile/.env pointing at this server? If not, what to put in it."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if read_api_url(env_file) == expected_url:
        print("mobile/.env OK")
        return

    copy = "copy mobile\\.env.example mobile\\.env" if ON_WINDOWS else "cp mobile/.env.example mobile/.env"
    create = f"{copy}, then " if not env_file.exists() else ""
    print(f"! {create}set in mobile/.env: EXPO_PUBLIC_API_URL={expected_url} and restart Expo")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8000)
    port = parser.parse_args().port

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    url = f"http://{lan_ip()}:{port}"
    print(f"Dummy mobile API on {url}")
    print_env_status(url)
    print("Waiting for readings... (Ctrl+C to stop)\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\nStopped. {len(events)} readings received.")


if __name__ == "__main__":
    main()
