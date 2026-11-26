# Sehat Saathi: threat model

Scope: the deployed prototype (Vercel web, then Cloudflare and Render running FastAPI as a single instance, MongoDB Atlas M0, Gemini through an OpenAI-compatible API, Vapi Web SDK not yet configured). Finding IDs (F#) refer to `audit-findings.md`. Assume the data is real patient data even though it is fake.

## Assets
| Asset | Why it matters |
|---|---|
| Elder health record: medicines (verbatim prescription lines), reminders and adherence, check-in transcripts, mood, concern flags, vitals | Sensitive health data. Integrity matters as much as confidentiality, because a doctor or family member acts on it. |
| Carer links (`linked_elder_ids`) | They *are* the authorisation. Whoever holds a link reads everything above. |
| Accounts and credentials | Email, bcrypt hash, 7-day elder JWT / 12-hour carer JWT in `localStorage`. |
| Secrets | `JWT_SECRET`, `MONGODB_URI`, Gemini keys (Render env); Vapi private key (Vapi dashboard). |
| Availability and quota | One free Render instance (512 MB), Atlas M0 (512 MB), Gemini free-tier daily quota. Each one is a single point of failure. |
| Safety properties | D/c → no reminders; pharmacist flag never auto-cleared; general wellness tips only; concern = LLM OR keywords. |

## Actors
- **Anonymous internet attacker.**
- **Registered outsider:** registration is free and any role, including `doctor`, can be self-chosen.
- **Linked carer** who should lose access.
- **The elder, or someone holding the elder's device or token:** can tamper with their own record that others rely on.
- **Hostile content:** text in a prescription image, in a check-in message or in a Vapi transcript.
- **Compromised dependency or CI action.**

## Entry points, threats, mitigations

| Entry point | Top threats | Existing mitigations | Missing mitigations |
|---|---|---|---|
| `POST /auth/register` | Mass account creation feeding invite brute force, LLM quota burn and storage fill | Strict schema; 3/min, 20/h per IP; generic error | **IP key spoofable (F1)**; no global cap; no bot check |
| `POST /auth/login` | Credential stuffing / brute force; user enumeration | Generic message; bcrypt dummy-hash timing; 5/min, 20/h per IP | **IP key spoofable (F1)**; no per-account throttle |
| Any bearer-auth route | Token theft (XSS, shared phone); forged JWT | HS256 pinned, `exp/sub/iat` required, alg=none tested; user and role reloaded from DB each request; strict CSP; no HTML sinks | No revocation or logout-all (F11); 7-day elder lifetime |
| `POST /invites` (elder) | Code leaks via WhatsApp or a photo | `secrets.randbelow`, 24 h TTL index | **Multi-use; regenerating does not revoke existing links; no unlink (F2)** |
| `POST /invites/redeem` | 6-digit brute force (an OTP in effect) | 5/15 min per IP; 5 wrong → 30 min lock per account; same message for wrong and expired | **Lock is per throwaway account; non-atomic counter; no global or per-code limit; IP spoofable (F1, F3)** |
| `POST /prescriptions/extract` (image) | Decompression bomb / OOM; polyglot; prompt injection in the image; quota burn | 5 MB streamed cap; magic bytes = Content-Type; Pillow verify + re-encode; memory only; model only transcribes, code decides; schema + length caps; 10/min, 60/day per user | **40–80 MP images accepted, ~174 MB decode (F6)**; no global LLM cap (F7) |
| `POST /medicines/confirm` | Tampered "verbatim" safety fields; storage fill | Strict schema; server re-derives route, PRN, D/c and pharmacist reasons from the text; IV/PRN → no reminders | **Client can edit `original_text`/`confidence` to activate D/c and clear flags; reactivated oral D/c gets reminders (F5)**; no rate limit, up to 630 rows per call (F8) |
| `POST /medicines/{id}/stop`, `POST /reminders/{id}/{action}` | IDOR; adherence falsification | `{_id, elder_id: caller}` in the query (tested) | Backfill of old doses (F13); no rate limit (F8) |
| `GET /medicines`, `/checkins`, `/vitals`, `/dashboard/{id}`, `/reminders/upcoming` | Cross-elder read (IDOR) | `resolve_elder_access` deny-by-default; every query filters `elder_id` | **No regression test for 7 of those filters (F4)** |
| `POST /vitals` | Doctor or unlinked family writing; out-of-range values | Write mode = elder (self) or linked family only; value bounds | No rate limit (F8) |
| `POST /checkins/text` | Prompt injection pushing dose or diagnosis advice; hidden red flags | Delimited input + injection guard; schema caps; keyword concern always on the elder's text; LLM failure → canned reply, still logged | **No code filter on reply/tip content (F9)**; no global LLM cap (F7) |
| `POST /checkins/voice` (Vapi transcript) | Forged "AI" lines shown to carers as AI speech; giant payloads; markup | ≤ 60 turns × 1000 chars, truncated to 6000; rendered as React text (no XSS); keyword concern on elder turns | **Client-authored `ai` turns stored; `vapi_call_id` unverified; concern not checked on `ai` turns (F10)** |
| `GET /medicines/{id}/alternatives` | Prompt laundering; cross-user cache leak; quota burn | Ownership in query (tested); output 120 + 5×80 chars; cache key = name + strength (no user data); labelled "needs doctor verification" | No global LLM cap (F7) |
| Any request body | Memory pressure | 413 when `Content-Length` > 6 MB | Chunked bodies are buffered in full (F12) |
| Web origin (Vercel) | XSS, clickjacking, secret exposure in the bundle | CSP without `unsafe-eval`; `frame-ancestors 'none'`; no HTML sinks (lint rule); only public `VITE_*`; no source maps | `style-src 'unsafe-inline'`; `c.daily.co` allowed host-wide (F17) |
| CI/CD | Leaked secret; malicious action or binary | gitleaks on full history; pip-audit / npm audit; `contents: read`; exact pins + lockfile | Unpinned action SHAs; unchecked gitleaks download; no Dependabot (F15) |
| Data at rest / third parties | Atlas exposure (`0.0.0.0/0`); data sent to Gemini; no deletion | Dedicated DB user, TLS, strong password (per README); images never stored; logs carry no bodies or transcripts | No delete or export; no retention; Gemini free-tier data use not disclosed (F16); Atlas privileges unverified |

## Highest-risk chain
1. Spoof `X-Forwarded-For` (F1) to register unlimited family accounts.
2. Each account gets 5 redeem guesses, and there is no global redeem limit (F3). With 5 live codes, a hit takes about 200k guesses, roughly 3 hours bounded by server bcrypt time.
3. The hit gives permanent read access to an elder's full health record, and the elder cannot revoke it (F2).

The fixes for F1, F2 and F3 break every step of the chain: about 1 hour of work in total.

## Out of scope / accepted
- Phone theft with an unlocked browser.
- Compromise of Google, Vapi, Render, Vercel or Atlas themselves.
- Self-declared doctor accounts (F19): they grant read-only access, and only with the elder's code.
- In-memory rate limits resetting on redeploy (single instance; documented).
