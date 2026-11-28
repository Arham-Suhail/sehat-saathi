"""Read-only carer dashboard data (also usable by the elder for themselves)."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.db import get_db
from app.routers.checkins import checkin_out
from app.routers.extras import log_view
from app.routers.medicines import medicine_out
from app.routers.vitals import vital_out
from app.security import get_current_user, resolve_elder_access
from app.services.care import open_for
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
    await log_view(db, user, target)
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
    report = await _report(db, target, rems, now)
    rx = await db.prescriptions.find({"elder_id": target}).sort("created_at", -1).to_list(length=10)
    open_alerts = (
        await db.alerts.count_documents(open_for(user) | {"elder_id": target})
        if user["role"] != "elder"
        else 0
    )

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
        "report": report,
        "prescriptions": [
            {
                "id": str(p["_id"]),
                "diagnosis_text": p.get("diagnosis_text"),
                "diagnosis_unclear": bool(p.get("diagnosis_unclear")),
                "medicine_ids": [str(m) for m in p.get("medicine_ids") or []],
                "created_at": _aware(p["created_at"]).isoformat(),
            }
            for p in rx
        ],
        "open_alerts": open_alerts,
        "last_seen": _aware(elder["last_seen_at"]).isoformat()
        if elder and elder.get("last_seen_at")
        else None,
        "week_compare": await _week_compare(db, target, discontinued, now),
    }


async def _week_compare(db: Any, target: Any, discontinued: list, now: datetime) -> dict:
    """Taken % of doses due this week (last 7 days) vs the 7 days before."""
    rows = await db.reminders.find(
        {
            "elder_id": target,
            "medicine_id": {"$nin": discontinued},
            "scheduled_at": {"$gte": now - timedelta(days=14), "$lte": now},
            "status": {"$ne": "pending"},
        },
        {"scheduled_at": 1, "status": 1},
    ).to_list(length=3000)
    cut = now - timedelta(days=7)
    cur = [r for r in rows if _aware(r["scheduled_at"]) >= cut]
    prev = [r for r in rows if _aware(r["scheduled_at"]) < cut]

    def pct(xs: list) -> int | None:
        return round(100 * sum(1 for r in xs if r["status"] == "taken") / len(xs)) if xs else None

    return {"this_week": pct(cur), "last_week": pct(prev), "this_week_doses": len(cur)}


ON_TIME = timedelta(minutes=30)
SLOTS = (("morning", 5, 12), ("afternoon", 12, 16), ("evening", 16, 20), ("night", 20, 29))


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _slot(dt: datetime) -> str:
    h = _aware(dt).astimezone(PK_TZ).hour
    h = h + 24 if h < 5 else h
    return next(name for name, lo, hi in SLOTS if lo <= h < hi)


def _pct(part: int, whole: int) -> int | None:
    return round(100 * part / whole) if whole else None


async def _report(db: Any, elder_id: Any, rems: list[dict], now: datetime) -> dict:
    """Progress report for family / doctor: per medicine, per time of day, on-time rate, recent misses."""
    done = [r for r in rems if r["status"] in ("taken", "skipped", "missed")]
    names = {
        m["_id"]: m
        for m in await db.medicines.find({"_id": {"$in": list({r["medicine_id"] for r in rems})}}).to_list(
            length=100
        )
    }
    per_med: dict = defaultdict(lambda: {"taken": 0, "skipped": 0, "missed": 0, "on_time": 0})
    slots: dict = {name: {"taken": 0, "total": 0} for name, _, _ in SLOTS}
    on_time = 0
    for r in done:
        row = per_med[r["medicine_id"]]
        row[r["status"]] += 1
        slots[_slot(r["scheduled_at"])]["total"] += 1
        if r["status"] == "taken":
            slots[_slot(r["scheduled_at"])]["taken"] += 1
            acted = r.get("acted_at")
            if acted and _aware(acted) - _aware(r["scheduled_at"]) <= ON_TIME:
                row["on_time"] += 1
                on_time += 1
    taken = sum(1 for r in done if r["status"] == "taken")
    medicines = []
    for mid, row in per_med.items():
        m = names.get(mid, {})
        total = row["taken"] + row["skipped"] + row["missed"]
        medicines.append(
            {
                "medicine_id": str(mid),
                "name": m.get("name") or "Dawai",
                "strength": m.get("strength_text"),
                "active": m.get("status") == "confirmed",
                **row,
                "total": total,
                "pct": _pct(row["taken"], total),
            }
        )
    medicines.sort(key=lambda x: (x["pct"] is None, x["pct"] if x["pct"] is not None else 0))
    missed = sorted(
        (r for r in done if r["status"] != "taken"), key=lambda r: r["scheduled_at"], reverse=True
    )
    return {
        "doses_due": len(done),
        "taken": taken,
        "on_time_pct": _pct(on_time, taken),
        "per_medicine": medicines,
        "by_time_of_day": [
            {"slot": name, **slots[name], "pct": _pct(slots[name]["taken"], slots[name]["total"])}
            for name, _, _ in SLOTS
        ],
        "recent_missed": [
            {
                "medicine_name": names.get(r["medicine_id"], {}).get("name") or "Dawai",
                "scheduled_at": _aware(r["scheduled_at"]).isoformat(),
                "status": r["status"],
            }
            for r in missed[:10]
        ],
    }
