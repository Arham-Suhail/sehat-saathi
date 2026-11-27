# Security checklist

Every endpoint must have: schema limits → role/ownership dependency → rate limit (if LLM/auth) → IDOR test → an entry here.
Ownership is enforced **in the Mongo query itself** (`elder_id` filter), so another user's object is a 404 (or 403 for an
unlinked `elder_id`), never a leak. Finding ids (F#) refer to `docs/security/audit-findings.md`.

Status legend: **DONE** = implemented and proven by the named test/command · **MINIMAL** = a deliberate, smaller
version (reason given) · **NOT NEEDED** = does not apply (reason given). Anything not fixed is under *Known limitations*.

## Endpoint inventory

"Content isolation" = a test seeds two elders and asserts none of elder B's data appears in the response
(`tests/test_isolation.py`, added for F4). Before F4, the 403 gate was tested but content isolation was not.

| Endpoint | Role / access | Ownership enforcement | Rate limit | Proving tests |
|---|---|---|---|---|
| `POST /auth/register` | public | — | 3/min + 20/h per client IP; **200/day global** | `test_auth.py::test_duplicate_register_is_generic`, `test_security_headers.py::test_rate_limit_register`, `test_audit_fixes.py::test_f1_global_register_cap_across_ips` |
| `POST /auth/login` | public | — | 5/min + 20/h per client IP; **10 fails → 15 min lock per email (any IP)** | `test_auth.py::test_login_errors_are_generic`, `test_security_headers.py::test_rate_limit_login`, `test_audit_fixes.py::test_f1_*` (7 tests) |
| `GET /me` | any logged-in | own user only | — | `test_auth.py::test_register_login_me` |
| `POST /prescriptions/extract` | elder | no DB access; image in memory only | 10/min + 60/day per user; **global LLM 20/min + 800/day** | `test_uploads.py`, `test_audit_fixes.py::test_f6_*`, `test_f7_*` |
| `GET /medicines/schedule-options` | any logged-in | static data | — | — |
| `POST /medicines/confirm` | elder | writes with caller's `elder_id` | — (F8, known limitation) | `test_idor.py::test_carers_cannot_use_elder_only_write_endpoints` |
| `GET /medicines?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)` + `elder_id` filter | — | `test_idor.py::test_unlinked_carer_forbidden_linked_carer_reads`; content isolation |
| `PATCH /medicines/{id}` | elder | `{_id, elder_id: caller}` (other elder 404, carers 403); only confirmed fixed-schedule meds; body `extra=forbid` (timings 1–6 HH:MM, dose ≤ 80, days 1–365; name/route not editable); replaces only future pending reminders | — | `test_medicine_edit.py` |
| `POST /medicines/{id}/stop` | elder | `{_id, elder_id: caller}` | — | `test_idor.py::test_elder_cannot_touch_other_elders_medicine_or_reminders` |
| `GET /medicines/{id}/alternatives` | elder / linked carer | `elder_id ∈ allowed_elder_ids(user)` | per user + global LLM | `test_features.py::test_alternatives_labelled_and_owned` |
| `GET /reminders/upcoming` | elder | caller's `elder_id` | — | content isolation |
| `POST /reminders/{id}/{taken\|skipped}` | elder | `{_id, elder_id: caller}`, not > 1 h in future | — | `test_idor.py::test_elder_cannot_touch_other_elders_medicine_or_reminders` |
| `POST /checkins/text` | elder | caller's `elder_id` | per user + global LLM | `test_features.py::test_text_checkin_keyword_fallback_sets_concern`, `test_injection.py`, `test_f7_*` |
| `POST /checkins/voice` | elder | caller's `elder_id` | per user + global LLM | `test_features.py::test_voice_checkin_transcript` |
| `GET /checkins?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)` + `elder_id` filter | — | `test_features.py::test_checkin_list_access`; content isolation |
| `POST /vitals` | elder (self) / linked family | `resolve_elder_access(write)`; doctors 403 | — | `test_features.py::test_vitals_permissions` |
| `GET /vitals?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)` + `elder_id` filter | — | `test_features.py::test_vitals_permissions`; content isolation |
| `POST /invites` | elder | caller's own code (replaces the unused one) | — | `test_features.py::test_invite_roles`, `test_invite_flow_and_regenerate` |
| `POST /invites/redeem` | family / doctor | links caller only; **code single-use (atomic claim)** | 5/15 min per client IP; **60/h global**; **atomic** 5 wrong → 30 min lock per account | `test_features.py::test_invite_lockout_after_wrong_codes`, `test_redeem_ip_rate_limit`, `test_audit_fixes.py::test_f2_invite_code_is_single_use`, `test_f3_parallel_wrong_codes_cannot_exceed_lockout`, `test_f1_global_redeem_cap_across_accounts_and_ips` |
| `POST /invites/revoke-all` | elder | `$pull` of the caller's own id from every carer; deletes the caller's codes | — | `test_audit_fixes.py::test_f2_elder_revokes_all_carers_immediately`, `test_f2_only_elders_can_revoke` |
| `GET /carer/elders` | family / doctor | caller's links only | — | `test_audit_fixes.py::test_f2_elder_revokes_all_carers_immediately` |
| `GET /dashboard/{elder_id}` | elder (self) / linked carer | `resolve_elder_access(read)` + `elder_id` on all 5 queries | — | `test_features.py::test_dashboard_shape_and_access`; content isolation |
| `GET /push/config` | any logged-in | returns only `enabled` + the VAPID **public** key | — | `test_push.py::test_config_reports_public_key_only`, `test_push_disabled_without_vapid` |
| `POST /push/subscribe` | any logged-in | row keyed by endpoint, owned by the caller; ≤ 5 devices; **endpoint must be https on a real push service (SSRF allowlist)** | 20/h per user | `test_push.py::test_real_push_services_allowed`, `test_other_endpoints_rejected`, `test_subscribe_rejects_bad_input`, `test_at_most_five_devices_per_user` |
| `POST /push/unsubscribe` | any logged-in | deletes only `{endpoint, user_id: caller}` | — | `test_push.py::test_same_browser_moves_to_the_latest_login_and_unsubscribe_is_owner_only` |
| `GET /emergency-contact?elder_id=` | elder (self) / linked carer | `resolve_elder_access(read)`; reads only the `emergency_contact` field | — | `test_emergency.py::test_carers_cannot_write_and_unlinked_cannot_read`, `test_elder_cannot_read_another_elders_contact` |
| `PUT` / `DELETE /emergency-contact` | elder | `require_role(elder)`; updates only the caller's own user doc; name ≤ 40, phone pattern + 7–15 digits, `extra=forbid`; phone never logged | — | `test_emergency.py::test_validation_rejects_bad_input`, `test_carers_cannot_write_and_unlinked_cannot_read` |
| `POST /me/delete` | any logged-in | **password re-check**; deletes only the caller's own docs (`_id`/`elder_id`/`user_id` = caller); elder: medicines, reminders, check-ins, vitals, invites, push subs + `$pull` from every carer's links; carer: own doc + push subs | 5/min + 20/h per user | `test_account_delete.py` (wrong password, other elder untouched, carer unlink, old token 401, schema, rate limit) |
| `POST /auth/register` (one-step) | public | **closed (400) while email is on**: sign-up must go through the code | as before | `test_signup.py::test_one_step_register_is_closed_when_email_is_on` |
| `POST /auth/register/start` | public | MX check first (no email to domains that can't receive mail); same 202 whether or not the email exists (existing account: no email, no takeover); stores bcrypt hash + HMAC of the code only, 15 min TTL | 3/min + 20/h per IP; 200/day global | `test_signup.py` (made-up domain, probing, validation) |
| `POST /auth/register/verify` | public | right code creates the account (email_verified) and logs in; 5 wrong tries kill it; single use | 10/15 min per IP | `test_signup.py::test_code_first_signup_creates_a_verified_account`, `test_wrong_code_expiry_and_five_tries` |
| `GET /auth/email-config` | public | returns only `enabled` | — | `test_email_codes.py::test_email_off_by_default` |
| `POST /me/verify-email/send` | any logged-in | caller's own email only; 404 when email is off | 3/15 min + 10/day per user | `test_email_codes.py::test_validation_and_rate_limits` |
| `POST /me/verify-email` | any logged-in | caller's own code; only an HMAC of the code is stored; 15 min, single use, dies after 5 wrong tries (atomic attempt count) | 10/15 min per user | `test_email_codes.py` (flow, 5 wrong guesses, expiry) |
| `POST /auth/password/forgot` | public | always 204 (no account probing); a code is sent only to VERIFIED emails | 3/15 min + 20/day per IP | `test_email_codes.py::test_forgot_and_reset_password`, `test_reset_needs_a_verified_email...` |
| `POST /auth/password/reset` | public | email + code + new password; one generic error for unknown/unverified/wrong; success bumps `token_version` so every older session gets 401, and clears the login lock | 10/15 min per IP | `test_email_codes.py::test_forgot_and_reset_password` |
| `GET /health` | public | no data | — | `test_security_headers.py::test_health_and_security_headers` |

## Controls: status

| Control | Status | Reason / proof |
|---|---|---|
| Server-side auth on every route, deny by default | DONE | `require_role` / `resolve_elder_access` on all routes; `test_idor.py`, `test_features.py` |
| Cross-elder content isolation on every read | DONE | `tests/test_isolation.py` (kills all 7 filter-removal mutants, F4) |
| Doctors never write; family writes vitals only | DONE | `test_features.py::test_vitals_permissions`, `test_idor.py::test_carers_cannot_use_elder_only_write_endpoints` |
| Carer access revocable, immediate | DONE | `POST /invites/revoke-all`; `test_f2_elder_revokes_all_carers_immediately` |
| Invite code single-use, 24 h, CSPRNG | DONE | `secrets.randbelow`, TTL index, atomic claim; `test_f2_invite_code_is_single_use`, `test_invite_expired` |
| Invite brute-force protection | DONE | per-IP + global + atomic per-account lock; `test_f3_*`, `test_f1_global_redeem_cap_*` |
| Rate-limit client IP not spoofable via `X-Forwarded-For` | DONE (live-verified Nov 26: rotating spoofed XFF → 429 ×8) | `ratelimit.client_ip` (CF-Connecting-IP, else rightmost XFF); `test_f1_spoofed_leftmost_xff_does_not_reset_login_limit` |
| Login brute force independent of IP | DONE | per-email throttle (HMAC-keyed, no emails stored); `test_f1_per_account_login_throttle_independent_of_ip` |
| Generic login/register errors (no enumeration) | DONE | `test_login_errors_are_generic`, `test_duplicate_register_is_generic`, `test_f1_login_throttle_does_not_reveal_which_emails_exist` |
| Global LLM quota protection | DONE | `test_f7_global_llm_cap_shared_across_users_and_routes` |
| Secrets fail-fast at startup (JWT ≥ 32 chars, no `*` origin, no fake LLM in prod) | DONE | `test_config_failfast.py` |
| bcrypt passwords, role-based JWT lifetimes, alg pinned | DONE | `test_token_lifetime_by_role`, `test_bad_tokens_rejected`, `test_alg_none_rejected` |
| Pydantic `extra="forbid"` + length limits; NoSQL operator payloads rejected | DONE | `test_injection.py::test_login_rejects_operator_payloads`, `test_unknown_fields_rejected`, `test_query_param_operator_injection` |
| Uploads: type + magic bytes, 5 MB streamed cap, re-encode, memory only | DONE | `test_uploads.py` |
| Uploads: decompression-bomb guard | DONE | ≤ 20 MP checked before decode; `test_f6_*` |
| LLM output schema-validated, capped, injection-delimited | DONE | `test_llm.py`, `test_injection.py` |
| Medical safety (IV/PRN no reminders, keyword concern fallback) | DONE | `test_extraction_regression.py`, `test_concern.py`, `test_text_checkin_keyword_fallback_sets_concern` |
| Errors never leak internals; validation never echoes values | DONE | `test_unhandled_error_hides_internals`, `test_validation_error_never_echoes_password` |
| Logs: no bodies, query strings, tokens, prescription text or transcripts | DONE (code) | `logging_setup.py` redaction + path-only access log; production log grep: see Phase 4 below |
| API security headers + `Cache-Control: no-store`; CORS exact allowlist | DONE | `test_health_and_security_headers`, `test_cors_allowlist`; live `curl -I` |
| Web headers (CSP, HSTS, nosniff, DENY, Permissions-Policy) | DONE | `frontend/vercel.json`; live `curl -I`. For Vapi voice calls the CSP allows exactly: `script-src https://c.daily.co 'wasm-unsafe-eval'` (Daily's call machine + Krisp noise filter are WebAssembly; JS `eval` stays blocked) and `connect-src https://prod-ks.pluot.blue` (Daily's region lookup), found by reading Daily's call-machine bundle 0.94.0 |
| No raw HTML rendering | DONE | ESLint `react/no-danger`; `npm run lint` |
| CSRF protection | NOT NEEDED | no cookies; bearer header only; CORS `allow_credentials=False` |
| SSRF protection | NOT NEEDED | the server never fetches user-supplied URLs; LLM base URLs are env-only |
| OAuth/SSO, WebSockets, server templates | NOT NEEDED | not used (out of scope) |
| Request body cap | MINIMAL | `Content-Length` > 6 MB → 413 (`test_body_limit_by_content_length`); chunked bodies rely on the edge limit (F12) |
| Dependency scanning | MINIMAL | pip-audit + npm audit in CI on every push; no Dependabot (F15) |
| Secret scanning | DONE | gitleaks over full history in CI (`secrets` job) |

## Known limitations (not fixed before the freeze; also in README)

| Finding | Limitation | Why not fixed now |
|---|---|---|
| F5 | Pharmacist flag / D/c detection re-derive from text the client sends back; a modified client (or the elder) can drop "D/c" or claim high confidence. The documented "re-activate" button gives an oral D/c order home reminders. | The proper fix (a signed extraction ticket) is 1–1.5 h; the reactivation fix is queued next. |
| F8 | `/medicines/confirm`, `/vitals`, reminder actions have no rate limit; one account could fill the 512 MB Atlas M0. | Outside the 2 h budget (15 min). |
| F9 | "General wellness only" for check-in replies is enforced in the prompt, not by a code filter. | Outside the 2 h budget (20 min). |
| F10 | Voice transcript is browser-reported (client can write "AI" lines; `vapi_call_id` unverified). Rendered as text, so no XSS. | Verification needs the Vapi private key server-side. |
| F11 | No server-side logout/revocation; elder token lasts 7 days in `localStorage`. | Documented trade-off (reminder engine needs the elder logged in). |
| F12 | Chunked request bodies are not capped by the app. | Edge (Cloudflare) limit applies; low risk. |
| F13 | An elder can mark old doses "taken". | Data-integrity only; 5 min fix queued. |
| F14 | `Retry-After` is fixed at 60 s for IP/user limits (the invite lock now sends 1800). | Cosmetic. |
| F15 | CI actions pinned by tag, gitleaks binary not checksummed, no Dependabot. | Post-freeze hardening. |
| F16 | No account deletion/export, no retention policy; prescription images and check-in text go to Gemini (free tier may use inputs to improve Google products). | Prototype with fake data only. |
| F17–F20 | `style-src 'unsafe-inline'`; `c.daily.co` allowed host-wide; quadratic regex reachable only by ≤ 400-char LLM output; self-declared doctor accounts (read-only, need the elder's code). | Hardening backlog / accepted. |
| — | Rate limits and login/invite counters for IPs are in memory (single instance) and **reset on every redeploy**; the per-email login and per-account invite counters are in MongoDB and survive. | Free tier, single instance. |
| — | Atlas Network Access `0.0.0.0/0` (Render free tier has no static IP). Compensating: dedicated `readWrite` user on one DB, long generated password, TLS only. | Platform limit. |

## Phase 4 (Saturday): still to do

- [x] Live attack checks against the Render/Vercel URLs after redeploy (results in `docs/engineering-checklist.md`)
- [ ] Production log grep for passwords/tokens/emails (needs Render dashboard access)
- [x] `pip-audit` + `npm audit` + gitleaks (full history) run in CI on every push
