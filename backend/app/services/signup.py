"""Code-first sign-up (user decision, Nov 27): the account is created only after the emailed code is
entered, so a made-up email can never create or use an account.

A pending sign-up holds the form (password already bcrypt-hashed) plus an HMAC of the code, for 15
minutes (TTL index), max 5 wrong tries, single use. Starting again for the same email replaces it.
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from typing import Any

from app.services.email_codes import CODE_TTL, MAX_ATTEMPTS


def _hash(code: str, email: str, secret: str) -> str:
    return hmac.new(secret.encode(), f"signup:{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def start_signup(db: Any, *, name: str, email: str, password_hash: str, role: str, secret: str) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(UTC)
    await db.pending_signups.update_one(
        {"email": email},
        {
            "$set": {
                "name": name,
                "password_hash": password_hash,
                "role": role,
                "code_hash": _hash(code, email, secret),
                "attempts": 0,
                "expires_at": now + CODE_TTL,
                "created_at": now,
            }
        },
        upsert=True,
    )
    return code


async def take_signup(db: Any, email: str, code: str, secret: str) -> dict | None:
    """The pending sign-up if the code is right (and removes it), else None. Attempts are counted
    atomically before comparing; the row dies after MAX_ATTEMPTS wrong codes."""
    row = await db.pending_signups.find_one_and_update(
        {"email": email, "attempts": {"$lt": MAX_ATTEMPTS}},
        {"$inc": {"attempts": 1}},
        return_document=True,
    )
    if not row or _aware(row["expires_at"]) <= datetime.now(UTC):
        return None
    if not hmac.compare_digest(row["code_hash"], _hash(code, email, secret)):
        if row["attempts"] >= MAX_ATTEMPTS:
            await db.pending_signups.delete_one({"_id": row["_id"]})
        return None
    await db.pending_signups.delete_one({"_id": row["_id"]})
    return row
