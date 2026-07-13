# TdF Pool v2 — Implementation Plan (handoff document)

*Written July 2026. Companion to `docs/architecture-review.md` (the "planning doc"). This document is the
execution-ready version: every claim below was re-verified against the code in this repo, file/line
references are current as of commit `a750f77`, and everything that is still ambiguous is flagged
explicitly in the **Open questions** section with a suggested default. A future implementation session
(Sonnet/Opus) should be able to work from this document alone, consulting the planning doc only for
background rationale.*

**How to use this document**

0. A third review pass (full code read, July 2026) added the **Round 3 addendum** at the bottom of this
   file: facts 23–37, corrections R13–R24, questions Q19–Q22, amendments to several WPs, and two
   changes to the Phase-A execution order. Read it together with the sections it amends — where the
   addendum contradicts the original text, the addendum wins.
1. Read *Ground rules* and *Verified system map* first — they are the facts.
2. Before starting a work package (WP), read its section **and** the open questions it references.
   Questions marked **BLOCKER** must be answered by the owner (Lars) before that WP is implemented;
   questions marked *default OK* have a safe suggested default you may implement without asking.
3. Implement WPs in the order given in *Execution order* — dependencies are real (e.g. the bulk
   refactor must precede the atomic single-call pipeline).
4. The golden fixtures in `data/2026/fixtures/` are the acceptance test for all scoring work. The new
   engine must reproduce `expected_standings.json` exactly. Do not "fix" the fixtures to match the code.

---

## Ground rules (owner's constraints — do not re-litigate)

- **3–5 non-technical editors** run in-Tour operations from 2027; **manual entry is the primary input**
  (the Python scraper is demoted to an optional prefill).
- **2026 = proof of concept**, operated by the owner alone, during the currently running Tour;
  **2027 = real live edition** with participants submitting teams via a form.
- **Multi-year** reuse required; **archive-and-reset** was chosen over an `editions` table (decided).
- The **frontend design direction stays** (design tokens in `src/index.css` `@theme`).
- Admin UI language is **Dutch**; admin UI must be **mobile-first**.
- Architecture stays: normalized Supabase DB as source of truth → pre-computed JSON snapshots on
  Vercel Blob → static-reading public SPA. No headless CMS, no direct Supabase reads from the public
  frontend, no Next.js migration, no job/status machinery (all explicitly rejected — see planning doc
  "Evaluated and rejected").

---

## Verified system map (facts, with file:line)

### Stack
Vite + React 18 SPA (`src/`), Vercel serverless functions (`api/`, `@vercel/node`), shared server code
in `lib/`, Supabase (Postgres + RLS), Vercel Blob for JSON snapshots, Tailwind **v4.0.0-alpha.25**
(dead alpha — see WP-B8), Python scrapers in `scripts/`.

### Data flow today (broken in the middle)

| # | Fact | Evidence |
|---|------|----------|
| 1 | Entry UI `EtappeBeheer` is in the **public nav**, no auth anywhere | `src/App.tsx:14`; `grep -r "req.headers" api/` → 0 hits |
| 2 | All API routes write with the **service-role key** | every file in `api/` creates its client with `SUPABASE_SERVICE_ROLE_KEY` |
| 3 | Save is **two browser-orchestrated calls**: `manual-entry` then `process-stage` | `src/pages/EtappeBeheer.tsx:233,249` |
| 4 | `manual-entry` **deletes all existing stage data before validating** the new payload | delete at `api/admin/manual-entry.ts:99-102`, first content validation (`top_20_finishers` non-empty) at `:105-110` |
| 5 | `manual-entry` matches riders by **exact name** (`Map` on `riders.name`) and only *warns* on misses; the UI **discards the warnings** (checks `response.ok` only, never reads the body) | `api/admin/manual-entry.ts:96,113-118`; `src/pages/EtappeBeheer.tsx:243-246` |
| 6 | `manual-entry` **never writes `stages.winning_team`** — only the scraper path does | `api/admin/manual-entry.ts:54-69` (upsert has no `winning_team`); `api/submit-stage-results.ts:161-186` derives it |
| 7 | `process-stage` HTTP-fetches its own sibling endpoints via `VERCEL_URL` | `api/admin/process-stage.ts:63-98`, `lib/api-utils.ts:18-35` |
| 8 | Backup-rider bug: activation sets `is_active: true` but leaves the rider at **position 11**; scoring only counts `.lte('position', 10)` → substituted backups score **0 forever** | `api/admin/update-active-selections.ts:140-147`; `api/admin/calculate-points.ts:243-245` |
| 9 | `is_active` is a **global** flag (not stage-scoped); `replaced_at_stage` is written (`update-active-selections.ts:129-135`) but **never read by scoring** | `api/admin/calculate-points.ts:241-245` |
| 10 | The substitution is also invisible in the UI: `generateTeamSelectionsJSON` filters `position <= 10` | `lib/json-generators.ts:534` |
| 11 | Massive N+1: per-row rank updates (`calculate-points.ts:214-221,354-361,413-419`), participants × stages cumulative loop with 2 round-trips per cell (`:382-404`), rank-change loop with 3 per participant (`:431-455`); generators: per-participant-per-stage contributions query (`json-generators.ts:126-133`), per-directie-per-stage query (`:176-196`), per-rider-per-stage **two** queries (`:295-312`), and `generateRiderRankingsJSON` **re-runs all of `generateRidersJSON`** (`:371`) | as cited |
| 12 | Publishing never reaches readers: blob `put()` calls use fixed paths + `allowOverwrite`, **no `cacheControlMaxAge`** (Vercel Blob default: 1 month, browser-side too) | `api/admin/process-stage.ts:128-159` |
| 13 | The frontend fetches `/data/*.json` **from its own origin** — those files are not produced by anything in the repo (`scripts/manage-data.js` referenced in `package.json:13-18` does not exist; `public/` contains only `assets/` and an svg) | `lib/config.ts:28-35`; `vercel.json` `/data` rewrite is an identity no-op |
| 14 | Client caching would hide updates anyway: `STALE_TIME: Infinity`, all refetch flags off | `lib/constants.ts:138-145` |
| 15 | Schema is a **destructive** single file (starts with cascading `DROP TABLE`s); no migrations | `supabase/supabase-schema.sql:4-20` |
| 16 | RLS: public read on everything, stages/results only when `is_complete = true`; **no write policies** (service-role only, correct) | `supabase-schema.sql:369-421` |
| 17 | Fuzzy RPC strips accents to nothing: `regexp_replace(search_name, '[^a-zA-Z ]', '', 'g')` turns "Pogačar" into "Pogaar" | `supabase-schema.sql:336` |
| 18 | Yearly bootstrap has no path: `seed-participants`/`seed-stages` scripts referenced in `package.json:11-12` don't exist (`scripts/` holds only 3 Python files) | verified |
| 19 | README drift: documents deleted `Login.tsx` (`README.md:48`), `src/lib/queries/` (`:55`), wrong schema filename `supabase/migrations/initial_schema.sql` (`:24`) | verified |
| 20 | Dead/unused: `zustand`, `date-fns`, `tree` deps (`package.json`); `src/hooks/useBusinessLogic.ts` (dead, duplicates page logic); `tailwind.config.ts` (v3 leftover, ignored by v4); `data/*.json` top level = v1 legacy | verified |
| 21 | Scoring engine has **zero tests**; repo has no test runner configured at all | verified |
| 22 | `generateRidersJSON` filters `riders.is_active = true`, but nothing in the codebase ever sets a rider inactive | `lib/json-generators.ts:273`; see Q14 |

### Scoring code today vs. the verified rules

Implemented and correct: stage-finish points 25/19/18…1 (`lib/scoring-constants.ts:12-33`), jerseys
15/10/10/10 (`:38-43`), combativity 5 (`:48`).

Missing or wrong (all fixture-verified — see next section):
- **Dagploeg +6** — not implemented at all; no participant "Ploeg" pick exists in the schema.
- **End-of-Tour bonuses** — not implemented at all; no entry step, no storage.
- **Directie klassement** — implemented as *sum of top-5 per-stage scores, stage by stage*
  (`lib/json-generators.ts:193-203` + `calculate-points` never writes `directie_stage_points` at all —
  the directie board is computed only inside the JSON generator). The verified rule is *average of
  top-5 **cumulative** totals*. Different semantics, different rankings.
- **Reserve/backup scoring** — broken as per fact 8/9 above.

---

## Authoritative scoring specification (fixture-verified)

This restates the planning doc's spec **plus clarifications discovered while inspecting the fixtures**.
The fixtures in `data/2026/fixtures/` are the ground truth (128 participants, stages 1–4 of the 2026
Tour, extracted from the live Excel; all 128×4 stage totals recompute exactly).

### Per rider, per stage
| Rule | Points |
|---|---|
| Stage finish pos 1–20 | 25, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 |
| Yellow jersey after the stage | 15 |
| Green / polka-dot / white jersey | 10 each |
| Combativity ("rode rugnummer") | 5 (may be **absent** for a stage — fixture `stage_1.json` has `combativity: null`) |

### Per participant, per stage
Sum of the rider points of the participant's **active roster for that stage** (10 main riders, with the
position-11 reserve replacing a non-starting main rider — see Q1–Q4), **plus 6** if the participant's
**Ploeg** (team pick) equals the stage's **Dagploeg** (the stage winner's team).

### Directie klassement (per stage snapshot)
Participants grouped per (canonicalized) directie. Group score = **sum of the top-5 members'
cumulative totals ÷ 5** — **the divisor is always 5, even when the group has fewer than 5 members**.
Fixture proof: directie "Consumenten" has exactly 1 member with cumulative 508 after stage 4 and the
sheet score is **101.6** (= 508/5). (`expected_standings.json → directie_scores_computed`.)

### End-of-Tour bonuses (once, after stage 21, at rider level)
GC 1st/2nd/3rd: 100/50/25; final green: 50; final polka-dot: 50; final white: 50. Participants benefit
through the riders they hold. (See Q6 for stacking and Q7 for how they surface in standings.)

### Fixture-format notes an implementer must handle
- `team_selections.json`: rider names are **case-inconsistent** ("TADEJ POGACAR" vs "Tadej Pogacar")
  and **ASCII-folded** ("Felix Grossschartner", no umlaut). The golden-test loader must match rider
  names case-insensitively after uppercasing/trimming; do **not** rely on accent handling here.
- One participant (of 128) has only **9 riders** (empty slot in the source sheet) — the engine must not
  crash on rosters < 10 and must simply sum what exists.
- `reserve_active` is a plain boolean; all observed activations run **from stage 1** (pre-race
  non-starters). The fixture has no per-stage activation info (see Q1/Q2).
- `directie` is raw free text with case variants (`DTE`, `DTe`, `Dte`, `DtE`) **and** the expected
  standings merge several codes into one group: `DI`, `DBV`, `Directie i-Domein`, and `TDA` together
  form the group **"DI - DBV - iDomein - TDA"** (`expected_standings.json → directie_groups`). So
  canonicalization needs an **explicit mapping table**, not just case-folding (see Q8).
- `stage_results/stage_N.json` carries `dagploeg` (stage winner's team name, uppercase) per stage —
  use it directly in tests; in production it must come from `stages.winning_team` (see WP-B1).
- Ploeg picks across all 128 participants use only **10 distinct team names** (uppercase, e.g.
  "UAE TEAM EMIRATES XRG") — teams should become reference data (see Q5).

---

## Corrections and additions to the planning doc (from this review)

These are things the planning doc gets slightly wrong, leaves implicit, or misses. Numbered R1… so WPs
can reference them.

- **R1 — `manual-entry` never writes `winning_team`.** The planning doc says the stage winner's team
  "is already stored (`stages.winning_team`)" — true for the *scraper* path only
  (`api/submit-stage-results.ts:161-186`). The **primary** input path (manual entry) never sets it, so
  as things stand the Dagploeg rule would silently award 0 every manually-entered stage. The new entry
  flow must derive `winning_team` server-side from the position-1 finisher's `riders.team` (and surface
  it in the review screen for confirmation).
- **R2 — Directie divisor is fixed at 5.** "Average of top-5" is ambiguous for groups with < 5 members;
  the fixture proves the divisor is always 5 (Consumenten: 508/5 = 101.6). Implement `sum(top-5) / 5.0`
  unconditionally, keep one decimal in display (scores are non-integers, e.g. 437.8 — the current
  `directie_stage_points` integer columns can't hold this; see WP-B1 schema notes).
- **R3 — Golden-fixture inconsistency in the planning doc.** F9 and the roadmap say golden tests run
  "against real **2025** fixtures", but the authoritative fixtures with expected outputs are the **2026**
  set (`data/2026/fixtures/`). The legacy `data/2025/stage_results/` (2025, stages 1–12 only, scraped JSON
  with `team`/`bib`/accented names) has **no expected standings** and can't serve as a golden set.
  Resolution: golden scoring tests = `data/2026/fixtures`; the 2025 files are useful only as *realistic
  rider-name input* for parser/fuzzy-matching tests. Update F9's wording mentally wherever you see it.
- **R4 — Paste-parser fixtures do not exist yet.** F5 mandates two paste formats (procyclingstats
  table, NOS-style list) with golden fixtures — but the repo contains **no raw paste-text samples**;
  `data/2025/stage_results/*.json` is structured scraper output, not paste text. Real paste samples must be
  collected before the parser is built (see Q11, BLOCKER for that sub-task only).
- **R5 — OTP + "disable public signups" interact.** `supabase.auth.signInWithOtp()` **creates** a user
  by default. With signups disabled, sign-in fails for users that don't exist yet. Correct recipe: call
  it with `options: { shouldCreateUser: false }` and pre-create the 3–5 editor accounts (dashboard
  invite or admin API) — the `ADMIN_EMAILS` allowlist check in `requireAdmin` remains the actual
  authorization layer; Supabase Auth only authenticates.
- **R6 — Directie board is generator-only today.** `directie_stage_points` (the table) is never written
  by `calculate-points`; the directie leaderboard exists only inside `generateLeaderboardsJSON`. The
  rework can either start writing that table (and fix its integer `stage_points`/`cumulative_points`
  columns to numeric) or drop the table and keep the board snapshot-only. Recommendation: **snapshot-only,
  drop the table** — nothing reads it, and archive-and-reset means the DB needn't keep it (one less
  thing in the bulk refactor). Flag in PR description either way.
- **R7 — No transactions anywhere.** `calculate-points` does delete-then-insert across three tables with
  no transaction (`calculate-points.ts:75-79`); `manual-entry` deletes four tables row-set before
  inserting. The rework should put the whole *validate → swap → recalc* path inside a single Postgres
  function (RPC) or at minimum make every step idempotent-by-regeneration. Supabase JS has no
  client-side transactions — an RPC (plpgsql) is the realistic way to get atomicity.
- **R8 — `process-stage` self-fetch breaks on protected preview deployments.** `getApiUrl` uses
  `VERCEL_URL`; on preview deployments with Vercel Deployment Protection the self-fetch gets an auth
  page. Moot once WP-A2 turns the pipeline into direct library calls — mentioned so nobody "fixes" the
  URL instead of removing the HTTP hop.
- **R9 — Ranking ties are unspecified.** All rank assignments today are "array order after sort"
  (arbitrary for equal points). The fixtures happen not to exercise a tie at the observable level. See
  Q9 for the decision; implement deterministically either way (stable secondary sort), or ranks will
  jitter between recomputes and pollute `rank_change` values.
- **R10 — `stages` upsert on re-entry can regress metadata.** `manual-entry.ts:54-69` upserts explicit
  `null` for any field not in the payload — a re-entry that omits e.g. `distance` erases it. The new
  entry flow pre-seeds stage metadata (F5) and should stop accepting metadata from the entry form
  altogether (results-only payload), which dissolves this.
- **R11 — 2025 archive source is incomplete in-repo.** The plan says "archive the 2025 data as the
  first historical entry", but the repo only holds 2025 stages 1–12 (`data/2025/stage_results/`) in v1
  format, and no final standings. Whether complete 2025 data exists elsewhere (production DB? blob?
  Excel?) is unknown → Q13.
- **R12 — Admin reads must bypass public RLS.** Public RLS hides incomplete stages; the admin stage
  list therefore must keep reading via server routes (`api/admin/stages-list.ts` exists) — don't be
  tempted to move admin reads to the anon client. All `api/admin/*` routes (including GET ones like
  `riders-list`/`stages-list`) go behind `requireAdmin`.

---

## Open questions — answer before (or while) implementing

**BLOCKER** = needs the owner's answer; *default OK* = suggested default is safe to implement.

| # | Question | Suggested default | Gates |
|---|----------|-------------------|-------|
| Q1 | **Reserve rule, mid-Tour DNS:** does the reserve also activate when a main rider DNSes *mid-Tour* (not just pre-race), for the remaining stages? The Excel only shows pre-race activations; the current code assumes yes. **BLOCKER** (pool rules) | Assume **yes** (matches current code's intent) but make it a constant/flag so it's one-line reversible | WP-A3, WP-B1 |
| Q2 | **Reserve start stage:** when a DNS happens before stage N, does the reserve score from stage N (inclusive) onward? And never retroactively? | Yes: reserve scores for stages ≥ activation stage, never before | WP-A3 |
| Q3 | **DNF vs DNS:** a rider who *abandons mid-stage* (DNF) — does the reserve activate for subsequent stages, or only for DNS? Current code triggers **only on DNS** (`update-active-selections.ts:69`). **BLOCKER** (pool rules; affects real standings) | Keep DNS-only until answered | WP-A3 |
| Q4 | **Second casualty:** with the single reserve already used, a second DNS just means the participant rides with 9 scorers, correct? (Current code effectively does this.) | Yes — no second substitution | WP-A3 |
| Q5 | **Team ("Ploeg") canonicalization:** rider `team` is free text on `riders`; participant Ploeg picks must equal the stage winner's team *string* for +6. Make teams a reference table (`teams`) with FKs from `riders.team_id` and `participants.ploeg_team_id`? | Yes — reference table; import from startlist; fuzzy-review on import like riders | WP-B1, WP-B4 |
| Q6 | **End bonuses stacking:** if one rider wins GC *and* the polka-dot (plausible), do bonuses stack (100+50)? | Yes, sum them | WP-B1 |
| Q7 | **End bonuses presentation:** do they surface as a virtual "eind" column/stage in standings (the Excel has an `eind` concept) and do they count toward the directie averages? | Store as a separate `final_bonus` pass; include in cumulative totals and directie averages; show as an "Eind" column | WP-B1 |
| Q8 | **Canonical directie list + merged groups:** who defines the mapping (e.g. `DI`+`DBV`+`Directie i-Domein`+`TDA` → one combined group)? Is the combined group a 2026 one-off? **BLOCKER** for 2027 intake; for 2026 the fixture mapping is authoritative | Make `directie` a reference table + an alias/mapping table seeded from `expected_standings.json → directie_groups` | WP-B1, WP-B4 |
| Q9 | **Tie handling in ranks** (participants, riders, directies): competition ranking ("1224"), and what secondary order? | Competition ranking; deterministic secondary sort by name; document it on the Klassement page | WP-B2 |
| Q10 | **Pointer polling window:** "poll every ~60s during race hours" — how are race hours determined? | Skip the schedule logic: poll every 60s whenever the tab is visible (`refetchInterval` + `refetchIntervalInBackground: false`), `refetchOnWindowFocus: true`. Cost is trivially small | WP-A1 |
| Q11 | **Paste format samples:** need ≥2 real paste samples each for procyclingstats and NOS (incl. accents, DNF markers). **BLOCKER** for the parser sub-task only — owner must paste real samples into fixture files | Collect during the current Tour while it's live | WP-B3 |
| Q12 | **Stage calendar source for pre-seeding** (F5 says editors never type stage metadata): which source/format does the owner want to paste for the 21-stage calendar? | Simple tab/CSV paste (`stage_number, date, departure, arrival, type`) with a review screen, same pattern as other imports | WP-B4 |
| Q13 | **2025 archive completeness:** repo has only stages 1–12 of 2025 and no final standings. Does complete 2025 data exist (prod DB? blob? Excel)? If not, is archiving 2025 dropped? | If no complete source exists, archive 2026 as the first historical edition and drop the 2025 goal | WP-B7 |
| Q14 | **`riders.is_active` semantics:** nothing ever sets it false, but `generateRidersJSON` filters on it. Intended as "in this year's startlist"? | Redefine as "on current season startlist", set by the Nieuw-seizoen import; DNF/DNS riders stay active (they keep their earned points) | WP-B4 |
| Q15 | **Vercel plan & Fluid compute:** planning doc assumes Hobby + Fluid (300s ceiling). Verify in the dashboard; also confirm Supabase tier (free tier = no backups, which motivates the entry log / pg_dump) | Check during WP-A0; record in README | WP-A0 |
| Q16 | **`ADMIN_EMAILS` initial value:** presumably `lars.login@pm.me` for 2026. Confirm and configure in Vercel env | As stated | WP-A4 |
| Q17 | **Blob base URL exposure:** frontend needs the Blob store origin as a build-time env (`VITE_DATA_BASE_URL`). Confirm the store URL and that CORS (`access-control-allow-origin: *`) holds — verify with `curl -I` | Standard Vercel Blob public store; verify during WP-A1 | WP-A1 |
| Q18 | **Where do 2026 team selections enter the DB?** The PoC needs the 128 participants + selections + ploeg + directie in Supabase for the live demo. Import `data/2026/fixtures/team_selections.json` via a one-off script, or wait for the WP-B4 UI? | One-off idempotent script (`scripts/import-fixtures-2026.ts`) — the PoC shouldn't wait for the admin import UI | WP-A3 |

Also inherited-but-unresolved from the planning doc: the *privacy note* — the "anonymous" Excel export
(outside this repo) still contains two real participant names; regenerate before sharing. The repo
fixtures themselves are clean (P-coded).

---

## Work packages

### Phase A — PoC during the current Tour (small, demonstrable)

#### WP-A0 — Environment verification (half a day)
Check and record: Vercel plan, Fluid compute enabled, `maxDuration` capability, Blob store name/URL +
CORS header (Q17), Supabase tier, presence of `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
`BLOB_READ_WRITE_TOKEN` envs. Output: short section appended to README. (Q15, Q17)

#### WP-A1 — Versioned publish + pointer (fixes F2)
**Server (publish step):**
- New `lib/publish.ts`: upload the 6 JSONs to `data/<season>/<runId>/<name>.json`
  (`runId` = timestamp + short random; immutable → long cache fine), then overwrite pointer
  `data/current.json` with `{ season, run_id, last_updated, publish_status: "ok" | "failed", files: {...} }`
  using `cacheControlMaxAge: 60` and `allowOverwrite: true`.
- Keep the last N (say 10) runs; delete older ones (`list()` + `del()`); never delete `archive/`.
- Rollback = manually re-point `current.json` at a previous `runId` (no UI initially — decided).
**Frontend:**
- `lib/config.ts`: base URL from `import.meta.env.VITE_DATA_BASE_URL`; pointer query with
  `refetchInterval: 60_000`, `refetchOnWindowFocus: true` (Q10); data queries keyed on `run_id` so a
  pointer flip atomically swaps the whole snapshot set; kill the `Infinity`/refetch-off config in
  `lib/constants.ts:138-145` for these queries.
- Delete the dead `/data` rewrite assumption; remove `deploy:data*`/`predeploy` scripts from
  `package.json` (they reference a nonexistent `scripts/manage-data.js`).
**Acceptance:** publish a stage → public site reflects it within ~2 min with no redeploy/hard reload;
`curl -I` on pointer shows `cache-control` ≤ 60s; flipping the pointer back shows the old data.

#### WP-A2 — One atomic entry endpoint (fixes F3 entry half)
Replace the two-call flow with **one** authenticated route, e.g. `POST /api/admin/enter-stage`:
1. Parse + **fully validate** payload (all rider names resolved, positions 1–20 unique, jerseys
   resolvable; combativity optional — fixtures prove it can be absent).
2. Log the raw payload to `stage_entry_log` (WP-B10 table; create it now, it's one `CREATE TABLE`).
3. Transactional swap of the stage's rows (delete+insert inside an RPC — R7). Derive and store
   `winning_team` from the position-1 finisher's team (**R1**).
4. Recalculate + regenerate + publish (calls `lib/` functions directly — no HTTP self-fetch, R8).
5. Respond with warnings/substitutions; UI must render them blocking-visible (fact 5).
`EtappeBeheer.tsx` calls this single endpoint. Keep `api/admin/process-stage.ts` temporarily as a thin
wrapper or delete it and update callers; the Python `submit_to_api.py` path can break for the PoC
(scraper is optional prefill later).
**Note:** until WP-B2 lands, the recalculate step is still slow — acceptable mid-Tour with few stages,
but set `maxDuration: 300` on the route now (belt and braces, planning doc F10).
**Acceptance:** submitting an empty/garbled payload changes nothing in the DB (validate-before-delete);
a valid submit is one click → site updates.

#### WP-A3 — Fix backup-rider scoring + roster-as-of-stage (fixes F3 core)
- Scoring must derive **roster-as-of-stage** instead of trusting `is_active`/`position <= 10`:
  for stage *s*, a participant's scorers = main riders (pos 1–10) whose `replaced_at_stage` is `NULL`
  or `> s`, **plus** the reserve (pos 11) if any main rider has `replaced_at_stage <= s`
  (subject to Q1–Q4 answers).
- `update-active-selections` keeps recording `replaced_at_stage`/`replacement_for_rider_id`; it stops
  being the thing scoring depends on for *which stage* (fixes the force-reprocess-after-substitution
  case, F3-related).
- Import the 2026 participants/selections/ploeg/directie via a one-off script (Q18) so the PoC scores
  the real pool.
- Add the **first golden test**: a DNS-substitution scenario proving the reserve scores (this is the
  test that would have caught the bug), plus a force-reprocess-an-early-stage scenario. Test runner:
  **vitest** (natural fit for Vite; add as devDependency — this is the moment the repo gets tests).
**Acceptance:** both tests green; a substituted reserve visibly contributes points in the UI snapshot.

#### WP-A4 — Minimal auth (fixes F1 for the PoC)
- Supabase Auth **email OTP (6-digit)**, `shouldCreateUser: false`, pre-created owner account (R5, Q16).
- `lib/require-admin.ts`: reads `Authorization: Bearer <jwt>`, verifies via `supabase.auth.getUser()`,
  checks email against `ADMIN_EMAILS` env (comma-separated, case-insensitive). Applied to **every**
  `api/` write route *and* admin GET routes (R12). Unauthenticated → 401 JSON.
- Frontend: remove Etappe Beheer from the public nav (`src/App.tsx:14`); `/admin/*` route with a
  Dutch OTP login screen; persist session (Supabase default localStorage).
- Disable public signups in the Supabase dashboard; keep a static bearer token check (constant-time
  compare against `SCRAPER_TOKEN` env) as an alternative accepted credential for future scripted
  submissions.
**Acceptance:** unauthenticated POST to every write route → 401 (scripted check); OTP login on a phone
works; admin invisible in public nav.

### Phase B — off-season core build

#### WP-B1 — The three missing scoring rules (see Scoring specification)
Schema (as incremental migrations — WP-B7 conventions):
```sql
-- teams as reference data (Q5)
CREATE TABLE teams (id uuid PK, name text UNIQUE NOT NULL);
ALTER TABLE riders ADD COLUMN team_id uuid REFERENCES teams(id);      -- backfill from riders.team
ALTER TABLE participants ADD COLUMN ploeg_team_id uuid REFERENCES teams(id);
ALTER TABLE stages ADD COLUMN winning_team_id uuid REFERENCES teams(id); -- replaces free-text winning_team
-- directie canonicalization (Q8)
CREATE TABLE directie_alias (alias text PRIMARY KEY, directie_id uuid REFERENCES directie(id));
-- end-of-tour bonuses (Q6, Q7)
CREATE TABLE final_classifications (
  id uuid PK, classification text CHECK (classification IN ('gc_1','gc_2','gc_3','green','polka_dot','white')) UNIQUE,
  rider_id uuid REFERENCES riders(id)
);
-- dagploeg points live on participant_stage_points
ALTER TABLE participant_stage_points ADD COLUMN dagploeg_points integer NOT NULL DEFAULT 0;
```
- **Dagploeg:** +6 into `participant_stage_points.dagploeg_points` (included in `stage_points`) when
  `participants.ploeg_team_id = stages.winning_team_id`. Surface it in the leaderboard JSON as its own
  field (it is not a rider contribution — the UI's `stage_rider_contributions` map can't represent it).
- **End bonuses:** small admin "Eindklassement" entry step (GC top-3 + 3 final jerseys) + one extra
  scoring pass after stage 21; bonuses stack per rider (Q6 default); included in cumulative totals and
  directie averages, displayed as an "Eind" column (Q7 default).
- **Directie:** aggregation = `sum(top-5 cumulative) / 5.0` per R2; computed in the generator from
  participant cumulative totals (R6: drop `directie_stage_points`); scores are decimals — types/format
  must carry one decimal.
- Directie becomes a proper reference: `participants.directie_id` already exists; the alias table maps
  the free-text variants; seed both from the fixture's `directie_groups`.
**Acceptance:** full golden run — engine reproduces `expected_standings.json` **exactly** (all 128
participants × 4 stages, stage + cumulative, and `directie_scores_computed` to one decimal).

#### WP-B2 — Bulk-query refactor of scoring + generators (fixes F10)
Rewrite as pure functions over bulk-loaded data:
- One query each for: riders, participants (+selections +ploeg +directie), stages, stage_results,
  stage_jerseys, stage_combativity, stage_dnf, final_classifications — whole tables (a few thousand
  tiny rows late in a Tour). Join/aggregate in memory. Compute **all** stages' points, ranks,
  cumulative totals and rank changes in one pass (this also removes the subtle "recompute an early
  stage" ordering hazards).
- Persist with bulk `upsert`s (one per table). Ranks computed in memory — no per-row UPDATE loops.
- Generators consume the same in-memory model; `generateRiderRankingsJSON` reuses the riders result
  instead of recomputing (fact 11).
- Fold `submit-stage-results`' per-rider fuzzy RPC calls into one round trip (single RPC taking a
  name array, or load all rider names once and match in JS).
- Set target: full recompute+regenerate+publish **< 10s** at 21 stages; keep `maxDuration: 300`.
**Acceptance:** golden tests still exact; timed run at fixture scale (or synthetic 21-stage data) < 10s.

#### WP-B3 — Entry UX for non-technical editors (fixes F5)
- **Results-only entry**: stage metadata (date, cities, type) is pre-seeded (WP-B4) and read-only in the
  entry form; required-field validation on metadata (`EtappeBeheer.tsx:190-206`) goes away (R10).
- **Paste-and-parse**: textarea → server parse+fuzzy-match → review screen (green check per matched
  rider, dropdown for uncertain, red row for unmatched). Invariant: *an unrecognized line is shown,
  never silently dropped*. Exactly two formats (procyclingstats table, NOS list) — needs Q11 samples.
  Fuzzy matching: fix the accent bug first — use Postgres `unaccent` instead of the
  `regexp_replace(...[^a-zA-Z ]...)` hack (`supabase-schema.sql:336`), or normalize in JS before the
  RPC; prove with accented fixtures ("Pogačar", "O'Connor", "van der Poel").
- **Statuses from the DB** per stage: *leeg → ingevoerd → verwerkt* (+ publish outcome, WP-B10), shown
  in the stage list for all editors.
- **Drafts**: autosave form state to localStorage per stage; restore on reopen; clear on successful save.
- **Optimistic concurrency**: `stages.updated_at` check on save; on mismatch reject with *"iemand
  anders heeft deze etappe net gewijzigd"* (add `updated_at` column + trigger, or set it in the RPC).
- **Dutch inline errors; mobile-first layout** (entry happens on phones).
- Scraper becomes a *"probeer automatisch op te halen"* button that prefills the same review screen.
**Acceptance:** planning-doc Sprint-B verification: paste both formats incl. accents → correct review
matches; kill the tab mid-entry → draft restores; concurrent edit → Dutch conflict error.

#### WP-B4 — "Nieuw seizoen" imports (fixes F6)
Three admin flows reusing the WP-B3 fuzzy-review component:
1. **Startlist** (riders + teams): paste/prefill; sets `riders.is_active` for the season (Q14) and
   populates `teams`.
2. **Stage calendar**: paste 21 rows (Q12 format); creates `stages` with metadata; entry UI then never
   asks for metadata.
3. **Selections import**: CSV (2027: exported from an external form — Google Forms/Tally, decided
   pragmatic default) → fuzzy-review per row → participants + selections + ploeg + directie (via alias
   table). Must handle: empty spare rows (the Excel had 9), missing riders (the 9-rider participant),
   duplicate names, unknown directie codes (block with review, don't invent).
**Acceptance:** WP-C dry-run — full season bootstrap from a fresh DB using only the admin UI + docs.

#### WP-B5 — Full auth for 3–5 editors
Extend WP-A4: all editor emails in `ADMIN_EMAILS`; pre-create their accounts; document the "add an
editor" runbook (invite user + add to env + redeploy). No roles/admin table (rejected as
over-engineering).

#### WP-B6 — Content table for editorial text
`content (key text PK, markdown text, updated_at)`; "Over deze Poule" reads it from the snapshot
(add a 7th JSON or fold into `metadata.json` — prefer folding into metadata to keep the publish set
at 6 files); tiny admin editor (textarea + preview is enough).

#### WP-B7 — Season lifecycle (fixes F7)
- Replace `supabase/supabase-schema.sql` with **incremental migrations** (`supabase/migrations/`,
  Supabase CLI conventions); the current schema becomes migration 0001 (minus the DROPs).
- **Non-destructive new-season reset script**: archives first, then truncates season-scoped tables
  (selections, results, points, stages, entry log) while keeping reference data as chosen in the
  Nieuw-seizoen flows. Refuses to run unless the archive step verifiably succeeded.
- **Snapshot archive**: at season end copy the final run's 6 JSONs to `archive/<year>/` in Blob;
  public archive pages read those; add the pointer schema a `seasons: [...]` list or an
  `archive/index.json`. (Q13 decides whether a 2025 archive is possible at all.)

#### WP-B8 — Repo hygiene (fixes F8) — concrete list
Remove: `zustand`, `date-fns`, `tree` deps; `src/hooks/useBusinessLogic.ts`; `tailwind.config.ts`;
top-level legacy `data/*.json` (keep `data/2026/fixtures/` and — if kept as parser inputs —
`data/2025/stage_results/` moved under `data/fixtures-2025-raw/` or similar); dead `package.json` scripts
(`seed-*`, `deploy:data*`, `predeploy`). Upgrade Tailwind `4.0.0-alpha.25` → v4 **stable** (breaking
changes between alpha and stable are real: check `@theme` syntax, renamed utilities; visually verify
every page after). Rewrite README to match reality (current tree, correct schema/migrations path, env
var list, runbooks). Add `vitest` config and a `test` script (started in WP-A3).

#### WP-B9 — Tests + CI (fixes F9)
- Golden scoring suite on `data/2026/fixtures` (see WP-B1 acceptance) incl. the WP-A3 substitution and
  force-reprocess scenarios, the 9-rider participant, null combativity, dagploeg award, directie
  divisor-5 group, end-bonus stacking (synthetic — fixtures end at stage 4).
- Parser fixtures for both paste formats incl. accents (blocked on Q11 samples).
- Fuzzy-matcher tests proving accented names clear the match threshold (R4/WP-B3).
- GitHub Actions: lint + typecheck + test on PR. (Repo currently has no CI at all.)
- Structure note: scoring/generators must be pure `lib/` functions (WP-B2) so tests run without
  Supabase — feed them the fixture data as plain objects; keep DB I/O in thin adapters.

#### WP-B10 — Entry log + observability (fixes F11)
- `stage_entry_log (id, stage_number, payload jsonb, submitted_by text, created_at)` — written before
  processing (WP-A2 step 2); this is the replayable audit trail + poor-man's backup.
- Publish outcome (`publish_status`, timestamp, runId) written into the pointer; admin stage list
  surfaces it (WP-B3 statuses).
- Optional weekly `pg_dump` GitHub Action (needs the DB connection string as a repo secret — confirm
  the owner wants prod credentials in GitHub).

### Phase C — pre-Tour 2027 go-live
Seed the season via WP-B4 imports; participants submit via external form → CSV → import; full dry-run
of one historical stage end-to-end; go-live checklist: Fluid compute on, `maxDuration`, env vars set
(`ADMIN_EMAILS`, `VITE_DATA_BASE_URL`, `SCRAPER_TOKEN`, Supabase keys, Blob token), signups disabled,
editors pre-created and logged in on their phones, backup job green, archive of 2026 completed.

---

## Execution order & dependencies

```
WP-A0 ─► WP-A1 ─► WP-A2 ─► WP-A3 ─► WP-A4          (Phase A, strictly in order; A1 first so every
                                                     later change is immediately visible on the site)
Phase B:
  WP-B2 (bulk refactor)  ─► WP-B1 (scoring rules)  ─► WP-B9 (full golden suite; seed tests exist from A3)
  WP-B3 (entry UX)        — after B2 (shares the lib pipeline); parser sub-task blocked on Q11
  WP-B4 (imports)         — after B3 (reuses review component); teams/directie tables from B1
  WP-B5/B6/B10            — independent, anytime in B
  WP-B7 (migrations)      — start early in B (B1's DDL should already land as migrations)
  WP-B8 (hygiene)         — anytime; Tailwind upgrade before major new frontend work
```
Rationale for B2-before-B1: implementing the new rules inside the N+1 code means rewriting them twice;
the golden fixtures can't pass until B1, so B2 is verified first by "no change vs. current engine
output on current rules" plus unit tests, then B1 lands the rule changes against the golden set.

---

## Verification (roll-up)

- **Phase A:** enter a real 2026 stage in a browser end-to-end; public site updates within ~2 min
  without redeploy; DNS-substitution golden test green; unauthenticated POST to every write route → 401;
  empty submit leaves DB untouched.
- **Phase B:** engine reproduces `data/2026/fixtures/expected_standings.json` exactly (128×4 totals +
  directie scores incl. the divisor-5 single-member group); both paste formats with accents match in
  review; draft restores after tab kill; concurrency conflict shows the Dutch error; full pipeline
  < 10s at 21 stages; CI green on PR.
- **Phase C:** fresh-clone season bootstrap via admin UI + docs only; go-live checklist complete.

---
---

# Round 3 addendum — full code review (July 2026)

*Third pass. The two documents above were verified claim-by-claim and then the entire codebase was
read file by file looking for what they missed. Everything below is new or corrective; numbering
continues the existing schemes (facts 23–37, R13–R24, Q19–Q22). File/line references are current as
of commit `fb9d81c`.*

## New verified facts (23–37)

| # | Fact | Evidence |
|---|------|----------|
| 23 | **The entry UI can never enter stage 1.** `EtappeBeheer` feeds its rider autocompletes from the *public snapshot* `riders.json` (`useRiders()`, `EtappeBeheer.tsx:129,135-141`), and `generateRidersJSON` only includes riders with `total_points > 0` (`lib/json-generators.ts:341`). Before any stage is processed the file is empty → zero autocomplete options; after that, any rider who hasn't scored yet is unselectable as finisher/jersey/DNS. The correct source exists — `api/admin/riders-list.ts` returns the full riders table — but **nothing in `src/` or `scripts/` calls it** (grep: 0 hits). Same for `stages-list.ts`, `stage.ts`, `health.ts`: all four routes are dead code today. | as cited |
| 24 | The same `total_points > 0` filter corrupts the public **Team Selectie** page: a rider picked by half the pool who hasn't scored is absent from the popularity list (`TeamSelectie.tsx:80-94` iterates `ridersData`), and in the "Team van X" view zero-scorers render as `'Onbekend Team'` / 0 pts (`:104-105`) because the lookup misses. | as cited |
| 25 | **`stage_type` is a dead column being nulled on every save.** The entry form's "Type" select writes `difficulty` (`EtappeBeheer.tsx:750-757`); no input ever sets `stage_type`, so `manual-entry` upserts `stage_type: null` every time (`api/admin/manual-entry.ts:63`). Two overlapping columns, one meaning. |
| 26 | **Lint and backend typecheck don't exist.** There is no ESLint config anywhere (no `.eslintrc*`, no `eslint.config.*`, no `eslintConfig` in `package.json`) → `npm run lint` errors out immediately. `tsconfig.json` has `"include": ["src"]`, so `npm run build`'s `tsc` checks `src/` plus only the `lib/` modules it transitively imports — **`api/**` and server-only `lib/` (json-generators, api-utils) are typechecked by nothing**, locally or at deploy (Vercel transpiles functions without the repo's strict flags). WP-B9's "lint + typecheck on PR" is currently impossible to wire up as written. |
| 27 | `README.md` says `cp .env.example .env.local` — **`.env.example` does not exist** (add to the F8/WP-B8 README rewrite list). |
| 28 | **`lib/` mixes two runtimes.** `lib/constants.ts` imports `lib/config.ts`, which reads `import.meta.env` — Vite-only syntax that crashes under Node. Today no `api/` file happens to import those two modules, so it works *by luck*; one innocent `import { JERSEY_LABELS } from '../../lib/constants'` in an API route would take the endpoint down. Import specifiers are also inconsistent: server files import lib modules both with `.js` extension (`json-generators.ts:16`) and without (`manual-entry.ts:9`) under `"type": "module"`. |
| 29 | Every `api/` file and `json-generators.ts:34` create a Supabase client **at module scope** with `process.env.X!`. Importing any of these modules in a test without envs set throws at import time — this must be fixed for WP-B9's "pure functions fed with fixture data" to be possible. |
| 30 | Because of the SPA catch-all rewrite (`vercel.json`), a missing `/data/*.json` returns **200 with `index.html`**, not 404 — `response.ok` passes and `response.json()` throws a `SyntaxError`, so the user-facing error for the F2 breakage is a cryptic JSON parse message rather than "file not found". |
| 31 | **A shared component library exists and is almost entirely unused.** `src/components/shared/` contains `JerseyIcons`, `CombativityIcon`, `MedalDisplay`, `RankChange`, `StageBreakdown` — but `RennerPunten.tsx:17-44` defines its own duplicate `CombativeIcon`, three pages carry three near-identical inline `getStageJerseys` helpers (`RennerPunten.tsx:102-118`, `TeamSelectie.tsx:120-130`, plus `lib/data-transforms.ts:74-108` which has *two* overlapping versions), and the per-stage breakdown UI is hand-rolled in each page instead of using `StageBreakdown`. Only `RankChange` is actually imported (by Klassement). |
| 32 | `Klassement.tsx:10-30` declares local `LeaderboardEntry`/`DirectieEntry` interfaces that duplicate-and-drift from `lib/types.ts`, then bridges with `filteredResults as LeaderboardEntry[]` casts; `RennerPunten` maps rows as `rider: any`. The "type-safe throughout" header comments are aspirational. |
| 33 | `getParticipantMedals` (`lib/data-transforms.ts:159-173`) is called **per table row inside render** and scans every stage's full leaderboard with `.find()` — O(rows × stages × participants) ≈ 350k operations per render at 128×21. Riders get `medal_counts` precomputed in their snapshot; participants don't. |
| 34 | The `dnf_status` enum includes `OTL` and `DSQ` (`supabase-schema.sql:30`) but no UI, scoring, or substitution path handles them — and OTL/DSQ genuinely happen in real Tours (a missed time cut is functionally a DNF for the pool). `participant_stage_points.stage_rank_change` (`supabase-schema.sql:182`) is never written by any code. |
| 35 | **Preview deployments share production state.** Vercel env vars, unless explicitly scoped per environment, give preview builds the same `SUPABASE_SERVICE_ROLE_KEY` and `BLOB_READ_WRITE_TOKEN` as production — a stage submitted on a preview URL overwrites the production DB and published snapshots. (Extends R8, which only covered the self-fetch auth page.) |
| 36 | **TeamSelectie search hijacks the view.** Any search term matching *any* participant name **or directie** flips the whole page from the popularity ranking to "Team van <first match>" (`TeamSelectie.tsx:58-73`, first `.find()` wins) — searching for a *rider* is impossible, and a directie query shows one arbitrary member's team. |
| 37 | Small but real: `index.html` references favicon `/vite.svg` which isn't in `public/`; routes are case-sensitive capitalized paths (`/Klassement`) with exact-match highlighting; `api/health.ts:44-49` reports "0 riders" always (`head: true` returns no rows); `useTdfData.ts:183-185` exports a `refreshTdfData()` that does `window.location.reload()` (dead); Supabase **free-tier projects pause after ~1 week of inactivity** — relevant for the off-season gap between Phase B and Phase C. |

## Corrections to this plan itself (P-items — where the plan is wrong or optimistic)

- **P1 — Phase A puts auth last; that's the wrong order.** WP-A4 sits at the end of a strictly-ordered
  phase, meaning the fixed publish pipeline (A1) and the new one-click entry endpoint (A2) run for
  days-to-weeks on a live, publicly deployed site with **zero** authentication and the admin page in the
  public nav — F1 is the review's own top 🔴. The full OTP flow can stay at A4, but an **interim
  lockdown belongs in WP-A0**: (a) remove Etappe Beheer from the public nav, (b) require a static
  bearer token (constant-time compare vs an `ADMIN_TOKEN` env) on every write route — ~1 hour of work,
  and A2's new endpoint should be born with that check rather than added later. A4 then swaps the
  token for OTP sessions.
- **P2 — WP-A1's "~2 min" acceptance criterion doesn't hold as designed.** Worst case is browser cache
  on the pointer (60s) + poll interval (60s) + Blob CDN overwrite propagation (up to 60s) ≈ **3 min**.
  Fix rather than relax: fetch the pointer with `cache: 'no-store'` (it's a few hundred bytes; the CDN
  still absorbs the load) so only propagation + poll remain, and keep the ~2 min criterion honest.
- **P3 — Q18's suggested default imports the wrong names.** `data/2026/fixtures/team_selections.json`
  is **anonymized** (`P001`…`P128` — verified). Importing it as suggested makes the public PoC show a
  leaderboard of P-codes. The real names exist only in the owner's Excel, kept out of the repo
  deliberately. The import script must therefore read a **local, gitignored** file (real-name export)
  with the same shape, and the committed fixture stays test-only. Whether the PoC shows real names at
  all is a privacy call the owner must make → Q19.
- **P4 — WP-B2's "one query each … whole tables" will silently truncate.** Supabase/PostgREST returns
  **max 1000 rows per request by default**. At full scale: `participant_stage_points` = 128 × 21 =
  2 688 rows, `rider_stage_points` ≈ 1 500+, and `participant_rider_contributions` ≈ 128 × 10 × 21 ≈
  **27 000 rows** — every one of these exceeds the cap, and supabase-js gives no error, just fewer
  rows. The bulk loader must paginate with `.range()` (or raise the project's `db-max-rows` and still
  assert `data.length < limit`). Also: the plan's "a few thousand tiny rows" undersells the
  contributions table by an order of magnitude — still trivially fine in memory, but don't let the
  1000-row default turn the refactor into a subtle data-loss bug. Golden tests at 128 participants
  will catch this **only if** they run against a real Supabase instance at least once; the pure
  in-memory suite won't.
- **P5 — WP-B9 assumes tooling that doesn't exist (fact 26).** CI is listed as a Phase-B nicety, but
  lint is unrunnable and the backend is un-typechecked *today*, while Phase A rewrites exactly that
  backend. Pull the tooling into Phase A (see amended execution order): add an ESLint flat config, a
  `tsconfig.api.json` (or a solution config) covering `api/` + `lib/` with the same strict flags, make
  `npm run build` (or a `check` script) cover both, and a 10-line GitHub Actions workflow. Half a day,
  and every subsequent WP benefits.

## New corrections and additions (R13–R24)

- **R13 — Entry UI must read riders from the admin API, not the snapshot** (fact 23). WP-A2/WP-B3:
  `EtappeBeheer` loads its autocomplete options from `api/admin/riders-list` (behind `requireAdmin`,
  per R12). Either adopt the three dead admin GET routes (`riders-list`, `stages-list`, `stage`) as
  that surface, or delete them in WP-B8 — the current state (built, wired to nothing) is the worst of
  both.
- **R14 — `riders.json` must include all startlist riders, zero scores included** (fact 24). ~180
  entries with empty `stages` maps cost nothing and fix both Team Selectie defects. Alternatively key
  the popularity view off `team_selections.json` + a name→team map — but "include everyone" is
  simpler and also what Q14's `is_active = 'on current startlist'` semantics imply.
- **R15 — Split `lib/` by runtime before WP-B2 builds on it** (facts 28, 29). Proposed layout:
  `lib/shared/` (types, scoring-constants, pure transforms — importable everywhere, no env access, no
  I/O), `lib/server/` (supabase client factory, generators, publish, require-admin — Node only),
  `src/lib/` or keep `lib/config.ts` frontend-only (anything touching `import.meta.env`). Enforce
  with an ESLint `no-restricted-imports` rule once P5's config exists. Standardize ESM import
  specifiers (pick NodeNext + always-`.js`, matching what `api/` needs at runtime). Replace all
  module-scope `createClient` calls with a `getServiceClient()` factory so tests can import scoring
  code without env vars.
- **R16 — Publish must not run from previews** (fact 35). Cheapest: scope `BLOB_READ_WRITE_TOKEN` and
  the service-role key to the Production environment in Vercel (previews then fail loudly), or guard
  in code (`if (process.env.VERCEL_ENV !== 'production')` → write to a `preview/` blob prefix and skip
  the pointer). Decide in WP-A0, verify in WP-A1 acceptance.
- **R17 — Precompute participant `medal_counts` into `leaderboards.json`** during WP-B2 (fact 33) and
  render via the existing `MedalDisplay`; drop the render-time recomputation.
- **R18 — Consolidate `stage_type` vs `difficulty`** (fact 25): keep one column (suggest `stage_type`,
  typed by the Q12 calendar import: vlak/heuvels/bergen/tijdrit), drop the other, and remove the
  free-text "won_how" from the results flow (it's editorial color, not scoring input — make it
  optional or move it to the content table).
- **R19 — Extend Q3 to OTL/DSQ** (fact 34): the reserve/roster rule needs an answer for "out of time
  limit" and "disqualified", not just DNF vs DNS — for pool purposes they almost certainly behave like
  DNF (rider gone from stage N+1 onward), and the entry UI needs a way to record them (a status
  dropdown on the uitvallers field instead of two separate DNF/DNS boxes). Also delete or start
  writing `stage_rank_change`.
- **R20 — "Next stage" derivation breaks once stages are pre-seeded** (WP-B4): `getNextStageNumber` =
  max(stage_number)+1 (`EtappeBeheer.tsx:83-87`) returns 21 forever once all 21 calendar rows exist.
  WP-B3's status model replaces it: "next" = lowest stage with status *leeg* (or by date). Note it so
  the calendar import doesn't silently kill the entry entry-point.
- **R21 — WP-A4 needs two new frontend envs.** There is no supabase-js client in `src/` today; the OTP
  login requires `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` at build time. Add both to the WP-A0
  env checklist and the Phase-C go-live list (which currently lists neither).
- **R22 — Fix the F2 failure mode while fixing F2** (fact 30): after WP-A1, data fetches go to the Blob
  origin so the SPA-rewrite masking disappears for those — but keep a guard anyway (`content-type`
  check before `.json()`) so a future misconfiguration says "kon data niet laden" instead of
  `Unexpected token '<'`.
- **R23 — Directie decimals are a frontend concern too** (extends R2): scores like 437.8 must render
  with **one decimal, Dutch comma** (`Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1 })` →
  "437,8"), including in the expanded contributions panel. Both current leaderboard UIs assume
  integers.
- **R24 — Dagploeg +6 needs explicit UI representation** (extends WP-B1): the participant expanded row
  ("Punten per Etappe" / rider contributions) can only show rider rows; add a distinct "Dagploeg +6"
  line item in the breakdown and a field in the snapshot, or participants will see totals that don't
  match the sum of the visible rows — exactly the kind of mismatch that erodes trust in a pool.

## New open questions (Q19–Q22)

| # | Question | Suggested default | Gates |
|---|----------|-------------------|-------|
| Q19 | **PoC participant naming** (see P3): does the 2026 public site show real names (imported from a local, never-committed export) or the P-codes? Real names of colleagues on a public URL is a privacy decision only the owner can make. **BLOCKER** for WP-A3's import step | Import real names from a gitignored local file; site is obscure and low-stakes, but confirm first | WP-A3 |
| Q20 | **OTL/DSQ semantics** (R19): treat as DNF for roster purposes? | Yes — same as DNF from the next stage | WP-A3, WP-B1 |
| Q21 | **Preview-deploy policy** (R16): scope prod secrets to Production only, or code-guard? | Env scoping in Vercel (no code needed) | WP-A0/A1 |
| Q22 | **Supabase pausing in the off-season** (fact 37): free projects pause after ~1 week idle; between the 2026 Tour and Phase-B work the project will pause (harmless, resumable) but the team should know. Upgrade, or document "restore from dashboard" in the runbook? | Document it; free tier is fine at this scale | WP-B7 runbook |

## Owner decisions (answered in chat, July 2026 — these override the corresponding Q-rows)

- **Q1 — RESOLVED: yes, ook mid-Tour.** A DNS at any point activates the reserve for all remaining
  stages (matches the current code's intent). Keep it a named constant anyway.
- **Q3/Q20 — RESOLVED: alleen DNS.** DNF, OTL and DSQ do **not** activate the reserve — the rider
  simply stops scoring. The current DNS-only trigger is the correct rule. R19 narrows to: the entry UI
  should still be able to *record* OTL/DSQ (they affect who can appear in later results), but they have
  no roster/substitution effect.
- **Q7 — RESOLVED: default confirmed.** End-of-Tour bonuses get a separate "Eind" pass/column, count in
  cumulative totals and directie averages.
- **Q8 — RESOLVED: samenvoeging blijft.** The combined group "DI - DBV - iDomein - TDA" is structural,
  not a 2026 one-off — seed the directie + alias tables from the fixture mapping as durable reference
  data (still keep it editable at season import for organisational changes).
- **Q11 — RESOLVED: alleen procyclingstats.** The paste parser supports **one** format
  (procyclingstats); NOS support is dropped. Owner still needs to supply ≥2 real procyclingstats paste
  samples (with accents and DNF markers) as fixtures before the parser sub-task starts. Amend WP-B3 and
  WP-B9 accordingly (one format, one fixture set).
- **Q13 — RESOLVED: 2026 wordt het eerste archief.** No complete 2025 source; drop the 2025-archive
  goal (R11 closed). `data/2025/stage_results/` (2025, stages 1–12) remains useful only as realistic
  rider-name input for parser/fuzzy tests.
- **Q16 — RESOLVED:** `ADMIN_EMAILS = lars.login@pm.me`, single pre-created account for 2026.
- **Q19 — RESOLVED (for now): voornamen only.** The 2026 test imports **first names only** from a
  local, gitignored file; the naming approach may change later (not blocking anything yet). The
  P-coded fixture stays test-only.

Still open with safe defaults (implement the default, no owner input needed): Q2, Q4, Q5, Q6, Q9,
Q10, Q12, Q14, Q18-mechanics, Q21, Q22. Q15/Q17 are verification tasks, not decisions.

## WP amendments (deltas to the packages above)

- **WP-A0 (amended):** add the P1 interim lockdown (admin out of nav + `ADMIN_TOKEN` bearer check on all
  write routes) and the P5 tooling baseline (ESLint flat config; `tsconfig` coverage for `api/`+`lib/`;
  `npm run check` = lint+typecheck; GitHub Actions running it). Decide Q21 (preview env scoping). Add
  `VITE_SUPABASE_*` to the env inventory (R21). Create `.env.example` (fact 27).
- **WP-A1 (amended):** pointer fetched with `cache: 'no-store'` (P2); content-type guard on data fetches
  (R22); verify preview scoping (R16); delete the legacy fixed-path blobs (`data/*.json`) after the
  pointer pattern is live so nothing can read half-old data.
- **WP-A2 (amended):** the new endpoint requires auth from birth (P1); riders for the entry UI come from
  `riders-list` behind `requireAdmin` (R13); log the raw payload to `stage_entry_log` **also when
  validation rejects it** (flag `accepted: boolean`) — failed attempts are exactly what you want in the
  audit trail when a non-technical editor calls for help.
- **WP-A3 (amended):** import script reads a gitignored real-name file, P-coded fixture stays test-only
  (P3/Q19); OTL/DSQ folded into the roster rule decision (Q20).
- **WP-B2 (amended):** paginate every bulk read (`.range()` loop) and assert-not-truncated (P4); run the
  golden suite once against a seeded real Supabase instance, not only in-memory; add participant
  `medal_counts` to the leaderboards snapshot (R17); write or drop `stage_rank_change` (R19).
- **WP-B3 (amended):** replace `getNextStageNumber` with status-derived "next" (R20); replace
  `window.confirm` reprocess prompt with an in-UI Dutch confirmation (works in all mobile browsers,
  styleable, testable); flatten the `setTimeout`-chained success choreography in `EtappeBeheer.tsx:266-274`
  into a simple state machine; uitvallers entry becomes rider+status (DNF/DNS/OTL/DSQ).
- **WP-B8 (amended, concrete additions):** delete or adopt the four dead API routes (fact 23);
  `lib/` runtime split + import-specifier standardization + client factory (R15); fix favicon
  (`icon_jersey.svg` is right there); lowercase route paths with redirects; fix `health.ts` count;
  remove `refreshTdfData`/`window.location.reload` leftover; `.env.example`; consolidate
  `stage_type`/`difficulty` (R18).

### New WP-B11 — Frontend consistency & accessibility pass (fits the owner's "polish" track)

Not blocking anything, but currently three pages hand-roll the same UI with three private copies of
everything (facts 31, 32, 33, 36):

1. **Adopt the existing shared components** (`JerseyList`, `CombativityIcon`, `MedalDisplay`,
   `StageBreakdown`, `RankChange`) everywhere; delete the inline duplicates in `RennerPunten` and the
   duplicated jersey-extraction helpers (keep exactly one, in `lib/shared`).
2. **Extract the repeated page skeleton**: segmented view-toggle buttons, search input, and the
   mobile-card/desktop-table pair with expandable rows appear nearly identically in `Klassement`,
   `RennerPunten`, `TeamSelectie`. One `SegmentedControl` + one `RankedTable` (renders cards < lg,
   table ≥ lg, owns the expand state) removes several hundred lines and makes the 2027 "Eind" column
   (Q7) a one-place change. Use `Layout` on `Klassement` too (it's the only page that doesn't).
3. **Single source of types**: delete `Klassement.tsx`'s local interfaces, import from `lib/types`,
   remove the `as LeaderboardEntry[]` casts and the `rider: any` maps (fact 32) — that's what makes
   snapshot-shape changes in Phase B compile-time-checked instead of silently wrong.
4. **Accessibility minimum**: expandable rows/cards become real `<button>`s (or get
   `role="button"`, `tabIndex`, Enter/Space handling) with `aria-expanded`; the three view toggles get
   `aria-pressed`; nav links get `aria-current="page"`; jersey `<img>`s get Dutch alt texts ("gele
   trui" not "yellow jersey"). Small effort, and 3–5 non-technical editors on phones benefit directly.
5. **One route-level error boundary** with a Dutch message + retry, instead of relying on per-page
   error branches (and fact 30's guard makes those errors say something useful).
6. **Locale consistency**: all numbers/dates through `nl-NL` formatting (R23's decimal comma; dates
   already use `toLocaleDateString('nl-NL')` in some places and raw strings in others).

## Amended execution order

```
WP-A0+ (env check • interim lockdown P1 • tooling P5 • Q21) ─► WP-A1 ─► WP-A2 ─► WP-A3 ─► WP-A4
Phase B unchanged, except:
  R15 lib split lands at the START of B2 (it's the refactor's foundation)
  WP-B11 (frontend pass) — anytime after B2's snapshot-shape changes settle; before new UI (B3) reuses it
```

The original A-order rationale ("A1 first so every change is visible") survives — the lockdown and
tooling additions to A0 are hours, not days, and remove the indefensible window where a fixed,
convenient, still-unauthenticated write path runs on a public URL during the live Tour.
