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
- **Rate limits** are in-memory (single Render instance) and reset when the service restarts.

## Known limitations
- Reminders and notifications only fire while the app is open in a browser tab.
- Render free tier sleeps when idle; the first request can take ~50 seconds.
- AI output can be wrong — every extraction is reviewed by a human, and low confidence shows
  "please confirm with a pharmacist".

## Dependencies & external services (disclosure)
**External services:** MongoDB Atlas, Render, Vercel, Gemini API (or another OpenAI-compatible provider), Vapi (voice, planned),
browser Web Speech API and Notification API.

**Backend (Python):** fastapi, starlette, uvicorn, pydantic, pydantic-settings, email-validator, pymongo, PyJWT, bcrypt,
openai (used only as an OpenAI-compatible HTTP client), httpx, slowapi, pillow, tzdata.
Dev: pytest, pytest-asyncio, mongomock-motor, ruff, pip-audit. CI: GitHub Actions, gitleaks.
