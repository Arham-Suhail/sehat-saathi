"""Deterministic guard over LLM-suggested alternatives (pure, tested).

The LLM is told "same salt, same strength" but can still mix up brands (e.g. Disprin = aspirin
listed for paracetamol). Code drops any product that:
- is a known brand whose salt differs from the generic name,
- is a combination/variant product (Extra, Plus, CF, Cold...) unless the current medicine is too,
- states a strength that differs from the prescribed strength.
"""

import re

# Well-known brands sold in Pakistan -> their salt(s). Lowercase, first word of the product name.
KNOWN_BRANDS: dict[str, frozenset[str]] = {
    # paracetamol
    "panadol": frozenset({"paracetamol"}),
    "calpol": frozenset({"paracetamol"}),
    "tylenol": frozenset({"paracetamol"}),
    "febrol": frozenset({"paracetamol"}),
    "paracetamol": frozenset({"paracetamol"}),
    # aspirin
    "disprin": frozenset({"aspirin"}),
    "loprin": frozenset({"aspirin"}),
    "ascard": frozenset({"aspirin"}),
    "aspirin": frozenset({"aspirin"}),
    "ecotrin": frozenset({"aspirin"}),
    # ibuprofen
    "brufen": frozenset({"ibuprofen"}),
    "advil": frozenset({"ibuprofen"}),
    "nurofen": frozenset({"ibuprofen"}),
    "ibuprofen": frozenset({"ibuprofen"}),
    # others commonly confused with painkillers
    "ponstan": frozenset({"mefenamic acid"}),
    "voren": frozenset({"diclofenac"}),
    "dicloran": frozenset({"diclofenac"}),
    "voltaren": frozenset({"diclofenac"}),
    "caflam": frozenset({"diclofenac"}),
    "naprosyn": frozenset({"naproxen"}),
    "synflex": frozenset({"naproxen"}),
    "arinac": frozenset({"ibuprofen", "pseudoephedrine"}),
    "risek": frozenset({"omeprazole"}),
    "omeprazole": frozenset({"omeprazole"}),
    "nexum": frozenset({"esomeprazole"}),
    "esso": frozenset({"esomeprazole"}),
    "glucophage": frozenset({"metformin"}),
    "metformin": frozenset({"metformin"}),
    "flagyl": frozenset({"metronidazole"}),
    "augmentin": frozenset({"amoxicillin", "clavulanic acid"}),
    "amoxil": frozenset({"amoxicillin"}),
    "norvasc": frozenset({"amlodipine"}),
    "amlodipine": frozenset({"amlodipine"}),
    "lipitor": frozenset({"atorvastatin"}),
    "atorvastatin": frozenset({"atorvastatin"}),
}

# Words that turn a brand into a different (usually combination) product.
VARIANT_WORDS = frozenset(
    {
        "extra",
        "plus",
        "cf",
        "cold",
        "flu",
        "sinus",
        "night",
        "forte",
        "advance",
        "advanced",
        "duo",
        "max",
        "ds",
        "xr",
        "sr",
        "er",
        "cr",
        "mr",
        "la",
    }
)

_SALT_ALIASES = {
    "acetaminophen": "paracetamol",
    "acetylsalicylic acid": "aspirin",
    "asa": "aspirin",
    "co-amoxiclav": "amoxicillin clavulanic acid",
}

_STRENGTH = re.compile(r"(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|%)", re.IGNORECASE)


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def generic_salts(generic_name: str) -> frozenset[str] | None:
    """Salts named in the LLM's generic_name, or None when unknown."""
    g = generic_name.strip().lower()
    if not g or g == "unknown":
        return None
    for alias, real in _SALT_ALIASES.items():
        g = g.replace(alias, real)
    found = set()
    for salts in KNOWN_BRANDS.values():
        for salt in salts:
            if salt in g:
                found.add(salt)
    return frozenset(found) or None


def strengths(text: str) -> set[tuple[float, str]]:
    out = set()
    for num, unit in _STRENGTH.findall(text):
        unit = unit.lower().replace("µg", "mcg")
        value = float(num)
        if unit == "g":
            value, unit = value * 1000, "mg"
        out.add((value, unit))
    return out


def is_safe_alternative(
    product_name: str, generic_name: str, current_name: str, current_strength: str
) -> bool:
    words = _words(product_name)
    if not words:
        return False
    current_words = set(_words(current_name))

    # 1. Combination/variant products only when the current medicine is that variant too.
    if any(w in VARIANT_WORDS and w not in current_words for w in words[1:]):
        return False

    # 2. A known brand must have exactly the salts of the generic (or of the current brand).
    expected = generic_salts(generic_name)
    if expected is None and current_words:
        expected = KNOWN_BRANDS.get(_words(current_name)[0])
    brand = KNOWN_BRANDS.get(words[0])
    if brand is not None and expected is not None and brand != expected:
        return False

    # 3. A stated strength must match the prescribed strength.
    want = strengths(current_strength) or strengths(current_name)
    have = strengths(product_name)
    if want and have and not (have & want):
        return False
    return True
