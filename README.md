# Sehat Saathi

> **Prototype — not for real patient data.** Tested only with fake / self-made prescriptions.
> Hackathon entry (Capital Youth Expo, Healthcare track). Started Thursday Nov 26, 2026 · submitted Saturday Nov 28, 2026.

A mobile-first web companion for elderly people in Pakistan. Elders photograph a prescription; an AI reads it,
the elder confirms it, and the app reminds them to take each dose. A daily Roman Urdu check-in logs how they feel,
and family members or doctors see a read-only dashboard.

*(Full README — problem, features, architecture, screenshots and demo — is completed in Phase 5. See `docs/ROADMAP.md`.)*

## Run locally

### Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt      # Windows (use .venv/bin/ on macOS/Linux)
cp .env.example .env                                   # fill MONGODB_URI and JWT_SECRET
.venv/Scripts/python -m uvicorn --factory app.main:app_factory --reload
.venv/Scripts/python -m pytest                                 # tests run fully offline (PROVIDER=fake, mock DB)
```
API docs (dev only): http://127.0.0.1:8000/docs

### Frontend (React + Vite)
```bash
cd frontend
npm ci
cp .env.example .env.local      # VITE_API_URL=http://127.0.0.1:8000
npm run dev                     # http://localhost:5173
```

### Switching the LLM provider
All LLM calls go through `backend/app/llm/`. Change only env vars:
- `PROVIDER=fake` → offline deterministic responses (default until a key is set)
- `PROVIDER=gemini` + `VISION_*` and `TEXT_*` (base URL, API key, model, JSON mode) → Gemini's OpenAI-compatible API
- `TEXT_PROVIDER=groq|openrouter|deepseek|...` with `TEXT_BASE_URL/TEXT_API_KEY/TEXT_MODEL` to use another text model

## Deployment notes
- **Backend → Render** (`render.yaml`). Secrets are set in the Render dashboard, never in git.
- **MongoDB Atlas Network Access must allow `0.0.0.0/0`**, because Render's free tier has no static outbound IP.
  Compensating controls: a dedicated database user with `readWrite` on the `sehat_saathi` database only, a long
  generated password, TLS-only connections.

## Security trade-offs (documented)
- **Token lifetime:** elder tokens last 7 days so the in-app reminder engine keeps working without re-login;
  family/doctor tokens last 12 hours. No refresh tokens in this MVP. Tokens are kept in `localStorage`
  (frontend and API are on different domains); mitigated by a strict CSP and no raw-HTML rendering.
- **Rate limits:** per-IP and per-user limits are in-memory (single Render instance) and reset when the service
  restarts or redeploys. The per-email login lock (10 failures → 15 min) and the per-account invite lock live in
  MongoDB and survive restarts. Global caps protect registration, invite redemption and the shared LLM quota.
- **Invite codes** work once and expire after 24 h. An elder can remove every linked family member/doctor at any
  time ("Sab ki ijazat khatam karein"); access ends on their next request.

A full independent audit with every finding and its status is in `docs/security/audit-findings.md`
(threat model: `docs/security/threat-model.md`; per-endpoint status: `docs/security-checklist.md`).

## Known limitations
- **Alarms when the app is closed** use Web Push: Android Chrome/Edge/Firefox and desktop browsers receive them while
  the browser is installed and allowed to run (aggressive battery savers can delay them); **iPhone only after "Add to
  Home Screen"** (iOS 16.4+). Without push (not enabled, or permission denied) alarms only fire while the app is open.
- Push timing depends on the server being awake (free Render tier + uptime monitor) and on the browser's push service;
  a dose is pushed within ~1 minute, and a missed push is not retried after 10 minutes.
- Render free tier sleeps when idle; the first request can take ~50 seconds.
- AI output can be wrong — every extraction is reviewed by a human, and low confidence shows
  "please confirm with a pharmacist".
- **Safety flags come back from the browser.** Prescription images are never stored, so on "confirm" the server
  re-checks the pharmacist flag and "D/c" (stopped) markers from the text the browser sends back. A modified client
  (or the elder editing the line) could remove them. Re-activating a stopped order still creates home reminders.
- **Check-in replies** are kept to general wellness by the AI prompt; there is no separate code filter yet.
- **Voice check-in transcripts** are reported by the browser and not verified with Vapi.
- **No logout on the server:** "logout" clears the browser; a copied token stays valid until it expires (7 days for elders).
- **Data writes** (confirming medicines, vitals) have no rate limit; no account deletion, data export or retention policy.
- **Data sent to AI providers:** prescription photos (re-encoded, metadata stripped) and check-in text are sent to the
  Gemini API, and to Groq or OpenRouter only when Gemini fails. Free tiers may log or use inputs to improve their
  products (OpenRouter's free models in particular). Use fake data only.

## Dependencies & external services (disclosure)
**External services:** MongoDB Atlas, Render, Vercel, UptimeRobot (pings `/health` every 5 min to keep the free Render server awake; it sees no user data), Gemini API (primary), Groq and OpenRouter (optional fallback LLM providers, used only when Gemini is rate-limited or down), Vapi (voice, planned),
browser Web Speech API, Notification API and Push API (Web Push is delivered through the browser's own push service:
Google FCM, Mozilla, Apple or Microsoft; payloads are end-to-end encrypted and contain no symptoms).

**Backend (Python):** fastapi, starlette, uvicorn, pydantic, pydantic-settings, email-validator, pymongo, PyJWT, bcrypt,
openai (used only as an OpenAI-compatible HTTP client), httpx, slowapi, pillow, tzdata,
pywebpush + py-vapid + http_ece + cryptography + aiohttp + requests (Web Push encryption, VAPID signing, delivery).
Dev: pytest, pytest-asyncio, mongomock-motor, ruff, pip-audit. CI: GitHub Actions, gitleaks.

**Frontend (npm):** react, react-dom, react-router-dom, recharts, @vapi-ai/web (Vapi Web SDK; uses Daily.co WebRTC),
@fontsource/atkinson-hyperlegible (self-hosted font). Dev: vite, @vitejs/plugin-react, eslint, @eslint/js,
eslint-plugin-react, eslint-plugin-react-hooks, globals.

## Demo data
`cd backend && .venv/Scripts/python -m scripts.seed_demo` creates a linked demo elder, family member and doctor
with 14 days of FAKE history (`--reset` recreates them). The password is printed once (or set `SEED_PASSWORD`).
No demo password is stored in this repository: the seed script reads `SEED_PASSWORD` from the environment or
generates one and prints it once.

**Demo accounts for judges (fake data only):** `demo.elder@sehatsaathi.example`,
`demo.family@sehatsaathi.example`, `demo.doctor@sehatsaathi.example`. The password is given in the submission
form, not here.
