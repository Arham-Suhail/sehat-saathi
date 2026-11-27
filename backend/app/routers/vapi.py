"""Vapi voice tools: the browser binds a live call to the signed-in elder, then Vapi
calls this router during the conversation. Tool results are short Roman Urdu strings
that Chotu can speak. Medical advice stays out of scope: medicine times come only
from the elder's own confirmed app record.

Security: /vapi/tools has no user token (Vapi's servers call it), so it is OFF unless
VAPI_WEBHOOK_SECRET is set, and every call must carry that secret. Data is reachable only
through a call ID that the signed-in elder bound to themselves via /vapi/bind-call.
Safety: a voice command can MOVE an existing dose time but never add a dose."""

import hmac
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.db import get_db
from app.push import alert_carers_of_concern
from app.ratelimit import limiter, user_key
from app.schemas import Strict, Text
from app.security import require_role
from app.services.reminders import create_reminders, mark_missed, top_up
from app.services.schedule import PK_TZ, is_valid_hhmm

router = APIRouter(prefix="/vapi", tags=["vapi"])

CALL_BINDING_TTL = timedelta(hours=2)
DUE_WINDOW = timedelta(minutes=60)
NEXT_WINDOW = timedelta(days=7)


class BindCallIn(Strict):
    vapi_call_id: Text(100, 8)
    assistant_id: Text(100, 0) | None = None


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _clean(value: Any, limit: int = 300) -> str:
    return str(value or "").strip()[:limit]


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "haan", "han", "1"}
    return bool(value)


def _norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _time_label(dt: datetime, now: datetime) -> str:
    local = _aware(dt).astimezone(PK_TZ)
    now_local = now.astimezone(PK_TZ)
    hour12 = local.hour % 12 or 12
    if 5 <= local.hour < 12:
        part = "subah"
    elif 12 <= local.hour < 17:
        part = "dopahar"
    elif 17 <= local.hour < 21:
        part = "shaam"
    else:
        part = "raat"
    clock = f"{part} {hour12}:{local.minute:02d} baje"
    if local.date() == now_local.date():
        return f"aaj {clock}"
    if local.date() == now_local.date() + timedelta(days=1):
        return f"kal {clock}"
    return f"{local.day} {local.strftime('%B')} ko {clock}"


def _webhook_secret(request: Request) -> str:
    return (getattr(request.app.state.settings, "vapi_webhook_secret", None) or "").strip()


def _secret_ok(request: Request) -> bool:
    secret = _webhook_secret(request)
    if not secret:
        return False
    supplied = request.headers.get("x-vapi-secret") or ""
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        supplied = auth[7:].strip()
    return hmac.compare_digest(supplied.encode(), secret.encode())


async def _elder_for_call(db: Any, call_id: str) -> Any | None:
    if not call_id:
        return None
    binding = await db.vapi_calls.find_one({"call_id": call_id})
    if not binding:
        return None
    expires_at = binding.get("expires_at")
    if expires_at is not None and _aware(expires_at) < datetime.now(UTC):
        return None
    return binding.get("elder_id")


async def _next_medicine(db: Any, elder_id: Any) -> str:
    now = datetime.now(UTC)
    await top_up(db, elder_id, now)
    await mark_missed(db, elder_id, now)
    docs = (
        await db.reminders.find(
            {
                "elder_id": elder_id,
                "status": "pending",
                "scheduled_at": {"$gte": now - DUE_WINDOW, "$lte": now + NEXT_WINDOW},
            }
        )
        .sort("scheduled_at", 1)
        .to_list(length=50)
    )
    for doc in docs:
        med = await db.medicines.find_one({"_id": doc["medicine_id"], "elder_id": elder_id})
        if not med or med.get("status") != "confirmed":
            continue
        scheduled_at = _aware(doc["scheduled_at"])
        name = _clean(med.get("name") or "Dawai", 120)
        dose = _clean(med.get("dose_text") or med.get("dose"), 80)
        dose_part = f", dose {dose}" if dose else ""
        if scheduled_at <= now + timedelta(minutes=5):
            return f"App record ke mutabiq {name}{dose_part} ka waqt abhi hai."
        return f"App record ke mutabiq agli dawai {name}{dose_part} hai, {_time_label(scheduled_at, now)}."
    return "App record mein agli dawai ka waqt nahi mila."


async def _find_medicine(db: Any, elder_id: Any, medicine_name: str) -> tuple[dict | None, bool]:
    wanted = _norm(medicine_name)
    if not wanted:
        return None, False
    meds = await db.medicines.find({"elder_id": elder_id, "status": "confirmed"}).to_list(length=100)
    scored: list[tuple[int, dict]] = []
    for med in meds:
        if med.get("reminder_mode", "fixed") != "fixed":
            continue
        name = _norm(med.get("name"))
        if not name:
            continue
        if name == wanted:
            scored.append((3, med))
        elif name.startswith(wanted) or wanted.startswith(name):
            scored.append((2, med))
        elif wanted in name or name in wanted:
            scored.append((1, med))
    if not scored:
        return None, False
    best = max(score for score, _ in scored)
    winners = [med for score, med in scored if score == best]
    if len(winners) != 1:
        return None, True
    return winners[0], False


async def _set_alarm(db: Any, elder_id: Any, args: dict) -> str:
    """Move ONE existing dose time to a new time. Never adds a dose: the number of daily doses
    stays what the prescription / the elder confirmed in the app."""
    if not _truthy(args.get("confirmed")):
        return "Pehle dawai ka naam aur waqt confirm karein, phir main reminder set karunga."
    time_value = _clean(args.get("time"), 20)
    if not is_valid_hhmm(time_value):
        return "Waqt samajh nahi aaya. Waqt dobara saaf bataein, jaise subah 8 baje."
    med, ambiguous = await _find_medicine(db, elder_id, _clean(args.get("medicine_name"), 120))
    if ambiguous:
        return "Is naam se aik se zyada dawai mili. App mein dawai check karke dobara bataein."
    if not med:
        return "App record mein ye dawai nahi mili. App mein dawai check karein."
    current = sorted(set(med.get("timings") or []))
    if time_value in current:
        return f"{med.get('name')} ka reminder {time_value} par pehle se set hai."
    if not current:
        return "Is dawai ka waqt app mein set karein."
    old_time = _clean(args.get("old_time"), 20)
    if len(current) == 1:
        old_time = current[0]
    elif old_time not in current:
        options = " ya ".join(current)
        return f"{med.get('name')} ke {len(current)} waqt hain: {options}. Kaunsa waqt badalna hai?"
    timings = sorted((set(current) - {old_time}) | {time_value})
    now = datetime.now(UTC)
    update = {
        "timings": timings,
        "frequency_label": None,
        "edited_by_user": True,
        "updated_at": now,
    }
    await db.medicines.update_one({"_id": med["_id"], "elder_id": elder_id}, {"$set": update})
    await db.reminders.delete_many(
        {"elder_id": elder_id, "medicine_id": med["_id"], "status": "pending", "scheduled_at": {"$gt": now}}
    )
    await create_reminders(db, {**med, **update}, start=now, now=now)
    return f"Theek hai, {med.get('name')} ka reminder {old_time} se badal kar {time_value} kar diya hai."


async def _alert_family(
    db: Any, elder_id: Any, call_id: str, args: dict, background: BackgroundTasks, sender: Any
) -> str:
    if not _truthy(args.get("confirmed")):
        return "Pehle confirm karein ke ghar walon ko alert bhejna hai."
    reason = _clean(args.get("reason"), 300) or "Ghar walon ko alert bhejne ki darkhwast"
    # One family alert per call, so a looping assistant can't flood the family with pushes.
    if call_id and await db.checkins.find_one(
        {"elder_id": elder_id, "kind": "alert", "vapi_call_id": call_id}
    ):
        return "Ghar walon ko alert pehle hi bhej diya gaya hai."
    now = datetime.now(UTC)
    doc = {
        "elder_id": elder_id,
        "channel": "vapi",
        "kind": "alert",  # not a real check-in: kept out of the mood trend
        "transcript": [{"role": "elder", "text": reason}],
        "reply": "Ghar walon ko alert bhej diya gaya hai.",
        "wellness_tip": "",
        "mood": "low",
        "mood_score": 1,
        "concern_flag": True,
        "concern_reason": "Elder ne ghar walon ko alert bhejne ko kaha",
        "vapi_call_id": call_id or None,
        "created_at": now,
    }
    await db.checkins.insert_one(doc)
    background.add_task(alert_carers_of_concern, db, sender, elder_id)
    return "Ghar walon ko alert bhej diya gaya hai."


def _parse_args(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


@router.post("/bind-call", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute", key_func=user_key)
async def bind_call(
    request: Request,
    body: BindCallIn,
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> dict:
    now = datetime.now(UTC)
    existing = await db.vapi_calls.find_one({"call_id": body.vapi_call_id})
    if existing and existing.get("elder_id") != user["_id"]:
        expires_at = existing.get("expires_at")
        if expires_at is None or _aware(expires_at) >= now:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Call pehle se bandhi hui hai")
    await db.vapi_calls.update_one(
        {"call_id": body.vapi_call_id},
        {
            "$set": {
                "call_id": body.vapi_call_id,
                "elder_id": user["_id"],
                "assistant_id": body.assistant_id,
                "created_at": now,
                "expires_at": now + CALL_BINDING_TTL,
            }
        },
        upsert=True,
    )
    return {"ok": True}


@router.post("/tools")
async def vapi_tools(
    request: Request, background: BackgroundTasks, db: Any = Depends(get_db)
) -> JSONResponse:
    if not _webhook_secret(request):
        return JSONResponse({"detail": "Abhi dastiyab nahi"}, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    if not _secret_ok(request):
        return JSONResponse({"detail": "Ijazat nahi"}, status_code=status.HTTP_401_UNAUTHORIZED)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"detail": "Maloomat sahi nahi hai"}, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
        )
    message = body.get("message") if isinstance(body, dict) else None
    if not isinstance(message, dict):
        message = body if isinstance(body, dict) else {}
    if message.get("type") not in (None, "tool-calls"):
        return JSONResponse({"ok": True})

    call = message.get("call") if isinstance(message.get("call"), dict) else {}
    call_id = _clean(call.get("id") or message.get("callId") or message.get("call_id"), 100)
    expected_assistant = (getattr(request.app.state.settings, "vapi_assistant_id", None) or "").strip()
    assistant_id = _clean(call.get("assistantId") or call.get("assistant_id"), 100)
    if expected_assistant and assistant_id and assistant_id != expected_assistant:
        return JSONResponse({"detail": "Ijazat nahi"}, status_code=status.HTTP_401_UNAUTHORIZED)

    elder_id = await _elder_for_call(db, call_id)
    tool_calls = message.get("toolCallList") or message.get("toolCalls") or []
    if not isinstance(tool_calls, list):
        tool_calls = []

    results = []
    for tool_call in tool_calls[:10]:
        if not isinstance(tool_call, dict):
            continue
        tool_call_id = _clean(tool_call.get("id") or tool_call.get("toolCallId"), 120)
        function = tool_call.get("function") if isinstance(tool_call.get("function"), dict) else {}
        name = _clean(function.get("name") or tool_call.get("name"), 80)
        args = _parse_args(function.get("arguments") or tool_call.get("arguments") or tool_call.get("args"))
        if tool_call_id:
            previous = await db.vapi_tool_calls.find_one({"tool_call_id": tool_call_id})
            if previous:
                results.append({"toolCallId": tool_call_id, "result": previous["result"]})
                continue
        if elder_id is None:
            result = "Call app se dobara shuru karein, phir main app record dekh sakunga."
        elif name == "get_next_medicine":
            result = await _next_medicine(db, elder_id)
        elif name == "set_medicine_alarm":
            result = await _set_alarm(db, elder_id, args)
        elif name == "alert_family":
            result = await _alert_family(
                db, elder_id, call_id, args, background, request.app.state.push_sender
            )
        else:
            result = "Ye kaam main nahi kar sakta."
        if tool_call_id:
            try:
                await db.vapi_tool_calls.insert_one(
                    {
                        "tool_call_id": tool_call_id,
                        "call_id": call_id,
                        "elder_id": elder_id,
                        "tool_name": name,
                        "result": result,
                        "created_at": datetime.now(UTC),
                        "expires_at": datetime.now(UTC) + timedelta(days=1),
                    }
                )
            except Exception:
                previous = await db.vapi_tool_calls.find_one({"tool_call_id": tool_call_id})
                if previous:
                    result = previous["result"]
        results.append({"toolCallId": tool_call_id, "result": result})
    return JSONResponse({"results": results})
