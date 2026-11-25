"""Invite codes: an elder shares a 6-digit code; family/doctor redeem it to get read access.

Brute-force protection: IP rate limit (5 / 15 min) + per-account lockout after 5 wrong codes
(30 min). Codes expire after 24 h (TTL index) and regenerating replaces the old code.
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.errors import DuplicateKeyError

from app.db import get_db
from app.ratelimit import REDEEM_LIMIT, limiter
from app.schemas import ElderRef, InviteOut, RedeemIn
from app.security import require_role

router = APIRouter(tags=["invites"])

CODE_TTL = timedelta(hours=24)
MAX_FAILS = 5
LOCKOUT = timedelta(minutes=30)
GENERIC_BAD_CODE = "Code ghalat hai ya purana ho gaya. Buzurg se naya code mangwayein."


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


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
async def redeem_invite(
    request: Request,
    body: RedeemIn,
    user: dict = Depends(require_role("family", "doctor")),
    db: Any = Depends(get_db),
) -> ElderRef:
    now = datetime.now(UTC)
    locked_until = _aware(user.get("invite_locked_until"))
    if locked_until and locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bohat ghalat koshishen. 30 minute baad dobara koshish karein.",
        )

    invite = await db.invites.find_one({"code": body.code})
    if not invite or _aware(invite["expires_at"]) <= now:
        fails = int(user.get("invite_fail_count") or 0) + 1
        update: dict = {"invite_fail_count": fails}
        if fails >= MAX_FAILS:
            update = {"invite_fail_count": 0, "invite_locked_until": now + LOCKOUT}
        await db.users.update_one({"_id": user["_id"]}, {"$set": update})
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
    await db.invites.update_one({"_id": invite["_id"]}, {"$addToSet": {"used_by": user["_id"]}})
    return ElderRef(id=str(elder["_id"]), name=elder["name"])


@router.get("/carer/elders", response_model=list[ElderRef])
async def linked_elders(
    user: dict = Depends(require_role("family", "doctor")), db: Any = Depends(get_db)
) -> list[ElderRef]:
    ids = user.get("linked_elder_ids") or []
    if not ids:
        return []
    docs = await db.users.find({"_id": {"$in": ids}, "role": "elder"}).to_list(length=50)
    return [ElderRef(id=str(d["_id"]), name=d["name"]) for d in docs]
