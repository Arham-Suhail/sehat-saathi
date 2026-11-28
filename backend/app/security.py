"""Password hashing, JWT issuing/verification and authorisation dependencies."""

import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_db
from app.ids import parse_object_id

BCRYPT_ROUNDS = 12
JWT_ALG = "HS256"
Role = Literal["elder", "family", "doctor"]

_bearer = HTTPBearer(auto_error=False)
_dummy_hash: bytes | None = None


# ---------- passwords ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("ascii")


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-ish time: always runs one bcrypt check, even for unknown users."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt(BCRYPT_ROUNDS))
    target = password_hash.encode("ascii") if password_hash else _dummy_hash
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"), target)
    except ValueError:
        return False
    return ok and password_hash is not None


# ---------- tokens ----------
def token_lifetime(role: str, settings: Any) -> timedelta:
    if role == "elder":
        return timedelta(days=settings.elder_token_days)
    return timedelta(hours=settings.carer_token_hours)


def create_access_token(user_id: ObjectId, role: str, settings: Any, ver: int = 0) -> tuple[str, int]:
    now = datetime.now(UTC)
    lifetime = token_lifetime(role, settings)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "jti": secrets.token_hex(8),
        "ver": int(ver),  # users.token_version at login; a password reset bumps it
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALG), int(lifetime.total_seconds())


def decode_token(token: str, secret: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=[JWT_ALG], options={"require": ["exp", "sub", "iat"]})
    except jwt.PyJWTError:
        return None


_UNAUTH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Dobara login karein",
    headers={"WWW-Authenticate": "Bearer"},
)


# "Not revoked" answers are remembered for 60 s (one database round trip less on almost every
# request). A logout on this server marks the token revoked here at once (remember_revoked).
_not_revoked: dict[str, float] = {}
_revoked_here: set[str] = set()


async def is_revoked(db: Any, jti: str) -> bool:
    if jti in _revoked_here:
        return True
    now = time.monotonic()
    if _not_revoked.get(jti, 0) > now:
        return False
    if await db.revoked_tokens.find_one({"jti": jti}, {"_id": 1}):
        _revoked_here.add(jti)
        return True
    if len(_not_revoked) > 5000:
        _not_revoked.clear()
    _not_revoked[jti] = now + 60
    return False


def remember_revoked(jti: str) -> None:
    _not_revoked.pop(jti, None)
    _revoked_here.add(jti)


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Any = Depends(get_db),
) -> dict:
    if creds is None or creds.scheme.lower() != "bearer" or len(creds.credentials) > 2048:
        raise _UNAUTH
    payload = decode_token(creds.credentials, request.app.state.settings.jwt_secret)
    if not payload:
        raise _UNAUTH
    sub = payload.get("sub")
    if not isinstance(sub, str) or not ObjectId.is_valid(sub) or len(sub) != 24:
        raise _UNAUTH
    user = await db.users.find_one({"_id": ObjectId(sub)})
    if not user:
        raise _UNAUTH
    # A password reset ends every earlier session: it bumps users.token_version, and tokens carry the
    # version they were issued with (JWTs can't be revoked otherwise). Old tokens without "ver" = 0.
    if int(payload.get("ver") or 0) != int(user.get("token_version") or 0):
        raise _UNAUTH
    # Logout revokes this one token server-side (revoked_tokens, TTL = token expiry).
    jti = payload.get("jti")
    if jti and await is_revoked(db, jti):
        raise _UNAUTH
    request.state.user_id = sub
    request.state.token = payload
    # "Last seen" for the family's elder card (written at most every 5 minutes).
    now = datetime.now(UTC)
    seen = user.get("last_seen_at")
    if seen is not None and seen.tzinfo is None:
        seen = seen.replace(tzinfo=UTC)
    if seen is None or now - seen > timedelta(minutes=5):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_seen_at": now}})
    return user


def require_role(*roles: Role):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ijazat nahi")
        return user

    return _dep


def resolve_elder_access(user: dict, elder_id: str | None, mode: Literal["read", "write"]) -> ObjectId:
    """Return the elder ObjectId the caller may act on, or raise 403/404.

    - elder: only themselves (elder_id may be omitted).
    - family: linked elders; read + write (write is only used for vitals).
    - doctor: linked elders; read only.
    """
    role = user.get("role")
    if role == "elder":
        if elder_id is not None and parse_object_id(elder_id) != user["_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ijazat nahi")
        return user["_id"]

    if elder_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    target = parse_object_id(elder_id)
    linked = user.get("linked_elder_ids") or []
    if target not in linked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ijazat nahi")
    if mode == "write" and role != "family":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ijazat nahi")
    return target


def allowed_elder_ids(user: dict) -> list[ObjectId]:
    """Elders this user may read: themselves (elder) or linked elders (carer)."""
    if user.get("role") == "elder":
        return [user["_id"]]
    return list(user.get("linked_elder_ids") or [])
