"""Prescription extraction: image -> vision LLM (verbatim transcription) -> code-built drafts.

The model only copies text. Everything about schedules and safety is decided here, in code:
- services/frequency.py translates abbreviations (bid, q6h, PO, IV, prn, 1+0+1 ...)
- reminder_mode(): IV/IM/SC and infusions -> "hospital" (no home reminders), prn -> "prn",
  D/c / discontinue / stop -> "stopped", unrecognised frequency -> "manual"
- pharmacist_reasons(): low confidence, missing name/strength/frequency, "..." or text that does
  not match the page verbatim, D/c mentioned, unrecognised route or frequency abbreviation,
  illegible fields. These are never auto-resolved.
"""

from dataclasses import dataclass

from app.llm import LLMProvider
from app.llm.prompts import EXTRACT_SYSTEM
from app.llm.schemas import ExtractedMedicine, ExtractionResult
from app.schemas import DraftMedicine, ExtractOut, FrequencyOut, RouteOut
from app.services.frequency import (
    ROUTE_LABEL,
    FrequencyResult,
    RouteKind,
    is_infusion,
    is_prn_text,
    meal_from_text,
    mentions_discontinue,
    normalize_frequency,
    normalize_route,
    reminder_mode,
    route_in_text,
)
from app.services.schedule import parse_duration_days

CONFIDENCE_THRESHOLD = 0.7

# Fields that must each be an exact (whitespace/case-insensitive) copy of part of original_text.
VERBATIM_FIELDS = (
    "name",
    "strength_text",
    "dose_text",
    "frequency_raw",
    "route_raw",
    "prn_condition",
    "duration_raw",
    "quantity_limit_raw",
    "instructions_raw",
)
ELLIPSIS = ("...", "…")

REASONS = {
    "low_confidence": "Parhne mein yaqeen kam hai.",
    "missing_name": "Dawai ka naam saaf nahi.",
    "missing_strength": "Taqat (strength) likhi nahi ya saaf nahi.",
    "missing_frequency": "Kitni baar leni hai, likha nahi.",
    "illegible": "Kuch hissa parha nahi ja saka.",
    "truncated": "Line adhoori lag rahi hai ('...').",
    "not_verbatim": "Tasveer ki line aur parhi gayi line mel nahi khatin.",
    "discontinue": "Is line mein 'D/c' (band karna) likha hai, pharmacist se poochein.",
    "unknown_route": "Dawai lene ka tareeqa (route) samajh nahi aaya.",
    "unknown_frequency": "Kitni baar leni hai (abbreviation) samajh nahi aaya.",
}


def _squash(text: str | None) -> str:
    return "".join((text or "").lower().split())


@dataclass(frozen=True)
class Resolved:
    """Code's reading of one transcribed line."""

    route: RouteKind
    route_written: bool
    route_recognised: bool
    freq: FrequencyResult
    prn: bool
    discontinued: bool
    meal: str


def resolve(med: ExtractedMedicine) -> Resolved:
    route_r = normalize_route(med.route_raw)
    route: RouteKind = route_r.kind
    if not route_r.written:
        route = route_in_text(med.original_text) or "unknown"
    if is_infusion(med.original_text) or is_infusion(med.instructions_raw):
        route = "intravenous"
    freq = normalize_frequency(med.frequency_raw)
    prn = med.prn or freq.kind == "prn" or is_prn_text(med.original_text)
    discontinued = med.discontinue_mentioned or mentions_discontinue(
        med.original_text, med.instructions_raw, med.name
    )
    meal = med.meal_timing
    if meal == "unknown" and med.instructions_raw:
        meal = meal_from_text(med.instructions_raw)
    return Resolved(
        route=route,
        route_written=route_r.written,
        route_recognised=route_r.kind != "unknown",
        freq=freq,
        prn=prn,
        discontinued=discontinued,
        meal=meal,
    )


def verbatim_problems(med: ExtractedMedicine, page_lines: list[str]) -> list[str]:
    """'truncated' if '...' appears; 'not_verbatim' if fields don't match the line / page."""
    out: list[str] = []
    original = med.original_text or ""
    values = [getattr(med, f) for f in VERBATIM_FIELDS]
    if any(e in original for e in ELLIPSIS) or any(v and any(e in v for e in ELLIPSIS) for v in values):
        out.append("truncated")
    line = _squash(original)
    page = _squash(" ".join(page_lines))
    if not line or (page and line not in page) or any(v and _squash(v) not in line for v in values):
        out.append("not_verbatim")
    return out


def pharmacist_reasons(med: ExtractedMedicine, r: Resolved, page_lines: list[str]) -> list[str]:
    reasons: list[str] = []
    if med.confidence < CONFIDENCE_THRESHOLD:
        reasons.append("low_confidence")
    if not med.name or "?" in med.name:
        reasons.append("missing_name")
    if not med.strength_text:
        reasons.append("missing_strength")
    if not med.frequency_raw and not r.prn:
        reasons.append("missing_frequency")
    if med.illegible_fields:
        reasons.append("illegible")
    reasons += verbatim_problems(med, page_lines)
    if r.discontinued:
        reasons.append("discontinue")
    if r.route_written and not r.route_recognised:
        reasons.append("unknown_route")
    if med.frequency_raw and r.freq.kind == "unknown":
        reasons.append("unknown_frequency")
    return list(dict.fromkeys(reasons))


def needs_pharmacist(med: ExtractedMedicine, page_lines: list[str] | None = None) -> bool:
    return bool(pharmacist_reasons(med, resolve(med), page_lines or []))


def frequency_choice(freq: FrequencyResult) -> str:
    """Pre-select the confirm screen's 'Kitni baar' control."""
    if freq.kind == "per_day" and freq.count_or_interval in (1, 2, 3, 4):
        return f"d{freq.count_or_interval}"
    if freq.kind == "every_n_hours" and freq.count_or_interval in (6, 8, 12):
        return f"h{freq.count_or_interval}"
    if freq.kind == "bedtime":
        return "hs"
    if freq.kind == "prn":
        return "prn"
    if freq.kind in ("unknown", "none") or not freq.times_suggested:
        return "custom"
    return "asis"  # e.g. "1+0+1": keep the pattern exactly as written


def to_draft(med: ExtractedMedicine, page_lines: list[str]) -> DraftMedicine:
    r = resolve(med)
    mode = reminder_mode(stopped=r.discontinued, route=r.route, prn=r.prn, freq=r.freq)
    reasons = pharmacist_reasons(med, r, page_lines)
    return DraftMedicine(
        original_text=med.original_text,
        name=med.name,
        strength_text=med.strength_text,
        dose_text=med.dose_text,
        frequency_raw=med.frequency_raw,
        route_raw=med.route_raw,
        meal_timing=r.meal,
        prn=r.prn,
        prn_condition=med.prn_condition,
        duration_raw=med.duration_raw,
        duration_days=parse_duration_days(med.duration_raw),
        quantity_limit_raw=med.quantity_limit_raw,
        instructions_raw=med.instructions_raw,
        discontinue_mentioned=r.discontinued,
        frequency=FrequencyOut(
            kind=r.freq.kind,
            count_or_interval=r.freq.count_or_interval,
            label=r.freq.label,
            confidence=r.freq.confidence,
            note=r.freq.note,
        ),
        frequency_choice=frequency_choice(r.freq),
        route=RouteOut(kind=r.route, label=ROUTE_LABEL[r.route]),
        reminder_mode=mode,
        status="stopped" if r.discontinued else "active",
        suggested_times=r.freq.times_suggested if mode == "fixed" else [],
        confidence=round(med.confidence, 2),
        needs_pharmacist=bool(reasons),
        pharmacist_reasons=[REASONS[k] for k in reasons],
        illegible_fields=med.illegible_fields,
    )


async def extract_prescription(provider: LLMProvider, image_jpeg: bytes) -> ExtractOut:
    result = await provider.chat_json(
        system=EXTRACT_SYSTEM,
        user_text="Transcribe every medicine line on this prescription or medication order, verbatim.",
        schema=ExtractionResult,
        images=[image_jpeg],
        max_tokens=3000,
    )
    drafts = [
        to_draft(m, result.page_lines)
        for m in result.medicines
        if any([m.name, m.original_text, m.strength_text, m.frequency_raw])
    ]
    return ExtractOut(
        is_prescription=result.is_prescription and bool(drafts),
        medicines=drafts,
        needs_pharmacist=(not drafts) or any(d.needs_pharmacist for d in drafts),
    )
