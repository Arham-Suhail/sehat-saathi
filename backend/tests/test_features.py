"""Check-ins, vitals, invites, dashboard, alternatives — behaviour + access control."""

from datetime import UTC, datetime, timedelta

import pytest
from bson import ObjectId

from app.cache import alternatives_cache
from app.llm import LLMError
from tests.conftest import auth, register

MED = {"name": "Panadol", "strength_text": "500 mg", "dose_text": "1 tablet", "timings": ["08:00", "21:00"]}


async def _invite_link(client, elder, carer) -> None:
    code = (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]
    r = await client.post("/invites/redeem", json={"code": code}, headers=auth(carer["token"]))
    assert r.status_code == 200, r.text


# ---------------- check-ins ----------------
async def test_text_checkin_keyword_fallback_sets_concern(client):
    e = await register(client, "elder")
    r = await client.post(
        "/checkins/text", json={"message": "Seene mein dard hai aur chakkar"}, headers=auth(e["token"])
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["concern_flag"] is True  # fake LLM never flags: keyword fallback did
    assert "dard" in body["concern_reason"] and "chakkar" in body["concern_reason"]
    assert "doctor" in body["reply"].lower()
    assert body["transcript"][1] == {"role": "elder", "text": "Seene mein dard hai aur chakkar"}
    assert "doctor nahi" in body["disclaimer"]


async def test_text_checkin_mood_and_no_concern(client):
    e = await register(client, "elder")
    r = await client.post("/checkins/text", json={"message": "Main acha hoon aaj"}, headers=auth(e["token"]))
    assert r.json()["mood"] == "good" and r.json()["concern_flag"] is False


async def test_checkin_survives_llm_outage(client, app):
    class Broken:
        async def chat_json(self, **_):
            raise LLMError("down")

    app.state.llm["text"] = Broken()
    e = await register(client, "elder")
    r = await client.post(
        "/checkins/text", json={"message": "saans phool rahi hai"}, headers=auth(e["token"])
    )
    assert r.status_code == 201
    assert r.json()["concern_flag"] is True and r.json()["mood"] == "okay"


async def test_checkin_validation_and_roles(client):
    e = await register(client, "elder")
    fam = await register(client, "family")
    assert (
        await client.post("/checkins/text", json={"message": ""}, headers=auth(e["token"]))
    ).status_code == 422
    too_long = {"message": "x" * 1001}
    assert (await client.post("/checkins/text", json=too_long, headers=auth(e["token"]))).status_code == 422
    ok = {"message": "theek"}
    assert (await client.post("/checkins/text", json=ok, headers=auth(fam["token"]))).status_code == 403


async def test_voice_checkin_transcript(client):
    e = await register(client, "elder")
    transcript = [
        {"role": "ai", "text": "Assalam o Alaikum, main Chotu hoon."},
        {"role": "elder", "text": "Kal raat gir gaya tha bathroom mein"},
        {"role": "ai", "text": "Apne ghar walon ko batayein."},
    ]
    r = await client.post(
        "/checkins/voice", json={"transcript": transcript, "vapi_call_id": "call_1"}, headers=auth(e["token"])
    )
    assert r.status_code == 201, r.text
    assert r.json()["channel"] == "vapi" and r.json()["concern_flag"] is True
    too_many = {"transcript": [{"role": "elder", "text": "hi"}] * 61}
    assert (await client.post("/checkins/voice", json=too_many, headers=auth(e["token"]))).status_code == 422
    bad_role = {"transcript": [{"role": "system", "text": "hi"}]}
    assert (await client.post("/checkins/voice", json=bad_role, headers=auth(e["token"]))).status_code == 422


async def test_checkin_list_access(client):
    a = await register(client, "elder")
    b = await register(client, "elder")
    doc = await register(client, "doctor")
    await client.post("/checkins/text", json={"message": "theek hoon"}, headers=auth(a["token"]))
    assert len((await client.get("/checkins", headers=auth(a["token"]))).json()) == 1
    r = await client.get("/checkins", params={"elder_id": a["user"]["id"]}, headers=auth(b["token"]))
    assert r.status_code == 403
    r = await client.get("/checkins", params={"elder_id": a["user"]["id"]}, headers=auth(doc["token"]))
    assert r.status_code == 403
    await _invite_link(client, a, doc)
    r = await client.get("/checkins", params={"elder_id": a["user"]["id"]}, headers=auth(doc["token"]))
    assert r.status_code == 200 and len(r.json()) == 1


# ---------------- vitals ----------------
async def test_vitals_permissions(client):
    elder = await register(client, "elder")
    fam = await register(client, "family")
    doc = await register(client, "doctor")
    bp = {"type": "bp", "systolic": 130, "diastolic": 85}
    assert (await client.post("/vitals", json=bp, headers=auth(elder["token"]))).status_code == 201

    for_elder = {**bp, "elder_id": elder["user"]["id"]}
    assert (await client.post("/vitals", json=for_elder, headers=auth(fam["token"]))).status_code == 403
    await _invite_link(client, elder, fam)
    await _invite_link(client, elder, doc)
    r = await client.post("/vitals", json=for_elder, headers=auth(fam["token"]))
    assert r.status_code == 201 and r.json()["entered_by_role"] == "family"
    # doctor is read-only even when linked
    assert (await client.post("/vitals", json=for_elder, headers=auth(doc["token"]))).status_code == 403
    r = await client.get("/vitals", params={"elder_id": elder["user"]["id"]}, headers=auth(doc["token"]))
    assert r.status_code == 200 and len(r.json()) == 2


@pytest.mark.parametrize(
    "payload",
    [
        {"type": "bp", "systolic": 120},
        {"type": "bp", "systolic": 80, "diastolic": 120},
        {"type": "bp", "systolic": 999, "diastolic": 80},
        {"type": "sugar"},
        {"type": "sugar", "value": 5000},
        {"type": "heart_rate", "value": 400},
        {"type": "temperature", "value": 37},
        {"type": "sugar", "value": 110, "measured_at": "2099-01-01T00:00:00Z"},
    ],
)
async def test_vitals_validation(client, payload):
    e = await register(client, "elder")
    assert (await client.post("/vitals", json=payload, headers=auth(e["token"]))).status_code == 422


# ---------------- invites ----------------
async def test_invite_flow_and_regenerate(client):
    elder = await register(client, "elder")
    fam = await register(client, "family")
    first = (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]
    second = (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]
    assert len(second) == 6 and second.isdigit()
    if first != second:  # old code no longer works
        r = await client.post("/invites/redeem", json={"code": first}, headers=auth(fam["token"]))
        assert r.status_code == 400
    r = await client.post("/invites/redeem", json={"code": second}, headers=auth(fam["token"]))
    assert r.json() == {"id": elder["user"]["id"], "name": elder["user"]["name"]}
    elders = (await client.get("/carer/elders", headers=auth(fam["token"]))).json()
    assert [x["id"] for x in elders] == [elder["user"]["id"]]


async def test_invite_roles(client):
    elder = await register(client, "elder")
    fam = await register(client, "family")
    assert (await client.post("/invites", headers=auth(fam["token"]))).status_code == 403
    r = await client.post("/invites/redeem", json={"code": "123456"}, headers=auth(elder["token"]))
    assert r.status_code == 403
    for bad in ("12345", "abcdef", "1234567", {"$ne": None}):
        r = await client.post("/invites/redeem", json={"code": bad}, headers=auth(fam["token"]))
        assert r.status_code == 422


async def test_invite_expired(client, db):
    elder = await register(client, "elder")
    fam = await register(client, "family")
    code = (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]
    await db.invites.update_one(
        {"code": code}, {"$set": {"expires_at": datetime.now(UTC) - timedelta(minutes=1)}}
    )
    r = await client.post("/invites/redeem", json={"code": code}, headers=auth(fam["token"]))
    assert r.status_code == 400


async def test_invite_lockout_after_wrong_codes(client, db):
    from app.ratelimit import limiter

    elder = await register(client, "elder")
    fam = await register(client, "family")
    code = (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        r = await client.post("/invites/redeem", json={"code": wrong}, headers=auth(fam["token"]))
        assert r.status_code == 400
    limiter.reset()  # isolate the account lockout from the IP rate limit
    r = await client.post("/invites/redeem", json={"code": code}, headers=auth(fam["token"]))
    assert r.status_code == 429  # locked even with the right code
    user = await db.users.find_one({"_id": ObjectId(fam["user"]["id"])})
    assert user["invite_locked_until"] is not None
    assert not user.get("linked_elder_ids")


async def test_redeem_ip_rate_limit(client):
    fam = await register(client, "family")
    codes = [
        (
            await client.post("/invites/redeem", json={"code": "999999"}, headers=auth(fam["token"]))
        ).status_code
        for _ in range(6)
    ]
    assert codes[-1] == 429


# ---------------- dashboard ----------------
async def test_dashboard_shape_and_access(client, db):
    elder = await register(client, "elder")
    other = await register(client, "elder")
    doc = await register(client, "doctor")
    h = auth(elder["token"])
    await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=h)
    await client.post("/checkins/text", json={"message": "acha hoon"}, headers=h)
    await client.post("/checkins/text", json={"message": "seene mein dard"}, headers=h)
    await client.post("/vitals", json={"type": "sugar", "value": 140}, headers=h)
    # make one reminder due in the past (missed) and one taken
    past = datetime.now(UTC) - timedelta(hours=3)
    rems = await db.reminders.find({"elder_id": ObjectId(elder["user"]["id"])}).to_list(length=2)
    await db.reminders.update_one({"_id": rems[0]["_id"]}, {"$set": {"scheduled_at": past}})
    await db.reminders.update_one(
        {"_id": rems[1]["_id"]}, {"$set": {"scheduled_at": past, "status": "taken"}}
    )

    eid = elder["user"]["id"]
    assert (await client.get(f"/dashboard/{eid}", headers=auth(doc["token"]))).status_code == 403
    assert (await client.get(f"/dashboard/{eid}", headers=auth(other["token"]))).status_code == 403
    assert (await client.get("/dashboard/not-an-id", headers=auth(doc["token"]))).status_code == 404
    await _invite_link(client, elder, doc)
    r = await client.get(f"/dashboard/{eid}", headers=auth(doc["token"]))
    assert r.status_code == 200
    d = r.json()
    assert d["elder"]["id"] == eid
    assert len(d["checkins"]) == 2 and d["concerns"] == 1
    assert d["mood_series"] and d["vitals"][0]["unit"] == "mg/dL"
    assert d["adherence_totals"]["taken"] == 1 and d["adherence_totals"]["missed"] == 1
    assert d["adherence_totals"]["adherence_pct"] == 50
    assert d["can_add_vitals"] is False  # doctor
    assert "password_hash" not in r.text


# ---------------- alternatives ----------------
async def test_alternatives_labelled_and_owned(client):
    alternatives_cache.clear()
    elder = await register(client, "elder")
    other = await register(client, "elder")
    fam = await register(client, "family")
    med = (
        await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=auth(elder["token"]))
    ).json()[0]
    r = await client.get(f"/medicines/{med['id']}/alternatives", headers=auth(elder["token"]))
    assert r.status_code == 200
    body = r.json()
    assert body["needs_doctor_verification"] is True
    assert "doctor" in body["label"].lower()
    assert body["generic_name"] == "Paracetamol"
    names = [p["name"] for p in body["products"]]
    assert names and all("panadol" not in n.lower() for n in names)  # own brand only as `current`
    assert names == ["Calpol 500mg", "Febrol 500mg"]  # no Disprin (aspirin), no combo, no 250mg
    assert body["current"]["name"].startswith("Panadol")
    for p in [body["current"], *body["products"]]:
        assert p["links"]["dawaai"].startswith("https://dawaai.pk/search?search=")
        assert p["links"]["google"].startswith("https://www.google.com/search?q=")

    assert (
        await client.get(f"/medicines/{med['id']}/alternatives", headers=auth(other["token"]))
    ).status_code == 404
    assert (
        await client.get(f"/medicines/{med['id']}/alternatives", headers=auth(fam["token"]))
    ).status_code == 404
    await _invite_link(client, elder, fam)
    assert (
        await client.get(f"/medicines/{med['id']}/alternatives", headers=auth(fam["token"]))
    ).status_code == 200


async def test_alternatives_are_cached(client, app):
    alternatives_cache.clear()
    elder = await register(client, "elder")
    med = (
        await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=auth(elder["token"]))
    ).json()[0]
    fake = app.state.llm["text"]
    before = len(fake.calls)
    for _ in range(3):
        await client.get(f"/medicines/{med['id']}/alternatives", headers=auth(elder["token"]))
    assert len(fake.calls) - before == 1


def test_alternatives_llm_output_is_sanitised_and_links_are_fixed_hosts():
    from app.llm.schemas import AlternativesLLM
    from app.routers.alternatives import price_links

    raw = {
        "generic_name": "Paracetamol",
        "products": [
            "Calpol 500mg",
            {"name": ""},
            {"company": "x"},
            42,
            *({"name": f"P{i}"} for i in range(10)),
        ],
    }
    out = AlternativesLLM.model_validate(raw)
    assert [p.name for p in out.products][:2] == ["Calpol 500mg", "P0"]
    assert len(out.products) == 6
    assert AlternativesLLM.model_validate({"products": "not a list"}).products == []
    # LLM text can never change the host or add parameters: it is only an encoded query value.
    links = price_links('Calpol"&search=evil https://evil.example/#')
    assert links.dawaai.startswith("https://dawaai.pk/search?search=")
    assert "&search=evil" not in links.dawaai and "https://evil" not in links.dawaai
    assert links.google.startswith("https://www.google.com/search?q=")
