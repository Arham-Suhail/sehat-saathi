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


class ExtractedMedicine(_LLMModel):
    name: Short(120) = Field(None, description="Medicine name exactly as written")
    strength: Short(60) = Field(None, description="Strength as written, e.g. '500 mg'")
    form: Short(40) = Field(None, description="tablet/capsule/syrup/... as written")
    dose: Short(80) = Field(None, description="Dose as written, e.g. '1 tablet'")
    frequency: Short(80) = Field(None, description="Frequency as written, e.g. '1+0+1', 'BD'")
    timing_text: Short(120) = Field(None, description="Timing words as written, e.g. 'subah sham'")
    duration: Short(60) = Field(None, description="Duration as written, e.g. '5 din'")
    instructions: Short(200) = Field(None, description="Instructions as written, e.g. 'khane ke baad'")
    confidence: Annotated[float, BeforeValidator(_confidence)] = Field(
        0.0, description="0-1: how sure you are that this item was read correctly"
    )
    illegible_fields: Annotated[list[str], BeforeValidator(_str_list(10, 40))] = Field(
        default_factory=list, description="Names of fields that were unreadable"
    )


class ExtractionResult(_LLMModel):
    is_prescription: bool = Field(True, description="False if the image is not a prescription")
    medicines: Annotated[list[ExtractedMedicine], Field(max_length=15)] = Field(default_factory=list)


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


class AlternativesLLM(_LLMModel):
    generic_name: Annotated[str, BeforeValidator(lambda v: _trunc(120)(v) or "unknown")] = Field(
        "unknown", description="Generic/salt name, or 'unknown'"
    )
    alternatives: Annotated[list[str], BeforeValidator(_str_list(5, 80))] = Field(
        default_factory=list, description="Generic options with the same salt and strength"
    )
