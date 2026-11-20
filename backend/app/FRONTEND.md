# FleetPulse frontend

The existing FastAPI server serves the landing page at `/` and browser assets at
`/static`. `/health`, `/docs`, `/redoc`, and `/openapi.json` remain available.
The Dockerfile already copies the entire `backend/app` directory, including these
assets. No deployment changes, build tools, or new Python packages are required.

## Files

- `index.html`: page structure and accessible controls.
- `static/styles.css`: dark automotive theme and responsive layouts.
- `static/telemetry.js`: browser-only simulation and the data-source interface.
- `static/dashboard.js`: controls, map, device selection, KPIs, and API health check.
- `static/charts.js`: dependency-free SVG charts.

## Demo behavior

The demo starts paused. Start creates one update per second for four devices in
Cluj-Napoca. Each update contributes four events. Speed determines the distance
travelled along closed illustrative routes; routes are not matched to roads.
Latency values are synthetic, not measurements of the API. No browser location
permission is used and no telemetry is sent to the server or persisted.

Pause stops position, event, and chart updates. Last readings remain visible;
active devices becomes zero. Resume continues the session without resetting it.
Reload resets the session. Charts retain 60 samples and map trails retain 120
positions per device. Select a device row to focus the map and open its popup;
clicking a marker selects the corresponding row. Fit fleet restores the overview.

Only the FastAPI infrastructure indicator makes a real request (`GET /health`).
PostgreSQL is explicitly not connected. Refresh API status repeats the health
check with a five-second timeout.

## External assets

Leaflet 1.9.4 is loaded from unpkg with integrity hashes; map tiles come from
OpenStreetMap, with attribution. Google Fonts and the Porsche wordmark hosted on
Wikimedia are optional visual resources. Internet access is required for these
resources; map failures display a message and do not stop simulation or charts.
The CSS has system font fallbacks. No map API key is needed.

- Leaflet setup: https://leafletjs.com/examples-v1/quick-start/
- Map attribution: https://www.openstreetmap.org/copyright
- Tile policy: https://operations.osmfoundation.org/policies/tiles/
- Wordmark: https://commons.wikimedia.org/wiki/File:Porsche_Wordmark_Logo_Black.svg

## Connecting real GPS later (not implemented)

Agree on an authenticated telemetry API contract with the team before adding
endpoints. The current backend guide concerns phone accelerometer events; GPS
fields and fleet-level access need a separate agreed contract.

Implement an API data source with the same interface as `DemoTelemetrySource`:

```js
subscribe(listener) // Emit current snapshot; return an unsubscribe function.
start()             // Begin polling or subscribe to WebSocket/SSE messages.
pause()             // Stop polling or unsubscribe; retain last readings.
snapshot()          // Return the current normalized frontend snapshot.
```

Replace the source construction in `static/dashboard.js`. Keep network parsing,
authentication, stale-device detection, and reconnection inside that adapter.
Normalize incoming data to this shape (units are explicit):

```js
{
  running: true,
  events: 120,
  elapsedSeconds: 30,
  timestamp: "2026-11-20T18:45:00Z",
  devices: [{
    id: "FP-001", name: "Vehicle Alpha", color: "#ff7849",
    latitude: 46.7712, longitude: 23.6236,
    speedKmh: 42, latencyMs: 31
  }],
  history: [{ second: 30, speed: 42, events: 4 }]
}
```

The present renderer expects four known devices. For a real fleet, reconcile
device additions/removals in the list and map and replace hard-coded four-device
averages with the current fleet count. Validate coordinate ranges and finite
numeric values, use text nodes for untrusted names in popups, and make offline or
stale timestamps visible. Define whether latency means receipt minus device time
(requires synchronized clocks) or actual request round-trip time.

On the backend, validate and authorize each device's submissions, persist GPS
and server receipt timestamps in PostgreSQL, and expose only authorized fleet
data. Update the architecture and health indicators when those services exist.
Remove simulation labels only when the displayed data is real; retain an explicit
demo mode for presentations. For public traffic, choose a tile service appropriate
to the expected usage rather than treating community tiles as an unlimited SLA.

## Manual acceptance check

1. Open `/`; confirm API health becomes Healthy and PostgreSQL says Not connected.
2. Start demo; wait several seconds. Verify four active devices, moving markers,
   increasing events, speed and throughput charts, and last-update time.
3. Select each device and click markers; confirm matching row, popup, coordinates.
4. Pan/zoom, then choose Fit fleet to return to all four devices.
5. Pause; confirm positions, events, timestamp, and charts stop. Resume and verify
   they continue. Repeat Start/Pause to check no duplicate update intervals.
6. Check a narrow mobile viewport, keyboard navigation, and reduced motion.
7. Block external map assets; verify a clear map message and functioning charts.
8. Check `/health` and `/docs` on both local and Railway URLs.
