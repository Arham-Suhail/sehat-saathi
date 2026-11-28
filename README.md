# Sehat Saathi · صحت ساتھی

> Hackathon entry: Capital Youth Expo, Healthcare track. Built Thursday Nov 26 to Saturday Nov 28, 2026.
> **Prototype — tested with fake prescriptions and demo data only. Not for real patient data.**

| | |
|---|---|
| **Android app (APK)** | https://github.com/Arham-Suhail/sehat-saathi/releases/download/v3.1/SehatSaathi.apk |
| **Website** (iPhone / laptop, judges) | https://sehat-saathi-delta.vercel.app |
| **Judge walkthrough** (demo accounts, 3-step script) | https://sehat-saathi-delta.vercel.app/demo |
| **API health** | https://sehat-saathi-api.onrender.com/health |

Sehat Saathi helps elderly people in Pakistan take their medicines on time and keeps their family and doctor in
the loop. The elder photographs a prescription, an AI reads it, the elder (or their family) checks it, and the phone
rings an alarm for every dose with two big buttons: **"I took it"** / **"Not taken"**. Every day the elder tells
**Chotu**, a friendly capsule-shaped AI companion, how they feel — by typing, speaking or on a live voice call.
Family members and doctors link with a one-time code, see a full progress report with graphs, and are alerted —
again and again until they read it — when something needs attention.

English and **Urdu** (Nastaliq, right-to-left) everywhere, with a language switch on every screen.

## The problem
Older people often take several medicines a day from handwritten prescriptions, live apart from their children,
and are not comfortable with English-only apps. About half of people with long-term illnesses don't take their
medicines as prescribed (WHO, *Adherence to long-term therapies*, 2003). Missed or doubled doses, and symptoms nobody
hears about in time, are common and avoidable.

## Features

### For the elder (kept as simple as possible)
- **Prescription photo → medicines.** A vision model transcribes each line *verbatim* (and the diagnosis, as
  written); code — not the AI — turns `1+0+1`, `bid`, `q8h`, `PRN`, `IV` … into a schedule. Everything is reviewed
  before saving; unclear lines say "confirm with a pharmacist".
- **"Ask my family / doctor to check"** when a photo is unclear or the elder isn't sure: the medicine is saved but
  its alarm waits until a family member or doctor confirms dose and times.
- **Duplicate warning** ("you already have this medicine") and a small, hand-checked list of well-known pairs that
  says "ask your pharmacist about taking these together" (the app never decides).
- **Dose time = two big buttons.** Native Android alarms ring with the screen off / app closed, with *Taken* and
  *Not taken* right on the notification. Not answered? It rings again every 5 minutes (3 times) and at 30 minutes;
  after an hour, or on "Not taken", the family is told.
- **Chotu speaks** the dose out loud (phone's own text-to-speech), and "Read to me" reads today's medicines.
- **Today's medicines** grouped Morning / Afternoon / Evening / Night, with "before / after food".
- **Medicine extras:** doses-left counter with a refill warning (and a family alert 3 days before running out),
  side-effect notes for the doctor, a photo of the pill strip (kept only on the phone), "course complete" badge,
  past prescriptions, and links to find it on dawaai.pk or at a nearby pharmacy.
- **Daily check-in with Chotu:** type, quick-reply chips, speak (Urdu / English) or a **live voice call** (Vapi).
  Chotu replies with one general wellness tip, remembers today's mood, and never diagnoses.
- **"I'm OK today"** one-tap proof of life; **notes from the doctor / family** on Home (marked "written by a person,
  not AI") with a heart back; weekly summary ("this week you took 96% of your doses"); a daily general tip.
- **Help:** one-tap call to a saved contact, a **second contact** if the first doesn't answer, **send my location on
  WhatsApp**, Rescue 1122 / Edhi / Police numbers, nearest hospital and pharmacy (Google Maps).
- **Vitals:** BP, sugar, pulse, weight, SpO₂, temperature, with a daily "measure your BP" reminder. Readings outside
  a fixed general range say "talk to your doctor" (a general guide, never a diagnosis) and alert the family.
- **Meetings:** ask the doctor for a video call (Jitsi link made automatically, or a Google Meet / Zoom link), phone
  call or visit; reminders a day and 15 minutes before.
- **Progress:** day streak, badges, water tracker.
- **First-time tour** with Chotu, **voice-only mode** (big Chotu, one button, everything spoken), **simple mode**
  (Home shows only the dose, Chotu and Help).

### For family and doctors
- **Join with a 6-digit code** the elder creates (one use, 24 h). The elder can remove anyone's access.
- **Alerts tab**, urgent first, each repeating (native alarm + push) **until it is marked read**:
  - *Concern* (urgent): a check-in mentioned a symptom such as chest pain, or a possible fall went unanswered. The
    elder is not told that the family was alerted; they only hear "talk to your doctor".
  - *Medicine to check*: confirm dose / times in a sheet; the elder's alarms start once confirmed.
  - *Missed dose*, *reading outside the general range*, *low mood 3 days in a row*, *no activity for 24 hours*,
    *medicine running out*, *meeting request*.
  - Share any alert on WhatsApp (generic text, no symptoms).
- **Home:** one card per elder — mood, doses on time, streak, latest BP, **last active**, call button — sorted so the
  elder who needs attention comes first.
- **Full progress report** with graphs: doses taken day by day, taken vs missed, each medicine, time of day, on-time
  rate, this week vs last week, mood trend, BP / sugar charts, recent misses; diagnosis as written; check-in timeline.
- **Doctor:** call a meeting with the patient and family; write a note to the elder; side-effect notes per medicine.
- **Export:** CSV download and a print / PDF report (website).
- **Quiet hours** (10 PM – 7 AM) for non-urgent alerts; urgent ones still ring.

### The app itself
- **Android app** (Capacitor, React bundled in the APK) + the same app on the website. The website is app-first:
  "Download for Android" with a QR code, browser login for iPhone / laptop users.
- Calm light theme (warm neutral, white cards, one deep-pine accent), Inter + Noto Nastaliq Urdu, iOS-like springs,
  bottom sheets, haptics, skeleton loaders, instant screens from cache, optimistic "Taken" with rollback.
- **Accessibility:** 20 px+ text, 48 px+ targets, text size Normal / Large / Extra large, high-contrast mode, Urdu
  RTL, screen-reader labels, reduced-motion respected, text never cut off ("…") at any size.
- **Settings:** dark mode, sound on Taken, battery-optimisation fix so alarms ring on time, 10-second test alarm,
  4-digit app lock (PIN), download my data, "who viewed my data", update checker, fall check (prototype).

Safety rules are written into the prompts **and enforced in code**: Chotu never diagnoses or gives doses; any
symptom adds "talk to your doctor or family" and a concern flag (also caught by a keyword list in Roman Urdu,
English, Hindi and Urdu script, so the AI is never the only check); every screen with medical information says to
confirm with a doctor; vitals bands are fixed in code and labelled "general guide".

## Architecture
```
Android app (Capacitor 8)  ─┐
  native alarms, TTS,       │
  haptics, battery plugin   ├─ React + Vite UI ──HTTPS──▶ FastAPI (Render) ──▶ MongoDB Atlas
Website (Vercel)           ─┘   Web Push SW, Vapi SDK       │  app/llm/ (provider-agnostic, OpenAI-compatible)
                                Web Speech (ur-PK/en-IN)    │     └─ Gemini (primary) · Groq / OpenRouter (fallback)
                                                            ├─ background loop: dose pushes + follow-ups, missed
                                                            │  doses, repeating care alerts, inactivity / refill checks
                                                            ├─ Web Push (VAPID)
                                                            └─ Brevo (sign-up / verify / reset codes)
```
- **Frontend:** React 19, react-router 7, Tailwind CSS v4 (no preflight) + plain CSS, Motion, Recharts; all colours
  in one theme file; i18n with `en.json` / `ur.json`; server messages translated via `shared/server-strings.json`.
- **Backend:** FastAPI + Pydantic v2 (strict models, length limits), PyMongo async, PyJWT + bcrypt, slowapi.
  Independent database reads run concurrently (`asyncio.gather`).
- Every LLM answer is parsed into a Pydantic model (retry once, then a friendly error); prescription images are
  processed in memory and never stored.

## Run locally
### Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt      # Windows (use .venv/bin/ on macOS/Linux)
cp .env.example .env                                   # fill MONGODB_URI and JWT_SECRET; the rest is optional
.venv/Scripts/python -m uvicorn --factory app.main:app_factory --reload
.venv/Scripts/python -m pytest                         # 321 tests, fully offline (PROVIDER=fake, mock DB)
```
API docs (development only): http://127.0.0.1:8000/docs

### Frontend (React + Vite)
```bash
cd frontend
npm ci
cp .env.example .env.local      # VITE_API_URL=http://127.0.0.1:8000 (+ optional Vapi public key and assistant id)
npm run dev                     # http://localhost:5173
npm test && npm run lint && npm run build
```

### Android app
```bash
cd frontend
npm run build:android                    # vite build --mode android (.env.android → live API) + cap sync
cd android && ./gradlew assembleDebug    # JDK 21; APK in app/build/outputs/apk/debug/
```

### Optional features (each switches on with its env vars and hides itself without them)
- **LLM provider:** `PROVIDER=fake` (offline) or `gemini` with `VISION_*` / `TEXT_*`; other OpenAI-compatible text
  providers via `TEXT_PROVIDER`, `TEXT_BASE_URL`, `TEXT_API_KEY`, `TEXT_MODEL`.
- **Web Push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`python -m scripts.gen_vapid`).
- **Email codes:** `BREVO_API_KEY` + `EMAIL_FROM` (a sender verified in Brevo).
- **Voice call:** `VITE_VAPI_PUBLIC_KEY` + `VITE_VAPI_ASSISTANT_ID` (frontend; public values only).

`SEED_PASSWORD=… python -m scripts.seed_demo --reset` (in `backend/`) creates a linked elder, family member and
doctor with 14 days of history plus a diagnosis, a medicine to check, alerts, a meeting, a doctor's note and a low
refill. The demo password is not in this repository.

## Security
- Secrets only in environment variables (backend); the browser gets only public values. gitleaks scans the full
  history in CI on every push, together with tests, lint, build, `pip-audit` and `npm audit`.
- bcrypt passwords; JWTs per role (elder 7 days so alarms keep working, family/doctor 12 hours); **logout revokes the
  token on the server**; a password reset ends every older session.
- Every endpoint checks role **and** ownership or link on the server (`require_role`, `resolve_elder_access`);
  cross-user access is covered by tests. Doctors can confirm a medicine the elder asked about, but cannot add
  vitals or change stock.
- Strict Pydantic models (`extra="forbid"`, length limits) block NoSQL-operator payloads; uploads are type-checked by
  magic bytes, size-capped and re-encoded in memory.
- Rate limits on login, sign-up, codes, invites and every AI endpoint; a per-email login lock and a per-account
  invite lock; one-time 6-digit codes (hashed, 15 minutes, 5 tries).
- Security headers on the API and the website (CSP, HSTS, `nosniff`, `frame-ancestors none`, Permissions-Policy);
  CORS allowlist; Web Push endpoints restricted to the real push services (SSRF); no raw HTML rendering
  (lint-enforced); errors never show stack traces; logs never contain passwords, tokens, codes or health text.
- Privacy: "download my data" (JSON), an audit log of who opened the elder's dashboard (90 days), optional app PIN,
  lock-screen texts never name a symptom or medicine, cached screens are wiped on logout / account switch.

Details: `docs/security-checklist.md`, `docs/security/audit-findings.md`, `docs/security/threat-model.md`,
`docs/engineering-checklist.md`.

## Known limitations
- **Family alerts when the family's app is fully closed:** repeating native alarms start once the app has seen the
  alert; on the website, Web Push delivers it. A real fix is Firebase Cloud Messaging (not set up yet).
- The APK is **debug-signed** (for the demo); a signed release build is needed for the Play Store.
- **AI output can be wrong:** every extraction is reviewed by a person, unclear lines ask for a pharmacist, and
  alternatives always say "needs doctor verification". The app does not replace a doctor.
- The **fall check** is a prototype (phone sensor, only while the app is open) and can miss falls or raise false
  alarms. Vitals ranges are general, not personal targets.
- **Voice call transcripts** arrive in Hindi script and are converted to Urdu script by rules; some spellings can be
  off. Urdu interface text is machine-assisted.
- Rate-limit counters are in memory on a single instance (login and invite locks live in MongoDB).
- **Data sent to AI providers:** prescription photos (re-encoded, metadata removed) and check-in text go to the
  Gemini API, and to Groq or OpenRouter only if Gemini fails. Free tiers may log inputs.

## Dependencies & external services (disclosure)
**External services:** MongoDB Atlas, Render, Vercel, GitHub Releases (APK download), UptimeRobot (pings `/health`;
sees no user data), Gemini API (primary), Groq and OpenRouter (fallback LLMs), Vapi (live voice call; Deepgram
speech-to-text inside Vapi), Brevo (sign-up / reset codes; receives only the address and the code), Jitsi Meet
(meeting links; no data sent until someone joins), and links the user opens themselves: dawaai.pk, Google Maps,
WhatsApp (`wa.me`), Google Meet / Zoom. Browser Web Speech, Notification, Push and Geolocation APIs (location only
when the elder taps "send my location", and only into their own WhatsApp message).

**Backend (Python):** fastapi, starlette, uvicorn, pydantic, pydantic-settings, email-validator, pymongo, dnspython,
PyJWT, bcrypt, openai (OpenAI-compatible HTTP client only), httpx, slowapi, pillow, tzdata, pywebpush + py-vapid +
http_ece + cryptography + aiohttp + requests. Dev: pytest, pytest-asyncio, mongomock-motor, ruff, pip-audit.
CI: GitHub Actions, gitleaks.

**Frontend (npm):** react, react-dom, react-router-dom, recharts, motion, tailwindcss + @tailwindcss/vite,
@vapi-ai/web (uses Daily.co WebRTC), Capacitor (@capacitor/core, android, app, haptics, local-notifications,
splash-screen, status-bar), @capacitor-community/speech-recognition, @capacitor-community/text-to-speech, fonts
self-hosted via @fontsource (Inter, Noto Nastaliq Urdu, Atkinson Hyperlegible, Fraunces, Anton, Yellowtail).
Dev: vite, @vitejs/plugin-react, eslint (+ react, react-hooks plugins), globals, @capacitor/cli.
The QR code image was generated once with `segno` (not part of the app).

**Development tools:** Claude Code (AI pair programmer), plus a few instruction-only agent/skill files adapted from
`affaan-m/everything-claude-code` (MIT; see `.claude/ECC-LICENSE`).
