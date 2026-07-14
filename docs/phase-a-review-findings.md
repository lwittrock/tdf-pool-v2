# Phase A post-merge review — findings & status

Code review of the Phase A merge (PR #6, WP-A0–A4), July 2026. Eight
findings; four fixed in the cleanup round right after the merge, the rest
resolved or deferred as noted. The WP-B2 bulk rewrite (July 14) closed
findings 6 and 8 and surfaced two more critical ones (9, 10) — both fixed
in the same rewrite.

## Fixed (cleanup round, July 2026)

### 1. Fresh stage published with cumulative 0 / arbitrary overall ranks — HIGH
`lib/pipeline.ts`, cumulative pass in `calculatePointsForStage`.
The pass only included stages with `is_complete = true`, but `processStage`
marks the stage complete *after* calculating — and `enter-stage` resets
`is_complete` to `false` on every entry. So every normal entry published the
new stage with `cumulative_points = 0` and overall ranks assigned in
arbitrary row order. Ported faithfully from v1's `calculate-points`; the
force-reprocess path (stage already complete) masked it, so it would first
have fired on the first live entry mid-Tour.
**Fix:** the stage being processed is now always included in the cumulative
pass (`.or('is_complete.eq.true,stage_number.eq.N')`).

### 2. Double DNS in one stage re-activated the reserve twice — LOW
`lib/pipeline.ts`, `updateActiveSelections`. The in-memory reserve row was
not updated after the first substitution, so two mains DNS'ing in the same
stage (think team withdrawal) updated the reserve twice, overwrote
`replacement_for_rider_id` with the second casualty, and reported the
reserve twice in the substitutions list. Scoring itself was unaffected.
**Fix:** in-memory `replaced_at_stage` is synced after activation.

### 3. Missing snapshot in the pointer rendered blank pages — LOW
`src/hooks/useTdfData.ts`. When the pointer loaded but didn't list a file
(schema drift, hand-edited rollback pointer), the data query was disabled
and the merged `isLoading`/`isError` were both false — pages rendered their
empty state with no error and never retried.
**Fix:** pointer-loaded-but-file-missing now surfaces as an error.

### 4. `riders-list` bypassed the shared Supabase client factory — LOW
`api/admin/riders-list.ts` built a module-scope client with `!` assertions:
a missing env var crashed at cold-start module load (opaque
`FUNCTION_INVOCATION_FAILED`) instead of a readable 500, and the route would
drift from `getServiceClient` improvements.
**Fix:** uses `lib/supabase-server.getServiceClient()`.

Also fixed: `.env.example` claimed local dev works without
`VITE_DATA_BASE_URL` ("fetch from the dev origin") — nothing serves
`/data/current.json` locally since WP-A1 removed `public/data/`. The comment
now says to set the Blob store URL in `.env.local` for local dev too.

## Deferred — documented, not fixed

### 5. A retracted DNS is never rolled back — MEDIUM, → WP-B2/WP-B4
`lib/pipeline.ts`, `updateActiveSelections` only ever *sets*
`replaced_at_stage`. If a rider is mistakenly entered as DNS and the stage is
force re-entered with the corrected payload, the selection rows keep the
substitution: the main scores 0 from that stage on and the reserve stays
active. Recovery today is a manual SQL update on
`participant_rider_selections` (clear `replaced_at_stage` +
`replacement_for_rider_id`, restore `is_active`), then force-reprocess the
affected stages **in order**.
*Why deferred:* only fires on operator error by the single admin; a clean fix
is reconciliation (derive substitutions from the full `stage_dnf` history on
every run) which belongs in the WP-B2 scoring/pipeline rewrite, not a patch.

### 6. N+1 pipeline hits the 300s timeout — FIXED (WP-B2, July 14)
The estimate ("stage 12–15") was optimistic: **stage 4's entry was already
killed at the 300 s limit** (DB writes completed; the publish was cut off),
and a stage cost ~7 minutes locally by stage 9 — the publish phase's
generators were even heavier than the points pass (~3,000 queries, run
twice). Fixed by the WP-B2 rewrite: `lib/pipeline.ts` and
`lib/json-generators.ts` now use paginated bulk fetches + in-memory
computation. Measured after: full 9-stage reprocess incl. 9 publishes in
**56 seconds** (~6 s/stage); snapshot generation 6.8 s (was ~5 min). UI
entry is unblocked.

### 7. Preview deployments read production data but write `preview/` — LOW, → WP-B8
`lib/publish.ts` prefixes all preview writes with `preview/` (correct,
belt-and-braces under Q21), but the frontend always fetches
`VITE_DATA_BASE_URL + /data/current.json` — the production pointer. Testing
the entry flow on a preview deployment therefore *looks* broken: the publish
succeeds into `preview/` and the preview site never shows it.
*Why deferred:* write-isolation (the part that protects production) is
correct; fixing the read side needs the Vercel `VERCEL_ENV` exposed to the
Vite build. Until then: test entry flows against production, per the go-live
doc.

### 8a. R1's "Dagploeg = stage winner's team" assumption is wrong — for WP-B1
Discovered while transcribing the Excel's stage columns; **confirmed by the
owner** (July 2026): the Dagploeg is the winner of the stage's **team day
classification** (PCS "Complementary results" per stage — e.g. stage 9: team
day winner EF Education–EasyPost = the sheet's Dagploeg, while the stage
winner was Van der Poel/Alpecin). `stages.winning_team` (derived from the
position-1 finisher per R1) is therefore **not** the input for the +6 rule.
WP-B1 must add Dagploeg as its own entry field; the fixture stage files
already carry it as their own `dagploeg` field. Until then the published
standings simply exclude the +6, as documented for the golden test.

### 8b. The pool Excel's rider naming is inconsistent — data quirk, ruled
Both `TOBIAS JOHANNESSEN` and `TOBIAS HALLAND JOHANNESSEN` occurred in the
pool data (same physical rider). **Merged July 2026** via
`npm run merge:riders` + `npm run process:stages`. Scoring impact turned
out to be **zero**: the only full-form pick (P128) has him as an
*inactive reserve*, which scores 0 under both the sheet's rules and the
engine's — so DB and sheet still agree cell-for-cell. The merge is hygiene:
one rider row owns his results (rider stats display correctly) and a future
activation of that reserve resolves to the row that has the points. A fresh
fixture import recreates both rows, so redo the merge after any full
rebuild. Excel-specific spellings remain canonical in the DB:
`AARON MURRAY GATE`, `RAUL GARCIA`, `DEREK JAMES GEE`,
`VALENTIN PARET PEINTRE`, `XABIER AZPARREN IRURZUN` — see
`data/2026/startlist.json`. The structural fix (rider aliases / canonical
IDs so free-text names stop being join keys) belongs in WP-B1/WP-B4.

### 8. Force-reprocessing an earlier stage does not ripple forward — FIXED (WP-B2)
Pre-existing v1 semantics, kept by the port: cumulative totals were only
recomputed for stages ≤ N. The WP-B2 rewrite recomputes cumulative totals
and overall ranks for **every** completed stage on each run, so correcting
an old stage ripples forward automatically — one `process:stages` (or UI
re-entry) of the corrected stage is enough.

### 9. Un-ranged selects silently truncate at 1,000 rows — CRITICAL, FIXED (WP-B2)
PostgREST caps un-ranged responses at 1,000 rows and supabase-js returns
the first page **without any error**. `participant_rider_selections` has
1,405 rows and `participant_stage_points` reached 1,152 — so scoring ran
with ~400 selection rows missing (participants late in physical row order
lost riders from their roster) and published leaderboards dropped 152 rows
(stage 4 was 24 rows short; stage 7 was empty). Inherited from v1, where it
was latent (v1 never had this many rows). Fixed: every potentially-large
read goes through `fetchAll` (`lib/supabase-server.ts`), which paginates
with a deterministic order. **Rule for all future queries: any table that
can exceed 1,000 rows must be read via `fetchAll`.**

### 10. The N+1 generators silently dropped riders under failure — FIXED (WP-B2)
The old `generateRidersJSON` issued ~2 queries per rider per stage and
ignored per-query errors (`maybeSingle` → null → "no points"), so transient
failures/rate-limiting under the ~3,000-query storm randomly removed riders
from the published files — a captured baseline had 72 of 80 riders in
`rider_rankings.json`, ranking Del Toro #1 with Pogačar missing entirely.
The bulk rewrite fetches each table once, so a failure is loud instead of
lossy.
