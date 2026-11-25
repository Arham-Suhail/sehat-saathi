"""Rate limiting (slowapi, in-memory — correct for a single Render instance; resets on restart).

Keys: client IP for anonymous endpoints; verified user id for authenticated
LLM endpoints (so one user cannot burn the shared free LLM quota).
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.security import decode_token


def ip_key(request: Request) -> str:
    return get_remote_address(request) or "unknown"


def user_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and len(auth) < 2100:
        payload = decode_token(auth[7:], request.app.state.settings.jwt_secret)
        if payload and isinstance(payload.get("sub"), str):
            return f"user:{payload['sub']}"
    return f"ip:{ip_key(request)}"


limiter = Limiter(key_func=ip_key, headers_enabled=False)

LOGIN_LIMIT = "5/minute;20/hour"
REGISTER_LIMIT = "3/minute;20/hour"
REDEEM_LIMIT = "5/15minute"
# Per verified user: protects the free LLM quota.
LLM_LIMIT = "10/minute;60/day"
