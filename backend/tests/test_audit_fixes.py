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
