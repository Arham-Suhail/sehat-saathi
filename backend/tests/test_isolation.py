"""Audit F4: two elders with data; nothing of elder B may ever appear in elder A's reads.

The gate tests (403/404) already exist. These assert the *content*: if any read query
lost its elder_id filter, B's ids or marker text would leak into A's responses.
"""

from datetime import UTC, datetime, timedelta

from bson import ObjectId

from tests.conftest import auth, register


async def _seed(client, db, elder, tag):
    h = auth(elder["token"])
    med = {
        "name": f"{tag}med",
        "strength_text": "5 mg",
        "frequency_raw": "bid",
        "original_text": f"{tag}med 5 mg bid",
        "frequency_choice": "d2",
        "timings": ["09:00", "21:00"],
    }
    r = await client.post("/medicines/confirm", json={"medicines": [med]}, headers=h)
    assert r.status_code == 201, r.text
    med_id = r.json()[0]["id"]
    r = await client.post("/vitals", json={"type": "sugar", "value": 111, "note": f"{tag}-note"}, headers=h)
    assert r.status_code == 201, r.text
    vital_id = r.json()["id"]
    r = await client.post("/checkins/text", json={"message": f"{tag}-secret theek hoon"}, headers=h)
    assert r.status_code == 201, r.text
    checkin_id = r.json()["id"]
    # A past dose, so the dashboard adherence query has something to (not) leak.
    eid = ObjectId(elder["user"]["id"])
    await db.reminders.insert_one(
        {
            "elder_id": eid,
            "medicine_id": ObjectId(med_id),
            "scheduled_at": datetime.now(UTC) - timedelta(hours=3),
            "status": "taken",
            "acted_at": datetime.now(UTC),
            "created_at": datetime.now(UTC),
        }
    )
    return {"markers": [f"{tag}med", f"{tag}-note", f"{tag}-secret", med_id, vital_id, checkin_id]}


async def _texts(client, token, paths):
    out = {}
    for p in paths:
        r = await client.get(p, headers=auth(token))
        assert r.status_code == 200, (p, r.status_code)
        out[p] = r.text
    return out


async def test_f4_elder_reads_never_contain_another_elders_data(client, db):
    a, b = await register(client, "elder"), await register(client, "elder")
    sa = await _seed(client, db, a, "Alpha")
    sb = await _seed(client, db, b, "Bravo")
    aid = a["user"]["id"]

    pages = await _texts(
        client,
        a["token"],
        ["/vitals", "/checkins", "/medicines", "/reminders/upcoming", f"/dashboard/{aid}"],
    )
    for path, body in pages.items():
        for m in sb["markers"]:
            assert m not in body, f"elder B's {m!r} leaked into {path}"
    # And A's own data is really there (the test is not vacuous).
    assert sa["markers"][0] in pages["/medicines"] and sa["markers"][1] in pages["/vitals"]
    assert sa["markers"][2] in pages["/checkins"] and sa["markers"][3] in pages["/reminders/upcoming"]

    dash = (await client.get(f"/dashboard/{aid}", headers=auth(a["token"]))).json()
    assert dash["adherence_totals"]["taken"] == 1  # A's own past dose only, not B's
    assert len(dash["checkins"]) == 1 and len(dash["vitals"]) == 1 and len(dash["medicines"]) == 1


async def test_f4_linked_carer_sees_only_the_linked_elder(client, db):
    a, b = await register(client, "elder"), await register(client, "elder")
    carer = await register(client, "family")
    await _seed(client, db, a, "Alpha")
    sb = await _seed(client, db, b, "Bravo")
    code = (await client.post("/invites", headers=auth(a["token"]))).json()["code"]
    r = await client.post("/invites/redeem", json={"code": code}, headers=auth(carer["token"]))
    assert r.status_code == 200
    aid = a["user"]["id"]

    pages = await _texts(
        client,
        carer["token"],
        [f"/{p}?elder_id={aid}" for p in ("vitals", "checkins", "medicines")] + [f"/dashboard/{aid}"],
    )
    for path, body in pages.items():
        for m in sb["markers"]:
            assert m not in body, f"elder B's {m!r} leaked to A's carer via {path}"
