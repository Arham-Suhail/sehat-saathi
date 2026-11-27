"""One-time 6-digit email codes (verify email, reset password).

Only a keyed hash of the code is stored (HMAC with the JWT secret), never the code itself. A code is
valid for CODE_TTL, allows MAX_ATTEMPTS wrong guesses and is single-use; asking again replaces it.
Mongo deletes expired rows on its own (TTL index on expires_at).
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from bson import ObjectId

Purpose = Literal["verify", "reset"]
CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5


def _hash(code: str, user_id: ObjectId, purpose: str, secret: str) -> str:
    msg = f"{purpose}:{user_id}:{code}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def issue_code(db: Any, user_id: ObjectId, purpose: Purpose, secret: str) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(UTC)
    await db.email_codes.update_one(
        {"user_id": user_id, "purpose": purpose},
        {
            "$set": {
                "code_hash": _hash(code, user_id, purpose, secret),
                "expires_at": now + CODE_TTL,
                "attempts": 0,
                "created_at": now,
            }
        },
        upsert=True,
    )
    return code


async def check_code(db: Any, user_id: ObjectId, purpose: Purpose, code: str, secret: str) -> bool:
    """True once for the right code; wrong guesses count, and the code dies after MAX_ATTEMPTS."""
    now = datetime.now(UTC)
    # Count the attempt atomically BEFORE comparing, so parallel guesses can't exceed the limit.
    row = await db.email_codes.find_one_and_update(
        {"user_id": user_id, "purpose": purpose, "attempts": {"$lt": MAX_ATTEMPTS}},
        {"$inc": {"attempts": 1}},
        return_document=True,
    )
    if not row or _aware(row["expires_at"]) <= now:
        return False
    if not hmac.compare_digest(row["code_hash"], _hash(code, user_id, purpose, secret)):
        if row["attempts"] >= MAX_ATTEMPTS:
            await db.email_codes.delete_one({"_id": row["_id"]})
        return False
    await db.email_codes.delete_one({"_id": row["_id"]})
    return True
