"""Exercise the running local stack using only Python's standard library.

Run inside the app container: docker compose exec app python smoke_local.py
Creates one synthetic device/session per run; does not use your phone or tokens.
"""

from datetime import datetime, timezone
import json
import re
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000').rstrip('/')


def request(path, body=None, token=None, expected=200):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                  headers=headers)
    try:
        response = urlopen(req, timeout=10)
    except HTTPError as exc:
        response = exc
    with response:
        raw = response.read().decode()
        assert response.status == expected, f'{path}: expected {expected}, got {response.status}'
        return json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else raw


def now():
    return datetime.now(timezone.utc).isoformat()


assert request('/ready')['database'] == 'connected'
assert 'href="/dashboard"' in request('/')
html = request('/dashboard/')
asset = re.search(r'src="([^" ]+\.js)"', html)
assert asset, 'Dashboard JavaScript asset missing'
assert request(asset[1]), 'Dashboard JavaScript asset not served'

phone = 'docker-smoke-' + uuid4().hex[:12]
device = request('/api/register', {'device_id': phone, 'device_name': 'Docker smoke test'}, expected=201)
token = device['device_token']
code = request('/api/me/pairing-code', {}, token, expected=201)['code']
viewer = request('/api/pair', {'code': code})['viewer_token']
assert request('/api/me', token=viewer)['device_id'] == phone

armed = request('/api/me/arm', {'timestamp': now(), 'axes': {'x': 0.0, 'y': 0.0, 'z': 1.0}}, token)
assert armed['state'] == 'GUARDING'
request('/api/me/events', {
    'device_id': phone, 'event_type': 'accelerometer', 'value': 1.0, 'unit': 'g',
    'timestamp': now(), 'axes': {'x': 1.0, 'y': 0.0, 'z': 0.0},
    'location': {'lat': 46.7712, 'lon': 23.6236, 'accuracy_m': 15.0},
}, token, expected=201)
status = request('/api/me/status', token=viewer)
assert status['state'] == 'ALERT'
assert status['last_location']['lat'] == 46.7712
assert request('/api/me/live', token=viewer)['axes']['x'] == 1.0
assert request('/api/me/alerts', token=viewer)['alerts']
assert request('/api/me/events', token=viewer)['events']
request('/api/me/disarm', {}, viewer, expected=403)
assert request('/api/me/disarm', {}, token)['state'] == 'DISARMED'
print('PASS: database, landing page, dashboard assets, registration, pairing, arm, movement alert, live reading, location, history, viewer permissions, and disarm')
