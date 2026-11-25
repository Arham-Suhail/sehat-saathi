"""Pure scheduling logic (no I/O).

suggest_times(): turns as-written frequency/timing text into *suggested* HH:MM times.
These are scheduling defaults the user reviews and edits on the confirm screen — not
medical advice. Unknown patterns return [] so the user must set times themselves.

generate_reminder_times(): confirmed HH:MM times -> UTC datetimes for a rolling window.
"""

import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

PK_TZ = ZoneInfo("Asia/Karachi")
HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

# Default clock times for common slots (Pakistan daily routine).
SLOT = {"morning": "08:00", "afternoon": "14:00", "evening": "18:00", "night": "21:00"}

_WORD_SLOTS = [
    (re.compile(r"\b(subah|subha|morning|nashta|breakfast)\b"), "morning"),
    (re.compile(r"\b(dopahar|dopehar|afternoon|lunch)\b"), "afternoon"),
    (re.compile(r"\b(shaam|sham|evening)\b"), "evening"),
    (re.compile(r"\b(raat|rat|night|bedtime|sone)\b"), "night"),
]
_ABBREV = {
    "od": ["morning"],
    "qd": ["morning"],
    "once daily": ["morning"],
    "hs": ["night"],
    "bd": ["morning", "night"],
    "bid": ["morning", "night"],
    "twice daily": ["morning", "night"],
    "tds": ["morning", "afternoon", "night"],
    "tid": ["morning", "afternoon", "night"],
    "thrice daily": ["morning", "afternoon", "night"],
    "qid": ["08:00", "12:00", "16:00", "20:00"],
}
_PLUS = re.compile(r"\b([0-9½]+)\s*[+\-x]\s*([0-9½]+)\s*[+\-x]\s*([0-9½]+)(?:\s*[+\-x]\s*([0-9½]+))?\b")
_CLOCK = re.compile(r"\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm|baje)\b")


def _slot_to_time(slot: str) -> str:
    return SLOT.get(slot, slot)


def _dedupe_sorted(times: list[str]) -> list[str]:
    return sorted(set(times))


def suggest_times(frequency: str | None, timing_text: str | None) -> list[str]:
    text = " ".join(filter(None, [frequency, timing_text])).lower().strip()
    if not text:
        return []

    m = _PLUS.search(text)
    if m:
        parts = [p for p in m.groups() if p is not None]
        slots = (
            ["morning", "afternoon", "night"]
            if len(parts) == 3
            else ["morning", "afternoon", "evening", "night"]
        )
        chosen = [s for s, p in zip(slots, parts, strict=True) if p not in ("0",)]
        return _dedupe_sorted([_slot_to_time(s) for s in chosen])

    clocks = []
    for hour, minute, suffix in _CLOCK.findall(text):
        h = int(hour) % 12
        if suffix == "pm":
            h += 12
        elif suffix == "baje" and h < 7:  # "8 baje" ambiguous: assume daytime unless small hour -> evening
            h += 12
        clocks.append(f"{h:02d}:{int(minute or 0):02d}")
    if clocks:
        return _dedupe_sorted(clocks)

    for key in sorted(_ABBREV, key=len, reverse=True):
        if re.search(rf"\b{re.escape(key)}\b", text):
            return _dedupe_sorted([_slot_to_time(s) for s in _ABBREV[key]])

    words = [slot for pat, slot in _WORD_SLOTS if pat.search(text)]
    if words:
        return _dedupe_sorted([_slot_to_time(s) for s in words])
    return []


def is_valid_hhmm(value: str) -> bool:
    return bool(HHMM.match(value))


WINDOW_DAYS = 7


def generate_reminder_times(
    timings: list[str],
    *,
    start: datetime,
    end: datetime,
    tz: ZoneInfo = PK_TZ,
) -> list[datetime]:
    """UTC datetimes for each local HH:MM strictly after `start` and strictly before `end`."""
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("start/end must be timezone-aware")
    valid = sorted({t for t in timings if is_valid_hhmm(t)})
    if not valid or end <= start:
        return []
    first: date = start.astimezone(tz).date()
    last: date = end.astimezone(tz).date()
    out: list[datetime] = []
    day = first
    while day <= last:
        for t in valid:
            hh, mm = map(int, t.split(":"))
            dt = datetime.combine(day, time(hh, mm), tzinfo=tz).astimezone(UTC)
            if start < dt < end:
                out.append(dt)
        day += timedelta(days=1)
    return out


def course_end(start: datetime, duration_days: int | None) -> datetime | None:
    """End of a course (exclusive) in local days, or None for ongoing medicines."""
    if not duration_days or duration_days <= 0:
        return None
    local_start = start.astimezone(PK_TZ).date()
    end_local = datetime.combine(local_start + timedelta(days=duration_days), time(0, 0), tzinfo=PK_TZ)
    return end_local.astimezone(UTC)


def window_end(now: datetime, end_at: datetime | None) -> datetime:
    horizon = now + timedelta(days=WINDOW_DAYS)
    return min(horizon, end_at) if end_at else horizon


def parse_duration_days(duration: str | None) -> int | None:
    """'5 din' / '7 days' / '2 weeks' / '1 hafta' -> days. Unknown -> None (use the default window)."""
    if not duration:
        return None
    text = duration.lower()
    m = re.search(r"(\d{1,3})\s*(din|day|days|d)\b", text)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d{1,2})\s*(hafta|haftay|hafte|week|weeks|w)\b", text)
    if m:
        return int(m.group(1)) * 7
    m = re.search(r"(\d{1,2})\s*(mahina|mahine|month|months)\b", text)
    if m:
        return int(m.group(1)) * 30
    return None
