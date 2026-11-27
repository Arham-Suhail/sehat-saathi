import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.db import get_db
from app.ratelimit import (
    LOGIN_LIMIT,
    REGISTER_LIMIT,
    global_key,
    global_register_limit,
    limiter,
    user_key,
)
from app.schemas import DeleteAccountIn, LoginIn, RegisterIn, TokenOut, UserOut
from app.security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_LOGIN_ERROR = "Email ya password ghalat hai"
GENERIC_REGISTER_ERROR = "Account nahi ban saka. Doosra email try karein ya login karein."
LOCKED_LOGIN_ERROR = "Bohat zyada ghalat koshishen. 15 minute baad dobara koshish karein."

# Per-email login throttle (audit F1): works no matter how many IPs an attacker rotates
# through. Counted for EVERY email, registered or not, so it never reveals which exist.
LOGIN_MAX_FAILS = 10
LOGIN_LOCK = timedelta(minutes=15)


def _throttle_id(email: str, secret: str) -> str:
    # Keyed hash: the collection never stores email addresses.
    return hmac.new(secret.encode(), email.encode(), hashlib.sha256).hexdigest()


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def user_out(user: dict) -> UserOut:
    return UserOut(
        id=str(user["_id"]),
        name=user["name"],
        email=user["email"],
        role=user["role"],
        linked_elder_ids=[str(x) for x in user.get("linked_elder_ids") or []],
    )


def _token_response(request: Request, user: dict) -> TokenOut:
    token, ttl = create_access_token(user["_id"], user["role"], request.app.state.settings)
    return TokenOut(access_token=token, expires_in=ttl, user=user_out(user))


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(REGISTER_LIMIT)
@limiter.limit(global_register_limit, key_func=global_key)
async def register(request: Request, body: RegisterIn, db: Any = Depends(get_db)) -> TokenOut:
    now = datetime.now(UTC)
    doc = {
        "name": body.name,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "role": body.role,
        "linked_elder_ids": [],
        "invite_fail_count": 0,
        "invite_locked_until": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        res = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_REGISTER_ERROR) from None
    doc["_id"] = res.inserted_id
    return _token_response(request, doc)


@router.post("/login", response_model=TokenOut)
@limiter.limit(LOGIN_LIMIT)
async def login(request: Request, body: LoginIn, db: Any = Depends(get_db)) -> TokenOut:
    email = body.email.lower()
    tid = _throttle_id(email, request.app.state.settings.jwt_secret)
    now = datetime.now(UTC)
    throttle = await db.login_throttle.find_one({"_id": tid})
    locked_until = _aware(throttle.get("locked_until")) if throttle else None
    if locked_until and locked_until > now:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=LOCKED_LOGIN_ERROR)

    user = await db.users.find_one({"email": email})
    ok = verify_password(body.password, user.get("password_hash") if user else None)
    if not user or not ok:
        doc = await db.login_throttle.find_one_and_update(
            {"_id": tid},
            {"$inc": {"fails": 1}, "$set": {"expires_at": now + timedelta(days=1)}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if doc["fails"] >= LOGIN_MAX_FAILS:
            await db.login_throttle.update_one(
                {"_id": tid}, {"$set": {"fails": 0, "locked_until": now + LOGIN_LOCK}}
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)
    if throttle:
        await db.login_throttle.delete_one({"_id": tid})
    return _token_response(request, user)


me_router = APIRouter(tags=["auth"])


@me_router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)) -> UserOut:
    return user_out(user)


WRONG_PASSWORD_ERROR = "Password ghalat hai"  # noqa: S105 - a user-facing message, not a secret


@me_router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(LOGIN_LIMIT, key_func=user_key)
async def delete_account(
    request: Request,
    body: DeleteAccountIn,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> Response:
    """Permanently delete the caller's own account and everything stored about them.

    Needs the password again. Elder: their medicines, reminders, check-ins, vitals, invite codes and
    push subscriptions are deleted, and every family/doctor link to them is removed. Family/doctor:
    their links and push subscriptions go with the account (the elders' data is untouched). Only the
    caller's own id is used in every query; existing tokens stop working because /me lookups fail.
    """
    if not verify_password(body.password, user.get("password_hash")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=WRONG_PASSWORD_ERROR)
    uid = user["_id"]
    if user.get("role") == "elder":
        for coll in ("medicines", "reminders", "checkins", "vitals", "invites"):
            await db[coll].delete_many({"elder_id": uid})
        await db.users.update_many({"linked_elder_ids": uid}, {"$pull": {"linked_elder_ids": uid}})
    await db.push_subscriptions.delete_many({"user_id": uid})
    await db.users.delete_one({"_id": uid})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
