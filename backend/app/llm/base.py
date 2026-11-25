from dataclasses import dataclass
from typing import Literal, Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)
JsonMode = Literal["json_schema", "json_object", "prompt"]


class LLMError(Exception):
    """Any provider failure (network, auth, quota, refusal, unparsable output). Message is safe to log."""


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    base_url: str | None
    api_key: str | None
    model: str | None
    json_mode: JsonMode
    supports_images: bool
    timeout_seconds: float


class LLMProvider(Protocol):
    async def chat_json(
        self,
        *,
        system: str,
        user_text: str,
        schema: type[T],
        images: list[bytes] | None = None,
        max_tokens: int = 1500,
    ) -> T: ...
