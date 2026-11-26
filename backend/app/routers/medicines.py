from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_db
from app.ids import parse_object_id
from app.schemas import ConfirmIn, MedicineOut
from app.security import get_current_user, require_role, resolve_elder_access
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
    return MedicineOut(
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
    for m, pl in zip(body.medicines, plans, strict=True):
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
            "created_at": now,
            "updated_at": now,
        }
        res = await db.medicines.insert_one(doc)
        doc["_id"] = res.inserted_id
        if pl.status == "confirmed" and pl.reminder_mode == "fixed":
            await create_reminders(db, doc, start=now, now=now)
        out.append(medicine_out(doc))
    return out


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
