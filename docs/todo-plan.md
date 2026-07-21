# TdF Poule — Plan for open TODO items

_Written 2026-07-19. Companion to `docs/TODO.md` (the raw brain-dump). This
turns the 23 items into a prioritised, actionable plan and flags which ones are
**already shipped** so they can be ticked off._

---

## 0. Status triage

Six items on the list are already done in the codebase (Phase 1 polish, commit
`0625a4a`, plus later work). They're still written in `TODO.md` but need no
work — just cross them off:

| # | Item | Where it landed |
|---|------|-----------------|
| 3 | Freshness "Na etappe N" moved below the search | `FreshnessNote.tsx`, used in Poule/Rennerpunten |
| 4 | Combative icon too large | Etappes `RowIcons` → 16px, combative rendered at 0.8× |
| 7 | Search focus outline yellow+blue bug | Unified `focus:outline-none focus:border-tdf-accent` in Button/Autocomplete |
| 14 | Footer (copyright + disclaimer) | `Layout.tsx` |
| 17 | "Etappe/Totaal Punten" → just "Punten" | Poule/Rennerpunten headers |
| 18 | "vercel run failed" every push | Was GitHub Actions CI failing on a win32-only lockfile; fixed by `npm install` in CI (`d42ea9a`) |

**Partially done:** #11 — a `DagploegIcon` (yellow bordered square) already
exists and is used in the Etappes jersey strip. What's left is the numbered
variant + unifying it with the combativity icon (see Phase 3).

That leaves **16 open items**, grouped into six phases below, ordered by
value-for-effort. Phases 1–4 are the meat; 5 is housekeeping; 6 is deliberately
"later".

---

## Phase 1 — Naming & navigation (small, decision-led)

Cheap, high-visibility, and unblocks how everything else is labelled. Do first.

### #2 + #9 — Rename "Poule" → "Klassement" and reorder the nav
Decision from memory: the app is polish-focused and this rename was leaning
"yes". Target nav order:

```
Klassement · Ploegen · Etappes · Beste renners · Spelregels
```

Rationale for the reorder: standings first (what people come for), then their
own team (Ploegen), then the race (Etappes), then the rider stats (Beste
renners), then rules.

Changes:
- `src/App.tsx` — reorder `navItems`; change `/poule` label to `Klassement`.
  Keep the route path `/poule` (or add `/klassement` + redirect) so existing
  links/bookmarks don't break. There's already a `/Klassement → /poule`
  redirect; consider flipping the canonical path to `/klassement` and
  redirecting `/poule` the other way.
- `lib/constants.ts` — `LABELS.POULE` value → `Klassement` (the key can stay).
- `src/pages/Poule.tsx` — `<Layout title="Poule">` → title from `LABELS`.
- Page `<title>` via `usePageTitle` follows automatically.

**Open decision (needs owner):** "Rennerpunten" → **"Beste renners"**? The item
says "not sure about name here". Options: _Beste renners_, _Rennerpunten_
(status quo), _Renners_. Recommend **Renners** or **Beste renners** — short and
clearer than "Rennerpunten". Whatever we pick, update `LABELS.RENNERPUNTEN`,
the route, and the page title in one go.

**Effort:** ~1 hour incl. redirects. **Risk:** low (mostly string + array edits).

---

## Phase 2 — Table & visual redesign (the big one)

Item #8 ("desktop tables look old-fashioned; better on mobile") is the root
cause; #6 (column widths) and part of #10 fold into it. This is the highest-
impact visual work. Do it as one focused pass so the five tables stay
consistent — they already share `StandingsTable`/`ExpandableCard`, so the fix
lives mostly in one file.

### #8 — Modernise the desktop table treatment
Current look (`StandingsTable.tsx`): full-width `<table>`, grey sticky header,
zebra `bg-white`/`bg-tdf-bg`, 3–4 px cell padding. It reads as a spreadsheet.

Direction (pick a lane, don't do all):
- **Card-table hybrid:** drop hard zebra striping; use generous row height
  (`py-4`), a hairline row divider (`divide-y divide-gray-100`), and a subtle
  hover lift. Round the whole table container (`rounded-xl overflow-hidden
  shadow-sm ring-1 ring-gray-200`) so it reads as one surface like the mobile
  cards.
- **Typography:** rank in a tabular-nums medium weight; participant name as the
  visual anchor (slightly larger / darker); secondary columns (directie, team)
  in `text-tdf-text-secondary`. Right-align and `tabular-nums` all numeric
  columns so points line up.
- **Header:** lighter — smaller uppercase tracking-wide label, or just a bottom
  border instead of a filled `bg-table-header` bar.
- Keep the sticky-header behaviour and keyboard/expand affordances already in
  `StandingsTable`.

Because all five tables flow through `StandingsTable`, this is one component
edit plus a token pass — verify each page after.

### #6 — Column widths
Add an optional `width`/`className` per `Column` (the spec already carries
`headerClassName`/`cellClassName`; add a `widthClass` or use a `<colgroup>`).
Targets:
- **Deelnemer** column too narrow → give it the flex/`w-full` growth column;
  make numeric columns `whitespace-nowrap` and shrink-to-fit.
- **+/- (rank change)** sits too far from **Positie** → move the `+/-` column
  immediately after Positie (it already is in Poule — verify), and tighten the
  gap so the arrow reads as part of the rank. Consider merging rank + change
  into a single cell (`3 ↑2`) for a tighter, more modern look.

### #5 — Blank repeated rank numbers on ties
Ranks are already tie-aware (`competitionRankMap` → 1, 2, 2, 4). For visual
calm, show the rank only on the **first** row of each tie group and leave the
cell blank for the repeats.
- Implement in the `render` of the "Positie" column: compare against the
  previous row's rank (the render fn already receives `index`; pass the sorted
  rows in or compute a `firstOfRankSet`). Cleanest: precompute a
  `Set<string>` of "names that are the first at their rank" once per sorted
  list, then `render` returns blank when not in the set.
- Keep medal icons on the first row only too.
- **Caveat:** only blank when the list is sorted by that rank key. On the
  medal-sorted Algemeen view, the tie groups differ — recompute per active
  sort, or skip blanking there.

### #10 — Etappes: heading above the jersey strip
The jersey strip feels small/orphaned above the big results table. Add a small
section structure:
- A heading/label above `JerseyStrip` — e.g. **"Truien & klassementen"** (or
  "Na deze etappe") with a bit more vertical rhythm, and a matching **"Uitslag"**
  heading above the results table. This gives the jerseys their own visual block
  instead of floating.
- Fold into the Phase 2 pass so spacing tokens match the new table look.

**Effort:** 1–2 focused sessions. **Risk:** medium — touches every standings
page; verify with the `verify` skill (build + drive the frontend) after.

---

## Phase 3 — Jersey / bib icons + jersey competitions

Two sub-parts: (a) unify the bib icons (#11), (b) surface the extra
classifications (#12, #13). (a) is quick; (b) needs rule decisions.

### #11 — Unify combativity + best-team into one numbered bib
`CombativityIcon` (red square + rider number) and `DagploegIcon` (yellow square
+ bars) are two components doing the same visual job. Merge into one:
- New `NumberBib` (or extend `CombativityIcon`) with a `color`/`variant` prop:
  `combative` (red `#d32f2f`) and `dagploeg`/`best` (yellow `#eab308`), plus an
  optional `riderNumber`.
- Gives #11 its ask directly: the best-team marker becomes "the combative icon
  but yellow", optionally with a number. Keep the current bar-glyph only if we
  can't get a meaningful number for a *team*; a plain yellow numbered bib for
  the best-overall rider is the cleaner reading of the item.
- Replace both usages in `Etappes.tsx` (strip + `RowIcons`).

**Effort:** ~1 hour. **Risk:** low.

### #12 — Yellow-jersey #1 marker + green-jersey (most stage wins)
Good news: **the data already exists client-side** — no backend change.
`leaderboardsData.leaderboard_by_stage` holds every participant's `stage_rank`
per stage.

- **Yellow jersey (leider):** the participant at overall rank 1 in the current
  standings. Render a small yellow-jersey icon next to their Positie on the
  Algemeen/Klassement view. Trivial — we already compute `overallRankMap`.
- **Green jersey (meeste ritzeges):** count, across all completed stages, how
  many times each participant had `stage_rank === 1` (a daily win). Add a
  transform in `lib/data-transforms.ts`:
  `stageWinCounts(leaderboardsData): Map<name, number>`, then the max holder(s)
  get a green-jersey icon next to their rank.
- **Where to show it:** a compact icon in the Positie cell (Phase 2 gives room
  for it). Also consider a small "klassementen" summary strip at the top of
  Klassement: _Geel: X · Groen: Y · Bolletjes: Z_ so these competitions get the
  attention #12 says they're missing.
- **Tie handling:** if several share the most wins, either show the icon on all,
  or break ties by total points. Decide (recommend: show on all tied, it's rare
  and fair).

### #13 — Polka-dot competition = combativity points (DECIDED)
**Rule (owner decision, 2026-07-19): most combativity points.** The polka-dot
jersey goes to the participant whose roster has racked up the most combativity
points across the Tour. Purpose: give a real payoff for picking non-GC
breakaway attackers (Simmons, Pidcock, Healy, Powless…), an incentive the yellow
(GC consistency) and green (daily wins) competitions don't provide.

```
polkaScore(participant) = Σ jersey_points.combative
                          over every rider on their roster, every stage
```

Why this is the clean version:
- Combativity is already a scored category — `COMBATIVITY_POINTS = 5` flat per
  award (`lib/scoring-constants.ts`), written by `lib/scoring.ts` into each
  rider's per-stage `jersey_points.combative` (`lib/types.ts` `RiderStageData`).
  So this is **summing an existing field**, no new scoring logic, no new admin
  data entry — combativity is already captured per stage.
- Flat 5 pts means this ranks identically to "count combativity awards", but
  framing it as *points* lets Spelregels explain it in one line and keeps it in
  the scoring system's own terms.

Implementation:
- New transform in `lib/data-transforms.ts`, e.g.
  `combativityPointsByParticipant(ridersData, teamSelectionsData): Map<name, number>`
  — for each participant, sum `jersey_points.combative` over the stages of each
  rider on their team. (Roster comes from `useTeamSelections()`; per-rider
  per-stage points from `useRiders()` — both already loaded on Ploegen.)
- The max holder(s) get a **polka-dot jersey icon** next to their Positie on the
  Klassement view (same treatment as yellow #1 / green in #12).
- Add it to the "klassementen" summary strip at the top of Klassement
  (_Geel · Groen · Bolletjes_) so the three competitions are visible in one place.
- **Tie handling:** show the icon on all tied leaders (rare, fair) — same policy
  as green.

Notes:
- These 5-pt chunks already sit inside each participant's overall total (the
  yellow/main klassement), so polka is a **slice** of points they already earn,
  re-ranked on its own — standard secondary-classification behaviour (green
  points count toward yellow in the real Tour too). Not double-counting.
- Naming: keep the polka-dot jersey icon; label the competition
  **"Strijdlust" / "Aanvallersklassement"**. Document the rule in Spelregels (#22).
- **Parked alternative** (not chosen): "best team minus your top rider" — rewards
  roster depth instead of attacking. Revisit only if combativity spread turns out
  too sparse. A lighter enrichment, also parked: fold in `jersey_points.polka_dot`
  (real KOM-jersey points) for a combined attack-and-climb score — but that
  rewards picking the actual KOM leader (often a GC/climber), diluting the pure-
  attacker incentive, so left out on purpose.

**Effort:** ~half a session (one transform + icon wiring, mirrors #12).

---

## Phase 4 — Content: Spelregels + etappe map

### #22 — Spelregels page (currently "in aanbouw")
The one real content gap. Replace the placeholder in `src/pages/Spelregels.tsx`
with:
1. **Scoring rules** — how stage points, medals, the Dagploeg/ploegenbonus, and
   the Directie top-N average work. Pull the real numbers from
   `lib/scoring-constants.ts` so the page can't drift from the engine.
2. **Icon legend** — one place explaining every glyph: 🥇🥈🥉 medals, the four
   jerseys, combativity bib, dagploeg bib, and the new classification icons from
   Phase 3. This directly covers the "#5.4 inline legend" idea.
3. Keep it plain and readable (prose + a small table), theme-aware, mobile-first.

Optionally surface a condensed legend inline on **Ploegen** (the "5.4" note),
reusing the same legend component so there's a single source of truth.

**Effort:** ~half a day (mostly writing copy). **Risk:** low.

### #1 — Little start/finish map on the Etappes page
`StageHeader` already shows the route as text ("Ennezat → Le Mont-Dore"). A map
adds polish but is the most "extra" item here.
- **Constraint:** the site is a static Vite build on Vercel; avoid a heavy
  mapping lib / API-key dependency if possible.
- **Cheap options (recommended):** a small inline SVG of France with two dots
  (start/finish) if we have lat/long per stage; or a static map image. Check
  whether the stages snapshot carries coordinates — if not, this needs a data
  source, which bumps effort.
- **Heavier option:** Leaflet + a tile provider (needs attribution + possibly a
  key). Probably overkill for a poule.

**Recommendation:** defer unless we already have coordinates. If we do, a static
mini-map is a nice, low-risk touch. **Decision needed:** do we have per-stage
coordinates?

---

## Phase 5 — Housekeeping

Do the docs cleanup and CLAUDE.md **before** the full audit, so the audit works
against tidy references. Best done after Phases 1–3 land (so it audits the new
state, not the old).

### #19 — Add `CLAUDE.md`
No root `CLAUDE.md` exists yet. Run `/init` to seed it, then trim to the
essentials: stack (Vite + React + TS + Tailwind v4, Supabase, Vercel), the
snapshot/JSON data-flow model, the `ploeg` = selection vs `team` = pro-team
naming rule, the "CI uses `npm install` not `npm ci`" gotcha, and how
`beheer`/admin publishing works. Keep it short — it's loaded every session.

### #20 — Consolidate the `docs/` folder — DONE (2026-07-21)
Moved the four unreferenced historical planning docs (`frontend-improvement-plan`,
`handoff-cleanup`, `implementation-plan`, `next-steps-plan`) into `docs/archive/`
with a README; fixed the one inbound link from `architecture-review.md`. Kept in
`docs/`: `TODO.md`, this `todo-plan.md`, `season-2027-plan.md`, plus the docs
still referenced by the README / `.env.example` / `data/` (`architecture-review`,
`phase-a-go-live`, `phase-a-review-findings`, `stage-prefill-plan`).

### #21 — Full audit & polish round
After Phases 1–3, do a sweep for leftovers: dead labels (e.g. `LABELS.TOTAL_POINTS`
may now be unused), orphaned components, stale comments referencing old names
(Poule→Klassement), unused routes, and a11y/contrast in the new table styles.
- Run `tsc`, `eslint`, `vitest`, then the `verify` skill end-to-end.
- Consider `/code-review` on the accumulated diff.

---

## Phase 6 — Later / bigger bets (not now)

### #15 — Simple shared-password login (privacy gate)
This is the gate for switching participant numbers → real names. Brainstormed
approach:
- **Single shared password** for everyone, checked against a value in an env
  var / Supabase; on success set a **long-lived cookie/localStorage token
  (~30 days)** so people log in once.
- Keep it client-side-light: the data is already public JSON snapshots, so
  "login" here is a soft privacy curtain, not real auth. If real protection is
  wanted, the snapshots themselves must move behind an authenticated endpoint —
  bigger change.
- **Decision needed:** soft gate (easy, hides names casually) vs. real gate
  (protect the JSON, more work). Recommend soft gate for 2026, revisit if real
  names raise the bar.
- Only worth doing **when** real names go live.

### #23 — Landing page with preview standings
A marketing/entry page showing top-N preview + jersey holders before diving in.
Depends on the Phase 2 table look and Phase 3 jerseys being done first, so it
showcases the finished product. Defer until then.

### #16 — 2027 team submission
Already scoped in `docs/season-2027-plan.md`. Explicitly not a priority for the
2026 season. Leave as-is.

---

## Suggested execution order (TL;DR)

1. **Tick off** #3, #4, #7, #14, #17, #18 in `TODO.md` — already shipped.
2. **Phase 1** — rename Poule→Klassement + nav reorder (#2, #9). _Decide the
   Rennerpunten name._
3. **Phase 2** — desktop table redesign (#8) absorbing column widths (#6),
   blank duplicate ranks (#5), Etappes headings (#10).
4. **Phase 3** — unify bibs (#11), then yellow+green jerseys (#12), then the
   polka = combativity-points competition (#13, rule decided).
5. **Phase 4** — Spelregels content + icon legend (#22); mini-map (#1) only if
   coordinates exist.
6. **Phase 5** — CLAUDE.md (#19), docs cleanup (#20), full audit (#21).
7. **Later** — login (#15), landing page (#23), 2027 submission (#16).

## Decisions I need from you
- **Rennerpunten** → keep, or rename to _Beste renners_ / _Renners_? (#9)
- ~~**Polka-dot competition** rule~~ — DECIDED: most combativity points (#13).
- **Etappe map** (#1): do we have per-stage start/finish coordinates anywhere?
- **Login** (#15): soft privacy curtain, or really protect the JSON? (only
  matters once real names go live)
