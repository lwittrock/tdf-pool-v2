# TODO

Open items only. Completed design/polish/table work was pruned 2026-07-21 —
see the git log and `docs/todo-plan.md` for the full plan and rationale.

## Naming & navigation  [#2, #9]
- Rename **Poule → Klassement** (leaning yes) and reorder the nav to
  `Klassement · Ploegen · Etappes · Renners · Spelregels`.
- Open decision: what to call **Rennerpunten** — *Renners* / *Beste renners* / keep.

## Jersey competitions  [#11, #12, #13]
- Best-team icon: make it the combativity bib in yellow (unify the two bibs into
  one numbered bib). A yellow `DagploegIcon` already exists — still needs the unify.
- Green (most stage wins) + yellow (#1 leader) markers, and polka (combativity
  points). **Transforms + tests are DONE and parked** in `data-transforms.ts`;
  they need a dedicated "klassementen" page to live on (page deliberately deferred).

## Content  [#22, #1]
- **Spelregels**: replace the "in aanbouw" placeholder with scoring rules + an
  icon legend (and an inline legend on Ploegen).
- Little start/finish **map** on the Etappe page (deferred — needs per-stage coordinates).

## Housekeeping  [#19, #20, #21]
- Add **CLAUDE.md**.
- Consolidate / clean up the old plans in `docs/`.
- Full audit & polish round (the design-consistency pass is done, 2026-07-21;
  a broader code/UX audit is still open).

## Later / bigger  [#15, #16, #23]
- Simple shared-password **login** (~30-day cache) for privacy once real names go live.
- **2027 team submission** flow (see `docs/season-2027-plan.md`).
- **Landing page** with preview standings.
