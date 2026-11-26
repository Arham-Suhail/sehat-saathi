"""Web Push: dose alarms when the app is closed, and concern alerts to linked family/doctors.

- Subscriptions (one per browser) live in `push_subscriptions`; the server only ever POSTs to
  real browser push services (allowlist below), never to an arbitrary URL (SSRF).
- A background loop (single Render instance, kept awake by the uptime monitor) pushes each due
  dose once (atomic `push_sent` claim), never for stopped or discontinued (D/c) medicines.
- Payloads are end-to-end encrypted to the browser (aes128gcm) and signed with our VAPID key.
  Lock-screen text stays generic for concern alerts (no symptoms).
"""

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import aiohttp
from py_vapid import Vapid
from pywebpush import WebPushException, webpush_async

from app.services.reminders import top_up
from app.texts import (
    PUSH_CONCERN_BODY,
    PUSH_CONCERN_TITLE,
    PUSH_DOSE_DEFAULT,
    PUSH_DOSE_TITLE,
    PUSH_ELDER_DEFAULT,
    pick,
)

log = logging.getLogger(__name__)

PUSH_HOSTS = {"fcm.googleapis.com", "web.push.apple.com"}  # Chrome/Edge(Android)/Samsung; Safari
PUSH_HOST_SUFFIXES = (".push.services.mozilla.com", ".notify.windows.com")  # Firefox; Edge (Windows)
MAX_ENDPOINT = 1000
DOSE_WINDOW = timedelta(minutes=10)  # catch-up after a restart; older doses are not pushed
TICK_SECONDS = 60
SEND_TIMEOUT = 10


def validate_endpoint(url: str) -> str:
    """Only https URLs of real browser push services. Raises ValueError otherwise."""
    if not isinstance(url, str) or len(url) > MAX_ENDPOINT:
        raise ValueError("bad push endpoint")
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if (
        parts.scheme != "https"
        or parts.username
        or parts.password
        or parts.port not in (None, 443)
        or not (host in PUSH_HOSTS or host.endswith(PUSH_HOST_SUFFIXES))
    ):
        raise ValueError("bad push endpoint")
    return url


class RealSender:
    """Encrypts + signs and POSTs one push. Returns 'ok', 'gone' (delete the subscription) or 'error'."""

    def __init__(self, settings: Any):
        self.vapid = Vapid.from_string(private_key=settings.vapid_private_key)
        self.subject = settings.vapid_subject

    async def __call__(self, sub: dict, payload: dict) -> str:
        try:
            await webpush_async(
                subscription_info=sub,
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=self.vapid,
                vapid_claims={"sub": self.subject},  # fresh dict: pywebpush adds aud/exp to it
                ttl=int(payload.get("ttl", 3600)),
                timeout=SEND_TIMEOUT,
            )
        except WebPushException as e:
            status = getattr(e.response, "status", None) or getattr(e.response, "status_code", None)
            if status in (404, 410):
                return "gone"
            log.warning("push failed: status %s", status)
            return "error"
        except (aiohttp.ClientError, TimeoutError, OSError) as e:
            log.warning("push failed: %s", type(e).__name__)
            return "error"
        return "ok"


async def notify_users(db: Any, sender: Any, user_ids: list, payload: Any) -> int:
    """Push to every browser of these users; drop subscriptions the push service says are gone.
    payload: a dict, or a function lang -> dict so each browser gets its own UI language."""
    if sender is None or not user_ids:
        return 0
    sent = 0
    subs = await db.push_subscriptions.find({"user_id": {"$in": user_ids}}).to_list(length=50)
    for s in subs:
        body = payload(s.get("lang", "roman")) if callable(payload) else payload
        result = await sender({"endpoint": s["endpoint"], "keys": s["keys"]}, body)
        if result == "gone":
            await db.push_subscriptions.delete_one({"_id": s["_id"]})
        elif result == "ok":
            sent += 1
    return sent


async def due_reminders_tick(db: Any, sender: Any, now: datetime) -> None:
    if sender is None:
        return
    elder_ids = await db.push_subscriptions.distinct("user_id", {"role": "elder"})
    if not elder_ids:
        return
    for eid in elder_ids:  # keep the 7-day reminder window filled even if the app is never opened
        await top_up(db, eid, now)
    excluded = await db.medicines.distinct(
        "_id", {"elder_id": {"$in": elder_ids}, "$or": [{"status": "stopped"}, {"discontinued": True}]}
    )
    due = await db.reminders.find(
        {
            "elder_id": {"$in": elder_ids},
            "status": "pending",
            "push_sent": {"$ne": True},
            "medicine_id": {"$nin": excluded},
            "scheduled_at": {"$gte": now - DOSE_WINDOW, "$lte": now},
        }
    ).to_list(length=500)
    for r in due:
        claimed = await db.reminders.find_one_and_update(
            {"_id": r["_id"], "push_sent": {"$ne": True}}, {"$set": {"push_sent": True}}
        )
        if not claimed:
            continue
        med = await db.medicines.find_one({"_id": r["medicine_id"], "elder_id": r["elder_id"]}) or {}
        dose = med.get("dose_text") or med.get("dose")

        def dose_payload(lang: str, med: dict = med, dose: str | None = dose) -> dict:
            name = med.get("name") or pick(PUSH_DOSE_DEFAULT, lang)  # medicine names stay as written
            return {
                "type": "reminder",
                "title": pick(PUSH_DOSE_TITLE, lang),
                "body": f"{name}{' — ' + dose if dose else ''}",
                "tag": "sehat-saathi-dose",  # same tag as the in-app alarm: never two alerts
                "url": "/elder/reminders",
                "ttl": 3600,
            }

        await notify_users(db, sender, [r["elder_id"]], dose_payload)


async def alert_carers_of_concern(db: Any, sender: Any, elder_id: Any) -> None:
    """A check-in was flagged: tell the elder's CURRENTLY linked family/doctors (generic text)."""
    if sender is None:
        return
    elder = await db.users.find_one({"_id": elder_id, "role": "elder"}) or {}
    carers = await db.users.find(
        {"linked_elder_ids": elder_id, "role": {"$in": ["family", "doctor"]}}, {"_id": 1}
    ).to_list(length=50)
    def concern_payload(lang: str) -> dict:
        name = elder.get("name") or pick(PUSH_ELDER_DEFAULT, lang)
        return {
            "type": "concern",
            "title": pick(PUSH_CONCERN_TITLE, lang),
            "body": f"{name}: {pick(PUSH_CONCERN_BODY, lang)}",
            "tag": f"concern-{elder_id}",
            "url": f"/carer/elder/{elder_id}",
            "ttl": 86400,
        }

    await notify_users(db, sender, [c["_id"] for c in carers], concern_payload)


async def push_loop(app: Any) -> None:
    while True:
        try:
            await due_reminders_tick(app.state.db, app.state.push_sender, datetime.now(UTC))
        except Exception as e:  # never let one bad tick stop the loop
            log.error("push tick failed: %s", type(e).__name__)
        await asyncio.sleep(TICK_SECONDS)
