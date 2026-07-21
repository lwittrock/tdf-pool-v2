# 2026 poule test fixtures

Golden test data extracted from the real 2026 Excel administration
(128 participants; originally after stage 4, extended to **stage 9** from
the owner's `UITSLAG ETAPPE 9.xlsx` export in July 2026 — every value
machine-extracted and cross-validated, 0 transcription mismatches). The
rebuilt scoring engine must reproduce `expected_standings.json` from
`team_selections.json` + `stage_results/` + the scoring rules documented
in `docs/archive/architecture-review.md` ("Scoring specification").

## Files

- `team_selections.json` — 128 participants: 10 riders (one participant has 9
  — an empty slot in the source sheet), a reserve, a Ploeg (team pick), and a
  directie code as written in the sheet (free text; case variants exist).
  `reserve_active` marks reserves that count toward the score (the source
  sheet has no explicit DNS list, so activation was inferred from the sheet's
  own reserve point rows).
- `stage_results/stage_N.json` — top-20 finishers, jersey holders, combativity
  ("rode rugnummer") and the Dagploeg per stage (the winner of the stage's
  **team day classification** — NOT the stage winner's team), plus `dns`/`dnf`
  lists for mid-Tour casualties (source: PCS startlist annotations).
- `expected_standings.json` — per participant the stage points and cumulative
  totals exactly as in the Excel, plus directie groups and scores.

## Anonymization

Participants are `P001`…`P128` in sheet order; only the owner's entry carries
a name. Rider and team names are public sports data. Do not add real
participant names to these files.

## Known quirks in the source Excel (kept for honesty, already accounted for)

1. One participant (P115) has only 9 riders (empty selection slot) — and the
   stage-9 export proved their reserve **counts from stage 1** (the stage-4
   extraction had inferred `reserve_active: false` from all-zero reserve
   rows; the reserve simply first scored in stage 5). Corrected July 2026.
2. The directieklassement's display table disagrees with the sheet's own
   stated formula (average of the top-5 cumulative totals) for the combined
   group "DI - DBV - iDomein - TDA": 280 vs 400 after stage 4, 772 vs 907.8
   after stage 9. `directie_scores_computed` holds the formula-correct
   values; `directie_scores_sheet_table` preserves the sheet's display.
3. Two directies ("Consumenten", "Vrienden van en buiten de ACM") are
   missing from the sheet's directieklassement display entirely; the
   computed scores include them.
4. The sheet scored the spellings "TOBIAS JOHANNESSEN" and "TOBIAS HALLAND
   JOHANNESSEN" as different riders (same person). These fixtures reproduce
   that faithfully; the production DB merged them by owner ruling (see
   `docs/archive/phase-a-review-findings.md` 8b).

Verification: all 128 × 9 stage totals and cumulatives recompute exactly
from these files (finish points 25/19/18…1, jerseys 15/10/10/10,
combativity 5, Dagploeg +6 via the Ploeg pick, reserve when active,
mid-Tour DNS substitution at stage 6), machine-checked against the owner's
stage-9 Excel export. The raw export itself is git-ignored (real names).
