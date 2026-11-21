# StayPut presentation

The Railway FastAPI app serves the StayPut page at `/`, with styles, the status
preview script, and favicon under `/static/stayput*`. The Vercel React frontend
renders the same presentation at `/` through `codelap-dashboard/src/pages/LandingPage.tsx`,
and the live dashboard at `/dashboard`.

This is a presentation update, not a connected guard dashboard. The Disarmed,
Guarding, and Alert buttons change sample UI state only. They make no telemetry
requests and do not control a phone. The page explains the mobile prototype and
makes the remaining cloud integration explicit.

## Files

- `index.html`: Railway landing page.
- `static/stayput.css`: responsive presentation styles.
- `static/stayput.js`: local preview state switches.
- `static/stayput-icon.svg`: shield favicon.
- `../../codelap-dashboard/src/pages/LandingPage.tsx`: React version for Vercel, built from
  the sections in `../../codelap-dashboard/src/components/landing/`.
- `../../codelap-dashboard/src/styles/landing.css`: matching React styles, using the shared
  palette from `../../codelap-dashboard/src/index.css`.

The two presentations intentionally share copy and CSS without a cross-project
build dependency. Keep their content/styles aligned when updating them. This
lets each platform continue deploying its own existing project directory.

The previous FleetPulse scripts and styles remain in `static/` for now, but are
not referenced or executed by the new landing page. The teammate's React
readings/pairing components also remain available in source; `App.tsx` now shows
the StayPut landing page instead of the previous pairing screen. Their legacy
fixtures are copied into `codelap-dashboard/src/fixtures` to replace imports from
an absent, gitignored `local-docs` directory and allow the React project to build.

Existing `/health`, `/docs`, `/redoc`, and `/openapi.json` are preserved. Only the
API title changes to StayPut. Dockerfile, Railway settings, dependencies, mobile
code, and team contracts are unchanged.

## Next step

Follow `contracts/API_CONTRACT.md` and `contracts/backend/BACKEND.md` for readings,
arm/disarm, status, and alert integration. The actual reference implementation
currently lives in `mobile/dev-server/server.py`, not the deployed FastAPI app.
Agree the live dashboard design before replacing this preview with real state.
