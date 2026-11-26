"""Deterministic offline provider (PROVIDER=fake). Used in tests/CI and until a real key is set.

Behaviour is chosen so every UI path can be demoed: one clear medicine and one
low-confidence medicine (-> pharmacist banner). `fixture="order_sheet"` replays a
hospital medication order (IV, PRN and D/c lines) for regression tests."""

from app.llm.base import T
from app.llm.schemas import AlternativesLLM, CheckinLLM, ExtractionResult


def _line(original: str, **fields) -> dict:
    return {"original_text": original, "confidence": 0.9, "illegible_fields": [], **fields}


# A typical clinic prescription: one clear item, one unreadable item (-> pharmacist banner).
CLINIC_LINES = ["Tab Panadol 500 mg 1+0+1 khane ke baad 5 din", "Tab Amlo?? 1+0+0"]
CLINIC = {
    "is_prescription": True,
    "page_lines": CLINIC_LINES,
    "medicines": [
        _line(
            CLINIC_LINES[0],
            name="Panadol",
            strength_text="500 mg",
            frequency_raw="1+0+1",
            meal_timing="after",
            duration_raw="5 din",
            instructions_raw="khane ke baad",
            confidence=0.93,
        ),
        _line(
            CLINIC_LINES[1],
            name="Amlo??",
            frequency_raw="1+0+0",
            confidence=0.42,
            illegible_fields=["name", "strength"],
        ),
    ],
}

# Hospital medication order sheet (textbook sample) — regression fixture for the extraction bug.
ORDER_SHEET_LINES = [
    "Ciprofloxacin 500 mg  Sig: take 1 tab po bid x 7 days  Disp: 14 tabs",
    "Vancomycin 1,500 mg IV q12 hours x 3 days",
    "D/c clindamycin 600 mg IV q6 hours",
    "KCl 20 mEq in 1 L 0.9%NS IV at 100 ml/hr x 1 liter",
    "Acetaminophen 650 mg PO q6 hours prn temp >101°F",
]
ORDER_SHEET = {
    "is_prescription": True,
    "page_lines": ORDER_SHEET_LINES,
    "medicines": [
        _line(
            ORDER_SHEET_LINES[0],
            name="Ciprofloxacin",
            strength_text="500 mg",
            dose_text="1 tab",
            frequency_raw="bid",
            route_raw="po",
            duration_raw="x 7 days",
            quantity_limit_raw="Disp: 14 tabs",
            instructions_raw="Sig: take 1 tab po bid x 7 days",
        ),
        _line(
            ORDER_SHEET_LINES[1],
            name="Vancomycin",
            strength_text="1,500 mg",
            frequency_raw="q12 hours",
            route_raw="IV",
            duration_raw="x 3 days",
        ),
        _line(
            ORDER_SHEET_LINES[2],
            name="clindamycin",
            strength_text="600 mg",
            frequency_raw="q6 hours",
            route_raw="IV",
            instructions_raw="D/c",
            discontinue_mentioned=True,
        ),
        _line(
            ORDER_SHEET_LINES[3],
            name="KCl",
            strength_text="20 mEq",
            route_raw="IV",
            quantity_limit_raw="x 1 liter",
            instructions_raw="in 1 L 0.9%NS IV at 100 ml/hr",
        ),
        _line(
            ORDER_SHEET_LINES[4],
            name="Acetaminophen",
            strength_text="650 mg",
            frequency_raw="q6 hours",
            route_raw="PO",
            prn=True,
            prn_condition="temp >101°F",
        ),
    ],
}
FIXTURES = {"clinic": CLINIC, "order_sheet": ORDER_SHEET}


class FakeProvider:
    def __init__(self, fixture: str = "clinic") -> None:
        self.calls: list[dict] = []
        self.fixture = FIXTURES[fixture]

    async def chat_json(
        self,
        *,
        system: str,
        user_text: str,
        schema: type[T],
        images: list[bytes] | None = None,
        max_tokens: int = 1500,
        deadline: float | None = None,
    ) -> T:
        self.calls.append({"schema": schema.__name__, "user_text": user_text, "images": len(images or [])})

        if schema is ExtractionResult:
            data = self.fixture
        elif schema is CheckinLLM:
            text = user_text.lower()
            if any(w in text for w in ("acha", "achha", "theek", "khush", "good", "fine")):
                mood = "good"
            elif any(w in text for w in ("udaas", "thak", "akela", "pareshan", "sad", "tired")):
                mood = "low"
            else:
                mood = "okay"
            if any(w in text for w in ("اچھا", "ٹھیک", "خوش")):
                mood = "good"
            elif any(w in text for w in ("اداس", "تھک", "اکیلا", "پریشان")):
                mood = "low"
            # Answer in the language the system prompt asks for (see texts.LANG_INSTRUCTION).
            if "Urdu (Arabic/Nastaliq) script" in system:
                reply = "بتانے کا شکریہ۔ میں آپ کی بات سن رہا ہوں۔"
                tip = "آج تھوڑا پانی زیادہ پئیں اور کسی اپنے سے بات کریں۔"
            elif "plain English" in system:
                reply = "Thank you for telling me. I am listening."
                tip = "Drink a little more water today and talk to someone you love."
            else:
                reply = "Shukriya batane ka. Main aap ki baat sun raha hoon."
                tip = "Aaj thora paani zyada piyen aur kisi apne se baat karein."
            data = {
                "reply": reply,
                "wellness_tip": tip,
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
