# Ideas & future work

Everything worth doing or keeping for later, in one place. Near-term todos live
in [TODO.md](TODO.md); how the code actually works lives in
[../CLAUDE.md](../CLAUDE.md); old/superseded plans and reviews are in
[archive/](archive/).

---

## Landing page (#23)
A public entry page — best built once real names are live (#15), so it showcases
recognisable people. Aggregates:
- **Preview standings** (top N).
- **Biggest winner of the day** — the participant with the highest daily
  `stage_score` (tie-aware; reuse the `stageWinCounts` logic). A natural hero
  moment. *Earmarked for this page.*
- **Jersey classementen (#12/#13)** — yellow leader, green (most stage wins),
  polka (combativity points). The transforms + tests are **already built and
  parked** in `lib/data-transforms.ts` (`stageWinCounts`,
  `combativityPointsByParticipant`, `classificationLeaders`); they just need a
  page to live on. Rule for polka = most combativity points (flat 5/award,
  summed over a participant's roster).

---

## Engagement & interactions (item D)
Make the site more engaging **without changing the pool's rules**.

**Core insight (why this is hard).** The site is read-only, anonymous, with
placeholder coded names (P074). Real names aren't live — that's the real ceiling
on engagement (#15). Until then most "interactions" are just nicer browsing. The
two levers that matter for a friend-group pool:
- **Personal** — "where am *I*, and am I moving?"
- **Comparative** — "am I beating *my mates*?"

Judge every idea against those two. **D and #15 are the same conversation.**

**Pin yourself — highest ROI, no login needed.** One `localStorage` primitive —
remember which participant is "you" (+ optional watched mates) — unlocks a
cluster of small features:
- *How:* store the pinned participant id in `localStorage` (`tdf:me`; optional
  `tdf:watching`). Set it via a one-time dismissible "Wie ben jij?" prompt using
  the existing participant `Autocomplete`, and/or a pin icon per row. On load,
  validate it still exists in the snapshot; clear if not.
- *What it powers:* a persistent **"Jij" banner** (`Jij: P074 · #4 · 1847 pnt
  (↓2 vandaag)`); your row **highlighted** everywhere; a **"spring naar mij"**
  button in the 128-row tables; **watched mates** in a second tint.
- *Caveat:* pins are keyed by name → they break when codes become real names,
  unless a stable **id** is stored. 2027's identity-by-reference (below) would
  provide exactly that id.

**Head-to-head compare — the shareable centrepiece.** Pick two participants (or
you-vs-leader / you-vs-directie-average) → cumulative points over the 21 stages
as a **line chart** (`leaderboard_by_stage`). The most paste-to-WhatsApp feature
here. Bigger effort (a chart; hand-rolled SVG or a light lib — use the `dataviz`
skill).

**Cheap seasoning.** Stijgers & dalers van de dag (uses the tie-aware
rank-change already built); a trajectory sparkline in the expanded row;
a superlatives page (most consistent, biggest single-day haul, longest top-10
streak).

**Avoid.** Confetti / notifications / reactions — gimmicky or impossible without
login, and they flirt with feeling like a rules change.

**Order when picked up:** pin-yourself → compare chart → seasoning.

---

## Login & real names (#15)
Simple shared-password login (~30-day cache) as a **soft privacy curtain** for
when real participant names replace the placeholder codes. The data is public
JSON snapshots, so this is a curtain, not real auth (real protection = move the
snapshots behind an authenticated endpoint — bigger). Real names are the single
biggest engagement unlock (see item D), and they interlock with the pin-yourself
id caveat and 2027's identity-by-reference.

## Etappe map (#1)
A small start/finish map on the Etappe page. Deferred — needs per-stage
coordinates (check whether the stages snapshot carries lat/long). Cheap option:
an inline SVG of France with two dots; avoid heavy map libs / API keys on the
static Vercel build.

---

## Season 2027 — doing it structurally right (#16)
Written July 2026, while the scars are fresh. This year's chaos had three root
causes; everything else was a symptom:

1. **Free-text names were identity.** The Excel joined on spellings, so one rider
   became two, reserves duplicated mains, and a season of aliases/merges followed.
2. **Double administration.** The pool started in Excel and migrated to the app
   mid-race — forcing fixture extraction, transcription verification,
   fingerprint-mapping and golden reconciliation.
3. **Rules lived in the sheet's habits, not in writing.** Dagploeg's real
   definition, the DNF-substitution timing, and the roster size were all
   *discovered* during migration instead of decided up front.

What went **right** and carries over unchanged: the pure, golden-tested scoring
engine; the pipeline/publish architecture; the beheer UI with paste-entry and
route prefill; `rebuild`/`verify` tooling; the ordered migrations. **2027 is an
intake problem, not a rebuild.**

### A. Right after this Tour (Aug 2026)
- **You:** mini-retro — which rules caused discussion? Decide the 2027 reglement
  now (C) while it's fresh.
- **Claude:** archive the season (export tables to `data/2026/archive/`, tag
  `season-2026-final`, note the final snapshot runId). The 2026 golden suite
  stays in CI forever as the engine's regression net.
- Note: the Supabase free tier **pauses after ~1 week idle** — after Paris,
  visit the dashboard weekly or accept the site sleeps until someone wakes it.

### B. Off-season build (one or two winter sessions)
- **B1. Identity by reference, not by name.** Picks and results reference
  `rider_id`; names become display-only. The season starts by importing the
  provisional startlist (riders + teams get canonical rows first); every later
  input resolves through pickers bound to those rows. Free text never creates a
  rider again. `teams` becomes reference data too (ploeg picks by `team_id` —
  kills the Excel-spelling matching in the Dagploeg rule).
- **B2. The selection form** (replaces the Excel intake): a public page open
  between announcement and deadline — name + e-mail + directie + ploeg + 10
  riders + 1 reserve (autocompletes over the imported startlist). Enforces what
  the sheet couldn't (no duplicate riders, no reserve=main, exactly 10+1, one
  submission per e-mail, editable until the deadline via a personal link).
  Submissions land in `season_entries`; one command promotes them after the
  deadline. No anonymisation dance — participants typed their own names.
- **B3. Season reset:** keep the single-season schema; `npm run season:reset`
  wipes season tables and re-imports (= `rebuild` minus the 2026 fixtures).
  `SEASON=2027` already namespaces the snapshots.
- **B4. Parked hygiene:** the ESLint-9/dependency bump; roster reconciliation
  (finding 5) only if it ever bites.

### C. Pre-Tour 2027 timeline
- **~May — you:** publish the written **reglement** (points, jerseys,
  combativity, Dagploeg = team day classification winner, substitution rule
  (DNS → that stage; DNF/OTL/DSQ → next stage), one substitution max, directie
  formula). The doc is the contract — no more archaeology.
- **~May — Claude:** encode any rule changes + acceptance tests before the form
  opens.
- **~June (route + teams known) — Claude:** import provisional startlist +
  `route.json` (one PCS paste). Open the form.
- **Startlist definitive (~1 week out) — you:** announce the deadline; the form
  flags picks of non-starting riders (this year ~12 picked riders never started
  — silent zeros).
- **Day before stage 1:** close form → promote entries → publish the stage-0
  site (all teams visible once picks lock) → smoke test.
- **During the Tour — you:** per stage, PCS paste → review → save (~2 min).

### D. Explicitly not worth building
Multi-season/multi-pool schema; participant accounts; realtime; fully automated
scraping without a human review (a confirm per stage costs 2 minutes and catches
what a scraper won't); rewriting the frontend (it works — polish incrementally).

**One line:** 2026 made the engine trustworthy; 2027 starts trustworthy and
fixes the intake. Preset identity + a validating form + rules written down before
anyone picks = none of this year's name archaeology can recur.
