# API Contract: Mobile ↔ Backend ↔ Dashboard

**The app:** an old phone that guards your stuff. See [`IDEA.md`](IDEA.md).

```
[ Phone app ]  --register, arm, readings, disarm-->  [ Backend API ]  <-->  [ Database ]
   device token                                             ^
                                          status, live, alerts, readings (read-only)
                                                            |
                                              [ Web dashboard ]  viewer token (from pairing)
```

This is the **single source of truth** for the API between the phone app (`mobile/`), the backend (`backend/`) and the
dashboard (`codelap-dashboard/`). Change the contract first, then the code.

```
contracts/
├── API_CONTRACT.md   # this file
├── IDEA.md           # what we're building and why
├── mobile/*.json     # samples the phone sends and gets back (mock mode)
├── backend/*.json    # all samples, used by the backend tests
└── frontend/*.json   # samples the dashboard reads (fixture mode)
```

**Same file name = same shape.** The `mobile/` and `backend/` copies of a file are identical: the demo session below, and the
backend tests check the real API against them field for field. The `frontend/` files are a real session captured from the
API (another phone ID and times), same fields, so the dashboard's fixture mode looks like the real thing.
**Changing the contract:** tell the other two before changing a field, and update every copy of a changed JSON file.
Never change a field name silently.

## General rules
- JSON, **snake_case** field names.
- All timestamps are **ISO 8601 UTC with `Z`**, e.g. `2026-11-20T18:45:00Z`. The phone sends UTC; the dashboard shows local time.
- `device_id`: generated once by the phone and saved, lowercase `[a-z0-9-]`, 3–64 chars.
- Accelerometer values are in **g** (1 g ≈ 9.81 m/s²), gravity included. A phone lying still reads about **1.0 g**.
- `location`: `{"lat": 46.77, "lon": 23.59, "accuracy_m": 12}`; `accuracy_m` may be `null`. Always optional.
- Errors use the FastAPI default shape: `{"detail": "..."}`.
- Base URL comes from config, never hard-coded: mobile `EXPO_PUBLIC_API_URL`, dashboard `VITE_API_URL` (or `/` when the
  backend serves the dashboard itself, as on Railway).

## Auth: my phone, my data
Every request except register and pair carries a token: `Authorization: Bearer <token>`. Tokens are stored only hashed.

| Token | Who | Gets it from | Can |
|---|---|---|---|
| **device token** | the phone | `POST /api/register` | everything for its own phone |
| **viewer token** | the dashboard | `POST /api/pair` | **read** its one phone: `GET /api/me`, `status`, `live`, `alerts`, `events` |

| Status | When |
|---|---|
| `401` `{"detail": "Invalid or missing token"}` | no token, unknown token, or a dashboard replaced by a new one / a deleted phone |
| `403` `{"detail": "Not allowed"}` | a viewer token on a phone-only endpoint, or a reading whose `device_id` isn't the token's phone |

A phone only ever sees its own data; there is no endpoint that lists or reads other phones.

### `POST /api/register` *(mobile, first launch)*
Request: `{"device_id": "phone-a1b2c3", "device_name": "Chris's old phone"}` (`device_name` optional, ≤ 64 chars).
`201`: `{"device_id": "...", "device_token": "...", "created_at": "..."}`. The phone saves the token; it's shown only once.
`409` `{"detail": "Device already registered"}`: the ID is taken (e.g. from an earlier install); the phone picks a new ID and registers again.

### `POST /api/me/pairing-code` *(mobile)*
No body. `201`: `{"code": "482913", "expires_at": "..."}`: 6 digits, **works once**, for **10 min** (`PAIRING_CODE_TTL_MINUTES`).

### `POST /api/pair` *(dashboard, no token)*
Request: `{"code": "482913"}`. `200`: `{"device_id": "...", "viewer_token": "..."}`. The dashboard keeps the token for the tab session.
- `400` `{"detail": "Invalid or expired code"}`: wrong, used or expired.
- `429` `{"detail": "Too many attempts. Try again in a minute."}` with `Retry-After` (seconds): after **5** wrong codes within
  **60 s** from one address, every further attempt gets it, even with the right code, until the window has passed
  (`PAIR_RATE_LIMIT_MAX_FAILURES`, `PAIR_RATE_LIMIT_WINDOW_SECONDS`).
- **One dashboard per phone:** pairing a new dashboard replaces the old one, whose viewer token then gets `401` (it lands on
  the pairing screen). A new code for the same phone shows the same data.

### `GET /api/me` *(both)*, `PATCH /api/me` *(mobile)*
`200`:
```json
{ "device_id": "phone-a1b2c3", "device_name": "Chris's old phone", "created_at": "...", "last_seen": "...",
  "paired_dashboards": 1, "dashboard_paired_at": "..." }
```
- `paired_dashboards`: 0 or 1. `dashboard_paired_at`: when the current dashboard was paired; changes when a new one replaces it
  (that's how the phone notices a replacement while a code is showing).
- `PATCH` with `{"device_name": "..."}` renames the phone (empty or `null` clears it); same response.

### `DELETE /api/me` *(mobile)*: Delete my data
Deletes the phone and **everything** stored about it: readings, the GPS trail, alerts, guarding sessions, pairing codes and the
dashboard's token. `204`, no body. Afterwards the phone's and the dashboard's tokens get `401`, and the ID is free again.
- Only the **phone's own token** can delete (`403` for a viewer token).
- The app asks for confirmation, then forgets its ID and token and registers again as a new phone (to be paired again).
- Other phones are never touched.

---

## Readings

### `POST /api/me/events` *(mobile)*: send one accelerometer reading
Request: [`mobile/post_event_request.json`](mobile/post_event_request.json)
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

| Field | Type | Required | Notes |
|---|---|---|---|
| `device_id` | string | yes | must be the token's phone (`403` otherwise) |
| `event_type` | string | yes | `"accelerometer"` |
| `value` | number | yes | magnitude `sqrt(x² + y² + z²)`, `>= 0` |
| `unit` | string | yes | `"g"` |
| `timestamp` | string | yes | UTC, when the reading was taken |
| `axes` | object | yes | raw `x`, `y`, `z` (numbers, in g) |
| `location` | object | no | live position; sent during `ALERT` (and by the app's Send reading in the Developer section) |

Responses:
- `201`: [`mobile/post_event_response.json`](mobile/post_event_response.json): `{"id": 152, "device_id": "...", "received_at": "...", "stored": true}`.
  `stored: false` with `id: 0` means the reading was checked (detection ran) but not kept ([What the backend stores](#what-the-backend-stores)). Both are a success.
- `422`: validation error. **Do not retry.**
- `5xx` / network error: the phone doesn't retry readings while guarding; the next movement or heartbeat follows anyway.

### `GET /api/me/events?limit=50` *(both)*: kept readings, newest first
`limit` default 50, min 1, max 500 (outside → `422`). `200`: [`frontend/events.json`](frontend/events.json): `{"events": [...]}`.
Each event is the request fields plus `id`, `received_at` and an optional `snapshot_reason` (`armed`, `picked_up`, `gps_update`,
`disarmed`): a history of what happened, not a continuous recording. For the latest value, use `live`.

### `GET /health`, `GET /ready`
`/health`: `200` `{"status": "ok"}` (Railway health check). `/ready`: `200` once the database answers, `503` otherwise.

### Sample readings
**Real readings** from our test phones, relabelled as one phone, `demo-phone-01`. `events.json` has 19 of them
(18:57:32–19:05:14Z), newest first: held in the hand → shaken → shaken violently → put down on a table.

| Phone was… | Magnitude | Example |
|---|---|---|
| Held in the hand | 0.97–1.01 g | #152: x=-0.033 y=-0.645 z=-0.771 → 1.006 |
| Shaken | 1.8–3.5 g | #159: x=-3.193 y=-1.261 z=-0.596 → 3.484 |
| Shaken violently | 5.5–6.7 g | #172: x=-0.727 y=-0.595 z=-6.675 → 6.740 |
| Lying on a table, face up | 0.92–0.98 g | #188: x=0.022 y=-0.029 z=-0.984 → 0.984 |

- Lying face up, an iPhone reports **z ≈ -1** (x, y ≈ 0.03: the camera bump tilts it by ~2°).
- A still phone does **not** read exactly 1.000 g (camera bump, table vibration; the sensor is fine).

---

## Guarding

Start guarding → the phone sends readings when it moves (plus a heartbeat) → the **backend** compares each reading with the
resting position and creates an **alert** → the dashboard shows it. The phone never decides itself whether it was moved.

### States
| State | Meaning | How you get there |
|---|---|---|
| `DISARMED` | Not guarding | Start, or after stopping |
| `GUARDING` | Guarding, nothing happened yet | Start guarding |
| `ALERT` | Guarding and moved | The alert, while guarding |

**The alarm stays on:** once `ALERT`, it stays `ALERT` until stopped, like a real alarm. Stopping always returns to `DISARMED`;
starting again begins a fresh session (`GUARDING`, no alert).

### `POST /api/me/arm` *(mobile)*: start guarding
Request: [`mobile/arm_request.json`](mobile/arm_request.json): the resting position, the average of the readings while the
phone lay still after the countdown.
```json
{ "timestamp": "2026-11-20T19:10:00Z", "axes": { "x": 0.022, "y": -0.029, "z": -0.984 } }
```
Optional `location`: where it was left (a fresh GPS fix asked for at Start guarding; left out without one).
- `200`: the new status ([`mobile/status_guarding.json`](mobile/status_guarding.json)). Starting while already guarding starts a new session.
- `409` `{"detail": "Pair a dashboard first: it's where the alarm shows up."}` while no dashboard is paired.
  `REQUIRE_DASHBOARD_TO_ARM` (default `true`) turns the rule off, e.g. for tests.
- `422`: missing/invalid `axes` or `timestamp`.

The app shows **either** the pairing step **or** Start guarding: with no dashboard, only "Pair a dashboard first" and the code;
once one is paired, only Start guarding (Settings → Dashboard → Replace pairs a different one).

### `POST /api/me/disarm` *(mobile)*: stop guarding
Sent after the owner enters the right PIN on the phone (the PIN never leaves the phone). No body.
`200`: the new status ([`mobile/status_disarmed.json`](mobile/status_disarmed.json)). Stopping when not guarding is fine (same response).

### What the phone sends while guarding
| When | Sends |
|---|---|
| Right after starting | one reading |
| Direction turns **> 2°** from the last reading sent | a reading at once, at most 1 per second |
| Nothing sent for **30 s** | a heartbeat (the current reading) |
| In `ALERT` | the same, with the live `location` on every reading, plus a reading with a fresh GPS position every **5 s** |

A phone lying still sends one every 30 s, so `online` (5-minute window) stays true; no heartbeat means it went silent.
The phone checks `status` right after each movement reading and every 10 s, so it learns of an alert at once.
After an app restart it asks `status` once and, if still `GUARDING` or `ALERT`, carries on.

### Detection rule (backend)
On Start guarding, the backend saves the resting `axes`. Then, for each reading while `GUARDING`:

> angle between the reading's `axes` and the resting `axes` > **6°** → create **one** `picked_up` alert → state `ALERT`

- **Angle** = `acos( (a·b) / (|a| |b|) )` in degrees, where `a`, `b` are the x/y/z vectors. The phone uses the same formula.
- **One alert per session:** while `ALERT`, readings create no more alerts.
- Readings while `DISARMED` never create alerts.
- Real data: lying on a table ~0.2–0.6°; writing or tapping on the table up to 4.5°; held level in the hand or carried off,
  past 6° within 1–2 s (a hand never holds it perfectly level); picked up normally 25–57°.

### What the backend stores
Every reading is checked for an alert, but only these are kept as rows: **start**, the **picked-up** reading, **stop**, and
during `ALERT` a GPS trail (the first fix at once, then a new one only after **30 s and 25 m**, or the fixes' accuracy if larger;
`ALERT_GPS_INTERVAL_SECONDS` / `ALERT_GPS_DISTANCE_METERS`). Everything else is answered `201` with `stored: false` and only
held in memory as the phone's latest reading (for `live`, `last_seen`, `online` and the live location).

Example: guarding for an hour, then taken and carried off for 10 minutes.
| | Sent by the phone | Stored as rows |
|---|---|---|
| 50 min lying still | ~100 heartbeats | 1 (`armed`) |
| Picked up | 1 | 1 (`picked_up`, with the first GPS fix) |
| 10 min on the move | up to ~600 (movement, at most 1/s) + a GPS position every 5 s | ~20 (`gps_update`, at most one per 30 s) |
| Stopped | (disarm request) | 1 (`disarmed`) |
| **Total** | **~700** | **~23** |

The number of rows depends on what **happened**, not on how often the phone sends.

### `GET /api/me/status` *(both)*
`200`: one of [`status_disarmed.json`](frontend/status_disarmed.json), [`status_guarding.json`](frontend/status_guarding.json), [`status_alert.json`](frontend/status_alert.json).
```json
{
  "device_id": "demo-phone-01",
  "state": "ALERT",
  "armed_at": "2026-11-20T19:10:00Z",
  "last_seen": "2026-11-20T19:10:30Z",
  "online": true,
  "last_alert": { "id": 1, "type": "picked_up", "timestamp": "2026-11-20T19:10:12Z", "...": "see alerts below" }
}
```
- `armed_at`: `null` when `DISARMED`. `last_alert`: the current session's alert, `null` if none.
- `location` (optional): the position sent with Start guarding ("Where you left your phone"). Missing when `DISARMED` or none was sent.
- `last_location` (optional): the newest position from any reading. During `ALERT`, where the phone is now; otherwise the last known one.
- `last_seen`: when the phone was last heard from: its newest reading, or a rename or pairing.
  `online`: `last_seen` (by arrival at the server) within the last 5 minutes.

### `GET /api/me/live` *(both)*
The latest reading the backend received (same shape as an event, `id` 0 if it wasn't kept), or `null` if none arrived in the
last 10 minutes. Memory only: gone after a backend restart. The dashboard polls it every second while guarding for the 3D phone.

### `GET /api/me/alerts?limit=20` *(both)*
Newest first, all sessions. `limit` default 20, min 1, max 200. `200`: [`frontend/alerts.json`](frontend/alerts.json):
```json
{
  "device_id": "demo-phone-01",
  "alerts": [
    { "id": 1, "device_id": "demo-phone-01", "type": "picked_up", "timestamp": "2026-11-20T19:10:12Z",
      "angle_deg": 38.5, "value": 0.973, "unit": "g", "axes": { "x": 0.02, "y": -0.628, "z": -0.744 } }
  ]
}
```
| Field | Notes |
|---|---|
| `type` | `picked_up` |
| `timestamp` | `timestamp` of the reading that triggered it |
| `angle_deg` | angle from the resting position, 1 decimal |
| `value`, `unit`, `axes` | the triggering reading |

### Sample session
Real readings, re-timed into one story so every state appears:

| Time (UTC) | What happened | Reading | Result |
|---|---|---|---|
| 19:10:00 | Started guarding, lying on a table | #188 (0.022, -0.029, -0.984) | `GUARDING` |
| 19:10:05 | Still on the table | #186, 0.2° | no alert |
| 19:10:12 | Picked up | #143, 38.5° | `picked_up` → `ALERT` |
| 19:10:20 | Shaken | #159, 80.7° | no new alert (already `ALERT`) |
| 19:10:30 | Flipped over | #170, 170.7° | no new alert, `last_seen` = 19:10:30 |

The alert values in the samples were computed with exactly the rule above, so the backend tests use them as expected output.

---

## Running it
- **Cloud:** Railway runs the root `Dockerfile` (API + landing page + dashboard at `/dashboard/`) with Railway PostgreSQL.
  The phone and the dashboard switch servers through env vars only; no code changes.
- **Local:** `docker-compose.yml` (PostgreSQL + app, optionally Metro for Expo Go), or the backend on its own.
  The phone app can also run against `mobile/dev-server/`, a dummy API that follows this contract.
- **CORS:** the backend allows the dashboard's origin (`CORS_ORIGINS`).

## Not built (ideas)
- More alert types (`tipped_over`, `shaken`), tested on real phones first; sound and vibration on the guarded phone; browser notifications.
- Lifting level and turning flat on the table: the phone would also watch for a jolt and for turning (gyroscope) and the backend
  would raise `lifted` / `turned`. Today 6° catches a level lift within 1–2 s; turning flat isn't detected.
- An entry delay, so picking the phone up to type the PIN can't raise the alarm.
