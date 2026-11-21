# Backend: Implementation Guide (contract v0, sensor check)

Everything the backend developer needs. If anything here differs from [`API_CONTRACT.md`](../API_CONTRACT.md), **the contract wins**.

## The app in one paragraph
We're building a personal "stand up" reminder like the Apple Watch one: **my phone, my data**. Like Apple Health, you only ever see your own readings.
**Right now (v0)** the only goal is to prove the sensor works end to end: the phone sends accelerometer readings,
**the backend validates and stores them**, and a web dashboard paired to that phone reads them back.
Your job includes making sure a token can **only** ever reach its own phone's data.

```
[ Phone app ]  --register / readings / pairing code-->  [ Backend API ]  <-->  [ PostgreSQL ]
                                                               ^
                                       pair with code, GET /api/me, GET /api/me/events
                                                               |
                                                       [ Web dashboard ]
```

You work **independently from mobile and frontend** until integration: use the samples, the built-in `/docs` page and a fake-phone simulator.

## Your folders
- `src/backend/`: the API
- `tools/simulator/`: the fake phone (you own it; everyone uses it)
- `contracts/backend/`: your guide + samples

Only edit files there (plus `docker-compose.yml` and `.dockerignore` at the root).

## Stack
| Piece | Choice |
|---|---|
| Language | **Python 3.14.7** (Docker base image `python:3.14-slim`; pin it in `src/backend/.python-version`). Use recent FastAPI / Pydantic / psycopg releases, which ship 3.14 wheels |
| Framework | FastAPI + Pydantic v2 |
| DB access | SQLAlchemy 2 (+ `psycopg` for Postgres) |
| Database | PostgreSQL 16 (Docker locally, Azure PostgreSQL Flexible Server in the cloud) |
| Tests | pytest + FastAPI `TestClient` |
| Packaging | `requirements.txt` (or `pyproject.toml`) + `Dockerfile` |

SQLite is fine as a quick fallback for tests, but run against Postgres before integration.

Suggested layout:
```
src/backend/
├── app/
│   ├── main.py        # app, CORS, routers, /health
│   ├── config.py      # env vars
│   ├── db.py          # engine/session
│   ├── models.py      # tables
│   ├── schemas.py     # request/response models (Pydantic)
│   ├── auth.py        # token generation, hashing, "current phone" dependencies
│   ├── routes/        # register.py, me.py, pairing.py
│   └── seed.py        # loads contracts/backend/*.json
├── tests/
├── requirements.txt
├── Dockerfile
└── .env.example
```
Plus `docker-compose.yml` at the repo root: `backend` + `postgres`.

## Config (env vars)
| Variable | Example | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://app:app@localhost:5432/app` | DB connection |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `SEED_DEMO_DATA` | `true` | On startup, load the samples if the DB is empty. **Dev only, never in Azure** |
| `SEED_DATA_DIR` | `/app/demo-data` | Where the sample JSON files are |
| `ONLINE_WINDOW_MINUTES` | `5` | The phone is online if seen within this window |
| `PAIRING_CODE_TTL_MINUTES` | `10` | How long a pairing code is valid |

Never commit real values. Commit `.env.example` only. In Azure, these become Container App secrets.

## Auth model ("my phone, my data")
| Token | Issued by | Held by | Allowed |
|---|---|---|---|
| `device_token` | `POST /api/register` | the phone | `POST /api/me/events`, `POST /api/me/pairing-code`, both `GET`s |
| `viewer_token` | `POST /api/pair` | the dashboard | `GET /api/me`, `GET /api/me/events` only |

- Header: `Authorization: Bearer <token>`.
- Generate tokens with `secrets.token_urlsafe(32)`. Store **only** `sha256(token)` (hex); look up by hash. Return the raw token once and never store or log it.
- `device_id` = `phone-` + 8 random `[a-z0-9]` chars (the samples use `demo-phone-01`). Not a secret.
- Pairing code = 6 random digits (`secrets.randbelow(10**6)`, zero-padded), unique among active codes, expires after `PAIRING_CODE_TTL_MINUTES`, **single use**.
  Issuing a new code deletes that phone's unused codes.
- Two FastAPI dependencies in `auth.py`:
  - `current_phone_any_token` → resolves a device **or** viewer token to its phone (for the GETs)
  - `current_phone_device_token` → device token only (for POSTs); a valid viewer token gets `403`
- Missing/unknown token → `401 {"detail": "Invalid or missing token"}`. Wrong token type or mismatched `device_id` → `403 {"detail": "Not allowed"}`.
- **No endpoint takes a device ID from the URL or query.** The phone always comes from the token.
- Nice to have: limit `POST /api/pair` to ~5 failed attempts per IP per minute (6 digits can be guessed otherwise).

## Data model
**devices**
| Column | Type | Notes |
|---|---|---|
| `device_id` | text, PK | |
| `device_name` | text, nullable | |
| `platform` | text | `ios` / `android` |
| `token_hash` | text, unique | sha256 of the device token |
| `created_at` | timestamptz | |
| `last_seen` | timestamptz, nullable | timestamp of the newest reading |

**viewer_tokens**
| Column | Type | Notes |
|---|---|---|
| `token_hash` | text, PK | sha256 of the viewer token |
| `device_id` | text, FK → devices | |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz, nullable | |

**pairing_codes**
| Column | Type | Notes |
|---|---|---|
| `code` | text, PK | 6 digits |
| `device_id` | text, FK → devices | |
| `expires_at` | timestamptz | |
| `used_at` | timestamptz, nullable | set when paired |

**events**
| Column | Type | Notes |
|---|---|---|
| `id` | serial/bigint, PK | |
| `device_id` | text, FK → devices | index (`device_id`, `timestamp` desc) |
| `event_type` | text | `accelerometer` |
| `value` | float | magnitude |
| `unit` | text | `g` |
| `x`, `y`, `z` | float | from `axes` |
| `timestamp` | timestamptz | from the phone, stored in UTC |
| `received_at` | timestamptz | set by the server, UTC |

Create tables on startup (`create_all`) for v0. Migrations (Alembic) only if time allows.

## Endpoints

### `POST /api/register`
No auth. Request (`register_request.json`):
```json
{ "device_name": "Demo Phone", "platform": "ios" }
```
Validation: `platform` required, `ios`/`android`; `device_name` optional, max 64 chars. Otherwise `422`.
Creates the phone and its device token. `201` (`register_response.json`):
```json
{
  "device_id": "demo-phone-01",
  "device_token": "dev-device-token-demo-phone-01-not-a-real-secret",
  "created_at": "2026-11-20T18:00:00Z"
}
```

### `POST /api/me/events`
`Authorization: Bearer <device_token>`. Request (`post_event_request.json`):
```json
{
  "device_id": "demo-phone-01",
  "event_type": "accelerometer",
  "value": 1.269,
  "unit": "g",
  "timestamp": "2026-11-20T18:45:00Z",
  "axes": { "x": 0.412, "y": -0.655, "z": 1.006 }
}
```

Validation (anything failing → `422`, the FastAPI default):
| Field | Rule |
|---|---|
| `device_id` | required, `^[a-z0-9-]{3,64}$`, must equal the token's phone (otherwise `403`) |
| `event_type` | required, must be `"accelerometer"` |
| `value` | required, number `>= 0` |
| `unit` | required, must be `"g"` |
| `timestamp` | required, ISO 8601 **with timezone** (reject naive); convert to UTC |
| `axes` | required, `x`, `y`, `z` numbers |

Behavior: insert the event with `received_at = now (UTC)`; set `devices.last_seen` to the newer of the existing value and this `timestamp`.
`201` (`post_event_response.json`):
```json
{ "id": 1043, "device_id": "demo-phone-01", "received_at": "2026-11-20T18:45:01Z" }
```
Do **not** recompute or reject `value` if it doesn't match x/y/z exactly; store what the phone sends (v0 is about proving the pipe works).

### `POST /api/me/pairing-code`
`Authorization: Bearer <device_token>`, no body. Deletes this phone's unused codes, creates a new one.
`201` (`pairing_code_response.json`):
```json
{ "code": "482913", "expires_at": "2026-11-20T18:55:00Z" }
```

### `POST /api/pair`
No auth. Request (`pair_request.json`): `{"code": "482913"}`
If the code exists, isn't expired and isn't used: mark it used, create a viewer token for that phone.
`200` (`pair_response.json`):
```json
{ "device_id": "demo-phone-01", "viewer_token": "dev-viewer-token-demo-phone-01-not-a-real-secret" }
```
Otherwise `400 {"detail": "Invalid or expired code"}`. Same message for every failure (don't reveal which).

### `GET /api/me`
`Authorization: Bearer <viewer_token or device_token>`. `200` (`me.json`):
```json
{
  "device_id": "demo-phone-01",
  "device_name": "Demo Phone",
  "platform": "ios",
  "created_at": "2026-11-20T18:00:00Z",
  "last_seen": "2026-11-20T18:45:00Z",
  "online": true
}
```
`last_seen` is `null` before the first reading. `online` = `last_seen` within `ONLINE_WINDOW_MINUTES` of now.

### `GET /api/me/events?limit=50`
`Authorization: Bearer <viewer_token or device_token>`. Newest first. `limit` default 50, min 1, max 500 (outside → `422`).
`200` (`me_events.json`), empty `events` list before the first reading:
```json
{
  "device_id": "demo-phone-01",
  "events": [
    { "id": 1043, "event_type": "accelerometer", "value": 1.269, "unit": "g",
      "timestamp": "2026-11-20T18:45:00Z", "axes": { "x": 0.412, "y": -0.655, "z": 1.006 },
      "received_at": "2026-11-20T18:45:01Z" }
  ]
}
```

### `GET /health`
No auth. `200 {"status": "ok"}`. Optionally also check the DB connection. Used by Azure and the deploy pipeline.

### General
- All timestamps in responses: UTC with `Z` (not `+00:00`). Make the serializer consistent.
- snake_case everywhere, exactly the field names above.
- CORS: allow `CORS_ORIGINS`, methods `GET, POST`, headers `Authorization`, `Content-Type`.
- FastAPI's `/docs` page stays enabled; add the Bearer scheme so you can paste a token there ("Authorize" button).
- Never log `Authorization` headers or tokens.

## Test data: how to simulate the phone

### 1. Seed from the samples
With `SEED_DEMO_DATA=true` and an empty DB, load from `SEED_DATA_DIR`:
- the phone `demo-phone-01` from `me.json`, with `token_hash = sha256(device_token)` from `register_response.json`
- a viewer token from `pair_response.json` (store its hash)
- the 5 readings from `me_events.json`
- a pairing code `482913` valid for 24 h (dev convenience, single use)

So the sample tokens work against a seeded dev backend: the frontend can pair with `482913` once, or use the sample viewer token directly.
In Docker, copy `contracts/backend/` into the image (e.g. at `/app/demo-data`).
This means the Docker **build context is the repo root** (`docker build -f src/backend/Dockerfile .`). Copy only `src/backend/` and `contracts/backend/`, and add a root `.dockerignore`.

### 2. Send requests by hand
- Open `http://localhost:8000/docs`: register, click "Authorize", paste the token, then send `post_event_request.json` (with your `device_id`).
- Or with curl, using the sample files as bodies and `-H "Authorization: Bearer <token>"`.
- Try the failure cases: no token → 401, viewer token on `POST /api/me/events` → 403, wrong `device_id` → 403,
  missing `axes` → 422, `timestamp` without a timezone → 422, used/expired code → 400.

### 3. Fake phone: `tools/simulator/`
A small standalone script (only uses HTTP, never touches the DB) that acts like the phone:
- On start: registers (or reuses a token saved in a gitignored `tools/simulator/.token`), then requests a pairing code and **prints it**,
  so the frontend person can pair their dashboard with the simulated phone.
- Then sends one reading per second to `POST /api/me/events` in exactly the contract format.
- Options: `--url`, `--scenario`, `--interval`, `--new` (force re-register).
- Scenarios:
  - `still`: x ≈ 0, y ≈ 0, z ≈ 1.0 with ±0.01 noise
  - `shaking`: random x/y/z roughly between -1.5 and 2.0
  - `mixed`: mostly still, with a few seconds of shaking every ~30 s
- `value` = `sqrt(x² + y² + z²)` rounded to 3 decimals; `timestamp` = current UTC.
- Prints each response code so failures are visible.

This is also what the frontend person uses to see live data, and our backup if the phone fails during the demo.

### 4. Automated tests (pytest)
- Register → 201, response has `device_id`, `device_token`, `created_at`; the DB holds a hash, not the token.
- POST event with the device token → 201; it appears in `GET /api/me/events`, and `GET /api/me` shows `last_seen`.
- Auth: no token / bad token → 401; viewer token on POSTs → 403; mismatched `device_id` → 403.
- Pairing: code → pair → viewer token can GET; the same code a second time → 400; expired code → 400.
- **Isolation**: in the test, register a second phone; its tokens must never return the first phone's readings.
- Validation rules → 422; `limit=0` / `limit=501` → 422.
- Seeded DB → responses match the sample shapes.
These run in the CI pipeline, so keep them fast and independent of external services (SQLite or a Postgres service container).

## Done when (v0)
- [ ] `docker compose up` starts backend + Postgres; `/health` returns ok
- [ ] Register, send, pairing code, pair, `GET /api/me`, `GET /api/me/events` all match the samples
- [ ] Tokens stored hashed; viewer tokens are read-only; isolation test passes
- [ ] Seeding works; the simulator registers, prints a pairing code and runs all three scenarios
- [ ] Tests pass locally
- [ ] Dockerfile builds an image that runs with only env vars
- [ ] With the real phone: registers → tap Send → row in the DB → visible on the paired dashboard

## Integration
1. Run the backend on your laptop; give the others `http://<your-LAN-IP>:8000`. No shared key needed: the phone registers itself.
2. If the phone can't reach your laptop on the WiFi, expose it with a tunnel (ngrok / cloudflared) and share that URL.
3. Add the frontend's dev origin (`http://localhost:5173`) to `CORS_ORIGINS`.
4. Cloud: the same image runs on Azure Container Apps with `DATABASE_URL` as a secret and `SEED_DEMO_DATA` unset. Nothing in the code changes.

## Coming next (not yet)
- **v1**: phone sends a movement score; backend marks each event `is_active` (`value > ACTIVE_THRESHOLD_G`, ~0.05).
- **v2**: `GET /api/me/status` → `OK` / `STAND_UP` / `NO_DATA`, based on minutes since the last active event vs `STAND_INTERVAL_MINUTES` (120; 2 for the demo).
- **Later**: real accounts (e.g. Microsoft Entra ID), revoke viewer tokens, delete-my-data endpoint.
Keep auth and the "what's my phone" lookup in `auth.py` so these additions are small.

## Git workflow
- Branches `backend/<feature>` (e.g. `backend/register`, `backend/events`, `backend/pairing`, `backend/seed`, `backend/simulator`), merged to `main` often.
- Small commits with clear messages, one per feature/step.
- Only touch `src/backend/`, `tools/simulator/`, `contracts/backend/`, `docker-compose.yml` and `.dockerignore`. API changes go through a contract PR approved by all three.

## Diagnosing stalled requests

API responses include `X-Request-ID` and `Server-Timing: app;dur=...`.
Search Railway service logs for that request ID. Structured timing records use:

- `request_start` / `request_end`: application request duration and HTTP status.
- `db_checkout_start` / `db_checkout`: pool wait, connection setup, and pre-ping.
- `db_query_start` / `db_query`: SQL execution duration.
- `db_error`: exception class, PostgreSQL SQLSTATE, and disconnect classification.

A start without a matching completion identifies an operation still waiting.
SQL text, bound values, connection strings, and locations are not included in these
records. Slow stages (500 ms or more) and errors log at WARNING; others use INFO.

Timeout defaults are configurable with `DB_POOL_TIMEOUT_SECONDS` (2),
`DB_STATEMENT_TIMEOUT_MS` (3000), `DB_LOCK_TIMEOUT_MS` (1000), and
`DB_TCP_USER_TIMEOUT_MS` (5000). PostgreSQL idle transactions are closed after
10 seconds. TCP user timeout bounds unacknowledged writes on supported systems
(including Linux/Railway); it is not a total request deadline. Pool pre-ping remains
enabled. These limits bound individual operations, so an HTTP request performing
multiple queries can take longer. SQLAlchemy failures return 503 through the
existing database dependency.

The dashboard separately aborts each request after 5 seconds, including response
body reading. Polling keeps its last known cadence after a transient error, so an
armed device continues retrying at the active interval. A browser abort does not
cancel work already running in the backend. These safeguards limit stalls but do
not establish their underlying cause; correlate checkout/query timing with
PostgreSQL and Railway logs before attributing failures to a specific component.
