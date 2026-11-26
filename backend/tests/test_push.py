"""Web Push: dose alarms when the app is closed, concern alerts to linked family/doctors."""

import base64
import json
from datetime import UTC, datetime, timedelta

import http_ece
import pytest
from aiohttp import web
from bson import ObjectId
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import ConfigError
from app.main import create_app
from app.push import RealSender, due_reminders_tick, validate_endpoint
from app.ratelimit import limiter
from tests.conftest import auth, make_settings, register


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def vapid_pair() -> tuple[str, str]:
    k = ec.generate_private_key(ec.SECP256R1())
    raw = k.private_numbers().private_value.to_bytes(32, "big")
    pub = k.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return b64u(raw), b64u(pub)


PRIV, PUB = vapid_pair()
PUSH = {"vapid_private_key": PRIV, "vapid_public_key": PUB, "vapid_subject": "https://app.example"}
FCM = "https://fcm.googleapis.com/fcm/send/abc123"


class FakeSender:
    def __init__(self, result="ok"):
        self.sent, self.result = [], result

    async def __call__(self, sub: dict, payload: dict) -> str:
        self.sent.append((sub["endpoint"], payload))
        return self.result


@pytest.fixture
async def papp(db):
    limiter.reset()
    app = create_app(make_settings(**PUSH), db=db)
    app.state.push_sender = FakeSender()
    return app


@pytest.fixture
async def pclient(papp):
    import httpx

    t = httpx.ASGITransport(app=papp, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=t, base_url="http://test") as c:
        yield c
    limiter.reset()


def sub_body(endpoint=FCM, **over):
    body = {"endpoint": endpoint, "keys": {"p256dh": b64u(b"\x04" + b"k" * 64), "auth": b64u(b"a" * 16)}}
    body.update(over)
    return body


# ---------- endpoint validation (SSRF: the server will POST to this URL) ----------
@pytest.mark.parametrize(
    "url",
    [
        "https://fcm.googleapis.com/fcm/send/x",
        "https://updates.push.services.mozilla.com/wpush/v2/x",
        "https://web.push.apple.com/QGx",
        "https://wns2-par02p.notify.windows.com/w/?token=x",
    ],
)
def test_real_push_services_allowed(url):
    assert validate_endpoint(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "http://fcm.googleapis.com/fcm/send/x",  # not https
        "https://evil.example/x",
        "https://fcm.googleapis.com.evil.example/x",
        "https://169.254.169.254/latest/meta-data",
        "https://localhost/x",
        "https://user:pw@fcm.googleapis.com/x",
        "https://fcm.googleapis.com:8443/x",
        "https://" + "a" * 1000 + ".fcm.googleapis.com/x",
    ],
)
def test_other_endpoints_rejected(url):
    with pytest.raises(ValueError):
        validate_endpoint(url)


async def test_subscribe_rejects_bad_input(pclient):
    u = await register(pclient, "elder")
    h = auth(u["token"])
    for body in (
        sub_body("https://evil.example/x"),
        sub_body(extra="x"),
        {"endpoint": FCM, "keys": {"p256dh": "not base64 !!", "auth": "x"}},
        {"endpoint": FCM},
    ):
        assert (await pclient.post("/push/subscribe", json=body, headers=h)).status_code == 422, body
    assert (await pclient.post("/push/subscribe", json=sub_body())).status_code == 401


async def test_config_reports_public_key_only(pclient):
    u = await register(pclient, "family")
    r = await pclient.get("/push/config", headers=auth(u["token"]))
    assert r.status_code == 200 and r.json() == {"enabled": True, "public_key": PUB}
    assert PRIV not in r.text


async def test_push_disabled_without_vapid(client):
    u = await register(client, "elder")
    assert (await client.get("/push/config", headers=auth(u["token"]))).json() == {
        "enabled": False,
        "public_key": None,
    }
    assert (
        await client.post("/push/subscribe", json=sub_body(), headers=auth(u["token"]))
    ).status_code == 404


# ---------- subscription ownership ----------
async def test_same_browser_moves_to_the_latest_login_and_unsubscribe_is_owner_only(pclient, db):
    a, b = await register(pclient, "elder"), await register(pclient, "family")
    assert (
        await pclient.post("/push/subscribe", json=sub_body(), headers=auth(a["token"]))
    ).status_code == 204
    assert (
        await pclient.post("/push/subscribe", json=sub_body(), headers=auth(b["token"]))
    ).status_code == 204
    docs = await db.push_subscriptions.find({}).to_list(10)
    assert [str(d["user_id"]) for d in docs] == [b["user"]["id"]]  # one row, now owned by b
    # a can't remove b's subscription
    await pclient.post("/push/unsubscribe", json={"endpoint": FCM}, headers=auth(a["token"]))
    assert await db.push_subscriptions.count_documents({}) == 1
    assert (
        await pclient.post("/push/unsubscribe", json={"endpoint": FCM}, headers=auth(b["token"]))
    ).status_code == 204
    assert await db.push_subscriptions.count_documents({}) == 0


async def test_at_most_five_devices_per_user(pclient, db):
    u = await register(pclient, "elder")
    for i in range(7):
        r = await pclient.post("/push/subscribe", json=sub_body(f"{FCM}{i}"), headers=auth(u["token"]))
        assert r.status_code == 204
    assert await db.push_subscriptions.count_documents({"user_id": ObjectId(u["user"]["id"])}) == 5


# ---------- dose alarms (scheduler tick) ----------
async def _elder_with_dose(pclient, db, minutes_ago=1, status="confirmed"):
    e = await register(pclient, "elder")
    eid = ObjectId(e["user"]["id"])
    med = await db.medicines.insert_one(
        {
            "elder_id": eid,
            "name": "Panadol",
            "dose_text": "1 goli",
            "status": status,
            "reminder_mode": "fixed",
            "timings": ["09:00"],
            "created_at": datetime.now(UTC),
        }
    )
    rem = await db.reminders.insert_one(
        {
            "elder_id": eid,
            "medicine_id": med.inserted_id,
            "status": "pending",
            "acted_at": None,
            "scheduled_at": datetime.now(UTC) - timedelta(minutes=minutes_ago),
            "created_at": datetime.now(UTC),
        }
    )
    await pclient.post("/push/subscribe", json=sub_body(f"{FCM}-{eid}"), headers=auth(e["token"]))
    return e, rem.inserted_id


async def test_due_dose_is_pushed_once_to_that_elder_only(pclient, papp, db):
    e, rem_id = await _elder_with_dose(pclient, db)
    other = await register(pclient, "elder")
    await pclient.post("/push/subscribe", json=sub_body(f"{FCM}-other"), headers=auth(other["token"]))
    sender = papp.state.push_sender
    await due_reminders_tick(db, sender, datetime.now(UTC))
    await due_reminders_tick(db, sender, datetime.now(UTC))  # second tick: no duplicate
    assert len(sender.sent) == 1
    endpoint, payload = sender.sent[0]
    assert endpoint == f"{FCM}-{e['user']['id']}"
    assert (
        payload["type"] == "reminder"
        and "Panadol" in payload["body"]
        and payload["tag"] == "sehat-saathi-dose"
    )
    assert payload["url"] == "/elder/reminders"


async def test_stopped_medicine_and_stale_reminders_are_not_pushed(pclient, papp, db):
    await _elder_with_dose(pclient, db, status="stopped")
    await _elder_with_dose(pclient, db, minutes_ago=45)
    await due_reminders_tick(db, papp.state.push_sender, datetime.now(UTC))
    assert papp.state.push_sender.sent == []


async def test_expired_subscription_is_deleted(pclient, papp, db):
    await _elder_with_dose(pclient, db)
    papp.state.push_sender.result = "gone"
    await due_reminders_tick(db, papp.state.push_sender, datetime.now(UTC))
    assert await db.push_subscriptions.count_documents({}) == 0


# ---------- concern alerts to family / doctor ----------
async def test_concern_checkin_alerts_linked_carers_only(pclient, papp, db):
    elder = await register(pclient, "elder")
    linked, stranger = await register(pclient, "family"), await register(pclient, "doctor")
    limiter.reset()
    code = (await pclient.post("/invites", headers=auth(elder["token"]))).json()["code"]
    await pclient.post("/invites/redeem", json={"code": code}, headers=auth(linked["token"]))
    for who in (elder, linked, stranger):
        await pclient.post(
            "/push/subscribe", json=sub_body(f"{FCM}-{who['user']['id']}"), headers=auth(who["token"])
        )
    sender = papp.state.push_sender

    await pclient.post("/checkins/text", json={"message": "theek hoon"}, headers=auth(elder["token"]))
    assert sender.sent == []  # no concern, no alert

    r = await pclient.post(
        "/checkins/text", json={"message": "seene mein dard hai"}, headers=auth(elder["token"])
    )
    assert r.json()["concern_flag"] is True
    assert [e for e, _ in sender.sent] == [f"{FCM}-{linked['user']['id']}"]
    payload = sender.sent[0][1]
    assert payload["type"] == "concern" and payload["url"] == f"/carer/elder/{elder['user']['id']}"
    assert "dard" not in payload["body"]  # lock-screen text stays generic

    sender.sent.clear()
    await pclient.post("/invites/revoke-all", headers=auth(elder["token"]))
    await pclient.post(
        "/checkins/text", json={"message": "seene mein dard hai"}, headers=auth(elder["token"])
    )
    assert sender.sent == []


# ---------- the real sender: encryption + VAPID, verified by decrypting ----------
async def test_real_sender_encrypts_and_signs(aiohttp_unused_port=None):
    browser = ec.generate_private_key(ec.SECP256R1())
    browser_pub = browser.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    auth_secret = b"0123456789abcdef"
    seen = {}

    async def handler(request):
        seen["headers"] = dict(request.headers)
        seen["body"] = await request.read()
        return web.Response(status=seen.get("reply", 201))

    server = web.Application()
    server.router.add_post("/push", handler)
    runner = web.AppRunner(server)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    try:
        sender = RealSender(make_settings(**PUSH))
        sub = {
            "endpoint": f"http://127.0.0.1:{port}/push",
            "keys": {"p256dh": b64u(browser_pub), "auth": b64u(auth_secret)},
        }
        assert await sender(sub, {"type": "reminder", "title": "Dawai ka waqt", "body": "Panadol"}) == "ok"
        assert seen["headers"]["Content-Encoding"] == "aes128gcm"
        assert (
            seen["headers"]["Authorization"].startswith("vapid t=")
            and f"k={PUB}" in seen["headers"]["Authorization"]
        )
        clear = http_ece.decrypt(
            seen["body"], private_key=browser, auth_secret=auth_secret, version="aes128gcm"
        )
        assert json.loads(clear) == {"type": "reminder", "title": "Dawai ka waqt", "body": "Panadol"}

        seen["reply"] = 410
        assert await sender(sub, {"type": "x"}) == "gone"
    finally:
        await runner.cleanup()


# ---------- config ----------
def test_half_vapid_config_fails_fast():
    with pytest.raises(ConfigError):
        make_settings(vapid_public_key=PUB)
    with pytest.raises(ConfigError):
        make_settings(vapid_public_key=PUB, vapid_private_key=PRIV, vapid_subject="me@example.com")
