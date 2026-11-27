"""Vapi voice tools: call binding, next medicine, alarm setting and family alerts."""

from datetime import UTC, datetime, timedelta

import pytest
from bson import ObjectId

from app.main import create_app
from app.ratelimit import limiter
from tests.conftest import auth, make_settings, register

SECRET = "vapi-test-secret-" + "x" * 32
VAPI = {"X-Vapi-Secret": SECRET}


@pytest.fixture
async def app(db):
    limiter.reset()
    return create_app(make_settings(vapi_webhook_secret=SECRET), db=db)


async def _elder_with_medicine(client, db, timings=("08:00",), **extra):
    """A medicine saved through the real /medicines/confirm (realistic document + reminders)."""
    elder = await register(client, "elder")
    elder_id = ObjectId(elder["user"]["id"])
    body = {"name": "Panadol", "strength_text": "500 mg", "dose_text": "1 tablet", "timings": list(timings)}
    r = await client.post("/medicines/confirm", json={"medicines": [body]}, headers=auth(elder["token"]))
    assert r.status_code in (200, 201), r.text
    mid = ObjectId(r.json()[0]["id"])
    if extra:
        await db.medicines.update_one({"_id": mid}, {"$set": extra})
    # A pending dose two hours from now, whatever the clock says.
    now = datetime.now(UTC)
    await db.reminders.insert_one(
        {
            "elder_id": elder_id,
            "medicine_id": mid,
            "scheduled_at": now + timedelta(hours=2),
            "status": "pending",
            "acted_at": None,
            "created_at": now,
        }
    )
    return elder, elder_id, await db.medicines.find_one({"_id": mid})


async def _bind(client, elder, call_id="call_test_123"):
    r = await client.post("/vapi/bind-call", json={"vapi_call_id": call_id}, headers=auth(elder["token"]))
    assert r.status_code == 201, r.text


def _tool_payload(name, args=None, tool_id="tool_1", call_id="call_test_123"):
    return {
        "message": {
            "type": "tool-calls",
            "call": {"id": call_id},
            "toolCallList": [{"id": tool_id, "function": {"name": name, "arguments": args or {}}}],
        }
    }


async def _tool(client, *args, **kwargs):
    r = await client.post("/vapi/tools", json=_tool_payload(*args, **kwargs), headers=VAPI)
    assert r.status_code == 200, r.text
    return r.json()["results"][0]["result"]


async def test_vapi_get_next_medicine_uses_bound_elder(client, db):
    elder, _, _ = await _elder_with_medicine(client, db)
    await _bind(client, elder)
    result = await _tool(client, "get_next_medicine")
    assert "Panadol" in result
    assert "App record" in result


async def test_vapi_reactivated_medicine_is_still_found(client, db):
    # discontinued=True + status confirmed = an order the elder re-activated: it is active.
    elder, _, _ = await _elder_with_medicine(client, db, discontinued=True, reactivated=True)
    await _bind(client, elder)
    assert "Panadol" in await _tool(client, "get_next_medicine")


async def test_vapi_unbound_call_cannot_read_record(client):
    result = await _tool(client, "get_next_medicine", call_id="call_missing")
    assert "dobara shuru" in result


async def test_vapi_tools_need_the_secret(client, db):
    elder, _, _ = await _elder_with_medicine(client, db)
    await _bind(client, elder)
    payload = _tool_payload("get_next_medicine")
    assert (await client.post("/vapi/tools", json=payload)).status_code == 401
    bad = {"X-Vapi-Secret": "wrong"}
    assert (await client.post("/vapi/tools", json=payload, headers=bad)).status_code == 401
    bearer = {"Authorization": f"Bearer {SECRET}"}
    assert (await client.post("/vapi/tools", json=payload, headers=bearer)).status_code == 200


async def test_vapi_tools_off_without_a_configured_secret(db):
    import httpx

    app = create_app(make_settings(), db=db)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/vapi/tools", json=_tool_payload("get_next_medicine"), headers=VAPI)
    assert r.status_code == 503


async def test_vapi_bind_call_is_elder_only_and_not_stealable(client, db):
    elder, _, _ = await _elder_with_medicine(client, db)
    other = await register(client, "elder")
    fam = await register(client, "family")
    await _bind(client, elder, "call_owned_1")
    r = await client.post(
        "/vapi/bind-call", json={"vapi_call_id": "call_owned_1"}, headers=auth(other["token"])
    )
    assert r.status_code == 409
    r = await client.post("/vapi/bind-call", json={"vapi_call_id": "call_fam_1"}, headers=auth(fam["token"]))
    assert r.status_code == 403
    assert (await client.post("/vapi/bind-call", json={"vapi_call_id": "call_x_1"})).status_code == 401


async def test_vapi_set_medicine_alarm_moves_the_dose_never_adds_one(client, db):
    elder, elder_id, med = await _elder_with_medicine(client, db)
    await _bind(client, elder)
    args = {"medicine_name": "Panadol", "time": "07:30", "confirmed": True}

    assert "confirm" in await _tool(client, "set_medicine_alarm", {**args, "confirmed": False}, tool_id="t0")
    result = await _tool(client, "set_medicine_alarm", args, tool_id="tool_alarm")

    assert "07:30" in result and "badal" in result
    saved = await db.medicines.find_one({"_id": med["_id"], "elder_id": elder_id})
    assert saved["timings"] == ["07:30"]  # moved, not 08:00 + 07:30


async def test_vapi_set_alarm_with_two_times_asks_which_one(client, db):
    elder, elder_id, med = await _elder_with_medicine(client, db, timings=("08:00", "20:00"))
    await _bind(client, elder)
    args = {"medicine_name": "Panadol", "time": "21:00", "confirmed": True}

    asked = await _tool(client, "set_medicine_alarm", args, tool_id="t1")
    assert "Kaunsa waqt" in asked
    assert (await db.medicines.find_one({"_id": med["_id"]}))["timings"] == ["08:00", "20:00"]

    await _tool(client, "set_medicine_alarm", {**args, "old_time": "20:00"}, tool_id="t2")
    assert (await db.medicines.find_one({"_id": med["_id"]}))["timings"] == ["08:00", "21:00"]


async def test_vapi_alert_family_is_idempotent_and_once_per_call(client, db):
    elder, elder_id, _ = await _elder_with_medicine(client, db)
    await _bind(client, elder)
    payload = _tool_payload(
        "alert_family", {"reason": "Ghar walon ko bata dein", "confirmed": True}, tool_id="ta"
    )

    first = await client.post("/vapi/tools", json=payload, headers=VAPI)
    second = await client.post("/vapi/tools", json=payload, headers=VAPI)
    assert first.status_code == 200, first.text
    assert second.json() == first.json()
    again = await _tool(client, "alert_family", {"confirmed": True}, tool_id="tb")  # new id, same call
    assert "pehle hi" in again

    docs = await db.checkins.find({"elder_id": elder_id, "concern_flag": True}).to_list(length=10)
    assert len(docs) == 1
    assert docs[0]["channel"] == "vapi"

    # The alert shows on the family timeline but is not counted as a mood check-in.
    d = (await client.get(f"/dashboard/{elder_id}", headers=auth(elder["token"]))).json()
    assert any(c["concern_flag"] for c in d["checkins"])
    assert d["mood_series"] == []
