# 2026 poule test fixtures

Golden test data extracted from the real 2026 Excel administration
(standings after stage 4, 128 participants). The rebuilt scoring engine
must reproduce `expected_standings.json` from `team_selections.json` +
`stage_results/` + the scoring rules documented in
`docs/architecture-review.md` ("Scoring specification").

## Files

- `team_selections.json` — 128 participants: 10 riders (one participant has 9
  — an empty slot in the source sheet), a reserve, a Ploeg (team pick), and a
  directie code as written in the sheet (free text; case variants exist).
  `reserve_active` marks reserves that count toward the score (the source
  sheet has no explicit DNS list, so activation was inferred from the sheet's
  own reserve point rows).
- `stage_results/stage_N.json` — top-20 finishers, jersey holders, combativity
  ("rode rugnummer") and the Dagploeg (stage winner's team) per stage.
- `expected_standings.json` — per participant the stage points and cumulative
  totals exactly as in the Excel, plus directie groups and scores.

## Anonymization

Participants are `P001`…`P128` in sheet order; only the owner's entry carries
a name. Rider and team names are public sports data. Do not add real
participant names to these files.

## Known quirks in the source Excel (kept for honesty, already accounted for)

1. One participant has only 9 riders (empty selection slot).
2. The directieklassement's ranking table shows **280** for the combined group
   "DI - DBV - iDomein - TDA", but the sheet's own member block — and the
   sheet's stated formula (average of the top-5 cumulative totals) — give
   **400**. `directie_scores_computed` holds the formula-correct values;
   `directie_scores_sheet_table` preserves what the sheet displayed.
3. One participant (directie "Consumenten") is missing from the sheet's
   directieklassement entirely; the computed scores include them.

Verification performed at extraction time: all 128 × 4 stage totals recompute
exactly from these files (finish points 25/19/18…1, jerseys 15/10/10/10,
combativity 5, Dagploeg 6 via the Ploeg pick, reserve when active), and all
directie scores match the sheet's formula.
