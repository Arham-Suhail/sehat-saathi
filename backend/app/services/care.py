"""Care alerts for family and doctors: things a linked carer must look at.

kinds
- concern      urgent: a check-in mentioned a symptom (chest pain, fall ...). The elder is NOT told that
               the family was alerted; the elder only hears "talk to your doctor".
- missed_dose  a dose was not marked taken within MISSED_AFTER, or the elder said "not taken".
- med_review   a prescription line was unclear, or the elder asked family/doctor to check it. Stays
               open until a family member or doctor confirms the medicine (POST /medicines/{id}/review).
- meeting      someone asked this carer to a meeting.

An alert is open for a carer while the carer is linked to the elder, has not marked it read
(acked_by) and it isn't resolved. Open alerts are pushed again and again (REPEAT_EVERY) until read,
up to MAX_PUSHES, by the background loop (app/push.py). `dedupe_key` (unique index) makes creating
the same alert twice a no-op, so lazy and background code paths can both call raise_alert().
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

KINDS = ("concern", "missed_dose", "med_review", "meeting", "vitals", "low_mood", "inactive", "refill")
# vitals    a reading outside a generic, code-set band ("general guide", never a diagnosis)
# low_mood  three days in a row with a "low" mood check-in
# inactive  no dose marked and no check-in for 24 hours (early warning: please check on them)
# refill    a medicine's doses left will run out within 3 days
SEVERITY = {
    "concern": "urgent",
    "med_review": "important",
    "missed_dose": "important",
    "meeting": "normal",
    "vitals": "important",
    "low_mood": "important",
    "inactive": "important",
    "refill": "normal",
}
REPEAT_EVERY = {
    "concern": timedelta(minutes=10),
    "med_review": timedelta(minutes=30),
    "missed_dose": timedelta(minutes=30),
    "meeting": timedelta(hours=6),
    "vitals": timedelta(hours=1),
    "low_mood": timedelta(hours=4),
    "inactive": timedelta(hours=2),
    "refill": timedelta(hours=12),
}
MAX_PUSHES = {
    "concern": 36,
    "med_review": 24,
    "missed_dose": 4,
    "meeting": 2,
    "vitals": 6,
    "low_mood": 3,
    "inactive": 6,
    "refill": 3,
}
# Read-only alerts: "mark as read" closes them for that carer. A review closes only when confirmed.
ACKABLE = {"concern", "missed_dose", "meeting", "vitals", "low_mood", "inactive", "refill"}


async def raise_alert(
    db: Any, elder_id: ObjectId, kind: str, data: dict, *, dedupe_key: str, now: datetime | None = None
) -> dict | None:
    now = now or datetime.now(UTC)
    doc = {
        "elder_id": elder_id,
        "kind": kind,
        "severity": SEVERITY[kind],
        "data": data,
        "dedupe_key": dedupe_key,
        "acked_by": [],
        "resolved": False,
        "resolved_at": None,
        "resolved_by": None,
        "push_count": 0,
        "last_push_at": None,
        "created_at": now,
    }
    try:
        res = await db.alerts.insert_one(doc)
    except DuplicateKeyError:
        return None
    doc["_id"] = res.inserted_id
    return doc


async def resolve_alerts(db: Any, query: dict, by: dict | None, now: datetime | None = None) -> None:
    await db.alerts.update_many(
        {**query, "resolved": False},
        {
            "$set": {
                "resolved": True,
                "resolved_at": now or datetime.now(UTC),
                "resolved_by": (by or {}).get("name"),
            }
        },
    )


def open_for(user: dict) -> dict:
    """Mongo filter: alerts this carer still has to look at."""
    return {
        "elder_id": {"$in": list(user.get("linked_elder_ids") or [])},
        "resolved": False,
        "acked_by": {"$ne": user["_id"]},
        "$or": [{"data.for_user": {"$exists": False}}, {"data.for_user": user["_id"]}],
    }


async def carers_of(db: Any, elder_id: ObjectId) -> list[dict]:
    return await db.users.find(
        {"linked_elder_ids": elder_id, "role": {"$in": ["family", "doctor"]}},
        {"_id": 1, "name": 1, "role": 1},
    ).to_list(length=50)


def push_due(alert: dict, now: datetime) -> bool:
    kind = alert["kind"]
    if alert.get("resolved") or alert.get("push_count", 0) >= MAX_PUSHES[kind]:
        return False
    last = alert.get("last_push_at")
    if last is None:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    return now - last >= REPEAT_EVERY[kind]
