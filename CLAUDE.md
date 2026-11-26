# Sehat Saathi

## Summary
1. Sehat Saathi is a mobile-first web app helping elderly people in Pakistan manage medicines and wellbeing.
2. Hackathon (Capital Youth Expo, Healthcare). Solo dev. Started Thu Nov 26 2026; deadline Sat Nov 28, 11:59 PM; freeze Sat 6 PM; submit by 9 PM.
3. Elders photograph a prescription; a vision LLM transcribes medicines, dose and timing with per-item confidence.
4. The user reviews and edits the extraction before saving; reminders are generated from confirmed medicines.
5. Reminders show as in-app alerts while the app is open and as **Web Push** notifications when it is closed
   (optional: needs VAPID_* keys); elder marks taken or skipped. A flagged check-in sends a generic Web Push alert to the
   elder's currently linked family/doctors. Push endpoints are allowlisted (FCM, Mozilla, Apple, Windows) to prevent SSRF.
6. A daily Roman Urdu check-in ("Aaj aap kaisa mehsoos kar rahe hain?") via text, Web Speech (hi-IN) or Vapi voice (Deepgram `hi`).
   Speech-to-text returns Hindi script; `services/translit.py` / `src/i18n/translit.js` (shared vectors in
   `shared/translit-vectors.json`) turn it into Roman Urdu. The app only ever shows Roman Urdu; concern keywords
   also cover Hindi and Urdu script.
7. AI replies briefly with one general wellness tip, logs mood (good/okay/low); symptoms → "doctor se baat karein" + flag.
8. Family and doctors link to an elder with a 6-digit invite code and see a read-only dashboard.
9. Dashboard: check-in timeline, mood trend, taken vs missed doses, manually entered vitals (BP, sugar, heart rate).
10. Cheaper generic alternatives are LLM-suggested and always labelled "needs doctor verification".

## Build stages (see docs/ROADMAP.md)
- **Stage A (DONE: user confirmed "STABLE REACHED" on Nov 27; git tag `stage-a-stable`): stable, deployed, plain-UI core app.** `/` = app name + one-line tagline + Login/Register. Atkinson Hyperlegible only. Neutral placeholder palette in `theme.css`. CheckIn screen has a plain text bubble area and a marked `CHOTU PLACEHOLDER` box. Vapi via a plain button (hidden if not configured).
- **Do NOT build in Stage A:** display-font hero (Fraunces/Anton/Yellowtail), Gallery3D, Chotu mascot (ChotuAgent/ChotuBoundary) and animations, decorative gradients/grain/flourishes.
- **Stage B (CURRENT since Nov 27; only after the user confirms "STABLE REACHED"):** the polish pass, driven by separate user prompts.
- Then Phase 4 (audit) and Phase 5 (README, video, submission). Cut order: Gallery3D → hero Chotu → Chotu animations → Vapi → alternatives LLM polish → Web Speech (text check-in is never cut).

## Stack
- Frontend: React + Vite, react-router-dom, Recharts, plain CSS + (Stage B, user decision Nov 27) Tailwind CSS v4 and
  Motion, @vapi-ai/web → Vercel. Tailwind is loaded WITHOUT preflight via `src/styles/index.css` (cascade layers:
  legacy plain CSS < Tailwind utilities), its default colours are removed and mapped to theme.css variables, so
  colours still live only in theme.css. Stage A screens use the legacy classes; new UI may use utilities.
- Backend: FastAPI (Python 3.12 on Render), Pydantic v2 (pinned 2.12.5: newer pydantic-core DLL is blocked by Windows App Control on the dev machine), PyMongo async client (Motor is deprecated), PyJWT + `bcrypt` package directly (no passlib) → Render free tier.
- DB: MongoDB Atlas M0.
- LLM: provider-agnostic module `backend/app/llm/`, OpenAI-compatible chat API. Default Gemini (free tier).
  Vision and text are configured separately via `VISION_*` / `TEXT_*` env vars. `PROVIDER=fake` for tests/dev without keys.
- Secrets only in `.env` (never committed); `.env.example` documents every variable.

## Commands
- Backend: `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt` · run `.venv/Scripts/python -m uvicorn --factory app.main:app_factory --reload` · test `.venv/Scripts/python -m pytest` · lint `.venv/Scripts/python -m ruff check .` (always `python -m`: Windows App Control blocks the venv .exe launchers)
- Frontend: `cd frontend && npm ci` · `npm run dev` · `npm run lint` · `npm run build`
- Run tests before every commit. Small commits; keep `main` deployable.

## Conventions
- All LLM calls go through `app/llm` (`get_vision()`, `get_text()`). No provider names, URLs, model IDs or SDK imports anywhere else.
- Every LLM response is parsed into a Pydantic model; on failure retry once, then return a friendly error.
- Prompts live in `app/llm/prompts.py`. Safety rules are stated in the prompt AND enforced in code.
- Extraction: the model transcribes VERBATIM only (original_text + raw fields); it never decides a schedule.
  `services/frequency.py` (pure, tested) translates bid/q6h/1+0+1/PO/IV/prn; code decides reminders:
  IV/IM/SC/infusion → hospital note (no reminders), PRN → none, D/c/discontinue/stop → status stopped
  (never reminders, active lists or adherence). `needs_pharmacist` is enforced in code (low confidence,
  missing name/strength/frequency, "..."/not-verbatim text, D/c, unknown abbreviations) and never auto-cleared.
- Any screen showing medical info renders `<Disclaimer />` ("verify with your doctor").
- Check-in tips are general wellness only — never condition-, symptom- or medicine-specific.
- `concern_flag` = LLM flag OR deterministic keyword match (`services/concern.py`, Roman Urdu + English). Never rely on the LLM alone.
- Prescription images are processed in memory and never stored. No extraction audit collection.
- UI is Roman Urdu only (`src/i18n/ur-roman.json`); base font ≥ 20px, tap targets ≥ 48px, WCAG AA contrast, one primary action per screen.
- Role/link checks via FastAPI dependencies (`require_role`, `resolve_elder_access`). Family may enter vitals for a linked elder; doctors are read-only.
- Store datetimes in UTC; times of day as "HH:MM" Asia/Karachi.
- Vapi is optional at runtime: hide the button if not configured; text/speech check-in must always work.
- Every new external API or library is added to the README disclosure list in the same commit.
- Test with fake/self-made prescriptions only. Never invent API keys or IDs; use `PROVIDER=fake` and seed data when real ones are missing.
- Spare time goes to quality (tests, mobile checks, security verification) — never new features.

## Design rules
- Colours ONLY as CSS variables in `frontend/src/styles/theme.css` (bg, surface, text, text-muted, accent, accent-text, success, warning, danger, border, focus). Never hardcode a colour elsewhere. Text contrast ≥ WCAG AA.
- Fonts self-hosted via @fontsource only (no Google Fonts requests). Stage A: Atkinson Hyperlegible only. Stage B adds Fraunces, Anton, Yellowtail.
- Display/script fonts (Stage B) ONLY for the landing hero and section headings. Never for medical info, medicine names or buttons.
- Mobile-first at 360px; check 360/390/768/1280/1440; no horizontal scroll; 48px+ targets; sticky bottom action bar on key elder screens; safe-area insets; `viewport-fit=cover`; no hover-only UI.
- Reusable components (BigButton, Disclaimer, PharmacistBanner, ServerWakingBanner, ReminderAlert, MoodChart, AdherenceBars, VitalsList) so Stage B only restyles them.
- Carer dashboard: single-column cards on mobile, multi-column grid on laptop; charts in ResponsiveContainer.
- (Stage B) Hero: serif "Aapki sehat," + huge tight caps "SAATHI" + serif tagline, clamp()-sized; CSS/SVG only, no heavy images.
- (Stage B) Mascot is named **Chotu** (app stays "Sehat Saathi"). `ChotuAgent` is pure SVG/CSS, animates transform/opacity only, one `state` prop (idle|listening|thinking|speaking|error), inside `ChotuBoundary`; the text check-in must work if Chotu or Vapi fails. Always show: "Chotu ek AI sahayak hai, doctor nahi. Dawai ke baare mein apne doctor se poochein." Never shows a diagnosis or dosage.
- (Stage B) `Gallery3D`: plain React + CSS 3D + Pointer Events, no libraries; transform/opacity only; `touch-action: pan-y`; pause off-screen; reduced-motion → scroll-snap strip; local WebP < 150 KB.

## Security rules (non-negotiable)
- No secret committed, logged or sent to the browser. `.env` gitignored; `.env.example` placeholders only. gitleaks in CI + over full history before final push.
- `VITE_*` is public: only API URL, Vapi PUBLIC key, assistant ID. LLM keys, DB URI, JWT secret, Vapi private key → backend env only.
- Startup fails if a required secret is missing or JWT_SECRET is < 32 chars / a known default.
- bcrypt passwords. JWT lifetime by role: **elder 7 days** (reminder engine needs the elder logged in), **family/doctor 12 hours**; no refresh tokens. Trade-off documented in README + docs/security-checklist.md.
- Generic login/register errors (never reveal if an email exists).
- Rate limit login, register, invite redeem and every LLM endpoint; lock invite redeem after 5 wrong codes (30 min).
- Every endpoint enforces role AND ownership/link server-side via `require_role` + `resolve_elder_access`. Every query filters by `elder_id`. Cross-user access must be covered by tests (403/404).
- Pydantic everywhere with length limits and `extra="forbid"`; ids via `parse_object_id`; never pass raw user dicts into Mongo queries.
- Uploads: JPEG/PNG/WebP only, magic-byte check, ≤ 5 MB, Pillow re-encode, memory only, never written to disk or logged.
- LLM output is untrusted: schema-validate, length-cap, render as text only, never execute, never let it shape queries. Image/message content is data, never instructions.
- CORS: explicit allowlist from env, no wildcard. Security headers on API (middleware) and web (vercel.json): CSP, nosniff, Referrer-Policy, frame-ancestors none, Permissions-Policy microphone=(self).
- No `dangerouslySetInnerHTML` (lint-enforced).
- Errors never expose stack traces/internals. Logs never contain passwords, tokens, prescription text or transcripts.
- Atlas: dedicated readWrite-on-one-DB user, strong generated password; Network Access 0.0.0.0/0 (Render has no static IP) documented with these compensating controls.
- Pin all deps; pip-audit + npm audit (fix high/critical); CI runs tests (PROVIDER=fake), lint, build, audits, gitleaks on every push.
- New endpoint checklist: schema limits → role/ownership dependency → rate limit if LLM/auth → IDOR test → docs/security-checklist.md entry.

## Out of scope — do NOT build
- Smartwatch / wearable / Bluetooth device integration (vitals are manual entry only).
- Native mobile app.
- OAuth, OTP, email verification, password reset emails.
- Payments or subscriptions.
- Scraping of pharmacy or price sites (alternatives are LLM-suggested only).
- Native push SDKs (FCM/APNs) and native background alarms. (Web Push for closed-tab dose alarms and concern alerts
  was moved INTO scope on Nov 26 at the user's request; iPhone needs the app added to the Home Screen.)
- AI-generated dosages, diagnoses, treatment plans or condition-specific medical advice.
- Phone-number calling (Vapi is browser Web SDK only).
- Stage B polish items before the user confirms Stage A is stable.
- Anything not on the MVP list before the core is deployed and stable.
