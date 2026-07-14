# Season 2027 — doing it structurally right

Written July 2026, while the scars are fresh. This year's chaos had three
root causes; everything else was a symptom:

1. **Free-text names were identity.** The Excel joined on spellings, so one
   rider became two ("TOBIAS JOHANNESSEN"), reserves duplicated mains
   (P070), and a season of aliases/merges followed.
2. **Double administration.** The pool started in Excel and migrated to the
   app mid-race — that forced fixture extraction, transcription
   verification, fingerprint-mapping and golden reconciliation.
3. **Rules lived in the sheet's habits, not in writing.** Dagploeg's real
   definition, the DNF-substitution timing, and the 9-rider roster were all
   *discovered* during the migration instead of decided up front.

What went **right** and carries over unchanged: the scoring engine (pure +
golden-tested), the pipeline/publish architecture, the beheer UI with
paste-entry and route prefill, `rebuild`/`verify` tooling, and the ordered
migrations. 2027 is an intake problem, not a rebuild.

---

## A. Right after this Tour (August 2026)

| Who | What |
|---|---|
| YOU | Mini-retro: which rules caused discussion? Decide the 2027 reglement now (see C1) while it's fresh. |
| CLAUDE | Archive the season: export all tables to `data/2026/archive/`, tag the repo (`season-2026-final`), note the final snapshot runId. The 2026 golden suite stays in CI forever as the engine's regression net. |

Also: the Supabase free tier **pauses after ~1 week idle** — after Paris,
either visit the dashboard weekly or accept that the site sleeps until
someone wakes it.

## B. Off-season build (one or two sessions, winter)

The single structural code change 2027 needs:

**B1. Identity by reference, not by name.**
Participants' picks and stage results reference `rider_id`; names become
display-only. Concretely: the season starts by importing the provisional
startlist (riders + teams get their canonical rows first), and every later
input — selection form, stage entry, imports — resolves through pickers/
autocomplete bound to those rows. Free text never creates a rider again.
The alias table stays as the escape hatch, and `teams` becomes reference
data too (ploeg picks by `team_id` — kills the Excel-spelling matching in
the Dagploeg rule).

**B2. The selection form (replaces the Excel intake entirely).**
A public page, open between announcement and the deadline:
- name + e-mail + directie (dropdown from a preset list) + ploeg (dropdown)
  + 10 riders + 1 reserve (autocompletes over the imported startlist);
- the form *enforces* what the sheet couldn't: no duplicate riders, no
  reserve-equals-main, exactly 10 + 1, one submission per e-mail
  (editable until the deadline via a personal link);
- submissions land in a `season_entries` table; after the deadline one
  command promotes them to participants/selections. No anonymization
  dance — participants typed their own names and consented by submitting.

**B3. Season reset.**
Keep the single-season schema (a yearly pool doesn't need multi-tenant
tables): `npm run season:reset` wipes the season tables and re-imports —
essentially `rebuild` minus the 2026 fixtures. `SEASON=2027` already
namespaces the published snapshots.

**B4. Parked hygiene** (same sessions): the ESLint-9/dependency bump, and
finding 5 (roster reconciliation) if it ever actually bites.

## C. Pre-Tour timeline 2027

| When | Who | What |
|---|---|---|
| ~May | YOU | Publish the written **reglement** to the participants: points table, jerseys, combativity, Dagploeg (= team day classification winner), substitution rule (DNS → that stage; DNF/OTL/DSQ → next stage), one substitution max, directie formula. The doc is the contract — no more archaeology. |
| ~May | CLAUDE | Encode any rule changes + acceptance tests BEFORE the form opens. |
| ~June (route + teams known) | CLAUDE | Import provisional startlist + `route.json` for 2027 (one PCS paste from you). Open the form. |
| Startlist definitive (~1 week out) | YOU | Announce the pick deadline. Late team changes: the form flags picks of non-starting riders so participants can fix them (this year ~12 picked riders never started — silent zeros). |
| Day before stage 1 | CLAUDE/YOU | Close form → promote entries → publish the stage-0 site (everyone sees all teams once picks are locked) → smoke test. |
| During the Tour | YOU | Per stage: PCS paste → review → save. ~2 minutes. Everything else is automatic. |

## D. Explicitly not worth building

- Multi-season/multi-pool schema, accounts for participants, realtime —
  overkill for one pool a year.
- Fully automated scraping without review: a human confirm on each stage
  costs 2 minutes and catches what a scraper won't (the sheet's own
  directie table was wrong twice this year — trust nothing unreviewed).
- Rewriting the frontend. It works; polish incrementally.

The one-line summary: **2026 was spent making the engine trustworthy;
2027 starts trustworthy and fixes the intake.** Preset identity + a form
with validation + rules written down before anyone picks = none of this
year's name archaeology can recur.
