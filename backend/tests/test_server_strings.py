"""Every Roman Urdu string the API can show a user must be in shared/server-strings.json, so the
Urdu/English UI can translate it (frontend/src/i18n/server.js). Adding a new error message or label
without a translation fails this test."""

import ast
import json
import re
from pathlib import Path

from app.schemas import DISCLAIMER, PHARMACIST_NOTE
from app.services.extraction import REASONS
from app.services.frequency import (
    MEAL_LABEL,
    PRN_LABEL,
    ROUTE_LABEL,
    UNKNOWN_LABEL,
    normalize_frequency,
    schedule_options,
)

ROOT = Path(__file__).resolve().parents[2]
CATALOG = json.loads((ROOT / "shared" / "server-strings.json").read_text(encoding="utf-8"))
APP = ROOT / "backend" / "app"


def covered(text: str) -> bool:
    if text in CATALOG["exact"]:
        return True
    if any(re.match(p["re"], text) for p in CATALOG["patterns"]):
        return True
    t = text.strip().lower()
    if re.fullmatch(r"sirf (subah|dopahar|shaam|raat)", t):
        return True
    return bool(
        re.fullmatch(
            r"(subah|dopahar|shaam|raat)(, (subah|dopahar|shaam|raat))*( aur (subah|dopahar|shaam|raat))?", t
        )
    )


def _detail_strings() -> set[str]:
    """String literals passed as `detail=` / "detail": / _reject(..., msg) anywhere in app/."""
    found: set[str] = set()
    for path in APP.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                for kw in node.keywords:
                    if (
                        kw.arg == "detail"
                        and isinstance(kw.value, ast.Constant)
                        and isinstance(kw.value.value, str)
                    ):
                        found.add(kw.value.value)
                fn = node.func
                if isinstance(fn, ast.Name) and fn.id == "_reject" and len(node.args) >= 2:
                    if isinstance(node.args[1], ast.Constant):
                        found.add(node.args[1].value)
            if isinstance(node, ast.Dict):
                for k, v in zip(node.keys, node.values, strict=False):
                    if isinstance(k, ast.Constant) and k.value == "detail" and isinstance(v, ast.Constant):
                        found.add(v.value)
    # Module-level constants used as details (e.g. GENERIC_LOGIN_ERROR).
    for path in APP.rglob("*.py"):
        for m in re.finditer(r'^[A-Z_]+_ERROR = "([^"]+)"', path.read_text(encoding="utf-8"), re.M):
            found.add(m.group(1))
    return found


def test_all_error_details_are_translatable():
    missing = sorted(s for s in _detail_strings() if not covered(s))
    assert not missing, f"add to shared/server-strings.json: {missing}"


def test_all_labels_and_reasons_are_translatable():
    texts = [
        *ROUTE_LABEL.values(),
        *(v for v in MEAL_LABEL.values() if v),
        *REASONS.values(),
        UNKNOWN_LABEL,
        PRN_LABEL,
        DISCLAIMER,
        PHARMACIST_NOTE,
        *(o["label"] for o in schedule_options()),
    ]
    for raw in [
        "1+0+1",
        "1+1+1",
        "0+0+1",
        "1-1-1-1",
        "0+1+0",
        "q4h",
        "q6h",
        "q8h",
        "hs",
        "subah aur raat",
        "",
    ]:
        r = normalize_frequency(raw)
        texts.append(r.label)
        if r.note:
            texts.append(r.note)
    missing = sorted({t for t in texts if not covered(t)})
    assert not missing, f"add to shared/server-strings.json: {missing}"


def test_frontend_copy_matches():
    local = json.loads(
        (ROOT / "frontend" / "src" / "i18n" / "server-strings.json").read_text(encoding="utf-8")
    )
    assert local == CATALOG
