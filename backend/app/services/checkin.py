"""Check-in: one LLM call labels mood + writes a short reply; the keyword fallback always runs.

If the LLM fails, the check-in is still logged with a safe canned reply, mood 'okay' and the
keyword-based concern flag — an outage must never hide a red flag or lose the elder's answer.
"""

import logging

from app.llm import LLMError, LLMProvider
from app.llm.prompts import checkin_system, wrap_user_message
from app.llm.schemas import CheckinLLM
from app.services.concern import detect_concern
from app.services.translit import to_roman
from app.texts import CONCERN_REPLY, DOCTOR_WORDS, FALLBACK_REPLY, FALLBACK_TIP, pick

log = logging.getLogger(__name__)

MOOD_SCORE = {"good": 3, "okay": 2, "low": 1}


def _fallback(lang: str) -> CheckinLLM:
    return CheckinLLM(
        reply=pick(FALLBACK_REPLY, lang), wellness_tip=pick(FALLBACK_TIP, lang), mood="okay", concern=False
    )


async def analyse(provider: LLMProvider, elder_text: str, lang: str = "roman") -> dict:
    """lang: 'roman' | 'ur' | 'en' — the language of the reply the elder will read."""
    try:
        out = await provider.chat_json(
            system=checkin_system(lang),
            user_text=wrap_user_message(elder_text),
            schema=CheckinLLM,
            max_tokens=400,
        )
        llm_ok = True
    except LLMError as e:
        log.warning("checkin llm failed: %s", e)
        out, llm_ok = _fallback(lang), False

    # Keywords on the original script AND its Roman form, so a red flag is caught either way.
    keywords = detect_concern(elder_text + "\n" + to_roman(elder_text))
    concern = out.concern or bool(keywords)
    reasons = [r for r in [", ".join(keywords) or None, out.concern_reason if out.concern else None] if r]
    reply = out.reply
    if concern and not any(w in reply.lower() for w in DOCTOR_WORDS.get(lang, DOCTOR_WORDS["roman"])):
        # Enforce the safety reply in code, not only in the prompt.
        reply = f"{reply} {pick(CONCERN_REPLY, lang)}".strip()
    mood = out.mood
    if keywords and mood == "good":
        mood = "okay"
    return {
        # Roman UI: a Hindi-script slip is transliterated. Urdu/English replies are kept as written.
        "reply": (to_roman(reply) if lang == "roman" else reply)[:500],
        "wellness_tip": out.wellness_tip,
        "mood": mood,
        "mood_score": MOOD_SCORE[mood],
        "concern_flag": concern,
        "concern_reason": ("; ".join(reasons))[:200] if reasons else None,
        "llm_ok": llm_ok,
    }
