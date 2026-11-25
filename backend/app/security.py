"""Password hashing, JWT issuing/verification and authorisation dependencies."""

import secrets
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


def create_access_token(user_id: ObjectId, role: str, settings: Any) -> tuple[str, int]:
    now = datetime.now(UTC)
    lifetime = token_lifetime(role, settings)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "jti": secrets.token_hex(8),
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
    request.state.user_id = sub
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
