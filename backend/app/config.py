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

    # Fallback providers, tried in order when the primary fails (rate limit, quota, outage...).
    # Each slot needs BASE_URL + API_KEY + MODEL; PROVIDER is only a label for logs.
    vision_fallback_1_provider: str | None = None
    vision_fallback_1_base_url: str | None = None
    vision_fallback_1_api_key: str | None = None
    vision_fallback_1_model: str | None = None
    vision_fallback_1_json_mode: Literal["json_schema", "json_object", "prompt"] = "json_object"
    vision_fallback_2_provider: str | None = None
    vision_fallback_2_base_url: str | None = None
    vision_fallback_2_api_key: str | None = None
    vision_fallback_2_model: str | None = None
    vision_fallback_2_json_mode: Literal["json_schema", "json_object", "prompt"] = "json_object"
    text_fallback_1_provider: str | None = None
    text_fallback_1_base_url: str | None = None
    text_fallback_1_api_key: str | None = None
    text_fallback_1_model: str | None = None
    text_fallback_1_json_mode: Literal["json_schema", "json_object", "prompt"] = "json_object"
    text_fallback_2_provider: str | None = None
    text_fallback_2_base_url: str | None = None
    text_fallback_2_api_key: str | None = None
    text_fallback_2_model: str | None = None
    text_fallback_2_json_mode: Literal["json_schema", "json_object", "prompt"] = "json_object"
    # Web Push (dose alarms when the app is closed; concern alerts). Both keys or neither.
    # Generate with: python -m scripts.gen_vapid   (writes them into backend/.env; never commit)
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str | None = None  # https://<your web app> or mailto:<ops address>; sent to push services

    # Email codes (verify email, forgot password) via Brevo. Both or neither; off when unset.
    # EMAIL_FROM must be a sender address verified in Brevo (Senders & IP).
    brevo_api_key: str | None = None
    email_from: str | None = None
    email_from_name: str = "Sehat Saathi"

    # Vapi voice tools (optional). The browser binds each live call to the signed-in elder;
    # when a webhook secret is set, Vapi must send it as X-Vapi-Secret or a bearer token.
    vapi_webhook_secret: str | None = None
    vapi_assistant_id: str | None = None

    # Whole-chain time budget, kept under the frontend timeouts (60 s text, 120 s upload).
    llm_text_budget_seconds: float = 50.0
    llm_vision_budget_seconds: float = 100.0

    @property
    def origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def email_enabled(self) -> bool:
        return bool((self.brevo_api_key or "").strip() and (self.email_from or "").strip())

    @property
    def push_enabled(self) -> bool:
        return bool((self.vapid_public_key or "").strip() and (self.vapid_private_key or "").strip())

    @property
    def resolved_vision_provider(self) -> str:
        return (self.vision_provider or self.provider).strip().lower()

    @property
    def resolved_text_provider(self) -> str:
        return (self.text_provider or self.provider).strip().lower()

    def fallbacks(self, cap: str) -> list[dict]:
        """Fully configured fallback slots for 'vision' or 'text', in order."""
        out = []
        for n in (1, 2):
            pre = f"{cap}_fallback_{n}"
            if (getattr(self, f"{pre}_base_url") or "").strip():
                out.append(
                    {
                        "provider": (getattr(self, f"{pre}_provider") or f"fallback-{n}").strip().lower(),
                        "base_url": getattr(self, f"{pre}_base_url").strip(),
                        "api_key": getattr(self, f"{pre}_api_key").strip(),
                        "model": getattr(self, f"{pre}_model").strip(),
                        "json_mode": getattr(self, f"{pre}_json_mode"),
                    }
                )
        return out

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
        for cap in ("vision", "text"):
            for n in (1, 2):
                pre = f"{cap}_fallback_{n}"
                parts = [
                    (getattr(self, f"{pre}_{f}") or "").strip() for f in ("base_url", "api_key", "model")
                ]
                if any(parts) and not all(parts):
                    problems.append(f"{pre.upper()} needs BASE_URL, API_KEY and MODEL (or none of them)")
        mail = [(self.brevo_api_key or "").strip(), (self.email_from or "").strip()]
        if any(mail) and not all(mail):
            problems.append("BREVO_API_KEY and EMAIL_FROM must be set together")
        if mail[1] and "@" not in mail[1]:
            problems.append("EMAIL_FROM must be an email address (a sender verified in Brevo)")
        vapi_secret = (self.vapi_webhook_secret or "").strip()
        if vapi_secret and (len(vapi_secret) < MIN_SECRET_LEN or vapi_secret.lower() in WEAK_SECRETS):
            problems.append(f"VAPI_WEBHOOK_SECRET is weak (need >= {MIN_SECRET_LEN} random characters)")
        vapid = [(self.vapid_public_key or "").strip(), (self.vapid_private_key or "").strip()]
        if any(vapid) and not all(vapid):
            problems.append("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together")
        if all(vapid) and not (self.vapid_subject or "").startswith(("https://", "mailto:")):
            problems.append("VAPID_SUBJECT must start with https:// or mailto:")
        if self.resolved_vision_provider != "fake" and not self.vision_supports_images:
            problems.append("VISION_SUPPORTS_IMAGES=false: the vision model must accept images")

        if problems:
            # Never include secret values in the message.
            raise ConfigError("Unsafe/incomplete configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
