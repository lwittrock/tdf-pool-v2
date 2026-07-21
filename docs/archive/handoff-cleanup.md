# Handoff — cleanup phase (written July 14, 2026, after the cutover)

Context for a fresh session whose job is **cleanup and hardening**, not
features. The app is live and trusted; don't break it for elegance.

## Where things stand

- **The app is live as a demo** (owner clarification, July 14): the Excel is
  retired and stages are entered in the app, but it is not yet a system of
  record with an audience — cleanup can be aggressive; a broken deploy is
  an inconvenience, not an incident. Stages 1–9 replayed from fixtures;
  stage 10 entered by the owner via the beheer UI (July 14).
  Site: https://tdf-pool.vercel.app, beheer at `/admin`
  (e-mail login or beheertoken).
- **Standings are sheet-exact** including the Dagploeg +6:
  `npm run verify:standings` checks all cells against
  `data/2026/fixtures/expected_standings.json` (the owner's Excel, extracted
  and machine-validated). `npm test` runs the golden suite (128 × 9) plus
  scoring/parser units. All green as of commit `a221ca1`.
- Architecture, operations, scripts: see [README.md](../README.md).
  History and rationale: [next-steps-plan.md](next-steps-plan.md) (all steps
  done), [phase-a-review-findings.md](phase-a-review-findings.md) (findings
  1–10, two still open — see backlog), [season-2027-plan.md](season-2027-plan.md).

## Non-negotiable invariants

1. **Golden fixtures are verbatim-Excel — never edit them to make code
   pass.** Owner rulings on top of them live in `data/2026/rulings.json`.
2. **Any Supabase table that can exceed 1,000 rows must be read via
   `fetchAll`** (`lib/supabase-server.ts`). PostgREST silently truncates
   un-ranged selects; this bug corrupted scoring once (finding 9).
3. **After any change touching scoring/pipeline/data:**
   `npm run check && npm test && npm run build`, and if data was touched,
   `npm run verify:standings` against production.
4. Schema changes = a new numbered file in `supabase/migrations/` (the
   owner pastes it in the SQL editor; there is no CLI migration runner).
5. Rules changes need an owner ruling first (current rules: README
   "How it works"; substitution: DNS → that stage, DNF/OTL/DSQ → next
   stage, max one).
6. The Tour runs until July 26 (stages 11–21 remain) and the owner enters a
   stage daily; deploys happen on push to main. Keep main working — but the
   app is a demo (see above), so this is hygiene, not a freeze.

## Cleanup backlog (the actual work)

Ordered by value; verify each with the invariant-3 loop.

1. ~~**Dead v1 API routes.**~~ **DONE (July 14).** All six dead files deleted
   (`submit-stage-results`, `submit-startlist`, `admin/process-stage`,
   `admin/stage`, `admin/stages-list`, `lib/scraper-types`) plus the
   `SCRAPER_TOKEN` credential path — the owner approved deleting
   submit-startlist (2027 reworks intake anyway; git history has it).
2. **ESLint 9 flat config + dependency bumps** (React Router, TanStack
   Query, Vite, @vercel/blob…). Churn-heavy: do it in one dedicated pass,
   verify with the full loop plus a manual smoke of `/admin` entry and the
   public pages (dev server against production data).
3. ~~**Finding 5 — roster reconciliation.**~~ **DONE (July 14).** The rule
   now lives in `scoring.deriveRosterStamps` (pure; the golden suite drives
   the same function); `updateActiveSelections` diffs derived stamps against
   the DB, clearing retracted ones. Stamp-1 reserve rows stay immutable.
   Verified with a live retract-DNF-restore round trip + `verify:standings`.
4. ~~**`is_active` on `participant_rider_selections`.**~~ **DONE (July 14).**
   Code no longer writes it; migration `003_drop_transitional_columns.sql`
   drops it (plus `stage_rank_change` and the never-used
   `directie_stage_points` table). **Owner action: paste 003 in the SQL
   editor after the deploy.** `riders.is_active` is a different, live column.
5. **EtappeBeheer.tsx is ~1,200 lines.** Split into components
   (`src/components/beheer/…`), no behavior change. Also sweep
   `src/hooks/useBusinessLogic.ts` and `lib/data-transforms.ts` for v1-era
   dead paths.
6. ~~**`participant_stage_points.stage_rank_change`**~~ **DONE (July 14).**
   Owner chose drop — part of migration 003 (see item 4).
7. ~~**Directie score semantics.**~~ **DONE (July 14).** Owner ruling: show
   the **average** of the top-5 (the sheet's formula), one decimal, divided
   by the actual contributor count. `verify:standings` now also asserts the
   10 directie averages against the golden fixture.
8. ~~**docs/implementation-plan.md.**~~ **DONE (July 14).** Superseded/
   historical headers added to implementation-plan, next-steps-plan,
   phase-a-go-live and architecture-review; finding 5 marked fixed.
9. **Rebuild dress rehearsal**: `npm run rebuild -- --apply` has never run
   against a scratch Supabase project end-to-end (needs a throwaway project
   + the four migrations pasted). Nice-to-have insurance.
10. **Directie name variants split the directie board** (found during the
   July 14 smoke test): the DB has separate `directie` rows for "DTE",
   "DTe", "DtE" and "Dte" (verbatim-Excel free text), so the site's
   directie klassement shows them as four directies while the sheet's
   groups fold them into one. Same root cause as the
   [season-2027-plan](season-2027-plan.md) identity work. Options: fold by
   name-key in `generateLeaderboardsJSON` (display-level), or merge the
   `directie` rows via a ruling (data-level, needs a merge script). Owner
   call on the canonical spellings either way.

## Operational facts a session may need

- Owner's `.env` (repo root, git-ignored) holds full config incl.
  `BLOB_READ_WRITE_TOKEN`; `.env.local` has a subset. Supabase project
  `nmjfxxcyxxwgumlkfejt`, blob store `gzymiq0w13bveeeo`.
- Stage entry routine + "Dagploeg comes later" flow: README Operations.
  Stage 10's dagploeg may still be pending — re-saving the stage with the
  field filled recomputes the +6 automatically.
- Data quirks (Johannessen alias, P115, P070, Excel-canonical spellings,
  ~12 picked non-starters): `data/2026/fixtures/README.md` + findings 8b.
- `stage_entry_log` records every submission (also rejected) — the audit
  trail for any dispute.
- Supabase free tier pauses after ~1 week idle (matters after July 26).
- Windows dev box: vitest occasionally reports "no tests" right after file
  writes — rerun once before believing a failure.

## Commit conventions

Small, verified commits straight to main (owner's solo repo); imperative
subject; body explains why; end with the Claude co-author trailer. Push
after the invariant-3 loop is green.
