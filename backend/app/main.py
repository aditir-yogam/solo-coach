"""FastAPI app: API + auth + fake shim + the built React frontend (one origin)."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db, logger, repositories as repo, storage
from .auth_shim import router as shim_router
from .config import is_placeholder, settings
from .errors import AppError
from .routes.auth import router as auth_router
from .routes.coaches import router as coach_router
from .services.prompt import TEMPLATE_PATH

FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))


def _startup_warnings():
    if settings.llm_provider == "groq":
        logger.warn("LLM_PROVIDER=groq — the epic asks for Anthropic; llm_use.provider will be 'groq'")
        if is_placeholder(settings.groq_api_key):
            logger.warn("GROQ_API_KEY is not set — story generation will fail")
    elif is_placeholder(settings.anthropic_api_key):
        logger.warn("ANTHROPIC_API_KEY is not set — story generation will fail")
    if is_placeholder(settings.firecrawl_api_key):
        logger.warn("FIRECRAWL_API_KEY is not set — website crawls will fail and fall back")
    if is_placeholder(settings.session_secret):
        logger.warn("SESSION_SECRET is the placeholder value — set your own in .env")
    if not settings.auth_shim_url:
        logger.warn("AUTH_SHIM_URL is not set — Google/LinkedIn will show the provider error screen")
    if not TEMPLATE_PATH.exists():
        logger.error("locked prompt template missing", path=str(TEMPLATE_PATH))


@asynccontextmanager
async def lifespan(app: FastAPI):
    _startup_warnings()
    db.open_pool()
    storage.check_bucket()
    released = repo.release_orphaned_processing()
    if released:
        logger.warn("released coaches left in processing by a previous run", count=released)
    logger.info("app ready", url=settings.app_base_url)
    yield
    db.pool.close()


app = FastAPI(title="Solo Coach Onboarding", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.exception_handler(AppError)
async def app_error(_: Request, exc: AppError):
    return JSONResponse({"error": exc.code, "message": exc.message}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse({"error": "invalid_request", "message": "Invalid request."}, status_code=400)


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    return JSONResponse({"error": "not_found" if exc.status_code == 404 else "error", "message": "Not found." if exc.status_code == 404 else "Invalid request."}, status_code=exc.status_code)


@app.exception_handler(psycopg.OperationalError)
async def db_down(request: Request, exc: Exception):
    logger.error("database unavailable", path=request.url.path)
    return JSONResponse({"error": "service_unavailable", "message": "Our database is unavailable right now. Please try again shortly."}, status_code=503)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.error("unhandled error", path=request.url.path, error=type(exc).__name__, detail=str(exc)[:200])
    return JSONResponse({"error": "server_error", "message": "Something went wrong on our end. Please try again."}, status_code=500)


@app.get("/api/health")
def health():
    return {"ok": True}


app.include_router(shim_router)
app.include_router(auth_router)
app.include_router(coach_router)

# Built React app, served from the same origin (cookies just work, no CORS).
if (FRONTEND_DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith(("api/", "auth/", "auth-shim/")):
            return JSONResponse({"error": "not_found", "message": "Not found."}, status_code=404)
        file = FRONTEND_DIST / path
        if path and file.is_file() and FRONTEND_DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-store"})
