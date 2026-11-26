"""Server-side decision for a confirmed medicine (pure; no I/O).

The confirm screen sends what the user reviewed, but the server re-derives everything that
matters for safety from the verbatim fields, so a client can't create reminders for an IV, PRN
or discontinued order, or silently clear a pharmacist flag.
"""

from dataclasses import dataclass

from app.llm.schemas import ExtractedMedicine
from app.schemas import MedicineIn
from app.services.extraction import CONFIDENCE_THRESHOLD, pharmacist_reasons, resolve
from app.services.frequency import (
    MEAL_LABEL,
    PRN_LABEL,
    ROUTE_LABEL,
    FrequencyResult,
    choice_result,
    normalize_frequency,
    reminder_mode,
)


class NeedTime(ValueError):
    """A medicine with home reminders needs at least one time."""


@dataclass(frozen=True)
class Plan:
    status: str  # confirmed | stopped
    reminder_mode: str
    timings: list[str]
    needs_pharmacist: bool
    discontinued: bool
    route_kind: str
    route_label: str
    frequency_label: str
    prn: bool
    meal_timing: str


def _as_extracted(m: MedicineIn) -> ExtractedMedicine:
    return ExtractedMedicine.model_validate(
        {
            **m.model_dump(
                include={
                    "original_text",
                    "name",
                    "strength_text",
                    "dose_text",
                    "frequency_raw",
                    "route_raw",
                    "meal_timing",
                    "prn",
                    "prn_condition",
                    "duration_raw",
                    "quantity_limit_raw",
                    "instructions_raw",
                    "discontinue_mentioned",
                }
            ),
            "confidence": m.confidence,
        }
    )


def plan(m: MedicineIn) -> Plan:
    ext = _as_extracted(m)
    r = resolve(ext)
    freq: FrequencyResult = (
        normalize_frequency(m.frequency_raw)
        if m.frequency_choice == "asis"
        else choice_result(m.frequency_choice)
    )
    prn = r.prn or m.frequency_choice == "prn"
    # D/c orders stay stopped unless the user explicitly tapped "re-activate".
    stopped = m.status == "stopped" or (r.discontinued and not m.reactivate_confirmed)
    mode = reminder_mode(stopped=stopped, route=r.route, prn=prn, freq=freq)
    if mode == "manual" and m.timings:
        mode = "fixed"  # the user set the times themselves
    timings = sorted(set(m.timings)) if mode == "fixed" else []
    if mode in ("fixed", "manual") and not timings:
        raise NeedTime(m.name)

    # Never auto-resolve: flags from the verbatim text stay on whatever the user edited.
    text_reasons = [
        k
        for k in pharmacist_reasons(ext, r, [])
        if k in ("discontinue", "truncated", "unknown_route", "unknown_frequency", "illegible")
    ]
    needs = m.needs_pharmacist or m.confidence < CONFIDENCE_THRESHOLD or bool(text_reasons)
    return Plan(
        status="stopped" if stopped else "confirmed",
        reminder_mode="stopped" if stopped else mode,
        timings=timings,
        needs_pharmacist=needs,
        discontinued=r.discontinued,
        route_kind=r.route,
        route_label=ROUTE_LABEL[r.route],
        frequency_label=(
            f"{PRN_LABEL} · {freq.label}"
            if prn and freq.kind not in ("prn", "none", "unknown")
            else PRN_LABEL
            if prn
            else freq.label
        ),
        prn=prn,
        meal_timing=m.meal_timing if m.meal_timing != "unknown" else r.meal,
    )


def meal_label(meal: str | None) -> str:
    return MEAL_LABEL.get(meal or "unknown", "")
