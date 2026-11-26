"""Reminder rows: creation, rolling-window top-up and lazy 'missed' marking (no background jobs)."""

from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId

from app.services.schedule import generate_reminder_times, window_end

MISSED_AFTER = timedelta(minutes=60)


async def create_reminders(db: Any, med: dict, *, start: datetime, now: datetime) -> int:
    end = window_end(now, med.get("end_at"))
    times = generate_reminder_times(med["timings"], start=start, end=end)
    if not times:
        return 0
    docs = [
        {
            "elder_id": med["elder_id"],
            "medicine_id": med["_id"],
            "scheduled_at": t,
            "status": "pending",
            "acted_at": None,
            "created_at": now,
        }
        for t in times
    ]
    await db.reminders.insert_many(docs)
    return len(docs)


async def top_up(db: Any, elder_id: ObjectId, now: datetime) -> None:
    """Keep a 7-day window of reminders for every confirmed medicine."""
    meds = await db.medicines.find({"elder_id": elder_id, "status": "confirmed"}).to_list(length=50)
    for med in meds:
        # Only fixed-schedule medicines get home reminders (never IV/hospital, PRN or stopped).
        if med.get("reminder_mode", "fixed") != "fixed" or not med.get("timings"):
            continue
        end_at = med.get("end_at")
        if end_at is not None and _aware(end_at) <= now:
            continue
        last = await db.reminders.find_one(
            {"elder_id": elder_id, "medicine_id": med["_id"]}, sort=[("scheduled_at", -1)]
        )
        start = max(_aware(last["scheduled_at"]), now) if last else now
        if start < now + timedelta(days=2):
            med["end_at"] = _aware(end_at) if end_at else None
            await create_reminders(db, med, start=start, now=now)


async def mark_missed(db: Any, elder_id: ObjectId, now: datetime) -> None:
    await db.reminders.update_many(
        {"elder_id": elder_id, "status": "pending", "scheduled_at": {"$lt": now - MISSED_AFTER}},
        {"$set": {"status": "missed"}},
    )


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
