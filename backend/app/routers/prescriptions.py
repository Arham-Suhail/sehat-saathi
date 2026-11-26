import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.llm import LLMError, get_vision
from app.ratelimit import LLM_LIMIT, limiter, llm_global, user_key
from app.schemas import ExtractOut
from app.security import require_role
from app.services.extraction import extract_prescription
from app.uploads import normalize_image, read_image_body

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])
log = logging.getLogger(__name__)


@router.post("/extract", response_model=ExtractOut)
@limiter.limit(LLM_LIMIT, key_func=user_key)
@llm_global
async def extract(request: Request, user: dict = Depends(require_role("elder"))) -> ExtractOut:
    """Raw image body in, draft medicines out. Nothing is stored here; the user confirms
    via POST /medicines/confirm. The image only ever lives in memory."""
    raw = await read_image_body(request, request.app.state.settings.max_upload_bytes)
    image = normalize_image(raw)
    del raw
    try:
        return await extract_prescription(get_vision(request), image)
    except LLMError as e:
        log.warning("extraction failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Abhi tasveer parh nahi saka. Thori dair baad koshish karein ya khud likh dein.",
        ) from None
