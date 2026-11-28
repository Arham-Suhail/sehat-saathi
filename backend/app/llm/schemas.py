"""Output schemas for LLM calls. LLM output is untrusted: everything is
length-capped and coerced here before any code touches it."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _trunc(n: int):
    def inner(v: Any) -> Any:
        if v is None:
            return None
        if not isinstance(v, str):
            v = str(v)
        v = " ".join(v.split())  # collapse whitespace / control chars
        return v[:n] if v else None

    return inner


def _confidence(v: Any) -> float:
    if isinstance(v, str):
        mapping = {"high": 0.9, "medium": 0.6, "low": 0.3}
        if v.strip().lower() in mapping:
            return mapping[v.strip().lower()]
        try:
            v = float(v)
        except ValueError:
            return 0.0
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    if f > 1:  # model answered in percent
        f = f / 100
    return max(0.0, min(1.0, f))


def _str_list(max_items: int, max_len: int):
    def inner(v: Any) -> list[str]:
        if not isinstance(v, list):
            return []
        out = []
        for item in v[:max_items]:
            s = _trunc(max_len)(item)
            if s:
                out.append(s)
        return out

    return inner


def Short(n: int):  # noqa: N802 - type factory
    return Annotated[str | None, BeforeValidator(_trunc(n))]


class _LLMModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


def _meal(v: Any) -> str:
    s = str(v).strip().lower() if v is not None else ""
    return s if s in {"before", "after", "with", "none", "unknown"} else "unknown"


def _bool(v: Any) -> bool:
    if isinstance(v, str):
        return v.strip().lower() in {"true", "yes", "1"}
    return bool(v)


Flag = Annotated[bool, BeforeValidator(_bool)]


class ExtractedMedicine(_LLMModel):
    """One prescription line, transcribed verbatim. The model never decides the schedule:
    services/frequency.py translates the abbreviations and code decides reminders."""

    original_text: Short(400) = Field(None, description="The FULL line exactly as written on the page")
    name: Short(120) = Field(None, description="Medicine name exactly as written")
    strength_text: Short(60) = Field(None, description="Strength with its unit as written, e.g. '20 mEq'")
    dose_text: Short(80) = Field(None, description="Amount per dose as written, e.g. '1 tab'")
    frequency_raw: Short(80) = Field(
        None, description="Frequency as written, e.g. 'bid', 'q6 hours', '1+0+1'"
    )
    route_raw: Short(40) = Field(None, description="Route as written, e.g. 'po', 'IV'")
    meal_timing: Annotated[str, BeforeValidator(_meal)] = Field(
        "unknown", description="before|after|with|none|unknown — only if written"
    )
    prn: Flag = Field(False, description="True if written as needed (prn, SOS, zaroorat par)")
    prn_condition: Short(120) = Field(None, description="Condition for prn exactly as written")
    duration_raw: Short(60) = Field(None, description="Duration as written, e.g. 'x 7 days'")
    quantity_limit_raw: Short(80) = Field(
        None, description="Quantity/limit as written, e.g. 'x 1 liter', 'Disp: 14 tabs'"
    )
    instructions_raw: Short(300) = Field(None, description="Any other text on the line, as written")
    discontinue_mentioned: Flag = Field(False, description="True if D/c, dc, discontinue or stop is written")
    confidence: Annotated[float, BeforeValidator(_confidence)] = Field(
        0.0, description="0-1: how sure you are that this item was read correctly"
    )
    illegible_fields: Annotated[list[str], BeforeValidator(_str_list(10, 40))] = Field(
        default_factory=list, description="Names of fields that are written but unreadable"
    )


class ExtractionResult(_LLMModel):
    is_prescription: bool = Field(True, description="False if the image is not a prescription")
    page_lines: Annotated[list[str], BeforeValidator(_str_list(40, 400))] = Field(
        default_factory=list, description="Every medicine-related line on the page, verbatim"
    )
    medicines: Annotated[list[ExtractedMedicine], Field(max_length=15)] = Field(default_factory=list)
    diagnosis_text: Short(300) = Field(
        None, description="Diagnosis / complaint exactly as written (Dx, Diagnosis, c/o, Imp), else null"
    )
    diagnosis_confidence: Annotated[float, BeforeValidator(_confidence)] = Field(
        1.0, description="0-1: how sure you are that the diagnosis was read correctly"
    )


def _mood(v: Any) -> str:
    s = str(v).strip().lower() if v is not None else ""
    return s if s in {"good", "okay", "low"} else "okay"


class CheckinLLM(_LLMModel):
    reply: Annotated[str, BeforeValidator(lambda v: _trunc(400)(v) or "Shukriya batane ka.")] = Field(
        description="Short warm reply in Roman Urdu (1-2 sentences)"
    )
    wellness_tip: Annotated[str, BeforeValidator(lambda v: _trunc(200)(v) or "")] = Field(
        "", description="One general wellness tip for today in Roman Urdu"
    )
    mood: Annotated[Literal["good", "okay", "low"], BeforeValidator(_mood)] = "okay"
    concern: bool = Field(False, description="True if the elder mentions any physical symptom or distress")
    concern_reason: Short(120) = None


class ProductLLM(_LLMModel):
    name: Annotated[str, BeforeValidator(lambda v: _trunc(80)(v) or "")] = ""
    company: Short(60) = None


def _products(v: Any) -> list:
    """Untrusted list -> at most 6 products with a non-empty name (bad items are dropped)."""
    if not isinstance(v, list):
        return []
    out = []
    for item in v[:12]:
        if isinstance(item, str):
            item = {"name": item}
        if isinstance(item, dict) and str(item.get("name") or "").strip():
            out.append(item)
    return out[:6]


class AlternativesLLM(_LLMModel):
    generic_name: Annotated[str, BeforeValidator(lambda v: _trunc(120)(v) or "unknown")] = Field(
        "unknown", description="Generic/salt name, or 'unknown'"
    )
    products: Annotated[list[ProductLLM], BeforeValidator(_products)] = Field(
        default_factory=list, description="Products sold in Pakistan with the same salt and strength"
    )
