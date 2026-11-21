# Backend: Implementation Guide (contract v0 + v1)

## Current storage policy: state changes and limited GPS history

The backend now evaluates every POST reading but retains only these snapshots:
Arm, the first picked-up alert, Disarm, and a limited GPS trail during ALERT.
Re-arming records the old session ending and the new one starting. Repeated
Disarm calls do not create extra snapshots. Existing history is not deleted.

- Arm/Disarm snapshots keep the existing accelerometer event shape; their
  magnitude is calculated from resting axes when no current reading is available.
- POST /api/events still returns 201 for mobile compatibility. It now includes
  `stored`: true means `id` identifies a retained event; false means the reading
  was validated/evaluated but not saved, and `id` is the reserved value 0.
- GET /api/events returns retained snapshots and legacy history only, with
  optional `snapshot_reason`: armed, picked_up, disarmed, or gps_update.
  Dashboard charts are a snapshot history, not a continuous recording.
- GET /api/devices/{device_id}/live returns the latest accepted reading, or null
  when a known device has no cached reading. This endpoint is temporary data,
  not a database history. Status uses the cache for last_seen, online, and GPS.
- During ALERT, the first GPS fix is saved immediately if the alert had none.
  Further fixes are saved only when BOTH at least 30 server seconds elapsed and
  movement is at least 25 metres (or either fix's accuracy radius, if greater).
  Stale/out-of-order GPS fixes never replace newer retained GPS history.
- Configure thresholds with ALERT_GPS_INTERVAL_SECONDS and
  ALERT_GPS_DISTANCE_METERS. No GPS trail is retained while GUARDING or DISARMED.
- The cache holds one latest reading/GPS fix per phone, at most 2048 phones,
  expires after 10 minutes without arrivals, and clears on API shutdown. It makes
  no routine database writes. It assumes the default single-worker deployment;
  multiple API workers/replicas need a shared ephemeral cache for consistent live
  values. Guard state and history remain durable regardless of the cache.
- Startup adds event_snapshots metadata; existing tables and historical readings
  are preserved. Coordinate storage remains in event_locations/session_locations.

This policy supersedes the store-every-reading behavior in the original v0
implementation notes below. The shared contract and client-facing documentation
should be reconciled with the team before other consumers rely on the old
meaning of a POST receipt or a continuous readings history.

The original payloads and detection rules follow [`API_CONTRACT.md`](../API_CONTRACT.md).
The explicitly approved storage policy above changes retention and receipt semantics;
the older implementation notes below describe the initial store-every-reading version.

## The task
**The app:** an old phone that guards your stuff. Arm it, walk away, and the dashboard alerts you if it's moved (see [`IDEA.md`](../IDEA.md)).

**v0 (first) is only the basic task**:
the phone sends accelerometer readings, **the backend validates and stores them**, and the dashboard reads them back.

```
[ Phone app ]  --POST /api/events-->  [ Backend API ]  <-->  [ PostgreSQL ]
                                            ^
                                     GET /api/events
                                            |
                                     [ Web dashboard ]
```

You work **independently from mobile and frontend** until integration: use the samples, the built-in `/docs` page and a fake-phone simulator.

## Coming from the earlier version
The current backend has `/health` and the FleetPulse landing page (simulated vehicles). Keep the FastAPI app, `Dockerfile` and `requirements.txt`.

1. **First:** `POST /api/events` and `GET /api/events` (v0), so the phone and dashboard can connect.
2. **Then:** the guard endpoints and the detection rule (v1). `mobile/dev-server/server.py` already implements the same rule and API
   (standard-library Python), so you can compare its responses with yours.
3. **For the team to decide:** the FleetPulse page (a different idea from the guard app) and Railway (the brief asks for Azure).

## Your folders
- `backend/`: the API
- `tools/simulator/`: the fake phone (you own it; everyone uses it)
- `contracts/backend/`: this guide + samples
- plus `docker-compose.yml` and `.dockerignore` at the repo root

## Stack
| Piece | Choice |
|---|---|
| Language | **Python 3.14.7** (Docker base image `python:3.14-slim`; pin it in `backend/.python-version`). Use recent FastAPI / Pydantic / psycopg releases, which ship 3.14 wheels |
| Framework | FastAPI + Pydantic v2 |
| DB access | SQLAlchemy 2 (+ `psycopg` for Postgres) |
| Database | PostgreSQL 16 (Docker locally, Azure PostgreSQL Flexible Server in the cloud) |
| Tests | pytest + FastAPI `TestClient` |
| Packaging | `requirements.txt` (or `pyproject.toml`) + `Dockerfile` |

SQLite is fine as a quick fallback for tests, but run against Postgres before integration.

Suggested layout:
```
backend/
├── app/
│   ├── main.py        # app, CORS, routes, /health
│   ├── config.py      # env vars
│   ├── db.py          # engine/session
│   ├── models.py      # events table
│   ├── schemas.py     # request/response models (Pydantic)
│   └── seed.py        # loads contracts/backend/events.json
├── tests/
├── requirements.txt
├── Dockerfile
└── .env.example
```

## Config (env vars)
| Variable | Example | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://app:app@localhost:5432/app` | DB connection |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `SEED_DEMO_DATA` | `true` | On startup, load `events.json` if the DB is empty. **Dev only, never in Azure** |
| `SEED_DATA_DIR` | `/app/demo-data` | Where the sample JSON files are |

Never commit real values. Commit `.env.example` only. In Azure, `DATABASE_URL` becomes a Container App secret.

## Data model
**events** (one table is enough for v0)
| Column | Type | Notes |
|---|---|---|
| `id` | serial/bigint, PK | |
| `device_id` | text | index (`device_id`, `timestamp` desc) |
| `event_type` | text | `accelerometer` |
| `value` | float | magnitude |
| `unit` | text | `g` |
| `x`, `y`, `z` | float | from `axes` |
| `timestamp` | timestamptz | from the phone, stored in UTC |
| `received_at` | timestamptz | set by the server, UTC |

Create the table on startup (`create_all`) for v0. Migrations (Alembic) only if time allows.

## Endpoints

### `POST /api/events`
Request (`post_event_request.json`):
```json
{
  "device_id": "demo-phone-01",
  "event_type": "accelerometer",
  "value": 1.006,
  "unit": "g",
  "timestamp": "2026-11-20T18:57:59Z",
  "axes": { "x": -0.033, "y": -0.645, "z": -0.771 }
}
```

Validation (anything failing → `422`, the FastAPI default):
| Field | Rule |
|---|---|
| `device_id` | required, `^[a-z0-9-]{3,64}$` |
| `event_type` | required, must be `"accelerometer"` |
| `value` | required, number `>= 0` |
| `unit` | required, must be `"g"` |
| `timestamp` | required, ISO 8601 **with timezone** (reject naive); convert to UTC |
| `axes` | required, `x`, `y`, `z` numbers |

Insert the event with `received_at = now (UTC)`. `201` (`post_event_response.json`):
```json
{ "id": 152, "device_id": "demo-phone-01", "received_at": "2026-11-20T18:57:59Z" }
```
Do **not** recompute or reject `value` if it doesn't match x/y/z exactly; store what the phone sends.

### `GET /api/events?limit=50`
Newest first (by `timestamp`). `limit` default 50, min 1, max 500 (outside → `422`).
`200` (`events.json`), empty list before the first reading:
```json
{
  "events": [
    { "id": 152, "device_id": "demo-phone-01", "event_type": "accelerometer", "value": 1.006, "unit": "g",
      "timestamp": "2026-11-20T18:57:59Z", "axes": { "x": -0.033, "y": -0.645, "z": -0.771 },
      "received_at": "2026-11-20T18:57:59Z" }
  ]
}
```

### `GET /health`
`200 {"status": "ok"}`. Optionally also check the DB connection. Used by Azure and the deploy pipeline.

### General
- All timestamps in responses: UTC with `Z` (not `+00:00`). Make the serializer consistent.
- snake_case everywhere, exactly the field names above.
- CORS: allow `CORS_ORIGINS`, methods `GET, POST`, header `Content-Type`.
- FastAPI's `/docs` page stays enabled. It's useful for the demo too.
- **No auth yet**. Don't add any; pairing comes in v3.

## Test data: how to simulate the phone

### 1. Seed from the samples
With `SEED_DEMO_DATA=true` and an empty DB, insert the 19 readings from `events.json` on startup.
After seeding, `GET /api/events` should return `events.json` (apart from generated `id`s and `received_at`).
In Docker, copy `contracts/backend/` into the image (e.g. at `/app/demo-data`).
This means the Docker **build context is the repo root** (`docker build -f backend/Dockerfile .`). Copy only `backend/` and `contracts/backend/`, and add a root `.dockerignore`.

### 2. Send readings by hand
- Open `http://localhost:8000/docs` → `POST /api/events` → paste `post_event_request.json` → Execute.
- Or with curl, sending `contracts/backend/post_event_request.json` as the body.
- Try the failure cases: missing `axes` → 422, `timestamp` without a timezone → 422, `limit=501` → 422.

### 3. Fake phone: `tools/simulator/`
A small standalone script (only uses HTTP, never touches the DB) that acts like the phone:
- Sends one reading per second to `POST /api/events` in exactly the contract format.
- Options: `--url`, `--device-id` (default `demo-phone-01`), `--scenario`, `--interval`.
- Scenarios:
  - `still`: lying flat face up: x ≈ 0.03, y ≈ -0.03, z ≈ -0.96 (what a real iPhone on a table reported, resting on its camera bump), ±0.02 noise
  - `shaking`: random x/y/z roughly between -3 and +3 (real shakes reach 2–3.5 g magnitude, violent ones up to ~7 g)
  - `mixed`: mostly still, with a few seconds of shaking every ~30 s
- `value` = `sqrt(x² + y² + z²)` rounded to 3 decimals; `timestamp` = current UTC.
- Prints each response code so failures are visible.

This is also what the frontend person uses to see live data, and our backup if the phone fails during the demo.

### 4. Automated tests (pytest)
- POST the request sample → 201, response has `id`, `device_id`, `received_at`.
- After POST, the reading appears first in `GET /api/events`.
- Each validation rule → 422; `limit=0` / `limit=501` → 422.
- Seeded DB → response matches the `events.json` shape.
These run in the CI pipeline, so keep them fast and independent of external services (SQLite or a Postgres service container).

## Shared WiFi
- Every laptop has its own IP, so other teams using port 8000 don't clash with you. Only another program on **your** laptop can.
  If 8000 is taken, use another port and tell the others the new URL.
- Run the API on `0.0.0.0:8000` so the phone can reach it.
- In `docker-compose.yml`, publish Postgres **only on localhost** (`127.0.0.1:5432:5432`) so nobody else on the WiFi can reach the DB.
- Without auth, anyone on the WiFi who knows your URL can send readings. Fine for v0.

## Done when (v0)
- [ ] `docker compose up` starts backend + Postgres; `/health` returns ok
- [ ] `POST /api/events` validates, stores, returns 201
- [ ] `GET /api/events` matches the `events.json` shape exactly
- [ ] Seeding works; the simulator runs all three scenarios
- [ ] Tests pass locally
- [ ] Dockerfile builds an image that runs with only env vars
- [ ] With the real phone: tap Send → row in the DB → visible through `GET /api/events`

## v1: Guard
You own the **detection**: the phone only sends readings, you decide what counts as moved. Full spec: [`API_CONTRACT.md` → v1](../API_CONTRACT.md#v1-guard).

### New endpoints
| Endpoint | Does | Sample |
|---|---|---|
| `POST /api/devices/{device_id}/arm` | start a session; body `axes` = resting position | `arm_request.json` → `status_guarding.json` |
| `POST /api/devices/{device_id}/disarm` | end the session | → `status_disarmed.json` |
| `GET /api/devices/{device_id}/status` | `DISARMED` / `GUARDING` / `ALERT` + last alert | `status_*.json` |
| `GET /api/devices/{device_id}/alerts?limit=20` | alerts, newest first | `alerts.json` |

### New tables
**arm_sessions**: `id`, `device_id`, `rest_x`, `rest_y`, `rest_z`, `armed_at`, `disarmed_at` (null while armed).
**alerts**: `id`, `device_id`, `session_id` (FK), `type`, `timestamp`, `angle_deg`, `value`, `x`, `y`, `z`.

### Detection: run on every `POST /api/events` while the session is `GUARDING`
One rule: angle to the resting `axes` > **15°** → create a `picked_up` alert. That's it.

- Angle = `degrees(acos(dot(a, b) / (|a| * |b|)))`; clamp the cosine to [-1, 1] before `acos`.
- **One alert per session:** once the session has its alert, it's `ALERT` until disarmed; later readings are stored but don't create alerts.
- State: open session without alert → `GUARDING`; with its alert → `ALERT`; no open session → `DISARMED`.
- Arming while armed closes the old session and opens a new one.
- Put the rule in one small module (e.g. `app/detection.py`) as a pure function, so it's easy to test and to extend in v2.

### Tests (pytest): replay the v1 demo session
| Step | Send | Expect |
|---|---|---|
| Arm | `arm_request.json` | `GUARDING` |
| 19:10:05 | (0.025, -0.028, -0.980), 0.980 g | no alert |
| 19:10:12 | (0.020, -0.628, -0.744), 0.973 g | `picked_up`, 38.5°, state `ALERT` |
| 19:10:20 | (-3.193, -1.261, -0.596), 3.484 g | no new alert |
| 19:10:30 | (-0.169, 0.087, 0.963), 0.982 g | no new alert, still `ALERT` |
| Disarm | | `DISARMED` |

`alerts.json` and `status_alert.json` are the exact expected output.
Also replay the real session in `mobile/dev-server/captured-guard-session.json` (arm request, 31 readings, expected alert and states):
still → picked up at 56° → put back where it was, and it must **stay** `ALERT`. Also test: readings while disarmed → no alerts,
re-arming → back to `GUARDING` with no alert, and the table readings in `events.json` (#186–#189) against a table rest position → no alerts.

### What the dashboard relies on
The dashboard's 3D phone shows where the phone lay and where it is now: it reads the `armed` snapshot's `axes` from `GET /api/events`
and polls `GET /api/devices/{device_id}/live` every second while armed. Keep both.

### Fewer readings from the phone (added after v1)
The phone no longer sends every second: one reading after arming, then only when it turns > 2° (at most 1/s), a heartbeat every 30 s, and location changes while `ALERT`
(see [`API_CONTRACT.md`](../API_CONTRACT.md#what-the-phone-sends-while-armed)). It fits your storage policy above: the phone sends less, you keep less.
**Nothing to change:** detection runs on whatever arrives, the first post-alert reading carries the GPS fix, and 30 s heartbeats keep `online` true and `live` fresh.
Later (optional): while armed, no reading for ~90 s → the phone went silent (app closed, phone off), worth showing on the dashboard.

### Location (done)
`location: {lat, lon, accuracy_m}` on arm and on readings, `location` / `last_location` in `status`, and the GPS trail during `ALERT`: implemented and tested
(`test_locations.py`). Spec: [`API_CONTRACT.md`](../API_CONTRACT.md#v1-guard).

### Simulator
Add `--arm`: arms the phone, sends `still` readings for 10 s, then switches to the chosen scenario, so the frontend sees `GUARDING` → `ALERT` without a phone.

### Done when (v1)
- [ ] Arm/disarm/status/alerts match the samples
- [ ] The demo-session test produces exactly the 1 alert in `alerts.json`
- [ ] Disarmed-readings and re-arm tests pass
- [ ] Integrated: arm the real phone, pick it up → alert within ~2 s

## Integration
1. Run the backend on your laptop; give the others `http://<your-LAN-IP>:8000`.
2. If the phone can't reach your laptop on the WiFi, expose it with a tunnel (ngrok / cloudflared) and share that URL.
3. Add the frontend's dev origin (`http://localhost:5173`) to `CORS_ORIGINS`.
4. Cloud: the same image runs on Azure Container Apps with `DATABASE_URL` as a secret and `SEED_DEMO_DATA` unset. Nothing in the code changes.

## Coming next (not yet)
- **v2**: the phone plays a sound when an alert fires: include `state` in the `POST /api/events` response, or the phone polls `status`.
- **v3, my phone, my data**: pairing code and tokens; every request limited to the paired phone's data.
Keep detection in its own module so these additions are easy.

## Git workflow
- Branches `backend/<feature>` (e.g. `backend/post-events`, `backend/seed`, `backend/simulator`), merged to `main` often.
- Small commits with clear messages, one per feature/step.
- Only touch your folders. API changes go through a contract PR approved by all three.
