# Engagement & interactions plan (TODO item D)

Ideas to make the site more engaging **without changing the pool's rules**.
Parked — not building yet. Companion to `TODO.md` item D; connects to #15
(login + real names), #23 (landing page) and #12/#13 (jersey classementen).

## Core insight (why this is hard)
The site is read-only, anonymous, with **placeholder coded names (P074)** — real
names aren't live yet, and that's the real ceiling on engagement (#15). Until
then most "interactions" are just nicer browsing. The two levers that matter for
a friend-group pool:
- **Personal** — "where am *I*, and am I moving?"
- **Comparative** — "am I beating *my mates*?"

Judge every idea against those two. **D and #15 are really the same conversation**:
real names would do more than any feature here.

## Pin yourself — highest ROI, no login needed
One `localStorage` primitive — remember which participant is "you" (+ optional
watched mates) — unlocks a whole cluster of small features.

**How it works**
- Store the pinned participant identifier in `localStorage` (e.g. `tdf:me`;
  optional `tdf:watching` = array of names).
- Set it via a one-time, dismissible **"Wie ben jij?"** prompt using the
  existing participant `Autocomplete`, and/or a small **pin icon** on each
  standings row.
- On load, validate the stored value still exists in the current snapshot; if
  not, clear it (see caveat).

**What it powers (all from the one primitive)**
- Persistent **"Jij" banner**: `Jij: P074 · #4 · 1847 pnt (↓2 vandaag)`,
  clickable → jump to your row / open your ploeg.
- Your row **highlighted** across every table (subtle accent bg / left bar).
- **"Spring naar mij"** button in the long 128-row tables.
- **Watched mates** highlighted in a second subtle tint.

**Caveat — the names transition:** participants are keyed by name. When names go
from codes (P074) → real names, a stored code pin won't match → clear &
re-prompt, or store a stable participant **ID** if the snapshot has one. Decide
when #15 lands. Purely per-device until then; graduates into real identity once
login exists.

## Landing page (#23) — aggregate these
The future landing page is the natural home for several parked things:
- **Preview standings** (top N).
- **Biggest winner of the day** — the participant with the highest `stage_score`
  that day (tie-aware; reuse the `stageWinCounts` logic). Great hero moment.
  *(Explicitly earmarked for the landing page — remember this.)*
- **Jersey classementen** (#12/#13, transforms already built and parked in
  `data-transforms.ts`): yellow leader, green (most stage wins), polka
  (combativity points).

## Head-to-head compare — the shareable centrepiece
Pick two participants (or you-vs-leader / you-vs-directie-average) → **cumulative
points over the 21 stages as a line chart** (data: `leaderboard_by_stage`). The
most screenshot-and-paste-to-WhatsApp feature there is. Bigger effort (needs a
chart — hand-rolled SVG or a light lib; use the `dataviz` skill).

## Smaller narrative seasoning (cheap, daily-fresh)
- **Stijgers & dalers van de dag** — a strip using the tie-aware rank-change
  already built. ~1h, gives a daily storyline.
- **Trajectory sparkline** in the expanded row (a 21-point rank/points line).
- **Superlatives** page (most consistent, biggest single-day haul, longest
  top-10 streak). More derivation effort.

## Avoid
Confetti / notifications / reactions — gimmicky or impossible without login, and
they flirt with feeling like a rules change.

## Suggested order (when we pick this up)
1. **Pin yourself** — small, compounding.
2. **Head-to-head compare** chart — bigger, shareable.
3. **Stijgers & dalers** + sparklines — cheap seasoning.

The **landing page (#23)** bundles preview + biggest-winner + jersey classementen
separately, and is best done once real names (#15) are live.
