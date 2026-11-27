# Sehat Saathi · صحت ساتھی

> Hackathon entry: Capital Youth Expo, Healthcare track. Built Thursday Nov 26 to Saturday Nov 28, 2026.

**Live app:** https://sehat-saathi-delta.vercel.app · **API:** https://sehat-saathi-api.onrender.com/health

A mobile-first web companion that helps elderly people in Pakistan take their medicines on time and stay connected
to their family. An elder photographs a prescription, an AI reads it, the elder checks it, and the app rings an
alarm for every dose. Each day the elder tells **Chotu**, a friendly AI companion, how they feel, by typing, speaking
or on a live voice call. Family members and doctors link with a one-time code and follow a read-only dashboard, and
get an alert when the elder reports a problem.

The app is in **English and Urdu** (Nastaliq script, right-to-left) with a language switch on every screen.

## The problem
Older people often take several medicines a day from handwritten prescriptions, live apart from their children, and
are not comfortable with English-only apps. Missed or doubled doses, and symptoms nobody hears about in time, are
common and avoidable.

## What it does
| For the elder | For family and doctors |
|---|---|
| **Prescription photo → medicines.** A vision model transcribes each line *verbatim*; code (not the AI) turns `1+0+1`, `bid`, `q8h`, `PRN`, `IV` … into a schedule. The elder reviews and edits everything before saving. Unclear lines are flagged "confirm with a pharmacist". | **Join with a 6-digit code** the elder creates (one use, 24 h). The elder can remove everyone's access at any time. |
| **Alarms** in the app and as Web Push notifications when the app is closed; "Taken" / "Not taken" / "Later". Change an alarm's times, remove a medicine, or add one by hand. | **Dashboard:** medicines taken vs missed, mood trend, check-in timeline, BP / sugar / pulse, the elder's streak and help number. Family can add readings; doctors are read-only. |
| **Daily check-in with Chotu**: type, speak (browser speech in Urdu or English) or a **live voice call** (Vapi). Chotu replies briefly with one general wellness tip and logs the mood. | **Instant alert** (Web Push) when a check-in mentions symptoms, with a generic text on the lock screen. |
| **Help button** that calls a saved family number in one tap. | **Extra alternatives:** other products with the same salt and strength (AI-suggested, always "needs doctor verification") with links to check real prices on dawaai.pk or Google. |
| **Motivation:** day streak, badges, water tracker and a daily general-wellness tip. | |
| **Accounts:** sign-up is confirmed with an emailed code; forgot password; delete my account. | |

Safety rules are written into the prompts **and enforced in code**: Chotu never diagnoses or gives doses; any
symptom adds "talk to your doctor or family" and a concern flag (also caught by a keyword list in Roman Urdu,
English, Hindi and Urdu script, so the AI is never the only check); every screen with medical information says to
confirm with a doctor.

## Architecture
```
Browser (React + Vite, Vercel)  ──HTTPS──▶  FastAPI (Render)  ──▶  MongoDB Atlas
   │  Web Push service worker                 │  app/llm/ (provider-agnostic, OpenAI-compatible)
   │  Vapi Web SDK (voice call)               │     └─ Gemini (primary) · Groq / OpenRouter (fallback)
   └─ Web Speech (ur-PK / en-IN)              ├─ Web Push (VAPID) for alarms and alerts
                                              └─ Brevo (sign-up / verify / reset codes)
```
- **Frontend:** React, react-router, Tailwind CSS v4 (no preflight) + plain CSS, Motion, Recharts; all colours in one
  theme file; i18n with `en.json` / `ur.json`; server messages translated via `shared/server-strings.json`.
- **Backend:** FastAPI + Pydantic v2 (strict models, length limits), PyMongo async, PyJWT + bcrypt, slowapi.
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
.venv/Scripts/python -m pytest                         # tests run fully offline (PROVIDER=fake, mock DB)
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

### Optional features (each switches on with its env vars and hides itself without them)
- **LLM provider:** `PROVIDER=fake` (offline) or `gemini` with `VISION_*` / `TEXT_*`; other OpenAI-compatible text
  providers via `TEXT_PROVIDER`, `TEXT_BASE_URL`, `TEXT_API_KEY`, `TEXT_MODEL`.
- **Web Push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`python -m scripts.gen_vapid`).
- **Email codes:** `BREVO_API_KEY` + `EMAIL_FROM` (a sender verified in Brevo).
- **Voice call:** `VITE_VAPI_PUBLIC_KEY` + `VITE_VAPI_ASSISTANT_ID` (frontend; public values only).

`cd backend && .venv/Scripts/python -m scripts.seed_demo` creates a linked elder, family member and doctor with
14 days of sample history for local testing (`--reset` recreates them; the password is printed once).

## Security
- Secrets only in environment variables (backend); the browser gets only public values. gitleaks scans the full
  history in CI on every push, together with tests, lint, build, `pip-audit` and `npm audit`.
- bcrypt passwords; JWTs per role (elder 7 days so alarms keep working, family/doctor 12 hours); a password reset
  ends every older session.
- Every endpoint checks role **and** ownership or link on the server (`require_role`, `resolve_elder_access`);
  cross-user access is covered by tests.
- Strict Pydantic models (`extra="forbid"`, length limits) block NoSQL-operator payloads; uploads are type-checked by
  magic bytes, size-capped and re-encoded in memory.
- Rate limits on login, sign-up, codes, invites and every AI endpoint; a per-email login lock and a per-account
  invite lock; one-time 6-digit codes (hashed, 15 minutes, 5 tries).
- Sign-up needs the emailed code; the email's domain is checked before sending and bounced addresses are reported.
- Security headers on the API and the website (CSP, HSTS, `nosniff`, `frame-ancestors none`, Permissions-Policy);
  CORS allowlist; Web Push endpoints restricted to the real push services (SSRF); no raw HTML rendering
  (lint-enforced); errors never show stack traces; logs never contain passwords, tokens, codes or health text.

Details: `docs/security-checklist.md` (per endpoint), `docs/security/audit-findings.md` (audit),
`docs/security/threat-model.md`, `docs/engineering-checklist.md` (live checks).

## Known limitations
- **Alarms when the app is closed** use Web Push: Android and desktop browsers receive them while the browser may run
  in the background (strong battery savers can delay them); **iPhone only after "Add to Home Screen"** (iOS 16.4+).
  Without push permission, alarms ring only while the app is open.
- A dose is pushed within about a minute; a missed push is not retried after 10 minutes.
- **AI output can be wrong:** every prescription extraction is reviewed by the user, unclear lines ask for a
  pharmacist, and alternatives always say "needs doctor verification". The app does not replace a doctor.
- **Voice call transcripts** arrive in Hindi script from the speech service and are converted to Urdu script by
  rules, so some spellings can be off. Urdu translations of the interface are machine-assisted.
- **Bounced sign-up emails** are detected for about a minute after sending; a later bounce simply means the code
  never arrives (no account is created).
- **Safety flags on confirm** are re-checked from the text the browser sends back (images are never stored), so a
  modified client could remove a "pharmacist" flag.
- **Logout is client-side:** a copied token stays valid until it expires, unless the password is reset.
- Rate-limit counters are in memory on a single instance and reset on redeploy (login and invite locks live in
  MongoDB).
- **Data sent to AI providers:** prescription photos (re-encoded, metadata removed) and check-in text go to the
  Gemini API, and to Groq or OpenRouter only if Gemini fails. Free tiers of these services may log inputs.

## Dependencies & external services (disclosure)
**External services:** MongoDB Atlas, Render, Vercel, UptimeRobot (pings `/health` every 5 minutes so the free Render
server stays awake; it sees no user data), Gemini API (primary), Groq and OpenRouter (fallback LLM providers, used
only when Gemini is rate-limited or down), Vapi (live voice call; Deepgram speech-to-text inside Vapi), Brevo (sends
the 6-digit sign-up, verification and password-reset codes; receives only the recipient address and the code),
dawaai.pk and Google (only as links the user opens to check prices; nothing is fetched or scraped), browser Web
Speech API, Notification API and Push API (Web Push goes through the browser's own push service: Google FCM, Mozilla,
Apple or Microsoft; payloads are encrypted and contain no symptoms).

**Backend (Python):** fastapi, starlette, uvicorn, pydantic, pydantic-settings, email-validator, pymongo, dnspython
(MX check of sign-up email domains), PyJWT, bcrypt, openai (used only as an OpenAI-compatible HTTP client), httpx,
slowapi, pillow, tzdata, pywebpush + py-vapid + http_ece + cryptography + aiohttp + requests (Web Push encryption,
VAPID signing, delivery). Dev: pytest, pytest-asyncio, mongomock-motor, ruff, pip-audit. CI: GitHub Actions, gitleaks.

**Frontend (npm):** react, react-dom, react-router-dom, recharts, @vapi-ai/web (Vapi Web SDK; uses Daily.co WebRTC,
which also contacts Daily's region service prod-ks.pluot.blue), @fontsource/atkinson-hyperlegible,
@fontsource/fraunces, @fontsource/anton, @fontsource/yellowtail, @fontsource/noto-nastaliq-urdu (Noto Nastaliq Urdu,
OFL-1.1) (all fonts self-hosted), tailwindcss + @tailwindcss/vite (utility CSS, no preflight), motion (animations;
design inspired by Aceternity UI / 21st.dev, rebuilt in-house, no copied components). Dev: vite,
@vitejs/plugin-react, eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, globals.

**Development tools:** Claude Code (AI pair programmer), plus a few instruction-only agent/skill files adapted from
`affaan-m/everything-claude-code` (MIT; see `.claude/ECC-LICENSE`).
