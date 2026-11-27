import hashlib
import hmac
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
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
from app.schemas import (
    DeleteAccountIn,
    ForgotPasswordIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    SignupVerifyIn,
    TokenOut,
    UserOut,
    VerifyEmailIn,
)
from app.security import create_access_token, get_current_user, hash_password, verify_password
from app.services.email_codes import CODE_TTL, check_code, issue_code
from app.services.signup import start_signup, take_signup

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger(__name__)

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
        email_verified=bool(user.get("email_verified")),
    )


def _token_response(request: Request, user: dict) -> TokenOut:
    token, ttl = create_access_token(
        user["_id"], user["role"], request.app.state.settings, ver=int(user.get("token_version") or 0)
    )
    return TokenOut(access_token=token, expires_in=ttl, user=user_out(user))


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(REGISTER_LIMIT)
@limiter.limit(global_register_limit, key_func=global_key)
async def register(request: Request, body: RegisterIn, db: Any = Depends(get_db)) -> TokenOut:
    """One-step sign-up, only while email is OFF. With email on, sign-up is code-first
    (/auth/register/start + /auth/register/verify) so made-up emails can't create accounts."""
    if request.app.state.email_sender is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=SIGNUP_NEEDS_CODE)
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


@router.post("/register/start", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(REGISTER_LIMIT)
@limiter.limit(global_register_limit, key_func=global_key)
async def register_start(request: Request, body: RegisterIn, db: Any = Depends(get_db)) -> dict:
    """Step 1 of code-first sign-up: check the email's domain can receive mail, then email a code.
    No account exists yet. The answer is the same whether or not the email is already registered
    (an existing account gets no email and its code can never verify), so accounts can't be probed."""
    _email_on(request)
    email = body.email.lower()
    if not await request.app.state.mx_check(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMAIL_CANT_RECEIVE)
    if await db.users.find_one({"email": email}, {"_id": 1}) is None:
        code = await start_signup(
            db,
            name=body.name,
            email=email,
            password_hash=hash_password(body.password),
            role=body.role,
            secret=request.app.state.settings.jwt_secret,
        )
        message_id = await request.app.state.email_sender(email, "signup", code, CODE_MINUTES)
        if not message_id:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=EMAIL_SEND_FAILED)
        await db.pending_signups.update_one({"email": email}, {"$set": {"message_id": message_id}})
    return {"sent": True, "minutes": CODE_MINUTES}


@router.get("/register/status")
@limiter.limit("40/15minute")
async def register_status(
    request: Request,
    email: str = Query(..., min_length=3, max_length=254),
    db: Any = Depends(get_db),
) -> dict:
    """Did the sign-up code bounce? The page asks every few seconds after step 1. Only ever answers
    "bounced" or not: never "delivered", and an existing account (no email sent) looks the same as a
    new one, so nothing about accounts can be learned. A bounce ends that pending sign-up."""
    _email_on(request)
    pending = await db.pending_signups.find_one({"email": email.strip().lower()}, {"message_id": 1})
    mid = (pending or {}).get("message_id")
    checker = getattr(request.app.state.email_sender, "bounced", None)
    bounced = False
    if mid and checker is not None:
        try:
            bounced = await checker(mid)
        except Exception as e:  # the status check must never break sign-up
            log.warning("bounce check failed: %s", type(e).__name__)
    if bounced:
        await db.pending_signups.delete_one({"_id": pending["_id"]})
    return {"bounced": bounced}


@router.post("/register/verify", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/15minute")
async def register_verify(request: Request, body: SignupVerifyIn, db: Any = Depends(get_db)) -> TokenOut:
    """Step 2: the right code creates the (already verified) account and logs in."""
    _email_on(request)
    email = body.email.lower()
    pending = await take_signup(db, email, body.code, request.app.state.settings.jwt_secret)
    if not pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=BAD_CODE)
    now = datetime.now(UTC)
    doc = {
        "name": pending["name"],
        "email": email,
        "password_hash": pending["password_hash"],
        "role": pending["role"],
        "email_verified": True,
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

# ---------- email codes (verify email, forgot password) ----------
EMAIL_OFF = "Nahi mila"
BAD_CODE = "Code ghalat hai ya purana ho gaya. Naya code mangwayein."
SIGNUP_NEEDS_CODE = "Account banane ke liye email par aaya code chahiye. App dobara kholein."
EMAIL_CANT_RECEIVE = "Is email address par email nahi ja sakti. Apna sahi email likhein."
EMAIL_SEND_FAILED = "Email nahi ja saka. Thori dair baad koshish karein."
CODE_MINUTES = int(CODE_TTL.total_seconds() // 60)


async def _send_code(request: Request, db: Any, user: dict, purpose: str) -> bool:
    """Issue a code and email it. False (never an exception) if email is off or the send fails."""
    sender = request.app.state.email_sender
    if sender is None:
        return False
    code = await issue_code(db, user["_id"], purpose, request.app.state.settings.jwt_secret)
    return await sender(user["email"], purpose, code, CODE_MINUTES)


def _email_on(request: Request) -> None:
    if request.app.state.email_sender is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=EMAIL_OFF)


@router.get("/email-config")
async def email_config(request: Request) -> dict:
    """Public: lets the UI show or hide the email features. Reveals nothing else."""
    return {"enabled": request.app.state.email_sender is not None}


@me_router.post("/me/verify-email/send", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/15minute;10/day", key_func=user_key)
async def send_verify_code(
    request: Request, user: dict = Depends(get_current_user), db: Any = Depends(get_db)
) -> Response:
    _email_on(request)
    if not user.get("email_verified") and not await _send_code(request, db, user, "verify"):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=EMAIL_SEND_FAILED)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@me_router.post("/me/verify-email", response_model=UserOut)
@limiter.limit("10/15minute", key_func=user_key)
async def verify_email(
    request: Request,
    body: VerifyEmailIn,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> UserOut:
    _email_on(request)
    if user.get("email_verified"):
        return user_out(user)
    ok = await check_code(db, user["_id"], "verify", body.code, request.app.state.settings.jwt_secret)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=BAD_CODE)
    now = datetime.now(UTC)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"email_verified": True, "updated_at": now}})
    return user_out({**user, "email_verified": True})


@router.post("/password/forgot", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/15minute;20/day")
async def forgot_password(request: Request, body: ForgotPasswordIn, db: Any = Depends(get_db)) -> Response:
    """Always the same answer, whether or not the email exists or is verified (no account probing).
    A code is only emailed to VERIFIED addresses (soft verification, user decision Nov 27)."""
    _email_on(request)
    user = await db.users.find_one({"email": body.email.lower()})
    if user and user.get("email_verified"):
        await _send_code(request, db, user, "reset")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/15minute")
async def reset_password(request: Request, body: ResetPasswordIn, db: Any = Depends(get_db)) -> Response:
    """Code + new password. Same generic error for unknown email, unverified email or a wrong code.
    Success ends every existing session (token_version bump, checked in get_current_user)."""
    _email_on(request)
    user = await db.users.find_one({"email": body.email.lower()})
    secret = request.app.state.settings.jwt_secret
    if (
        not user
        or not user.get("email_verified")
        or not await check_code(db, user["_id"], "reset", body.code, secret)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=BAD_CODE)
    now = datetime.now(UTC)
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "password_changed_at": now,
                "updated_at": now,
            },
            "$inc": {"token_version": 1},  # ends every earlier session (see get_current_user)
        },
    )
    # The per-email login lock no longer applies to the new password.
    await db.login_throttle.delete_one({"_id": _throttle_id(user["email"], secret)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
