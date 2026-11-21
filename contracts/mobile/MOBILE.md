# Mobile: Implementation Guide (contract v0 + v1)

Everything the mobile developer needs. If anything here differs from [`API_CONTRACT.md`](../API_CONTRACT.md), **the contract wins**.

## The task
**The app:** an old phone that guards your stuff. Arm it, walk away, and the dashboard alerts you if it's moved (see [`IDEA.md`](../IDEA.md)).

**v0 (first) is only the basic task**:
read the accelerometer, show it live, and **send a reading to the server** when you tap a button.

```
[ Phone app ]  --POST /api/events-->  [ Backend API ]  -->  [ Database ]  -->  [ Web dashboard ]
   (you)
```

You work **independently from the backend** until integration: the app can run in mock mode (see below).

## Your folder
`mobile/` (plus this guide and its samples in `contracts/mobile/`). Already scaffolded:
- Expo (SDK 58) with TypeScript, blank template
- `expo-sensors` (accelerometer)
- `@react-native-async-storage/async-storage` (to save the device ID)

## Setup
0. **Node 26 LTS** (v26.13.1). Pin it in `mobile/.nvmrc` (`26`). Node 27 is still alpha; don't use it yet.
1. `cd mobile && npm install`
2. Install **Expo Go** on your phone (App Store / Play Store).
3. `npx expo start` and scan the QR code with the phone (same WiFi as the laptop).
   If the WiFi blocks it, use `npx expo start --tunnel`.
4. **Use a real phone.** The iOS simulator has no accelerometer.

Config goes in `mobile/.env` (gitignored, never committed); commit an `.env.example` with an empty value:

| Variable | Example | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.20:8000` | Backend base URL. **Empty → mock mode.** |

## What to build

### Screen (one screen is enough)
1. **Sensor status**: "Accelerometer available" / "not available" (check availability before subscribing).
2. **Live values**: x, y, z and magnitude, updating about 10 times per second (100 ms interval), 3 decimals.
3. **Device ID** shown small.
4. **Send button**: takes the **current** reading, builds the JSON event and sends it.
5. **Last send result**: `sending…` / `retrying (2/3)…` / `sent ✓ id 152` / `failed: <reason>`.
6. **Payload preview**: the last JSON sent (useful in the demo and to compare with the sample).
7. **Mode indicator**: "MOCK" or the API URL being used (so you notice if it points at the wrong laptop).

### Reading the sensor
- Accelerometer values are in **g** (1 g ≈ 9.81 m/s²), **gravity included**.
- Magnitude = `sqrt(x² + y² + z²)`.
- Sanity checks (measured on an iPhone; on Android the axis signs can be flipped, e.g. z ≈ +1): flat on a table face up → x ≈ 0, y ≈ 0, **z ≈ -1**, magnitude ≈ **0.92–1.0** (not exactly 1.0: the phone rests on its camera bump and tables vibrate). Face down on the screen is the steadiest test. Held in the hand → magnitude 0.85–1.10. Shaking → 2–3.5 g, violent shaking up to ~7 g.
- The sign of the axes can differ between iOS and Android; magnitude is unaffected. Send what the sensor gives you, without flipping anything.
- Unsubscribe from the sensor when the screen unmounts.

### Device ID
- Generate once on first launch: `phone-` + 8 random lowercase letters/digits, e.g. `phone-k3f9x2qa` (must match `[a-z0-9-]`, 3–64 chars).
- Save it in AsyncStorage and reuse it forever, so all readings belong to the same phone.

### The event you send
`POST {EXPO_PUBLIC_API_URL}/api/events`, header `Content-Type: application/json`

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

| Field | Rule |
|---|---|
| `device_id` | the saved device ID |
| `event_type` | always `"accelerometer"` |
| `value` | magnitude, rounded to 3 decimals |
| `unit` | always `"g"` |
| `timestamp` | **UTC** ISO 8601 with `Z` (when the reading was taken, not when sent). `new Date().toISOString()` gives this |
| `axes` | raw x, y, z, rounded to 3 decimals |

Sample: `post_event_request.json` (this folder)

### Responses and retry
| Response | What the app does |
|---|---|
| `201` + `{"id": 152, "device_id": "...", "received_at": "..."}` | show "sent ✓ id 152" |
| `422` | show "failed: invalid data". **Don't retry** (it's a bug in our payload) |
| `5xx`, timeout, no network | **retry** up to 3 times, waiting 1 s, 2 s, 4 s; then "failed" |

- Use a request timeout (~5 s) so a dead backend doesn't hang the button.
- Disable the Send button while a send is in progress.

Sample: `post_event_response.json` (this folder)

### Mock mode (work without the backend)
When `EXPO_PUBLIC_API_URL` is empty: make no network call, wait ~300 ms and return `post_event_response.json` (with your device ID).
Add a debug toggle "simulate server error" so you can test the retry path and the "failed" state.

## Done when (v0)
- [ ] Runs on a real phone through Expo Go
- [ ] Shows whether the accelerometer is available
- [ ] Live x/y/z/magnitude update; steady ~1.0 g when still, changes when moved
- [ ] Device ID generated once and kept across app restarts
- [ ] Send builds JSON that matches `post_event_request.json` field-for-field
- [ ] Mock mode works; retry and failure states visible
- [ ] With the real backend: tap Send → 201 → reading appears on the dashboard

## Real data for the samples
The samples now contain **real readings** captured from an iPhone through `dev-server/`. To refresh them, copy payloads from the payload preview
and propose them as the new `post_event_request.json` / `events.json` in a contract PR.

## v1: Guard
Turns the phone into the guard. Details and rules: [`API_CONTRACT.md` → v1](../API_CONTRACT.md#v1-guard).

### What to build
1. **Arm / Disarm button** (big, the main control).
2. **Arming delay:** after tapping Arm, show "PUT IT DOWN" and wait until the phone has lain still for 2 s (direction within 0.8°) and at least 5 s have passed.
   Otherwise a phone armed in the hand raises "picked up" as soon as it's put down (seen in testing).
3. **Arm:** `POST /api/devices/{device_id}/arm` with the **average of those still readings** as the resting position:
   ```json
   { "timestamp": "2026-11-20T19:10:00Z", "axes": { "x": 0.022, "y": -0.029, "z": -0.984 } }
   ```
   Response: the status (`state: "GUARDING"`). Sample: `arm_request.json`, `status_guarding.json`.
   Optional: add `"location": {"lat", "lon", "accuracy_m"}` from `expo-location` (it works in Expo Go). Leave it out without a fix or permission.
   The same `location` (live) goes on every reading once the status is `ALERT`, and on the manual Send button's reading; the red screen shows it.
4. **While armed:** send the current reading to `POST /api/events` **every second**, automatically (same JSON as v0).
   Keep the manual Send button for testing.
5. **"GUARDING" screen:** dark, large text, time since armed, last send result. Keep the screen awake with `expo-keep-awake`
   (`npx expo install expo-keep-awake`; it works in Expo Go).
6. **Red on alert:** while armed, `GET /api/devices/{device_id}/status` every second. When `state` is `ALERT`, turn the screen **red: MOVED**
   with `last_alert`'s time and angle, and stay red until disarmed.
7. **Disarm:** `POST /api/devices/{device_id}/disarm`, no body. Response: `state: "DISARMED"`. Sample: `status_disarmed.json`.
8. **Errors:** arm/disarm use the same timeout and retry rules as sending; status checks and auto-send don't retry (they repeat every second).
   If arming fails, stay disarmed and show why.

The **backend** decides what counts as moved; the phone only sends readings and shows the state. (v2 adds a sound on the phone when an alert fires.)

### Limits to know
- The app must stay **open and in the foreground**: iOS and Android pause apps in the background. Fine for the demo; mention it as a known limit.
- Sending every second uses battery and data; plug the guarded phone in for long sessions.

### Mock mode
With an empty `EXPO_PUBLIC_API_URL`: arm returns `status_guarding.json`, disarm returns `status_disarmed.json`, auto-send returns `post_event_response.json`,
status always says `GUARDING` (so mock mode never turns red; use the dummy server for alerts).

### Done when (v1)
- [ ] Arm waits until the phone lies still (PUT IT DOWN screen, Cancel works)
- [ ] Arm/Disarm work against the samples (mock) and the real backend
- [ ] While armed, one reading per second arrives at the server; stops on disarm
- [ ] Screen stays awake while guarding
- [ ] The screen turns red when the server reports `ALERT`, and stays red until disarm
- [ ] Integrated: arm on a table, pick it up → phone and dashboard turn red within ~2 s

## Integration
1. Backend runs on a laptop → set `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000`, restart Expo.
   Every laptop on the WiFi has its own IP, so double-check it's your backend's (and re-check after reconnecting to the WiFi).
   If the phone can't reach the laptop, the backend person exposes it with a tunnel (ngrok / cloudflared); use that URL.
2. Later the backend runs on Azure: only the URL changes.

## Troubleshooting: phone can't reach the laptop
Expo Go says "Could not connect to the server", or the app's sends fail with "no connection to server":
1. **Local Network permission (iPhone).** Settings → Privacy & Security → Local Network → **Expo Go** on.
2. **Stale QR code.** Expo's QR code holds the IP from when it started. After changing network, restart `npx expo start` and check it shows `exp://<current IP>:8081`.
3. **Windows Firewall.** A phone hotspot usually joins as a **Public** network, where incoming connections are blocked.
   Set the network to **Private** (Settings → Network & internet → Wi-Fi → your network), or allow Node.js and Python for Public networks.
4. **WiFi blocks device-to-device traffic.** Put the laptop on the phone's hotspot, or use `npx expo start --tunnel`.

Quick test: open `http://<laptop IP>:8081/status` in the phone's browser. It should say `packager-status:running`.

## Coming next (not yet)
- **v2**: sound and vibration on the guarded phone when an alert fires (poll the status, or read it from the arm/send responses).
- **v3, my phone, my data**: pairing code, so only your dashboard sees your phone.
Keep the sensor reading, the API calls and the guard logic in separate files so these are small changes.

## Git workflow
- Branches `mobile/<feature>` (e.g. `mobile/live-sensor`, `mobile/send-event`), merged to `main` often.
- Small commits with clear messages, one per feature/step.
- Only touch `mobile/` and `contracts/mobile/`. API changes go through a contract PR approved by all three.
