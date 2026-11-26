"""The ONLY place the app talks to an LLM. Provider choice is env-driven:

    PROVIDER / VISION_* / TEXT_*  (see backend/.env.example)
    {VISION,TEXT}_FALLBACK_{1,2}_*  optional providers tried in order when the primary fails

Everything else imports get_vision() / get_text() from here.
"""

from typing import Any

from app.llm.base import LLMConfig, LLMError, LLMProvider
from app.llm.fake import FakeProvider
from app.llm.fallback import FallbackProvider
from app.llm.openai_compat import OpenAICompatProvider

__all__ = ["LLMError", "LLMProvider", "build_providers", "get_text", "get_vision"]


def _config(settings: Any, cap: str, max_retries: int = 1) -> LLMConfig:
    return LLMConfig(
        provider=getattr(settings, f"resolved_{cap}_provider"),
        base_url=getattr(settings, f"{cap}_base_url"),
        api_key=getattr(settings, f"{cap}_api_key"),
        model=getattr(settings, f"{cap}_model"),
        json_mode=getattr(settings, f"{cap}_json_mode"),
        supports_images=settings.vision_supports_images if cap == "vision" else False,
        timeout_seconds=settings.llm_timeout_seconds,
        max_retries=max_retries,
    )


def _fallback_config(settings: Any, cap: str, slot: dict, max_retries: int) -> LLMConfig:
    return LLMConfig(
        provider=slot["provider"],
        base_url=slot["base_url"],
        api_key=slot["api_key"],
        model=slot["model"],
        json_mode=slot["json_mode"],
        supports_images=cap == "vision",  # vision fallbacks must be image-capable models
        timeout_seconds=settings.llm_timeout_seconds,
        max_retries=max_retries,
    )


def _build(cfg: LLMConfig) -> LLMProvider:
    if cfg.provider == "fake":
        return FakeProvider()
    # Every non-fake provider is reached through its OpenAI-compatible endpoint.
    return OpenAICompatProvider(cfg)


def _build_capability(settings: Any, cap: str) -> LLMProvider:
    slots = settings.fallbacks(cap)
    if not slots:
        return _build(_config(settings, cap))
    # Every provider except the last gets no SDK retries: on a 429 we move on immediately.
    chain = [(getattr(settings, f"resolved_{cap}_provider"), _build(_config(settings, cap, max_retries=0)))]
    for i, slot in enumerate(slots):
        retries = 1 if i == len(slots) - 1 else 0
        chain.append((slot["provider"], _build(_fallback_config(settings, cap, slot, retries))))
    budget = settings.llm_vision_budget_seconds if cap == "vision" else settings.llm_text_budget_seconds
    return FallbackProvider(chain, budget_seconds=budget)


def build_providers(settings: Any) -> dict[str, LLMProvider]:
    return {"vision": _build_capability(settings, "vision"), "text": _build_capability(settings, "text")}


def get_vision(request: Any) -> LLMProvider:
    return request.app.state.llm["vision"]


def get_text(request: Any) -> LLMProvider:
    return request.app.state.llm["text"]
