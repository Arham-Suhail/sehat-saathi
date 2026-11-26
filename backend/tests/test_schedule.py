from datetime import UTC, datetime, timedelta

import pytest

from app.services.schedule import (
    PK_TZ,
    course_end,
    generate_reminder_times,
    parse_duration_days,
    window_end,
)


def test_generate_skips_past_times_today():
    # 10:00 local on a fixed day
    now = datetime(2026, 11, 26, 10, 0, tzinfo=PK_TZ).astimezone(UTC)
    times = generate_reminder_times(["08:00", "21:00"], start=now, end=now + timedelta(days=2))
    local = [t.astimezone(PK_TZ).strftime("%d %H:%M") for t in times]
    assert local == ["26 21:00", "27 08:00", "27 21:00", "28 08:00"]
    assert all(t.tzinfo is not None for t in times)


def test_generate_ignores_invalid_times_and_empty():
    now = datetime(2026, 11, 26, 5, 0, tzinfo=UTC)
    assert generate_reminder_times(["25:00", "abc"], start=now, end=now + timedelta(days=1)) == []
    assert generate_reminder_times(["08:00"], start=now, end=now) == []


def test_generate_requires_aware_datetimes():
    with pytest.raises(ValueError):
        generate_reminder_times(["08:00"], start=datetime(2026, 1, 1), end=datetime(2026, 1, 2))


def test_course_end_and_window():
    start = datetime(2026, 11, 26, 10, 0, tzinfo=PK_TZ).astimezone(UTC)
    end = course_end(start, 5)
    assert end.astimezone(PK_TZ).strftime("%Y-%m-%d %H:%M") == "2026-12-01 00:00"
    assert course_end(start, None) is None
    assert window_end(start, end) == end
    assert window_end(start, None) == start + timedelta(days=7)


def test_course_limits_reminders():
    now = datetime(2026, 11, 26, 7, 0, tzinfo=PK_TZ).astimezone(UTC)
    end = window_end(now, course_end(now, 2))
    times = generate_reminder_times(["08:00"], start=now, end=end)
    assert len(times) == 2


@pytest.mark.parametrize(
    ("text", "days"),
    [
        ("5 din", 5),
        ("7 days", 7),
        ("2 weeks", 14),
        ("1 hafta", 7),
        ("1 mahina", 30),
        ("jab tak", None),
        (None, None),
    ],
)
def test_parse_duration(text, days):
    assert parse_duration_days(text) == days
