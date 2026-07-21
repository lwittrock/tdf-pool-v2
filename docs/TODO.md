# TODO

Open items only. Completed design/polish/table work was pruned 2026-07-21 —
see the git log and `docs/todo-plan.md` for the full plan and rationale.

## Engagement & interactions  [D]
- More interactions that don't change the pool's rules — ideas captured in
  [engagement-plan.md](engagement-plan.md). Top ROI: **pin yourself**
  (localStorage). "Biggest winner of the day" is earmarked for the landing page.
  Not building yet.

## Content  [#22, #1]
- **Spelregels**: replace the "in aanbouw" placeholder with scoring rules + an
  icon legend (and an inline legend on Ploegen).
- Little start/finish **map** on the Etappe page (deferred — needs per-stage coordinates).

## Housekeeping  [#21]
- Full audit & polish round (the design-consistency pass is done, 2026-07-21;
  a broader code/UX audit is still open).

## Later / bigger  [#15, #16, #23]
- Simple shared-password **login** (~30-day cache) for privacy once real names go live.
- **2027 team submission** flow (see `docs/season-2027-plan.md`).
- **Landing page** — aggregates preview standings + **biggest winner of the day**
  + jersey classementen (#12/#13). See [engagement-plan.md](engagement-plan.md).

## Jersey competitions  [#12, #13]
- Green (most stage wins) + yellow (#1 leader) markers, and polka (combativity
  points). **Transforms + tests are DONE and parked** in `data-transforms.ts`;
  they need a dedicated **landing page** to live on (see later / bigger)