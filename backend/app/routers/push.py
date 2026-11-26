"""Browser push subscriptions. Any logged-in user may register their own browser."""

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import AfterValidator, StringConstraints

from app.db import get_db
from app.push import MAX_ENDPOINT, validate_endpoint
from app.ratelimit import limiter, user_key
from app.schemas import Strict
from app.security import get_current_user

router = APIRouter(prefix="/push", tags=["push"])

MAX_DEVICES = 5
Endpoint = Annotated[str, StringConstraints(max_length=MAX_ENDPOINT), AfterValidator(validate_endpoint)]


class PushKeys(Strict):
    p256dh: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{80,100}={0,2}$")]
    auth: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{16,32}={0,2}$")]


class SubscribeIn(Strict):
    endpoint: Endpoint
    keys: PushKeys
    lang: Literal["roman", "ur", "en"] = "roman"  # language of the notifications for this browser


class UnsubscribeIn(Strict):
    endpoint: Annotated[str, StringConstraints(max_length=MAX_ENDPOINT)]


@router.get("/config")
async def push_config(request: Request, _: dict = Depends(get_current_user)) -> dict:
    s = request.app.state.settings
    return {"enabled": s.push_enabled, "public_key": s.vapid_public_key if s.push_enabled else None}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/hour", key_func=user_key)
async def subscribe(
    request: Request, body: SubscribeIn, user: dict = Depends(get_current_user), db: Any = Depends(get_db)
) -> Response:
    if not request.app.state.settings.push_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    now = datetime.now(UTC)
    # One row per browser; if someone else logs in on this browser, it becomes theirs.
    await db.push_subscriptions.update_one(
        {"endpoint": body.endpoint},
        {
            "$set": {
                "user_id": user["_id"],
                "role": user["role"],
                "keys": body.keys.model_dump(),
                "lang": body.lang,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    mine = (
        await db.push_subscriptions.find({"user_id": user["_id"]})
        .sort([("updated_at", -1), ("_id", -1)])
        .to_list(length=50)
    )
    for old in mine[MAX_DEVICES:]:
        await db.push_subscriptions.delete_one({"_id": old["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: UnsubscribeIn, user: dict = Depends(get_current_user), db: Any = Depends(get_db)
) -> Response:
    await db.push_subscriptions.delete_one({"endpoint": body.endpoint, "user_id": user["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
