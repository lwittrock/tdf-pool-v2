# Phase A post-merge review — findings & status

Code review of the Phase A merge (PR #6, WP-A0–A4), July 2026. Eight
findings; four fixed in the cleanup round right after the merge, four
deliberately deferred with the rationale below. Deferred items name the
work package that should absorb them.

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

### 6. N+1 pipeline may hit the 300s timeout late in the Tour — MEDIUM, → WP-B2
`calculatePointsForStage` issues participants × completed-stages sequential
round trips in the cumulative pass (~128 × 18 selects + as many updates by
stage 18) plus per-row rank updates — roughly 5,000+ sequential REST calls
per entry in the final week. At 30–60 ms per call that is 160–320 s,
uncomfortably close to the 300 s `maxDuration`. The file header's
"acceptable mid-Tour with few stages" stops holding around stage 12–15.
*Why deferred:* the bulk-query rewrite IS WP-B2; duplicating it as a patch
now would be thrown away. **Constraint: land WP-B2 before roughly stage 12**,
or accept that a timed-out entry needs a manual `process-stage` retry (the
DB swap is transactional, so no data is lost — only the publish is missed).

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
Both `TOBIAS JOHANNESSEN` and `TOBIAS HALLAND JOHANNESSEN` occurred as picks
(same physical rider); the sheet treated them as different strings, so the
one Halland-form picker (P128) received 0 for his stage 2/3/9 results — the
golden fixtures verify the sheet really scored it that way. **Owner ruling
(July 2026): merged** via `npm run merge:riders` + `npm run process:stages`;
the site therefore deliberately diverges from the sheet for P128 from stage
2 onward. The golden fixtures stay verbatim-Excel (unmerged); a fresh
fixture import recreates both rows, so redo the merge after any full
rebuild. Excel-specific spellings remain canonical in the DB:
`AARON MURRAY GATE`, `RAUL GARCIA`, `DEREK JAMES GEE`,
`VALENTIN PARET PEINTRE`, `XABIER AZPARREN IRURZUN` — see
`data/2026/startlist.json`. The structural fix (rider aliases / canonical
IDs so free-text names stop being join keys) belongs in WP-B1/WP-B4.

### 8. Force-reprocessing an earlier stage does not ripple forward — NOTE
Pre-existing v1 semantics, kept by the port: `calculatePointsForStage(N)`
recomputes cumulative totals for stages ≤ N only. If you re-enter stage 2
after stages 3–4 were processed, stages 3–4 keep stale cumulatives until
they are force-reprocessed too. **Operational rule: after correcting an old
stage, force-reprocess every later stage, in order.** WP-B2's bulk rewrite
should recompute the full chain in one pass instead.
