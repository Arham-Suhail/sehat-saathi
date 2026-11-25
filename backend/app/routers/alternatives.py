import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.cache import alternatives_cache
from app.db import get_db
from app.ids import parse_object_id
from app.llm import LLMError, get_text
from app.llm.prompts import ALTERNATIVES_SYSTEM, wrap_user_message
from app.llm.schemas import AlternativesLLM
from app.ratelimit import LLM_LIMIT, limiter, user_key
from app.schemas import AlternativesOut
from app.security import allowed_elder_ids, get_current_user

router = APIRouter(tags=["alternatives"])
log = logging.getLogger(__name__)


@router.get("/medicines/{medicine_id}/alternatives", response_model=AlternativesOut)
@limiter.limit(LLM_LIMIT, key_func=user_key)
async def alternatives(
    request: Request,
    medicine_id: str,
    user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> AlternativesOut:
    mid = parse_object_id(medicine_id)
    # Ownership in the query itself: another elder's medicine is simply "not found".
    med = await db.medicines.find_one({"_id": mid, "elder_id": {"$in": allowed_elder_ids(user)}})
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nahi mila")

    key = f"{med['name'].strip().lower()}|{(med.get('strength') or '').strip().lower()}"
    cached = alternatives_cache.get(key)
    if cached is None:
        try:
            cached = await get_text(request).chat_json(
                system=ALTERNATIVES_SYSTEM,
                user_text=wrap_user_message(
                    f"Medicine: {med['name']}\nStrength: {med.get('strength') or 'not written'}"
                ),
                schema=AlternativesLLM,
                max_tokens=400,
            )
        except LLMError as e:
            log.warning("alternatives llm failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Abhi mashwara nahi mil saka. Baad mein koshish karein.",
            ) from None
        alternatives_cache.set(key, cached)

    return AlternativesOut(
        medicine_id=str(med["_id"]),
        medicine_name=med["name"],
        generic_name=cached.generic_name,
        alternatives=cached.alternatives,
    )
