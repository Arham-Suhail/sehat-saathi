"""Check-in: one LLM call labels mood + writes a short reply; the keyword fallback always runs.

If the LLM fails, the check-in is still logged with a safe canned reply, mood 'okay' and the
keyword-based concern flag — an outage must never hide a red flag or lose the elder's answer.
"""

import logging

from app.llm import LLMError, LLMProvider
from app.llm.prompts import CHECKIN_SYSTEM, wrap_user_message
from app.llm.schemas import CheckinLLM
from app.services.concern import detect_concern

log = logging.getLogger(__name__)

GREETING = "Assalam o Alaikum! Aaj aap kaisa mehsoos kar rahe hain?"
MOOD_SCORE = {"good": 3, "okay": 2, "low": 1}
CONCERN_REPLY = "Aap ne jo bataya us par dhyan dein — apne doctor ya ghar walon se baat karein."
FALLBACK = CheckinLLM(
    reply="Shukriya batane ka. Main ne aap ki baat note kar li hai.",
    wellness_tip="Aaj thora paani zyada piyen aur kuch dair aaram karein.",
    mood="okay",
    concern=False,
)


async def analyse(provider: LLMProvider, elder_text: str) -> dict:
    try:
        out = await provider.chat_json(
            system=CHECKIN_SYSTEM,
            user_text=wrap_user_message(elder_text),
            schema=CheckinLLM,
            max_tokens=400,
        )
        llm_ok = True
    except LLMError as e:
        log.warning("checkin llm failed: %s", e)
        out, llm_ok = FALLBACK, False

    keywords = detect_concern(elder_text)
    concern = out.concern or bool(keywords)
    reasons = [r for r in [", ".join(keywords) or None, out.concern_reason if out.concern else None] if r]
    reply = out.reply
    if concern and "doctor" not in reply.lower():
        # Enforce the safety reply in code, not only in the prompt.
        reply = f"{reply} {CONCERN_REPLY}".strip()
    mood = out.mood
    if keywords and mood == "good":
        mood = "okay"
    return {
        "reply": reply[:500],
        "wellness_tip": out.wellness_tip,
        "mood": mood,
        "mood_score": MOOD_SCORE[mood],
        "concern_flag": concern,
        "concern_reason": ("; ".join(reasons))[:200] if reasons else None,
        "llm_ok": llm_ok,
    }
