from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status

from app.db import get_db
from app.llm import get_text
from app.ratelimit import LLM_LIMIT, limiter, llm_global, user_key
from app.schemas import CheckinOut, CheckinTextIn, CheckinVoiceIn
from app.security import get_current_user, require_role, resolve_elder_access
from app.services.checkin import GREETING, analyse
from app.services.translit import to_roman

router = APIRouter(prefix="/checkins", tags=["checkins"])

MAX_VOICE_CHARS = 6000


def checkin_out(doc: dict) -> CheckinOut:
    return CheckinOut(
        id=str(doc["_id"]),
        created_at=doc["created_at"],
        channel=doc["channel"],
        transcript=[{"role": t["role"], "text": t["text"]} for t in doc.get("transcript", [])],
        reply=doc["reply"],
        wellness_tip=doc.get("wellness_tip", ""),
        mood=doc["mood"],
        mood_score=doc["mood_score"],
        concern_flag=doc["concern_flag"],
        concern_reason=doc.get("concern_reason"),
    )


async def _store(db: Any, elder_id, channel: str, transcript: list[dict], result: dict, call_id=None) -> dict:
    now = datetime.now(UTC)
    doc = {
        "elder_id": elder_id,
        "channel": channel,
        "transcript": transcript,
        "reply": result["reply"],
        "wellness_tip": result["wellness_tip"],
        "mood": result["mood"],
        "mood_score": result["mood_score"],
        "concern_flag": result["concern_flag"],
        "concern_reason": result["concern_reason"],
        "vapi_call_id": call_id,
        "created_at": now,
    }
    res = await db.checkins.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


@router.post("/text", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(LLM_LIMIT, key_func=user_key)
@llm_global
async def text_checkin(
    request: Request,
    body: CheckinTextIn,
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> CheckinOut:
    result = await analyse(get_text(request), body.message)
    transcript = [
        {"role": "ai", "text": GREETING},
        {"role": "elder", "text": to_roman(body.message)},  # the app shows Roman Urdu only
        {"role": "ai", "text": result["reply"]},
    ]
    doc = await _store(db, user["_id"], body.channel, transcript, result)
    return checkin_out(doc)


@router.post("/voice", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(LLM_LIMIT, key_func=user_key)
@llm_global
async def voice_checkin(
    request: Request,
    body: CheckinVoiceIn,
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> CheckinOut:
    """Transcript of a Vapi call, sent by the browser at call end. Mood is labelled here so
    mood labelling + concern detection live in one place."""
    turns = [t.model_dump() for t in body.transcript]
    total = 0
    kept = []
    for t in turns:
        total += len(t["text"])
        if total > MAX_VOICE_CHARS:
            break
        kept.append(t)
    elder_text = "\n".join(t["text"] for t in kept if t["role"] == "elder") or "(kuch nahi kaha)"
    result = await analyse(get_text(request), elder_text)  # original script: best for the LLM
    stored = [{"role": t["role"], "text": to_roman(t["text"])} for t in kept]  # Roman Urdu for display
    doc = await _store(db, user["_id"], "vapi", stored, result, body.vapi_call_id)
    return checkin_out(doc)


@router.get("", response_model=list[CheckinOut])
async def list_checkins(
    elder_id: str | None = Query(None, max_length=24),
    limit: int = Query(30, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[CheckinOut]:
    target = resolve_elder_access(user, elder_id, "read")
    docs = await db.checkins.find({"elder_id": target}).sort("created_at", -1).to_list(length=limit)
    return [checkin_out(d) for d in docs]
