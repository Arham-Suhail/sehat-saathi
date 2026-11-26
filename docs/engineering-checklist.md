# Engineering checklist

Status legend: **DONE** (with proof) · **MINIMAL** (smaller version, reason given) · **NOT NEEDED** (reason given) ·
**PENDING** (still to do; owner noted). Based on the playbook's pre-launch checklist (Appendix B), adapted to a
hackathon prototype with fake data. Security details: `docs/security-checklist.md`.

| Item | Status | Reason / proof |
|---|---|---|
| Cross-tenant (cross-elder) access tested and blocked | DONE | `tests/test_isolation.py`, `tests/test_idor.py`; live: A→B medicine id 404, A/doctor→B dashboard 403 (run of Nov 26, below) |
| Auth without custom crypto | DONE | `bcrypt` (12 rounds) + PyJWT HS256; no hand-rolled hashing. Not a hosted provider (OAuth/OTP out of scope) |
| Every endpoint validates input and checks permissions server-side | DONE | Pydantic `extra="forbid"` models; `require_role` / `resolve_elder_access`; `test_injection.py`, `test_idor.py` |
| Payments | NOT NEEDED | no payments (out of scope) |
| CI blocks on failing tests/lint/audit/secrets | DONE | `.github/workflows/ci.yml`: ruff, pytest, pip-audit, eslint, build, npm audit, gitleaks (full history) |
| Production rollback | MINIMAL | Render/Vercel "redeploy previous deploy" from their dashboards; no written runbook |
| End-to-end browser tests | MINIMAL | API integration tests (179) cover the flows; no Playwright (time) |
| Separate staging and production | MINIMAL | local (`PROVIDER=fake`, mongomock) vs production only |
| Backups tested | NOT NEEDED | fake data only; Atlas M0 has no restore SLA |
| Dependencies audited | DONE | `pip-audit`: "No known vulnerabilities found"; `npm audit`: "found 0 vulnerabilities" (prod and dev) |
| Rate limits on login, signup, expensive endpoints | DONE | per IP + per email + global; LLM per user + global; live: 20 rapid logins → 429 from #4 |
| No private data cached at shared layers | DONE | API sends `Cache-Control: no-store` on every response (live `curl -I`); alternatives cache key = medicine name + strength only |
| Structured, redacted logs | DONE (code) / PENDING (prod grep) | JSON logs, path-only, redaction filter; production log grep needs the Render dashboard (owner: you) |
| Uptime checks / alerts | NOT NEEDED | prototype; `/health` exists for Render's health check |
| Load test | NOT NEEDED | single free instance; abuse limits tested instead |
| Billing alerts | NOT NEEDED | all services on free tiers |
| Terms / privacy policy | MINIMAL | README states prototype + fake data only + what goes to Gemini |
| Real-device checks (Android Chrome: reminders, notifications, Web Speech) | PENDING | owner: you (see `docs/ROADMAP.md`) |

## Live attack checks: Thu Nov 26 2026, after deploying `d36f4c0`

Run against `https://sehat-saathi-api.onrender.com` and `https://sehat-saathi-delta.vercel.app`, with three fake test accounts.

| Check | Expected | Result |
|---|---|---|
| Elder A stops elder B's medicine id | 404 | **404** `Nahi mila` |
| Elder A asks alternatives for B's medicine | 404 | **404** |
| Elder A / unlinked doctor reads B's dashboard or vitals (`elder_id`) | 403/404 | **403** `Ijazat nahi` (an elder id in the path is 403 by design; object ids are 404) |
| Doctor `POST /vitals` for a linked elder | 403 | **403** |
| Doctor `POST /medicines/confirm`, `POST /invites/revoke-all` | 403 | **403**, **403** |
| Garbage JSON body | clean 4xx, no stack trace | **422** `{"detail":"Maloomat sahi nahi hai","fields":["1"]}` (FastAPI reports body decode errors as 422, not 400) |
| NoSQL operator payload on login | 422 | **422** (`fields: email, password`) |
| 6 MB upload | rejected | **413** |
| PDF renamed to .jpg (sent as `image/jpeg`) | rejected | **415** `Yeh sahi tasveer nahi hai` |
| Text file | rejected | **415** |
| Wrong password vs non-existent email | identical | both **401** `Email ya password ghalat hai` |
| 20 rapid logins | 429 | `401 ×3` then **429 ×17** |
| F1: rotating spoofed `X-Forwarded-For` (same real IP) | 429 | **429 ×8** (before the fix: `401 ×7`) |
| F1: client-sent `CF-Connecting-IP` | not trusted | Cloudflare rejects the request (**403**, error 1000), so it can't be forged |
| `curl -I` API | security headers | CSP `default-src 'none'`, HSTS, nosniff, DENY, `no-store`, COOP/CORP |
| `curl -I` web | security headers | CSP (no `unsafe-eval`), HSTS, nosniff, DENY, Permissions-Policy `microphone=(self)` |
| `<script>` / `<img onerror>` / `<svg onload>` in name, medicine name, strength, instructions, vitals note, check-in | stored as text, never executed | API returns them verbatim as JSON strings (`application/json`, nosniff, CSP `default-src 'none'`); the frontend renders them only as JSX text (no raw-HTML sinks; `react/no-danger`). **Browser check DONE (Nov 27):** live doctor dashboard and elder home rendered in headless Chrome; every payload (`<script>alert(1)</script>` name, `<img onerror>` medicine, `<script>` strength and check-in) shows as literal text; nothing executed |
| Production logs contain no passwords/tokens/emails | none | **PENDING (owner: you)**: needs the Render dashboard |
