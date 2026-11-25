from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_db
from app.ids import parse_object_id
from app.schemas import ConfirmIn, MedicineOut
from app.security import get_current_user, require_role, resolve_elder_access
from app.services.reminders import create_reminders
from app.services.schedule import course_end

router = APIRouter(prefix="/medicines", tags=["medicines"])


def medicine_out(doc: dict) -> MedicineOut:
    return MedicineOut(
        id=str(doc["_id"]),
        **{
            k: doc.get(k)
            for k in (
                "name",
                "strength",
                "form",
                "dose",
                "frequency",
                "timing_text",
                "duration",
                "instructions",
                "timings",
                "duration_days",
                "confidence",
                "needs_pharmacist",
                "edited_by_user",
                "status",
                "created_at",
            )
        },
    )


@router.post("/confirm", response_model=list[MedicineOut], status_code=status.HTTP_201_CREATED)
async def confirm(
    body: ConfirmIn, user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)
) -> list[MedicineOut]:
    now = datetime.now(UTC)
    out: list[MedicineOut] = []
    for m in body.medicines:
        # Server re-checks the safety flag: user edits can't silently clear missing fields.
        needs = m.needs_pharmacist or m.confidence < 0.7
        doc = {
            "elder_id": user["_id"],
            **m.model_dump(exclude={"needs_pharmacist"}),
            "timings": sorted(set(m.timings)),
            "needs_pharmacist": needs,
            "status": "confirmed",
            "end_at": course_end(now, m.duration_days),
            "created_at": now,
            "updated_at": now,
        }
        res = await db.medicines.insert_one(doc)
        doc["_id"] = res.inserted_id
        await create_reminders(db, doc, start=now, now=now)
        out.append(medicine_out(doc))
    return out


@router.get("", response_model=list[MedicineOut])
async def list_medicines(
    elder_id: str | None = Query(None, max_length=24),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[MedicineOut]:
    target = resolve_elder_access(user, elder_id, "read")
    docs = await db.medicines.find({"elder_id": target}).sort("created_at", -1).to_list(length=100)
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
