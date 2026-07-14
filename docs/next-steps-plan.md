# Next steps — execution plan (July 2026, after stage 9)

The practical follow-up to [`implementation-plan.md`](implementation-plan.md)
(which stays the reference for WP numbering and decisions) and
[`phase-a-review-findings.md`](phase-a-review-findings.md). Ordered by
priority; each step says **who does what, where**, and when it's done.

Legend: **YOU** = owner actions (dashboards, Excel, decisions).
**CLAUDE** = code/data work done in a session, committed to the repo.

---

> **Status (July 14):** Steps 0–3 are DONE. Stages 1–9 are live, published
> totals match the owner's sheet **exactly (Dagploeg +6 included)** — 0
> diffs over 2,304 verified cells. WP-B2 landed early (9-stage reprocess
> ≈ 1 min; UI entry unblocked) and uncovered two critical data bugs (findings
> 9/10, fixed). WP-B1 added `stages.dagploeg`, `rider_aliases`, and the new
> substitution ruling (DNF at s → reserve from s+1; DNS from s itself; zero
> historical impact, verified). **Next: Step 4 — enter stage 10 in the UI.**

## Step 0 — Finish the current data load *(DONE)*

| Who | What |
|---|---|
| CLAUDE | Stages 5–9 entering via `replay:stages --local` (running). Then: `merge:riders` (Johannessen), `process:stages -- --apply 2 3 4 5 6 7 8 9`, verify the site. |
| YOU | Afterwards: open https://tdf-pool.vercel.app and sanity-check the standings against your sheet. Expect **systematically lower totals** — the Dagploeg +6 isn't in the engine until Step 3. Check P128 specifically: they should now HAVE Johannessen's points (deliberate divergence from the sheet). |

**Done when:** site shows stages 1–9, P128 includes Johannessen, no ONBEKEND teams on the Renner Punten page for riders who scored.

---

## Step 1 — Golden fixtures through stage 9 *(DONE — 128 × 9 cells verified)*

The safety net for everything below. The stage results are already in
`data/2026/fixtures/stage_results/stage_{5..9}.json`; what's missing is the
**expected standings** to verify against.

| Who | What |
|---|---|
| YOU | Export from the Excel: the per-participant points block for **stages 1–9** — per participant: points per stage and cumulative total, in the **same sheet order** as before (that order defines the P-codes; names can be hidden). Plus the directie scores after stage 9. A screenshot (like the one you sent) or CSV paste both work. |
| CLAUDE | Convert to `expected_standings.json` format (or a second file for 5–9), extend `tests/golden-2026.test.ts` to verify all 128 × 9 stage totals + cumulatives, still applying the +6 externally from the fixtures' `dagploeg` field. Reconcile any mismatch (transcription vs sheet) before anything else changes. |

**Done when:** `npm test` verifies 128 participants × 9 stages exactly.

---

## Step 2 — WP-B2: bulk pipeline rewrite *(DONE — July 14)*

Evidence: stage 4 died on Vercel's 300 s limit; stage 9 takes ~7 min locally.
Until this lands you cannot enter a stage from the beheer UI.

| Who | What |
|---|---|
| CLAUDE | Rewrite `lib/pipeline.ts` internals: fetch all inputs in a handful of queries, compute in memory (the pure core in `lib/scoring.ts` already exists and is golden-tested), write back as bulk upserts; recompute the full cumulative chain in one pass (kills deferred findings 6 and 8). Fold in **roster reconciliation** (finding 5): derive each stage's roster from the full `stage_dnf` history on every run instead of one-way `replaced_at_stage` stamps — corrections become self-healing. Acceptance: golden suite green, one stage processes in **< 20 s** on Vercel, `verify` against the deployed endpoint. |
| YOU | Nothing during the build. Afterwards: enter a test correction via the beheer UI once and confirm it completes. |

**Done when:** "Opslaan & Verwerken" in the UI completes a stage-9-sized
recompute well inside the limit, and `process:stages`/`--local` are no
longer needed for normal operation.

---

## Step 3 — WP-B1: Dagploeg + rider aliases *(DONE — July 14)*

Two schema additions; SQL runs in the dashboard until Step 5 automates it.

| Who | What |
|---|---|
| CLAUDE | Write `supabase/phase-b1.sql`: `stages.dagploeg` column + `rider_aliases` table (alias → rider_id, unique on alias). Entry UI gets a Dagploeg field (team dropdown from `data/2026/startlist.json` names). Engine: +6 per stage to participants whose `ploeg` = that stage's `dagploeg`; golden test's external +6 moves into the engine. Entry validation + import resolve names through aliases. Seed aliases for the known Excel quirks (short-form Johannessen, etc.). Backfill `dagploeg` for stages 1–9 from the fixture files. |
| YOU | Paste `phase-b1.sql` in the Supabase SQL editor. From then on, entering a stage includes picking the Dagploeg — it's the winner of the stage's **team day classification** (PCS → stage → "Complementary results"), *not* the stage winner's team. Tell the participants the site now includes the +6. When a new name mismatch ever appears, the fix is one alias row, not a merge. |

**Done when:** published totals match your sheet exactly (P128 aside), and a
misspelled rider name at entry time is either matched via alias or blocked —
never silently split.

---

## Step 4 — Cut over: the app becomes the administration

| Who | What |
|---|---|
| YOU | Pick the cutover stage (first one after Steps 2–3 are live, realistically stage 11 or 12). Announce it. From that stage on: enter results **only** in the beheer UI (`/admin`, OTP login) — top-20, jerseys, combativity, DNS/DNF (from the PCS startlist annotations), Dagploeg. Stop maintaining the Excel, or keep it as read-only backup. |
| CLAUDE | Standby: the entry log (`stage_entry_log`) records every submission, so any dispute is replayable. |

**Until the cutover** (stages 10+ before Step 2 lands), stage entry works
like today: I add `data/2026/fixtures/stage_results/stage_N.json` from your
screenshot/paste, then `npm run replay:stages -- --apply --local N`.

**Done when:** a full stage goes from PCS to published site in one UI
session with no terminal involved.

---

## Step 5 — WP-B7: migrations + one-command rebuild

Today proved the need: a fresh Supabase project took a manual chain of
schema → phase-a.sql → import → startlist → replay → merge.

| Who | What |
|---|---|
| CLAUDE | Turn the SQL files into ordered migrations; write `npm run rebuild` that runs them plus `import:fixtures --apply`, `apply:startlist --apply`, `replay:stages --apply --local`, and re-applies recorded rulings (the Johannessen merge). Document it as the disaster-recovery procedure (free tier has no backups; the entry log + this script are the recovery story). |
| YOU | Nothing — except knowing that if Supabase ever eats the project, the recovery is: new project → paste keys in `.env` → `npm run rebuild`. |

**Done when:** a scratch Supabase project reaches full parity with
production from one command (verified once, against a throwaway project).

---

## Step 6 — WP-B8: hygiene *(rides along, no urgency)*

CLAUDE, batched into a quiet moment: preview deployments reading the
production pointer (read side of the `preview/` prefix), retire or fix the
stale Python scrapers (they predate the auth requirement), rewrite the
README top half, ESLint flat-config with the dependency bumps.

---

## Ongoing operations during the Tour (as of July 14)

- **Enter a new stage:** the beheer UI (`/admin`) — top-20, jerseys,
  combativity (optional), Dagploeg (optional; winner of the stage's team
  day classification, see PCS "Complementary results"), DNS/DNF lists.
  The fixture-file + `replay:stages` route still works as backup.
- **Correct an old stage:** re-enter it (UI with overwrite confirmation, or
  fixture file + `replay:stages --apply --local N`). Cumulative totals and
  overall ranks now ripple forward automatically — no need to reprocess the
  later stages.
- **Supabase free tier pauses after ~1 week idle** — the Tour's daily
  writes prevent that, but after Paris, visit the dashboard weekly or
  expect to resume the project manually.
- **Rollback a bad publish:** runbook section 7 in
  [`phase-a-go-live.md`](phase-a-go-live.md).
