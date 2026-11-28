"""Care features: family/doctor alerts (concern, missed dose, medicine review), diagnosis,
progress report and meetings. Includes cross-user checks for every new endpoint."""

from datetime import UTC, datetime, timedelta

from bson import ObjectId

from app.push import alerts_tick, missed_tick
from app.ratelimit import limiter
from app.services.care import push_due
from tests.conftest import auth, register

MED = {"name": "Panadol", "strength_text": "500 mg", "dose_text": "1 tab", "timings": ["08:00", "20:00"]}


async def circle(client):
    users = []
    for role, name in (
        ("elder", "Nana Ji"),
        ("family", "Ali"),
        ("doctor", "Dr. Sana"),
        ("family", "Stranger"),
    ):
        limiter.reset()
        users.append(await register(client, role, name=name))
    elder, fam, doc, stranger = users
    limiter.reset()
    for c in (fam, doc):
        code = (await client.post("/invites", headers=auth(elder["token"]))).json()["code"]
        r = await client.post("/invites/redeem", json={"code": code}, headers=auth(c["token"]))
        assert r.status_code == 200, r.text
    return elder, fam, doc, stranger


async def test_concern_becomes_urgent_alert_until_read(client):
    elder, fam, doc, stranger = await circle(client)
    r = await client.post(
        "/checkins/text", json={"message": "seene mein dard hai"}, headers=auth(elder["token"])
    )
    assert r.json()["concern_flag"] is True
    a = (await client.get("/alerts", headers=auth(fam["token"]))).json()
    assert len(a) == 1 and a[0]["kind"] == "concern" and a[0]["severity"] == "urgent" and a[0]["open"]
    assert a[0]["elder_name"] == "Nana Ji"
    assert (await client.get("/alerts", headers=auth(stranger["token"]))).json() == []
    assert (
        await client.get("/alerts", headers=auth(elder["token"]))
    ).status_code == 403  # elder never sees it
    # stranger can't mark it read
    assert (
        await client.post(f"/alerts/{a[0]['id']}/read", headers=auth(stranger["token"]))
    ).status_code == 404
    assert (await client.post(f"/alerts/{a[0]['id']}/read", headers=auth(fam["token"]))).status_code == 200
    assert (await client.get("/alerts", headers=auth(fam["token"]))).json() == []
    assert len((await client.get("/alerts", headers=auth(doc["token"]))).json()) == 1  # doctor still has it
    done = (await client.get("/alerts?include_done=true", headers=auth(fam["token"]))).json()
    assert len(done) == 1 and done[0]["open"] is False


async def test_missed_and_skipped_doses_alert_family(client, db):
    elder, fam, _, _ = await circle(client)
    meds = (
        await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=auth(elder["token"]))
    ).json()
    mid = ObjectId(meds[0]["id"])
    now = datetime.now(UTC)
    eid = ObjectId(elder["user"]["id"])
    old = await db.reminders.insert_one(
        {
            "elder_id": eid,
            "medicine_id": mid,
            "scheduled_at": now - timedelta(minutes=90),
            "status": "pending",
        }
    )
    ancient = await db.reminders.insert_one(
        {"elder_id": eid, "medicine_id": mid, "scheduled_at": now - timedelta(days=3), "status": "pending"}
    )
    due = await db.reminders.insert_one(
        {"elder_id": eid, "medicine_id": mid, "scheduled_at": now - timedelta(minutes=5), "status": "pending"}
    )
    await missed_tick(db, now)
    assert (await db.reminders.find_one({"_id": old.inserted_id}))["status"] == "missed"
    alerts = (await client.get("/alerts", headers=auth(fam["token"]))).json()
    assert [a["kind"] for a in alerts] == ["missed_dose"]  # the 3-day-old one doesn't alert
    assert alerts[0]["data"]["medicine_name"] == "Panadol"
    assert ancient.inserted_id  # (kept as history)
    await missed_tick(db, now)  # idempotent
    assert len((await client.get("/alerts", headers=auth(fam["token"]))).json()) == 1

    r = await client.post(f"/reminders/{due.inserted_id}/skipped", headers=auth(elder["token"]))
    assert r.status_code == 200
    alerts = (await client.get("/alerts", headers=auth(fam["token"]))).json()
    assert sorted(a["data"]["outcome"] for a in alerts) == ["missed", "skipped"]
    # taken after all: that dose's alert is resolved
    await client.post(f"/reminders/{due.inserted_id}/taken", headers=auth(elder["token"]))
    alerts = (await client.get("/alerts", headers=auth(fam["token"]))).json()
    assert [a["data"]["outcome"] for a in alerts] == ["missed"]


async def test_unclear_medicine_needs_carer_review(client, db):
    elder, fam, doc, stranger = await circle(client)
    unclear = {**MED, "name": "Amlo??", "confidence": 0.3, "needs_pharmacist": True}
    body = {"medicines": [MED, unclear], "diagnosis_text": "Dx: HTN"}
    meds = (await client.post("/medicines/confirm", json=body, headers=auth(elder["token"]))).json()
    assert meds[0]["review_state"] == "none" and meds[1]["review_state"] == "open"
    assert meds[1]["on_hold"] is False  # elder reviewed it: alarms ring, carer is asked to check
    alerts = (await client.get("/alerts", headers=auth(doc["token"]))).json()
    assert (
        len(alerts) == 1 and alerts[0]["kind"] == "med_review" and alerts[0]["data"]["diagnosis"] == "Dx: HTN"
    )
    assert alerts[0]["can_mark_read"] is False
    assert (
        await client.post(f"/alerts/{alerts[0]['id']}/read", headers=auth(doc["token"]))
    ).status_code == 409

    eid = elder["user"]["id"]
    url = f"/medicines/{meds[1]['id']}/review?elder_id={eid}"
    assert (await client.post(url, json={}, headers=auth(stranger["token"]))).status_code == 403
    assert (await client.post(url, json={}, headers=auth(elder["token"]))).status_code == 403
    r = await client.post(
        url, json={"timings": ["09:00"], "note": "Amlodipine 5mg"}, headers=auth(doc["token"])
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["review_state"] == "done" and out["reviewed_by"] == "Dr. Sana" and out["timings"] == ["09:00"]
    assert out["needs_pharmacist"] is False
    assert (await client.get("/alerts", headers=auth(fam["token"]))).json() == []
    future = await db.reminders.find({"medicine_id": ObjectId(out["id"]), "status": "pending"}).to_list(100)
    assert future and all(r["scheduled_at"].astimezone(UTC).minute == 0 for r in future)

    rx = (await client.get(f"/prescriptions?elder_id={eid}", headers=auth(fam["token"]))).json()
    assert rx[0]["diagnosis_text"] == "Dx: HTN" and len(rx[0]["medicine_ids"]) == 2
    assert (
        await client.get(f"/prescriptions?elder_id={eid}", headers=auth(stranger["token"]))
    ).status_code == 403


async def test_ask_family_holds_alarms_until_confirmed(client, db):
    elder, fam, _, _ = await circle(client)
    body = {"medicines": [MED], "ask_family": True}
    meds = (await client.post("/medicines/confirm", json=body, headers=auth(elder["token"]))).json()
    assert meds[0]["on_hold"] is True
    mid = ObjectId(meds[0]["id"])
    assert await db.reminders.count_documents({"medicine_id": mid}) == 0
    eid = elder["user"]["id"]
    r = await client.post(f"/medicines/{mid}/review?elder_id={eid}", json={}, headers=auth(fam["token"]))
    assert r.status_code == 200 and r.json()["on_hold"] is False
    assert await db.reminders.count_documents({"medicine_id": mid}) > 0

    # elder asks again later about an active medicine
    r = await client.post(
        f"/medicines/{mid}/ask", json={"note": "samajh nahi aayi"}, headers=auth(elder["token"])
    )
    assert r.status_code == 200 and r.json()["review_state"] == "open"
    alerts = (await client.get("/alerts", headers=auth(fam["token"]))).json()
    assert alerts[0]["data"]["note"] == "samajh nahi aayi"
    assert (
        await client.post(f"/medicines/{mid}/ask", json={}, headers=auth(fam["token"]))
    ).status_code == 403


async def test_alert_pushes_repeat_until_read(client, app, db):
    sent = []

    async def sender(sub, payload):
        sent.append(payload)
        return "ok"

    elder, fam, _, _ = await circle(client)
    await db.push_subscriptions.insert_one(
        {"user_id": ObjectId(fam["user"]["id"]), "endpoint": "https://fcm.googleapis.com/x", "keys": {}}
    )
    await client.post(
        "/checkins/text", json={"message": "chakkar aa rahe hain"}, headers=auth(elder["token"])
    )
    alert = await db.alerts.find_one({"kind": "concern"})
    now = datetime.now(UTC)
    await db.alerts.update_one({"_id": alert["_id"]}, {"$set": {"last_push_at": None, "push_count": 0}})
    await alerts_tick(db, sender, now)
    await alerts_tick(db, sender, now + timedelta(minutes=2))  # too soon: no repeat
    assert len(sent) == 1 and "chakkar" not in sent[0]["body"]
    await alerts_tick(db, sender, now + timedelta(minutes=11))
    assert len(sent) == 2
    await client.post(f"/alerts/{alert['_id']}/read", headers=auth(fam["token"]))
    await alerts_tick(db, sender, now + timedelta(minutes=30))
    assert len(sent) == 2  # read: no more pushes
    assert push_due({"kind": "concern", "push_count": 36, "last_push_at": None}, now) is False


async def test_report_has_per_medicine_and_time_of_day(client, db):
    elder, fam, doc, _ = await circle(client)
    meds = (
        await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=auth(elder["token"]))
    ).json()
    mid, eid = ObjectId(meds[0]["id"]), ObjectId(elder["user"]["id"])
    now = datetime.now(UTC)
    for h, st in ((30, "taken"), (26, "missed"), (6, "taken")):
        t = now - timedelta(hours=h)
        await db.reminders.insert_one(
            {
                "elder_id": eid,
                "medicine_id": mid,
                "scheduled_at": t,
                "status": st,
                "acted_at": t + timedelta(minutes=5),
            }
        )
    d = (await client.get(f"/dashboard/{eid}", headers=auth(doc["token"]))).json()
    rep = d["report"]
    assert rep["taken"] == 2 and rep["doses_due"] == 3 and rep["on_time_pct"] == 100
    assert rep["per_medicine"][0]["name"] == "Panadol" and rep["per_medicine"][0]["pct"] == 67
    assert sum(s["total"] for s in rep["by_time_of_day"]) == 3
    assert rep["recent_missed"][0]["status"] == "missed"
    assert "prescriptions" in d and "open_alerts" in d


async def test_meetings_rules(client, db):
    elder, fam, doc, stranger = await circle(client)
    eid = elder["user"]["id"]
    soon = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    people = (await client.get("/meetings/people", headers=auth(elder["token"]))).json()
    assert {p["role"] for p in people} == {"family", "doctor"}
    assert (
        await client.get(f"/meetings/people?elder_id={eid}", headers=auth(stranger["token"]))
    ).status_code == 403

    # elder -> doctor (video: a Jitsi link is made)
    r = await client.post(
        "/meetings",
        json={"participant_ids": [doc["user"]["id"]], "starts_at": soon, "reason": "BP"},
        headers=auth(elder["token"]),
    )
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["link"].startswith("https://meet.jit.si/") and m["status"] == "scheduled"
    alerts = (await client.get("/alerts", headers=auth(doc["token"]))).json()
    assert [a["kind"] for a in alerts] == ["meeting"]
    assert (await client.get("/alerts", headers=auth(fam["token"]))).json() == []  # not invited

    # elder -> family only: needs a doctor
    r = await client.post(
        "/meetings",
        json={"participant_ids": [fam["user"]["id"]], "starts_at": soon},
        headers=auth(elder["token"]),
    )
    assert r.status_code == 422
    # stranger as participant / outside the circle
    r = await client.post(
        "/meetings",
        json={"participant_ids": [stranger["user"]["id"]], "starts_at": soon},
        headers=auth(elder["token"]),
    )
    assert r.status_code == 403
    # doctor -> family + elder, own link must be on an allowed host
    bad = {
        "elder_id": eid,
        "participant_ids": [fam["user"]["id"]],
        "starts_at": soon,
        "link": "https://evil.example/x",
    }
    assert (await client.post("/meetings", json=bad, headers=auth(doc["token"]))).status_code == 422
    ok = {**bad, "link": "https://meet.google.com/abc-defg-hij", "participant_ids": [fam["user"]["id"], eid]}
    r = await client.post("/meetings", json=ok, headers=auth(doc["token"]))
    assert r.status_code == 201 and r.json()["link"] == "https://meet.google.com/abc-defg-hij"
    past = {**ok, "starts_at": (datetime.now(UTC) - timedelta(days=1)).isoformat()}
    assert (await client.post("/meetings", json=past, headers=auth(doc["token"]))).status_code == 422

    mine = (await client.get("/meetings", headers=auth(fam["token"]))).json()
    assert len(mine) == 1 and mine[0]["my_response"] == "pending"
    r = await client.post(
        f"/meetings/{mine[0]['id']}/respond", json={"accept": True}, headers=auth(fam["token"])
    )
    assert r.status_code == 200
    assert (await client.get("/meetings", headers=auth(fam["token"]))).json()[0]["my_response"] == "accepted"
    # only the organiser cancels; outsiders can't see it
    assert (
        await client.post(f"/meetings/{mine[0]['id']}/cancel", headers=auth(fam["token"]))
    ).status_code == 403
    r = await client.post(
        f"/meetings/{mine[0]['id']}/respond", json={"accept": True}, headers=auth(stranger["token"])
    )
    assert r.status_code == 404
    assert (
        await client.post(f"/meetings/{mine[0]['id']}/cancel", headers=auth(doc["token"]))
    ).status_code == 200
    assert (await client.get("/meetings", headers=auth(fam["token"]))).json()[0]["status"] == "cancelled"
