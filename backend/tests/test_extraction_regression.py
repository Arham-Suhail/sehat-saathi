"""Regression: hospital medication order sheet (IV, PRN, D/c, infusion lines).

Bug: raw shorthand (bid, q6h, PO, IV, prn, D/c) went straight into free-text fields, only one
medicine got reminder times, IV/PRN orders would have produced home reminders, and a shortened
"D/c ... IV" line was not flagged. The model now transcribes verbatim; code decides the schedule.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.llm.fake import ORDER_SHEET_LINES, FakeProvider
from app.llm.schemas import ExtractedMedicine, ExtractionResult
from app.services.extraction import extract_prescription, needs_pharmacist
from app.services.frequency import (
    is_infusion,
    mentions_discontinue,
    normalize_frequency,
    normalize_route,
)
from tests.conftest import auth, png_bytes, register

CIPRO, VANCO, CLINDA, KCL, ACET = range(5)


def _ws(s: str) -> str:
    return " ".join(s.split())


@pytest.fixture
async def order():
    out = await extract_prescription(FakeProvider("order_sheet"), b"img")
    assert len(out.medicines) == 5
    return out.medicines


# ---------------- normaliser (pure) ----------------
@pytest.mark.parametrize(
    ("raw", "kind", "n", "times", "label"),
    [
        ("1+0+1", "pattern", 2, ["08:00", "20:00"], "Subah aur raat"),
        ("1+1+1", "pattern", 3, ["08:00", "14:00", "20:00"], "Subah, dopahar aur raat"),
        ("0+0+1", "pattern", 1, ["20:00"], "Sirf raat"),
        ("TDS", "per_day", 3, ["08:00", "14:00", "20:00"], "Din mein 3 baar"),
        ("t.i.d.", "per_day", 3, ["08:00", "14:00", "20:00"], "Din mein 3 baar"),
        ("OD", "per_day", 1, ["08:00"], "Din mein 1 baar"),
        ("bid", "per_day", 2, ["08:00", "20:00"], "Din mein 2 baar"),
        ("B.D.", "per_day", 2, ["08:00", "20:00"], "Din mein 2 baar"),
        ("QID", "per_day", 4, ["08:00", "12:00", "16:00", "20:00"], "Din mein 4 baar"),
        ("SOS", "prn", None, [], "Zaroorat par (jab ho)"),
        ("prn", "prn", None, [], "Zaroorat par (jab ho)"),
        ("HS", "bedtime", 1, ["22:00"], "Raat sone se pehle"),
        ("q.h.s.", "bedtime", 1, ["22:00"], "Raat sone se pehle"),
        ("q6 hours", "every_n_hours", 6, ["08:00", "14:00", "20:00"], "Har 6 ghante baad"),
        ("q6h", "every_n_hours", 6, ["08:00", "14:00", "20:00"], "Har 6 ghante baad"),
        ("Q 12 H", "every_n_hours", 12, ["08:00", "20:00"], "Har 12 ghante baad"),
        ("every 8 hours", "every_n_hours", 8, ["08:00", "16:00"], "Har 8 ghante baad"),
        ("subah raat", "pattern", 2, ["08:00", "20:00"], "Subah aur raat"),
        ("xqz7", "unknown", None, [], None),
        ("jab dil chahe", "unknown", None, [], None),
        (None, "none", None, [], None),
    ],
)
def test_normalize_frequency(raw, kind, n, times, label):
    r = normalize_frequency(raw)
    assert r.kind == kind
    assert r.count_or_interval == n
    assert r.times_suggested == times
    if label:
        assert r.label == label
    assert r.confidence == (0.0 if kind in ("unknown", "none") else 1.0)


def test_every_n_hours_notes_doses_beyond_the_day():
    assert "4 baar" in normalize_frequency("q6h").note
    assert normalize_frequency("q12h").note == ""


@pytest.mark.parametrize(
    ("raw", "kind"),
    [
        ("po", "oral"),
        ("P.O.", "oral"),
        ("by mouth", "oral"),
        ("IV", "intravenous"),
        ("i.m.", "intramuscular"),
        ("SC", "subcutaneous"),
        ("sq", "subcutaneous"),
        ("SL", "sublingual"),
        ("topical", "topical"),
        ("inhaled", "inhaled"),
        ("zz", "unknown"),
    ],
)
def test_normalize_route(raw, kind):
    assert normalize_route(raw).kind == kind


def test_route_labels_come_from_code():
    assert normalize_route("PO").label == "Munh se khani hai"
    assert normalize_route("IV").label == "Drip/injection (hospital wali)"


def test_discontinue_and_infusion_detection():
    assert mentions_discontinue("D/c clindamycin 600 mg IV q6 hours")
    assert mentions_discontinue("d/c amoxicillin")
    assert mentions_discontinue("dc amoxicillin")
    assert mentions_discontinue("Discontinue warfarin")
    assert mentions_discontinue("stop aspirin")
    assert not mentions_discontinue("Ciprofloxacin 500 mg po bid")
    assert not mentions_discontinue("khane ke baad")
    assert is_infusion("in 1 L 0.9%NS IV at 100 ml/hr")
    assert not is_infusion("take 1 tab po bid")


# ---------------- the five order-sheet lines ----------------
async def test_original_text_is_the_full_line(order):
    for med, line in zip(order, ORDER_SHEET_LINES, strict=True):
        assert med.original_text == _ws(line)
        assert "..." not in med.original_text


async def test_ciprofloxacin_oral_twice_daily_gets_reminders(order):
    m = order[CIPRO]
    assert m.route.kind == "oral" and m.route.label == "Munh se khani hai"
    assert m.frequency.kind == "per_day" and m.frequency.count_or_interval == 2
    assert m.frequency.label == "Din mein 2 baar"
    assert m.frequency_raw == "bid"
    assert m.reminder_mode == "fixed"
    assert m.suggested_times == ["08:00", "20:00"]
    assert m.duration_days == 7
    assert m.quantity_limit_raw == "Disp: 14 tabs"  # kept as a read-only note
    assert m.needs_pharmacist is False
    assert m.status == "active"


async def test_vancomycin_iv_is_hospital_only(order):
    m = order[VANCO]
    assert m.route.kind == "intravenous"
    assert m.frequency.kind == "every_n_hours" and m.frequency.count_or_interval == 12
    assert m.reminder_mode == "hospital"
    assert m.suggested_times == []
    assert m.needs_pharmacist is False
    assert m.strength_text == "1,500 mg"


async def test_clindamycin_dc_is_stopped_and_flagged(order):
    m = order[CLINDA]
    assert m.route.kind == "intravenous"
    assert m.frequency.kind == "every_n_hours" and m.frequency.count_or_interval == 6
    assert m.discontinue_mentioned is True
    assert m.status == "stopped"
    assert m.reminder_mode == "stopped"
    assert m.suggested_times == []
    assert m.needs_pharmacist is True
    assert any("D/c" in r for r in m.pharmacist_reasons)


async def test_kcl_infusion_keeps_units_and_quantity(order):
    m = order[KCL]
    assert m.route.kind == "intravenous"
    assert m.frequency.kind == "none"
    assert m.strength_text == "20 mEq"
    assert m.quantity_limit_raw == "x 1 liter"
    assert m.duration_days is None  # "x 1 liter" is never turned into days
    assert m.reminder_mode == "hospital"
    assert m.suggested_times == []


async def test_acetaminophen_prn_has_no_fixed_reminders(order):
    m = order[ACET]
    assert m.route.kind == "oral"
    assert m.prn is True
    assert m.prn_condition == "temp >101°F"  # exactly as written
    assert m.reminder_mode == "prn"
    assert m.suggested_times == []


def _line(**kw) -> ExtractedMedicine:
    base = {
        "original_text": "D/c clindamycin 600 mg IV q6 hours",
        "name": "clindamycin",
        "strength_text": "600 mg",
        "frequency_raw": "q6 hours",
        "route_raw": "IV",
        "confidence": 0.9,
    }
    return ExtractedMedicine.model_validate({**base, **kw})


def test_shortened_or_paraphrased_text_is_flagged():
    page = ["D/c clindamycin 600 mg IV q6 hours"]
    # "..." that the page doesn't contain
    assert needs_pharmacist(_line(instructions_raw="D/c ... IV", discontinue_mentioned=True), page)
    # original_text that isn't on the page
    assert needs_pharmacist(_line(original_text="clindamycin 600 mg IV"), ["Vancomycin 1,500 mg IV"])
    # a field the line doesn't contain
    assert needs_pharmacist(
        _line(original_text="Vancomycin 1,500 mg IV q12 hours", name="Vancomycin", strength_text="2 g"),
        ["Vancomycin 1,500 mg IV q12 hours"],
    )


def test_unrecognised_abbreviations_are_flagged():
    page = ["Tab Y 10 mg zz q7x"]
    med = ExtractedMedicine(
        original_text=page[0],
        name="Y",
        strength_text="10 mg",
        route_raw="zz",
        frequency_raw="q7x",
        confidence=0.9,
    )
    assert needs_pharmacist(med, page)


# ---------------- API: confirm + downstream lists ----------------
def _confirm_body(drafts: list[dict], **overrides) -> dict:
    """What the confirm screen sends back for the drafts, untouched by the user."""
    meds = []
    for d in drafts:
        meds.append(
            {
                k: d[k]
                for k in (
                    "original_text",
                    "name",
                    "strength_text",
                    "dose_text",
                    "frequency_raw",
                    "route_raw",
                    "meal_timing",
                    "prn",
                    "prn_condition",
                    "duration_raw",
                    "duration_days",
                    "quantity_limit_raw",
                    "instructions_raw",
                    "discontinue_mentioned",
                    "frequency_choice",
                    "confidence",
                    "needs_pharmacist",
                    "status",
                )
            }
            | {"timings": d["suggested_times"]}
        )
    for i, patch in overrides.items():
        meds[int(i[1:])].update(patch)
    return {"medicines": meds}


@pytest.fixture
async def order_app(app):
    app.state.llm["vision"] = FakeProvider("order_sheet")
    return app


async def _extract_and_confirm(client, token, **overrides):
    h = auth(token)
    r = await client.post(
        "/prescriptions/extract", content=png_bytes(), headers={**h, "Content-Type": "image/png"}
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        "/medicines/confirm", json=_confirm_body(r.json()["medicines"], **overrides), headers=h
    )
    assert r.status_code == 201, r.text
    return {m["name"]: m for m in r.json()}


async def test_confirm_order_sheet_only_oral_scheduled_med_gets_reminders(client, order_app, db):
    e = await register(client, "elder")
    saved = await _extract_and_confirm(client, e["token"])
    assert saved["Ciprofloxacin"]["reminder_mode"] == "fixed"
    assert saved["Ciprofloxacin"]["timings"] == ["08:00", "20:00"]
    assert saved["Vancomycin"]["reminder_mode"] == "hospital"
    assert saved["KCl"]["reminder_mode"] == "hospital"
    assert saved["Acetaminophen"]["reminder_mode"] == "prn"
    assert saved["clindamycin"]["status"] == "stopped"
    for name in ("Vancomycin", "KCl", "Acetaminophen", "clindamycin"):
        assert saved[name]["timings"] == []
        n = await db.reminders.count_documents({"medicine_id": _oid(saved[name]["id"])})
        assert n == 0, name
    assert await db.reminders.count_documents({"medicine_id": _oid(saved["Ciprofloxacin"]["id"])}) > 0


async def test_client_cannot_force_reminders_for_iv_prn_or_dc(client, order_app, db):
    e = await register(client, "elder")
    times = {"timings": ["09:00"], "frequency_choice": "d1"}
    saved = await _extract_and_confirm(
        client,
        e["token"],
        m1=times,  # Vancomycin IV
        m2={**times, "status": "active", "discontinue_mentioned": False, "needs_pharmacist": False},  # D/c
        m4=times,  # Acetaminophen prn
    )
    assert saved["clindamycin"]["status"] == "stopped"  # D/c is re-detected from the verbatim line
    assert saved["clindamycin"]["needs_pharmacist"] is True
    for name in ("Vancomycin", "clindamycin", "Acetaminophen"):
        assert await db.reminders.count_documents({"medicine_id": _oid(saved[name]["id"])}) == 0, name


async def test_reactivating_dc_needs_explicit_confirm_and_keeps_banner(client, order_app):
    e = await register(client, "elder")
    saved = await _extract_and_confirm(
        client, e["token"], m2={"status": "active", "reactivate_confirmed": True}
    )
    c = saved["clindamycin"]
    assert c["status"] == "confirmed"
    assert c["needs_pharmacist"] is True
    assert c["reminder_mode"] == "hospital"  # still IV: no home reminders


async def test_discontinued_never_in_reminders_dashboard_or_adherence(client, order_app, db):
    e = await register(client, "elder")
    h = auth(e["token"])
    saved = await _extract_and_confirm(client, e["token"])
    clinda = _oid(saved["clindamycin"]["id"])
    # Even a stray reminder row for the discontinued order (e.g. legacy data) must not surface.
    now = datetime.now(UTC)
    await db.reminders.insert_many(
        [
            {
                "elder_id": _oid(e["user"]["id"]),
                "medicine_id": clinda,
                "scheduled_at": now - timedelta(hours=3),
                "status": "missed",
                "acted_at": None,
                "created_at": now,
            },
            {
                "elder_id": _oid(e["user"]["id"]),
                "medicine_id": clinda,
                "scheduled_at": now + timedelta(hours=1),
                "status": "pending",
                "acted_at": None,
                "created_at": now,
            },
        ]
    )
    upcoming = (await client.get("/reminders/upcoming", headers=h)).json()
    assert all(r["medicine_id"] != str(clinda) for r in upcoming)
    assert any(r["medicine_name"] == "Ciprofloxacin" for r in upcoming)

    dash = (await client.get(f"/dashboard/{e['user']['id']}", headers=h)).json()
    names = {m["name"] for m in dash["medicines"]}
    assert "clindamycin" not in names
    assert "Ciprofloxacin" in names
    assert dash["adherence_totals"]["missed"] == 0  # the stray missed D/c row is not counted

    active = (await client.get("/medicines", headers=h)).json()
    assert "clindamycin" not in {m["name"] for m in active}
    everything = (await client.get("/medicines?include_stopped=true", headers=h)).json()
    assert "clindamycin" in {m["name"] for m in everything}


async def test_schedule_options_come_from_server(client):
    e = await register(client, "elder")
    opts = (await client.get("/medicines/schedule-options", headers=auth(e["token"]))).json()
    by = {o["value"]: o for o in opts}
    assert by["d2"]["times"] == ["08:00", "20:00"]
    assert by["prn"]["times"] == []
    assert by["custom"]["times"] == []


def test_extraction_schema_coerces_new_fields():
    r = ExtractionResult.model_validate(
        {
            "medicines": [
                {"name": "X", "prn": "yes", "meal_timing": "AFTER FOOD", "discontinue_mentioned": "true"}
            ]
        }
    )
    m = r.medicines[0]
    assert m.prn is True and m.discontinue_mentioned is True and m.meal_timing == "unknown"


def _oid(s: str):
    from bson import ObjectId

    return ObjectId(s)


async def test_quantity_limit_recovered_from_line_when_model_omits_it():
    """Live Gemini once put 'x 1 liter' only in instructions_raw; code copies it from the line."""
    line = ORDER_SHEET_LINES[KCL]
    res = ExtractionResult.model_validate(
        {
            "page_lines": [line],
            "medicines": [
                {
                    "original_text": line,
                    "name": "KCl",
                    "strength_text": "20 mEq",
                    "route_raw": "IV",
                    "instructions_raw": "in 1 L 0.9%NS IV at 100 ml/hr x 1 liter",
                    "confidence": 0.9,
                }
            ],
        }
    )

    class Replay:
        async def chat_json(self, **_):
            return res

    m = (await extract_prescription(Replay(), b"img")).medicines[0]
    assert m.quantity_limit_raw == "x 1 liter"
    assert m.duration_days is None


def test_quantity_in_text_never_takes_a_duration():
    from app.services.frequency import quantity_in_text

    assert quantity_in_text(ORDER_SHEET_LINES[CIPRO]) == "Disp: 14 tabs"
    assert quantity_in_text("Vancomycin 1,500 mg IV q12 hours x 3 days") is None


async def test_upcoming_ahead_hours_window(client, order_app):
    """The Android app asks for 7 days of reminders to schedule native alarms; the default stays 24h."""
    e = await register(client, "elder")
    await _extract_and_confirm(client, e["token"])
    h = auth(e["token"])
    day = (await client.get("/reminders/upcoming", headers=h)).json()
    week = (await client.get("/reminders/upcoming?ahead_hours=168", headers=h)).json()
    assert len(week) > len(day) >= 1
    assert (await client.get("/reminders/upcoming?ahead_hours=999", headers=h)).status_code == 422
