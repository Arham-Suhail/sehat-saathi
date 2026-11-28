"""Reminder rows: creation, rolling-window top-up and lazy 'missed' marking (no background jobs)."""

from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId

from app.services.care import raise_alert
from app.services.schedule import generate_reminder_times, window_end

MISSED_AFTER = timedelta(minutes=60)
# Only doses missed in the last day alert the family (old history, e.g. after a long outage, doesn't).
ALERT_WINDOW = timedelta(hours=24)


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
        if med.get("reminder_mode", "fixed") != "fixed" or not med.get("timings") or _on_hold(med):
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
    """Pending doses older than MISSED_AFTER become 'missed'; recent ones alert the family/doctor."""
    overdue = {"elder_id": elder_id, "status": "pending", "scheduled_at": {"$lt": now - MISSED_AFTER}}
    recent = await db.reminders.find(
        {**overdue, "scheduled_at": {"$lt": now - MISSED_AFTER, "$gte": now - ALERT_WINDOW}}
    ).to_list(length=200)
    await db.reminders.update_many(overdue, {"$set": {"status": "missed"}})
    for r in recent:
        await dose_alert(db, r, "missed", now)


async def dose_alert(db: Any, reminder: dict, outcome: str, now: datetime) -> None:
    """Tell the family/doctor about a missed or 'not taken' dose (once per dose)."""
    med = (
        await db.medicines.find_one({"_id": reminder["medicine_id"], "elder_id": reminder["elder_id"]}) or {}
    )
    if med.get("status") == "stopped":
        return
    await raise_alert(
        db,
        reminder["elder_id"],
        "missed_dose",
        {
            "reminder_id": reminder["_id"],
            "medicine_id": reminder["medicine_id"],
            "medicine_name": med.get("name") or "Dawai",
            "dose": med.get("dose_text") or med.get("dose"),
            "scheduled_at": reminder["scheduled_at"],
            "outcome": outcome,
        },
        dedupe_key=f"dose:{reminder['_id']}",
        now=now,
    )


def _on_hold(med: dict) -> bool:
    return bool((med.get("review") or {}).get("hold"))


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
