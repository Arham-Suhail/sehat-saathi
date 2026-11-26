"""Regression tests for docs/security/audit-findings.md (one section per finding)."""

import httpx
import pytest
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app import ratelimit
from tests.conftest import auth, register


# ---------- F1: rate limits must not trust a client-supplied X-Forwarded-For ----------
@pytest.fixture
async def proxied(app):
    """The app exactly as Render runs it: uvicorn --proxy-headers --forwarded-allow-ips="*"."""
    wrapped = ProxyHeadersMiddleware(app, trusted_hosts="*")
    transport = httpx.ASGITransport(app=wrapped, raise_app_exceptions=False, client=("10.0.0.1", 1234))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


BAD_LOGIN = {"email": "victim@example.com", "password": "wrong-pass"}


async def test_f1_spoofed_leftmost_xff_does_not_reset_login_limit(proxied):
    # The edge proxy appends the real client (203.0.113.9); the attacker rotates the leftmost entry.
    codes = [
        (
            await proxied.post(
                "/auth/login", json=BAD_LOGIN, headers={"X-Forwarded-For": f"6.6.6.{i}, 203.0.113.9"}
            )
        ).status_code
        for i in range(7)
    ]
    assert 429 in codes, codes


async def test_f1_cf_connecting_ip_is_the_client_key(proxied):
    codes = [
        (
            await proxied.post(
                "/auth/login",
                json=BAD_LOGIN,
                headers={"CF-Connecting-IP": "203.0.113.9", "X-Forwarded-For": f"6.6.{i}.6, 7.7.{i}.7"},
            )
        ).status_code
        for i in range(7)
    ]
    assert 429 in codes, codes


async def _failed_logins(client, email, n, ip_prefix):
    # A different client IP every time: only the per-account throttle can stop this.
    return [
        (
            await client.post(
                "/auth/login",
                json={"email": email, "password": f"guess-{i}-xx"},
                headers={"CF-Connecting-IP": f"{ip_prefix}.{i}"},
            )
        ).status_code
        for i in range(n)
    ]


async def test_f1_per_account_login_throttle_independent_of_ip(client):
    victim = await register(client, "elder")
    codes = await _failed_logins(client, victim["email"], 12, "198.51.100")
    assert codes[:10] == [401] * 10
    assert codes[10:] == [429, 429]
    # Locked means locked: even the right password waits out the lock.
    r = await client.post(
        "/auth/login",
        json={"email": victim["email"], "password": victim["password"]},
        headers={"CF-Connecting-IP": "192.0.2.200"},
    )
    assert r.status_code == 429


async def test_f1_login_throttle_does_not_reveal_which_emails_exist(client):
    victim = await register(client, "elder")
    known = await _failed_logins(client, victim["email"], 12, "198.51.100")
    unknown = await _failed_logins(client, "nobody-here@example.com", 12, "192.0.2")
    assert known == unknown


async def test_f1_successful_login_clears_failures(client):
    u = await register(client, "family")
    await _failed_logins(client, u["email"], 9, "198.51.100")
    ok = await client.post(
        "/auth/login",
        json={"email": u["email"], "password": u["password"]},
        headers={"CF-Connecting-IP": "192.0.2.50"},
    )
    assert ok.status_code == 200
    again = await _failed_logins(client, u["email"], 9, "192.0.2")
    assert again == [401] * 9  # counter restarted, not locked at failure #10 overall


async def test_f1_global_register_cap_across_ips(client, monkeypatch):
    monkeypatch.setattr(ratelimit, "GLOBAL_REGISTER_LIMIT", "2/minute")
    codes = [
        (
            await client.post(
                "/auth/register",
                json={"name": "X", "email": f"g{i}@example.com", "password": "pass-1234", "role": "family"},
                headers={"CF-Connecting-IP": f"198.51.100.{i}"},
            )
        ).status_code
        for i in range(3)
    ]
    assert codes == [201, 201, 429]


async def test_f1_global_redeem_cap_across_accounts_and_ips(client, monkeypatch):
    monkeypatch.setattr(ratelimit, "GLOBAL_REDEEM_LIMIT", "2/minute")
    carers = [await register(client, "family") for _ in range(3)]
    codes = [
        (
            await client.post(
                "/invites/redeem",
                json={"code": "999999"},
                headers={**auth(c["token"]), "CF-Connecting-IP": f"198.51.100.{i}"},
            )
        ).status_code
        for i, c in enumerate(carers)
    ]
    assert codes == [400, 400, 429]


# ---------- F2: single-use invite codes; the elder can revoke carer access ----------
async def _code(client, elder):
    return (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]


async def _redeem(client, code, carer):
    return await client.post("/invites/redeem", json={"code": code}, headers=auth(carer["token"]))


async def _get(client, path, user):
    return (await client.get(path, headers=auth(user["token"]))).status_code


async def test_f2_invite_code_is_single_use(client):
    elder = await register(client, "elder")
    code = await _code(client, elder)
    first, second = await register(client, "family"), await register(client, "doctor")
    assert (await _redeem(client, code, first)).status_code == 200
    r = await client.post("/invites/redeem", json={"code": code}, headers=auth(second["token"]))
    assert r.status_code == 400
    assert await _get(client, f"/dashboard/{elder['user']['id']}", second) == 403


async def test_f2_new_code_does_not_cut_existing_carers(client):
    elder = await register(client, "elder")
    fam, doc = await register(client, "family"), await register(client, "doctor")
    await _redeem(client, await _code(client, elder), fam)
    await _redeem(client, await _code(client, elder), doc)
    for c in (fam, doc):
        assert await _get(client, f"/dashboard/{elder['user']['id']}", c) == 200


async def test_f2_elder_revokes_all_carers_immediately(client):
    elder, other_elder = await register(client, "elder"), await register(client, "elder")
    fam = await register(client, "family")
    for e in (elder, other_elder):
        await _redeem(client, await _code(client, e), fam)
    pending = await _code(client, elder)  # an unused code must die too

    r = await client.post("/invites/revoke-all", headers=auth(elder["token"]))
    assert r.status_code == 200 and r.json() == {"removed": 1}
    # Same (still valid) carer token: access is gone on the very next request.
    assert await _get(client, f"/dashboard/{elder['user']['id']}", fam) == 403
    assert await _get(client, f"/vitals?elder_id={elder['user']['id']}", fam) == 403
    # Only this elder's link is removed.
    left = (await client.get("/carer/elders", headers=auth(fam["token"]))).json()
    assert [x["id"] for x in left] == [other_elder["user"]["id"]]
    ratelimit.limiter.reset()  # 4th registration from the test IP; not what this test is about
    newcomer = await register(client, "doctor")
    r = await client.post("/invites/redeem", json={"code": pending}, headers=auth(newcomer["token"]))
    assert r.status_code == 400


async def test_f2_only_elders_can_revoke(client):
    for role in ("family", "doctor"):
        u = await register(client, role)
        assert (await client.post("/invites/revoke-all", headers=auth(u["token"]))).status_code == 403
    assert (await client.post("/invites/revoke-all")).status_code == 401


# ---------- F3: the invite lockout counter must hold under parallel guesses ----------
async def test_f3_parallel_wrong_codes_cannot_exceed_lockout(client, db, monkeypatch):
    import asyncio

    from bson import ObjectId

    carer = await register(client, "family")
    # Simulate network latency so every request reads the user document before any write lands.
    coll_cls = type(db.users)
    original = coll_cls.find_one

    async def slow_find_one(self, *a, **k):
        doc = await original(self, *a, **k)
        await asyncio.sleep(0.02)
        return doc

    monkeypatch.setattr(coll_cls, "find_one", slow_find_one)

    async def guess(i):
        r = await client.post(
            "/invites/redeem",
            json={"code": f"{900000 + i}"},
            headers={**auth(carer["token"]), "CF-Connecting-IP": f"198.51.100.{i}"},
        )
        return r.status_code

    codes = await asyncio.gather(*(guess(i) for i in range(10)))
    assert codes.count(400) <= 5, codes  # at most MAX_FAILS real guesses
    assert set(codes) <= {400, 429}, codes
    user = await db.users.find_one({"_id": ObjectId(carer["user"]["id"])})
    assert user["invite_locked_until"] is not None


# ---------- F6: decompression bombs are rejected before full decode ----------
def _img_bytes(size, fmt, mode="L"):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new(mode, size, 255).save(buf, format=fmt)
    return buf.getvalue()


async def _extract(client, token, data, ctype):
    return await client.post(
        "/prescriptions/extract", content=data, headers={**auth(token), "Content-Type": ctype}
    )


async def test_f6_png_pixel_bomb_rejected(client):
    elder = await register(client, "elder")
    bomb = _img_bytes((7800, 7800), "PNG")  # ~61 MP but only ~70 KB on the wire
    assert len(bomb) < 200_000
    r = await _extract(client, elder["token"], bomb, "image/png")
    assert r.status_code == 415


async def test_f6_huge_jpeg_rejected(client):
    elder = await register(client, "elder")
    r = await _extract(client, elder["token"], _img_bytes((7000, 6000), "JPEG"), "image/jpeg")
    assert r.status_code == 415


async def test_f6_normal_phone_photo_still_accepted(client):
    elder = await register(client, "elder")
    r = await _extract(client, elder["token"], _img_bytes((4000, 3000), "JPEG", "RGB"), "image/jpeg")
    assert r.status_code == 200
