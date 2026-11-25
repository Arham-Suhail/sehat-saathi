"""Prescription extraction: image -> vision LLM -> validated drafts.

Safety enforced in code (not only the prompt):
- low confidence, missing name/dose/timing or any illegible field -> needs_pharmacist=true
- suggested times are scheduling defaults only and are always user-reviewed
"""

from app.llm import LLMProvider
from app.llm.prompts import EXTRACT_SYSTEM
from app.llm.schemas import ExtractedMedicine, ExtractionResult
from app.schemas import DraftMedicine, ExtractOut
from app.services.schedule import parse_duration_days, suggest_times

CONFIDENCE_THRESHOLD = 0.7


def needs_pharmacist(med: ExtractedMedicine) -> bool:
    return (
        med.confidence < CONFIDENCE_THRESHOLD
        or not med.name
        or not med.dose
        or not (med.frequency or med.timing_text)
        or bool(med.illegible_fields)
    )


def to_draft(med: ExtractedMedicine) -> DraftMedicine:
    return DraftMedicine(
        name=med.name,
        strength=med.strength,
        form=med.form,
        dose=med.dose,
        frequency=med.frequency,
        timing_text=med.timing_text,
        duration=med.duration,
        instructions=med.instructions,
        confidence=round(med.confidence, 2),
        needs_pharmacist=needs_pharmacist(med),
        illegible_fields=med.illegible_fields,
        suggested_times=suggest_times(med.frequency, med.timing_text),
        suggested_duration_days=parse_duration_days(med.duration),
    )


async def extract_prescription(provider: LLMProvider, image_jpeg: bytes) -> ExtractOut:
    result = await provider.chat_json(
        system=EXTRACT_SYSTEM,
        user_text="Transcribe the medicines on this prescription photo.",
        schema=ExtractionResult,
        images=[image_jpeg],
        max_tokens=2000,
    )
    drafts = [to_draft(m) for m in result.medicines if any([m.name, m.dose, m.frequency, m.timing_text])]
    return ExtractOut(
        is_prescription=result.is_prescription and bool(drafts),
        medicines=drafts,
        needs_pharmacist=(not drafts) or any(d.needs_pharmacist for d in drafts),
    )
