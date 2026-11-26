# Sehat Saathi — Roadmap

Started **Thursday Nov 26, 2026**. Deadline **Saturday Nov 28, 11:59 PM**. Feature freeze **Saturday 6 PM**. Target submission **Saturday 9 PM**.

## Stage A — stable core (now)
Plain, clean UI. Atkinson Hyperlegible only, neutral placeholder palette, mobile-first.

| Phase | Scope | Exit criterion |
|---|---|---|
| 1 — backend | Repo, CI, gitleaks config, FastAPI skeleton + `/health`, config fail-fast, logging redaction, security headers, CORS, error handlers, rate limiting, Mongo + indexes, auth (roles, role-based JWT lifetime), access dependencies, `llm/` module (Gemini + fake), upload hardening, `/prescriptions/extract`, `schedule.py`, `concern.py`, tests | CI green, backend live on Render, extraction works on a fake prescription. **Checkpoint: show run/deploy steps.** |
| 2 — elder UI | Theme tokens, simple `/` landing, login/register, upload → confirm/edit, reminders engine + notifications, text check-in, Web Speech check-in, vitals entry, `vercel.json` headers | Frontend live on Vercel using the Render API |
| 3 — carer + extras | Invites + redeem (lockout), dashboard (timeline, mood trend, taken vs missed, vitals list), alternatives (+ cache), seed script, Vapi plain button + transcript logging | Full demo path on live URLs |

### "STABLE REACHED" checklist (all on live URLs)
- [x] Register/login for elder, family, doctor; invite code flow works
- [x] Fake prescription → extract → edit → confirm; pharmacist banner on low confidence
- [x] Extraction bug fix (Nov 26): verbatim fields, frequency/route normaliser, IV/PRN no reminders, D/c stopped + excluded from reminders/adherence, quantity limits kept — regression-tested on the textbook order sheet and re-checked live with Gemini
- [x] All tap targets ≥ 48px (audited at 360/390/768/1280/1440)
- [x] No demo password in the repo (seed reads SEED_PASSWORD or generates one)
- [ ] Reminders generated; alerts + notifications while open; taken/skipped  _(API verified live; notification firing needs a real-device check)_
- [ ] Text check-in with concern_flag (incl. keyword fallback); Web Speech check-in in Chrome  _(text verified live; Web Speech needs a real-device check)_
- [x] Dashboard: timeline, mood trend, taken vs missed, vitals list, alternatives ("needs doctor verification")
- [ ] Vapi plain button works; hidden when not configured  _(hidden-when-unconfigured verified; needs Vapi assistant + keys)_
- [x] All security tests pass, CI green, Render + Vercel live, seed script works

## Stage B — polish (only after the user confirms Stage A)
Driven by separate prompts: display-font landing hero, Gallery3D, Chotu mascot (ChotuAgent, ChotuBoundary) and animations, decorative gradients/grain.

## After Stage B
- **Phase 4 (Sat morning):** live security run, pip/npm audit, full-history gitleaks, 5-width + real Android checks, bug fixes, `docs/engineering-checklist.md` + `docs/security-checklist.md`.
- **Phase 5 (Sat afternoon/evening):** README, 2-minute demo video, final push, incognito live-link check. Freeze 6 PM, submit by 9 PM.

## Cut order (first cut first)
Gallery3D → landing-hero Chotu → Chotu animations (keep static/plain) → Vapi → alternatives LLM polish → Web Speech. The text check-in and core flow are never cut.
