from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .config import settings
from .db import get_engine
from .routes.register import router as register_router
from .routes.me import router as me_router
from .routes.events import router as events_router
from .routes.guard import router as guard_router
from .db import Base
from .models import Alert, ArmSession, Event

@asynccontextmanager
async def lifespan(app):
    if settings.database_url:
        Base.metadata.create_all(
            get_engine(), tables=[Event.__table__, ArmSession.__table__, Alert.__table__],
        )
    yield


app = FastAPI(title="StayPut API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(register_router)
app.include_router(me_router)
app.include_router(events_router)
app.include_router(guard_router)

LANDING_PAGE = Path(__file__).resolve().parent / "index.html"
app.mount("/static", StaticFiles(directory=LANDING_PAGE.parent / "static"), name="static")


@app.get("/", response_class=FileResponse, include_in_schema=False)
def landing_page():
    return FileResponse(LANDING_PAGE)


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
