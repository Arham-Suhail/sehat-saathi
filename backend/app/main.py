"""FastAPI app factory: security middleware, error handling, routers, /health."""

import asyncio
import logging
import secrets
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.db import ensure_indexes, make_client
from app.llm import build_providers
from app.logging_setup import setup_logging
from app.ratelimit import limiter
from app.routers import auth, medicines, prescriptions, reminders

log = logging.getLogger("app")

MAX_BODY_BYTES = 6 * 1024 * 1024  # hard cap for any request (image cap is 5 MB)

API_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Cache-Control": "no-store",
}
HSTS = "max-age=31536000; includeSubDomains"


def create_app(settings: Settings | None = None, db: Any = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = None
        if app.state.db is None:
            client = make_client(settings.mongodb_uri)
            app.state.db = client[settings.mongodb_db]
        async def _indexes() -> None:
            try:
                await asyncio.wait_for(ensure_indexes(app.state.db), timeout=30)
                log.info("indexes ready")
            except Exception as e:  # keep serving; /health reports the DB state
                log.error("index creation failed: %s", type(e).__name__)

        # Don't block startup (Render health checks) on a slow/unreachable DB.
        index_task = asyncio.create_task(_indexes())
        yield
        index_task.cancel()
        if client is not None:
            await client.close()

    is_prod = settings.env == "prod"
    app = FastAPI(
        title="Sehat Saathi API",
        lifespan=lifespan,
        docs_url=None if is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if is_prod else "/openapi.json",
    )
    app.state.settings = settings
    app.state.db = db
    app.state.llm = build_providers(settings)
    app.state.limiter = limiter

    # ---------- middleware (last added = outermost) ----------
    @app.middleware("http")
    async def security_and_logging(request: Request, call_next):
        request_id = secrets.token_hex(6)
        request.state.request_id = request_id
        started = time.perf_counter()

        declared = request.headers.get("content-length")
        if declared and (not declared.isdigit() or int(declared) > MAX_BODY_BYTES):
            response = JSONResponse({"detail": "Request bohat bari hai"}, status_code=413)
        else:
            try:
                response = await call_next(request)
            except Exception as e:
                log.error("unhandled error", extra={"request_id": request_id, "event": type(e).__name__})
                response = JSONResponse(
                    {"detail": "Kuch ghalat ho gaya", "request_id": request_id},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        for k, v in API_SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        if is_prod:
            response.headers["Strict-Transport-Security"] = HSTS
        response.headers["X-Request-ID"] = request_id
        log.info(
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,  # path only; never query strings or bodies
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            },
        )
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=False,  # bearer tokens, no cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    # ---------- error handlers (never leak internals) ----------
    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        # Report field locations only — never echo submitted values (could be passwords).
        fields = [".".join(str(p) for p in err.get("loc", []) if p != "body") for err in exc.errors()][:10]
        return JSONResponse(
            {"detail": "Maloomat sahi nahi hai", "fields": fields},
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Request mein masla hai"
        return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RateLimitExceeded)
    async def ratelimit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            {"detail": "Bohat zyada koshishen. Thori dair baad dobara koshish karein."},
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": "60"},
        )

    @app.exception_handler(Exception)
    async def generic_handler(request: Request, exc: Exception):
        rid = getattr(request.state, "request_id", None)
        log.error("unhandled error", extra={"request_id": rid, "event": type(exc).__name__})
        return JSONResponse({"detail": "Kuch ghalat ho gaya", "request_id": rid}, status_code=500)

    # ---------- routes ----------
    @app.get("/health", tags=["meta"])
    async def health(request: Request):
        try:
            await asyncio.wait_for(request.app.state.db.command("ping"), timeout=5)
            return {"status": "ok", "db": "ok"}
        except Exception:
            return JSONResponse({"status": "degraded", "db": "unreachable"}, status_code=503)

    app.include_router(auth.router)
    app.include_router(auth.me_router)
    app.include_router(prescriptions.router)
    app.include_router(medicines.router)
    app.include_router(reminders.router)
    return app


def app_factory() -> FastAPI:  # uvicorn --factory app.main:app_factory
    return create_app()
