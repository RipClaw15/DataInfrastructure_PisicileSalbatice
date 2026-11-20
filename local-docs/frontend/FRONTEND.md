# Frontend: Implementation Guide (contract v0, sensor check)

Everything the frontend developer needs. If anything here differs from [`API_CONTRACT.md`](../API_CONTRACT.md), **the contract wins**.

## The app in one paragraph
We're building a personal "stand up" reminder like the Apple Watch one: **my phone, my data**. Like Apple Health, you only ever see your own readings.
**Right now (v0)** the only goal is to prove the sensor works end to end: the phone sends accelerometer readings, the backend stores them,
and **the web dashboard, paired to that phone with a 6-digit code, shows its status and readings**.
The dashboard is what the judges look at, so it must make it obvious that real data is flowing.

```
[ Phone app ]  -->  [ Backend API ]  <-->  [ Database ]
   shows code             ^
                          |  POST /api/pair, GET /api/me, GET /api/me/events   (JSON)
                          |
                   [ Web dashboard ]  (you)
```

You work **independently from the backend** until integration: the dashboard reads the sample JSON files instead of calling the API.

## Your folder
`src/frontend/` (plus your guide and samples in `contracts/frontend/`): only edit files there.

## Stack
| Piece | Choice |
|---|---|
| Runtime | **Node 26 LTS** (v26.13.1). Pin it in `src/frontend/.nvmrc` (`26`). Node 27 is still alpha; don't use it yet |
| Framework | **React** + TypeScript, created with Vite (`npm create vite@latest frontend -- --template react-ts` inside `src/`) |
| Chart | Recharts or Chart.js (pick one, keep it simple) |
| Styling | Plain CSS or Tailwind. Keep it clean and readable on a projector |
| Hosting (later) | Azure Static Web Apps (serves the `dist/` build) |

## Config
`src/frontend/.env` (gitignored); commit `.env.example`:

| Variable | Example | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL. **Empty → fixture mode.** |
| `VITE_POLL_SECONDS` | `3` | How often to refresh in API mode |

Vite bakes these in at **build time**. For Azure, they're set in the build pipeline. No secrets go in here.

## Data source: fixtures vs API
Put all data access in **one module** (e.g. `src/api.ts`) with three functions:
- `pair(code)` → `{ device_id, viewer_token }`
- `getMe()` → my phone
- `getMyEvents(limit = 50)` → my readings

Inside, if `VITE_API_URL` is empty, return the sample data; otherwise `fetch` the API with `Authorization: Bearer <viewer_token>`.
Components never know which one is used. Show a small "FIXTURE DATA" / "LIVE: <url>" label in the header.

The samples are the `.json` files in `contracts/frontend/`. Import them from there (`../../../contracts/frontend/...` from `src/frontend/src/`).
If Vite's dev server refuses files outside `src/frontend/`, add the repo root to `server.fs.allow` in the Vite config.
**Don't copy them into `src/frontend/`**: import from `contracts/frontend/` so they always match the contract.

In fixture mode, `pair()` accepts the code `482913` and returns `pair_response.json`; any other code fails like the real API (`400`).

## Pairing (how the dashboard knows whose data to show)
1. No viewer token saved → show the **pairing screen**: "Open the app on your phone, tap *Show dashboard code*, and enter it here."
   Input: 6 digits, numeric keyboard on mobile, auto-submit on the 6th digit.
2. `POST {VITE_API_URL}/api/pair` with `{"code": "482913"}` (`pair_request.json`)
   - `200` → `{"device_id": "demo-phone-01", "viewer_token": "..."}` (`pair_response.json`). Save the token in `localStorage`, show the dashboard.
   - `400 {"detail": "Invalid or expired code"}` → show the message, clear the input.
3. Every later request sends `Authorization: Bearer <viewer_token>`.
4. Any `401` → the token is no longer valid: delete it and go back to the pairing screen.
5. **Unpair** button in the header: delete the token, back to the pairing screen.

Never show, log or put the token in the URL.

## API you consume

### `GET {VITE_API_URL}/api/me`
Sample: `me.json`
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
- `last_seen` is `null` before the phone's first reading (show the empty state).
- `device_name` can be `null` → show the `device_id`.

### `GET {VITE_API_URL}/api/me/events?limit=50`
Sample: `me_events.json`
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
- Newest first. `value` = magnitude in g; `axes` = raw x/y/z in g.
- `timestamp` = when the phone took the reading; `received_at` = when the backend got it.
- `events` is empty before the first reading.
- Errors: `401` → back to pairing. Backend down → network error.

### Understanding the numbers (for labels and the chart)
- Values are in **g**, gravity included. A phone lying still has magnitude ≈ **1.0 g**.
- Movement shows as the magnitude moving away from 1.0 (e.g. 0.6 or 1.6).
- Good visual: a horizontal reference line at 1.0 g labelled "still".

## What to build

### Screens
**Pairing screen** (see above).

**Dashboard:**
1. **Header**: app name, data source label (FIXTURE / LIVE), "last refreshed" time, **Unpair** button.
2. **My phone card**: name, `device_id`, platform icon/text, **online/offline badge**, "last seen 2 min ago".
3. **Readings panel**:
   - **Latest reading card**: big magnitude value + unit, x/y/z, "taken at 20:45:00 (3 s ago)" (18:45Z shown in Romanian time, UTC+2).
   - **Chart**: magnitude over time (x axis = `timestamp`, oldest → newest; remember the API is newest-first), with the 1.0 g reference line. Optional toggle to also show x/y/z.
   - **Table**: time, x, y, z, magnitude, received at. Newest on top.
4. **Empty state**: no readings yet → "No readings yet. Tap Send on your phone."
5. **Error state**: backend unreachable → a visible banner ("Backend unreachable, retrying…"), keep showing the last data.

### Behavior
- **Times**: API sends UTC (`...Z`). Display in the viewer's **local time**; relative times ("3 s ago") update every second.
- **Polling** (API mode only): refresh my phone and my readings every `VITE_POLL_SECONDS`. New readings should appear without a page reload. That's the demo moment.
- **Online badge**: use the `online` field from the API, don't compute it yourself.
- Format numbers with 3 decimals.
- Must be readable on a projector: large fonts for the latest value, good contrast. Usable on a phone browser too.

### Seeing live data before the phone app is ready
Once the backend runs, the backend person's **simulator** (`tools/simulator/`) acts as a fake phone: it registers, **prints a pairing code**,
then posts readings every second (`still`, `shaking` or `mixed`). Point `VITE_API_URL` at the backend, enter the printed code, and you'll see the chart move.
A freshly seeded dev backend also accepts the sample code `482913` once.

## Done when (v0)
- [ ] `npm run dev` in fixture mode: pairing screen → code `482913` → dashboard with `demo-phone-01`
- [ ] Wrong code shows the error; Unpair returns to the pairing screen; reload keeps you paired
- [ ] Online/offline badge, last seen, latest reading card, chart and table all work from the samples
- [ ] Empty state for no readings; backend-down shows the error banner; `401` returns to pairing
- [ ] Switching `VITE_API_URL` to the backend shows real data with no code changes
- [ ] New readings (simulator or phone) appear within a few seconds via polling
- [ ] `npm run build` succeeds (this runs in CI)

## Integration
1. Backend runs locally → `VITE_API_URL=http://localhost:8000` (or the backend laptop's IP), restart `npm run dev`.
2. Pair using the code from the phone app (or the simulator).
3. If you get CORS errors, ask the backend person to add your origin (`http://localhost:5173`) to `CORS_ORIGINS`.
4. Cloud: build with `VITE_API_URL=<Azure backend URL>` and deploy `dist/` to Azure Static Web Apps. Nothing in the code changes.

## Coming next (not yet)
- **v1**: events get an `is_active` flag (moving vs still). Colour the chart points/table rows by it.
- **v2**: a new `GET /api/me/status` → big **OK / STAND UP** badge, "minutes since you last moved".
Leave space on the phone card for that badge.

## Git workflow
- Branches `frontend/<feature>` (e.g. `frontend/pairing`, `frontend/phone-card`, `frontend/chart`), merged to `main` often.
- Small commits with clear messages, one per feature/step.
- Only touch `src/frontend/` and `contracts/frontend/`. API changes go through a contract PR approved by all three.
