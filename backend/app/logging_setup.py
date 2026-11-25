"""Structured JSON logging with a redaction filter.

Rule: logs never contain passwords, tokens, prescription text or check-in transcripts.
We only log request metadata (method, path, status, duration, request id) and
explicit, safe event messages.
"""

import json
import logging
import re
import sys
import time

_REDACT_PATTERNS = [
    re.compile(r"(?i)bearer\s+[A-Za-z0-9\-_.=]+"),
    re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),  # JWT-like
    re.compile(r"(?i)(password|passwd|api[_-]?key|secret|token)(\"?\s*[:=]\s*\"?)[^\s\",}]+"),
    re.compile(r"mongodb(\+srv)?://[^\s]+"),
]


def redact(text: str) -> str:
    for pat in _REDACT_PATTERNS:
        if pat.groups >= 2:
            text = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", text)
        else:
            text = pat.sub("[REDACTED]", text)
    return text


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(str(record.getMessage()))
        record.args = ()
        return True


class JsonFormatter(logging.Formatter):
    SAFE_EXTRAS = ("request_id", "method", "path", "status", "duration_ms", "event")

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in self.SAFE_EXTRAS:
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info and record.exc_info[0] is not None:
            # Exception type only; no message/stack (could contain user data).
            payload["exc_type"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # uvicorn's own access log duplicates ours; silence it.
    logging.getLogger("uvicorn.access").disabled = True
    for name in ("httpx", "openai", "pymongo"):
        logging.getLogger(name).setLevel(logging.WARNING)
