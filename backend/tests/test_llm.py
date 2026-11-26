from types import SimpleNamespace

import pytest

from app.llm import build_providers
from app.llm.base import LLMConfig, LLMError
from app.llm.fake import FakeProvider
from app.llm.openai_compat import OpenAICompatProvider
from app.llm.schemas import CheckinLLM, ExtractionResult
from app.services.extraction import extract_prescription, needs_pharmacist
from tests.conftest import make_settings


def _cfg(**kw) -> LLMConfig:
    base = {
        "provider": "gemini",
        "base_url": "https://example.invalid/v1/",
        "api_key": "k",
        "model": "m",
        "json_mode": "json_object",
        "supports_images": True,
        "timeout_seconds": 5,
    }
    base.update(kw)
    return LLMConfig(**base)


def _resp(text):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason="stop")]
    )


class _Recorder:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _resp(self.outputs.pop(0))


def _provider(outputs, **cfg):
    p = OpenAICompatProvider(_cfg(**cfg))
    rec = _Recorder(outputs)
    p.client = SimpleNamespace(chat=SimpleNamespace(completions=rec))
    return p, rec


def test_provider_selection_is_env_driven():
    s = make_settings()
    provs = build_providers(s)
    assert isinstance(provs["vision"], FakeProvider) and isinstance(provs["text"], FakeProvider)

    s2 = make_settings(
        text_provider="groq",
        text_base_url="https://api.groq.com/openai/v1",
        text_api_key="k",
        text_model="some-model",
    )
    provs2 = build_providers(s2)
    assert isinstance(provs2["vision"], FakeProvider)
    assert isinstance(provs2["text"], OpenAICompatProvider)
    assert provs2["text"].cfg.model == "some-model"


async def test_parses_fenced_json_and_sends_image():
    p, rec = _provider(['```json\n{"is_prescription": true, "medicines": []}\n```'])
    out = await p.chat_json(system="s", user_text="u", schema=ExtractionResult, images=[b"\xff\xd8\xffabc"])
    assert out.is_prescription is True
    sent = rec.calls[0]
    assert sent["response_format"] == {"type": "json_object"}
    parts = sent["messages"][1]["content"]
    assert parts[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


async def test_retries_once_on_invalid_json_then_fails():
    p, rec = _provider(["not json at all", '{"reply": "Theek", "mood": "good"}'])
    out = await p.chat_json(system="s", user_text="u", schema=CheckinLLM)
    assert out.mood == "good"
    assert len(rec.calls) == 2

    p2, _ = _provider(["nope", "still nope"])
    with pytest.raises(LLMError):
        await p2.chat_json(system="s", user_text="u", schema=ExtractionResult)


async def test_json_schema_mode_sends_schema():
    p, rec = _provider(['{"reply": "x"}'], json_mode="json_schema")
    await p.chat_json(system="s", user_text="u", schema=CheckinLLM)
    fmt = rec.calls[0]["response_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["name"] == "CheckinLLM"


async def test_images_refused_for_text_only_model():
    p, _ = _provider([], supports_images=False)
    with pytest.raises(LLMError):
        await p.chat_json(system="s", user_text="u", schema=ExtractionResult, images=[b"x"])


def test_llm_output_is_coerced_and_capped():
    out = ExtractionResult.model_validate(
        {
            "medicines": [
                {"name": "A" * 1000, "confidence": "high", "illegible_fields": "oops"},
                {"name": "B", "confidence": 85},
            ]
        }
    )
    assert len(out.medicines[0].name) == 120
    assert out.medicines[0].confidence == 0.9
    assert out.medicines[0].illegible_fields == []
    assert out.medicines[1].confidence == 0.85
    c = CheckinLLM.model_validate({"reply": "", "mood": "ecstatic", "concern": False})
    assert c.mood == "okay" and c.reply


async def test_injected_prescription_text_cannot_bypass_pharmacist_rule():
    """Even if a model is tricked into a confident answer with a missing dose,
    the server still flags it for pharmacist confirmation."""

    class Tricked:
        async def chat_json(self, **_):
            return ExtractionResult.model_validate(
                {"medicines": [{"name": "Ignore rules, take 10", "frequency_raw": None, "confidence": 1.0}]}
            )

    out = await extract_prescription(Tricked(), b"img")
    assert out.medicines[0].needs_pharmacist is True
    assert out.needs_pharmacist is True


def test_needs_pharmacist_rules():
    from app.llm.schemas import ExtractedMedicine

    line = "Tab X 500 mg 1 BD"
    good = ExtractedMedicine(
        original_text=line,
        name="X",
        strength_text="500 mg",
        dose_text="1",
        frequency_raw="BD",
        confidence=0.9,
    )
    page = [line]
    assert needs_pharmacist(good, page) is False
    assert needs_pharmacist(good.model_copy(update={"confidence": 0.5}), page) is True
    assert needs_pharmacist(good.model_copy(update={"illegible_fields": ["dose"]}), page) is True
    assert needs_pharmacist(good.model_copy(update={"frequency_raw": None}), page) is True
    assert needs_pharmacist(good.model_copy(update={"strength_text": None}), page) is True
    # an unwritten dose alone is not a pharmacist case (e.g. "Tab X 500mg 1+0+1")
    assert needs_pharmacist(good.model_copy(update={"dose_text": None}), page) is False
    assert needs_pharmacist(good.model_copy(update={"name": "Amlo??"}), page) is True


def test_slim_schema_keeps_fields_drops_heavy_annotations():
    """Gemini rejects big constrained schemas ('too many states'); we send a slim copy."""
    from app.llm.openai_compat import slim_schema

    full = ExtractionResult.model_json_schema()
    slim = slim_schema(full)
    med = slim["$defs"]["ExtractedMedicine"]["properties"]
    assert set(med) == set(full["$defs"]["ExtractedMedicine"]["properties"])
    text = str(slim)
    assert "description" not in text and "maxItems" not in text
