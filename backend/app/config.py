"""Settings loaded from environment. Fails fast on missing or weak secrets."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

WEAK_SECRETS = {
    "changeme",
    "change-me",
    "secret",
    "jwt_secret",
    "password",
    "<generate-a-long-random-secret>",
}
MIN_SECRET_LEN = 32


class ConfigError(RuntimeError):
    """Raised at startup when configuration is unsafe or incomplete."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"

    mongodb_uri: str = ""
    mongodb_db: str = "sehat_saathi"

    jwt_secret: str = ""
    elder_token_days: int = 7
    carer_token_hours: int = 12

    allowed_origins: str = "http://localhost:5173"

    max_upload_bytes: int = 5 * 1024 * 1024

    # LLM — PROVIDER is the default for both capabilities.
    provider: str = "fake"
    vision_provider: str | None = None
    vision_base_url: str | None = None
    vision_api_key: str | None = None
    vision_model: str | None = None
    vision_json_mode: Literal["json_schema", "json_object", "prompt"] = "json_object"
    vision_supports_images: bool = True
    text_provider: str | None = None
    text_base_url: str | None = None
    text_api_key: str | None = None
    text_model: str | None = None
    text_json_mode: Literal["json_schema", "json_object", "prompt"] = "json_object"
    llm_timeout_seconds: float = 45.0

    @property
    def origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def resolved_vision_provider(self) -> str:
        return (self.vision_provider or self.provider).strip().lower()

    @property
    def resolved_text_provider(self) -> str:
        return (self.text_provider or self.provider).strip().lower()

    @model_validator(mode="after")
    def _fail_fast(self) -> "Settings":
        problems: list[str] = []

        secret = self.jwt_secret.strip()
        if not secret:
            problems.append("JWT_SECRET is missing")
        elif len(secret) < MIN_SECRET_LEN or secret.lower() in WEAK_SECRETS:
            problems.append(f"JWT_SECRET is weak (need >= {MIN_SECRET_LEN} random characters)")

        if self.env != "test" and not self.mongodb_uri.strip():
            problems.append("MONGODB_URI is missing")

        if "*" in self.origins:
            problems.append("ALLOWED_ORIGINS must not contain '*'")

        for cap in ("vision", "text"):
            prov = getattr(self, f"resolved_{cap}_provider")
            if prov == "fake":
                if self.env == "prod":
                    problems.append(f"{cap.upper()} provider is 'fake' in prod")
                continue
            for field in ("base_url", "api_key", "model"):
                if not (getattr(self, f"{cap}_{field}") or "").strip():
                    problems.append(f"{cap.upper()}_{field.upper()} is required for provider '{prov}'")
        if self.resolved_vision_provider != "fake" and not self.vision_supports_images:
            problems.append("VISION_SUPPORTS_IMAGES=false: the vision model must accept images")

        if problems:
            # Never include secret values in the message.
            raise ConfigError("Unsafe/incomplete configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
