# StayPut

**An old phone that guards your stuff.**

StayPut turns a spare phone into a motion alarm for your laptop or bag. Arm it,
put it down, and monitor it from a paired web dashboard. If the phone is picked
up, the backend raises an alert and the dashboard shows what happened and the
last known location.

Built for the Codelap Hackathon 2026 by **Pisicile Sălbatice**.

## How it works

1. Open the mobile app and generate a dashboard pairing code.
2. Enter the six-digit code at `/dashboard` in the web app. Codes are single-use
   and expire after 10 minutes by default.
3. Set a four-digit disarm PIN, tap **Arm**, and put the phone on your belongings.
   The app waits for it to settle before saving its resting orientation.
4. While guarding, the phone can show a black screen at minimum brightness.
   Movement greater than **15°** from the resting orientation triggers a
   **picked up** alert on the dashboard.
5. Tap the phone's screen and enter the PIN to disarm it.

The dashboard shows **DISARMED**, **GUARDING**, or **ALERT**, a 3D view of the
phone's orientation, a location map, activity, and optional sensor details.
Location is optional; motion detection works without a GPS fix.

## Architecture

```text
Expo mobile app ── readings, arm/disarm ──▶ FastAPI ──▶ PostgreSQL
                                             ▲
                                             │ authenticated polling
                                             │
                                      React dashboard
```

| Component | Stack | Directory |
| --- | --- | --- |
| Mobile app | Expo SDK 58, React Native, TypeScript | [`mobile/`](mobile/) |
| Dashboard | React, Vite, TypeScript, Tailwind CSS, Leaflet | [`codelap-dashboard/`](codelap-dashboard/) |
| API | FastAPI, SQLAlchemy, psycopg | [`backend/`](backend/) |
| Database | PostgreSQL 16 for local development | [`docker-compose.yml`](docker-compose.yml) |
| Shared API examples and design notes | Markdown and JSON | [`contracts/`](contracts/) |

The mobile app sends movement updates at most once per second, plus a heartbeat
about every 30 seconds while armed. After an alert it also sends location updates.
Routine readings update an in-memory live cache rather than being stored as a
continuous sensor history. PostgreSQL retains guard sessions, state snapshots,
alerts, and a limited GPS trail.

## Quick start with Docker (mentor demo)

You need **Docker Desktop with Compose**. For real sensor testing, install an
Expo Go version compatible with **Expo SDK 58** on your iPhone or Android phone.
Node.js, Python, and PostgreSQL do not need to be installed on your laptop.

Clone the repository and start everything with the included launcher:

```bash
git clone https://github.com/RipClaw15/DataInfrastructure_PisicileSalbatice.git
cd DataInfrastructure_PisicileSalbatice
./start.sh
```

On Windows, run `powershell -ExecutionPolicy Bypass -File .\start.ps1` from the
repository directory instead of `./start.sh`.

The launcher builds and starts PostgreSQL, the API/dashboard, and the Expo mobile
server, waits for them to become healthy, and prints the addresses to open.
**No `.env` editing or manual IP lookup is required.** It detects the laptop's
network address automatically.

1. Open <http://localhost:8000/dashboard/> on the laptop.
2. Connect the phone and laptop to the same Wi-Fi or phone hotspot.
3. Open the `exp://...` address printed by the launcher in Expo Go on the phone.
   On Android, use **Enter URL manually** when available; on iPhone, open the link
   in Safari and choose Expo Go.
4. Tap **Show dashboard code** in the app and enter the six-digit code in the
   dashboard.
5. Set a PIN, arm the phone, let it settle, then pick it up to trigger an alert.
   Enter the PIN on the phone to disarm.

The launcher installs all project dependencies **inside Docker**. Docker runs
Expo's development server; the native app and sensors run on the physical phone.
The dashboard and mobile app use the local API, with no production services or
existing credentials required. Keep the app open while guarding and allow local
network/location permissions when prompted.

For just the browser/API/database, without a phone:

```bash
docker compose up --build -d
```

You can also use `./start.sh --web-only` or `.\start.ps1 -WebOnly` to wait for
readiness and print the links. The API documentation is at
<http://localhost:8000/docs>, the landing page at <http://localhost:8000/>, and the
database readiness check at <http://localhost:8000/ready>.

Expo Go may require the development server and phone to use the same Expo
account. If it reports that Expo CLI is not signed in, run from the repository:

```bash
docker compose exec -e CI=0 mobile npx expo login
docker compose restart mobile
```

Enter the **same account as Expo Go** in the terminal prompts, then reopen the
Expo link on the phone. `CI=0` enables the interactive login prompt inside the
container. The CLI runs in LAN mode with internet available to resolve your
account; the API and database still run locally. The login is kept in a named
Docker volume across container rebuilds. To check the account, run
`docker compose exec mobile npx expo whoami`. To sign out, run
`docker compose exec mobile npx expo logout`.

For unusual network setups (such as a VPN choosing the wrong interface), you can
optionally override `LAN_IP` in the root `.env` using `.env.example`, then rerun
the launcher. Guest Wi-Fi may block connections between devices; a phone hotspot
is often easier. For direct Compose use with the phone service, set `LAN_IP` and
run `docker compose --profile mobile up --build -d`.

### Verify, stop, or reset

```bash
# Full API flow with a synthetic phone; no real device required.
docker compose exec app python smoke_local.py

# Service status and recent API logs.
docker compose ps
docker compose logs --tail=100 app

# Stop all services, including Expo; keep the database for next time.
docker compose --profile mobile down
```

The smoke check registers a test device, pairs a viewer, arms it, submits a
movement, verifies the alert/location/history, and disarms it. It leaves the
synthetic session in the local database. It does not simulate physical sensors
or replace a real-device UI test.

To **delete all local database data**, stop with
`docker compose --profile mobile down --volumes` instead. This also removes the
saved Expo login, so sign in again afterward. Database data otherwise
persists in a named Docker volume. After resetting the database, reload/reopen the
phone app and generate a new pairing code.

If a port is occupied, set `APP_PORT`, `POSTGRES_PORT`, or `METRO_PORT` in the root
`.env`. Use the chosen app and Metro ports in the URLs above, then rerun the same
Compose command. Allow incoming connections on the app and Metro ports in your
laptop's firewall. First builds need internet to download images/dependencies;
map tiles also require internet. This Compose configuration uses development
database credentials and is intended for local testing.

### Windows startup troubleshooting

If an older Windows checkout reports that the mobile container exited, update
and rebuild it:

```powershell
git pull origin main
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

The build normalizes the Expo startup shell script to Linux line endings, and
Git attributes preserve those line endings on fresh Windows checkouts. The
Windows launcher skips self-assigned `169.254.*.*` addresses, disconnected
interfaces, and addresses that are not ready. If only such addresses exist,
connect the laptop to Wi-Fi or a phone hotspot before retrying. An optional
`LAN_IP` override must also be a usable IPv4 address.

On startup failure, the launcher prints recent service logs automatically. To
inspect them separately, run `docker compose logs --tail=60 mobile app`. Rebuilding
does not require deleting the PostgreSQL volume.

## Run locally without containers for the apps

Use **Node.js 26**, **Python 3.14**, and Docker with Compose. A physical iOS or
Android phone with a compatible Expo Go app is needed to test real motion sensors.
The mobile and dashboard projects have separate dependencies; install both.

Run the commands below from the repository root unless a step changes directory.
The Python environment activation command shown is for macOS/Linux; on Windows,
use `.venv\Scripts\activate`.

### 1. Start PostgreSQL and the API

```bash
docker compose up -d postgres

python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env

python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The example database URL matches the local Compose service. FastAPI creates
missing tables at startup when `DATABASE_URL` is configured. This startup step
is not a migration system for changes to existing tables.

Useful addresses:

- API documentation: <http://localhost:8000/docs>
- Process health: <http://localhost:8000/health>
- Database readiness: <http://localhost:8000/ready>
- Static landing page: <http://localhost:8000/>

This development path starts **only the PostgreSQL service**; the API runs
separately in the command above. Use the Docker quick start to run the apps in
containers too.

### 2. Start the dashboard

In another terminal:

```bash
cd codelap-dashboard
npm install
cp .env.example .env
```

Set `codelap-dashboard/.env` to:

```dotenv
VITE_API_URL=http://localhost:8000
VITE_POLL_SECONDS=3
VITE_PAIRING=true
```

Then start Vite:

```bash
npm run dev
```

Open <http://localhost:5173/> for the landing page or
<http://localhost:5173/dashboard> to pair and monitor a phone. Use the port Vite
prints if 5173 is already occupied.

For a dashboard-only demo, leave `VITE_API_URL=` empty and enter fixture pairing
code **482913**. Sample states are available at `/dashboard?state=guarding`,
`/dashboard?state=alert`, and `/dashboard?state=disarmed`. Fixture data does not
come from a real phone.

### 3. Start the mobile app

In another terminal:

```bash
cd mobile
npm install
cp .env.example .env
```

Set `mobile/.env` to an API address the phone can reach:

```dotenv
EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_LAN_IP:8000
```

Use your laptop's LAN IP address, not `localhost`: on the phone, `localhost`
means the phone itself. Connect the phone and laptop to the same network, or use
an API deployed over HTTPS.

```bash
npx expo start --clear
```

Open the project in Expo Go and allow the required sensor/location permissions.
The app registers the phone with the API and provides **Show dashboard code**
for pairing. Generate a fresh code for each new pairing.

Leaving `EXPO_PUBLIC_API_URL=` empty enables mock mode. It does not send data to
the backend or connect to a live dashboard. A separate mobile development server
is also available; see [`mobile/dev-server/README.md`](mobile/dev-server/README.md).

Keep the app open while guarding: backgrounding it or locking the phone can stop
sensor updates. The black stealth screen keeps the app in the foreground.
See [`mobile/README.md`](mobile/README.md) for device setup and troubleshooting.

## Configuration

Copy the tracked `.env.example` files and edit the local `.env` files. Do not
commit tokens, production database credentials, or populated `.env` files.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API | PostgreSQL SQLAlchemy URL using `postgresql+psycopg://` |
| `CORS_ORIGINS` | API | Comma-separated browser origins; use explicit origins in production |
| `VITE_API_URL` | Dashboard | API origin without an `/api` suffix; `/` uses the same origin; empty selects fixtures |
| `VITE_PAIRING` | Dashboard | Pairing is enabled unless explicitly set to `false` |
| `VITE_POLL_SECONDS` | Dashboard | Normal polling interval; active polling uses one second |
| `EXPO_PUBLIC_API_URL` | Mobile | Reachable API origin; empty selects mocks |
| `ALERT_GPS_INTERVAL_SECONDS` | API | Minimum interval between retained GPS updates; default 30 |
| `ALERT_GPS_DISTANCE_METERS` | API | Minimum distance for retained GPS updates; default 25 |

Vite configuration is embedded **at build time**. Restart Vite/Expo after changing
client environment files, and rebuild deployed clients when changing their API URL.
Disabling the pairing screen does not bypass backend authentication.

Database timeout settings and request timing logs are described in
[`backend/BACKEND.md`](backend/BACKEND.md#diagnosing-stalled-requests).

## API overview

Open `/docs` on the running API for the current schemas and authentication details.
The phone receives a device token at registration. Pairing gives the dashboard a
separate viewer token. Protected endpoints use `Authorization: Bearer <token>`.

| Endpoint | Purpose | Access |
| --- | --- | --- |
| `POST /api/register` | Register a phone | Public |
| `GET /api/me` | Read the associated phone's details | Device or viewer token |
| `PATCH /api/me` | Update the phone's name | Device token |
| `POST /api/me/pairing-code` | Create a dashboard pairing code | Device token |
| `POST /api/pair` | Exchange a pairing code for a viewer token | Pairing code |
| `POST /api/me/events` | Submit a sensor reading | Device token |
| `POST /api/me/arm` | Save the resting orientation and start guarding | Device token |
| `POST /api/me/disarm` | End guarding | Device token |
| `GET /api/me/status` | Guard state and location information | Device or viewer token |
| `GET /api/me/live` | Latest live sensor reading | Device or viewer token |
| `GET /api/me/events` | Retained sensor snapshots | Device or viewer token |
| `GET /api/me/alerts` | Alert history | Device or viewer token |

The shared [API contract](contracts/API_CONTRACT.md) contains examples and design
history; some sections describe earlier versions. The current route definitions
and generated `/docs` reflect the implemented pairing API.

## Checks

Backend, from the repository root with the Python environment active:

```bash
python -m pytest backend/tests -q
```

Dashboard:

```bash
cd codelap-dashboard
npm run build
npm run lint
```

Mobile TypeScript:

```bash
cd mobile
npx tsc --noEmit
```

## Deployment

The root [`Dockerfile`](Dockerfile) builds the dashboard with Node, then packages
its output with FastAPI in a Python image. FastAPI serves the dashboard at
`/dashboard/` and the static landing page at `/`.

The repository includes [`railway.toml`](railway.toml) for Railway deployment:

1. Connect the GitHub repository to a Railway service and use the **root Dockerfile**.
2. Configure `DATABASE_URL` for the deployed PostgreSQL instance and
   `CORS_ORIGINS` for the actual frontend origins.
3. The Docker build defaults to `VITE_API_URL=/`, so the bundled dashboard uses
   the API on its own origin. Override this build argument with an absolute API
   origin only when serving the dashboard and API from different origins.
4. Deploy the connected branch. With GitHub autodeploy enabled, pushes to that
   branch rebuild the API and bundled dashboard. The configured health check is
   `/health`; use `/ready` to check database connectivity separately.

The dashboard can also be hosted separately on Vercel. Set its project root to
`codelap-dashboard`, output directory to `dist`, and `VITE_API_URL` to the API
origin. Keep the sibling `contracts/` directory available during the build,
because dashboard fixtures import it. The included `vercel.json` rewrites support
client routes such as `/dashboard`.

Railway and Vercel deploy the server/web components. Mobile releases require a
separate Expo build or update; during development, use the optional Compose Expo
service or run Expo directly.

## Current limitations

- Detection compares orientation, so moving the phone without tilting it may not
  trigger an alert.
- GPS accuracy depends on the device and environment, particularly indoors.
- Live telemetry and pairing rate limits are held in process memory. Multiple API
  workers or replicas need shared state for consistent behavior.
- The PIN protects the app's disarm flow; the API uses its separate device token.
  Closing the mobile app can stop guarding updates.

## More documentation

- [Product idea and demo flow](contracts/IDEA.md)
- [Backend guide and diagnostics](backend/BACKEND.md)
- [Mobile setup and troubleshooting](mobile/README.md)
- [Shared API contract and fixtures](contracts/API_CONTRACT.md)
