"""Email verification + forgot password (6-digit codes, Brevo in prod, a fake sender here).

Covers: soft verification (login works unverified), codes are single-use / expire / die after 5 wrong
guesses, only a hash is stored, forgot-password never reveals whether an email exists, a reset needs a
VERIFIED email, a reset ends old sessions, and everything is off (404) without email configured."""

from datetime import UTC, datetime, timedelta

import pytest

from app.email import FakeEmailSender, render
from app.ratelimit import limiter
from tests.conftest import auth, register


@pytest.fixture
def mail(app):
    sender = FakeEmailSender()
    app.state.email_sender = sender
    return sender


def last_code(mail, purpose):
    return next(m["code"] for m in reversed(mail.sent) if m["purpose"] == purpose)


async def test_email_off_by_default(client):
    assert (await client.get("/auth/email-config")).json() == {"enabled": False}
    u = await register(client, "elder")
    assert (await client.post("/me/verify-email/send", headers=auth(u["token"]))).status_code == 404
    assert (await client.post("/auth/password/forgot", json={"email": u["email"]})).status_code == 404


async def test_register_sends_code_and_verify_flow(client, db, mail):
    assert (await client.get("/auth/email-config")).json() == {"enabled": True}
    u = await register(client, "elder")
    assert u["user"]["email_verified"] is False
    assert mail.sent[-1]["to"] == u["email"] and mail.sent[-1]["purpose"] == "verify"
    code = last_code(mail, "verify")
    row = await db.email_codes.find_one({"purpose": "verify"})
    assert code not in str(row)  # only a hash is stored
    h = auth(u["token"])
    # login keeps working while unverified (soft verification)
    assert (await client.get("/me", headers=h)).status_code == 200
    wrong = "000000" if code != "000000" else "111111"
    assert (await client.post("/me/verify-email", json={"code": wrong}, headers=h)).status_code == 400
    r = await client.post("/me/verify-email", json={"code": code}, headers=h)
    assert r.status_code == 200 and r.json()["email_verified"] is True
    assert (await client.get("/me", headers=h)).json()["email_verified"] is True
    # single use: the same code doesn't work again (already verified -> just returns the user)
    assert await db.email_codes.count_documents({}) == 0


async def test_five_wrong_guesses_kill_the_code(client, mail):
    u = await register(client, "elder")
    h = auth(u["token"])
    code = last_code(mail, "verify")
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert (await client.post("/me/verify-email", json={"code": wrong}, headers=h)).status_code == 400
    # even the right code is now dead
    assert (await client.post("/me/verify-email", json={"code": code}, headers=h)).status_code == 400


async def test_expired_code_fails(client, db, mail):
    u = await register(client, "elder")
    code = last_code(mail, "verify")
    await db.email_codes.update_many({}, {"$set": {"expires_at": datetime.now(UTC) - timedelta(minutes=1)}})
    r = await client.post("/me/verify-email", json={"code": code}, headers=auth(u["token"]))
    assert r.status_code == 400


async def test_forgot_and_reset_password(client, mail):
    u = await register(client, "family")
    h = auth(u["token"])
    await client.post("/me/verify-email", json={"code": last_code(mail, "verify")}, headers=h)

    # unknown email: same 204, nothing sent
    n = len(mail.sent)
    assert (
        await client.post("/auth/password/forgot", json={"email": "nobody@example.com"})
    ).status_code == 204
    assert len(mail.sent) == n
    assert (await client.post("/auth/password/forgot", json={"email": u["email"].upper()})).status_code == 204
    code = last_code(mail, "reset")

    body = {"email": u["email"], "code": code, "new_password": "brand-new-pass-1"}
    bad = {**body, "code": "000000" if code != "000000" else "111111"}
    assert (await client.post("/auth/password/reset", json=bad)).status_code == 400
    assert (await client.post("/auth/password/reset", json=body)).status_code == 204
    # the old session ends; old password fails; new one works
    assert (await client.get("/me", headers=h)).status_code == 401
    limiter.reset()
    old = await client.post("/auth/login", json={"email": u["email"], "password": u["password"]})
    assert old.status_code == 401
    new = await client.post("/auth/login", json={"email": u["email"], "password": "brand-new-pass-1"})
    assert new.status_code == 200
    assert (await client.get("/me", headers=auth(new.json()["access_token"]))).status_code == 200
    # the code was single-use
    limiter.reset()
    assert (await client.post("/auth/password/reset", json=body)).status_code == 400


async def test_reset_needs_a_verified_email_and_gives_one_generic_error(client, mail):
    u = await register(client, "elder")  # never verified
    n = len(mail.sent)
    assert (await client.post("/auth/password/forgot", json={"email": u["email"]})).status_code == 204
    assert len(mail.sent) == n  # no reset code for an unverified address
    r1 = await client.post(
        "/auth/password/reset", json={"email": u["email"], "code": "123456", "new_password": "x" * 10}
    )
    r2 = await client.post(
        "/auth/password/reset",
        json={"email": "nobody@example.com", "code": "123456", "new_password": "x" * 10},
    )
    assert r1.status_code == r2.status_code == 400 and r1.json()["detail"] == r2.json()["detail"]


async def test_validation_and_rate_limits(client, mail):
    u = await register(client, "elder")
    h = auth(u["token"])
    for body in (
        {"code": "12345"},
        {"code": "abcdef"},
        {"code": "1234567"},
        {"code": 123456},
        {"code": "123456", "x": 1},
    ):
        assert (await client.post("/me/verify-email", json=body, headers=h)).status_code == 422, body
    bad_reset = {"email": u["email"], "code": "123456", "new_password": "short"}
    assert (await client.post("/auth/password/reset", json=bad_reset)).status_code == 422
    codes = [(await client.post("/me/verify-email/send", headers=h)).status_code for _ in range(5)]
    assert 429 in codes
    codes = [
        (await client.post("/auth/password/forgot", json={"email": u["email"]})).status_code for _ in range(5)
    ]
    assert 429 in codes


async def test_send_failure_is_reported_not_crashing(client, app):
    app.state.email_sender = FakeEmailSender(ok=False)
    u = await register(client, "elder")  # register still succeeds
    r = await client.post("/me/verify-email/send", headers=auth(u["token"]))
    assert r.status_code == 502


def test_email_body_has_only_fixed_text_and_the_code():
    subject, text, html = render("reset", "042917", 15)
    assert "042917" in text and "042917" in html and "15" in text
    assert "<script" not in html.lower()
