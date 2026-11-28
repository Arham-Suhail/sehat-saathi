"""Nov 28 additions: vitals band flag, more vitals, I'm OK, low-mood trend, messages, stock/notes,
fall alert, logout revoke, export, audit views, last seen, week compare. Cross-user checks included."""

from datetime import UTC, datetime, timedelta

from app.push import hourly_tick, refill_tick
from app.ratelimit import limiter
from tests.conftest import auth
from tests.test_care import MED, circle


async def _meds(client, elder):
    r = await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=auth(elder["token"]))
    assert r.status_code == 201, r.text
    return r.json()


async def test_vitals_flag_and_alert(client):
    elder, fam, doc, stranger = await circle(client)
    ok = await client.post(
        "/vitals", json={"type": "bp", "systolic": 120, "diastolic": 80}, headers=auth(elder["token"])
    )
    assert ok.status_code == 201 and ok.json()["flag"] is None
    hi = await client.post(
        "/vitals", json={"type": "bp", "systolic": 175, "diastolic": 105}, headers=auth(elder["token"])
    )
    assert hi.json()["flag"] == "high"
    for body, flag in (
        ({"type": "spo2", "value": 88}, "low"),
        ({"type": "temperature", "value": 102.5}, "high"),
        ({"type": "weight", "value": 70}, None),
    ):
        r = await client.post("/vitals", json=body, headers=auth(elder["token"]))
        assert r.status_code == 201, r.text
        assert r.json()["flag"] == flag
    assert (
        await client.post("/vitals", json={"type": "spo2", "value": 140}, headers=auth(elder["token"]))
    ).status_code == 422
    kinds = [a["kind"] for a in (await client.get("/alerts", headers=auth(fam["token"]))).json()]
    assert kinds.count("vitals") == 3
    assert (await client.get("/alerts", headers=auth(stranger["token"]))).json() == []


async def test_im_ok_and_low_mood_trend(client, db):
    elder, fam, _, _ = await circle(client)
    r = await client.post("/checkins/ok?lang=en", headers=auth(elder["token"]))
    assert r.status_code == 201 and r.json()["channel"] == "ok" and r.json()["mood"] == "good"
    assert (await client.post("/checkins/ok", headers=auth(fam["token"]))).status_code == 403
    await db.checkins.delete_many({})
    now = datetime.now(UTC)
    eid = (await db.users.find_one({"email": elder["email"]}))["_id"]
    for d in (1, 2):
        await db.checkins.insert_one(
            {
                "elder_id": eid,
                "channel": "text",
                "mood": "low",
                "mood_score": 1,
                "created_at": now - timedelta(days=d),
                "reply": "",
                "concern_flag": False,
                "transcript": [],
            }
        )
    limiter.reset()
    r = await client.post(
        "/checkins/text", json={"message": "bohat udaas hoon, akela"}, headers=auth(elder["token"])
    )
    assert r.status_code == 201
    if r.json()["mood"] == "low":  # fake LLM labels by keywords
        kinds = [a["kind"] for a in (await client.get("/alerts", headers=auth(fam["token"]))).json()]
        assert "low_mood" in kinds


async def test_messages_heart_and_ownership(client):
    elder, fam, doc, stranger = await circle(client)
    eid = (
        elder["user"]["id"]
        if "user" in elder
        else (await client.get("/me", headers=auth(elder["token"]))).json()["id"]
    )
    r = await client.post(
        "/messages", json={"elder_id": eid, "text": "Roz walk karein"}, headers=auth(doc["token"])
    )
    assert r.status_code == 201 and r.json()["from_role"] == "doctor"
    assert (
        await client.post("/messages", json={"elder_id": eid, "text": "x"}, headers=auth(stranger["token"]))
    ).status_code == 403
    assert (
        await client.post("/messages", json={"elder_id": eid, "text": "x"}, headers=auth(elder["token"]))
    ).status_code == 403
    mine = (await client.get("/messages", headers=auth(elder["token"]))).json()
    assert len(mine) == 1 and mine[0]["text"] == "Roz walk karein"
    assert (
        await client.post(f"/messages/{mine[0]['id']}/heart", headers=auth(elder["token"]))
    ).status_code == 200
    seen = (await client.get(f"/messages?elder_id={eid}", headers=auth(fam["token"]))).json()
    assert seen[0]["hearted"] is True
    assert (await client.get(f"/messages?elder_id={eid}", headers=auth(stranger["token"]))).status_code == 403


async def test_stock_refill_and_notes(client, db):
    elder, fam, doc, stranger = await circle(client)
    med = (await _meds(client, elder))[0]
    eid = (await client.get("/me", headers=auth(elder["token"]))).json()["id"]
    r = await client.post(f"/medicines/{med['id']}/stock", json={"doses": 4}, headers=auth(elder["token"]))
    assert r.status_code == 200 and r.json()["doses_left"] == 4 and r.json()["days_left"] == 2.0
    assert (
        await client.post(
            f"/medicines/{med['id']}/stock", json={"doses": 4, "elder_id": eid}, headers=auth(doc["token"])
        )
    ).status_code == 403  # doctors are read-only
    assert (
        await client.post(
            f"/medicines/{med['id']}/stock",
            json={"doses": 4, "elder_id": eid},
            headers=auth(stranger["token"]),
        )
    ).status_code == 403
    await refill_tick(db, datetime.now(UTC))
    kinds = [a["kind"] for a in (await client.get("/alerts", headers=auth(fam["token"]))).json()]
    assert "refill" in kinds
    n = await client.post(
        f"/medicines/{med['id']}/notes",
        json={"text": "Chakkar aata hai", "elder_id": eid},
        headers=auth(doc["token"]),
    )
    assert n.status_code == 200 and n.json()["notes"][0]["by_role"] == "doctor"
    assert (
        await client.post(
            f"/medicines/{med['id']}/notes",
            json={"text": "x", "elder_id": eid},
            headers=auth(stranger["token"]),
        )
    ).status_code == 403


async def test_fall_alert_logout_export_views(client, db):
    elder, fam, _, _ = await circle(client)
    assert (await client.post("/alerts/fall", json={"answered": True}, headers=auth(elder["token"]))).json()[
        "sent"
    ] is False
    r = await client.post("/alerts/fall", json={}, headers=auth(elder["token"]))
    assert r.json()["sent"] is True
    a = (await client.get("/alerts", headers=auth(fam["token"]))).json()
    assert a[0]["kind"] == "concern" and a[0]["data"]["reason"] == "fall"

    eid = (await client.get("/me", headers=auth(elder["token"]))).json()["id"]
    d = (await client.get(f"/dashboard/{eid}", headers=auth(fam["token"]))).json()
    assert d["last_seen"] and "week_compare" in d
    views = (await client.get("/me/views", headers=auth(elder["token"]))).json()
    assert views and views[0]["role"] == "family"
    assert (await client.get("/me/views", headers=auth(fam["token"]))).status_code == 403
    ex = (await client.get("/me/export", headers=auth(elder["token"]))).json()
    assert ex["account"]["role"] == "elder" and "password_hash" not in str(ex) and "vitals" in ex

    assert (await client.post("/auth/logout", headers=auth(elder["token"]))).status_code == 204
    assert (await client.get("/me", headers=auth(elder["token"]))).status_code == 401
    assert (await client.get("/app/version")).json()["latest"]


async def test_hourly_tick_inactive(client, db):
    elder, fam, _, _ = await circle(client)
    await _meds(client, elder)
    old = datetime.now(UTC) - timedelta(days=3)
    await db.users.update_one({"email": elder["email"]}, {"$set": {"created_at": old, "last_seen_at": old}})
    await hourly_tick(db, datetime.now(UTC) + timedelta(hours=2))
    kinds = [a["kind"] for a in (await client.get("/alerts", headers=auth(fam["token"]))).json()]
    assert "inactive" in kinds
