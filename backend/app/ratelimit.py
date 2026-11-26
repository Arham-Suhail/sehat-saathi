"""Rate limiting (slowapi, in-memory — correct for a single Render instance; resets on restart).

Keys: client IP for anonymous endpoints; verified user id for authenticated
LLM endpoints (so one user cannot burn the shared free LLM quota); one shared
"global" bucket for caps that must hold no matter how many IPs/accounts are used.

Client IP (audit F1): never the LEFTMOST X-Forwarded-For entry — the client writes that
one, and uvicorn --forwarded-allow-ips="*" would trust it. Use CF-Connecting-IP (set by
Cloudflare in front of Render, overwriting any client value), else the RIGHTMOST
X-Forwarded-For entry (appended by our edge proxy), else the socket peer.
"""

from fastapi import Request
from slowapi import Limiter

from app.security import decode_token


def client_ip(request: Request) -> str:
    cf = request.headers.get("cf-connecting-ip", "").strip()
    if cf:
        return cf[:64]
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        last = xff.split(",")[-1].strip()
        if last:
            return last[:64]
    return request.client.host if request.client else "unknown"


def ip_key(request: Request) -> str:
    return client_ip(request)


def global_key(request: Request) -> str:
    return "global"


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
# Global caps (all clients together). Read at request time so tests can lower them.
GLOBAL_REGISTER_LIMIT = "200/day"
GLOBAL_REDEEM_LIMIT = "60/hour"


def global_register_limit() -> str:
    return GLOBAL_REGISTER_LIMIT


def global_redeem_limit() -> str:
    return GLOBAL_REDEEM_LIMIT


# Per verified user: protects the free LLM quota.
LLM_LIMIT = "10/minute;60/day"
