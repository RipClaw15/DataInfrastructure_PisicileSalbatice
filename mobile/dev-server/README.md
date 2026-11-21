# Mobile dummy server

A throwaway API for testing the mobile app on its own. **It's not the real backend** (that lives in `backend/`).
It accepts readings (contract v0) and arm/disarm (contract v1), prints everything to the console and keeps it in memory (lost on restart).
While armed it applies the contract's detection rules and raises alerts, so it also works as a reference for the real backend.

Standard library only: no install needed.

```bash
python mobile/dev-server/server.py             # port 8000 (or: py mobile/dev-server/server.py)
python mobile/dev-server/server.py --port 8001
```

On startup it prints its URL and checks `mobile/.env`: either `mobile/.env OK`, or the exact line to put in it.

| Endpoint | Does |
|---|---|
| `POST /api/events` | Validates the required fields, prints the reading, returns `201 {id, device_id, received_at}` (or `422`) |
| `GET /api/events?limit=50` | Readings received so far, newest first |
| `POST /api/devices/{id}/arm` | Saves the resting position, prints `== ARMED`, returns the status (`GUARDING`) |
| `POST /api/devices/{id}/disarm` | Prints `== DISARMED`, returns the status (`DISARMED`) |
| `GET /api/devices/{id}/status` | `DISARMED`, `GUARDING` or `ALERT`, with the last alert (`404` before the first reading or arm) |
| `GET /api/devices/{id}/alerts?limit=20` | Alerts, newest first |
| `GET /health` | `{"status": "ok"}` |

Console output (while armed, each reading also shows how far it has turned from the resting position):
```
== ARMED phone-irbmii9a at 2026-11-20T19:10:00Z, resting position x=+0.022 y=-0.029 z=-0.984
#12   2026-11-20T19:10:05Z  phone-irbmii9a  x=+0.025 y=-0.028 z=-0.980  |a|=0.980 g  armed,   0.2 deg from rest
#13   2026-11-20T19:10:12Z  phone-irbmii9a  x=+0.020 y=-0.628 z=-0.744  |a|=0.973 g  armed,  38.5 deg from rest
!! ALERT picked_up: 38.5 deg, 0.973 g
#14   2026-11-20T19:10:13Z  phone-irbmii9a  x=-0.011 y=-0.557 z=-0.855  |a|=1.021 g  armed,  39.1 deg from rest  [ALERT]
== DISARMED phone-irbmii9a (was ALERT: picked_up at 2026-11-20T19:10:12Z, 38.5 deg)
```
Rule (contract v1): more than 15° from the resting position → one `picked_up` alert; the state stays `ALERT` until disarmed.

## Captured readings
[`captured-readings.json`](captured-readings.json) holds the 189 real readings from the first test (2026-11-20, 3 iPhones and 1 Android phone),
in the same shape as `GET /api/events` (without `received_at`, which wasn't logged), oldest first.

| Readings | Phone | What it was doing |
|---|---|---|
| #1–#42 | 3 phones | first sends while testing the app |
| #43–#53 | `phone-irbmii9a` | held in the hand (≈ 0.97–1.01 g) |
| #54–#115 | `phone-irbmii9a` + `phone-q3ha4fir` | both shaken at the same time (0.3–2.0 g) |
| #116–#143 | `phone-irbmii9a` | held in the hand |
| #144–#162 | `phone-irbmii9a` | shaken in bursts (up to 3.5 g), held in between |
| #163–#183 | `phone-irbmii9a` | shaken violently (up to 6.7 g) |
| #186–#189 | `phone-ve5xkfoz` | lying on a table, face up (z ≈ -0.95) |

## Captured guard session
[`captured-guard-session.json`](captured-guard-session.json) is a real guard test (2026-11-21, one phone), with the expected result:

| Readings | What happened | Angle from rest | State |
|---|---|---|---|
| #1–#10 | lying still on a table | 0.0–0.1° | `GUARDING` |
| #11 | first touch | 7.6° (under 15°) | `GUARDING` |
| #12 | picked up | **56.0°** → one `picked_up` alert | `ALERT` |
| #13–#24 | handled and turned | 25–121° | `ALERT` (no new alerts) |
| #25–#31 | put back where it was | 0.1–0.2° | still `ALERT` |

It contains the `arm_request`, all 31 readings, and `expected` (the alert and the state after each reading), so it can be replayed as a test.
