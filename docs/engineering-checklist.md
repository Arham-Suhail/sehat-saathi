# Engineering checklist

Status legend: **DONE** (with proof) · **MINIMAL** (smaller version, reason given) · **NOT NEEDED** (reason given) ·
**PENDING** (still to do; owner noted). Based on the playbook's pre-launch checklist (Appendix B), adapted to a
hackathon build. Security details: `docs/security-checklist.md`.

| Item | Status | Reason / proof |
|---|---|---|
| Cross-tenant (cross-elder) access tested and blocked | DONE | `tests/test_isolation.py`, `tests/test_idor.py`; live: A→B medicine id 404, A/doctor→B dashboard 403 (run of Nov 26, below) |
| Auth without custom crypto | DONE | `bcrypt` (12 rounds) + PyJWT HS256; no hand-rolled hashing. Email codes (sign-up, verify, reset) via Brevo: HMAC-stored, single use, 15 min, 5 tries; a reset bumps `token_version` (old JWTs 401) |
| Every endpoint validates input and checks permissions server-side | DONE | Pydantic `extra="forbid"` models; `require_role` / `resolve_elder_access`; `test_injection.py`, `test_idor.py` |
| Payments | NOT NEEDED | no payments (out of scope) |
| CI blocks on failing tests/lint/audit/secrets | DONE | `.github/workflows/ci.yml`: ruff, pytest, pip-audit, eslint, build, npm audit, gitleaks (full history) |
| Production rollback | MINIMAL | Render/Vercel "redeploy previous deploy" from their dashboards; no written runbook |
| End-to-end browser tests | MINIMAL | 284 backend + 39 frontend tests; key flows driven in headless Chrome over CDP during development (sign-up with code, bounce, delete account, edit alarm, alternatives, tabs, paste); no committed Playwright suite (time) |
| Separate staging and production | MINIMAL | local (`PROVIDER=fake`, mongomock) vs production only |
| Backups tested | MINIMAL | Atlas M0 has no restore SLA; users can delete their own account (data removed) |
| Dependencies audited | DONE | `pip-audit`: "No known vulnerabilities found"; `npm audit`: "found 0 vulnerabilities" (prod and dev) |
| Rate limits on login, signup, expensive endpoints | DONE | per IP + per email + global; LLM per user + global; live: 20 rapid logins → 429 from #4 |
| No private data cached at shared layers | DONE | API sends `Cache-Control: no-store` on every response (live `curl -I`); alternatives cache key = medicine name + strength only |
| Structured, redacted logs | DONE (code) / PENDING (prod grep) | JSON logs, path-only, redaction filter; production log grep needs the Render dashboard (owner: you) |
| Uptime checks / alerts | DONE | UptimeRobot pings `/health` every 5 min (keeps the free instance awake and alerts on downtime) |
| Load test | NOT NEEDED | single free instance; abuse limits tested instead |
| Billing alerts | NOT NEEDED | all services on free tiers |
| Terms / privacy policy | MINIMAL | README discloses every external service and what goes to the AI providers; in-app "does not replace a doctor"; account deletion |
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


## Live checks: Fri Nov 27 2026, after deploying `4ad7204` (Render + Vercel)

All requests below were safe probes: unauthenticated, malformed or refused, and no email was sent to anyone.

| Check | Result |
|---|---|
| API security headers (`/health`) | CSP `default-src 'none'; frame-ancestors 'none'`, HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, Permissions-Policy |
| Web security headers (`/`) | CSP (self + Daily/Vapi only), HSTS, `nosniff`, `DENY`, Permissions-Policy `microphone=(self)` |
| CORS with `Origin: https://evil.example` | no `Access-Control-Allow-Origin` (allowlist only) |
| Debug / API docs in production | `/docs`, `/redoc`, `/openapi.json`, `/debug`, `/.env` on the API → 404 |
| Exposed files on the website | `/.env`, `/.git/config`, `/package.json` → the SPA's own `index.html` (no file content); `*.js.map` → 404, no `sourceMappingURL` |
| New private endpoints without login | `GET/PUT/DELETE /emergency-contact`, `POST /me/delete`, `PATCH /medicines/{id}`, `POST /me/verify-email(/send)`, `GET /medicines/{id}/alternatives`, `GET /dashboard/{id}` → all 401 |
| Forged JWT (`alg: none`) | 401 |
| Sign-up with a made-up domain | 400 before any email is sent (MX check) |
| One-step register while email is on | 400 (sign-up must go through the emailed code) |
| NoSQL operator payloads (`{"$ne": null}`, `{"$gt": ""}`) on login / reset | 422 |
| Malformed JSON | generic 422 body, no stack trace |
| Rate limit, `/auth/password/forgot` (unknown email) | `204 204 204 429 429` |

Cross-user (IDOR) behaviour of the new endpoints is covered by tests (`test_emergency.py`, `test_medicine_edit.py`,
`test_account_delete.py`, `test_signup.py`, `test_email_codes.py`); it was not re-run live because new accounts now
need a real mailbox.

## Pre-launch security list (18 points) — status

| Point | Status | Proof |
|---|---|---|
| Hide API keys | DONE | backend env only; `VITE_*` = public values; gitleaks in CI |
| Check env variables | DONE | startup refuses missing / weak secrets and half-set pairs (`app/config.py`); `.env.example` documents all |
| Protect admin routes | NOT NEEDED | no admin routes exist; every route needs role + ownership |
| Proper authentication | DONE | bcrypt, JWT per role, emailed sign-up code, password reset ends old sessions |
| Users access own data | DONE | `require_role` + `resolve_elder_access`; IDOR + content-isolation tests |
| Sanitize forms | DONE | Pydantic `extra="forbid"` + length limits everywhere; uploads re-encoded |
| Block XSS | DONE | React text rendering only, `dangerouslySetInnerHTML` lint-banned, strict CSP; stored-XSS check on the live dashboard (Nov 26) |
| Rate limiting | DONE | live: forgot-password `204×3 → 429` |
| Check CORS settings | DONE | explicit allowlist; evil origin gets no ACAO (live) |
| Security headers | DONE | live headers above |
| Debug mode | DONE | prod: no `/docs`, `/openapi.json`; no `debug=True`; errors without internals |
| Update dependencies | DONE | pinned; `pip-audit` + `npm audit` in CI on every push (green) |
| Unused packages | DONE | every npm dependency is imported; Python packages without a direct import are runtime needs (uvicorn server, email-validator for `EmailStr`, tzdata, Web Push deps) |
| Check exposed files | DONE | live checks above |
| Secure database | DONE | dedicated readWrite user on one DB, TLS, `0.0.0.0/0` documented with compensating controls; no raw user dicts in queries |
| Hash passwords | DONE | bcrypt (12 rounds); codes stored as HMAC only |
| Secrets in git history | DONE | gitleaks over the full history on every push |
| Full security audit | DONE | `docs/security/audit-findings.md` + this file + `docs/security-checklist.md` |

### Tools suggested by the team
| Tool | Used? | Why |
|---|---|---|
| OWASP ZAP (web/API scanner) | PENDING (owner: you) | Fits this app. Not run from the dev laptop: Docker Desktop needs ~2 GB free RAM. Baseline (passive) scan command below. |
| MobSF (Android/iOS app scanner) | NOT NEEDED | Sehat Saathi has no native APK/IPA (web app + PWA only), so there is nothing for MobSF to analyse. |
| SafeLine WAF | NOT NEEDED | Self-hosted reverse proxy that needs its own Linux server in front of the app; the API runs on Render and the site on Vercel (managed, HTTPS edge), and app-level rate limits, validation and headers are in place. |

ZAP baseline scan (passive, safe for production), when Docker has memory:
```bash
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://sehat-saathi-delta.vercel.app
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://sehat-saathi-api.onrender.com/health
```
