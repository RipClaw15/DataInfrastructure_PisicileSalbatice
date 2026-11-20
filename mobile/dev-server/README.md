# Mobile dummy server

A throwaway API for testing the mobile app on its own. **It's not the real backend** (that lives in `backend/`).
It accepts `POST /api/events` as defined in contract v0, prints every reading to the console and keeps them in memory (lost on restart).

Standard library only: no install needed.

```bash
python mobile/dev-server/server.py             # port 8000 (or: py mobile/dev-server/server.py)
python mobile/dev-server/server.py --port 8001
```

On startup it prints its URL and the line to put in `mobile/.env`.

| Endpoint | Does |
|---|---|
| `POST /api/events` | Validates the required fields, prints the reading, returns `201 {id, device_id, received_at}` (or `422`) |
| `GET /api/events?limit=50` | Readings received so far, newest first |
| `GET /health` | `{"status": "ok"}` |

Console output:
```
#152  2026-11-20T18:57:59Z  phone-irbmii9a  x=-0.033 y=-0.645 z=-0.771  |a|=1.006 g
```

