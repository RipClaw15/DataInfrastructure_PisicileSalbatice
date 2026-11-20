"""Dummy API for testing the mobile app on its own. Not the real backend.

Accepts POST /api/events (contract v0), prints every reading to the console
and keeps them in memory. Standard library only, so there is nothing to install.

    python mobile/dev-server/server.py [--port 8000]
"""

import argparse
import json
import socket
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

REQUIRED_FIELDS = ("device_id", "event_type", "value", "unit", "timestamp", "axes")

events: list[dict] = []


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def validation_error(body) -> str | None:
    if not isinstance(body, dict):
        return "body must be a JSON object"
    missing = [f for f in REQUIRED_FIELDS if f not in body]
    if missing:
        return f"missing fields: {', '.join(missing)}"
    axes = body["axes"]
    if not isinstance(axes, dict) or not all(isinstance(axes.get(k), (int, float)) for k in "xyz"):
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
        elif url.path == "/api/events":
            try:
                limit = int(parse_qs(url.query).get("limit", ["50"])[0])
            except ValueError:
                self.send_json(422, {"detail": "limit must be an integer"})
                return
            self.send_json(200, {"events": events[::-1][:limit]})
        else:
            self.send_json(404, {"detail": "Not found"})

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/events":
            self.send_json(404, {"detail": "Not found"})
            return

        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except json.JSONDecodeError:
            body = None

        error = validation_error(body)
        if error:
            print(f"  x rejected from {self.client_address[0]}: {error}")
            self.send_json(422, {"detail": error})
            return

        event = {"id": len(events) + 1, **body, "received_at": utc_now()}
        events.append(event)

        a = body["axes"]
        print(
            f"#{event['id']:<4} {body['timestamp']}  {body['device_id']}  "
            f"x={a['x']:+.3f} y={a['y']:+.3f} z={a['z']:+.3f}  |a|={body['value']:.3f} {body['unit']}"
        )
        self.send_json(201, {"id": event["id"], "device_id": body["device_id"], "received_at": event["received_at"]})

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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8000)
    port = parser.parse_args().port

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    url = f"http://{lan_ip()}:{port}"
    print(f"Dummy mobile API on {url}")
    print(f"Set in mobile/.env: EXPO_PUBLIC_API_URL={url} (then restart Expo)")
    print("Waiting for readings... (Ctrl+C to stop)\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\nStopped. {len(events)} readings received.")


if __name__ == "__main__":
    main()
