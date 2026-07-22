# Audit findings — code/UX consistency sweep (2026-07-22, #21)

Report-only audit run against the brief in [audit-prompt.md](audit-prompt.md),
covering frontend + backend. Baseline was green and **no P0/correctness or
security issues survived verification** — findings are consistency and leftover
cleanup. The clear-cut items were then fixed in the same pass (see Outcome).

Baseline (before & after fixes): `npm run check` clean (eslint zero-warnings +
tsc app/api), `npm test` 71 passed incl. golden 2026 suite, `npm run build` ok.

## Findings & outcomes

| # | Sev | Area | Location | Description | Outcome |
|---|----|------|----------|-------------|---------|
| 1 | P1 | i18n / consistency | `Ploegen.tsx` | Loading/error hand-rolled with hardcoded English ("Loading...", "Error:") instead of shared `LoadingState`/`ErrorState` | **Fixed** — now uses the shared states |
| 2 | P2 | dead code | `constants.ts` | `TABLE_CLASSES` + `BREAKPOINTS` never consumed | **Fixed** — removed |
| 3 | P2 | dead code | `shared/StageBreakdown.tsx`, `data-transforms.ts` | Orphaned component + its sole consumer `getStageAwards` | **Fixed** — both removed |
| 4 | P2 | dead code | `MedalDisplay.tsx` | `MedalDisplay` + bare `MedalCounts` components never rendered | **Fixed** — removed (kept `MedalIcon`/`MedalCountsAligned`/`MedalCountsColumns`) |
| 5 | P2 | dead code / drift | `constants.ts` | `SEARCH_TEAM_PLACEHOLDER` unused + text drifted | **Fixed** — removed |
| 6 | P2 | design dup / a11y | `Rennerpunten.tsx` | Inline `CombativeIcon` re-implemented `NumberBib variant="combative"`; no `aria-label` | **Fixed** — uses shared `NumberBib` (adds accessible name) |
| 7 | P2 | cross-page | `Rennerpunten.tsx` | Medal column showed raw `display` string vs aligned columns on Klassement | **Fixed** — uses `MedalCountsColumns`/`MedalCountsAligned` like Poule |
| 8 | P2 | types | `Rennerpunten.tsx` | `Column<any>` + `(r: any)` ×6 where siblings are typed | **Fixed** — typed with `RiderRankingsTotalEntry` |
| 10a | P3 | i18n | `Etappes.tsx` | `<Layout title="Etappes">` bypassed `LABELS` | **Fixed** — uses `LABELS.ETAPPES` |
| 11 | P3 | doc drift | `StandingsTable.tsx` | Top-of-file comment said "zebra striping"; code says no zebra | **Fixed** — comment corrected |
| 9 | P2 | cross-page | `Ploegen.tsx` | Uses `Card`/`CardRow`/`CardExpandedSection` vs `ExpandableCard` elsewhere — two mobile primitives | **Skipped** — open design question |
| 10b | P3 | i18n | `Rennerpunten.tsx`, `Ploegen.tsx` | Hardcoded search placeholders (no `LABELS` entry yet) | **Skipped** — needs new label naming |
| 12 | P3 | terminology | `Poule.tsx` | Dagploeg bonus labeled "Ploegenbonus" | **Skipped** — wording is owner's call |
| 13 | P3 | consistency | `prefill.ts` | Second `JERSEY_LABELS` (lowercase) shadows the constant; feedback vs note casing | **Skipped** — server feedback text, low value |
| 14 | P3 | cross-page | `Ploegen.tsx` | No `FreshnessNote` while Poule/Renners show one | **Skipped** — design choice |
| 15 | P3 | design | Poule/Ploegen | Inner rows hover `bg-table-header` vs table rows `bg-tdf-card-hover` | **Skipped** — design choice |
| 16 | P3 | routing | `App.tsx` | `/EtappeBeheer` renders admin directly instead of redirecting to `/admin` | **Skipped** — open question |

## Verified clean (real coverage)

- Public site never queries the DB; only the `/admin` panel fetches `/api/*`.
- `run_id` keying / atomic snapshot swap in `useTdfData` is correct.
- Scoring constants match the README cell-for-cell; no stray magic numbers.
- Golden suite covers 128 participants × every completed stage; no skips.
- Tie-aware ranks used for display everywhere; server ranks only as fallback.
- `fetchAll` wraps every >1000-row read; raw selects are on bounded tables.
- PCS re-tap merge honors its "never discard manual edits" contract; tested.
- CI uses `npm install`; no `@ts-ignore`/`eslint-disable`; no committed secrets;
  no debug `console.log` or `TODO`/`FIXME` in shipped code.

## Open questions (for the owner)

- #9/#15 — migrate Ploegen to `ExpandableCard` for one mobile system?
- #16 — should `/EtappeBeheer` redirect to `/admin`?
- #12 — "Ploegenbonus" vs "Dagploeg" wording for users?
