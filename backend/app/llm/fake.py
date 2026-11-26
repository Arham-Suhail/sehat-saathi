"""Deterministic offline provider (PROVIDER=fake). Used in tests/CI and until a real key is set.

Behaviour is chosen so every UI path can be demoed: one clear medicine and one
low-confidence medicine (-> pharmacist banner)."""

from app.llm.base import T
from app.llm.schemas import AlternativesLLM, CheckinLLM, ExtractionResult


class FakeProvider:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def chat_json(
        self,
        *,
        system: str,
        user_text: str,
        schema: type[T],
        images: list[bytes] | None = None,
        max_tokens: int = 1500,
    ) -> T:
        self.calls.append({"schema": schema.__name__, "user_text": user_text, "images": len(images or [])})

        if schema is ExtractionResult:
            data = {
                "is_prescription": True,
                "medicines": [
                    {
                        "name": "Panadol",
                        "strength": "500 mg",
                        "form": "tablet",
                        "dose": "1 tablet",
                        "frequency": "1+0+1",
                        "timing_text": "subah, raat",
                        "duration": "5 din",
                        "instructions": "khane ke baad",
                        "confidence": 0.93,
                        "illegible_fields": [],
                    },
                    {
                        "name": "Amlo...",
                        "strength": None,
                        "form": "tablet",
                        "dose": None,
                        "frequency": "1+0+0",
                        "timing_text": None,
                        "duration": None,
                        "instructions": None,
                        "confidence": 0.42,
                        "illegible_fields": ["name", "strength", "dose"],
                    },
                ],
            }
        elif schema is CheckinLLM:
            text = user_text.lower()
            if any(w in text for w in ("acha", "achha", "theek", "khush", "good", "fine")):
                mood = "good"
            elif any(w in text for w in ("udaas", "thak", "akela", "pareshan", "sad", "tired")):
                mood = "low"
            else:
                mood = "okay"
            data = {
                "reply": "Shukriya batane ka. Main aap ki baat sun raha hoon.",
                "wellness_tip": "Aaj thora paani zyada piyen aur kisi apne se baat karein.",
                "mood": mood,
                "concern": False,  # fake never flags; the keyword fallback must catch symptoms
                "concern_reason": None,
            }
        elif schema is AlternativesLLM:
            known = {"panadol": ("Paracetamol", ["Paracetamol 500 mg (generic)", "Panadol 500 mg"])}
            hit = next((v for k, v in known.items() if k in user_text.lower()), None)
            data = (
                {"generic_name": hit[0], "alternatives": hit[1]}
                if hit
                else {"generic_name": "unknown", "alternatives": []}
            )
        else:
            raise NotImplementedError(schema.__name__)
        return schema.model_validate(data)
