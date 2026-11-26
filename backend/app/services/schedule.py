"""Pure scheduling logic (no I/O).

Frequency abbreviations -> suggested times live in services/frequency.py.

generate_reminder_times(): confirmed HH:MM times -> UTC datetimes for a rolling window.
"""

import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

PK_TZ = ZoneInfo("Asia/Karachi")
HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


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
