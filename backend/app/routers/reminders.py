from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_db
from app.ids import parse_object_id
from app.schemas import ReminderOut
from app.security import require_role
from app.services.care import resolve_alerts
from app.services.medplan import meal_label
from app.services.reminders import dose_alert, mark_missed, top_up

router = APIRouter(prefix="/reminders", tags=["reminders"])


async def _out(db: Any, docs: list[dict]) -> list[ReminderOut]:
    med_ids = list({d["medicine_id"] for d in docs})
    meds = {m["_id"]: m for m in await db.medicines.find({"_id": {"$in": med_ids}}).to_list(length=200)}
    out = []
    for d in docs:
        m = meds.get(d["medicine_id"], {})
        out.append(
            ReminderOut(
                id=str(d["_id"]),
                medicine_id=str(d["medicine_id"]),
                medicine_name=m.get("name", "Dawai"),
                dose=m.get("dose_text") or m.get("dose"),
                instructions=meal_label(m.get("meal_timing")) or m.get("instructions") or None,
                meal_timing=m.get("meal_timing"),
                scheduled_at=d["scheduled_at"],
                status=d["status"],
                acted_at=d.get("acted_at"),
            )
        )
    return out


@router.get("/upcoming", response_model=list[ReminderOut])
async def upcoming(
    ahead_hours: int = Query(24, ge=1, le=168),
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> list[ReminderOut]:
    """Reminders from 12h ago to `ahead_hours` ahead (default 24h: what the in-app engine polls).
    The Android app asks for up to 7 days so it can schedule native alarms that ring even if the
    app isn't opened for a few days."""
    now = datetime.now(UTC)
    await top_up(db, user["_id"], now)
    await mark_missed(db, user["_id"], now)
    stopped = await db.medicines.distinct("_id", {"elder_id": user["_id"], "status": "stopped"})
    docs = (
        await db.reminders.find(
            {
                "elder_id": user["_id"],
                "medicine_id": {"$nin": stopped},
                "scheduled_at": {
                    "$gte": now - timedelta(hours=12),
                    "$lte": now + timedelta(hours=ahead_hours),
                },
            }
        )
        .sort("scheduled_at", 1)
        .to_list(length=500)
    )
    return await _out(db, docs)


@router.post("/{reminder_id}/{action}", response_model=ReminderOut)
async def act(
    reminder_id: str,
    action: Literal["taken", "skipped"],
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> ReminderOut:
    rid = parse_object_id(reminder_id)
    now = datetime.now(UTC)
    doc = await db.reminders.find_one_and_update(
        {"_id": rid, "elder_id": user["_id"], "scheduled_at": {"$lte": now + timedelta(hours=1)}},
        {"$set": {"status": action, "acted_at": now}},
        return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    prev = await db.reminders.find_one({"_id": rid}, {"_counted": 1})
    if action == "taken" and not (prev or {}).get("_counted"):
        # Refill tracking: one dose fewer left (counted once per reminder).
        await db.reminders.update_one({"_id": rid}, {"$set": {"_counted": True}})
        await db.medicines.update_one(
            {"_id": doc["medicine_id"], "doses_left": {"$gt": 0}}, {"$inc": {"doses_left": -1}}
        )
    if action == "skipped":
        await dose_alert(db, doc, "skipped", now)
    else:  # taken after all (e.g. marked late): the family no longer needs to chase this dose
        await resolve_alerts(
            db, {"kind": "missed_dose", "data.reminder_id": rid}, {"name": user["name"]}, now
        )
    return (await _out(db, [doc]))[0]
