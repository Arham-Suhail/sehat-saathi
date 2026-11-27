"""Database access. Production uses PyMongo's native async client; tests inject a mock."""

from typing import Any

from fastapi import Request
from pymongo import ASCENDING, AsyncMongoClient


def make_client(uri: str) -> AsyncMongoClient:
    return AsyncMongoClient(
        uri,
        serverSelectionTimeoutMS=8000,
        appname="sehat-saathi",
        tz_aware=True,
    )


async def ensure_indexes(db: Any) -> None:
    await db.users.create_index([("email", ASCENDING)], unique=True)
    await db.invites.create_index([("code", ASCENDING)], unique=True)
    await db.invites.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    await db.invites.create_index([("elder_id", ASCENDING)])
    await db.medicines.create_index([("elder_id", ASCENDING), ("status", ASCENDING)])
    await db.reminders.create_index([("elder_id", ASCENDING), ("scheduled_at", ASCENDING)])
    await db.checkins.create_index([("elder_id", ASCENDING), ("created_at", ASCENDING)])
    await db.vitals.create_index([("elder_id", ASCENDING), ("measured_at", ASCENDING)])
    await db.login_throttle.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    await db.push_subscriptions.create_index([("endpoint", ASCENDING)], unique=True)
    await db.push_subscriptions.create_index([("user_id", ASCENDING)])
    await db.email_codes.create_index([("user_id", ASCENDING), ("purpose", ASCENDING)], unique=True)
    await db.email_codes.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    await db.pending_signups.create_index([("email", ASCENDING)], unique=True)
    await db.pending_signups.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)


def get_db(request: Request) -> Any:
    return request.app.state.db
