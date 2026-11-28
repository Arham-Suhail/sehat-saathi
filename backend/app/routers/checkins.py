from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status

from app.db import get_db
from app.llm import get_text
from app.push import alert_carers_of_concern
from app.ratelimit import LLM_LIMIT, limiter, llm_global, user_key
from app.schemas import CheckinOut, CheckinTextIn, CheckinVoiceIn
from app.security import get_current_user, require_role, resolve_elder_access
from app.services.care import raise_alert
from app.services.checkin import analyse
from app.services.translit import to_roman
from app.texts import GREETING, pick


def _display(text: str, lang: str) -> str:
    """What the elder's words look like when shown back: Roman UI transliterates Hindi script;
    the Urdu/English UIs show the text as sent (the browser already converted Hindi script)."""
    return to_roman(text) if lang == "roman" else text


router = APIRouter(prefix="/checkins", tags=["checkins"])
PK = ZoneInfo("Asia/Karachi")

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
    if doc["mood"] == "low":
        await low_mood_check(db, elder_id, now)
    return doc


async def low_mood_check(db: Any, elder_id, now: datetime) -> None:
    """Three Karachi days in a row whose check-ins were all "low" -> one gentle carer alert."""
    since = now - timedelta(days=3)
    docs = await db.checkins.find(
        {"elder_id": elder_id, "created_at": {"$gte": since}, "channel": {"$ne": "ok"}}
    ).to_list(length=100)
    by_day: dict[str, list[str]] = {}
    for c in docs:
        at = c["created_at"] if c["created_at"].tzinfo else c["created_at"].replace(tzinfo=UTC)
        by_day.setdefault(at.astimezone(PK).date().isoformat(), []).append(c["mood"])
    today = now.astimezone(PK).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(3)]
    if all(d in by_day and all(m == "low" for m in by_day[d]) for d in days):
        await raise_alert(
            db, elder_id, "low_mood", {"days": 3}, dedupe_key=f"low_mood:{elder_id}:{days[0]}", now=now
        )


def _alert_if_concern(request: Request, background: BackgroundTasks, db: Any, doc: dict) -> None:
    # After the response is sent: a slow push service never delays the elder's check-in.
    if doc["concern_flag"]:
        background.add_task(alert_carers_of_concern, db, request.app.state.push_sender, doc["elder_id"], doc)


@router.post("/text", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(LLM_LIMIT, key_func=user_key)
@llm_global
async def text_checkin(
    request: Request,
    body: CheckinTextIn,
    background: BackgroundTasks,
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> CheckinOut:
    result = await analyse(get_text(request), body.message, body.lang)
    transcript = [
        {"role": "ai", "text": pick(GREETING, body.lang)},
        {"role": "elder", "text": _display(body.message, body.lang)},
        {"role": "ai", "text": result["reply"]},
    ]
    doc = await _store(db, user["_id"], body.channel, transcript, result)
    _alert_if_concern(request, background, db, doc)
    return checkin_out(doc)


@router.post("/voice", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(LLM_LIMIT, key_func=user_key)
@llm_global
async def voice_checkin(
    request: Request,
    body: CheckinVoiceIn,
    background: BackgroundTasks,
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
    result = await analyse(get_text(request), elder_text, body.lang)  # original script: best for the LLM
    stored = [{"role": t["role"], "text": _display(t["text"], body.lang)} for t in kept]
    doc = await _store(db, user["_id"], "vapi", stored, result, body.vapi_call_id)
    _alert_if_concern(request, background, db, doc)
    return checkin_out(doc)


OK_REPLY = {
    "roman": "Shukriya! Aap ki family ko pata chal gaya ke aap theek hain.",
    "ur": "شکریہ! آپ کی فیملی کو پتہ چل گیا کہ آپ ٹھیک ہیں۔",
    "en": "Thank you! Your family can see you're OK today.",
}


@router.post("/ok", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
async def im_ok(
    lang: str = Query("roman", pattern="^(roman|ur|en)$"),
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> CheckinOut:
    """One-tap daily "I'm OK" (no AI): a good-mood check-in the family sees on the dashboard."""
    result = {
        "reply": pick(OK_REPLY, lang),
        "wellness_tip": "",
        "mood": "good",
        "mood_score": 3,
        "concern_flag": False,
        "concern_reason": None,
    }
    doc = await _store(db, user["_id"], "ok", [{"role": "elder", "text": "Main theek hoon"}], result)
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
