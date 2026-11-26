"""Provider fallback chain: try each configured provider in order until one answers.

Any LLMError (rate limit/quota, timeout, outage, auth, unusable output) moves on to the next
provider, so the app keeps working when a free tier runs out. Safety does not depend on which
model answered: every answer still goes through the same prompt, Pydantic schema and code rules.
The whole chain shares one time budget, kept under the frontend's request timeout.
"""

import logging
import time

from app.llm.base import LLMError, LLMProvider, T

log = logging.getLogger(__name__)


class FallbackProvider:
    def __init__(self, providers: list[tuple[str, LLMProvider]], budget_seconds: float):
        if not providers:
            raise ValueError("at least one provider")
        self.providers = providers
        self.budget_seconds = budget_seconds

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
        own = time.monotonic() + self.budget_seconds
        deadline = min(deadline, own) if deadline is not None else own
        last = "no provider tried"
        for i, (name, provider) in enumerate(self.providers):
            if time.monotonic() >= deadline:
                last = "time budget exhausted"
                break
            try:
                out = await provider.chat_json(
                    system=system,
                    user_text=user_text,
                    schema=schema,
                    images=images,
                    max_tokens=max_tokens,
                    deadline=deadline,
                )
                if i:
                    log.warning("llm fallback served by %s (position %s)", name, i + 1)
                return out
            except LLMError as e:
                # Messages are fixed strings (no user data); safe to log.
                log.warning("llm provider %s failed: %s", name, e)
                last = f"{name}: {e}"
        raise LLMError(f"all providers failed (last: {last})")
