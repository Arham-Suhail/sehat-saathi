import io

import httpx
import pytest
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

from app.config import Settings
from app.db import ensure_indexes
from app.main import create_app
from app.ratelimit import limiter

TEST_SECRET = "t" * 64


def make_settings(**overrides) -> Settings:
    base = {
        "env": "test",
        "jwt_secret": TEST_SECRET,
        "provider": "fake",
        "allowed_origins": "https://app.example",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


@pytest.fixture
async def db():
    client = AsyncMongoMockClient(tz_aware=True)
    database = client["sehat_test"]
    await ensure_indexes(database)
    return database


@pytest.fixture
async def app(db):
    limiter.reset()
    return create_app(make_settings(), db=db)


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    limiter.reset()


async def register(client, role="elder", email=None, name="Test User", password="pass-1234") -> dict:
    email = email or f"{role}-{id(object())}@example.com"
    r = await client.post(
        "/auth/register", json={"name": name, "email": email, "password": password, "role": role}
    )
    assert r.status_code == 201, r.text
    data = r.json()
    return {"token": data["access_token"], "user": data["user"], "email": email, "password": password}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def png_bytes(size=(64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 200, 200)).save(buf, format="PNG")
    return buf.getvalue()


def jpeg_bytes(size=(64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 50, 50)).save(buf, format="JPEG")
    return buf.getvalue()
