"""Deterministic red-flag keyword detection (Roman Urdu + English, plus Hindi/Devanagari and Urdu
script, because speech-to-text for spoken Urdu often returns those scripts).

concern_flag = llm_flag OR detect_concern(text). The LLM alone is never trusted
to surface symptoms — a failed or wrong LLM call must not hide a red flag.
"""

import re

# Stems are matched at word starts, so "dard" also matches "dardnaak", "chakkar" matches "chakkaron".
_KEYWORDS: dict[str, tuple[str, ...]] = {
    "dard / pain": (
        "dard",
        "pain",
        "takleef",
        "दर्द",
        "तकलीफ",
        "तकलीफ़",
        "درد",
        "تکلیف",
    ),  # not "ache" (= good)
    "seena / chest": (
        "seene",
        "seena",
        "seeney",
        "sine mein",
        "chest",
        "सीने",
        "सीना",
        "छाती",
        "سینے",
        "سینہ",
        "چھاتی",
    ),
    "saans / breathing": ("saans", "sans ", "saas ", "dam ghut", "breath", "breathing", "सांस", "साँस", "سانس"),
    "chakkar / dizziness": ("chakkar", "chakar", "dizzy", "dizziness", "sar ghoom", "चक्कर", "چکر"),
    "behoshi / fainting": ("behosh", "behoshi", "faint", "unconscious", "बेहोश", "بے ہوش", "بیہوش"),
    "bukhar / fever": ("bukhar", "bukhaar", "fever", "बुखार", "बुख़ार", "بخار"),
    "ulti / vomiting": ("ulti", "ultiyan", "vomit", "उल्टी", "الٹی"),
    "khoon / bleeding": ("khoon", "bleed", "blood", "खून", "ख़ून", "خون"),
    "girna / fall": (
        "gir gay",
        "gir gai",
        "gir para",
        "gir pari",
        "fell",
        "fall ",
        "गिर ग",
        "गिर पड़",
        "گر گ",
        "گر پڑ",
    ),
    "kamzori / weakness": ("kamzori", "sun ho", "numb", "weakness", "कमजोरी", "कमज़ोरी", "सुन्न", "کمزوری"),
}

_PATTERNS = [
    (label, re.compile(r"(?<![a-z])" + re.escape(stem.strip()) + (r"\b" if stem.endswith(" ") else "")))
    for label, stems in _KEYWORDS.items()
    for stem in stems
]


def detect_concern(text: str | None) -> list[str]:
    """Return matched concern labels (deduplicated, stable order). Empty list = no keyword hit."""
    if not text:
        return []
    normalized = " ".join(text.lower().split())
    found: list[str] = []
    for label, pattern in _PATTERNS:
        if label not in found and pattern.search(normalized):
            found.append(label)
    return found
