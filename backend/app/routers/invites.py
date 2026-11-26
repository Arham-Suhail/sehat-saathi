"""Invite codes: an elder shares a 6-digit code; family/doctor redeem it to get read access.

Brute-force protection: IP rate limit (5 / 15 min) + per-account lockout after 5 wrong codes
(30 min). Codes expire after 24 h (TTL index) and regenerating replaces the old code.

Audit F2: a code works ONCE (claimed atomically on redeem), and the elder can revoke every
carer link at any time (POST /invites/revoke-all). Revocation is immediate because
get_current_user reloads the carer's links from the database on every request.
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.db import get_db
from app.ratelimit import REDEEM_LIMIT, global_key, global_redeem_limit, limiter
from app.schemas import ElderRef, InviteOut, RedeemIn
from app.security import require_role

router = APIRouter(tags=["invites"])

CODE_TTL = timedelta(hours=24)
MAX_FAILS = 5
LOCKOUT = timedelta(minutes=30)
GENERIC_BAD_CODE = "Code ghalat hai ya purana ho gaya. Buzurg se naya code mangwayein."


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)) -> InviteOut:
    now = datetime.now(UTC)
    await db.invites.delete_many({"elder_id": user["_id"]})
    for _ in range(10):
        code = f"{secrets.randbelow(1_000_000):06d}"
        doc = {
            "elder_id": user["_id"],
            "code": code,
            "expires_at": now + CODE_TTL,
            "used_by": [],
            "created_at": now,
        }
        try:
            await db.invites.insert_one(doc)
            return InviteOut(code=code, expires_at=doc["expires_at"])
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=503, detail="Code nahi ban saka, dobara koshish karein")


@router.post("/invites/redeem", response_model=ElderRef)
@limiter.limit(REDEEM_LIMIT)
@limiter.limit(global_redeem_limit, key_func=global_key)
async def redeem_invite(
    request: Request,
    body: RedeemIn,
    user: dict = Depends(require_role("family", "doctor")),
    db: Any = Depends(get_db),
) -> ElderRef:
    now = datetime.now(UTC)
    locked = HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Bohat ghalat koshishen. 30 minute baad dobara koshish karein.",
        headers={"Retry-After": str(int(LOCKOUT.total_seconds()))},
    )

    async def lock() -> None:
        await db.users.update_one(
            {"_id": user["_id"]}, {"$set": {"invite_fail_count": 0, "invite_locked_until": now + LOCKOUT}}
        )

    # Audit F3: reserve this attempt atomically BEFORE looking at the code, in the database
    # (never from the user document loaded at auth time), so parallel guesses can't race
    # past MAX_FAILS. The filter also refuses while the account is locked.
    reserved = await db.users.find_one_and_update(
        {
            "_id": user["_id"],
            "$or": [{"invite_locked_until": None}, {"invite_locked_until": {"$lte": now}}],
        },
        {"$inc": {"invite_fail_count": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if reserved is None:
        raise locked
    attempt = int(reserved.get("invite_fail_count") or 0)
    if attempt > MAX_FAILS:  # parallel requests beyond the allowance
        await lock()
        raise locked

    # Atomic claim: the first successful redeem deletes the code, so it can never be reused.
    invite = await db.invites.find_one_and_delete({"code": body.code, "expires_at": {"$gt": now}})
    if not invite:
        if attempt >= MAX_FAILS:
            await lock()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_BAD_CODE)

    elder = await db.users.find_one({"_id": invite["elder_id"], "role": "elder"})
    if not elder:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_BAD_CODE)

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$addToSet": {"linked_elder_ids": elder["_id"]},
            "$set": {"invite_fail_count": 0, "invite_locked_until": None, "updated_at": now},
        },
    )
    return ElderRef(id=str(elder["_id"]), name=elder["name"])


@router.post("/invites/revoke-all")
async def revoke_all_carers(user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)) -> dict:
    """Remove this elder from every carer's links and kill any unused code."""
    res = await db.users.update_many(
        {"linked_elder_ids": user["_id"]},
        {"$pull": {"linked_elder_ids": user["_id"]}, "$set": {"updated_at": datetime.now(UTC)}},
    )
    await db.invites.delete_many({"elder_id": user["_id"]})
    return {"removed": res.modified_count}


@router.get("/carer/elders", response_model=list[ElderRef])
async def linked_elders(
    user: dict = Depends(require_role("family", "doctor")), db: Any = Depends(get_db)
) -> list[ElderRef]:
    ids = user.get("linked_elder_ids") or []
    if not ids:
        return []
    docs = await db.users.find({"_id": {"$in": ids}, "role": "elder"}).to_list(length=50)
    return [ElderRef(id=str(d["_id"]), name=d["name"]) for d in docs]
