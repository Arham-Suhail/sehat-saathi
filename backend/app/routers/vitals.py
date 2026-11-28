from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_db
from app.schemas import VitalIn, VitalOut
from app.security import get_current_user, resolve_elder_access
from app.services.care import raise_alert

router = APIRouter(prefix="/vitals", tags=["vitals"])

UNITS = {
    "bp": "mmHg",
    "sugar": "mg/dL",
    "heart_rate": "bpm",
    "weight": "kg",
    "spo2": "%",
    "temperature": "°F",
}
RANGES = {"heart_rate": (20, 250), "weight": (10, 300), "spo2": (50, 100), "temperature": (90, 110)}


def vital_flag(d: dict) -> str | None:
    """A GENERAL GUIDE only (fixed bands set in code, not personal targets, never a diagnosis):
    outside it the app says "talk to your doctor"."""
    t = d["type"]
    if t == "bp":
        s, di = d.get("systolic") or 0, d.get("diastolic") or 0
        if s >= 160 or di >= 100:
            return "high"
        if s < 90 or di < 60:
            return "low"
        return None
    v = d.get("value")
    if v is None:
        return None
    bands = {"sugar": (70, 250), "heart_rate": (50, 120), "spo2": (92, 101), "temperature": (95, 100.4)}
    if t not in bands:
        return None
    lo, hi = bands[t]
    return "low" if v < lo else "high" if v > hi else None


def vital_out(d: dict) -> VitalOut:
    return VitalOut(
        id=str(d["_id"]),
        type=d["type"],
        systolic=d.get("systolic"),
        diastolic=d.get("diastolic"),
        value=d.get("value"),
        unit=d["unit"],
        measured_at=d["measured_at"],
        entered_by_role=d.get("entered_by_role", "elder"),
        note=d.get("note"),
        flag=vital_flag(d),
    )


@router.post("", response_model=VitalOut, status_code=status.HTTP_201_CREATED)
async def add_vital(
    body: VitalIn, user: dict = Depends(get_current_user), db: Any = Depends(get_db)
) -> VitalOut:
    # elder: self; family: linked elder; doctor: always 403 (read-only).
    target = resolve_elder_access(user, body.elder_id, "write")
    if body.type == "bp":
        if body.systolic is None or body.diastolic is None or body.value is not None:
            raise HTTPException(status_code=422, detail="BP ke liye upar aur neeche wali reading likhein")
        if body.diastolic >= body.systolic:
            raise HTTPException(status_code=422, detail="Neeche wali reading upar wali se kam honi chahiye")
    else:
        if body.value is None or body.systolic is not None or body.diastolic is not None:
            raise HTTPException(status_code=422, detail="Reading likhein")
        if body.type == "heart_rate" and not 20 <= body.value <= 250:
            raise HTTPException(status_code=422, detail="Dil ki dhadkan 20 aur 250 ke darmiyan honi chahiye")
        lo, hi = RANGES.get(body.type, (10, 600))
        if not lo <= body.value <= hi:
            raise HTTPException(status_code=422, detail="Reading likhein")
    now = datetime.now(UTC)
    measured = body.measured_at or now
    if measured.tzinfo is None:
        measured = measured.replace(tzinfo=UTC)
    if measured > now + timedelta(minutes=5) or measured < now - timedelta(days=365):
        raise HTTPException(status_code=422, detail="Waqt sahi nahi hai")
    doc = {
        "elder_id": target,
        "type": body.type,
        "systolic": body.systolic,
        "diastolic": body.diastolic,
        "value": round(body.value, 1) if body.value is not None else None,
        "unit": UNITS[body.type],
        "measured_at": measured,
        "note": body.note,
        "entered_by": user["_id"],
        "entered_by_role": user["role"],
        "created_at": now,
    }
    res = await db.vitals.insert_one(doc)
    doc["_id"] = res.inserted_id
    flag = vital_flag(doc)
    if flag:
        await raise_alert(
            db,
            target,
            "vitals",
            {"vital_id": res.inserted_id, "type": body.type, "flag": flag, "value": _reading(doc)},
            dedupe_key=f"vitals:{res.inserted_id}",
        )
    return vital_out(doc)


def _reading(d: dict) -> str:
    if d["type"] == "bp":
        return f"{d['systolic']}/{d['diastolic']} {d['unit']}"
    return f"{d['value']:g} {d['unit']}"


@router.get("", response_model=list[VitalOut])
async def list_vitals(
    elder_id: str | None = Query(None, max_length=24),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> list[VitalOut]:
    target = resolve_elder_access(user, elder_id, "read")
    docs = await db.vitals.find({"elder_id": target}).sort("measured_at", -1).to_list(length=limit)
    return [vital_out(d) for d in docs]
