"""Provider fallback chain: if one LLM provider is rate-limited / down, the next one answers."""

import asyncio
import time

import pytest

from app.config import ConfigError
from app.llm import build_providers
from app.llm.base import LLMError
from app.llm.fallback import FallbackProvider
from app.llm.openai_compat import OpenAICompatProvider
from app.llm.schemas import CheckinLLM
from tests.conftest import make_settings
from tests.test_llm import _provider

OK = '{"reply": "Shukriya", "wellness_tip": "Paani piyen", "mood": "good", "concern": false}'


class _Stub:
    """A provider that fails with the given error, or answers; records whether it was called."""

    def __init__(self, error: str | None = None, delay: float = 0.0):
        self.error, self.delay, self.calls = error, delay, 0

    async def chat_json(self, *, schema, deadline=None, **kw):
        self.calls += 1
        await asyncio.sleep(self.delay)
        if self.error:
            raise LLMError(self.error)
        return schema.model_validate_json(OK)


async def _ask(chain):
    return await chain.chat_json(system="s", user_text="u", schema=CheckinLLM)


async def test_rate_limited_primary_falls_back_to_next():
    a, b = _Stub("provider rate limit / quota"), _Stub()
    out = await _ask(FallbackProvider([("gemini", a), ("groq", b)], budget_seconds=30))
    assert out.reply == "Shukriya" and (a.calls, b.calls) == (1, 1)


async def test_any_provider_error_falls_back():
    for err in (
        "provider timeout",
        "provider unreachable",
        "provider error status 503",
        "provider authentication failed",
        "output failed schema validation",
    ):
        a, b = _Stub(err), _Stub()
        await _ask(FallbackProvider([("gemini", a), ("groq", b)], budget_seconds=30))
        assert b.calls == 1, err


async def test_healthy_primary_never_touches_fallbacks():
    a, b = _Stub(), _Stub()
    await _ask(FallbackProvider([("gemini", a), ("groq", b)], budget_seconds=30))
    assert (a.calls, b.calls) == (1, 0)


async def test_all_providers_failing_raises_llm_error():
    chain = FallbackProvider(
        [("a", _Stub("provider timeout")), ("b", _Stub("provider rate limit / quota"))], budget_seconds=30
    )
    with pytest.raises(LLMError):
        await _ask(chain)


async def test_time_budget_stops_the_chain():
    slow, never = _Stub("provider timeout", delay=0.3), _Stub()
    started = time.monotonic()
    with pytest.raises(LLMError):
        await _ask(FallbackProvider([("slow", slow), ("never", never)], budget_seconds=0.2))
    assert never.calls == 0 and time.monotonic() - started < 1.0


async def test_each_attempt_gets_only_the_remaining_time():
    p, rec = _provider([OK], timeout_seconds=45)
    await p.chat_json(system="s", user_text="u", schema=CheckinLLM, deadline=time.monotonic() + 10)
    assert rec.calls[0]["timeout"] <= 10.5


def _fallback_env(**over):
    env = dict(
        provider="gemini",
        vision_base_url="https://v.example/v1",
        vision_api_key="kv",
        vision_model="vm",
        text_base_url="https://t.example/v1",
        text_api_key="kt",
        text_model="tm",
        text_fallback_1_provider="groq",
        text_fallback_1_base_url="https://g.example/v1",
        text_fallback_1_api_key="kg",
        text_fallback_1_model="llama",
        text_fallback_1_json_mode="json_object",
        vision_fallback_1_provider="openrouter",
        vision_fallback_1_base_url="https://o.example/v1",
        vision_fallback_1_api_key="ko",
        vision_fallback_1_model="gemma",
    )
    env.update(over)
    return make_settings(**env)


def test_env_builds_a_chain_primary_first_and_fails_fast_between_providers():
    provs = build_providers(_fallback_env())
    text, vision = provs["text"], provs["vision"]
    assert isinstance(text, FallbackProvider) and isinstance(vision, FallbackProvider)
    assert [name for name, _ in text.providers] == ["gemini", "groq"]
    assert [name for name, _ in vision.providers] == ["gemini", "openrouter"]
    primary, fallback = text.providers[0][1], text.providers[1][1]
    assert isinstance(primary, OpenAICompatProvider) and primary.cfg.model == "tm"
    assert fallback.cfg.model == "llama" and fallback.cfg.json_mode == "json_object"
    # No SDK-level retry/backoff on a provider that has a fallback: move on immediately.
    assert primary.client.max_retries == 0
    assert vision.providers[1][1].cfg.supports_images is True


def test_no_fallback_configured_keeps_single_provider():
    provs = build_providers(
        _fallback_env(
            text_fallback_1_provider=None,
            text_fallback_1_base_url=None,
            text_fallback_1_api_key=None,
            text_fallback_1_model=None,
        )
    )
    assert isinstance(provs["text"], OpenAICompatProvider)


def test_half_configured_fallback_fails_at_startup():
    with pytest.raises(ConfigError) as e:
        _fallback_env(text_fallback_2_base_url="https://x.example/v1")  # no key / model
    assert "TEXT_FALLBACK_2" in str(e.value) and "kg" not in str(e.value)
