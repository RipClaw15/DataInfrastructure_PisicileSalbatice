from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="StayPut API", version="0.1.0")

LANDING_PAGE = Path(__file__).resolve().parent / "index.html"
app.mount("/static", StaticFiles(directory=LANDING_PAGE.parent / "static"), name="static")


@app.get("/", response_class=FileResponse, include_in_schema=False)
def landing_page():
    return FileResponse(LANDING_PAGE)


@app.get("/health")
def health():
    return {"status": "ok"}
