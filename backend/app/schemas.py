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
class DraftMedicine(BaseModel):
    name: str | None
    strength: str | None
    form: str | None
    dose: str | None
    frequency: str | None
    timing_text: str | None
    duration: str | None
    instructions: str | None
    confidence: float
    needs_pharmacist: bool
    illegible_fields: list[str]
    suggested_times: list[str]
    suggested_duration_days: int | None


class ExtractOut(BaseModel):
    is_prescription: bool
    medicines: list[DraftMedicine]
    needs_pharmacist: bool
    pharmacist_note: str = PHARMACIST_NOTE
    disclaimer: str = DISCLAIMER


class MedicineIn(Strict):
    name: Text(120, 1)
    strength: OptText(60) = None
    form: OptText(40) = None
    dose: OptText(80) = None
    frequency: OptText(80) = None
    timing_text: OptText(120) = None
    duration: OptText(60) = None
    instructions: OptText(200) = None
    timings: Annotated[list[HHMM], Field(min_length=1, max_length=6)]
    duration_days: Annotated[int, Field(ge=1, le=365)] | None = None
    confidence: Annotated[float, Field(ge=0, le=1)] = 1.0
    needs_pharmacist: bool = False
    edited_by_user: bool = False


class ConfirmIn(Strict):
    medicines: Annotated[list[MedicineIn], Field(min_length=1, max_length=15)]


class MedicineOut(BaseModel):
    id: str
    name: str
    strength: str | None
    form: str | None
    dose: str | None
    frequency: str | None
    timing_text: str | None
    duration: str | None
    instructions: str | None
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


class CheckinTextIn(Strict):
    message: Text(1000, 1)
    channel: ChannelIn = "text"


class TranscriptTurn(Strict):
    role: Literal["ai", "elder"]
    text: Text(1000, 1)


class CheckinVoiceIn(Strict):
    transcript: Annotated[list[TranscriptTurn], Field(min_length=1, max_length=60)]
    vapi_call_id: OptText(100) = None


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
class AlternativesOut(BaseModel):
    medicine_id: str
    medicine_name: str
    generic_name: str
    alternatives: list[str]
    needs_doctor_verification: Literal[True] = True
    label: str = "Needs doctor verification / doctor se tasdeeq zaroori"
    disclaimer: str = DISCLAIMER
