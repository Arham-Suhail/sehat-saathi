"""The single real provider: any OpenAI-compatible /chat/completions endpoint
(Gemini's OpenAI endpoint, OpenRouter, Groq, DeepSeek, Qwen, local servers...).
"""

import base64
import json
import logging
import re
from typing import Any

import openai
from openai import AsyncOpenAI
from pydantic import ValidationError

from app.llm.base import LLMConfig, LLMError, T

log = logging.getLogger(__name__)
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _extract_json_text(text: str) -> str:
    text = _FENCE.sub("", text.strip())
    # Fall back to the outermost {...} if the model wrapped JSON in prose.
    if not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
    return text


_DROP = {"description", "title", "default", "maxItems", "minItems", "maxLength", "minLength"}


def slim_schema(node: Any, *, is_properties: bool = False) -> Any:
    """Strip annotations that make constrained decoding blow up (Gemini: "too many states").
    Pydantic still enforces every limit on the response; the prompt explains each field."""
    if isinstance(node, dict):
        return {
            k: slim_schema(v, is_properties=(k == "properties" and not is_properties))
            for k, v in node.items()
            if is_properties or k not in _DROP
        }
    if isinstance(node, list):
        return [slim_schema(v) for v in node]
    return node


class OpenAICompatProvider:
    def __init__(self, cfg: LLMConfig):
        self.cfg = cfg
        self.client = AsyncOpenAI(
            base_url=cfg.base_url,
            api_key=cfg.api_key,
            timeout=cfg.timeout_seconds,
            max_retries=1,
        )

    def _response_format(self, schema: type[T]) -> dict | None:
        if self.cfg.json_mode == "json_schema":
            return {
                "type": "json_schema",
                "json_schema": {"name": schema.__name__, "schema": slim_schema(schema.model_json_schema())},
            }
        if self.cfg.json_mode == "json_object":
            return {"type": "json_object"}
        return None

    async def chat_json(
        self,
        *,
        system: str,
        user_text: str,
        schema: type[T],
        images: list[bytes] | None = None,
        max_tokens: int = 1500,
    ) -> T:
        if images and not self.cfg.supports_images:
            raise LLMError("configured model does not accept images")

        sys_prompt = system
        if self.cfg.json_mode != "json_schema":
            sys_prompt += (
                "\n\nRespond with ONLY one JSON object (no prose, no markdown) matching this JSON Schema:\n"
                + json.dumps(schema.model_json_schema(), ensure_ascii=False)
            )

        content: list[dict] = [{"type": "text", "text": user_text}]
        for img in images or []:
            b64 = base64.b64encode(img).decode("ascii")
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

        messages: list[dict] = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": content if images else user_text},
        ]
        kwargs: dict = {"model": self.cfg.model, "messages": messages, "max_tokens": max_tokens}
        fmt = self._response_format(schema)
        if fmt:
            kwargs["response_format"] = fmt

        last_err = "unknown"
        for attempt in range(2):
            try:
                resp = await self.client.chat.completions.create(**kwargs)
            except openai.RateLimitError as e:
                raise LLMError("provider rate limit / quota") from e
            except openai.AuthenticationError as e:
                raise LLMError("provider authentication failed") from e
            except openai.APITimeoutError as e:
                raise LLMError("provider timeout") from e
            except openai.APIConnectionError as e:
                raise LLMError("provider unreachable") from e
            except openai.APIStatusError as e:
                raise LLMError(f"provider error status {e.status_code}") from e

            choice = resp.choices[0] if resp.choices else None
            text = (choice.message.content or "") if choice and choice.message else ""
            if not text.strip():
                last_err = f"empty response (finish_reason={getattr(choice, 'finish_reason', None)})"
            else:
                try:
                    return schema.model_validate_json(_extract_json_text(text))
                except ValidationError:
                    last_err = "output failed schema validation"
            log.warning("llm output invalid, attempt %s: %s", attempt + 1, last_err)
            messages.append({"role": "assistant", "content": text[:2000] or "(empty)"})
            messages.append(
                {"role": "user", "content": "Return ONLY valid JSON that matches the schema. No other text."}
            )
        raise LLMError(last_err)
