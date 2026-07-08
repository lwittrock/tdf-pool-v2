# TdF Pool v2 — Architecture Review & Roadmap

*Written July 2026. Version 2: findings were verified against the code and Vercel/Supabase documentation by an independent second review before this document was finalized.*

## Context

Big-picture review of the TdF pool app, now hardened by a second independent review that verified every claim against the code and Vercel/Supabase documentation. Your constraints: **non-technical people (3–5 editors)** must run in-Tour operations; **manual entry is the primary input** (scraper unreliable, demoted to optional prefill); **multi-year** reuse. Timeline from you: **2026 = proof of concept, operated by you alone, during the currently running Tour; 2027 = real live edition**, with participants submitting teams through a form. You like the frontend design direction — it stays.

## How the system works today

```
Python scrapers (unreliable)                    Manual entry (EtappeBeheer, public!)
        │ POST                                        │ POST (two browser-orchestrated calls)
        ▼                                             ▼
/api/submit-stage-results ────► Supabase (normalized schema, RLS read-only public)
                                      │
                  /api/admin/process-stage (HTTP-fetches its own sibling endpoints)
                                      │
            ├─ update-active-selections (backup rider logic — BUGGED, see F3)
            ├─ calculate-points (scoring engine, heavily N+1 — see F10)
            └─ json-generators → 6 JSON files → Vercel Blob (1-month default cache!)
                                      │
                                      ▼  (missing link — see F2)
      Frontend fetches /data/*.json from its own origin, caches forever
```

The core shape — normalized DB as source of truth, pre-computed JSON snapshots for a read-heavy public site — is right for this project: cheap, fast, failure-isolated (site works even if Supabase is down). Keep it. Everything below is about fixing the links between the boxes.

## Findings

### F1. Zero authentication 🔴
No API route reads any credential (`grep req.headers api/` → 0 hits); all writes run with the Supabase **service-role key**; the admin page sits in the **public nav** (`src/App.tsx:14`). Anyone can rewrite the pool. Concrete design in Target Architecture §2.

### F2. Publishing doesn't reach readers 🔴
- Pipeline uploads to Vercel Blob; frontend fetches `/data/*.json` from its own origin (`lib/config.ts:29`); the glue script (`scripts/manage-data.js` + `public/data/`) doesn't exist. The `vercel.json` `/data` rewrite is an identity no-op.
- **Red-team addition:** the naive fix ("fetch Blob URLs directly") would make it *worse*: no `put()` sets `cacheControlMaxAge`, and Vercel Blob's default is **1 month, applying to browser caches too** (minimum allowed: 60s; CDN overwrite propagation: up to 60s). Overwritten fixed-path blobs would serve stale data for up to a month.
- Client caching compounds it: `staleTime: Infinity`, all refetch flags off (`lib/constants.ts:138`).
- Fix is the **versioned-paths + pointer pattern** (Target Architecture §1) — it solves staleness, atomicity, and rollback with one mechanism.

### F3. Live scoring bug: substituted backup riders never score 🔴 (found by red-team, verified)
- `update-active-selections.ts:140-147` activates a backup (`is_active: true`) but leaves it at **position 11**; `calculate-points.ts:243-245` only counts riders with `.lte('position', 10)`. A participant whose rider DNS'es gets a backup that **silently contributes 0 points forever**. `generateTeamSelectionsJSON` also filters `position <= 10`, so the substitution is invisible in the UI too. In a pool, this is a trust incident waiting to happen.
- Related: `is_active` is a **global** flag, not stage-scoped — force-reprocessing an early stage after later substitutions scores it with the current roster, not the roster as of that stage. Scoring rework must derive roster-as-of-stage from `replaced_at_stage`.
- Also in the entry path: `manual-entry.ts` **deletes all existing stage data before validating** the new payload (delete at ~line 99, validation after) — an accidental empty submit destroys an entered stage; and it uses exact-name matching whose warnings the UI **discards** (`EtappeBeheer.tsx` ignores the response body), so a typo means silently wrong scores. New entry flow: validate fully → transactional swap; warnings blocking-visible.

### F4. Content management: separate admin from public, but no external CMS
- Race/pool data is relational, computed, and human-reviewed — Supabase already is the CMS; a headless CMS (Contentful/Sanity/etc.) would mean re-implementing integrity + scoring against a document store. **Rejected.**
- What's missing is the authenticated admin layer: review-and-publish for results, plus a small `content` table (markdown) for editorial texts ("Over deze Poule" is currently a hardcoded "Work in progress"). The separation you sensed = **admin app ↔ public app**.

### F5. Manual entry is the product — spec it concretely 🟡
`EtappeBeheer.tsx` (948 lines) has good bones (stage list → entry form → save+process). Gaps to "easy for non-technical people":
- **Required fields that don't affect scoring** (date, cities, all jerseys — `EtappeBeheer.tsx:190-206`). Scoring needs only finishers, jerseys, combativity, DNF/DNS. Stage metadata is pre-seeded from the public route calendar; editors never type it.
- **Paste-and-parse instead of 20 autocomplete boxes**: paste the top-20 from a source, server fuzzy-matches (reuses `find_rider_by_name_fuzzy` RPC + warning plumbing from `submit-stage-results.ts`), review screen shows green checks / dropdowns for uncertain names. **Spec (red-team):** support exactly two paste formats (procyclingstats table, NOS-style plain list), golden fixtures with accented names (real 2025 data exists in `data/stage_results/`); invariant: *an unrecognized line is shown, never silently dropped*. Caveat: the fuzzy RPC strips accents to nothing (`regexp_replace(...'[^a-zA-Z ]'...)` turns "Pogačar" → "Pogaar") — fixture tests must prove matching still clears the bar, or normalize with unaccent instead.
- **Safety net:** merge save+process into one atomic server call; draft autosave in localStorage (right choice at this scale); per-stage status **from the DB** (*leeg → ingevoerd → verwerkt*) so all editors see it; optimistic-concurrency check on save (`updated_at`; reject with "iemand anders heeft deze etappe net gewijzigd") — that one line is all the concurrency engineering 3–5 editors need.
- **Dutch, inline errors**; admin UI **mobile-first** (realistic entry happens on a phone).
- Scraper becomes an optional "probeer automatisch op te halen" prefill into the same review screen.

### F6. The yearly bootstrap has no working path 🟡 (red-team; plan gap)
Riders (~180), stage calendar, directies, participants (~50), and 50×11 selections currently have **no intake**: seed scripts referenced in `package.json` don't exist; `data/*.json` is dead v1 legacy. Add a **"Nieuw seizoen"** admin flow with three imports, all reusing the same fuzzy-match review component as stage entry: (1) startlist paste/prefill, (2) stage calendar paste (route is public months ahead), (3) selections import. For 2026 PoC you run this yourself; for **2027, participants submit via a form** (your call): pragmatic default = external form (Google Forms/Tally) exporting CSV into the same fuzzy-review import; in-app self-serve team picker with deadline enforcement is a later, optional upgrade.

### F7. Multi-year: archive-and-reset beats an editions table 🟡 (revised after red-team)
The v1 plan proposed `editions` FKs everywhere. The red-team's key observation: **the public site reads only snapshots, never the DB** — so archives don't need the database. Full editions surgery (FK on ~every table, all unique constraints and every pipeline query re-scoped) buys only "recompute past years in SQL," worth ~nothing once a Tour is final. **New recommendation:** at season end, copy the final snapshot set to `archive/<year>/*.json` in Blob (archive pages read those); replace the `DROP TABLE` schema file with **incremental migrations**; add a scripted, **non-destructive** "new season" reset. Archive the 2025 data as the first historical entry before any reset.

### F8. Repo drift 🟡
README describes deleted files (Login.tsx, `pages/admin/`, `src/lib/queries/`, wrong schema filename); `package.json` references 3 missing scripts; unused deps (`zustand`, `date-fns`, `tree`); `data/` legacy folder; dead `useBusinessLogic.ts` (339 lines) duplicating page logic; duplicate Tailwind config (`tailwind.config.ts` is a v3 leftover ignored by v4). **Red-team addition:** Tailwind is pinned to a **dead alpha** (`4.0.0-alpha.25`) — upgrade to v4 stable before building more frontend on it (multi-year rot risk).

### F9. No tests where correctness is socially critical 🟡
The scoring engine has zero tests. Golden tests against real stage data (anonymized 2026 fixtures from the live Excel are the ideal source — see the Scoring specification section), and the suite **must include a DNS-substitution scenario** (it would have caught F3) and a force-reprocess-after-substitution scenario (roster-as-of-stage).

### F10. The pipeline is massively N+1 — a merged single call is unsafe without a bulk-query refactor 🔴 (red-team, measured)
Late in a Tour, one full recompute+regenerate executes on the order of **18,000+ sequential Supabase round-trips** (~3–8 min): per-row rank updates and a 50×21×2 cumulative loop in `calculate-points.ts` (lines ~382-404), 180×21×2 reads in `generateRidersJSON` (`json-generators.ts:290-338`) — which runs **twice** because `generateRiderRankingsJSON:371` recomputes it. Vercel's ceiling is 300s with Fluid compute (10–60s legacy). Today it only "works" because it's accidentally split over multiple invocations and few stages were complete. **Mandate:** rewrite scoring + generators to bulk reads (whole points/results tables in single queries — a few thousand tiny rows — join in memory) and bulk upserts; target < 10s total; set `maxDuration: 300` as belt-and-braces; verify Fluid compute is enabled on the Vercel project. After that, one atomic call is trivially safe and no job/status machinery is needed.

### F11. Robustness odds-and-ends 🟢
- **Backup/audit (red-team):** Supabase free tier has no backups and the schema file starts with cascading DROPs. Cheap fixes: log every raw submitted stage payload to a `stage_entry_log` table before processing (replayable + dispute audit trail); versioned snapshots already give public-data rollback; optional weekly `pg_dump` GitHub Action.
- **Observability:** Vercel Hobby keeps logs ~1h. Write publish outcome (success/fail + timestamp) into the pointer file so the admin stage list shows it. No monitoring SaaS needed.
- `submit-stage-results` sequential fuzzy RPC per rider (~50 round-trips) — fold into the bulk refactor.
- Frontend: consolidate duplicated page logic into shared components/hooks during polish; keep the design tokens in `index.css` `@theme`.

## Scoring specification — verified against the live 2026 Excel

*Added after analyzing the real poule administration (anonymized export, standings after stage 4 of the 2026 Tour, 137 participants). The repo's rider-level scoring was recomputed against 332 rider-stage cells with **zero mismatches**, and all 137 participants' stage totals recompute exactly — but only after applying three rules the app does not implement yet. This section is the authoritative rule set v2 must reproduce.*

### Per stage

| Rule | Points | Status in repo |
|---|---|---|
| Stage finish, positions 1–20 | 25, 19, 18, 17, … , 1 | ✅ matches `lib/scoring-constants.ts` |
| Yellow jersey (after the stage) | 15 | ✅ matches |
| Green / polka-dot / white jersey | 10 each | ✅ matches |
| Combativity ("rode rugnummer") | 5 | ✅ matches |
| **Dagploeg** — the stage winner's team | **6 to every participant whose chosen *Ploeg* is that team** | ❌ **missing** |

The Dagploeg rule implies a selection dimension the schema lacks: besides 10 riders + 1 reserve, **every participant also picks one team ("Ploeg")**. The stage winner's team is already stored (`stages.winning_team` — until now unused); what's missing is the participant's team pick and the +6 award in the scoring step.

### Participant stage score

Sum of the points of the participant's 10 active riders, **plus** the reserve rider's points when activated, **plus** 6 if their Ploeg is the stage's Dagploeg.

**Reserve rule** as observed in the data: the position-11 reserve replaces a main rider who does not start; in the current Tour all activations run from stage 1 (pre-race non-starters). Whether a mid-Tour DNS also activates the reserve for the remaining stages must be confirmed with the pool rules before implementation (the app's current substitution code assumes it does — see F3 for the bug that makes the substituted reserve score zero either way).

### End-of-Tour bonuses ("Bonuspunten eind") — ❌ missing entirely

Awarded once, after stage 21, at rider level (participants benefit through the riders they hold):

| Final classification | Bonus |
|---|---|
| GC winner / 2nd / 3rd | 100 / 50 / 25 |
| Final green jersey | 50 |
| Final polka-dot jersey | 50 |
| Final white jersey | 50 |

Implementation note: this needs a small "eindklassement" entry step in the admin (GC top-3 + final jersey holders) and one extra scoring pass; the snapshot format already has an `eind` column concept in the original Excel.

### Directie klassement — ❌ implemented differently (produces different rankings)

Verified formula: participants are grouped per directie; the group score is the **average of the top-5 members' cumulative totals** (e.g. group EB after stage 4: top-5 totals 483+461+444+407+394 → ÷5 = 437.8, exactly as shown). The repo instead **sums the top-5 per-stage scores stage by stage** — different semantics that ranks groups differently. `TOP_N_FOR_DIRECTIE = 5` survives; the aggregation must change to *average of top-5 cumulative*.

### Why this matters beyond correctness

The Excel itself contained a live data-entry defect: in one participant's block the per-rider point values are shifted one row relative to the rider names (totals happen to remain right). That's the failure mode manual spreadsheet administration invites, and exactly what the validated entry flow (F5) eliminates.

**Schema/pipeline impact summary:** add a team pick per participant (column or table) + award Dagploeg points from `stages.winning_team`; add an end-of-Tour bonus entry + scoring pass; change directie aggregation to average-of-top-5-cumulative. Golden test fixtures can be extracted from the 2026 Excel (anonymized, P-coded) so the new engine must reproduce the real standings — planned as a follow-up.

*Privacy note: the "anonymous" Excel export still contains two real participant names and one fully named block on the first sheet — regenerate the anonymization before sharing that file further.*

## Target architecture (concrete)

1. **Publish pattern — immutable versions + mutable pointer (fixes F2, gives atomicity + rollback for free):**
   - Publish uploads the 6 JSONs to `data/<season>/<runId>/*.json` (immutable, long cache OK), then overwrites one small pointer `data/current.json` (`cacheControlMaxAge: 60`) containing `{ season, runId, last_updated, publish_status }`.
   - Public app: React Query polls the pointer every ~60s during race hours + `refetchOnWindowFocus: true`; data queries keyed on `runId` → readers always see one **consistent** snapshot set; worst-case freshness ≈ 2 min.
   - Rollback = re-point to the previous `runId`; keep last N runs; season archive = copy final run to `archive/<year>/`.
   - Frontend gets the Blob base URL from a build-time env var; verify blob CORS (`access-control-allow-origin: *`) with `curl -I` during implementation.
2. **Auth (fixes F1):** Supabase Auth **email OTP (6-digit code)** — not magic links, whose "opened in the wrong browser" failure mode is exactly what trips non-technical users; sessions persist per device. Allowlist via `ADMIN_EMAILS` env var checked in one shared `requireAdmin(req)` helper (`lib/`) used by **every** write route (verify via `supabase.auth.getUser(bearer)`; writes are rare, the extra round-trip is fine). Disable public signups in Supabase. Service-role key stays server-only; RLS write policies stay closed. Keep a static bearer token for any future scripted/scraper submission.
3. **Pipeline as library (fixes F3, F10, half of F5):** `validate → transactional swap → recalculate (bulk) → snapshot → publish pointer` as direct calls in `lib/`, exposed by **one** authenticated handler. Backup-substitution scoring fixed and stage-scoped (`replaced_at_stage`), raw payload logged to `stage_entry_log` first.
4. **Admin app (fixes F4–F6):** `/admin/*` lazy route tree in the same SPA behind the OTP session: stage list with statuses; paste-and-parse entry with fuzzy review; scraper prefill button; "Nieuw seizoen" imports; content editor for editorial texts.
5. **Season lifecycle (fixes F7):** incremental migrations; non-destructive new-season reset script; snapshot archives in Blob; 2027 team intake via form→CSV→fuzzy-review import (in-app picker optional later).
6. **Tests + CI:** golden scoring tests (incl. substitution + reprocess scenarios) on real 2025 fixtures; parser fixtures for both paste formats incl. accents; lint/typecheck/test on PR.

## Roadmap (re-timed to your answer: 2026 PoC now, 2027 live)

- **Sprint A — PoC during this Tour (small, demonstrable):** versioned-pointer publish + client caching fix (F2); merge entry into one atomic server call with validate-before-delete (F3 entry half); fix the backup-rider scoring bug + add the one golden test that proves it (F3); minimal lockdown — admin route behind OTP login for just your email, out of public nav (F1). You enter 2026 stages by hand as the demo. Everything else waits.
- **Sprint B — off-season core build:** implement the three verified-but-missing scoring rules (Ploeg/Dagploeg pick, end-of-Tour bonuses, directie = avg top-5 cumulative — see Scoring specification); bulk-query refactor of scoring + generators (F10); paste-and-parse + review screen + statuses + drafts + Dutch errors + mobile-first (F5); "Nieuw seizoen" imports (F6); full auth for 3–5 editors; content table + Over deze Poule; incremental migrations + non-destructive reset + archive 2025/2026 (F7); repo hygiene incl. Tailwind v4 stable (F8); test suite + CI (F9); `stage_entry_log` + publish-status surfacing (F11).
- **Sprint C — pre-Tour 2027 go-live:** seed the season via the new imports; participants submit teams via form → import; full dry-run on one historical stage; go-live checklist (Fluid compute on, env vars, allowlist, backup job).
- **Ongoing — frontend polish (your track):** shared table/card components, consolidate duplicated logic, error boundaries.

## Evaluated and rejected

- **External headless CMS** — wrong model for relational, computed, reviewed data; adds a third store/vendor.
- **Frontend querying Supabase directly** — loses cheap/fast/failure-isolated static reads; snapshots stay.
- **Next.js/ISR rewrite** — framework migration the problems don't require; pointer pattern achieves the goal.
- **Fully automated scraper as primary input** — unreliable per your experience; silently-wrong is worse than ask-a-human.
- **Editions table throughout the schema** — most expensive multi-year option; archive-and-reset gives the same user-visible result (browsable archives) for a fraction of the cost, since the public site never reads the DB.
- **Job/status pattern for publishing** — unnecessary once the bulk refactor puts the pipeline under ~10s.
- **Server-side draft storage, monitoring SaaS, admins table** — over-engineering at 3–5 editors / 50 readers.

## Decisions — resolved and defaulted

Resolved by you: 2026 PoC now + 2027 live; you alone bootstrap 2026, form-based team intake in 2027; 3–5 editors (→ OTP + env allowlist).
Defaults I've chosen (flag now if you disagree): **archive-and-reset** over editions surgery; backup posture = entry log + versioned snapshots (+ optional weekly `pg_dump`); rollback via manual re-point (no UI button initially); **archive the 2025 data** before any reset; verify Fluid compute / Hobby plan settings in the Vercel dashboard during Sprint A.

## Verification

- **Sprint A:** enter a real 2026 stage end-to-end in a browser; confirm the public site shows it within ~2 min without redeploy or hard reload; golden test proving a DNS-substituted backup scores; attempt an unauthenticated POST to every write route and confirm 401.
- **Sprint B:** golden scoring tests green against 2025 fixtures; paste both supported formats (incl. accented names) and confirm review-screen matches; kill the tab mid-entry and confirm draft restore; timed full pipeline run < 10s at 21 completed stages.
- **Sprint C:** dry-run a full season bootstrap from a fresh clone using only the admin UI + documented steps.
