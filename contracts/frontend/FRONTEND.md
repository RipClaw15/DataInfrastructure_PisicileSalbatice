# Frontend: Implementation Guide (contract v0 + v1)

Everything the frontend developer needs. If anything here differs from [`API_CONTRACT.md`](../API_CONTRACT.md), **the contract wins**.

## The task
**The app:** an old phone that guards your stuff. Arm it, walk away, and the dashboard alerts you if it's moved (see [`IDEA.md`](../IDEA.md)).

**v0 (first) is only the basic task**:
the phone sends accelerometer readings, the backend stores them, and **the web dashboard shows them**.
The dashboard is what the judges look at, so it must make it obvious that real data is flowing.

```
[ Phone app ]  -->  [ Backend API ]  <-->  [ Database ]
                          ^
                          |  GET /api/events   (JSON)
                          |
                   [ Web dashboard ]  (you)
```

You work **independently from the backend** until integration: the dashboard reads the sample JSON file instead of calling the API.

## Coming from the earlier version
Your dashboard was built from the earlier **pairing** version of this guide. Pairing is still planned, for **v3**, so don't delete anything:

1. **Pairing off for now:** add `VITE_PAIRING=false` (the default) and skip `PairingScreen` and the token when it's false.
   All the pairing code stays; `VITE_PAIRING=true` brings it back in v3.
2. **New endpoints:** read `GET /api/events` instead of `/api/me` and `/api/me/events` (v0), then `status` and `alerts` (v1). No token needed.
3. **Samples from `contracts/frontend/`**, not `local-docs/`: `local-docs/` is gitignored, so it only exists on your laptop and the build fails everywhere else.
4. **Vite `server.fs.allow`:** use the repo root, `path.resolve(__dirname, '..')`. `'../..'` points one folder above the repo.

Your components (phone card, latest reading, chart, table, polling) carry over as they are.

## Your folder
`codelap-dashboard/` (plus this guide and its sample in `contracts/frontend/`).

## Stack
| Piece | Choice |
|---|---|
| Runtime | **Node 26 LTS** (v26.13.1). Pin it in `codelap-dashboard/.nvmrc` (`26`). Node 27 is still alpha; don't use it yet |
| Framework | **React** + TypeScript, created with Vite (`npm create vite@latest codelap-dashboard -- --template react-ts` at the repo root) |
| Chart | Recharts or Chart.js (pick one, keep it simple) |
| Styling | Plain CSS or Tailwind. Keep it clean and readable on a projector |
| Hosting (later) | Azure Static Web Apps (serves the `dist/` build) |

## Config
`codelap-dashboard/.env` (gitignored); commit `.env.example`:

| Variable | Example | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL. **Empty → fixture mode.** |
| `VITE_POLL_SECONDS` | `3` | How often to refresh in API mode |
| `VITE_PAIRING` | `false` | Show the pairing screen. Keep `false` until v3 |

Vite bakes these in at **build time**. For Azure, they're set in the build pipeline.

## Data source: fixture vs API
Put data access in **one module** (e.g. `src/api.ts`) with one function: `getEvents(limit = 50)`.
If `VITE_API_URL` is empty, return the sample; otherwise `fetch` the API. Components never know which one is used.
Show a small "FIXTURE DATA" / "LIVE: <url>" label in the header.

The sample is `contracts/frontend/events.json`. Import it from there (`../../contracts/frontend/events.json` from `codelap-dashboard/src/`).
If Vite's dev server refuses files outside `codelap-dashboard/`, add the repo root to `server.fs.allow` in the Vite config.
**Don't copy it into `codelap-dashboard/`**, so it always matches the contract.

## API you consume

### `GET {VITE_API_URL}/api/events?limit=50`
Sample: `events.json`
```json
{
  "events": [
    { "id": 152, "device_id": "demo-phone-01", "event_type": "accelerometer", "value": 1.006, "unit": "g",
      "timestamp": "2026-11-20T18:57:59Z", "axes": { "x": -0.033, "y": -0.645, "z": -0.771 },
      "received_at": "2026-11-20T18:57:59Z" }
  ]
}
```
- Newest first. `value` = magnitude in g; `axes` = raw x/y/z in g.
- `timestamp` = when the phone took the reading; `received_at` = when the backend got it.
- `events` is empty before the first reading.
- Errors: backend down → network error.

### Understanding the numbers (for labels and the chart)
- Values are in **g**, gravity included. A phone lying still has magnitude ≈ **1 g** (in practice 0.92–1.0, not exactly 1.0).
- Movement shows as the magnitude moving away from 1.0. Held in the hand it wobbles between ~0.85 and 1.10; real shakes reach **2–3.5 g** and violent ones up to **~7 g**, so let the chart's y axis auto-scale (don't fix it to 0–2).
- Good visual: a horizontal reference line at 1.0 g labelled "≈ still" (a real phone on a table sits slightly below it).

## What to build
1. **Header**: app name, data source label (FIXTURE / LIVE), "last refreshed" time.
2. **Phone card**: `device_id` of the latest reading, **online/offline badge** (online = latest reading less than 5 min old), "last reading 2 min ago".
3. **Latest reading card**: big magnitude value + unit, x/y/z, "taken at 20:57:59 (3 s ago)" (18:57:59Z shown in Romanian time, UTC+2).
4. **Chart**: magnitude over time (x axis = `timestamp`, oldest → newest; remember the API is newest-first), with the 1.0 g reference line. Optional toggle to also show x/y/z.
5. **Table**: time, x, y, z, magnitude, received at. Newest on top.
6. **Empty state**: no readings → "No readings yet. Tap Send on the phone."
7. **Error state**: backend unreachable → a visible banner ("Backend unreachable, retrying…"), keep showing the last data.

### Behavior
- **Times**: API sends UTC (`...Z`). Display in the viewer's **local time**; relative times ("3 s ago") update every second.
- **Polling** (API mode only): refresh every `VITE_POLL_SECONDS`. New readings should appear without a page reload. That's the demo moment.
- Format numbers with 3 decimals.
- Must be readable on a projector: large fonts for the latest value, good contrast.

### Seeing live data before the phone app is ready
Once the backend runs, the backend person's **simulator** (`tools/simulator/`) acts as a fake phone and posts readings every second
(`still`, `shaking` or `mixed`). Point `VITE_API_URL` at the backend and you'll see the chart move.

## Done when (v0)
- [ ] `npm run dev` in fixture mode shows the phone card, latest reading, chart and table from `events.json`
- [ ] Empty state and backend-down banner work
- [ ] Switching `VITE_API_URL` to the backend shows real data with no code changes
- [ ] New readings (simulator or phone) appear within a few seconds via polling
- [ ] `npm run build` succeeds (this runs in CI)

## v1: Guard
The dashboard is where the alert **shows up**, so this is the demo moment. It's the **only** place: the guarded phone stays black (it looks dead) and is disarmed with a PIN on the phone, so the dashboard stays read-only. Full spec: [`API_CONTRACT.md` → v1](../API_CONTRACT.md#v1-guard).

### New API calls (add to `src/api.ts`, same fixture/API switch as v0)
| Function | Endpoint | Fixture |
|---|---|---|
| `getStatus(deviceId)` | `GET /api/devices/{device_id}/status` | `status_alert.json` (switch to `status_guarding.json` / `status_disarmed.json` to test each state) |
| `getAlerts(deviceId, limit = 20)` | `GET /api/devices/{device_id}/alerts` | `alerts.json` |
| `getLive(deviceId)` | `GET /api/devices/{device_id}/live` | the newest reading in `events.json` (alert), or the one closest to `armed_at` |

`device_id` comes from the newest reading in `GET /api/events` (v0).

### What to build
The owner glances at it to answer three questions: is my stuff safe, since when, where is it. Plain words, no sensor terms in the main view.

1. **Status** at the top, readable from across the room, with a **3D phone** on a table:
   | State | Look | Text |
   |---|---|---|
   | `DISARMED` | grey phone lying flat | "Not guarding" + "Arm the phone in the StayPut app and put it on your stuff." |
   | `GUARDING` | aqua phone where it lies | "Your stuff is safe" + "If it's moved, you'll see it here." |
   | `ALERT` | red phone, tilted as measured, a dashed outline where it lay | "Your phone was picked up" + time, and that the alarm stays on until disarmed with the PIN |

   The phone's pose comes from a reading's `axes` (the gravity direction, so tilt only, not turning). Where it lay: the `armed` snapshot in
   `GET /api/events`. Where it is now: `GET /api/devices/{device_id}/live`, polled every 1 s while armed; the phone moves only when a new
   reading arrives. Below it: the angle between the two, "50° from where it lay".
2. **Strip** with two figures: **Phone** (Connected / Not connected, "Last heard from 2 min ago") and **Guarding for** ("4 h 22 min", since 11:57; "Off" when not guarding).
3. **Map**, always there: on `ALERT` the live `last_location`, "Where your phone is now", following it as it moves; while guarding,
   and in an alert before the first live location arrives, the armed `location`, "Where you left your phone". Not guarding: `last_location`,
   "Last known location" (e.g. from the last alert). No location at all: the world, without a pin, "No location yet"; it zooms in when the first one arrives.
4. **Activity**: a timeline, newest first: the alerts ("Picked up") and when the current session was armed, each with the time and "4 h ago".
5. **Sensor data**, closed by default: the g values, the magnitude chart and the readings table, for demos and debugging.
   `GET /api/events` returns only the **kept** readings (arm, picked up, GPS trail, disarm, with `snapshot_reason`), so the chart is a history, not a recording.
6. **Polling**: status and live every **1 s** while `GUARDING` or `ALERT` (so the alert appears fast), every `VITE_POLL_SECONDS` otherwise.

The landing page is at `/` and links to the dashboard at `/dashboard` (one app, one `npm run dev`). Colours are the shared tokens in
`src/index.css` (also used by the mobile app): ink-blue backgrounds, Sky Aqua `#54c3ea` as the accent and for "safe", alarm red `#f2545b` as the
only warm colour, amber `#f2b441` only for warnings. One typeface, Schibsted Grotesk; labels in sentence case.

### Done when (v1)
- [ ] All three states render from the fixtures (`/dashboard?state=alert|guarding|disarmed`); `ALERT` is impossible to miss
- [ ] The 3D phone lies flat while guarding and tilts on an alert, with the angle below it
- [ ] With the real API: arm the phone, pick it up → the page turns red within ~2 s; walk off → the map follows

## Integration
1. Backend runs locally → `VITE_API_URL=http://localhost:8000` (or the backend laptop's IP; every laptop on the WiFi has its own), restart `npm run dev`.
2. If you get CORS errors, ask the backend person to add your origin (`http://localhost:5173`) to `CORS_ORIGINS`.
3. Cloud: build with `VITE_API_URL=<Azure backend URL>` and deploy `dist/` to Azure Static Web Apps. Nothing in the code changes.

## Coming next (not yet)
- **v2**: browser notification + sound when the state turns `ALERT`; "Lifted" and "Turned" alerts (the phone will detect them, see `API_CONTRACT.md` → Next versions).
- **v3, my phone, my data**: the pairing screen (enter a 6-digit code from the phone). Turn on the one you already built with `VITE_PAIRING=true`.

## Git workflow
- Branches `frontend/<feature>` (e.g. `frontend/phone-card`, `frontend/chart`), merged to `main` often.
- Small commits with clear messages, one per feature/step.
- Only touch `codelap-dashboard/` and `contracts/frontend/`. API changes go through a contract PR approved by all three.
