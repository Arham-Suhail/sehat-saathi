"""Deterministic normaliser for prescription shorthand (pure functions, no LLM, no I/O).

It only TRANSLATES standard abbreviations (bid, q6h, PO, IV, prn, 1+0+1 ...) into a structured
result plus a Roman Urdu label. It never invents a dose, duration or condition. Anything it does
not recognise comes back as kind="unknown" so the user (and a pharmacist) decide.

Suggested times are scheduling defaults that the user always reviews and edits before saving.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

FreqKind = Literal["per_day", "every_n_hours", "bedtime", "pattern", "prn", "unknown", "none"]
RouteKind = Literal[
    "oral", "intravenous", "intramuscular", "subcutaneous", "sublingual", "topical", "inhaled", "unknown"
]
MealTiming = Literal["before", "after", "with", "none", "unknown"]
ReminderMode = Literal["fixed", "manual", "prn", "hospital", "stopped"]

PER_DAY_TIMES = {
    1: ["08:00"],
    2: ["08:00", "20:00"],
    3: ["08:00", "14:00", "20:00"],
    4: ["08:00", "12:00", "16:00", "20:00"],
}
BEDTIME = "22:00"
DAY_START_HOUR = 8
MAX_TIMES = 6

PARENTERAL = {"intravenous", "intramuscular", "subcutaneous"}


@dataclass(frozen=True)
class FrequencyResult:
    kind: FreqKind
    count_or_interval: int | None = None  # doses/day for per_day, hours for every_n_hours
    times_suggested: list[str] = field(default_factory=list)
    confidence: float = 0.0
    label: str = ""
    slots: tuple[int, ...] | None = None  # for "1+0+1" patterns: per-slot counts
    note: str = ""  # extra scheduling hint shown under the label


@dataclass(frozen=True)
class RouteResult:
    kind: RouteKind
    label: str
    written: bool  # was any route text present at all?


# ---------------- helpers ----------------
def _clean(raw: str | None) -> str:
    """Lowercase, drop dots, collapse whitespace: 'B.I.D.' -> 'bid', 'Q 6  Hours' -> 'q 6 hours'."""
    if not raw:
        return ""
    s = raw.lower().replace(".", "")
    return " ".join(s.split())


def _compact(s: str) -> str:
    return s.replace(" ", "")


def _hhmm(hour: int) -> str:
    return f"{hour % 24:02d}:00"


def _per_day(n: int) -> FrequencyResult:
    return FrequencyResult("per_day", n, list(PER_DAY_TIMES[n]), 1.0, f"Din mein {n} baar")


def _every(hours: int) -> FrequencyResult:
    """Start 08:00 and step N hours within the same day (08:00-23:59). If the order implies more
    doses per 24 h than that (q6h = 4, q8h = 3), say so: the user adds any night dose themselves."""
    if hours == 24:
        return _per_day(1)
    times = [_hhmm(h) for h in range(DAY_START_HOUR, 24, hours)]
    note = ""
    per_24h = -(-24 // hours)
    if per_24h > len(times):
        note = (
            f"Har {hours} ghante = 24 ghante mein {per_24h} baar. "
            "Raat ka waqt zaroorat ho to khud add karein."
        )
    if len(times) > MAX_TIMES:  # q1h-q2h: recognised, but the user must set times
        times = []
    return FrequencyResult("every_n_hours", hours, times, 1.0, f"Har {hours} ghante baad", note=note)


_PER_DAY_WORDS = {
    1: {"od", "qd", "daily", "oncedaily", "onceaday", "1xday", "1x", "qam", "qpm"},
    2: {"bd", "bid", "twicedaily", "twiceaday", "2xday", "2x", "q12"},
    3: {"tds", "tid", "thricedaily", "threetimesaday", "3xday", "3x"},
    4: {"qid", "qds", "fourtimesaday", "4xday", "4x"},
}
_BEDTIME = {"hs", "qhs", "atbedtime", "bedtime", "atnight", "sonesepehle", "raatsonesepehle"}
_PRN = re.compile(r"\b(prn|sos|as needed|as required|when needed|if needed|zaroorat|zarurat)\b")
_EVERY = [
    re.compile(r"^q\s*(\d{1,2})\s*(?:h|hr|hrs|hour|hours|hourly)$"),
    re.compile(r"^(?:every|evry)\s*(\d{1,2})\s*(?:h|hr|hrs|hour|hours)$"),
    re.compile(r"^har\s*(\d{1,2})\s*(?:ghante|ghantay|ghanta)(?:\s*baad|\s*bad)?$"),
]
_URDU_PER_DAY = re.compile(
    r"^(?:din\s*(?:mein|me|main)\s*)?(\d)\s*(?:baar|bar|dafa)(?:\s*din\s*(?:mein|me))?$"
)
_PATTERN = re.compile(r"^([0-9½]+)\s*[+\-]\s*([0-9½]+)\s*[+\-]\s*([0-9½]+)(?:\s*[+\-]\s*([0-9½]+))?$")
_SLOT_NAMES_3 = ["Subah", "Dopahar", "Raat"]
_SLOT_TIMES_3 = ["08:00", "14:00", "20:00"]
_SLOT_NAMES_4 = ["Subah", "Dopahar", "Shaam", "Raat"]
_SLOT_TIMES_4 = ["08:00", "12:00", "16:00", "20:00"]


def _join_urdu(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    rest = [p.lower() for p in parts[1:]]
    return ", ".join([parts[0], *rest[:-1]]) + " aur " + rest[-1]


def _pattern(m: re.Match) -> FrequencyResult:
    raw = [p for p in m.groups() if p is not None]
    counts = tuple(0 if p == "0" else 1 for p in raw)
    if not any(counts):
        return FrequencyResult("unknown", label=UNKNOWN_LABEL)
    names, times = (_SLOT_NAMES_3, _SLOT_TIMES_3) if len(raw) == 3 else (_SLOT_NAMES_4, _SLOT_TIMES_4)
    chosen = [i for i, c in enumerate(counts) if c]
    label = _join_urdu([names[i] for i in chosen])
    if len(chosen) == 1:
        label = f"Sirf {names[chosen[0]].lower()}"
    return FrequencyResult("pattern", len(chosen), [times[i] for i in chosen], 1.0, label, slots=counts)


_WORDS = [
    (re.compile(r"\b(subah|subha|morning|nashta|nashte)\b"), "Subah", "08:00"),
    (re.compile(r"\b(dopahar|dopehar|afternoon|lunch|noon)\b"), "Dopahar", "14:00"),
    (re.compile(r"\b(shaam|sham|evening)\b"), "Shaam", "18:00"),
    (re.compile(r"\b(raat|rat|night)\b"), "Raat", "20:00"),
]
_WORDS_ONLY = re.compile(
    r"^(?:(?:subah|subha|morning|nashta|nashte|dopahar|dopehar|afternoon|lunch|noon|shaam|sham"
    r"|evening|raat|rat|night|aur|and|ko|ke|waqt|time|[,+&/-])\s*)+$"
)


def _word_slots(s: str) -> FrequencyResult | None:
    """'subah raat' / 'morning and night' -> pattern. Only when the text is nothing but slot words."""
    if not _WORDS_ONLY.match(s):
        return None
    hits = [(name, t) for pat, name, t in _WORDS if pat.search(s)]
    if not hits:
        return None
    label = _join_urdu([n for n, _ in hits]) if len(hits) > 1 else f"Sirf {hits[0][0].lower()}"
    return FrequencyResult("pattern", len(hits), [t for _, t in hits], 1.0, label)


UNKNOWN_LABEL = "Samajh nahi aaya — waqt khud set karein"
PRN_LABEL = "Zaroorat par (jab ho)"


# ---------------- public API ----------------
def is_prn_text(raw: str | None) -> bool:
    return bool(_PRN.search(_clean(raw)))


def normalize_frequency(raw: str | None) -> FrequencyResult:
    s = _clean(raw)
    if not s:
        return FrequencyResult("none", label="Likha nahi")
    c = _compact(s)

    if _PRN.fullmatch(s) or c in {"prn", "sos"}:
        return FrequencyResult("prn", None, [], 1.0, PRN_LABEL)
    if c in _BEDTIME:
        return FrequencyResult("bedtime", 1, [BEDTIME], 1.0, "Raat sone se pehle")
    for n, words in _PER_DAY_WORDS.items():
        if c in words:
            return _per_day(n)
    m = _PATTERN.match(s)
    if m:
        return _pattern(m)
    for pat in _EVERY:
        m = pat.match(s) or pat.match(c)
        if m:
            hours = int(m.group(1))
            return _every(hours) if 1 <= hours <= 24 else FrequencyResult("unknown", label=UNKNOWN_LABEL)
    words = _word_slots(s)
    if words:
        return words
    m = _URDU_PER_DAY.match(s)
    if m and 1 <= int(m.group(1)) <= 4:
        return _per_day(int(m.group(1)))
    return FrequencyResult("unknown", label=UNKNOWN_LABEL)


_ROUTES: dict[str, RouteKind] = {
    "po": "oral",
    "oral": "oral",
    "orally": "oral",
    "bymouth": "oral",
    "permouth": "oral",
    "munhse": "oral",
    "iv": "intravenous",
    "ivpb": "intravenous",
    "ivpush": "intravenous",
    "intravenous": "intravenous",
    "drip": "intravenous",
    "infusion": "intravenous",
    "im": "intramuscular",
    "intramuscular": "intramuscular",
    "sc": "subcutaneous",
    "sq": "subcutaneous",
    "subq": "subcutaneous",
    "subcut": "subcutaneous",
    "subcutaneous": "subcutaneous",
    "sl": "sublingual",
    "sublingual": "sublingual",
    "topical": "topical",
    "externally": "topical",
    "inh": "inhaled",
    "inhaled": "inhaled",
    "inhalation": "inhaled",
    "neb": "inhaled",
    "nebulised": "inhaled",
    "nebulized": "inhaled",
}
ROUTE_LABEL: dict[RouteKind, str] = {
    "oral": "Munh se khani hai",
    "intravenous": "Drip/injection (hospital wali)",
    "intramuscular": "Injection (hospital wali)",
    "subcutaneous": "Jild ke neeche injection (hospital wali)",
    "sublingual": "Zabaan ke neeche rakhni hai",
    "topical": "Jild par lagani hai",
    "inhaled": "Saans ke zariye (inhaler/nebulizer)",
    "unknown": "Likha nahi / samajh nahi aaya",
}
_ROUTE_TOKEN = re.compile(
    r"(?<![a-z0-9])(" + "|".join(sorted(map(re.escape, _ROUTES), key=len, reverse=True)) + r")(?![a-z0-9])"
)
_INFUSION = re.compile(r"\b(ml\s*/\s*(?:hr|hour|h)|infusion|drip)\b")


def normalize_route(raw: str | None) -> RouteResult:
    s = _clean(raw)
    if not s:
        return RouteResult("unknown", ROUTE_LABEL["unknown"], written=False)
    kind = _ROUTES.get(_compact(s))
    if kind is None:
        return RouteResult("unknown", ROUTE_LABEL["unknown"], written=True)
    return RouteResult(kind, ROUTE_LABEL[kind], written=True)


def is_infusion(text: str | None) -> bool:
    """'at 100 ml/hr', 'infusion', 'drip' -> a hospital infusion, never a home reminder."""
    return bool(_INFUSION.search(_clean(text)))


def route_in_text(text: str | None) -> RouteKind | None:
    """Fallback when route_raw is missing: find a standalone route abbreviation in the line."""
    s = _clean(text)
    if _INFUSION.search(s):
        return "intravenous"
    m = _ROUTE_TOKEN.search(s)
    return _ROUTES[m.group(1)] if m else None


_DISCONTINUE = re.compile(r"(?:^\s*dc\b|\bd\s*/\s*c\b|\bdiscontinu\w*|\bstop\w*)", re.IGNORECASE)


def mentions_discontinue(*texts: str | None) -> bool:
    """'D/c', 'd/c', 'dc' (as the order word at the start), 'discontinue', 'stop'."""
    return any(t and _DISCONTINUE.search(t) for t in texts)


_MEAL = [
    (
        re.compile(r"\b(before (?:food|meals?|breakfast)|empty stomach|khane se pehle|nashte se pehle|ac)\b"),
        "before",
    ),
    (re.compile(r"\b(after (?:food|meals?)|khane ke baad|khane ke bad|pc)\b"), "after"),
    (re.compile(r"\b(with (?:food|meals?)|khane ke saath|khane ke sath)\b"), "with"),
]


def meal_from_text(text: str | None) -> MealTiming:
    s = _clean(text)
    for pat, kind in _MEAL:
        if pat.search(s):
            return kind  # type: ignore[return-value]
    return "unknown"


MEAL_LABEL: dict[str, str] = {
    "before": "Khane se pehle",
    "after": "Khane ke baad",
    "with": "Khane ke saath",
    "none": "",
    "unknown": "",
}


def reminder_mode(*, stopped: bool, route: RouteKind, prn: bool, freq: FrequencyResult) -> ReminderMode:
    """Code decides whether a medicine gets home reminders — never the LLM."""
    if stopped:
        return "stopped"
    if route in PARENTERAL:
        return "hospital"
    if prn or freq.kind == "prn":
        return "prn"
    if freq.kind in ("unknown", "none") or not freq.times_suggested:
        return "manual"
    return "fixed"


# Options the confirm screen offers to change "Kitni baar". Server is the source of truth.
FREQUENCY_CHOICES: dict[str, str] = {
    "d1": "od",
    "d2": "bid",
    "d3": "tds",
    "d4": "qid",
    "h6": "q6h",
    "h8": "q8h",
    "h12": "q12h",
    "hs": "hs",
    "prn": "prn",
    "custom": "",
}


def choice_result(choice: str) -> FrequencyResult:
    if choice == "custom":
        return FrequencyResult("unknown", label="Waqt khud set karein")
    return normalize_frequency(FREQUENCY_CHOICES[choice])


def schedule_options() -> list[dict]:
    out = []
    for key in FREQUENCY_CHOICES:
        r = choice_result(key)
        out.append({"value": key, "label": r.label, "kind": r.kind, "times": r.times_suggested})
    return out
