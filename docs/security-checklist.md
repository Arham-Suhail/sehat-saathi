# Security checklist

Every endpoint must have: schema limits → role/ownership dependency → rate limit (if LLM/auth) → IDOR test → an entry here.
Ownership is enforced **in the Mongo query itself** (`elder_id` filter), so another user's object is a 404, never a leak.

## Endpoint inventory

| Endpoint | Role / access | Ownership enforcement | Rate limit | Cross-user test |
|---|---|---|---|---|
| `POST /auth/register` | public | — | 3/min, 20/h per IP | `test_auth.py` (generic errors) |
| `POST /auth/login` | public | — | 5/min, 20/h per IP | `test_auth.py` (generic errors) |
| `GET /me` | any logged-in | own user only | — | `test_auth.py` |
| `POST /prescriptions/extract` | elder | no DB access; image in memory only | LLM 10/min, 60/day per user | `test_uploads.py`, `test_idor.py` (carer → 403) |
| `GET /medicines/schedule-options` | any logged-in | static data | — | — |
| `POST /medicines/confirm` | elder | writes with caller's `elder_id` | — | `test_idor.py::test_carers_cannot_use_elder_only_write_endpoints` |
| `GET /medicines?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)` | — | `test_idor.py::test_unlinked_carer_forbidden_linked_carer_reads` |
| `POST /medicines/{id}/stop` | elder | `{_id, elder_id: caller}` | — | `test_idor.py::test_elder_cannot_touch_other_elders_medicine_or_reminders` |
| `GET /medicines/{id}/alternatives` | elder / linked carer | `elder_id ∈ allowed_elder_ids(user)` | LLM 10/min, 60/day per user | `test_features.py::test_alternatives_labelled_and_owned` |
| `GET /reminders/upcoming` | elder | caller's `elder_id` | — | `test_idor.py` |
| `POST /reminders/{id}/{taken\|skipped}` | elder | `{_id, elder_id: caller}`, not > 1 h in future | — | `test_idor.py::test_elder_cannot_touch_other_elders_medicine_or_reminders` |
| `POST /checkins/text` | elder | caller's `elder_id` | LLM 10/min, 60/day per user | `test_features.py`, `test_injection.py` |
| `POST /checkins/voice` | elder | caller's `elder_id` | LLM 10/min, 60/day per user | `test_features.py` |
| `GET /checkins?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)` | — | `test_idor.py` |
| `POST /vitals` | elder (self) / linked family | `resolve_elder_access(write)`; doctors read-only | — | `test_features.py::test_vitals_permissions` (unlinked family 403, doctor 403) |
| `GET /vitals?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)` | — | `test_features.py::test_vitals_permissions` |
| `POST /invites` | elder | caller's own code (regenerates) | — | `test_features.py::test_invite_roles` |
| `POST /invites/redeem` | family / doctor | links caller only | 5/15 min per IP + per-account lockout (5 wrong → 30 min) | `test_features.py::test_invite_lockout_after_wrong_codes`, `test_redeem_ip_rate_limit` |
| `GET /carer/elders` | family / doctor | caller's links only | — | `test_features.py` |
| `GET /dashboard/{elder_id}` | elder (self) / linked carer | `resolve_elder_access(read)` | — | `test_features.py::test_dashboard_shape_and_access` (unlinked 403, bad id 404) |
| `GET /health` | public | no data | — | `test_security_headers.py` |

## Cross-cutting controls (verified by tests or config)

- **Secrets / startup:** app refuses to start without required secrets or with a JWT secret < 32 chars / known default — `test_config_failfast.py`. `.env` gitignored; `.env.example` placeholders only.
- **Tokens:** bcrypt password hashes; JWT elder 7 days, family/doctor 12 h, no refresh tokens (trade-off in README).
- **Input:** Pydantic models with length limits and `extra="forbid"`; ids via `parse_object_id` (bad id → 404) — `test_idor.py::test_invalid_and_missing_ids`, `test_confirm_validation`.
- **Uploads:** JPEG/PNG/WebP only, magic-byte sniff, ≤ 5 MB, 40 MP decompression-bomb guard, Pillow re-encode (strips metadata), memory only — `test_uploads.py`.
- **LLM output:** schema-validated, length-capped, retried once then friendly error; rendered as text only; user content wrapped as data (`wrap_user_message`) — `test_llm.py`, `test_injection.py`.
- **Medical safety in code:** `needs_pharmacist` enforced in code, IV/PRN/D/c never generate reminders, `concern_flag` = LLM OR keyword match — `test_schedule.py`, `test_concern.py`, `test_extraction_regression.py`.
- **Errors / logs:** no stack traces in responses; logs redact passwords, tokens, prescription text and transcripts.
- **API headers + CORS:** security-header middleware and explicit CORS allowlist from env, no wildcard — `test_security_headers.py`.
- **Web headers (`frontend/vercel.json`):** CSP (self + Render API + Vapi/Daily only, `frame-ancestors 'none'`, `object-src 'none'`), nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy `microphone=(self)`, HSTS, COOP.
- **Frontend:** no `dangerouslySetInnerHTML` (ESLint rule); only `VITE_API_URL`, Vapi public key and assistant id are exposed.
- **CI (every push):** ruff lint + format, pytest (`PROVIDER=fake`), pip-audit, frontend lint/build + npm audit, gitleaks over full history.

## Accepted risks

- **Atlas Network Access 0.0.0.0/0** (Render free tier has no static IP). Compensating: dedicated `readWrite` user on one DB, long generated password, TLS only.
- **Tokens in `localStorage`** (API and web on different domains). Compensating: strict CSP, no raw-HTML rendering.
- **In-memory rate limits** reset on restart (single Render instance).

## Phase 4 (Saturday) — still to do

- [ ] Live security run against Render/Vercel URLs (cross-user requests, headers via curl)
- [ ] `pip-audit` + `npm audit` clean on final lockfiles
- [ ] gitleaks over full history before the final push
