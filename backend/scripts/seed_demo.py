"""Seed demo data: one elder, one family member, one doctor, linked, with 14 days of history.

FAKE DATA ONLY. Uses the same MONGODB_URI as the app (backend/.env).

    cd backend
    .venv/Scripts/python -m scripts.seed_demo            # create (refuses if demo users exist)
    .venv/Scripts/python -m scripts.seed_demo --reset    # delete previous demo data first

Passwords come from SEED_PASSWORD (env) or are generated and printed once.
"""

import argparse
import asyncio
import random
import secrets
import sys
from datetime import UTC, datetime, time, timedelta

from app.config import Settings
from app.db import ensure_indexes, make_client
from app.security import hash_password
from app.services.schedule import PK_TZ

DEMO_EMAILS = {
    "elder": "demo.elder@sehatsaathi.example",
    "family": "demo.family@sehatsaathi.example",
    "doctor": "demo.doctor@sehatsaathi.example",
}
NAMES = {"elder": "Amma Jaan (Demo)", "family": "Bilal (Demo)", "doctor": "Dr. Sana (Demo)"}

MEDS = [
    {
        "name": "Panadol",
        "strength": "500 mg",
        "dose": "1 tablet",
        "frequency": "1+0+1",
        "instructions": "khane ke baad",
        "timings": ["08:00", "21:00"],
    },
    {
        "name": "Omeprazole",
        "strength": "20 mg",
        "dose": "1 capsule",
        "frequency": "1+0+0",
        "instructions": "nashte se pehle",
        "timings": ["08:00"],
    },
    {
        "name": "Amlodipine",
        "strength": "5 mg",
        "dose": None,
        "frequency": "0+0+1",
        "instructions": None,
        "timings": ["21:00"],
        "confidence": 0.6,
        "needs_pharmacist": True,
    },
]
CHECKINS = [
    ("Alhamdulillah aaj acha hoon, subah walk ki", "good", False, None),
    ("Theek hoon, thori thakan hai", "okay", False, None),
    ("Aaj akela mehsoos ho raha hai", "low", False, None),
    ("Bilkul theek, beti ka phone aaya tha", "good", False, None),
    ("Kal raat chakkar aaye the", "okay", True, "chakkar / dizziness"),
    ("Acha hoon, khana waqt par khaya", "good", False, None),
    ("Ghutnon mein dard hai aaj", "low", True, "dard / pain"),
]


async def main(reset: bool) -> None:
    s = Settings()
    client = make_client(s.mongodb_uri)
    db = client[s.mongodb_db]
    await ensure_indexes(db)

    existing = await db.users.find({"email": {"$in": list(DEMO_EMAILS.values())}}).to_list(length=10)
    if existing and not reset:
        print("Demo users already exist. Re-run with --reset to recreate them.")
        await client.close()
        return
    if existing:
        ids = [u["_id"] for u in existing]
        for coll in ("medicines", "reminders", "checkins", "vitals", "invites"):
            await db[coll].delete_many({"elder_id": {"$in": ids}})
        await db.users.delete_many({"_id": {"$in": ids}})
        print("Removed previous demo data.")

    import os

    password = os.environ.get("SEED_PASSWORD") or secrets.token_urlsafe(10)
    now = datetime.now(UTC)
    rng = random.Random(42)  # noqa: S311 - fake demo data, not security

    users = {}
    for role, email in DEMO_EMAILS.items():
        doc = {
            "name": NAMES[role],
            "email": email,
            "password_hash": hash_password(password),
            "role": role,
            "linked_elder_ids": [],
            "invite_fail_count": 0,
            "invite_locked_until": None,
            "created_at": now,
            "updated_at": now,
        }
        doc["_id"] = (await db.users.insert_one(doc)).inserted_id
        users[role] = doc
    elder_id = users["elder"]["_id"]
    await db.users.update_many(
        {"_id": {"$in": [users["family"]["_id"], users["doctor"]["_id"]]}},
        {"$set": {"linked_elder_ids": [elder_id]}},
    )

    start_day = (now - timedelta(days=13)).astimezone(PK_TZ).date()
    for m in MEDS:
        med = {
            "elder_id": elder_id,
            "form": "tablet",
            "timing_text": None,
            "duration": None,
            "duration_days": None,
            "confidence": 0.95,
            "needs_pharmacist": False,
            "edited_by_user": False,
            "status": "confirmed",
            "end_at": None,
            "created_at": now - timedelta(days=14),
            "updated_at": now,
            **m,
        }
        med["_id"] = (await db.medicines.insert_one(med)).inserted_id
        rems = []
        for d in range(16):  # 14 past days + today + tomorrow
            day = start_day + timedelta(days=d)
            for hhmm in med["timings"]:
                hh, mm = map(int, hhmm.split(":"))
                at = datetime.combine(day, time(hh, mm), tzinfo=PK_TZ).astimezone(UTC)
                if at < now - timedelta(hours=1):
                    roll = rng.random()
                    status = "taken" if roll < 0.8 else ("skipped" if roll < 0.88 else "missed")
                    acted = at + timedelta(minutes=rng.randint(2, 40)) if status != "missed" else None
                else:
                    status, acted = "pending", None
                rems.append(
                    {
                        "elder_id": elder_id,
                        "medicine_id": med["_id"],
                        "scheduled_at": at,
                        "status": status,
                        "acted_at": acted,
                        "created_at": now,
                    }
                )
        await db.reminders.insert_many(rems)

    score = {"good": 3, "okay": 2, "low": 1}
    for d in range(14):
        text, mood, concern, reason = CHECKINS[d % len(CHECKINS)]
        at = datetime.combine(start_day + timedelta(days=d), time(10, rng.randint(0, 59)), tzinfo=PK_TZ)
        if at.astimezone(UTC) > now:
            continue
        reply = "Shukriya batane ka." + (" Apne doctor ya ghar walon se baat karein." if concern else "")
        await db.checkins.insert_one(
            {
                "elder_id": elder_id,
                "channel": rng.choice(["text", "speech", "text"]),
                "transcript": [
                    {"role": "ai", "text": "Assalam o Alaikum! Aaj aap kaisa mehsoos kar rahe hain?"},
                    {"role": "elder", "text": text},
                    {"role": "ai", "text": reply},
                ],
                "reply": reply,
                "wellness_tip": "Aaj thora paani zyada piyen.",
                "mood": mood,
                "mood_score": score[mood],
                "concern_flag": concern,
                "concern_reason": reason,
                "vapi_call_id": None,
                "created_at": at.astimezone(UTC),
            }
        )

    for d in range(0, 14, 2):
        at = datetime.combine(start_day + timedelta(days=d), time(9, 0), tzinfo=PK_TZ).astimezone(UTC)
        base = {
            "elder_id": elder_id,
            "measured_at": at,
            "note": None,
            "created_at": now,
            "entered_by": users["family"]["_id"] if d % 4 else elder_id,
            "entered_by_role": "family" if d % 4 else "elder",
        }
        await db.vitals.insert_many(
            [
                {
                    **base,
                    "type": "bp",
                    "systolic": rng.randint(122, 148),
                    "diastolic": rng.randint(78, 92),
                    "value": None,
                    "unit": "mmHg",
                },
                {
                    **base,
                    "type": "sugar",
                    "systolic": None,
                    "diastolic": None,
                    "value": float(rng.randint(105, 165)),
                    "unit": "mg/dL",
                },
            ]
        )

    await client.close()
    print("Demo data created (FAKE). Logins:")
    for role, email in DEMO_EMAILS.items():
        print(f"  {role:7} {email}")
    if not os.environ.get("SEED_PASSWORD"):
        print(f"  password (all three): {password}   <- shown once, not stored anywhere")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true")
    args = p.parse_args()
    try:
        asyncio.run(main(args.reset))
    except KeyboardInterrupt:
        sys.exit(1)
