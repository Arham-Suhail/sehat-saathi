"""API request/response models. Requests forbid unknown fields and cap every length,
which also blocks NoSQL operator payloads like {"$ne": null} (they fail type validation)."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.services.schedule import is_valid_hhmm

Role = Literal["elder", "family", "doctor"]
Mood = Literal["good", "okay", "low"]

DISCLAIMER = "Yeh maloomat doctor ki tasdeeq ke baghair istemal na karein. Apne doctor se zaroor poochein."
PHARMACIST_NOTE = "Please confirm with a pharmacist / pharmacist se tasdeeq karein."


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def Text(max_len: int, min_len: int = 0):  # noqa: N802 - type factory
    return Annotated[str, StringConstraints(min_length=min_len, max_length=max_len)]


def OptText(max_len: int):  # noqa: N802
    return Annotated[str, StringConstraints(max_length=max_len)] | None


def _password_bytes(v: str) -> str:
    if len(v.encode("utf-8")) > 72:  # bcrypt hard limit
        raise ValueError("password too long")
    return v


def _hhmm(v: str) -> str:
    if not is_valid_hhmm(v):
        raise ValueError("time must be HH:MM (24h)")
    return v


Password = Annotated[str, StringConstraints(min_length=8, max_length=72), AfterValidator(_password_bytes)]
HHMM = Annotated[str, AfterValidator(_hhmm)]
Email = Annotated[EmailStr, StringConstraints(max_length=254)]


# ---------- auth ----------
class RegisterIn(Strict):
    name: Text(80, 1)
    email: Email
    password: Password
    role: Role


class LoginIn(Strict):
    email: Email
    password: Text(72, 1)


class DeleteAccountIn(Strict):
    """Deleting an account needs the password again (a phone left logged in is not enough)."""

    password: Text(72, 1)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    linked_elder_ids: list[str] = []


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - not a secret
    expires_in: int
    user: UserOut


# ---------- prescriptions / medicines ----------
MealTiming = Literal["before", "after", "with", "none", "unknown"]
ReminderMode = Literal["fixed", "manual", "prn", "hospital", "stopped"]
FrequencyChoice = Literal["asis", "d1", "d2", "d3", "d4", "h6", "h8", "h12", "hs", "prn", "custom"]


class FrequencyOut(BaseModel):
    kind: str
    count_or_interval: int | None
    label: str
    confidence: float
    note: str = ""


class RouteOut(BaseModel):
    kind: str
    label: str


class DraftMedicine(BaseModel):
    """What the confirm screen shows. Raw fields are verbatim transcription; everything else
    (frequency, route, reminder_mode, suggested_times, needs_pharmacist) is decided by code."""

    original_text: str | None
    name: str | None
    strength_text: str | None
    dose_text: str | None
    frequency_raw: str | None
    route_raw: str | None
    meal_timing: MealTiming
    prn: bool
    prn_condition: str | None
    duration_raw: str | None
    duration_days: int | None
    quantity_limit_raw: str | None
    instructions_raw: str | None
    discontinue_mentioned: bool
    frequency: FrequencyOut
    frequency_choice: FrequencyChoice
    route: RouteOut
    reminder_mode: ReminderMode
    status: Literal["active", "stopped"]
    suggested_times: list[str]
    confidence: float
    needs_pharmacist: bool
    pharmacist_reasons: list[str]
    illegible_fields: list[str]


class ExtractOut(BaseModel):
    is_prescription: bool
    medicines: list[DraftMedicine]
    needs_pharmacist: bool
    pharmacist_note: str = PHARMACIST_NOTE
    disclaimer: str = DISCLAIMER


class MedicineIn(Strict):
    name: Text(120, 1)
    strength_text: OptText(60) = None
    dose_text: OptText(80) = None
    frequency_raw: OptText(80) = None
    route_raw: OptText(40) = None
    meal_timing: MealTiming = "unknown"
    prn: bool = False
    prn_condition: OptText(120) = None
    duration_raw: OptText(60) = None
    quantity_limit_raw: OptText(80) = None
    instructions_raw: OptText(300) = None
    original_text: OptText(400) = None
    discontinue_mentioned: bool = False
    frequency_choice: FrequencyChoice = "asis"
    timings: Annotated[list[HHMM], Field(max_length=6)] = []
    duration_days: Annotated[int, Field(ge=1, le=365)] | None = None
    confidence: Annotated[float, Field(ge=0, le=1)] = 1.0
    needs_pharmacist: bool = False
    edited_by_user: bool = False
    # A discontinued (D/c) order stays stopped unless the user explicitly re-activates it.
    status: Literal["active", "stopped"] = "active"
    reactivate_confirmed: bool = False


class ConfirmIn(Strict):
    medicines: Annotated[list[MedicineIn], Field(min_length=1, max_length=15)]


class MedicineEditIn(Strict):
    """Change an active medicine's alarm times (and optionally dose text / number of days).
    Everything else (name, strength, route, frequency label) stays as confirmed from the prescription."""

    timings: Annotated[list[HHMM], Field(min_length=1, max_length=6)]
    dose_text: OptText(80) = None
    duration_days: Annotated[int, Field(ge=1, le=365)] | None = None


class MedicineOut(BaseModel):
    id: str
    name: str
    original_text: str | None
    strength_text: str | None
    dose_text: str | None
    frequency_raw: str | None
    frequency_label: str | None
    route_raw: str | None
    route_kind: str
    route_label: str
    meal_timing: MealTiming
    prn: bool
    prn_condition: str | None
    duration_raw: str | None
    quantity_limit_raw: str | None
    instructions_raw: str | None
    discontinued: bool
    reminder_mode: ReminderMode
    timings: list[str]
    duration_days: int | None
    confidence: float
    needs_pharmacist: bool
    edited_by_user: bool
    status: Literal["confirmed", "stopped"]
    created_at: datetime


# ---------- reminders ----------
class ReminderOut(BaseModel):
    id: str
    medicine_id: str
    medicine_name: str
    dose: str | None
    instructions: str | None
    scheduled_at: datetime
    status: Literal["pending", "taken", "skipped", "missed"]
    acted_at: datetime | None


# ---------- check-ins ----------
ChannelIn = Literal["text", "speech"]
# UI language of the requesting device ("roman" = the original Roman Urdu UI, the default).
UiLang = Literal["roman", "ur", "en"]


class CheckinTextIn(Strict):
    message: Text(1000, 1)
    channel: ChannelIn = "text"
    lang: UiLang = "roman"


class TranscriptTurn(Strict):
    role: Literal["ai", "elder"]
    text: Text(1000, 1)


class CheckinVoiceIn(Strict):
    transcript: Annotated[list[TranscriptTurn], Field(min_length=1, max_length=60)]
    vapi_call_id: OptText(100) = None
    lang: UiLang = "roman"


class CheckinOut(BaseModel):
    id: str
    created_at: datetime
    channel: Literal["text", "speech", "vapi"]
    transcript: list[dict]
    reply: str
    wellness_tip: str
    mood: Mood
    mood_score: int
    concern_flag: bool
    concern_reason: str | None
    disclaimer: str = "Chotu ek AI sahayak hai, doctor nahi. Dawai ke baare mein apne doctor se poochein."


# ---------- vitals ----------
VitalType = Literal["bp", "sugar", "heart_rate"]


# ---------- emergency contact (elder's "Madad" button) ----------
# Digits with an optional leading +, spaces or dashes allowed; 7-15 digits in total.
PHONE_PATTERN = r"^\+?[0-9][0-9 -]{5,18}[0-9]$"


class EmergencyContactIn(Strict):
    name: Text(40, 1)
    phone: Annotated[str, StringConstraints(max_length=20, pattern=PHONE_PATTERN)]


class EmergencyContactOut(BaseModel):
    name: str
    phone: str


class VitalIn(Strict):
    elder_id: OptText(24) = None
    type: VitalType
    systolic: Annotated[int, Field(ge=50, le=260)] | None = None
    diastolic: Annotated[int, Field(ge=30, le=160)] | None = None
    value: Annotated[float, Field(ge=10, le=600)] | None = None
    measured_at: datetime | None = None
    note: OptText(120) = None


class VitalOut(BaseModel):
    id: str
    type: VitalType
    systolic: int | None
    diastolic: int | None
    value: float | None
    unit: str
    measured_at: datetime
    entered_by_role: str
    note: str | None


# ---------- invites ----------
class InviteOut(BaseModel):
    code: str
    expires_at: datetime


class RedeemIn(Strict):
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


class ElderRef(BaseModel):
    id: str
    name: str


# ---------- alternatives ----------
class PriceLinks(BaseModel):
    """Search pages where the user sees the real, current price. Built by the server from a fixed
    allowlist of hosts; the LLM text is only ever a URL-encoded query value."""

    dawaai: str
    google: str


class ProductOut(BaseModel):
    name: str
    company: str | None = None
    links: PriceLinks


class AlternativesOut(BaseModel):
    medicine_id: str
    medicine_name: str
    generic_name: str
    current: ProductOut  # the medicine the elder already takes, for comparison
    products: list[ProductOut]
    needs_doctor_verification: Literal[True] = True
    label: str = "Needs doctor verification / doctor se tasdeeq zaroori"
    disclaimer: str = DISCLAIMER
