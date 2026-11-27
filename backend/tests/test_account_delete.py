"""POST /me/delete: password required, deletes only the caller's own data, unlinks carers, and the old
token stops working. Another elder's data must survive untouched."""

from bson import ObjectId

from app.ratelimit import limiter
from tests.conftest import auth, register

MED = {
    "name": "Panadol",
    "strength_text": "500 mg",
    "dose_text": "1 tablet",
    "frequency_raw": "1+0+1",
    "timings": ["08:00", "21:00"],
    "duration_days": 5,
}


async def _elder_with_data(client):
    e = await register(client, "elder")
    h = auth(e["token"])
    assert (await client.post("/medicines/confirm", json={"medicines": [MED]}, headers=h)).status_code == 201
    assert (await client.post("/checkins/text", json={"message": "theek hoon"}, headers=h)).status_code == 201
    vital = {"type": "bp", "systolic": 120, "diastolic": 80}
    assert (await client.post("/vitals", json=vital, headers=h)).status_code == 201
    assert (await client.post("/invites", headers=h)).status_code == 201
    contact = {"name": "Ali", "phone": "0300 1234567"}
    assert (await client.put("/emergency-contact", json=contact, headers=h)).status_code == 200
    return e


async def _counts(db, eid: ObjectId) -> dict:
    return {
        c: await db[c].count_documents({"elder_id": eid})
        for c in ("medicines", "reminders", "checkins", "vitals", "invites")
    }


async def test_wrong_password_deletes_nothing(client, db):
    e = await _elder_with_data(client)
    r = await client.post("/me/delete", json={"password": "wrong-pass-1"}, headers=auth(e["token"]))
    assert r.status_code == 403
    assert await db.users.count_documents({"_id": ObjectId(e["user"]["id"])}) == 1
    assert (await client.get("/me", headers=auth(e["token"]))).status_code == 200


async def test_elder_delete_removes_everything_and_unlinks_carers(client, db):
    e = await _elder_with_data(client)
    other = await _elder_with_data(client)  # must survive
    eid, oid = ObjectId(e["user"]["id"]), ObjectId(other["user"]["id"])
    fam = await register(client, "family")
    await db.users.update_one(
        {"_id": ObjectId(fam["user"]["id"])}, {"$set": {"linked_elder_ids": [eid, oid]}}
    )
    before_other = await _counts(db, oid)
    assert all(before_other[c] > 0 for c in ("medicines", "reminders", "checkins", "vitals"))

    r = await client.post("/me/delete", json={"password": e["password"]}, headers=auth(e["token"]))
    assert r.status_code == 204

    assert await db.users.count_documents({"_id": eid}) == 0
    assert all(v == 0 for v in (await _counts(db, eid)).values())
    fam_doc = await db.users.find_one({"_id": ObjectId(fam["user"]["id"])})
    assert fam_doc["linked_elder_ids"] == [oid]  # only the deleted elder was unlinked
    assert await _counts(db, oid) == before_other  # the other elder is untouched
    # the old token no longer works
    assert (await client.get("/me", headers=auth(e["token"]))).status_code == 401
    # and the email can't log in any more (generic error)
    limiter.reset()
    r = await client.post("/auth/login", json={"email": e["email"], "password": e["password"]})
    assert r.status_code == 401


async def test_family_delete_keeps_elder_data(client, db):
    e = await _elder_with_data(client)
    eid = ObjectId(e["user"]["id"])
    fam = await register(client, "family")
    await db.users.update_one({"_id": ObjectId(fam["user"]["id"])}, {"$set": {"linked_elder_ids": [eid]}})
    before = await _counts(db, eid)
    r = await client.post("/me/delete", json={"password": fam["password"]}, headers=auth(fam["token"]))
    assert r.status_code == 204
    assert await db.users.count_documents({"_id": ObjectId(fam["user"]["id"])}) == 0
    assert await _counts(db, eid) == before
    assert (await client.get("/me", headers=auth(e["token"]))).status_code == 200


async def test_requires_login_and_valid_body(client):
    assert (await client.post("/me/delete", json={"password": "x"})).status_code == 401
    e = await register(client, "elder")
    h = auth(e["token"])
    for body in (
        {},
        {"password": ""},
        {"password": "x" * 73},
        {"password": {"$ne": None}},
        {"password": "p", "extra": 1},
    ):
        assert (await client.post("/me/delete", json=body, headers=h)).status_code == 422, body


async def test_rate_limited(client):
    e = await register(client, "elder")
    h = auth(e["token"])
    codes = [
        (await client.post("/me/delete", json={"password": "nope-nope"}, headers=h)).status_code
        for _ in range(7)
    ]
    assert 429 in codes
