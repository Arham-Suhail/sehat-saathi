"""Urdu / English UI: check-in replies and push notifications follow the device's language,
the safety line is enforced in code in every language, and the old Roman default is unchanged."""

from datetime import UTC, datetime

import pytest

from app.llm.prompts import INJECTION_GUARD, checkin_system
from app.push import due_reminders_tick
from app.ratelimit import limiter
from tests.conftest import auth, register
from tests.test_push import FCM, _elder_with_dose, papp, pclient, sub_body  # noqa: F401 - fixtures

URDU = range(0x0600, 0x06FF + 1)


def has_urdu(s: str) -> bool:
    return any(ord(c) in URDU for c in s)


def test_prompt_per_language_keeps_the_guard():
    for lang in ("roman", "ur", "en"):
        p = checkin_system(lang)
        assert INJECTION_GUARD in p and "NEVER diagnose" in p
    assert "Urdu (Arabic/Nastaliq) script" in checkin_system("ur")
    assert "plain English" in checkin_system("en")
    assert checkin_system("nope") == checkin_system("roman")


async def test_urdu_checkin_reply_and_transcript_in_urdu(client):
    e = await register(client, "elder")
    r = await client.post(
        "/checkins/text", json={"message": "میں ٹھیک ہوں", "lang": "ur"}, headers=auth(e["token"])
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert has_urdu(d["reply"]) and has_urdu(d["wellness_tip"])
    assert d["mood"] == "good"
    assert has_urdu(d["transcript"][0]["text"])  # greeting
    assert d["transcript"][1]["text"] == "میں ٹھیک ہوں"  # elder's words kept as written


async def test_english_checkin(client):
    e = await register(client, "elder")
    r = await client.post(
        "/checkins/text", json={"message": "I feel fine", "lang": "en"}, headers=auth(e["token"])
    )
    d = r.json()
    assert d["reply"].startswith("Thank you") and "How are you feeling today" in d["transcript"][0]["text"]


@pytest.mark.parametrize(
    ("lang", "message", "doctor_word"),
    [
        ("ur", "سینے میں درد ہے", "ڈاکٹر"),
        ("en", "I have chest pain", "doctor"),
        ("roman", "seene mein dard hai", "doctor"),
    ],
)
async def test_concern_safety_line_in_every_language(client, lang, message, doctor_word):
    e = await register(client, "elder")
    r = await client.post("/checkins/text", json={"message": message, "lang": lang}, headers=auth(e["token"]))
    d = r.json()
    assert d["concern_flag"] is True
    assert doctor_word in d["reply"].lower()


async def test_default_is_still_roman_and_bad_lang_rejected(client):
    e = await register(client, "elder")
    r = await client.post("/checkins/text", json={"message": "theek hoon"}, headers=auth(e["token"]))
    assert r.json()["reply"].startswith("Shukriya")
    limiter.reset()
    r = await client.post("/checkins/text", json={"message": "x", "lang": "fr"}, headers=auth(e["token"]))
    assert r.status_code == 422


async def test_voice_checkin_lang(client):
    e = await register(client, "elder")
    body = {"transcript": [{"role": "elder", "text": "میں اداس ہوں"}], "lang": "ur"}
    r = await client.post("/checkins/voice", json=body, headers=auth(e["token"]))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["mood"] == "low" and has_urdu(d["reply"])
    assert d["transcript"][0]["text"] == "میں اداس ہوں"


async def test_push_uses_each_browsers_language(pclient, papp, db):  # noqa: F811 - pytest fixtures
    e, _ = await _elder_with_dose(pclient, db)
    # A second browser of the same elder, in Urdu.
    await pclient.post("/push/subscribe", json=sub_body(f"{FCM}-ur", lang="ur"), headers=auth(e["token"]))
    sender = papp.state.push_sender
    await due_reminders_tick(db, sender, datetime.now(UTC))
    by_endpoint = dict(sender.sent)
    assert by_endpoint[f"{FCM}-{e['user']['id']}"]["title"] == "Dawai ka waqt"  # default: Roman
    assert by_endpoint[f"{FCM}-ur"]["title"] == "دوا کا وقت"
    assert "Panadol" in by_endpoint[f"{FCM}-ur"]["body"]  # medicine names stay as written


async def test_subscribe_rejects_unknown_lang(pclient):  # noqa: F811
    u = await register(pclient, "elder")
    r = await pclient.post("/push/subscribe", json=sub_body(lang="xx"), headers=auth(u["token"]))
    assert r.status_code == 422
