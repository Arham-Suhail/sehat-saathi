"""Deterministic red-flag keyword detection (Roman Urdu + English).

concern_flag = llm_flag OR detect_concern(text). The LLM alone is never trusted
to surface symptoms — a failed or wrong LLM call must not hide a red flag.
"""

import re

# Stems are matched at word starts, so "dard" also matches "dardnaak", "chakkar" matches "chakkaron".
_KEYWORDS: dict[str, tuple[str, ...]] = {
    "dard / pain": ("dard", "pain", "takleef"),  # not "ache": Roman Urdu for "good"
    "seena / chest": ("seene", "seena", "seeney", "sine mein", "chest"),
    "saans / breathing": ("saans", "sans ", "saas ", "dam ghut", "breath", "breathing"),
    "chakkar / dizziness": ("chakkar", "chakar", "dizzy", "dizziness", "sar ghoom"),
    "behoshi / fainting": ("behosh", "behoshi", "faint", "unconscious"),
    "bukhar / fever": ("bukhar", "bukhaar", "fever"),
    "ulti / vomiting": ("ulti", "ultiyan", "vomit"),
    "khoon / bleeding": ("khoon", "bleed", "blood"),
    "girna / fall": ("gir gay", "gir gai", "gir para", "gir pari", "fell", "fall "),
    "kamzori / weakness": ("kamzori", "sun ho", "numb", "weakness"),
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
