from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_db
from app.ids import parse_object_id
from app.schemas import AskIn, ConfirmIn, MedicineEditIn, MedicineOut, ReviewIn
from app.security import get_current_user, require_role, resolve_elder_access
from app.services.care import raise_alert, resolve_alerts
from app.services.frequency import ROUTE_LABEL, schedule_options
from app.services.medplan import NeedTime, plan
from app.services.reminders import create_reminders
from app.services.schedule import course_end

router = APIRouter(prefix="/medicines", tags=["medicines"])

# Older documents used these names; read them as a fallback.
_LEGACY = {
    "strength_text": "strength",
    "dose_text": "dose",
    "frequency_raw": "frequency",
    "instructions_raw": "instructions",
}


def _get(doc: dict, key: str):
    v = doc.get(key)
    return v if v is not None or key not in _LEGACY else doc.get(_LEGACY[key])


def medicine_out(doc: dict) -> MedicineOut:
    fields = (
        "name",
        "original_text",
        "strength_text",
        "dose_text",
        "frequency_raw",
        "frequency_label",
        "route_raw",
        "prn_condition",
        "duration_raw",
        "quantity_limit_raw",
        "instructions_raw",
        "timings",
        "duration_days",
        "confidence",
        "needs_pharmacist",
        "edited_by_user",
        "status",
        "created_at",
    )
    review = doc.get("review") or {}
    left = doc.get("doses_left")
    per_day = len(doc.get("timings") or []) if (doc.get("reminder_mode") or "fixed") == "fixed" else 0
    return MedicineOut(
        doses_left=left,
        days_left=round(left / per_day, 1) if left is not None and per_day else None,
        notes=[
            {"text": n["text"], "by_name": n.get("by_name"), "by_role": n.get("by_role"), "at": n["at"]}
            for n in (doc.get("notes") or [])[-20:]
        ],
        review_state=review.get("state") or "none",
        review_reason=review.get("reason"),
        on_hold=bool(review.get("hold")) and review.get("state") == "open",
        reviewed_by=review.get("by_name"),
        reviewed_role=review.get("by_role"),
        review_note=review.get("note"),
        reviewed_at=review.get("at"),
        id=str(doc["_id"]),
        **{k: _get(doc, k) for k in fields},
        route_kind=doc.get("route_kind") or "unknown",
        route_label=doc.get("route_label") or ROUTE_LABEL["unknown"],
        meal_timing=doc.get("meal_timing") or "unknown",
        prn=bool(doc.get("prn")),
        discontinued=bool(doc.get("discontinued")),
        reminder_mode=doc.get("reminder_mode") or ("stopped" if doc.get("status") == "stopped" else "fixed"),
    )


@router.get("/schedule-options")
async def schedule_options_route(_: dict = Depends(get_current_user)) -> list[dict]:
    """'Kitni baar' choices for the confirm screen; labels and default times come from code."""
    return schedule_options()


@router.post("/confirm", response_model=list[MedicineOut], status_code=status.HTTP_201_CREATED)
async def confirm(
    body: ConfirmIn, user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)
) -> list[MedicineOut]:
    now = datetime.now(UTC)
    try:
        plans = [plan(m) for m in body.medicines]
    except NeedTime:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Har dawai ka kam az kam ek waqt set karein.",
        ) from None
    out: list[MedicineOut] = []
    rx = await db.prescriptions.insert_one(
        {
            "elder_id": user["_id"],
            "diagnosis_text": body.diagnosis_text or None,
            "diagnosis_unclear": body.diagnosis_unclear,
            "ask_family": body.ask_family,
            "medicine_ids": [],
            "created_at": now,
        }
    )
    med_ids = []
    for m, pl in zip(body.medicines, plans, strict=True):
        # Family / doctor check: the elder asked for it, or the line was unclear (pharmacist flag).
        reason = "asked" if body.ask_family else ("unclear" if pl.needs_pharmacist else None)
        hold = body.ask_family and pl.status == "confirmed"
        doc = {
            "elder_id": user["_id"],
            **m.model_dump(
                exclude={
                    "needs_pharmacist",
                    "timings",
                    "status",
                    "reactivate_confirmed",
                    "frequency_choice",
                    "discontinue_mentioned",
                    "prn",
                    "meal_timing",
                }
            ),
            "timings": pl.timings,
            "needs_pharmacist": pl.needs_pharmacist,
            "discontinued": pl.discontinued,
            "reactivated": pl.discontinued and pl.status == "confirmed",
            "reminder_mode": pl.reminder_mode,
            "route_kind": pl.route_kind,
            "route_label": pl.route_label,
            "frequency_label": pl.frequency_label,
            "prn": pl.prn,
            "meal_timing": pl.meal_timing,
            "status": pl.status,
            "end_at": course_end(now, m.duration_days),
            "prescription_id": rx.inserted_id,
            "review": {"state": "open", "reason": reason, "hold": hold, "requested_at": now}
            if reason
            else None,
            "created_at": now,
            "updated_at": now,
        }
        res = await db.medicines.insert_one(doc)
        doc["_id"] = res.inserted_id
        med_ids.append(doc["_id"])
        if pl.status == "confirmed" and pl.reminder_mode == "fixed" and not hold:
            await create_reminders(db, doc, start=now, now=now)
        if reason and pl.status == "confirmed":
            await _review_alert(db, doc, reason, body.diagnosis_text, now)
        out.append(medicine_out(doc))
    await db.prescriptions.update_one({"_id": rx.inserted_id}, {"$set": {"medicine_ids": med_ids}})
    return out


async def _review_alert(
    db: Any, med: dict, reason: str, diagnosis: str | None, now: datetime, note=None
) -> None:
    await raise_alert(
        db,
        med["elder_id"],
        "med_review",
        {
            "medicine_id": med["_id"],
            "medicine_name": med.get("name") or "Dawai",
            "dose": med.get("dose_text"),
            "strength": med.get("strength_text"),
            "original_text": med.get("original_text"),
            "reason": reason,
            "diagnosis": diagnosis,
            "note": note,
        },
        dedupe_key=f"review:{med['_id']}:{ObjectId()}",
        now=now,
    )


@router.get("", response_model=list[MedicineOut])
async def list_medicines(
    elder_id: str | None = Query(None, max_length=24),
    include_stopped: bool = False,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[MedicineOut]:
    """Active medicines by default; stopped / discontinued orders only when asked for."""
    target = resolve_elder_access(user, elder_id, "read")
    query: dict = {"elder_id": target}
    if not include_stopped:
        query["status"] = "confirmed"
    docs = await db.medicines.find(query).sort("created_at", -1).to_list(length=100)
    return [medicine_out(d) for d in docs]


NOT_EDITABLE = "Is dawai ka waqt yahan nahi badla ja sakta"


@router.patch("/{medicine_id}", response_model=MedicineOut)
async def edit_medicine(
    medicine_id: str,
    body: MedicineEditIn,
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> MedicineOut:
    """Edit the alarm times of the caller's own active, fixed-schedule medicine.

    Future pending reminders are replaced by ones at the new times; past and acted-on reminders are
    kept so adherence history stays true. PRN, hospital (IV/IM/SC) and stopped medicines have no alarms
    and can't be edited here (code decides schedules, never the client: same rules as /confirm)."""
    mid = parse_object_id(medicine_id)
    med = await db.medicines.find_one({"_id": mid, "elder_id": user["_id"]})
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    if med.get("status") != "confirmed" or med.get("reminder_mode", "fixed") != "fixed":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NOT_EDITABLE)
    now = datetime.now(UTC)
    timings = sorted(set(body.timings))
    created = med.get("created_at") or now
    if created.tzinfo is None:  # PyMongo without tz_aware returns naive UTC datetimes
        created = created.replace(tzinfo=UTC)
    update = {
        "timings": timings,
        "dose_text": body.dose_text if body.dose_text is not None else med.get("dose_text"),
        "duration_days": body.duration_days,
        "end_at": course_end(created, body.duration_days),
        # The prescription's frequency label ("Subah aur raat") no longer matches user-chosen times.
        "frequency_label": None,
        "edited_by_user": True,
        "updated_at": now,
    }
    await db.medicines.update_one({"_id": mid, "elder_id": user["_id"]}, {"$set": update})
    await db.reminders.delete_many(
        {"elder_id": user["_id"], "medicine_id": mid, "status": "pending", "scheduled_at": {"$gt": now}}
    )
    doc = {**med, **update}
    await create_reminders(db, doc, start=now, now=now)
    return medicine_out(doc)


@router.post("/{medicine_id}/stop", response_model=MedicineOut)
async def stop_medicine(
    medicine_id: str, user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)
) -> MedicineOut:
    mid = parse_object_id(medicine_id)
    now = datetime.now(UTC)
    doc = await db.medicines.find_one_and_update(
        {"_id": mid, "elder_id": user["_id"]},
        {"$set": {"status": "stopped", "updated_at": now}},
        return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    await db.reminders.delete_many(
        {"elder_id": user["_id"], "medicine_id": mid, "status": "pending", "scheduled_at": {"$gt": now}}
    )
    return medicine_out(doc)


@router.post("/{medicine_id}/ask", response_model=MedicineOut)
async def ask_family(
    medicine_id: str, body: AskIn, user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)
) -> MedicineOut:
    """Elder: "I don't understand this medicine, please check it." Alarms keep ringing as set; the
    family / doctor get a review alert that repeats until one of them confirms the medicine."""
    mid = parse_object_id(medicine_id)
    med = await db.medicines.find_one({"_id": mid, "elder_id": user["_id"], "status": "confirmed"})
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    now = datetime.now(UTC)
    prev = med.get("review") or {}
    already_open = prev.get("state") == "open"
    review = {"state": "open", "reason": "asked", "hold": bool(prev.get("hold")), "requested_at": now}
    await db.medicines.update_one({"_id": mid}, {"$set": {"review": review, "updated_at": now}})
    med["review"] = review
    if not already_open:
        await _review_alert(db, med, "asked", None, now, note=body.note)
    return medicine_out(med)


@router.post("/{medicine_id}/review", response_model=MedicineOut)
async def review_medicine(
    medicine_id: str,
    body: ReviewIn,
    elder_id: str = Query(..., max_length=24),
    user: dict = Depends(require_role("family", "doctor")),
    db: Any = Depends(get_db),
) -> MedicineOut:
    """A linked family member or doctor checks a medicine (optionally correcting its times, dose or
    days). This is the one write a doctor may make: confirming what the elder could not. Alarms of an
    on-hold medicine start now; future reminders move to corrected times; history is kept."""
    target = resolve_elder_access(user, elder_id, "read")
    mid = parse_object_id(medicine_id)
    med = await db.medicines.find_one({"_id": mid, "elder_id": target, "status": "confirmed"})
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")
    fixed = med.get("reminder_mode", "fixed") == "fixed"
    if body.timings is not None and not fixed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NOT_EDITABLE)
    now = datetime.now(UTC)
    timings = sorted(set(body.timings)) if body.timings is not None else med.get("timings") or []
    if fixed and not timings:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Har dawai ka kam az kam ek waqt set karein.",
        )
    was_hold = bool((med.get("review") or {}).get("hold"))
    changed = body.timings is not None and timings != (med.get("timings") or [])
    created = med.get("created_at") or now
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    update = {
        "timings": timings,
        "dose_text": body.dose_text if body.dose_text is not None else med.get("dose_text"),
        "needs_pharmacist": False,
        "review": {
            "state": "done",
            "reason": (med.get("review") or {}).get("reason"),
            "hold": False,
            "by_id": user["_id"],
            "by_name": user["name"],
            "by_role": user["role"],
            "note": body.note,
            "at": now,
        },
        "updated_at": now,
    }
    if body.duration_days is not None:
        update["duration_days"] = body.duration_days
        update["end_at"] = course_end(created, body.duration_days)
    if changed:
        update["frequency_label"] = None
    await db.medicines.update_one({"_id": mid, "elder_id": target}, {"$set": update})
    doc = {**med, **update}
    if fixed and (changed or was_hold or body.duration_days is not None):
        await db.reminders.delete_many(
            {"elder_id": target, "medicine_id": mid, "status": "pending", "scheduled_at": {"$gt": now}}
        )
        await create_reminders(db, doc, start=now, now=now)
    await resolve_alerts(db, {"kind": "med_review", "data.medicine_id": mid}, user, now)
    return medicine_out(doc)
