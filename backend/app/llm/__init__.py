"""The ONLY place the app talks to an LLM. Provider choice is env-driven:

    PROVIDER / VISION_* / TEXT_*  (see backend/.env.example)

Everything else imports get_vision() / get_text() from here.
"""

from typing import Any

from app.llm.base import LLMConfig, LLMError, LLMProvider
from app.llm.fake import FakeProvider
from app.llm.openai_compat import OpenAICompatProvider

__all__ = ["LLMError", "LLMProvider", "build_providers", "get_text", "get_vision"]


def _config(settings: Any, cap: str) -> LLMConfig:
    return LLMConfig(
        provider=getattr(settings, f"resolved_{cap}_provider"),
        base_url=getattr(settings, f"{cap}_base_url"),
        api_key=getattr(settings, f"{cap}_api_key"),
        model=getattr(settings, f"{cap}_model"),
        json_mode=getattr(settings, f"{cap}_json_mode"),
        supports_images=settings.vision_supports_images if cap == "vision" else False,
        timeout_seconds=settings.llm_timeout_seconds,
    )


def _build(cfg: LLMConfig) -> LLMProvider:
    if cfg.provider == "fake":
        return FakeProvider()
    # Every non-fake provider is reached through its OpenAI-compatible endpoint.
    return OpenAICompatProvider(cfg)


def build_providers(settings: Any) -> dict[str, LLMProvider]:
    return {"vision": _build(_config(settings, "vision")), "text": _build(_config(settings, "text"))}


def get_vision(request: Any) -> LLMProvider:
    return request.app.state.llm["vision"]


def get_text(request: Any) -> LLMProvider:
    return request.app.state.llm["text"]
