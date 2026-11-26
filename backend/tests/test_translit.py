"""Devanagari -> Roman Urdu (deterministic). Vectors are shared with the frontend implementation."""

import json
from pathlib import Path

import pytest

from app.services.concern import detect_concern
from app.services.translit import to_roman

VECTORS = json.loads(
    (Path(__file__).parents[2] / "shared" / "translit-vectors.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize(("source", "expected"), VECTORS["cases"])
def test_shared_vectors(source, expected):
    assert to_roman(source) == expected


def test_idempotent_on_roman_text():
    s = "Aaj theek hoon, seene mein dard hai"
    assert to_roman(to_roman(s)) == s


@pytest.mark.parametrize(
    ("text", "label"),
    [
        ("मेरे सीने में दर्द है", "seena / chest"),
        ("सांस नहीं आ रही", "saans / breathing"),
        ("बहुत चक्कर आ रहे हैं", "chakkar / dizziness"),
        ("میرے سینے میں درد ہے", "seena / chest"),
        ("مجھے بخار ہے", "bukhar / fever"),
        ("سانس پھول رہی ہے", "saans / breathing"),
    ],
)
def test_concern_keywords_in_devanagari_and_urdu_script(text, label):
    assert label in detect_concern(text)


def test_no_false_alarm_in_other_scripts():
    assert detect_concern("आज मैं ठीक हूँ, नींद अच्छी आई") == []
    assert detect_concern("آج میں ٹھیک ہوں") == []


# ---------- check-ins store Roman Urdu, whatever script the speech-to-text produced ----------
async def test_voice_checkin_stores_roman_and_flags_devanagari_symptom(client):
    from tests.conftest import auth, register

    e = await register(client, "elder")
    body = {
        "transcript": [
            {"role": "ai", "text": "Aaj aap kaisa mehsoos kar rahe hain?"},
            {"role": "elder", "text": "मेरे सीने में दर्द है"},
        ]
    }
    r = await client.post("/checkins/voice", json=body, headers=auth(e["token"]))
    assert r.status_code == 201
    d = r.json()
    assert d["transcript"][1]["text"] == "mere seene mein dard hai"
    assert d["concern_flag"] is True
    # The family dashboard sees the same Roman text.
    listed = (await client.get("/checkins", headers=auth(e["token"]))).json()[0]
    assert listed["transcript"][1]["text"] == "mere seene mein dard hai"


async def test_text_checkin_from_hindi_dictation_is_stored_roman(client):
    from tests.conftest import auth, register

    e = await register(client, "elder")
    r = await client.post(
        "/checkins/text", json={"message": "आज मैं ठीक हूँ", "channel": "speech"}, headers=auth(e["token"])
    )
    assert r.status_code == 201
    elder_line = [t for t in r.json()["transcript"] if t["role"] == "elder"][0]
    assert elder_line["text"] == "aaj main theek hoon"
    assert r.json()["concern_flag"] is False
