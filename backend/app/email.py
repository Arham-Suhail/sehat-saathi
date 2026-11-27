"""Transactional email (verification and password-reset codes) via Brevo's HTTP API.

Optional at runtime, like Web Push: without BREVO_API_KEY + EMAIL_FROM the email features are off
(endpoints answer 404 and the UI hides them). The API key lives only in the backend env. Neither the
code nor the recipient address is ever logged.
"""

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SEND_TIMEOUT = 10.0

SUBJECTS = {
    "signup": "Sehat Saathi: your sign-up code / اکاؤنٹ بنانے کا کوڈ",
    "verify": "Sehat Saathi: your verification code / تصدیق کا کوڈ",
    "reset": "Sehat Saathi: password reset code / پاس ورڈ بدلنے کا کوڈ",
}
LINES = {
    "signup": (
        "Your code to finish creating your account is:",
        "اپنا اکاؤنٹ بنانا مکمل کرنے کے لیے آپ کا کوڈ:",
    ),
    "verify": (
        "Your code to verify your email is:",
        "اپنا ای میل تصدیق کرنے کے لیے آپ کا کوڈ:",
    ),
    "reset": (
        "Your code to set a new password is:",
        "نیا پاس ورڈ رکھنے کے لیے آپ کا کوڈ:",
    ),
}


def render(purpose: str, code: str, minutes: int) -> tuple[str, str, str]:
    """(subject, text, html). Only fixed text + the 6 digits: nothing user-controlled is embedded."""
    en, ur = LINES[purpose]
    text = (
        f"{en} {code}\nIt expires in {minutes} minutes. If you did not ask for it, ignore this email.\n\n"
        f"{ur} {code}\nیہ {minutes} منٹ میں ختم ہو جائے گا۔ اگر آپ نے نہیں مانگا تو یہ ای میل نظر انداز کریں۔"
    )
    html = (
        '<div style="font-family:Arial,sans-serif;font-size:18px;line-height:1.5">'
        f"<p>{en}</p>"
        f'<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{code}</p>'
        f"<p>It expires in {minutes} minutes. If you did not ask for it, ignore this email.</p>"
        f'<hr><div dir="rtl" lang="ur"><p>{ur}</p>'
        f'<p style="font-size:32px;font-weight:bold;letter-spacing:6px" dir="ltr">{code}</p>'
        f"<p>یہ {minutes} منٹ میں ختم ہو جائے گا۔ اگر آپ نے نہیں مانگا تو یہ ای میل نظر انداز کریں۔</p></div>"
        "</div>"
    )
    return SUBJECTS[purpose], text, html


class BrevoSender:
    """POSTs one email to Brevo. Returns True when Brevo accepted it."""

    def __init__(self, settings: Any):
        self.api_key = settings.brevo_api_key
        self.sender = {"email": settings.email_from, "name": settings.email_from_name}

    async def __call__(self, to: str, purpose: str, code: str, minutes: int) -> bool:
        subject, text, html = render(purpose, code, minutes)
        payload = {
            "sender": self.sender,
            "to": [{"email": to}],
            "subject": subject,
            "textContent": text,
            "htmlContent": html,
        }
        try:
            async with httpx.AsyncClient(timeout=SEND_TIMEOUT) as client:
                r = await client.post(BREVO_URL, json=payload, headers={"api-key": self.api_key})
        except httpx.HTTPError as e:
            log.warning("email send failed: %s", type(e).__name__)
            return False
        if r.status_code >= 300:
            log.warning("email send rejected: status %s", r.status_code)
            return False
        return True


class FakeEmailSender:
    """For tests (and local demos): keeps sent emails in memory instead of sending them."""

    def __init__(self, ok: bool = True):
        self.sent: list[dict] = []
        self.ok = ok

    async def __call__(self, to: str, purpose: str, code: str, minutes: int) -> bool:
        self.sent.append({"to": to, "purpose": purpose, "code": code, "minutes": minutes})
        return self.ok
