"""API key middleware and rate limiting."""

import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse

from database import SessionLocal
from models import ApiKey

rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 100
RATE_WINDOW = 3600

WRITE_PROTECTED = {"/api/pastes"}
PUBLIC_WRITE_PATHS = {"/api/keys/create", "/api/auth/register", "/api/auth/login"}


def check_rate_limit(key: str) -> bool:
    now = time.time()
    rate_limit_store[key] = [t for t in rate_limit_store[key] if now - t < RATE_WINDOW]
    if len(rate_limit_store[key]) >= RATE_LIMIT:
        return False
    rate_limit_store[key].append(now)
    return True


async def api_key_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    if path in PUBLIC_WRITE_PATHS:
        return await call_next(request)
    if path.endswith("/verify"):
        return await call_next(request)
    if method == "PUT" and "edit_token" in str(request.query_params):
        return await call_next(request)
    if method == "GET" or not (
        path.startswith("/api/pastes") or path.startswith("/api/admin")
        or path.startswith("/api/keys") or path.startswith("/api/collections")
    ):
        return await call_next(request)

    is_write = method in ("POST", "PUT", "DELETE")
    is_paste_endpoint = (
        path.startswith("/api/pastes") or path.startswith("/api/admin")
        or path.startswith("/api/keys") or path.startswith("/api/collections")
    )

    if is_write and is_paste_endpoint:
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            return JSONResponse(status_code=401, content={"detail": "API key required. Pass X-API-Key header."})
        db = SessionLocal()
        key_obj = db.query(ApiKey).filter(ApiKey.key == api_key).first()
        db.close()
        if not key_obj:
            return JSONResponse(status_code=403, content={"detail": "Invalid API key."})
        if not check_rate_limit(api_key):
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded (100 requests/hour)."})
        db = SessionLocal()
        db.query(ApiKey).filter(ApiKey.key == api_key).update({"request_count": ApiKey.request_count + 1})
        db.commit()
        db.close()

    return await call_next(request)


async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response
