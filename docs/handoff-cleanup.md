# Handoff — cleanup phase (written July 14, 2026, after the cutover)

Context for a fresh session whose job is **cleanup and hardening**, not
features. The app is live and trusted; don't break it for elegance.

## Where things stand

- **The app IS the administration.** Stages 1–9 replayed from fixtures;
  stage 10 was entered by the owner via the beheer UI (July 14) — the Excel
  is retired. Site: https://tdf-pool.vercel.app, beheer at `/admin`
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
6. The Tour is LIVE (stages 11–21 remain, until July 26). Deploys happen on
   push to main. Don't leave main broken; the owner enters a stage daily.

## Cleanup backlog (the actual work)

Ordered by value; verify each with the invariant-3 loop.

1. **Dead v1 API routes.** The Python scrapers are deleted, but their
   endpoints remain: `api/submit-stage-results.ts`, `api/submit-startlist.ts`
   (+ `lib/scraper-types.ts`). `api/admin/process-stage.ts` is also likely
   unused by the UI now (entry goes through `enter-stage`; local repair uses
   `process:stages`). Check what `api/admin/stage.ts` / `stages-list.ts`
   serve. Confirm no callers (the UI + scripts), then delete routes + types
   + the `SCRAPER_TOKEN` mentions. *Ask the owner* before deleting
   submit-startlist — next season's startlist import may want an endpoint,
   though `apply:startlist` covers it.
2. **ESLint 9 flat config + dependency bumps** (React Router, TanStack
   Query, Vite, @vercel/blob…). Churn-heavy: do it in one dedicated pass,
   verify with the full loop plus a manual smoke of `/admin` entry and the
   public pages (dev server against production data).
3. **Finding 5 — roster reconciliation.** `replaced_at_stage` is write-only
   today: a retracted DNS/DNF doesn't undo a substitution. Fix: derive
   desired stamps from the full `stage_dnf` history on every
   `updateActiveSelections` run (diff-based updates incl. clearing).
   **Trap:** pre-race activations have stamp `1` with no `stage_dnf` rows
   (P115's 9-rider roster, non-starting picks) — never clear stamp-1 rows.
   Acceptance: golden suite + `verify:standings` + a manual
   retract-DNS-and-reprocess test on a copy.
4. **`is_active` on `participant_rider_selections` is transitional debris**
   — written, never read by scoring (roster derives from
   `replaced_at_stage`). Only `generateTeamSelectionsJSON` filters on
   position/stamps. Decide: drop the column (migration) or document it.
5. **EtappeBeheer.tsx is ~1,200 lines.** Split into components
   (`src/components/beheer/…`), no behavior change. Also sweep
   `src/hooks/useBusinessLogic.ts` and `lib/data-transforms.ts` for v1-era
   dead paths.
6. **`participant_stage_points.stage_rank_change`** exists in the schema,
   never written. Write it (cheap, pipeline already has both ranks) or drop it.
7. **Directie score semantics — needs an owner decision, not code first.**
   The site's directie leaderboard sums the top-5; the sheet's formula
   averages them. Same ranking order, different numbers. Ask which the
   participants should see, then align + document.
8. **docs/implementation-plan.md** (695 lines) is largely executed/stale —
   add a "superseded by" header pointing at the newer docs, don't rewrite it.
9. **Rebuild dress rehearsal**: `npm run rebuild -- --apply` has never run
   against a scratch Supabase project end-to-end (needs a throwaway project
   + the three migrations pasted). Nice-to-have insurance.

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
