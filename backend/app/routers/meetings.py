"""Meetings between an elder's circle and their doctor.

Who can meet whom (always about ONE elder, and always with a doctor in it):
- a doctor asks the patient and/or the family,
- an elder or a family member asks the doctor (family may include the elder too).
Everyone in the meeting must be the elder or a carer CURRENTLY linked to that elder.

Mode: video (a private Jitsi room link made here, or a link the organiser pastes from Google Meet /
Zoom / WhatsApp / Teams: only those https hosts, so a meeting can't carry an arbitrary link),
phone, or in person. Invitees accept or decline; the organiser can cancel.
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field

from app.db import get_db
from app.ids import parse_object_id
from app.schemas import OptText, Strict
from app.security import get_current_user
from app.services.care import raise_alert

router = APIRouter(prefix="/meetings", tags=["meetings"])

LINK_HOSTS = {
    "meet.jit.si",
    "meet.google.com",
    "zoom.us",
    "teams.microsoft.com",
    "teams.live.com",
    "chat.whatsapp.com",
    "call.whatsapp.com",
    "wa.me",
}
LINK_SUFFIXES = (".zoom.us",)
NOT_ALLOWED = "Ijazat nahi"
BAD_TIME = "Meeting ka waqt aane wala hona chahiye"
NEED_DOCTOR = "Meeting mein doctor ka hona zaroori hai"
BAD_LINK = "Yeh meeting link qabool nahi"


class MeetingIn(Strict):
    elder_id: Annotated[str, Field(max_length=24)] | None = None
    participant_ids: Annotated[list[Annotated[str, Field(max_length=24)]], Field(min_length=1, max_length=6)]
    starts_at: datetime
    duration_min: Literal[15, 30, 45, 60] = 30
    mode: Literal["video", "phone", "in_person"] = "video"
    reason: OptText(300) = None
    location: OptText(200) = None
    link: OptText(300) = None


class RespondIn(Strict):
    accept: bool


def _check_link(url: str) -> str:
    p = urlsplit(url)
    host = (p.hostname or "").lower()
    if (
        p.scheme != "https"
        or p.username
        or p.password
        or not (host in LINK_HOSTS or host.endswith(LINK_SUFFIXES))
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=BAD_LINK)
    return url


async def _circle(db, elder_id) -> dict:
    """{user_id: user} for the elder and every carer linked to them."""
    elder = await db.users.find_one({"_id": elder_id, "role": "elder"}, {"name": 1, "role": 1})
    if not elder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    carers = await db.users.find(
        {"linked_elder_ids": elder_id, "role": {"$in": ["family", "doctor"]}}, {"name": 1, "role": 1}
    ).to_list(length=50)
    return {u["_id"]: u for u in [elder, *carers]}


def _elder_for(user: dict, elder_id: str | None):
    if user["role"] == "elder":
        if elder_id and parse_object_id(elder_id) != user["_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ALLOWED)
        return user["_id"]
    if not elder_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    target = parse_object_id(elder_id)
    if target not in (user.get("linked_elder_ids") or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ALLOWED)
    return target


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def meeting_out(m: dict, user: dict, people: dict) -> dict:
    def person(uid):
        u = people.get(uid) or {}
        return {"id": str(uid), "name": u.get("name", ""), "role": u.get("role", "")}

    responses = m.get("responses") or {}
    return {
        "id": str(m["_id"]),
        "elder_id": str(m["elder_id"]),
        "organiser": person(m["created_by"]),
        "participants": [
            {**person(uid), "response": responses.get(str(uid), "pending")} for uid in m["participant_ids"]
        ],
        "starts_at": _aware(m["starts_at"]).isoformat(),
        "duration_min": m["duration_min"],
        "mode": m["mode"],
        "reason": m.get("reason"),
        "location": m.get("location"),
        "link": m.get("link"),
        "status": m["status"],
        "mine": m["created_by"] == user["_id"],
        "my_response": "organiser"
        if m["created_by"] == user["_id"]
        else responses.get(str(user["_id"]), "pending"),
    }


@router.get("/people")
async def people(
    elder_id: str | None = Query(None, max_length=24),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
) -> list[dict]:
    """Who the caller may invite for this elder (everyone in the circle except the caller)."""
    target = _elder_for(user, elder_id)
    circle = await _circle(db, target)
    return [
        {"id": str(uid), "name": u["name"], "role": u["role"]}
        for uid, u in circle.items()
        if uid != user["_id"]
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_meeting(body: MeetingIn, user: dict = Depends(get_current_user), db=Depends(get_db)) -> dict:
    target = _elder_for(user, body.elder_id)
    circle = await _circle(db, target)
    ids = list(dict.fromkeys(parse_object_id(p) for p in body.participant_ids))
    if user["_id"] in ids or any(i not in circle for i in ids):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ALLOWED)
    roles = [circle[i]["role"] for i in ids] + [user["role"]]
    if "doctor" not in roles or all(r == "doctor" for r in roles):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NEED_DOCTOR)
    now = datetime.now(UTC)
    starts = _aware(body.starts_at)
    if starts < now - timedelta(minutes=5) or starts > now + timedelta(days=90):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=BAD_TIME)
    link = None
    if body.mode == "video":
        link = (
            _check_link(body.link)
            if body.link
            else f"https://meet.jit.si/SehatSaathi-{secrets.token_urlsafe(12)}"
        )
    doc = {
        "elder_id": target,
        "created_by": user["_id"],
        "participant_ids": ids,
        "member_ids": [user["_id"], *ids],
        "starts_at": starts,
        "duration_min": body.duration_min,
        "mode": body.mode,
        "reason": body.reason,
        "location": body.location if body.mode == "in_person" else None,
        "link": link,
        "status": "scheduled",
        "responses": {},
        "created_at": now,
    }
    res = await db.meetings.insert_one(doc)
    doc["_id"] = res.inserted_id
    for uid in ids:
        if circle[uid]["role"] in ("family", "doctor"):
            await raise_alert(
                db,
                target,
                "meeting",
                {
                    "meeting_id": doc["_id"],
                    "for_user": uid,
                    "organiser": user["name"],
                    "starts_at": starts,
                    "mode": body.mode,
                },
                dedupe_key=f"meeting:{doc['_id']}:{uid}",
                now=now,
            )
    return meeting_out(doc, user, {**circle, user["_id"]: user})


@router.get("")
async def list_meetings(user: dict = Depends(get_current_user), db=Depends(get_db)) -> list[dict]:
    """The caller's meetings: upcoming first, then the last 14 days."""
    now = datetime.now(UTC)
    docs = (
        await db.meetings.find({"member_ids": user["_id"], "starts_at": {"$gte": now - timedelta(days=14)}})
        .sort("starts_at", 1)
        .to_list(length=100)
    )
    uids = {u for m in docs for u in m["member_ids"]}
    people_docs = await db.users.find({"_id": {"$in": list(uids)}}, {"name": 1, "role": 1}).to_list(
        length=200
    )
    people_map = {p["_id"]: p for p in people_docs}
    out = [meeting_out(m, user, people_map) for m in docs]
    upcoming = [m for m in out if datetime.fromisoformat(m["starts_at"]) >= now - timedelta(hours=1)]
    past = [m for m in out if m not in upcoming]
    return upcoming + list(reversed(past))


async def _mine(db, meeting_id: str, user: dict) -> dict:
    m = await db.meetings.find_one({"_id": parse_object_id(meeting_id), "member_ids": user["_id"]})
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    return m


@router.post("/{meeting_id}/respond")
async def respond(
    meeting_id: str, body: RespondIn, user: dict = Depends(get_current_user), db=Depends(get_db)
):
    m = await _mine(db, meeting_id, user)
    if m["created_by"] == user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ALLOWED)
    answer = "accepted" if body.accept else "declined"
    await db.meetings.update_one({"_id": m["_id"]}, {"$set": {f"responses.{user['_id']}": answer}})
    await db.alerts.update_many(
        {"kind": "meeting", "data.meeting_id": m["_id"], "data.for_user": user["_id"]},
        {"$addToSet": {"acked_by": user["_id"]}},
    )
    return {"ok": True, "response": answer}


@router.post("/{meeting_id}/cancel")
async def cancel(meeting_id: str, user: dict = Depends(get_current_user), db=Depends(get_db)):
    m = await _mine(db, meeting_id, user)
    if m["created_by"] != user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ALLOWED)
    await db.meetings.update_one({"_id": m["_id"]}, {"$set": {"status": "cancelled"}})
    await db.alerts.update_many(
        {"kind": "meeting", "data.meeting_id": m["_id"]},
        {"$set": {"resolved": True, "resolved_at": datetime.now(UTC)}},
    )
    return {"ok": True}
