"""Read-only carer dashboard data (also usable by the elder for themselves)."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.db import get_db
from app.routers.checkins import checkin_out
from app.routers.medicines import medicine_out
from app.routers.vitals import vital_out
from app.security import get_current_user, resolve_elder_access
from app.services.reminders import mark_missed
from app.services.schedule import PK_TZ

router = APIRouter(tags=["dashboard"])


def _local_day(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(PK_TZ).date().isoformat()


@router.get("/dashboard/{elder_id}")
async def dashboard(
    elder_id: str,
    days: int = Query(14, ge=1, le=60),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> dict:
    target = resolve_elder_access(user, elder_id, "read")
    elder = await db.users.find_one({"_id": target, "role": "elder"})
    now = datetime.now(UTC)
    since = now - timedelta(days=days)
    await mark_missed(db, target, now)

    checkins = (
        await db.checkins.find({"elder_id": target, "created_at": {"$gte": since}})
        .sort("created_at", -1)
        .to_list(length=200)
    )

    # Mood trend: average score per local day.
    mood_by_day: dict[str, list[int]] = defaultdict(list)
    for c in checkins:
        if c.get("kind") == "alert":  # a voice "alert my family" request, not a mood check-in
            continue
        mood_by_day[_local_day(c["created_at"])].append(c["mood_score"])
    mood_series = [
        {"date": d, "score": round(sum(v) / len(v), 2), "count": len(v)}
        for d, v in sorted(mood_by_day.items())
    ]

    # Adherence: reminders due so far in the window, grouped by local day.
    # Discontinued (D/c) orders never count towards adherence.
    discontinued = await db.medicines.distinct("_id", {"elder_id": target, "discontinued": True})
    rems = await db.reminders.find(
        {
            "elder_id": target,
            "medicine_id": {"$nin": discontinued},
            "scheduled_at": {"$gte": since, "$lte": now},
        }
    ).to_list(length=2000)
    adherence: dict[str, dict[str, int]] = defaultdict(
        lambda: {"taken": 0, "skipped": 0, "missed": 0, "pending": 0}
    )
    for r in rems:
        adherence[_local_day(r["scheduled_at"])][r["status"]] += 1
    adherence_series = [{"date": d, **v} for d, v in sorted(adherence.items())]
    totals = {k: sum(day[k] for day in adherence.values()) for k in ("taken", "skipped", "missed", "pending")}
    done = totals["taken"] + totals["skipped"] + totals["missed"]
    totals["adherence_pct"] = round(100 * totals["taken"] / done) if done else None

    vitals = await db.vitals.find({"elder_id": target}).sort("measured_at", -1).to_list(length=50)
    meds = await db.medicines.find({"elder_id": target, "status": "confirmed"}).to_list(length=50)

    return {
        "elder": {"id": str(target), "name": elder["name"] if elder else ""},
        "days": days,
        "checkins": [checkin_out(c).model_dump(mode="json") for c in checkins[:50]],
        "mood_series": mood_series,
        "concerns": sum(1 for c in checkins if c.get("concern_flag")),
        "adherence": adherence_series,
        "adherence_totals": totals,
        "vitals": [vital_out(v).model_dump(mode="json") for v in vitals],
        "medicines": [medicine_out(m).model_dump(mode="json") for m in meds],
        "can_add_vitals": user["role"] in ("elder", "family"),
    }
