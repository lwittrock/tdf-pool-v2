# Frontend tweaks: tie-aware ranks, Etappe medals, Etappe row expansion

## Context

Three display improvements to the pool frontend (React 18 + TS + Vite; data comes from
pre-generated immutable JSON snapshots on Vercel Blob, fetched via `src/hooks/useTdfData.ts` —
there is no runtime standings API):

1. **Ties**: all ranks in the snapshots are `sort desc → index + 1`, so participants/riders with
   equal points get distinct sequential ranks. Wanted: **standard competition ranking (1, 2, 2, 4)**
   everywhere ranks are shown. Ties also apply to participant stage medals: participants tied in a
   stage's top-3 each earn that medal.
2. **Medals in the participant Etappe view**: the Klassement page's Etappe view shows no medals.
   Add 🥇🥈🥉 next to the top-3 participants of that stage (tie-aware). *(Riders already have
   medals: an "Etappe Medailles" column in their Algemeen view — race-finish based, verified
   present in the deployed bundle and data — and a finish-position medal in their Etappe view.
   Those stay unchanged.)*
3. **Etappe row expansion**: in both pages' Etappe view, clicking a row does nothing (no onClick,
   no expansion block — the Algemeen views have both). Add click-to-expand showing the
   **single-stage composition**: for a participant, which of their riders contributed how many
   points (data already exists as `stage_rider_contributions`, currently unused); for a rider,
   finish points + jersey/combativity points.

**Key decision — client-side ranks only.** Snapshots are immutable and server ranks are persisted
per stage in Supabase; the app is a demo. Derive tie-aware display ranks from the points values at
render time. Server ranks stay untouched and keep feeding `rank_change` arrows (accepted artifact:
a tied participant's arrow can be off by the tie offset — document with a code comment).

## Files

- `lib/data-transforms.ts` — new ranking utilities, tie-aware medal computation
- `src/pages/Klassement.tsx` — participants page (Etappe / Algemeen / Directie views)
- `src/pages/RennerPunten.tsx` — riders page (Etappe / Algemeen views)
- `tests/data-transforms.test.ts` — new unit tests (vitest, `tests/**/*.test.ts`, node env)

Reuse: `MedalIcon` from `src/components/shared/MedalDisplay.tsx` (renders 🥇🥈🥉 for position
1/2/3), `formatMedalDisplay` from `lib/scoring-constants.ts`, `JERSEY_ICONS` + `JERSEY_LABELS`
from `lib/constants.ts`, `CombativeIcon`.

## Step 1 — Utilities in `lib/data-transforms.ts`

### 1a. Competition ranking (new, near the existing ranking helpers ~line 215)

```ts
/**
 * Standard competition ranking ("1224"): stable sort by score desc; equal
 * scores share a rank; the next distinct score skips ranks. Client-side
 * display only — snapshots keep their dense server ranks.
 */
export function assignCompetitionRanks<T>(
  items: readonly T[],
  getScore: (item: T) => number
): Array<{ item: T; rank: number }> {
  const sorted = [...items].sort((a, b) => getScore(b) - getScore(a));
  let prevScore = Number.NaN;
  let prevRank = 0;
  return sorted.map((item, idx) => {
    const score = getScore(item);
    const rank = score === prevScore ? prevRank : idx + 1;
    prevScore = score;
    prevRank = rank;
    return { item, rank };
  });
}

/** Key → competition rank, derived from the FULL list (call before any search filtering). */
export function competitionRankMap<T>(
  items: readonly T[],
  getScore: (item: T) => number,
  getKey: (item: T) => string
): Map<string, number> {
  return new Map(
    assignCompetitionRanks(items, getScore).map(({ item, rank }) => [getKey(item), rank])
  );
}
```

### 1b. Tie-aware participant medals — replace `getParticipantMedals` (lines 159–173)

Replace with a batch version computed once per snapshot (the old one is O(stages × participants)
per row; Klassement.tsx is its only importer — delete the old function):

```ts
export function getAllParticipantMedals(leaderboardsData: LeaderboardsData): Map<string, MedalCounts>
```

For each stage in `leaderboard_by_stage`: `assignCompetitionRanks(stageEntries, e => e.stage_score)`,
increment gold/silver/bronze for ranks 1/2/3 keyed by `participant_name`; finish each entry with
`display: formatMedalDisplay(gold, silver, bronze)`. Note the 1,2,2,4 consequence (document in a
comment + test): two tied for gold → next is rank 3 → **no silver awarded that stage**.

`getRiderMedals` (:140–153) is unused and race-finish based — leave untouched.

### 1c. Tie-aware per-stage ranks in `getParticipantStages` (lines 182–213)

Inside the per-stage loop, replace `stage_rank: entry.stage_rank` with the rank from
`assignCompetitionRanks(stageData, e => e.stage_score)` for that participant. Only called for the
one expanded participant, so the extra per-stage sort is negligible. Both Klassement expanded
views then show tie-aware per-stage ranks with no page change.

## Step 2 — `src/pages/Klassement.tsx`

### 2a. Imports + memos

Import `getAllParticipantMedals`, `competitionRankMap` (drop `getParticipantMedals`) and
`MedalIcon` from `../components/shared/MedalDisplay`. After the `currentDirectieLeaderboard` memo
(~line 56), before the early returns:

```ts
const stageRankMap = useMemo(
  () => competitionRankMap(currentLeaderboard, e => e.stage_score, e => e.participant_name),
  [currentLeaderboard]);
const overallRankMap = useMemo(
  () => competitionRankMap(currentLeaderboard, e => e.overall_score, e => e.participant_name),
  [currentLeaderboard]);
const directieOverallRankMap = useMemo(
  () => competitionRankMap(currentDirectieLeaderboard, e => e.overall_score, e => e.directie_name),
  [currentDirectieLeaderboard]);
const medalsByParticipant = useMemo(
  () => (leaderboardsData ? getAllParticipantMedals(leaderboardsData) : new Map()),
  [leaderboardsData]);
```

### 2b. Sort `filteredResults` by points, not server rank (lines 64, 73, 82)

`b.overall_score - a.overall_score` (line 64), `b.stage_score - a.stage_score` (line 73),
`b.overall_score - a.overall_score` (line 82). Displayed order then provably matches the derived
ranks (stable sort keeps snapshot order within ties); ranks come from the maps built on the full
list, so the search filter can never renumber.

### 2c. Reset expansion when switching views

Participant names are the expansion keys in both Etappe and Algemeen views, so an expanded row
would carry across tabs. Add near `toggleItemDetails` (~line 127):

```ts
const switchView = (view: ViewType) => { setActiveView(view); setExpandedItem(null); };
```

and use it in the three view buttons (lines 142, 152, 162).

### 2d. Etappe view (lines 184–236): rank + medal + expansion

Per row: `const rank = stageRankMap.get(entry.participant_name) ?? entry.stage_rank;`

- **Mobile cards (189–208)**: restructure to mirror the Algemeen mobile card (248–289) — outer div
  `overflow-hidden`, clickable header div with `onClick={() => toggleItemDetails(entry.participant_name)}`
  + `cursor-pointer active:bg-tdf-bg`; show `#{rank}`; add `{rank <= 3 && <MedalIcon position={rank} className="text-sm" />}`
  next to the score; below the header the conditional expansion block.
- **Desktop table (210–234)**: wrap each `<tr>` in `<React.Fragment key={...}>`, add the same
  onClick + `cursor-pointer hover:bg-gray-100`; Positie cell shows `{rank}` + `<MedalIcon position={rank} />`;
  after the row a conditional `<tr className="bg-gray-100"><td colSpan={4} className="px-4 py-4">…`.

**Expansion content ("Punten per Renner"), shared logic for both variants** (styling copied from
the Algemeen expansion, lines 272–285 / 322–337):

```ts
const contributions = Object.entries(entry.stage_rider_contributions ?? {})
  .map(([riderName, points]) => ({ riderName, points: points ?? 0 }))
  .sort((a, b) => b.points - a.points);
const contribSum = contributions.reduce((s, c) => s + c.points, 0);
const ploegBonus = entry.stage_score - contribSum; // Dagploeg +6 zit in stage_score, niet in contributions
```

Render: heading "Punten per Renner"; one row per rider (name left, points right); if
`ploegBonus > 0` a "Ploegenbonus" row; bold "Totaal" row = `entry.stage_score`; if no rows at all,
muted "Geen punten in deze etappe". (The Dagploeg bonus line matters — without it the breakdown
doesn't sum to the shown total; see `lib/pipeline.ts:248-256`.)

### 2e. Algemeen view (lines 238–346)

- Lines 245/306: `const medals = medalsByParticipant.get(entry.participant_name) ?? { gold: 0, silver: 0, bronze: 0, display: '' };`
- Lines 255/314: `overallRankMap.get(entry.participant_name) ?? entry.overall_rank`.
- `RankChange` (256/315): unchanged + one-line comment that arrows use dense server ranks.
- Expanded per-stage ranks: already tie-aware via Step 1c.

### 2f. Directie view (lines 348–450)

Lines 365/416: `directieOverallRankMap.get(entry.directie_name) ?? entry.overall_rank`.
(Directie scores are stored rounded to 1 decimal, so numeric equality is exact.)

## Step 3 — `src/pages/RennerPunten.tsx`

### 3a. Memos (after `totalRankings`, ~line 78)

```ts
const stageDisplayRanks = useMemo(
  () => competitionRankMap(stageRankings, r => r.stage_points, r => r.name), [stageRankings]);
const totalDisplayRanks = useMemo(
  () => competitionRankMap(totalRankings, r => r.total_points, r => r.name), [totalRankings]);
```

Both source lists arrive pre-sorted by points desc, so `filteredResults` needs no sort change.

### 3b. View-switch reset

`const switchView = (view: ViewType) => { setActiveView(view); setExpandedRider(null); };` — use in
the three buttons (lines 171, 181, 191).

### 3c. Etappe view ranks (lines 230, 285)

`const rank = stageDisplayRanks.get(rider.name) ?? rider.stage_rank;` → `#{rank}` / `{rank}`.
Medals here already exist (`renderMedal(rider.stage_finish_position)`, lines 256/291) — unchanged.

### 3d. Etappe view expansion (mobile 222–263, desktop 265–318)

All data is on the row itself (`RiderRankingsStageEntry`: `stage_points`, `stage_finish_position`,
`stage_finish_points`, `jersey_points` incl. `combative`) — no `getRiderData` lookup needed.

Mirror the Algemeen pattern: mobile card gets outer `overflow-hidden` + clickable header with
`onClick={() => setExpandedRider(expandedRider === rider.name ? null : rider.name)}`; desktop row
wrapped in `<React.Fragment>` + conditional `<tr className="bg-gray-100"><td colSpan={4}>…`.

**Expansion content ("Punten opbouw")**:

```ts
const jp = rider.jersey_points ?? {};
const rows = [
  rider.stage_finish_points > 0 && {
    label: `Aankomst (#${rider.stage_finish_position})`, points: rider.stage_finish_points },
  ...(['yellow', 'green', 'polka_dot', 'white'] as const)
    .filter(j => (jp[j] ?? 0) > 0)
    .map(j => ({ label: JERSEY_LABELS[j], icon: JERSEY_ICONS[j], points: jp[j] })),
  (jp.combative ?? 0) > 0 && { label: 'Strijdlust', combative: true, points: jp.combative },
].filter(Boolean);
```

Render each row with its icon (`<img className="w-4 h-4">` / `<CombativeIcon size="sm" />`,
matching the Algemeen expand at 371–380/439–448), label left, points right; "Totaal" row =
`rider.stage_points`; empty state "Geen punten in deze etappe". Import `JERSEY_LABELS` from
`../../lib/constants` (JERSEY_ICONS already imported).

### 3e. Algemeen view (lines 342, 420)

`totalDisplayRanks.get(rider.name) ?? rider.overall_rank`. Medal column (`medal_counts`, race-finish
based) and the expanded per-stage `#{stage.stage_finish_position}` (a race position, not a pool
rank) stay unchanged.

## Step 4 — Tests: `tests/data-transforms.test.ts` (new)

- `assignCompetitionRanks`: unique scores → 1..n; tie for 2nd → 1,2,2,4; tie for 1st → 1,1,3
  (silver skipped); all equal → all 1; empty → []; stability within ties.
- `competitionRankMap`: keys map to correct ranks.
- `getAllParticipantMedals`: two tied for a stage win → both gold:1, third gets bronze, no silver;
  multi-stage accumulation; `display` matches `formatMedalDisplay`.
- `getParticipantStages`: tied `stage_score` yields the shared derived rank, not the server rank.

## Edge cases

- Rank maps built from the full lists before search filtering — filtering never renumbers.
- Every rank lookup falls back to the server rank (`?? entry.stage_rank`) — never `#undefined`.
- Empty `stage_rider_contributions` / zero-point rows → "Geen punten in deze etappe".
- `undefined` contribution values → `?? 0`; missing `jersey_points` → `?? {}`.
- Rest days / absent stage keys already handled by existing `|| []` fallbacks.
- Loading state: memos run on `[]`, pages early-return anyway.
- `rank_change` arrows use dense server ranks — accepted, documented artifact.
- Do not touch `src/hooks/useBusinessLogic.ts` (unused) or server-side rank code
  (`lib/pipeline.ts`, `lib/json-generators.ts`).

## Verification

1. `npm run check` (eslint + tsc) and `npm test` — new tests plus existing golden/scoring tests green.
2. `npm run dev` → http://localhost:5173 (`.env` already points `VITE_DATA_BASE_URL` at the public
   blob store with real 2026 snapshots — no local data setup).
3. Click-through (mobile width and desktop width via devtools):
   - **Klassement → Etappe**: rows with equal points share a rank and the next rank skips
     (1,2,2,4); top-3 show 🥇🥈🥉; clicking a row expands rider contributions sorted desc, summing
     (incl. any "Ploegenbonus" row) to the stage total; clicking again collapses; expand then
     switch tabs → nothing pre-expanded.
   - **Klassement → Algemeen**: tied totals share a rank; medal column is tie-aware (a participant
     tied for a stage win shows gold); expanded per-stage ranks tie-aware.
   - **Klassement → Directie**: tied averages share a rank.
   - **RennerPunten → Etappe**: tied `stage_points` share a rank; click a rider → breakdown rows
     (Aankomst / trui rows with icons / Strijdlust) sum to the stage total; a 0-point rider shows
     the empty state.
   - **RennerPunten → Algemeen**: tied totals share a rank; medal column unchanged.
   - **Search**: in each view, filter to mid-table rows → ranks unchanged from the unfiltered view.

## Sequencing

1. `lib/data-transforms.ts` utilities + tests (independently verifiable).
2. `Klassement.tsx` (rank maps, sorts, medals incl. Etappe medals, Etappe expansion, view reset).
3. `RennerPunten.tsx` (rank maps, Etappe expansion, view reset).
4. `npm run check` + `npm test` + manual click-through.
