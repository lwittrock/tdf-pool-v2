# Frontend improvement plan (July 2026)

Follow-up to the full frontend review of July 15, 2026 (typography, layout, color,
information design, consistency; verified against the running app at desktop and
mobile widths). This plan turns the findings into decided work, recommended work,
and open decisions. The app is a live demo — polish matters, but nothing here is
an incident.

**Status legend** — each item carries one of:

- ✅ **Decided** — owner endorsed it; ready to implement.
- 👍 **Recommended** — reviewer recommends; owner leans yes but hasn't confirmed.
- ❓ **Open** — needs an owner decision (question stated inline).
- 🚫 **Dropped** — reviewed and consciously not doing (kept for the record).

---

## 0. Information architecture — ✅ Decided (July 15): Proposal A v2, as specified in 0.2

Owner concerns (July 15, after the review):

1. The two main pages mix a **one-stage snapshot** (Etappe tab) with **cumulative
   standings** (Algemeen, Directie/Team) as sibling tabs. Not ideal.
2. "Klassement" is arguably the wrong page name *because* of that mix — the
   Etappe tab isn't a klassement.
3. The Team tab on Renner Punten "doesn't say much" on its own merits…
4. …but the structural consistency between the two pages is worth keeping.

These four observations share one root cause. Today **pages = entity**
(participants / riders) while **tabs = a mix of axes** (time scope *and*
grouping). The Etappe tab is the odd one out on both pages.

### Evolution of the proposal

**Proposal A (v1, superseded)** made pages = time scope: both per-stage views
(participants *and* riders) would move to the Etappes page, leaving the two
main pages purely cumulative. Owner liked the direction but flagged two
problems (July 15): the Etappes page would then do two unrelated jobs (race
results + pool stage results — too much for one page), and the two views that
**must** be easiest to reach are the *daily participant results* and the
*overall participant standings* — v1 separated exactly those two onto
different pages.

**Two insights resolve it:**

1. The must-be-easy views are both *participant* views, so for participants
   the entity axis outranks the time axis: daily and overall participant
   results belong on the same page. And the original naming objection
   dissolves on its own — a daily ranking **is** a klassement
   (*dagklassement* is standard cycling Dutch), so a Dag tab doesn't pollute
   a page called Klassement.
2. The Etappes "Uitslag" table and a rider-per-stage ranking are nearly the
   same table: the top-20 finishers *with a points column* effectively **is**
   the rider stage ranking (they differ only where jersey/strijdlust points
   reorder a few riders). So the Etappes page needs **no Renners tab at all**
   — one merged results table covers both, and the rider Etappe tab on
   Renner Punten becomes redundant rather than homeless.

### Proposal A (v2, recommended): pool pages vs race pages

| Page | Identity | Content |
|------|----------|---------|
| **Klassement** | the pool — participants | Tabs **Dag · Algemeen · Directie**. All three are participant klassementen (daily, overall, grouped). |
| **Etappes** | the race — one stage at a time | Stage chips 1–21 · stage info card · **one merged results table** (positie, renner, tijdverschil, **verdiende punten**) · jersey/strijdlust/dagploeg strip · "overige puntenscoorders" (jersey-only scorers outside the top-20) · DNF/DNS. **No tabs.** |
| **Rennerpunten** (rename from "Renner Punten") | riders, cumulative only | **No tabs** (owner, July 15): just the overall rider standings. Per-stage rider detail lives on Etappes (browsable for all past stages via the chip selector); the "Per team" grouping idea was dropped with the tabs. |
| Team Selecties, Over deze Poule | unchanged | |

Why v2 resolves all the concerns:

- Klassement's tabs are now all the same kind of thing (participant
  klassementen) — the snapshot/cumulative mixing stops being an axis
  violation and the page name is accurate (concerns 1 + 2).
- Daily participant results and overall standings sit one tab apart on the
  main page — the two must-see views stay together.
- The Etappes page has one job: the race. Single table, no tabs, not
  overloaded.
- Rennerpunten loses its odd tabs entirely and becomes a single clean list
  (concerns 3 + 4 — the "Team" tab question disappears rather than needing an
  answer). The asymmetry with Poule (which keeps tabs) is honest: riders'
  daily story lives on Etappes; participants' doesn't.

Sub-decisions within v2 (resolved July 15):

- ✅ **Default tab: Algemeen, plain.** No dag-podium teaser line (owner: keep
  the tabs simple). The daily-visibility need is served by the page-header
  scheme below instead.
- ✅ **Tab label: static "Dag"** — no dynamic labels; the page header carries
  the stage number.
- ✅ **Page-header scheme (replaces the per-tab h2s).** The review flagged
  that the h2 under the tabs mostly repeats the active tab label. New scheme:
  the *page* header does the contextual work, tabs stay bare, h2s are
  deleted. On `/poule`: h1 `Poule` with a persistent muted subline
  `Na etappe 12 (15 juli)` (freshness 5.1, visible on every
  tab). The Dag tab adds one slim context line of its own — the only tab
  where extra context is real information: `Etappe 12: Ennezat → Le Mont-Dore
  · volledige uitslag →`. Algemeen adds nothing; Directie adds only the
  method note. Same pattern on `/rennerpunten` (subline `Na etappe 12 (15 juli)`).
- ❓ **Historical dag view**: the Dag tab shows only the current stage. Once
  the Etappes chip selector exists as a shared component it could be reused
  here; defer until someone asks.
- Cross-links both ways: Dag context line → `/etappes`; Etappes page →
  "Dagstand deelnemers →" (`/poule`, Dag tab).

### Alternative B — 🚫 rejected (kept for the record)

Keep the current structure and rename around it (Etappe tabs → "Dag",
Etappes page as extra race-results page). Rejected July 15 in favor of A v2:
it keeps the redundancy (rider stage points in two places) and leaves the
Team-tab question unresolved.

### 0.1 Naming — ✅ Decided (July 15)

Owner rejected "Klassement" and "Renners"; picked **Poule** over the
recommended "Stand" and **Ploegen** over "Teamselecties". Final:

| Page | Decided name | Notes |
|------|--------------|-------|
| Pool standings | **Poule** | Owner choice. Minor accepted quirk: the mobile header brand also says "TdF Poule" — nav item and brand coexist. |
| Stage page | **Etappes** | "Uitslag" is the heading of the results table *inside* the page. |
| Rider points | **Rennerpunten** | One word — the current "Renner Punten" is an incorrect compound split. |
| Team selections | **Ploegen** | Owner choice, and it enables the vocabulary rule below. |
| About | **Spelregels** | Matches the planned content (rules + icon legend, 5.3). |

Nav order: **Poule · Etappes · Rennerpunten · Ploegen · Spelregels**.

**Vocabulary rule (enforce everywhere, add to `LABELS` in 4.3/4.4):**
**ploeg** = a participant's selection of 10 renners; **team** = a pro cycling
team. So: "Ploeg van P074" on the Ploegen page, but the pro-team column stays
"Team" — never "ploeg" for a pro team or "team" for a selection. (The existing
"Ploegenbonus" term refers to the *pro-team* day win (Dagploeg) — ✅ decided
(July 15): the display label becomes **"Dagploegbonus"**; the scoring term
itself doesn't change.)

### 0.2 Site map — the authoritative spec (supersedes earlier tables above)

Routes go lowercase; old PascalCase routes redirect (`/Klassement`→`/poule`,
`/RennerPunten`→`/rennerpunten`, `/TeamSelectie`→`/ploegen`,
`/OverDezePoule`→`/spelregels`, `/EtappeBeheer`→`/admin`); catch-all →
`/poule` (3.7). Each page sets `document.title` ("Poule · ACM TdF Poule", …).

#### `/poule` — Poule

- Page header: h1 `Poule` + persistent muted subline
  `Na etappe 12 (15 juli)` (freshness 5.1; visible on every
  tab). **No per-tab h2s** (header scheme, see 0 sub-decisions).
- Tabs: **Dag · Algemeen · Directie**. Default: **Algemeen** (plain — no
  teaser).
- Search (one input, all tabs): filters deelnemer/directie; empty state
  "Geen resultaten gevonden".
- **Dag** — one slim context line above the list:
  `Etappe 12: Ennezat → Le Mont-Dore · volledige uitslag →` (stage context
  5.2 + cross-link to `/etappes`). Rows: positie (medal 1–3 inline),
  deelnemer, directie, etappepunten. Expansion: punten per renner +
  Dagploegbonus + totaal (existing `StageContributions`, relabeled per 0.1).
- **Algemeen** — no extra header. Columns: positie · +/- · deelnemer ·
  directie · totaal punten · medailles. Sortable (5.9): punten (default) ⇄
  medailles (Olympic-lexicographic; +/- hidden while medal-sorted; positie
  follows the active sort). Expansion: punten per etappe (rank + score per
  stage).
- **Directie** — only the one-line method note (final wording awaits 3.1
  sum-vs-average resolution). Columns: positie · +/- · directie · punten.
  Expansion: bijdragen per deelnemer, single column (6.5).

#### `/etappes` — Etappes

- No tabs. Chip selector 1–21 (completed = solid/clickable, future = muted;
  default = latest completed stage).
- Stage header card: `Etappe 12 · dinsdag 15 juli` /
  `Ennezat → Le Mont-Dore · 165 km · bergetappe`; optional `won_how` flavor
  line. All fields nullable — render what exists.
- Jersey strip: 4 jersey icons + holder names, strijdlust (red #) + name,
  dagploeg if present.
- **Uitslag** (table heading): positie · renner · team · tijdverschil ·
  punten (medals 1–3, subtle). Points joined from
  `rider_rankings.stage_rankings` so the column includes jersey/strijdlust
  points — this table *is* the rider stage ranking. Row expansion: punten
  opbouw (existing `StagePointsBreakdown`: aankomst + truien + strijdlust).
- Below the top-20: muted **Overige puntenscoorders** (jersey/strijdlust
  points without a top-20 finish), then **Uitgevallen** (DNF/DNS) if any.
- Cross-link: "Dagstand deelnemers →" (`/poule`, Dag tab).
- No search (≤ ~25 rows per stage).

#### `/rennerpunten` — Rennerpunten

- **No tabs** (owner, July 15): one list, the overall rider standings.
  Per-stage rider detail lives on `/etappes`.
- Page header: h1 `Rennerpunten` + subline `Na etappe 12 (15 juli)`
  (same scheme as `/poule`); straight into the table below the search.
- Search: renner/team; empty state.
- Columns: positie · renner · team · totaal punten · medailles. DNF'ers
  marked (5.5). Expansion: punten per etappe — with the 3.2 `#0` guard,
  3.4 gap-filling (all stages 1..current, `—` for zero), and jersey icons.
  Medal sort: optional parity with `/poule` (5.9).

#### `/ploegen` — Ploegen

- No tabs; two modes (owner keeps the swap, 6.1):
  - **Populariteit** (default) — heading `Rennerpopulariteit` + basis note
    (this page keeps its heading: no tabs, so the mode needs naming).
    Columns: geselecteerd (% + n/N) · renner · team · punten (⭐/💎).
    One-line muted legend under the table (5.4): "⭐ top-10 renner, vaak
    gekozen · 💎 top-10 renner, weinig gekozen". DNF'ers marked (5.5).
  - **Ploeg van X** — entered via Autocomplete on deelnemer (directie matches
    list the directie's members to pick from, never silent-first-match).
    Shows X's 10 renners; reset link "← Terug naar populariteit".
    Reachable via `?deelnemer=X` for cross-links from `/poule` (5.6).
- Expansion (both modes): punten per etappe (shared `StageBreakdown`).

#### `/spelregels` — Spelregels

- Static content (5.3): puntentelling per aankomstpositie, truienpunten,
  strijdlust, ploegenbonus (+6), directieberekening, vervangings-/DNF-regels,
  icon legend, en een korte "wat is dit"-alinea (demo-status).

#### `/admin` — Etappe Beheer (hidden, unchanged)

- Not in the public nav; login-gated; out of scope for this plan except
  string-language consistency (4.4).

---

## 1. New page: Etappes (public stage results) — ✅ Built (July 15)

**Status: implemented** at `src/pages/Etappes.tsx`, route `/Etappes`, nav item
between Klassement and Renner Punten. v1 ships: stage chip selector (1–21,
completed selectable / future muted, default = current stage), stage header
card, jersey/strijdlust/dagploeg strip, results table + mobile cards with a
points column, "Overige puntenscoorders", DNF/DNS line, and a cross-link to the
Poule Dag tab. Built on the shared components (LoadingState/ErrorState,
MedalIcon, CombativityIcon, usePageTitle).

**Data note (important):** the deployed `rider_rankings` snapshot only contains
the *current* stage's rankings, so per-stage points must come from the `riders`
snapshot (which keeps every rider's full per-stage breakdown) — the page joins
points via `ridersData[name].stages[stage_N].stage_total`, not `rider_rankings`.
Also: several early stages have null date/route/distance metadata, so the header
card renders sparse for them until the beheer data is backfilled.

Original design notes retained below.



The biggest addition. A public, read-only page showing the race itself — per-stage
information and results — separate from the beheer entry screens and from the
pool-scoring views. Today the actual Tour results are invisible to participants;
they only see derived points.

**Scope per workstream 0 (Proposal A v2)**: this page is the race and nothing
else — no tabs. Its results table carries a **points column**, which makes it
double as the rider stage ranking (replacing Renner Punten's Etappe tab); the
participant Dag view stays on Klassement. Under Alternative B the same page
ships without replacing anything.

### Why this page and not more tabs

Klassement and Renner Punten answer "how is my pool doing". This page answers
"what happened in the race". Different question, different page. It also becomes
the natural home for stage facts (route, type, jerseys, strijdlust) that would
clutter the scoring views.

### Data — all already public, zero backend work

`stages_data` snapshot (already fetched by `useStagesData()`, currently only used
by beheer) contains per stage: `stage_number`, `date`, `distance`,
`departure_city`, `arrival_city`, `stage_type`, `difficulty`, `won_how`,
`is_complete`, `top_20_finishers` (position, rider_name, time_gap),
`jerseys` (4 holders), `combativity`, `dagploeg`, `dnf_riders`, `dns_riders`.
Finish points per position can come from `scoring-constants.ts`; rider teams from
the `rider_rankings` snapshot if we want a team column.

### Design (v1)

- **Route** `/etappes`, second in the nav (see 0.2 for the full site map):
  `Poule · Etappes · Rennerpunten · Ploegen · Spelregels`.
- **Stage selector**: horizontal row of number chips 1–21. Completed stages
  solid/clickable; future stages muted/disabled. Default = latest completed
  stage. On mobile the row scrolls horizontally (chips are ~40px, 21 fit in ~2
  screen widths). Reuse the active-tab styling so it reads as the same control
  family as the view tabs.
- **Stage header card**: "Etappe 12 · dinsdag 15 juli" on one line;
  "Ennezat → Le Mont-Dore · 165 km · bergetappe" on the second. Fields are
  nullable — render only what exists. `won_how` (e.g. "solo na late uitval") as a
  one-line flavor note if present.
- **Jersey strip**: the four jersey icons with holder names after this stage,
  plus strijdlust (red `#` icon + name) and Dagploeg if present. This doubles as
  the "current jersey holders" feature from the review when the latest stage is
  selected.
- **Results table/cards**: top-20 — position, rider, team, time gap, and
  **points earned that stage** (from `rider_rankings.stage_rankings`, joined
  by rider name — includes jersey/strijdlust points, so the column doubles as
  the rider stage ranking). Medal icons for 1–3 (subtle, as elsewhere). Below
  the top-20, a short muted **"Overige puntenscoorders"** list for riders who
  scored jersey/strijdlust points without a top-20 finish. Same desktop-table /
  mobile-card split as the other pages, built from the shared components
  (workstream 4).
- **DNF/DNS block**: if `dnf_riders`/`dns_riders` are non-empty, a short muted
  list under the results: "Uitgevallen: X, Y (DNF) · Z (DNS)".

### Explicitly out of scope for this page (per workstream 0 v2)

- Per-stage *pool* results (participants) — stay on Klassement's Dag tab;
  cross-link both ways instead of duplicating.
- Historical stage selector on Klassement's Dag tab — possible later reuse of
  the chip selector component; deferred (see workstream 0 sub-decisions).

---

## 2. Rennerpunten tabs — 🚫 dropped entirely (owner, July 15)

Final call: **Rennerpunten gets no tabs at all** — one list, the overall
rider standings. The "Team" placeholder tab and the intermediate "Per team"
idea (grouping mirror of Directie) are both dropped: a pro-team ranking
"doesn't say much" in a pool where participants pick riders, and with the
Etappe tab moving to `/etappes` there's no tab row left to be consistent
with. The rider-per-stage view is covered by the Etappes page (all past
stages via the chip selector). If team-grouped curiosity ever comes up,
revisit as an expansion or a Spelregels-adjacent stat — not a tab.

---

## 3. Correctness & mislabels (P0 — do first, all small)

| # | Item | Status |
|---|------|--------|
| 3.1 | **Directie average — already fixed in code; live data is stale.** Investigated July 15: `json-generators.ts:164-181` already computes the average of the top-N dividing by the *actual* contributor count (sub-5 directies handled), landed in commit `5dea9c1` (July 14). The deployed snapshot (`run_id 20260714T193651Z`) still shows sums (~5761) because it was published by a deployment predating that fix. **Resolution: redeploy + reprocess/republish** — a live-pipeline op the owner runs; not a code change. Frontend `toFixed(1)` stays correct once averages publish. | ✅ code; ⏳ needs republish |
| 3.2 | **`#0` finish positions** in RennerPunten expanded stage rows (`RennerPunten.tsx:479, 547`). Guard `stage_finish_position > 0` like `StageBreakdown.tsx:36` does. | ✅ |
| 3.3 | **"Totaal Punten" header on RennerPunten → Etappe tab** shows stage points. Rename to "Etappe Punten" (match Klassement). | ✅ |
| 3.4 | **Rider stage-list gaps**: zero-point stages are absent from rider data, indistinguishable from missing data. Fill 1..current_stage with explicit `0` / `—` rows at render time. | ✅ |
| 3.5 | **"DtE" is a data-entry error** (owner confirmed, July 15) — same directie as "DTE". Data cleanup task, not frontend: merge in the DB and republish; part of this year's data cleanup (next season's intake should prevent it). | ✅ |
| 3.6 | **Rider name casing** ("TADEJ POGACAR" vs "Tim Merlier"). Normalize — prefer at import/merge (one-time data fix) over render-time title-casing (which breaks "van der Poel"). | ❓ Open — decide import-fix vs render-fix |
| 3.7 | **No 404 route**: add `<Route path="*">` redirect to Klassement (also catches lowercase `/klassement`). | ✅ |

---

## 4. Consistency (P1 — the highest-leverage refactor)

Owner: "should definitely improve things here." The root cause of nearly all
drift: shared components exist (`TabButton`, `SearchInput`, `Card*`,
`StageBreakdown`, `MedalDisplay`, `CombativityIcon`, `JerseyList`, `LABELS`,
`TABLE_CLASSES`) but only TeamSelectie uses them.

- **4.1 Migrate Klassement + RennerPunten onto the shared components.** Deletes
  the duplicated tab buttons (×6), search inputs, the re-implemented
  `CombativeIcon` and `renderMedal` in RennerPunten, and the hand-rolled
  card/table markup. Do this *before* building the Etappes page so the new page
  is born on the shared kit. ✅
- **4.2 One color vocabulary.** Pages mix theme tokens and raw Tailwind grays for
  the same elements (`bg-gray-200` vs `bg-table-header`; three different hover
  grays; `active:bg-tdf-bg` vs `active:bg-gray-50`). Pick the token layer,
  extend `@theme` where tokens are missing, delete unused tokens
  (`tdf-card-hover`, `table-row-even/odd`) or start using them. ✅
- **4.3 More design constants** (owner request): font family (set an explicit
  `--font-sans` in `@theme` even if it stays the system stack), heading color,
  the medal/star icon set, spacing for table cells — so future pages compose
  from tokens instead of re-deciding. ✅
- **4.4 Dutch everywhere in system states.** Loading/error/retry screens are
  English on a Dutch site while `LABELS.LOADING` sits unused. Route all UI
  strings through `LABELS`. ✅
- **4.5 Empty search state** on Klassement/RennerPunten ("Geen resultaten
  gevonden"), matching TeamSelectie. ✅
- **4.6 Layout component everywhere**: Klassement/RennerPunten duplicate the
  page wrapper with a *different* h1 scale than `Layout.tsx`. One title scale.
  Also: nav "Team Selectie" vs h1 "Team Selecties" — pick one. ✅
- **4.7 Medal placement convention.** Three patterns today (Positie column /
  after name / trailing column). Pick: stage views = medal in the Positie
  column; Algemeen views = trailing count column. Keep medals **subtle** — owner
  explicitly likes that they're not too central. No enlargement. | 👍
- **4.8 Per-page `document.title`** and a real favicon (still `vite.svg`). 👍

---

## 5. Information additions (P1–P2)

- **5.1 Freshness line** — ✅. Persistent page-header subline
  `Na etappe 12 (15 juli)` under the h1 on `/poule` and
  `/rennerpunten` (visible on every tab — part of the header scheme in
  workstream 0), from `metadata.current_stage` + `last_updated`. The single
  most-asked question during the Tour.
- **5.2 Stage context** — ✅ (owner: "stage context is good"). One slim line on
  the Poule Dag tab: `Etappe 12: Ennezat → Le Mont-Dore · volledige uitslag →`,
  from `stages_data`. (The full treatment lives on the new Etappes page.)
- **5.3 Over deze Poule content** — 👍. Scoring rules, Ploegenbonus (+6),
  directie calculation, substitution/DNF rules, and a legend for ⭐/💎/medals/
  red-`#`. Currently an unstyled "Work in progress" in the public nav — worst
  page on the site, and the natural home for every "what does this icon mean"
  question. If content writing stalls, at least wrap it in `Layout` with a
  placeholder paragraph.
- **5.4 Icon legend inline** — 👍. Even with 5.3, a one-line muted legend under
  the Team Selecties table (⭐ top-10 renner, populair · 💎 top-10 renner,
  weinig gekozen) beats making people find the about page.
- **5.5 DNF/DNS marking** — 👍. `dnf_riders`/`dns_riders` are in the public
  snapshot. Mark abandoned riders in Renner Punten and Team Selecties (muted
  name + "uitgevallen" chip). Cheap and prevents "why is my rider stuck".
- **5.6 Cross-link participant → team** — ❓. Klassement row expansion could link
  to `/ploegen?deelnemer=X` (needs the Ploegen page to read a query param —
  pairs well with 6.1). Most natural drill-down in a pool app, but touches
  TeamSelectie's search model; decide together with 6.1.
- **5.7 Gap to leader ("achterstand")** on Algemeen — ❓. Useful, but adds a
  column to an already-wide table; maybe only in the expanded row.
- **5.8 Directie Etappe view** — ❓. `stage_score`/`stage_rank`/
  `stage_participant_contributions` are fetched and never shown. Either add an
  Etappe toggle to the Directie tab or accept the unused fields. Low demand;
  default to *not* building it and revisit if directies engage. (Under
  workstream 0 Proposal A this would live on the Etappes page's Deelnemers tab
  as a directie toggle, if ever.)
- **5.9 Sortable Klassement** — ✅ decided direction (owner request). Let the
  Algemeen standings be re-sorted, at minimum **by medals** (lexicographic,
  Olympic-style: golds desc, then silvers, then bronzes; ties broken by total
  points). Design decisions to make during implementation:
  - **UI**: clickable column headers with a ▲▼ indicator on desktop (classic
    table pattern — "Totaal Punten" and "Etappe Medailles" become sortable);
    a compact "Sorteer: Punten · Medailles" chip row above the cards on mobile
    (headers don't exist there).
  - **Rank column follows the active sort**: recompute tie-aware competition
    ranks on the sort key (`competitionRankMap` already exists; encode the
    medal tuple as `gold*1e6 + silver*1e3 + bronze` to fit its numeric score
    fn). A medal-sorted table showing points-based positions would be
    confusing.
  - **Hide the +/- column while medal-sorted** — rank-change arrows describe
    movement in the points ranking and are meaningless under another sort.
  - Medal sort pairs naturally with the "🥇3 🥈1" count format (7.4) — counts
    are much easier to compare when that's the sort key; consider doing both
    together.
  - Same mechanism applies to Renner Punten's medal column for consistency —
    cheap once built. Search must keep filtering the *sorted* list without
    renumbering (same rule as today's rank maps).

---

## 6. Interaction & layout (P2)

- **6.1 TeamSelectie search: keep the swap, make it predictable** — ✅ decided
  direction (owner likes the swap to "team of X"). Improve it: use the existing
  `Autocomplete` component so matching is chosen, not `.find()`-first-match;
  show whose team you're looking at with a clear "← terug naar populariteit"
  reset; directie-name matches should list the directie's members rather than
  silently picking one.
- **6.2 Expansion affordance + keyboard access** — 👍. Chevron that rotates when
  open; wrap the clickable row content in a real button (or `role="button"` +
  `tabIndex` + Enter/Space) with `aria-expanded`. Today mouse-only and
  undiscoverable.
- **6.3 Sticky table headers** (`sticky top-0` on thead) for the 128-participant
  / ~180-rider lists — 👍.
- **6.4 Table column rhythm** — 👍. Narrow fixed widths for Positie/+/-; align
  the last column treatment (right-align "Etappe Medailles" like the points
  column, or center both).
- **6.5 Directie expanded contributions**: single column instead of the 2-col
  grid (row-major reading order fights the #1–#5 ranking) — 👍.
- **6.6 Search-input a11y**: `aria-label` on the three search inputs; tab
  buttons get `aria-pressed` (full `tablist` semantics optional) — 👍.

---

## 7. Typography & color (P2)

- **7.1 Active-tab contrast** — 👍 (strong). White on `#eab308` ≈ 1.9:1. Switch
  to dark text on the yellow (`text-gray-900`) — most-clicked control on the
  site.
- **7.2 Heading amber**: `#ca8a04` on `#f9fafb` ≈ 3.3:1 — fine for the h1, thin
  for `text-xl` h2s. Introduce `--color-tdf-heading` (≈ `yellow-700`/`#a16207`)
  for sub-h1 headings — 👍.
- **7.3 White jersey icon** invisible on white rows: border or light-gray chip
  behind all jersey icons (uniform treatment) — ✅.
- **7.4 Medal legibility**: keep emojis small/subtle per owner preference. If
  silver-vs-bronze at 14px keeps bothering, switch the *count column* to
  "🥇3 🥈1" format (more legible **and** more compact) — ❓ owner call, low
  priority.
- **7.5 Font family**: covered by 4.3 (explicit token; consider a display face
  for the h1 only — optional flavor, not needed).
- **7.6 `#` overload** (rank `#1`, finish `#11`, combativity icon `#`): drop the
  `#` prefix on mobile card ranks — ❓ cosmetic, decide during 4.1.

## 8. Dropped from the review (for the record)

- 🚫 Hiding the search input behind an icon on mobile — costs more than it saves.
- 🚫 Pagination/virtualization — 128/180 rows render fine.
- 🚫 Dark mode — token work (4.2/4.3) keeps the door open; not building it.
- 🚫 The Team tab (and its "Per team" successor) — dropped with all
  Rennerpunten tabs; see workstream 2.

## 9. Parked for later — landing page ("Vandaag") — 💡 owner idea, July 15

Not in scope now, explicitly kept as a future idea: a dedicated landing page
as the site's default route, replacing `/poule` as the home. Content sketch:
summary of the most recent stage (winner, route, jerseys that changed hands),
the pool dagpodium teaser (which was deliberately kept *off* the Poule page —
this is where it belongs instead), an overall-standings teaser (top 3), and a
few summary stats from the most recent stage, each block linking into its
full page. When this happens the catch-all/default route moves from `/poule`
to the landing page; nothing else in the 0.2 spec changes. Until then:
default route stays `/poule`, no teasers anywhere.

---

## Suggested order

0. ~~Decide workstream 0~~ — **done** (A v2 + naming, spec in 0.2). The
   header-scheme part is already implemented as an experiment (July 15:
   subline, h2s removed, "Dag" tab label, route context line on the
   current pages).
1. **P0 batch (3.x)** — one small PR; fixes everything that's *wrong*.
   Includes the directie average fix (3.1, in `json-generators` + republish)
   and the DtE→DTE data cleanup (3.5).
2. **Consistency (4.1–4.6)** — one refactor PR; no visual redesign, just
   convergence. Includes the renames/redirects from 0.1–0.2. Do before the
   new page.
3. **Contrast fixes (7.1–7.3)** — small, high-visibility. (5.1/5.2 already
   shipped with the header experiment.)
4. **Etappes page (1)** — first consumer of the consolidated component kit;
   its arrival is what removes Rennerpunten's remaining tabs (workstream 2)
   and the Poule Dag link becomes live.
5. **Sortable Poule (5.9)** — after the consistency refactor so the sort
   control is built once, in the shared table/card kit.
6. **Ploegen search (6.1), legend/spelregels (5.3–5.4), DNF marking (5.5)** —
   independent, pick by mood.
7. Remaining ❓ items — decide as they come up; none block anything above.
