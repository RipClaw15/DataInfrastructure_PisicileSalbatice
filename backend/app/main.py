from pathlib import Path
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .config import settings
from .db import Base, get_engine
from .live import live_telemetry
from .observability import record, request_id
from .routes.register import router as register_router
from .routes.me import router as me_router
from .routes.pairing import router as pairing_router
from .routes.events import router as events_router
from .routes.guard import router as guard_router
from .models import (  # noqa: F401 - register all ORM models on Base.metadata
    Alert,
    ArmSession,
    Device,
    Event,
    EventLocation,
    EventSnapshot,
    PairingCode,
    SessionLocation,
    ViewerToken,
)


@asynccontextmanager
async def lifespan(app):
    if settings.database_url:
        Base.metadata.create_all(get_engine())
    try:
        yield
    finally:
        live_telemetry.clear()


app = FastAPI(title="StayPut API", version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def request_timing(request, call_next):
    # Generate IDs ourselves: never log untrusted header content.
    token = request_id.set(uuid4().hex)
    started = perf_counter()
    record("request_start", method=request.method)
    try:
        response = await call_next(request)
        elapsed = round((perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id.get()
        response.headers["Server-Timing"] = f"app;dur={elapsed}"
        record("request_end", route=getattr(request.scope.get("route"), "path", "unmatched"),
               status=response.status_code, elapsed_ms=elapsed)
        return response
    except Exception as exc:
        record("request_error", error=type(exc).__name__,
               elapsed_ms=round((perf_counter() - started) * 1000, 2))
        raise
    finally:
        request_id.reset(token)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip().rstrip("/") for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Retry-After"],
)
app.include_router(register_router)
app.include_router(me_router)
app.include_router(pairing_router)
app.include_router(events_router)
app.include_router(guard_router)

LANDING_PAGE = Path(__file__).resolve().parent / "index.html"
# Docker packages the React app here; local builds remain in the Vite project.
DASHBOARD_DIR = LANDING_PAGE.parent / "dashboard_dist"
if not DASHBOARD_DIR.is_dir():
    DASHBOARD_DIR = LANDING_PAGE.parents[2] / "codelap-dashboard" / "dist"
app.mount("/static", StaticFiles(directory=LANDING_PAGE.parent / "static"), name="static")


@app.get("/", response_class=FileResponse, include_in_schema=False)
def landing_page():
    return FileResponse(LANDING_PAGE)


@app.get("/dashboard", response_class=FileResponse, include_in_schema=False)
@app.get("/dashboard/", response_class=FileResponse, include_in_schema=False)
def dashboard():
    index = DASHBOARD_DIR / "index.html"
    if not index.is_file():
        return JSONResponse(status_code=503, content={
            "detail": "Dashboard build is missing. Build codelap-dashboard or deploy the root Dockerfile.",
        })
    return FileResponse(index, headers={"Cache-Control": "no-store"})


@app.get("/dashboard/{asset_path:path}", response_class=FileResponse, include_in_schema=False)
def dashboard_asset(asset_path: str):
    directory = DASHBOARD_DIR.resolve()
    asset = (directory / asset_path).resolve()
    if not asset.is_relative_to(directory) or not asset.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(asset)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    if not settings.database_url:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "not_configured"},
        )

    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        # Do not expose connection details or credentials in the response.
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "unavailable"},
        )

    return {"status": "ok", "database": "connected"}
