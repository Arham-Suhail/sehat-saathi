"""Care alerts for family / doctors (see services/care.py) and the prescriptions list (diagnosis as
written). Elders never read alerts: a concern about them goes to their carers quietly."""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_db
from app.ids import parse_object_id
from app.security import get_current_user, require_role, resolve_elder_access
from app.services.care import ACKABLE, open_for

router = APIRouter(tags=["care"])

RECENT = timedelta(days=7)


def _jsonable(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items() if k != "for_user"}
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=UTC)).isoformat()
    if hasattr(v, "binary"):  # ObjectId
        return str(v)
    return v


def alert_out(doc: dict, user: dict, names: dict) -> dict:
    done = doc.get("resolved") or user["_id"] in (doc.get("acked_by") or [])
    return {
        "id": str(doc["_id"]),
        "elder_id": str(doc["elder_id"]),
        "elder_name": names.get(doc["elder_id"], ""),
        "kind": doc["kind"],
        "severity": doc["severity"],
        "data": _jsonable(doc.get("data") or {}),
        "created_at": _jsonable(doc["created_at"]),
        "open": not done,
        "resolved": bool(doc.get("resolved")),
        "resolved_by": doc.get("resolved_by"),
        "can_mark_read": doc["kind"] in ACKABLE,
    }


@router.get("/alerts")
async def list_alerts(
    include_done: bool = False,
    user: dict = Depends(require_role("family", "doctor")),
    db: Any = Depends(get_db),
) -> list[dict]:
    """Open alerts first (urgent on top), then, if asked, the last 7 days of finished ones."""
    linked = list(user.get("linked_elder_ids") or [])
    docs = await db.alerts.find(open_for(user)).sort("created_at", -1).to_list(length=200)
    if include_done:
        seen = {d["_id"] for d in docs}
        recent = (
            await db.alerts.find(
                {
                    "elder_id": {"$in": linked},
                    "created_at": {"$gte": datetime.now(UTC) - RECENT},
                    "$or": [{"data.for_user": {"$exists": False}}, {"data.for_user": user["_id"]}],
                }
            )
            .sort("created_at", -1)
            .to_list(length=200)
        )
        docs += [d for d in recent if d["_id"] not in seen]
    elders = await db.users.find({"_id": {"$in": linked}}, {"name": 1}).to_list(length=50)
    names = {e["_id"]: e["name"] for e in elders}
    order = {"urgent": 0, "important": 1, "normal": 2}
    out = [alert_out(d, user, names) for d in docs]
    out.sort(key=lambda a: (not a["open"], order.get(a["severity"], 3), -_ts(a["created_at"])))
    return out


def _ts(iso: str) -> float:
    return datetime.fromisoformat(iso).timestamp()


@router.post("/alerts/{alert_id}/read")
async def mark_read(
    alert_id: str, user: dict = Depends(require_role("family", "doctor")), db: Any = Depends(get_db)
) -> dict:
    aid = parse_object_id(alert_id)
    doc = await db.alerts.find_one(
        {"_id": aid, "elder_id": {"$in": list(user.get("linked_elder_ids") or [])}}
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    if doc["kind"] not in ACKABLE:  # a medicine check closes only when the medicine is confirmed
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pehle dawai ki tasdeeq karein")
    await db.alerts.update_one({"_id": aid}, {"$addToSet": {"acked_by": user["_id"]}})
    return {"ok": True}


@router.get("/prescriptions")
async def list_prescriptions(
    elder_id: str | None = Query(None, max_length=24),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[dict]:
    """Prescriptions the elder saved: diagnosis as written + the medicines from it."""
    target = resolve_elder_access(user, elder_id, "read")
    docs = await db.prescriptions.find({"elder_id": target}).sort("created_at", -1).to_list(length=30)
    return [
        {
            "id": str(d["_id"]),
            "diagnosis_text": d.get("diagnosis_text"),
            "diagnosis_unclear": bool(d.get("diagnosis_unclear")),
            "medicine_ids": [str(m) for m in d.get("medicine_ids") or []],
            "created_at": _jsonable(d["created_at"]),
        }
        for d in docs
    ]
