"""Smaller care features (Nov 28 ideas list):

- messages        family / doctor write a short note to the elder ("Keep walking daily"); the elder
                  sees it on Home, labelled "from your doctor / family, not AI", and can send a heart back.
- medicine stock  doses left (refill reminder) and free-text side-effect notes per medicine.
- fall            the phone's "are you OK?" prompt after a possible fall went unanswered -> urgent alert.
- logout          revokes this token on the server (not only on the device).
- export / views  "download my data" (JSON) and "who viewed my data" (audit log, 90 days).
- app version     the Android app shows "new version available".

Every route: role + ownership checks (resolve_elder_access / require_role), Strict schemas with limits.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.db import get_db
from app.ids import parse_object_id
from app.schemas import FallIn, MedicineOut, MessageIn, NoteIn, StockIn
from app.security import get_current_user, require_role, resolve_elder_access
from app.services.care import raise_alert

router = APIRouter(tags=["extras"])

_app_latest = (3, 1)  # latest Android app version (major, minor)


def _iso(v: Any) -> Any:
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=UTC)).isoformat()
    return v


def _msg_out(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "text": d["text"],
        "from_name": d.get("from_name"),
        "from_role": d.get("from_role"),
        "hearted": bool(d.get("hearted_at")),
        "created_at": _iso(d["created_at"]),
    }


# ---------- messages to the elder ----------
@router.post("/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    body: MessageIn, user: dict = Depends(require_role("family", "doctor")), db: Any = Depends(get_db)
) -> dict:
    target = resolve_elder_access(user, body.elder_id, "read")
    doc = {
        "elder_id": target,
        "text": body.text,
        "from_id": user["_id"],
        "from_name": user["name"],
        "from_role": user["role"],
        "hearted_at": None,
        "created_at": datetime.now(UTC),
    }
    res = await db.messages.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _msg_out(doc)


@router.get("/messages")
async def list_messages(
    elder_id: str | None = Query(None, max_length=24),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[dict]:
    target = resolve_elder_access(user, elder_id, "read")
    since = datetime.now(UTC) - timedelta(days=30)
    docs = (
        await db.messages.find({"elder_id": target, "created_at": {"$gte": since}})
        .sort("created_at", -1)
        .to_list(length=30)
    )
    return [_msg_out(d) for d in docs]


@router.post("/messages/{message_id}/heart")
async def heart_message(
    message_id: str, user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)
) -> dict:
    mid = parse_object_id(message_id)
    res = await db.messages.update_one(
        {"_id": mid, "elder_id": user["_id"]}, {"$set": {"hearted_at": datetime.now(UTC)}}
    )
    if not res.matched_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    return {"ok": True}


# ---------- medicine stock (refill) + notes ----------
async def _med(db: Any, user: dict, medicine_id: str, elder_id: str | None) -> tuple[Any, dict]:
    target = resolve_elder_access(user, elder_id, "write")  # elder or family; doctors read-only
    mid = parse_object_id(medicine_id)
    med = await db.medicines.find_one({"_id": mid, "elder_id": target})
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    return target, med


@router.post("/medicines/{medicine_id}/stock", response_model=MedicineOut)
async def set_stock(
    medicine_id: str, body: StockIn, user: dict = Depends(get_current_user), db: Any = Depends(get_db)
) -> MedicineOut:
    from app.routers.medicines import medicine_out

    _, med = await _med(db, user, medicine_id, body.elder_id)
    await db.medicines.update_one(
        {"_id": med["_id"]},
        {"$set": {"doses_left": body.doses, "stock_set_at": datetime.now(UTC), "refill_alerted": False}},
    )
    return medicine_out(await db.medicines.find_one({"_id": med["_id"]}))


@router.post("/medicines/{medicine_id}/notes", response_model=MedicineOut)
async def add_note(
    medicine_id: str, body: NoteIn, user: dict = Depends(get_current_user), db: Any = Depends(get_db)
) -> MedicineOut:
    from app.routers.medicines import medicine_out

    # Notes: the elder, family AND the doctor may write (read access is enough).
    target = resolve_elder_access(user, body.elder_id, "read")
    mid = parse_object_id(medicine_id)
    med = await db.medicines.find_one({"_id": mid, "elder_id": target})
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    note = {"text": body.text, "by_name": user["name"], "by_role": user["role"], "at": datetime.now(UTC)}
    await db.medicines.update_one({"_id": mid}, {"$push": {"notes": {"$each": [note], "$slice": -50}}})
    return medicine_out(await db.medicines.find_one({"_id": mid}))


# ---------- possible fall, unanswered ----------
@router.post("/alerts/fall", status_code=status.HTTP_201_CREATED)
async def fall_alert(
    body: FallIn, request: Request, user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)
) -> dict:
    if body.answered:  # the elder said "I'm OK": nothing to send
        return {"ok": True, "sent": False}
    now = datetime.now(UTC)
    doc = await raise_alert(
        db,
        user["_id"],
        "concern",
        {"reason": "fall", "said": None, "channel": "fall"},
        dedupe_key=f"fall:{user['_id']}:{now.strftime('%Y%m%d%H%M')}",
        now=now,
    )
    if doc:
        from app.push import alerts_tick

        await alerts_tick(db, request.app.state.push_sender, now)
    return {"ok": True, "sent": bool(doc)}


# ---------- logout (server-side revoke) ----------
@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, user: dict = Depends(get_current_user), db: Any = Depends(get_db)) -> None:
    p = getattr(request.state, "token", None) or {}
    if p.get("jti"):
        exp = datetime.fromtimestamp(int(p.get("exp") or 0), UTC)
        await db.revoked_tokens.update_one(
            {"jti": p["jti"]}, {"$setOnInsert": {"jti": p["jti"], "expires_at": exp}}, upsert=True
        )


# ---------- download my data / who viewed it ----------
@router.get("/me/export")
async def export_my_data(user: dict = Depends(get_current_user), db: Any = Depends(get_db)) -> dict:
    """Everything the app holds about you, as JSON (no password hash, no tokens)."""
    out: dict[str, Any] = {
        "account": {"name": user["name"], "email": user["email"], "role": user["role"]},
        "exported_at": _iso(datetime.now(UTC)),
    }
    if user["role"] == "elder":
        eid = user["_id"]
        clean = lambda docs, drop=("elder_id",): [  # noqa: E731
            {
                k: (str(v) if k.endswith("_id") or k == "_id" else _iso(v))
                for k, v in d.items()
                if k not in drop
            }
            for d in docs
        ]
        out["medicines"] = clean(await db.medicines.find({"elder_id": eid}).to_list(length=200))
        since = datetime.now(UTC) - timedelta(days=60)
        out["doses"] = clean(
            await db.reminders.find({"elder_id": eid, "scheduled_at": {"$gte": since}}).to_list(length=3000),
            ("elder_id", "_counted", "push_sent", "push_n"),
        )
        out["checkins"] = clean(await db.checkins.find({"elder_id": eid}).to_list(length=500))
        out["vitals"] = clean(await db.vitals.find({"elder_id": eid}).to_list(length=500))
        out["prescriptions"] = clean(await db.prescriptions.find({"elder_id": eid}).to_list(length=50))
        out["emergency_contact"] = user.get("emergency_contact")
    return out


@router.get("/me/views")
async def who_viewed(user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)) -> list[dict]:
    docs = await db.views.find({"elder_id": user["_id"]}).sort("at", -1).to_list(length=50)
    return [{"name": d.get("viewer_name"), "role": d.get("viewer_role"), "at": _iso(d["at"])} for d in docs]


async def log_view(db: Any, viewer: dict, elder_id: Any) -> None:
    """Audit: a carer opened this elder's dashboard (at most one entry per 10 minutes)."""
    if viewer["_id"] == elder_id:
        return
    now = datetime.now(UTC)
    recent = await db.views.find_one(
        {"elder_id": elder_id, "viewer_id": viewer["_id"], "at": {"$gte": now - timedelta(minutes=10)}}
    )
    if not recent:
        await db.views.insert_one(
            {
                "elder_id": elder_id,
                "viewer_id": viewer["_id"],
                "viewer_name": viewer["name"],
                "viewer_role": viewer["role"],
                "at": now,
            }
        )


# ---------- app version ----------
@router.get("/app/version")
async def app_version() -> dict:
    return {"latest": ".".join(map(str, _app_latest))}
