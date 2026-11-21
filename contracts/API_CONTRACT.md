# API Contract: Mobile ↔ Backend ↔ Frontend

**The app:** an old phone that guards your stuff. See [`IDEA.md`](IDEA.md).

| Version | Goal | Status |
|---|---|---|
| **v0** | Phone sends accelerometer readings → server stores them → dashboard shows them | mobile done |
| **v1** | **Guard:** arm the phone, the server detects when it's moved, the dashboard shows alerts | next |

```
[ Phone app ]  --readings, arm/disarm-->  [ Backend API ]  <-->  [ Database ]
                                                 ^
                                  readings, status, alerts
                                                 |
                                          [ Web dashboard ]
```

This is the **single source of truth** between the three teams. Each team builds against this file and the
guide + JSON samples in its own folder, with no dependency on the others, until integration.

```
contracts/
├── API_CONTRACT.md              # this file
├── IDEA.md                      # what we're building and why
├── mobile/
│   ├── MOBILE.md                # mobile guide
│   ├── post_event_request.json  # v0: what the phone sends
│   ├── post_event_response.json
│   ├── arm_request.json         # v1: arm the phone
│   ├── status_guarding.json     # v1: arm response
│   └── status_disarmed.json     # v1: disarm response
├── backend/
│   ├── BACKEND.md               # backend guide
│   └── *.json                   # all samples, for seeding + tests
└── frontend/
    ├── FRONTEND.md              # frontend guide
    ├── events.json              # v0: GET /api/events
    ├── status_disarmed.json     # v1: GET …/status, one per state
    ├── status_guarding.json
    ├── status_alert.json
    └── alerts.json              # v1: GET …/alerts
```

**Same file name = same content.** A JSON file that appears in more than one folder must stay identical in all of them.

**Changing the contract:** open a PR that touches only `contracts/`, updates every copy of a changed JSON file, and is approved by all three people. Never change a field name silently.

## Ownership

| Team | Folder | Talks to | Works independently by |
|---|---|---|---|
| Mobile | `mobile/` | `POST /api/events`, arm, disarm, status | Mock mode: returns the samples in `contracts/mobile/` |
| Backend | `backend/` | DB; serves all endpoints | Seeding and tests from `contracts/backend/`, fake-phone simulator |
| Frontend | `codelap-dashboard/` | `GET /api/events`, status, alerts | Fixture mode: reads the samples in `contracts/frontend/` |

Each team only edits its own folder, so there are no merge conflicts. Work on branches (`mobile/...`, `backend/...`, `frontend/...`) and merge to `main` often.

### Toolchain
| Team | Stack | Runtime |
|---|---|---|
| Mobile | Expo (React Native) + TypeScript | Node 26 LTS |
| Backend | FastAPI + PostgreSQL | Python 3.14.7 |
| Frontend | React + TypeScript (Vite) | Node 26 LTS |

Mobile and frontend each keep their own `package.json` / `node_modules`. There's no shared JS workspace, so one team's dependencies can't break the other's.

### Who owns what
| Path | Owner |
|---|---|
| `mobile/`, `contracts/mobile/` | Mobile |
| `backend/`, `tools/simulator/`, `docker-compose.yml`, `.dockerignore`, `contracts/backend/` | Backend |
| `codelap-dashboard/`, `contracts/frontend/` | Frontend |
| `contracts/API_CONTRACT.md`, `contracts/IDEA.md` + any JSON shared between folders | All three (PR + 3 approvals) |
| `infrastructure/`, `.github/workflows/`, `README.md`, `presentation/`, root `.gitignore` | Shared, after integration. Pick one owner per file when you start on it |

## General rules
- JSON, **snake_case** field names.
- All timestamps are **ISO 8601 UTC with `Z`**, e.g. `2026-11-20T18:45:00Z`. The phone sends UTC; the frontend converts to local time for display.
- `device_id`: generated once by the phone and saved, lowercase `[a-z0-9-]`, 3–64 chars. We use a single phone for now.
- Accelerometer values are in **g** (1 g ≈ 9.81 m/s²), gravity included.
  A phone lying still reads a magnitude of about **1.0 g**; moving or shaking it changes the value.
- Errors use the FastAPI default shape: `{"detail": "..."}`.
- Base URL comes from config, never hard-coded: mobile `EXPO_PUBLIC_API_URL`, frontend `VITE_API_URL`.
- **No auth yet.** Anyone who knows the URL can send and read. Fine for dummy data and dev; pairing comes in v3 (see [`IDEA.md`](IDEA.md)).

---

## v0: readings

### `POST /api/events`: send one accelerometer reading *(mobile)*
Header: `Content-Type: application/json`. Request: [`mobile/post_event_request.json`](mobile/post_event_request.json)

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
| `device_id` | string | yes | see rules |
| `event_type` | string | yes | `"accelerometer"` |
| `value` | number | yes | magnitude `sqrt(x² + y² + z²)`, `>= 0` |
| `unit` | string | yes | `"g"` |
| `timestamp` | string | yes | UTC, when the reading was taken |
| `axes` | object | yes | raw `x`, `y`, `z` (numbers, in g) |
| `location` | object | no | live position, same shape as the arm `location`. Sent by the manual Send button and by every reading while `ALERT` (the phone may be on the move) |

Responses:
- `201`: [`mobile/post_event_response.json`](mobile/post_event_response.json): `{"id": 152, "device_id": "demo-phone-01", "received_at": "...", "stored": true}`.
  `stored: false` with `id: 0` means the reading was checked (detection ran) but not kept: the backend keeps only state changes ([v1 → What the backend stores](#what-the-backend-stores)). Both are a success.
- `422`: validation error (FastAPI default body). **Do not retry.**
- `5xx` / network error: **retry** up to 3x with backoff of 1 s, 2 s, 4 s, then show "failed" in the app.

### `GET /api/events?limit=50`: stored readings, newest first *(frontend)*
`limit` default 50, min 1, max 500 (outside → `422`).
`200`: [`frontend/events.json`](frontend/events.json): `{"events": [...]}`. Each event is the request fields plus `id` and `received_at`.
Empty list before the first reading. Since v1 these are the **kept** readings only, each with an optional `snapshot_reason`
(`armed`, `picked_up`, `gps_update`, `disarmed`): a history of what happened, not a continuous recording. For the latest value, use `live` (v1).

### `GET /health`
`200`: `{"status": "ok"}`. Used by Azure and the CD smoke test.

### v0 dummy data
**These are real readings** from our test phones (captured with the mobile dummy server), relabelled as one phone, `demo-phone-01`.
`events.json` has 19 of them (18:57:32–19:05:14Z), newest first. The story: held in the hand → shaken → shaken violently → put down on a table.

| Phone was… | Magnitude | Example |
|---|---|---|
| Held in the hand | 0.97–1.01 g | #152: x=-0.033 y=-0.645 z=-0.771 → 1.006 |
| Shaken | 1.8–3.5 g | #159: x=-3.193 y=-1.261 z=-0.596 → 3.484 |
| Shaken violently | 5.5–6.7 g | #172: x=-0.727 y=-0.595 z=-6.675 → 6.740 |
| Lying on a table, face up | 0.92–0.98 g | #188: x=0.022 y=-0.029 z=-0.984 → 0.984 |

- Lying face up, an iPhone reports **z ≈ -1** (x, y ≈ 0.03: the camera bump tilts it by ~2°).
- A still phone does **not** read exactly 1.000 g: this one read 0.92–0.98 on a table (camera bump, table vibration; the sensor is fine).
- Each `value` is the magnitude of its x/y/z (within rounding). `received_at` equals `timestamp` (the log only had one time).
- To refresh the samples, capture new readings with `mobile/dev-server/` and update them through a contract PR.

### Done when (v0)
- Mobile: live x/y/z on a real phone; tap Send → the JSON matches `post_event_request.json` and the server answers 201.
- Backend: `POST` stores a reading; `GET` returns it in the `events.json` shape.
- Frontend: latest reading + chart + table from `events.json`, then from the real API.
- Integrated: tap Send on the phone, and the reading appears on the dashboard.

---

## v1: Guard

Arm the phone → it sends readings when it moves (plus a heartbeat) → the **backend** compares each reading with the armed position and creates **alerts** → the dashboard shows them.

### What the phone sends while armed
Only when something changes, plus a heartbeat (about 120 readings an hour for a phone lying still, so little battery and data):
| When | Sends |
|---|---|
| Right after arming | one reading |
| Direction turns **> 2°** from the last reading sent | a reading at once, at most 1 per second |
| Nothing sent for **30 s** | a heartbeat (the current reading) |
| In `ALERT` | the same, with the live `location` on every reading, plus a reading whenever the location changes |

Readings are the same `POST /api/events` as in v0. A phone lying still sends one every 30 s, so `online` (5-minute window) stays true; no heartbeat means it went silent.

### What the backend stores
Every reading is checked for an alert, but only these are kept as rows: **arm**, the **picked-up** reading, **disarm**, and during `ALERT` a GPS trail
(the first fix at once, then a new one only after **30 s and 25 m**, or the fixes' accuracy if larger; set with `ALERT_GPS_INTERVAL_SECONDS` / `ALERT_GPS_DISTANCE_METERS`).
Everything else is answered `201` with `stored: false` and only held in memory as the device's latest reading (for `live`, `last_seen` and `online`).
The phone sends less (battery, data) and the backend keeps less (database): both together.
The phone shows nothing while armed (a black screen that looks dead) and disarms only with a PIN on the phone; the **dashboard** is where the alert shows up.

### Why this doesn't flood the database
Sending a reading and storing it are two different things. The phone sends whenever the dashboard needs to see something (so the 3D phone
and the map follow a moving phone), but the backend writes a row only for a **state change** or a **GPS fix that's 30 s and 25 m newer**.
Everything else replaces the one in-memory "latest reading" per phone, which `live` serves.

Example: armed for an hour, then taken and carried off for 10 minutes.
| | Sent by the phone | Stored as rows |
|---|---|---|
| 50 min lying still | ~100 heartbeats | 1 (`armed`) |
| Picked up | 1 | 1 (`picked_up`, with the first GPS fix) |
| 10 min on the move | up to ~600 (movement, at most 1/s) + location changes | ~20 (`gps_update`, at most one per 30 s) |
| Disarmed | (disarm request) | 1 (`disarmed`) |
| **Total** | **~700** | **~23** |

The number of rows depends on what **happened** (arm, alert, distance travelled, disarm), not on how often the phone sends.

### States
| State | Meaning | How you get there |
|---|---|---|
| `DISARMED` | Not guarding | Start, or after disarm |
| `GUARDING` | Armed, nothing happened yet | Arm |
| `ALERT` | Armed and moved | The alert, while guarding |

**The alarm stays on:** once `ALERT`, it stays `ALERT` until disarmed, like a real alarm. Disarm always returns to `DISARMED`; arming again starts a fresh session (`GUARDING`, no alert).

### Detection rule (backend)
On **Arm**, save the resting position: the `axes` from the arm request. Then, for each reading received while `GUARDING`:

> angle between the reading's `axes` and the resting `axes` > **6°** → create **one** `picked_up` alert → state `ALERT`

- **Angle** = `acos( (a·b) / (|a| |b|) )` in degrees, where `a`, `b` are the x/y/z vectors.
- **One alert per session:** while `ALERT`, readings are stored but create no more alerts.
- Readings received while `DISARMED` are stored as in v0 but never create alerts.
- Real data: lying on a table ~0.2–0.6°; writing or tapping on the table up to 4.5°; held level in the hand or carried off,
  past 6° within 1–2 s (a hand never holds it perfectly level); picked up normally 25–57°. 6° catches a phone carried away
  level, which 15° missed, and stays clear of writing on the table.
- v1 starts with `picked_up` only. The other alert types in [`IDEA.md`](IDEA.md) (tipped over, shaken) come in v2, after more testing.

### `POST /api/devices/{device_id}/arm` *(mobile)*
Request: [`mobile/arm_request.json`](mobile/arm_request.json): the resting position. The phone sends it once it has been put down and lain still (average of the still readings).
```json
{ "timestamp": "2026-11-20T19:10:00Z", "axes": { "x": 0.022, "y": -0.029, "z": -0.984 } }
```
Optional `location`: where the phone was armed, `{"lat": 46.77, "lon": 23.59, "accuracy_m": 12}` (`accuracy_m` may be `null`). Left out without a GPS fix. Store it with the session; if it's there, `status` returns it.
`200`: the new status ([`mobile/status_guarding.json`](mobile/status_guarding.json)). Arming while already armed starts a new session.
`422`: missing/invalid `axes` or `timestamp`.

### `POST /api/devices/{device_id}/disarm` *(mobile)*
Sent after the owner enters the right PIN on the phone. No body. `200`: the new status ([`mobile/status_disarmed.json`](mobile/status_disarmed.json)). Disarming when already disarmed is fine (same response).

### `GET /api/devices/{device_id}/status` *(frontend; mobile while armed)*
`200`: one of [`status_disarmed.json`](frontend/status_disarmed.json), [`status_guarding.json`](frontend/status_guarding.json), [`status_alert.json`](frontend/status_alert.json).
```json
{
  "device_id": "demo-phone-01",
  "state": "ALERT",
  "armed_at": "2026-11-20T19:10:00Z",
  "last_seen": "2026-11-20T19:10:30Z",
  "online": true,
  "last_alert": { "id": 1, "type": "picked_up", "timestamp": "2026-11-20T19:10:12Z", "...": "see alert below" }
}
```
- `armed_at`: `null` when `DISARMED`. `last_alert`: the current session's alert, `null` if none.
- `location` (optional): the location sent with Arm. Missing when `DISARMED` or when the phone sent none.
- `last_location` (optional): the `location` of the newest reading that had one. During `ALERT`, this is where the phone is now.
- `online`: last reading arrived within the last 5 minutes. `last_seen`: `timestamp` of the newest reading.
- `404` `{"detail": "Device not found"}` if the phone never sent a reading or armed.
- The dashboard gets `device_id` from the newest reading in `GET /api/events`.

### `GET /api/devices/{device_id}/live` *(frontend)*
The latest reading the backend received from this phone (same shape as an event, `id` 0 if it wasn't kept), or `null` if none arrived in the last 10 minutes.
Held in memory only: not history, gone after a backend restart. `404` if the phone is unknown.

### `GET /api/devices/{device_id}/alerts?limit=20` *(frontend)*
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
| `type` | `picked_up` (more types in v2) |
| `timestamp` | `timestamp` of the reading that triggered it |
| `angle_deg` | angle from the resting position, 1 decimal |
| `value`, `unit`, `axes` | the triggering reading |

### v1 dummy data: one demo session
Real readings, re-timed into one story so every state appears:

| Time (UTC) | What happened | Reading | Result |
|---|---|---|---|
| 19:10:00 | Armed lying on a table | #188 (0.022, -0.029, -0.984) | `GUARDING` |
| 19:10:05 | Still on the table | #186, 0.2° | no alert |
| 19:10:12 | Picked up | #143, 38.5° | `picked_up` → `ALERT` |
| 19:10:20 | Shaken | #159, 80.7° | no new alert (already `ALERT`) |
| 19:10:30 | Flipped over | #170, 170.7° | no new alert, `last_seen` = 19:10:30 |

The alert values in the samples were computed with exactly the rule above, so backend tests can use them as expected output.

### Done when (v1)
- Mobile: Arm, disarm with the PIN; arms only once the phone lies still; while armed, sends on movement plus a 30 s heartbeat; black stealth screen.
- Backend: arm/disarm/status/alerts match the samples; the demo session above produces exactly 1 alert.
- Frontend: big DISARMED / GUARDING / ALERT status and the alert history, from the samples, then from the real API.
- Integrated: arm the phone, pick it up, and the dashboard turns red within ~2 seconds (the phone stays black).

---

## Delete my data
With pairing, every request carries the phone's token (`Authorization: Bearer <device_token>`) and the paths are under `/api/me`
(this contract still describes the paths before pairing; to be updated).

### Arming needs a paired dashboard
The dashboard is where the alarm shows up, so a phone without one can't be armed.
- `POST /api/me/arm` answers `409` `{"detail": "Pair a dashboard first: it's where the alarm shows up."}` while no dashboard is paired.
  The backend setting `REQUIRE_DASHBOARD_TO_ARM` (default `true`) turns the rule off, e.g. for tests.
- `GET /api/me` (and `PATCH /api/me`) also return `paired_dashboards`: how many dashboards follow this phone.
- The app shows **either** the pairing step **or** Arm: with no dashboard, only "Pair a dashboard first" and the code;
  once one is paired, only Arm (more dashboards are added under Settings). While a code is showing, it checks every
  few seconds whether a dashboard has used it.
- Deleting the phone's data removes its dashboards too, so it has to be paired again before arming.

### `DELETE /api/me` *(mobile)*
Deletes the phone and **everything** stored about it: readings, the GPS trail, alerts, armed sessions, pairing codes and every
paired dashboard's token. `204`, no body. Afterwards the phone's token and its dashboards' tokens get `401`, and the ID is free again.
- Only the **phone's own token** can delete (`403` for a dashboard's read-only token, `401` without a token).
- The app asks for confirmation, then forgets its ID and token and registers again as a new phone.
- Other phones are never touched.

## Integration phases
1. **Independent**: everyone works against the samples.
2. **Local integration**: backend runs on one laptop (Docker Compose + Postgres), and the frontend and phone point at it.
   If the WiFi blocks phone → laptop traffic, use the phone's hotspot.
3. **Cloud**: backend on Azure, and the URLs switch via env vars only. No code changes should be needed.

CORS: the backend must allow the frontend's origin (localhost dev port plus the deployed URL).

## Next versions (not part of the contract yet)
- **v2:** more alert types (`tipped_over`, `shaken`, see [`IDEA.md`](IDEA.md)), tested on real phones first; sound and vibration on the guarded phone; browser notification on the dashboard.
- **v2, lifting and turning:** today a level lift or a flat turn on the table raises no alarm, because neither changes the direction of gravity.
  The phone would watch for a jolt (accelerometer magnitude) and for turning (gyroscope) between sends, report them in a `motion` field,
  and the backend would raise `lifted` / `turned`. The limits get measured on real phones first, so a bumped table doesn't count.
- **v3, my phone, my data:** pairing code, so only your dashboard sees your phone and its alerts.
