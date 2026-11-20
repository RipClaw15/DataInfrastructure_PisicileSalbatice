# Mobile dummy server

A throwaway API for testing the mobile app on its own. **It's not the real backend** (that lives in `backend/`).
It accepts `POST /api/events` as defined in contract v0, prints every reading to the console and keeps them in memory (lost on restart).

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
| `GET /health` | `{"status": "ok"}` |

Console output:
```
#152  2026-11-20T18:57:59Z  phone-irbmii9a  x=-0.033 y=-0.645 z=-0.771  |a|=1.006 g
```

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
