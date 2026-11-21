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
The dashboard is where the alert **shows up**, so this is the demo moment. Full spec: [`API_CONTRACT.md` → v1](../API_CONTRACT.md#v1-guard).

### New API calls (add to `src/api.ts`, same fixture/API switch as v0)
| Function | Endpoint | Fixture |
|---|---|---|
| `getStatus(deviceId)` | `GET /api/devices/{device_id}/status` | `status_alert.json` (switch to `status_guarding.json` / `status_disarmed.json` to test each state) |
| `getAlerts(deviceId, limit = 20)` | `GET /api/devices/{device_id}/alerts` | `alerts.json` |

`device_id` comes from the newest reading in `GET /api/events` (v0).

### What to build
1. **Big status** at the top, readable from across the room:
   | State | Look | Text |
   |---|---|---|
   | `DISARMED` | grey | "Not guarding" |
   | `GUARDING` | green | "Guarding since 20:10" |
   | `ALERT` | **red**, pulsing | "Picked up at 20:10:12" (from `last_alert`) |
2. **Alert history**: newest first, one row per alert (one per armed session): time, "Picked up", and `angle_deg`°. v2 adds more types.
3. **Chart**: the v0 magnitude chart, with a shaded band from `armed_at` and a marker at each alert's `timestamp`.
4. **Phone card**: `online` and `last_seen` now come from `status`.
5. **Polling**: status every **1 s** while `GUARDING` or `ALERT` (so the alert appears fast), every `VITE_POLL_SECONDS` otherwise.
6. **Location** (optional): `status` can carry `location` (where it was armed) and `last_location` (live, sent after an alert).
   While `GUARDING`, show "Armed at lat, lon". On `ALERT`, show `last_location` **in red** as "Now at lat, lon (±m)" (a map pin is a bonus).
   Hide it when the fields are missing; the fixtures don't have them yet.

### Done when (v1)
- [ ] All three states render from the fixtures; `ALERT` is impossible to miss
- [ ] Alert history and chart marker from `alerts.json`
- [ ] With the real API: arm the phone, pick it up → the page turns red within ~2 s

## Integration
1. Backend runs locally → `VITE_API_URL=http://localhost:8000` (or the backend laptop's IP; every laptop on the WiFi has its own), restart `npm run dev`.
2. If you get CORS errors, ask the backend person to add your origin (`http://localhost:5173`) to `CORS_ORIGINS`.
3. Cloud: build with `VITE_API_URL=<Azure backend URL>` and deploy `dist/` to Azure Static Web Apps. Nothing in the code changes.

## Coming next (not yet)
- **v2**: browser notification + sound when the state turns `ALERT`.
- **v3, my phone, my data**: the pairing screen (enter a 6-digit code from the phone). Turn on the one you already built with `VITE_PAIRING=true`.

## Git workflow
- Branches `frontend/<feature>` (e.g. `frontend/phone-card`, `frontend/chart`), merged to `main` often.
- Small commits with clear messages, one per feature/step.
- Only touch `codelap-dashboard/` and `contracts/frontend/`. API changes go through a contract PR approved by all three.
