import logging
from typing import Any
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.cache import alternatives_cache
from app.db import get_db
from app.ids import parse_object_id
from app.llm import LLMError, get_text
from app.llm.prompts import ALTERNATIVES_SYSTEM, wrap_user_message
from app.llm.schemas import AlternativesLLM
from app.ratelimit import LLM_LIMIT, limiter, llm_global, user_key
from app.schemas import AlternativesOut, PriceLinks, ProductOut
from app.security import allowed_elder_ids, get_current_user
from app.services.alternatives_guard import is_safe_alternative

router = APIRouter(tags=["alternatives"])
log = logging.getLogger(__name__)


def price_links(product: str) -> PriceLinks:
    """Fixed hosts only; the product text is just an encoded query value (no scraping, no prices
    from the LLM: the user sees the real price on the pharmacy's own page)."""
    q = quote_plus(product[:100])
    return PriceLinks(
        dawaai=f"https://dawaai.pk/search?search={q}",
        google=f"https://www.google.com/search?q={q}+price+Pakistan",
    )


@router.get("/medicines/{medicine_id}/alternatives", response_model=AlternativesOut)
@limiter.limit(LLM_LIMIT, key_func=user_key)
@llm_global
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

    strength = (med.get("strength_text") or med.get("strength") or "").strip()
    key = f"{med['name'].strip().lower()}|{strength.lower()}"
    cached = alternatives_cache.get(key)
    if cached is None:
        try:
            cached = await get_text(request).chat_json(
                system=ALTERNATIVES_SYSTEM,
                user_text=wrap_user_message(
                    f"Medicine: {med['name']}\nStrength: {strength or 'not written'}"
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

    own = f"{med['name']} {strength}".strip()
    # Never list the brand the elder already takes as an "alternative" (it is shown as `current`).
    first_word = med["name"].strip().lower().split()[0] if med["name"].strip() else ""
    others = [
        p
        for p in cached.products
        if (not first_word or first_word not in p.name.lower())
        # Code check over the LLM: wrong salt (Disprin for paracetamol), combos, other strengths.
        and is_safe_alternative(p.name, cached.generic_name, med["name"], strength)
    ]
    return AlternativesOut(
        medicine_id=str(med["_id"]),
        medicine_name=med["name"],
        generic_name=cached.generic_name,
        current=ProductOut(name=own, links=price_links(own)),
        products=[ProductOut(name=p.name, company=p.company, links=price_links(p.name)) for p in others],
    )
