"""Devanagari (Hindi script) -> Roman Urdu, deterministic. Pure; no I/O; no LLM.

Speech-to-text for spoken Urdu works best with Hindi models (Vapi/Deepgram `hi`, Web Speech
`hi-IN`), which write Devanagari. The app shows Roman Urdu only, so every elder line is passed
through `to_roman()`. Latin text (and Urdu/Arabic script, which has no written short vowels and
can't be romanised by rules) passes through unchanged. Must match frontend/src/i18n/translit.js;
both are tested against shared/translit-vectors.json.
"""

import re

_CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "w",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    # precomposed nukta letters
    "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
}  # fmt: skip
_NUKTA = {"क": "q", "ख": "kh", "ग": "gh", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f", "य": "y"}
_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o",
}  # fmt: skip
_MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o",
}  # fmt: skip
_HALANT, _NUKTA_SIGN = "्", "़"
_NASAL = {"ं", "ँ"}
_VISARGA = "ः"
_OTHER = {"।": ".", "॥": ".", **{chr(0x0966 + d): str(d) for d in range(10)}}
# Common words whose everyday Roman Urdu spelling differs from the letter-by-letter result.
_WORDS = {
    "में": "mein", "मैं": "main", "हैं": "hain", "है": "hai", "नहीं": "nahi", "हूँ": "hoon", "हूं": "hoon",
    "यह": "yeh", "वह": "woh", "ये": "ye", "वो": "wo", "और": "aur", "क्या": "kya",
}  # fmt: skip

_WORD_RE = re.compile(r"[ऀ-ॣ॰-ॿ]+")


def _word(w: str) -> str:
    if w in _WORDS:
        return _WORDS[w]
    units: list[dict] = []  # {c: consonant roman, v: vowel roman, inherent: bool, tail: str}
    i = 0
    while i < len(w):
        ch = w[i]
        if ch in _CONS:
            c = _CONS[ch]
            if i + 1 < len(w) and w[i + 1] == _NUKTA_SIGN:
                c = _NUKTA.get(ch, c)
                i += 1
            units.append({"c": c, "v": "a", "inherent": True, "tail": ""})
        elif ch in _VOWELS:
            units.append({"c": "", "v": _VOWELS[ch], "inherent": False, "tail": ""})
        elif units and ch in _MATRAS:
            units[-1].update(v=_MATRAS[ch], inherent=False)
        elif units and ch == _HALANT:
            units[-1].update(v="", inherent=False)
        elif units and ch in _NASAL:
            units[-1]["tail"] += "n"
        elif units and ch == _VISARGA:
            units[-1]["tail"] += "h"
        i += 1

    # Schwa deletion: drop the word-final inherent "a", then a medial one between two
    # vowelled syllables (kamazori -> kamzori, takaleef -> takleef).
    if len(units) > 1 and units[-1]["inherent"] and units[-1]["c"]:
        units[-1]["v"] = ""
    for k in range(len(units) - 2, 0, -1):
        u, prev, nxt = units[k], units[k - 1], units[k + 1]
        if u["inherent"] and u["c"] and not u["tail"] and prev["v"] and nxt["c"] and nxt["v"]:
            u["v"] = ""

    out = []
    for k, u in enumerate(units):
        v = u["v"]
        nxt = units[k + 1] if k + 1 < len(units) else None
        if v == "a" and nxt and nxt["c"] == "h" and not nxt["v"]:
            v = "e"  # mahsoos -> mehsoos, pahla -> pehla
        out.append(u["c"] + v + u["tail"])
    s = "".join(out).replace("chchh", "chh")
    if len(s) > 2 and s.endswith("ee"):
        s = s[:-2] + "i"  # ulti, rahi, meri
    elif len(s) > 2 and s.endswith("aa"):
        s = s[:-1]  # gaya, tha, aaya
    return s


def to_roman(text: str | None) -> str:
    """Romanise every Devanagari word; leave everything else exactly as it is."""
    if not text:
        return text or ""
    text = "".join(_OTHER.get(ch, ch) for ch in text)
    return _WORD_RE.sub(lambda m: _word(m.group(0)), text)
