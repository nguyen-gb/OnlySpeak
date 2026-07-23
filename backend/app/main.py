from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import admin, auth, chat, conversations, progress, topics
from app.config import settings
from app.database import dispose_engine, engine
from app.services.tts_service import TTSServiceError


logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("onlyspeak.api")
REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,64}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        "Starting %s (environment=%s, gemini_model=%s)",
        settings.APP_NAME,
        settings.ENVIRONMENT,
        settings.GEMINI_MODEL,
    )
    yield
    await dispose_engine()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.1.0",
    docs_url="/api/docs" if settings.docs_enabled else None,
    redoc_url="/api/redoc" if settings.docs_enabled else None,
    openapi_url="/api/openapi.json" if settings.docs_enabled else None,
    lifespan=lifespan,
)

def _apply_response_headers(response, request_id: str, path: str) -> None:
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")


async def _cache_request_body_with_limit(request: Request) -> bool:
    """Read streaming/chunked bodies with a hard cap, then replay downstream."""

    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > settings.MAX_REQUEST_BODY_BYTES:
            return False
        chunks.append(chunk)
    # Starlette's cached request replays this body to the route handler.
    request._body = b"".join(chunks)
    return True


@app.middleware("http")
async def request_safety_and_logging(request: Request, call_next):
    request_id_header = request.headers.get("x-request-id", "")
    request_id = (
        request_id_header
        if REQUEST_ID_PATTERN.fullmatch(request_id_header)
        else uuid.uuid4().hex
    )
    request.state.request_id = request_id

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            parsed_content_length = int(content_length)
            if parsed_content_length < 0:
                raise ValueError
            too_large = parsed_content_length > settings.MAX_REQUEST_BODY_BYTES
        except ValueError:
            response = JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "Invalid Content-Length header"},
            )
            _apply_response_headers(response, request_id, request.url.path)
            return response
        if too_large:
            response = JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": "Request body is too large"},
            )
            _apply_response_headers(response, request_id, request.url.path)
            return response

    if not await _cache_request_body_with_limit(request):
        response = JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request body is too large"},
        )
        _apply_response_headers(response, request_id, request.url.path)
        return response

    started_at = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "unhandled request error method=%s path=%s request_id=%s",
            request.method,
            request.url.path,
            request_id,
        )
        # Build the response inside the user-middleware stack. Starlette's
        # outer ServerErrorMiddleware would otherwise bypass both this
        # middleware's security headers and CORSMiddleware.
        response = JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )
        _apply_response_headers(response, request_id, request.url.path)
        return response
    duration_ms = (time.perf_counter() - started_at) * 1000
    _apply_response_headers(response, request_id, request.url.path)

    if request.url.path not in {"/api/health", "/api/ready", "/api/live"}:
        logger.info(
            "request method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
    return response


# Register CORS after the safety middleware so even early 400/413 responses
# carry the correct browser CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["Retry-After", "X-Request-ID", "X-Total-Count"],
)


settings.AUDIO_DIR.mkdir(parents=True, exist_ok=True)
settings.STATIC_DIR.mkdir(parents=True, exist_ok=True)
# AUDIO_DIR is configurable independently from STATIC_DIR. Mount it first so
# generated URLs remain valid even when deployments place audio on a separate
# persistent volume.
app.mount("/static/audio", StaticFiles(directory=settings.AUDIO_DIR), name="audio")
app.mount("/static", StaticFiles(directory=settings.STATIC_DIR), name="static")

app.include_router(auth.router)
app.include_router(topics.router)
app.include_router(conversations.router)
app.include_router(progress.router)
app.include_router(admin.router)
app.include_router(chat.router)


@app.exception_handler(TTSServiceError)
async def handle_tts_error(_: Request, __: TTSServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Text-to-speech provider is temporarily unavailable"},
    )


@app.get("/api/live", include_in_schema=False)
async def liveness() -> dict[str, str]:
    return {"status": "ok", "app": settings.APP_NAME}


async def _readiness_response() -> JSONResponse:
    async def check_database() -> None:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))

    try:
        await asyncio.wait_for(
            check_database(), timeout=settings.DB_HEALTH_TIMEOUT_SECONDS
        )
    except Exception as exc:
        logger.warning("Database readiness check failed: %s", type(exc).__name__)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable", "database": "unavailable"},
        )
    return JSONResponse(content={"status": "ok", "database": "ok"})


@app.get("/api/health", include_in_schema=False)
async def health() -> JSONResponse:
    return await _readiness_response()


@app.get("/api/ready", include_in_schema=False)
async def readiness() -> JSONResponse:
    return await _readiness_response()
