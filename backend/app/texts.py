"""Server-generated text that the user sees, per UI language.

"ur" = Urdu script, "en" = English, "roman" = Roman Urdu (the original UI; kept as the default so
older clients and stored data keep working). Error `detail` strings stay Roman Urdu on the wire; the
frontend translates them with shared/server-strings.json. Only text created FOR a user here
(check-in replies, push notifications) needs the language at generation time.
"""

from typing import Literal

Lang = Literal["roman", "ur", "en"]
LANGS: tuple[str, ...] = ("roman", "ur", "en")

GREETING: dict[str, str] = {
    "roman": "Assalam o Alaikum! Aaj aap kaisa mehsoos kar rahe hain?",
    "ur": "السلام علیکم! آج آپ کیسا محسوس کر رہے ہیں؟",
    "en": "Assalam o Alaikum! How are you feeling today?",
}

# How the check-in prompt asks for the reply language.
LANG_INSTRUCTION: dict[str, str] = {
    "roman": "Reply in simple, warm Roman Urdu (Urdu written in Latin letters).",
    "ur": (
        "Reply in simple, warm Urdu written in Urdu (Arabic/Nastaliq) script ONLY. "
        "Never use Roman Urdu, Latin letters or Hindi (Devanagari) script, except for proper names."
    ),
    "en": "Reply in simple, warm, plain English (short words, short sentences).",
}

# The safety line the code appends when a concern is detected, and the word that proves the reply
# already sends them to a doctor (checked in code, not only asked for in the prompt).
CONCERN_REPLY: dict[str, str] = {
    "roman": "Aap ne jo bataya us par dhyan dein — apne doctor ya ghar walon se baat karein.",
    "ur": "آپ نے جو بتایا اس پر دھیان دیں — اپنے ڈاکٹر یا گھر والوں سے بات کریں۔",
    "en": "Please take care with what you told me — talk to your doctor or your family.",
}
DOCTOR_WORDS: dict[str, tuple[str, ...]] = {
    "roman": ("doctor",),
    "ur": ("ڈاکٹر",),
    "en": ("doctor",),
}

FALLBACK_REPLY: dict[str, str] = {
    "roman": "Shukriya batane ka. Main ne aap ki baat note kar li hai.",
    "ur": "بتانے کا شکریہ۔ میں نے آپ کی بات نوٹ کر لی ہے۔",
    "en": "Thank you for telling me. I have noted what you said.",
}
FALLBACK_TIP: dict[str, str] = {
    "roman": "Aaj thora paani zyada piyen aur kuch dair aaram karein.",
    "ur": "آج تھوڑا پانی زیادہ پئیں اور کچھ دیر آرام کریں۔",
    "en": "Drink a little more water today and rest for a while.",
}

PUSH_DOSE_TITLE: dict[str, str] = {"roman": "Dawai ka waqt", "ur": "دوا کا وقت", "en": "Medicine time"}
PUSH_DOSE_DEFAULT: dict[str, str] = {"roman": "Dawai", "ur": "دوا", "en": "Medicine"}
PUSH_CONCERN_TITLE: dict[str, str] = {"roman": "Sehat Saathi", "ur": "صحت ساتھی", "en": "Sehat Saathi"}
PUSH_CONCERN_BODY: dict[str, str] = {
    "roman": "aaj ke hal-chaal mein dhyan dene wali baat hai. Dashboard dekhein.",
    "ur": "آج کے حال چال میں دھیان دینے والی بات ہے۔ ڈیش بورڈ دیکھیں۔",
    "en": "today's check-in needs your attention. Please open the dashboard.",
}
PUSH_ELDER_DEFAULT: dict[str, str] = {"roman": "Buzurg", "ur": "بزرگ", "en": "Your elder"}


def pick(table: dict[str, str], lang: str | None) -> str:
    return table.get(lang or "roman", table["roman"])


PUSH_DOSE_AGAIN_TITLE: dict[str, str] = {
    "roman": "Dawai abhi tak nahi li?",
    "ur": "دوا ابھی تک نہیں لی؟",
    "en": "Medicine not taken yet?",
}
PUSH_ALERT_TITLE: dict[str, dict[str, str]] = {
    "missed_dose": {"roman": "Dawai reh gayi", "ur": "دوا رہ گئی", "en": "A dose was missed"},
    "med_review": {
        "roman": "Dawai ki tasdeeq karein",
        "ur": "دوا کی تصدیق کریں",
        "en": "Please check a medicine",
    },
    "meeting": {"roman": "Meeting ki darkhwast", "ur": "میٹنگ کی درخواست", "en": "Meeting request"},
}
PUSH_ALERT_BODY: dict[str, dict[str, str]] = {
    "missed_dose": {
        "roman": "aaj ki ek dawai nahi li gayi. Meharbani karke rabta karein.",
        "ur": "آج کی ایک دوا نہیں لی گئی۔ براہ کرم رابطہ کریں۔",
        "en": "a dose was not taken. Please check on them.",
    },
    "med_review": {
        "roman": "ko ek dawai samajh nahi aayi. App mein tasdeeq karein.",
        "ur": "کو ایک دوا سمجھ نہیں آئی۔ ایپ میں تصدیق کریں۔",
        "en": "needs you to confirm a medicine in the app.",
    },
    "meeting": {
        "roman": "ke baare mein meeting ki darkhwast aayi hai.",
        "ur": "کے بارے میں میٹنگ کی درخواست آئی ہے۔",
        "en": "a meeting was requested.",
    },
}
