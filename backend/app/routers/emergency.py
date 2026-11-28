"""Emergency contact for the elder's "Madad" (call for help) button.

The elder sets one contact (name + phone) on their own account; the app shows a tel: link.
Linked family/doctors may read it (same rules as every other elder data read). Only the elder
writes it. The phone number is never logged."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.db import get_db
from app.schemas import EmergencyContactIn, EmergencyContactOut
from app.security import get_current_user, require_role, resolve_elder_access

router = APIRouter(prefix="/emergency-contact", tags=["emergency"])


def _digits_ok(phone: str) -> bool:
    return 7 <= len(re.sub(r"\D", "", phone)) <= 15


@router.get("", response_model=EmergencyContactOut | None, response_model_exclude_none=True)
async def get_contact(
    elder_id: str | None = Query(None, max_length=24),
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> EmergencyContactOut | None:
    target = resolve_elder_access(user, elder_id, "read")
    elder = await db.users.find_one({"_id": target, "role": "elder"}, {"emergency_contact": 1})
    c = (elder or {}).get("emergency_contact")
    if not c:
        return None
    return EmergencyContactOut(name=c["name"], phone=c["phone"], name2=c.get("name2"), phone2=c.get("phone2"))


@router.put("", response_model=EmergencyContactOut, response_model_exclude_none=True)
async def set_contact(
    body: EmergencyContactIn,
    user: dict = Depends(require_role("elder")),
    db: Any = Depends(get_db),
) -> EmergencyContactOut:
    if not _digits_ok(body.phone) or (body.phone2 and not _digits_ok(body.phone2)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Phone number theek nahi"
        )
    contact = {"name": body.name, "phone": body.phone}
    if body.phone2:
        contact |= {"name2": body.name2 or body.phone2, "phone2": body.phone2}
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"emergency_contact": contact}})
    return EmergencyContactOut(**contact)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(user: dict = Depends(require_role("elder")), db: Any = Depends(get_db)) -> Response:
    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"emergency_contact": ""}})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
