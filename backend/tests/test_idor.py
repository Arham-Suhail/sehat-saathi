"""Cross-user access must fail (403/404). Covers every router that touches elder data."""

from bson import ObjectId

from tests.conftest import auth, register

MED = {
    "name": "Panadol",
    "strength": "500 mg",
    "dose": "1 tablet",
    "frequency": "1+0+1",
    "timings": ["08:00", "21:00"],
    "duration_days": 5,
}


async def _confirm(client, token):
    r = await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()[0]


async def _link(db, carer_id: str, elder_id: str):
    await db.users.update_one(
        {"_id": ObjectId(carer_id)}, {"$addToSet": {"linked_elder_ids": ObjectId(elder_id)}}
    )


async def test_confirm_creates_reminders_and_list(client):
    a = await register(client, "elder")
    med = await _confirm(client, a["token"])
    assert med["status"] == "confirmed"
    r = await client.get("/reminders/upcoming", headers=auth(a["token"]))
    assert r.status_code == 200
    assert all(x["medicine_name"] == "Panadol" for x in r.json())
    lst = await client.get("/medicines", headers=auth(a["token"]))
    assert [m["id"] for m in lst.json()] == [med["id"]]


async def test_elder_cannot_touch_other_elders_medicine_or_reminders(client, db):
    a = await register(client, "elder")
    b = await register(client, "elder")
    med_a = await _confirm(client, a["token"])

    # B stops A's medicine -> 404 (not found for B), A's medicine untouched
    r = await client.post(f"/medicines/{med_a['id']}/stop", headers=auth(b["token"]))
    assert r.status_code == 404
    doc = await db.medicines.find_one({"_id": ObjectId(med_a["id"])})
    assert doc["status"] == "confirmed"

    # B acts on A's reminder -> 404
    rem = await db.reminders.find_one({"elder_id": ObjectId(a["user"]["id"])})
    r = await client.post(f"/reminders/{rem['_id']}/taken", headers=auth(b["token"]))
    assert r.status_code == 404

    # B lists medicines with A's id -> 403; B's own list is empty
    r = await client.get("/medicines", params={"elder_id": a["user"]["id"]}, headers=auth(b["token"]))
    assert r.status_code == 403
    r = await client.get("/medicines", headers=auth(b["token"]))
    assert r.json() == []


async def test_unlinked_carer_forbidden_linked_carer_reads(client, db):
    elder = await register(client, "elder")
    await _confirm(client, elder["token"])
    fam = await register(client, "family")
    doc = await register(client, "doctor")

    for carer in (fam, doc):
        r = await client.get(
            "/medicines", params={"elder_id": elder["user"]["id"]}, headers=auth(carer["token"])
        )
        assert r.status_code == 403

    await _link(db, fam["user"]["id"], elder["user"]["id"])
    await _link(db, doc["user"]["id"], elder["user"]["id"])
    for carer in (fam, doc):
        r = await client.get(
            "/medicines", params={"elder_id": elder["user"]["id"]}, headers=auth(carer["token"])
        )
        assert r.status_code == 200
        assert len(r.json()) == 1


async def test_carers_cannot_use_elder_only_write_endpoints(client, db):
    elder = await register(client, "elder")
    med = await _confirm(client, elder["token"])
    doc = await register(client, "doctor")
    await _link(db, doc["user"]["id"], elder["user"]["id"])
    fam = await register(client, "family")
    await _link(db, fam["user"]["id"], elder["user"]["id"])

    for carer in (doc, fam):
        h = auth(carer["token"])
        assert (
            await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=h)
        ).status_code == 403
        assert (await client.post(f"/medicines/{med['id']}/stop", headers=h)).status_code == 403
        assert (await client.get("/reminders/upcoming", headers=h)).status_code == 403


async def test_invalid_and_missing_ids(client):
    a = await register(client, "elder")
    h = auth(a["token"])
    assert (await client.post("/medicines/not-an-id/stop", headers=h)).status_code == 404
    assert (await client.post(f"/medicines/{ObjectId()}/stop", headers=h)).status_code == 404
    assert (await client.post(f"/reminders/{ObjectId()}/taken", headers=h)).status_code == 404
    assert (await client.post(f"/reminders/{ObjectId()}/delete", headers=h)).status_code == 422
    fam = await register(client, "family")
    r = await client.get("/medicines", headers=auth(fam["token"]))  # carer without elder_id
    assert r.status_code == 404


async def test_confirm_validation(client):
    a = await register(client, "elder")
    h = auth(a["token"])
    bad_time = {**MED, "timings": ["8am"]}
    assert (
        await client.post("/medicines/confirm", json={"medicines": [bad_time]}, headers=h)
    ).status_code == 422
    no_times = {**MED, "timings": []}
    assert (
        await client.post("/medicines/confirm", json={"medicines": [no_times]}, headers=h)
    ).status_code == 422
    long_name = {**MED, "name": "x" * 500}
    assert (
        await client.post("/medicines/confirm", json={"medicines": [long_name]}, headers=h)
    ).status_code == 422
    # server re-applies pharmacist flag for low confidence even if client says False
    low_conf = {**MED, "confidence": 0.4, "needs_pharmacist": False}
    r = await client.post("/medicines/confirm", json={"medicines": [low_conf]}, headers=h)
    assert r.status_code == 201
    assert r.json()[0]["needs_pharmacist"] is True


async def test_taken_and_stop_flow(client, db):
    a = await register(client, "elder")
    med = await _confirm(client, a["token"])
    rem = await db.reminders.find_one({"elder_id": ObjectId(a["user"]["id"])}, sort=[("scheduled_at", 1)])
    # future reminder more than 1h ahead cannot be marked yet
    from datetime import UTC, datetime, timedelta

    await db.reminders.update_one({"_id": rem["_id"]}, {"$set": {"scheduled_at": datetime.now(UTC)}})
    r = await client.post(f"/reminders/{rem['_id']}/taken", headers=auth(a["token"]))
    assert r.status_code == 200
    assert r.json()["status"] == "taken"

    far = await db.reminders.find_one({"elder_id": ObjectId(a["user"]["id"]), "status": "pending"})
    await db.reminders.update_one(
        {"_id": far["_id"]}, {"$set": {"scheduled_at": datetime.now(UTC) + timedelta(hours=5)}}
    )
    r = await client.post(f"/reminders/{far['_id']}/skipped", headers=auth(a["token"]))
    assert r.status_code == 404

    r = await client.post(f"/medicines/{med['id']}/stop", headers=auth(a["token"]))
    assert r.status_code == 200
    pending_future = await db.reminders.count_documents(
        {"medicine_id": ObjectId(med["id"]), "status": "pending", "scheduled_at": {"$gt": datetime.now(UTC)}}
    )
    assert pending_future == 0
