"""Smoke-test every configured LLM provider ONE BY ONE (primary and each fallback), not via the chain.

    cd backend && .venv/Scripts/python -m scripts.smoke_llm

Uses the settings in backend/.env. Sends only a fixed test sentence and a generated FAKE
prescription image. Prints provider / model / OK or the error type and the time taken;
never prints API keys, URLs with credentials, or model output text.
"""

import asyncio
import io
import time

from PIL import Image, ImageDraw, ImageFont

from app.config import get_settings
from app.llm import LLMError, _build, _config, _fallback_config
from app.llm.prompts import CHECKIN_SYSTEM, EXTRACT_SYSTEM, wrap_user_message
from app.llm.schemas import CheckinLLM, ExtractionResult


def fake_prescription() -> bytes:
    img = Image.new("RGB", (900, 360), "white")
    d = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=34)
    lines = ["Dr. Test Clinic (FAKE)", "Tab Amoxil 500 mg 1+0+1 x 5 din", "Tab Panadol 500 mg prn"]
    for i, line in enumerate(lines):
        d.text((30, 30 + i * 90), line, fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


async def check(label: str, cfg, cap: str, image: bytes) -> None:
    provider = _build(cfg)
    started = time.monotonic()
    try:
        if cap == "vision":
            out = await provider.chat_json(
                system=EXTRACT_SYSTEM,
                user_text="Transcribe every medicine line on this prescription, verbatim.",
                schema=ExtractionResult,
                images=[image],
                max_tokens=3000,
            )
            detail = f"{len(out.medicines)} medicine line(s) read"
        else:
            out = await provider.chat_json(
                system=CHECKIN_SYSTEM,
                user_text=wrap_user_message("Aaj theek hoon, thori thakan hai"),
                schema=CheckinLLM,
                max_tokens=400,
            )
            detail = f"mood={out.mood}"
        status = f"OK    {detail}"
    except LLMError as e:
        status = f"FAIL  {e}"
    print(f"{cap:6} {label:12} {cfg.provider:11} {cfg.model:40} {time.monotonic() - started:5.1f}s  {status}")


async def main() -> None:
    s = get_settings()
    image = fake_prescription()
    for cap in ("vision", "text"):
        cfgs = [("primary", _config(s, cap, max_retries=0))]
        for i, slot in enumerate(s.fallbacks(cap)):
            cfgs.append((f"fallback-{i + 1}", _fallback_config(s, cap, slot, 0)))
        for label, cfg in cfgs:
            if cfg.provider == "fake":
                print(f"{cap:6} {label:12} fake (skipped)")
                continue
            await check(label, cfg, cap, image)


if __name__ == "__main__":
    asyncio.run(main())
