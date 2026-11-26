"""Emergency contact ("Madad" button): elder-only writes, linked-carer reads, strict validation."""

from bson import ObjectId

from tests.conftest import auth, register

GOOD = {"name": "Beta Ali", "phone": "+92 300 1234567"}


async def _link(db, carer_id: str, elder_id: str):
    await db.users.update_one(
        {"_id": ObjectId(carer_id)}, {"$addToSet": {"linked_elder_ids": ObjectId(elder_id)}}
    )


async def test_elder_sets_reads_and_deletes_own_contact(client):
    e = await register(client, "elder")
    r = await client.get("/emergency-contact", headers=auth(e["token"]))
    assert r.status_code == 200 and r.json() is None

    r = await client.put("/emergency-contact", json=GOOD, headers=auth(e["token"]))
    assert r.status_code == 200, r.text
    assert r.json() == GOOD
    r = await client.get("/emergency-contact", headers=auth(e["token"]))
    assert r.json() == GOOD

    r = await client.delete("/emergency-contact", headers=auth(e["token"]))
    assert r.status_code == 204
    r = await client.get("/emergency-contact", headers=auth(e["token"]))
    assert r.json() is None


async def test_validation_rejects_bad_input(client):
    e = await register(client, "elder")
    h = auth(e["token"])
    bad = [
        {"name": "A", "phone": "abc"},
        {"name": "A", "phone": "12345"},  # too short
        {"name": "A", "phone": "+92 300 1234567 99999"},  # too long
        {"name": "", "phone": "03001234567"},
        {"name": "x" * 41, "phone": "03001234567"},
        {"name": "A", "phone": "03001234567", "extra": 1},  # extra="forbid"
        {"name": "A", "phone": {"$ne": None}},  # operator payload
        {"name": "A", "phone": "javascript:alert(1)"},
    ]
    for body in bad:
        r = await client.put("/emergency-contact", json=body, headers=h)
        assert r.status_code == 422, (body, r.status_code)


async def test_carers_cannot_write_and_unlinked_cannot_read(client, db):
    e = await register(client, "elder")
    fam = await register(client, "family")
    doc = await register(client, "doctor")
    await client.put("/emergency-contact", json=GOOD, headers=auth(e["token"]))

    for carer in (fam, doc):
        r = await client.put("/emergency-contact", json=GOOD, headers=auth(carer["token"]))
        assert r.status_code == 403
        r = await client.delete("/emergency-contact", headers=auth(carer["token"]))
        assert r.status_code == 403
        r = await client.get(f"/emergency-contact?elder_id={e['user']['id']}", headers=auth(carer["token"]))
        assert r.status_code == 403  # not linked

    await _link(db, fam["user"]["id"], e["user"]["id"])
    r = await client.get(f"/emergency-contact?elder_id={e['user']['id']}", headers=auth(fam["token"]))
    assert r.status_code == 200 and r.json() == GOOD


async def test_elder_cannot_read_another_elders_contact(client):
    a = await register(client, "elder")
    b = await register(client, "elder")
    await client.put("/emergency-contact", json=GOOD, headers=auth(b["token"]))
    r = await client.get(f"/emergency-contact?elder_id={b['user']['id']}", headers=auth(a["token"]))
    assert r.status_code == 403
    r = await client.get("/emergency-contact?elder_id=not-an-id", headers=auth(a["token"]))
    assert r.status_code in (403, 404, 422)


async def test_requires_login(client):
    assert (await client.get("/emergency-contact")).status_code == 401
    assert (await client.put("/emergency-contact", json=GOOD)).status_code == 401
