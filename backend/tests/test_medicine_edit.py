"""PATCH /medicines/{id}: an elder changes the alarm times of their own active medicine. Future pending
reminders move to the new times; past / acted-on reminders stay; other users and non-alarm medicines
are refused."""

from datetime import UTC, datetime, timedelta

from bson import ObjectId

from tests.conftest import auth, register

MED = {
    "name": "Panadol",
    "strength_text": "500 mg",
    "dose_text": "1 tablet",
    "frequency_raw": "1+0+1",
    "timings": ["08:00", "21:00"],
    "duration_days": 5,
}


async def _confirm(client, token, med=MED):
    r = await client.post("/medicines/confirm", json={"medicines": [med]}, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()[0]


async def _future_hhmm(db, mid) -> set[str]:
    rows = await db.reminders.find(
        {"medicine_id": ObjectId(mid), "status": "pending", "scheduled_at": {"$gt": datetime.now(UTC)}}
    ).to_list(length=500)
    # Asia/Karachi = UTC+5
    return {(r["scheduled_at"].replace(tzinfo=UTC) + timedelta(hours=5)).strftime("%H:%M") for r in rows}


async def test_edit_moves_future_reminders_and_keeps_history(client, db):
    e = await register(client, "elder")
    med = await _confirm(client, e["token"])
    mid = ObjectId(med["id"])
    # one taken dose in the past must survive the edit
    past = datetime.now(UTC) - timedelta(hours=3)
    await db.reminders.insert_one(
        {"elder_id": ObjectId(e["user"]["id"]), "medicine_id": mid, "scheduled_at": past, "status": "taken"}
    )
    assert await _future_hhmm(db, med["id"]) == {"08:00", "21:00"}

    body = {"timings": ["09:30", "13:00", "09:30"], "dose_text": "2 tablets", "duration_days": 3}
    r = await client.patch(f"/medicines/{med['id']}", json=body, headers=auth(e["token"]))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["timings"] == ["09:30", "13:00"]  # de-duplicated, sorted
    assert out["dose_text"] == "2 tablets" and out["duration_days"] == 3
    assert out["name"] == "Panadol"  # name/strength untouched
    assert out["frequency_label"] is None  # the old "Subah aur raat" label no longer applies
    assert await _future_hhmm(db, med["id"]) == {"09:30", "13:00"}
    assert await db.reminders.count_documents({"medicine_id": mid, "status": "taken"}) == 1


async def test_other_users_cannot_edit(client, db):
    e = await register(client, "elder")
    med = await _confirm(client, e["token"])
    other = await register(client, "elder")
    fam = await register(client, "family")
    await db.users.update_one(
        {"_id": ObjectId(fam["user"]["id"])}, {"$set": {"linked_elder_ids": [ObjectId(e["user"]["id"])]}}
    )
    body = {"timings": ["10:00"]}
    assert (
        await client.patch(f"/medicines/{med['id']}", json=body, headers=auth(other["token"]))
    ).status_code == 404
    assert (
        await client.patch(f"/medicines/{med['id']}", json=body, headers=auth(fam["token"]))
    ).status_code == 403
    assert (await client.patch(f"/medicines/{med['id']}", json=body)).status_code == 401
    assert (await client.patch("/medicines/not-an-id", json=body, headers=auth(e["token"]))).status_code in (
        404,
        422,
    )


async def test_validation(client):
    e = await register(client, "elder")
    med = await _confirm(client, e["token"])
    h = auth(e["token"])
    bad = [
        {"timings": []},
        {"timings": ["25:00"]},
        {"timings": ["8am"]},
        {"timings": ["08:00"] * 7},
        {"timings": ["08:00"], "duration_days": 0},
        {"timings": ["08:00"], "name": "Changed"},  # extra="forbid": the name can't be edited
        {"timings": {"$ne": None}},
    ]
    for body in bad:
        assert (await client.patch(f"/medicines/{med['id']}", json=body, headers=h)).status_code == 422, body


async def test_stopped_and_non_alarm_medicines_cannot_be_edited(client):
    e = await register(client, "elder")
    h = auth(e["token"])
    med = await _confirm(client, e["token"])
    await client.post(f"/medicines/{med['id']}/stop", headers=h)
    r = await client.patch(f"/medicines/{med['id']}", json={"timings": ["10:00"]}, headers=h)
    assert r.status_code == 422
    prn = await _confirm(client, e["token"], {**MED, "name": "Brufen", "frequency_raw": "prn", "timings": []})
    r = await client.patch(f"/medicines/{prn['id']}", json={"timings": ["10:00"]}, headers=h)
    assert r.status_code == 422
