"""Code-first sign-up (email on): no account until the emailed code is entered; made-up domains are
refused before any email is sent; existing emails can't be probed; one-step register is closed."""

from datetime import UTC, datetime, timedelta

import pytest

from app.email import FakeEmailSender
from app.ratelimit import limiter
from tests.conftest import auth, register

FORM = {"name": "Rashid Khan", "password": "first-pass-123", "role": "elder"}


@pytest.fixture
def mail(app):
    sender = FakeEmailSender()
    app.state.email_sender = sender
    app.state.mx_seen = []

    async def mx(email):  # fake DNS: any "fake-domain" address cannot receive mail
        app.state.mx_seen.append(email)
        return "fake-domain" not in email

    app.state.mx_check = mx
    return sender


def code_for(mail, email):
    return next(m["code"] for m in reversed(mail.sent) if m["to"] == email and m["purpose"] == "signup")


async def test_code_first_signup_creates_a_verified_account(client, db, mail):
    email = "rashid@example.com"
    r = await client.post("/auth/register/start", json={**FORM, "email": email})
    assert r.status_code == 202
    assert await db.users.count_documents({"email": email}) == 0  # nothing yet
    pending = await db.pending_signups.find_one({"email": email})
    code = code_for(mail, email)
    assert code not in str(pending) and FORM["password"] not in str(pending)  # hash only
    # can't log in before the code
    assert (
        await client.post("/auth/login", json={"email": email, "password": FORM["password"]})
    ).status_code == 401

    r = await client.post("/auth/register/verify", json={"email": email.upper(), "code": code})
    assert r.status_code == 201, r.text
    me = r.json()["user"]
    assert me["email"] == email and me["email_verified"] is True and me["role"] == "elder"
    assert (await client.get("/me", headers=auth(r.json()["access_token"]))).status_code == 200
    assert await db.pending_signups.count_documents({}) == 0
    # single use
    assert (
        await client.post("/auth/register/verify", json={"email": email, "code": code})
    ).status_code == 400


async def test_made_up_domain_is_refused_before_sending(client, mail):
    r = await client.post("/auth/register/start", json={**FORM, "email": "someone@qwerty-fake-domain.xyz"})
    assert r.status_code == 400
    assert mail.sent == []


async def test_wrong_code_expiry_and_five_tries(client, db, mail):
    email = "sara@example.com"
    await client.post("/auth/register/start", json={**FORM, "email": email})
    code = code_for(mail, email)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert (
            await client.post("/auth/register/verify", json={"email": email, "code": wrong})
        ).status_code == 400
    assert (
        await client.post("/auth/register/verify", json={"email": email, "code": code})
    ).status_code == 400
    assert await db.users.count_documents({"email": email}) == 0

    limiter.reset()
    await client.post("/auth/register/start", json={**FORM, "email": email})  # start again -> new code
    code = code_for(mail, email)
    await db.pending_signups.update_many(
        {}, {"$set": {"expires_at": datetime.now(UTC) - timedelta(minutes=1)}}
    )
    assert (
        await client.post("/auth/register/verify", json={"email": email, "code": code})
    ).status_code == 400


async def test_existing_email_cannot_be_probed_or_taken_over(client, db, app, mail):
    saved, app.state.email_sender = app.state.email_sender, None
    old = await register(client, "family")  # an existing (legacy) account
    app.state.email_sender = saved
    n = len(mail.sent)
    r = await client.post("/auth/register/start", json={**FORM, "email": old["email"]})
    assert r.status_code == 202  # same answer as for a new email
    assert len(mail.sent) == n  # but no email goes out
    r = await client.post("/auth/register/verify", json={"email": old["email"], "code": "123456"})
    assert r.status_code == 400
    user = await db.users.find_one({"email": old["email"]})
    assert user["role"] == "family"  # untouched


async def test_one_step_register_is_closed_when_email_is_on(client, mail):
    body = {**FORM, "email": "direct@example.com"}
    assert (await client.post("/auth/register", json=body)).status_code == 400


async def test_endpoints_off_without_email(client):
    assert (
        await client.post("/auth/register/start", json={**FORM, "email": "a@example.com"})
    ).status_code == 404
    assert (
        await client.post("/auth/register/verify", json={"email": "a@example.com", "code": "123456"})
    ).status_code == 404


async def test_validation(client, mail):
    bad = [
        {**FORM, "email": "not-an-email"},
        {**FORM, "email": "a@example.com", "password": "short"},
        {**FORM, "email": "a@example.com", "role": "admin"},
        {**FORM, "email": "a@example.com", "extra": 1},
    ]
    for body in bad:
        assert (await client.post("/auth/register/start", json=body)).status_code == 422, body
    for body in ({"email": "a@example.com", "code": "12345"}, {"email": {"$ne": None}, "code": "123456"}):
        assert (await client.post("/auth/register/verify", json=body)).status_code == 422, body
