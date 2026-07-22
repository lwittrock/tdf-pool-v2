# Comprehensive audit prompt (TdF Pool v2)

A reusable, report-only audit brief for a fresh Claude Code session. It exists
because a lot changed on both the frontend and backend (design-system redesign,
nav rename/reorder, PCS stage-results prefill, tie-aware rank fixes, medal /
expanded-row rework) and TODO item **#21** ("broader code/UX sweep for
leftovers") is still open. Paste everything under the line into a new session
with the repo checked out. It produces a **findings report only** — it changes
no code.

---

## Mission

You are auditing the **tdf-pool-v2** codebase for consistency, correctness, and
leftovers after a period of heavy change on both frontend and backend. Your job
is to **find and report**, not to fix. Produce a single, prioritized,
evidence-backed findings report. Every finding must cite `file:line` and say
concretely what is wrong and why it matters. Do not edit, refactor, commit, or
push anything. Do not "fix while you're in there."

Bias toward **precision over volume**: a short list of real, verified problems
beats a long list of style opinions. When you assert something is a bug or an
inconsistency, prove it by reading the relevant code — don't infer from names.

## Step 0 — Build context before judging anything

Read these first, in order, and treat them as the source of truth for *intended*
behavior (so you can tell a real defect from an intentional choice):

1. `README.md` — snapshot/publish model, scoring rules, directie average,
   reserves/casualty logic, operations flow, disaster-recovery scripts.
2. `CLAUDE.md` — conventions, domain naming, design language, gotchas.
3. `docs/TODO.md` and `docs/ideas.md` — what is deliberately parked/unfinished
   (do **not** report parked-by-design items as dead code; cross-reference them).
4. `lib/scoring.ts`, `lib/scoring-constants.ts`, `tests/golden-2026.test.ts` —
   the scoring contract and its golden tests.
5. `src/index.css` (design tokens `--color-tdf-*`) and `lib/constants.ts`
   (`LABELS`, `JERSEY_LABELS`, `TABLE_CLASSES`).

Then run the ground-truth commands and record their real output in the report
(don't trust your reading of the code over the tools):

```bash
npm run check      # eslint (zero warnings allowed) + tsc for app AND api/lib
npm test           # vitest incl. the golden 2026 suite
npm run build      # tsc && vite build — must succeed
```

If any of these fail, that is finding #1 with the verbatim output. If they pass,
say so explicitly — a green baseline is part of the report.

## Invariants you must not "fix away" (verify they still hold)

These are load-bearing. For each, confirm the current code still honors it and
flag any violation:

- **The public site never queries the DB.** Everything the public pages render
  comes from published JSON snapshots via `src/hooks/useTdfData.ts`, keyed on
  `run_id`. Flag any public page/component/hook that imports the Supabase client
  or an `api/` route. (The Supabase client is legitimate only in `/admin`
  beheer + login.)
- **Scoring is pure and golden-tested.** Point values live in
  `lib/scoring-constants.ts`; the golden fixtures are verbatim-Excel and must
  never be edited to make code pass. Any change to point values must move the
  golden tests with it. Flag magic scoring numbers hardcoded outside
  `scoring-constants.ts`.
- **Ranks are tie-aware on the client** (`competitionRankMap` /
  `assignCompetitionRanks` in `lib/data-transforms.ts`, 1-2-2-4). Snapshots
  carry dense server ranks used only as a fallback / for the +/- arrows. Flag
  any table that displays the raw dense server rank as the position, or that
  computes rank change without the tie-aware map.
- **Dutch UI strings come from `LABELS`** (`lib/constants.ts`) — flag
  hardcoded Dutch (or English!) user-facing strings in components/pages.
- **Snapshot reads that can exceed 1,000 rows must use `fetchAll`**
  (`lib/supabase-server.ts`) — PostgREST silently truncates un-ranged selects.
  Flag raw `.select()` on large tables in `api/`, `lib/`, `scripts/`.
- **All standings tables flow through** `src/components/shared/StandingsTable.tsx`
  (desktop) + `ExpandableCard` (mobile), with columns declared via the `Column`
  spec. Flag any hand-rolled `<table>` for standings.

## Audit dimensions

Work through every dimension below. Within each, list concrete findings; if a
dimension is clean, say "no findings" and note what you checked.

### A. Architecture & data-flow correctness
- Snapshot/publish integrity: pointer polling (`POINTER_POLL_INTERVAL_MS`),
  `run_id` keying on every query, cache-control assumptions, atomic pointer flip.
  Any place that could render stale or mixed-`run_id` data.
- `enter-stage` pipeline (`lib/enter-stage.ts`, `lib/pipeline.ts`,
  `lib/publish.ts`, `lib/json-generators.ts`): transactional row swap, recompute,
  self-healing recompute of downstream stages, error handling on partial failure.
- Reserves / casualty activation (DNS from that stage; DNF/OTL/DSQ from the next;
  at most one substitution per participant) — confirm the implementation matches
  the README rule and is covered by tests.
- Directie klassement = average of top-5 participants, one decimal, graceful for
  directies with <5 — confirm implementation and rounding.

### B. Scoring engine
- Cross-check `lib/scoring.ts` against the README's stated points (finish
  25/19/18…1, jerseys 15/10/10/10, combativity 5, Dagploeg +6) and against
  `scoring-constants.ts`. Any drift, off-by-one, or duplicated constant.
- Golden suite: does it still cover the full 128×9 grid? Any `.skip`/`.only`
  left in tests. Any scoring path not exercised by a test.

### C. PCS prefill / parse backend (newest, highest-risk area)
- `lib/pcs-fetch.ts`, `lib/pcs-parse.ts`, `lib/parse-results.ts`,
  `lib/prefill.ts`, `api/admin/prefill-stage.ts`, and the admin button in
  `src/components/beheer/`. Parser robustness on malformed/edge HTML, the
  rank-gap warning, safe re-tap merge (must not overwrite manual edits),
  unresolved-rider handling, the `PCS_FETCH_PROXY` / Cloudflare escape hatch,
  502 fast-fail behavior.
- Are `tests/pcs-parse.test.ts`, `tests/parse-results.test.ts`,
  `tests/prefill.test.ts` still representative of the current code? Gaps around
  combativity-arriving-late and DNS/DNF prefill.

### D. Design / UX consistency (surface system)
The one surface recipe across the **public** UI is **`rounded-xl` +
`border border-gray-200` + `shadow-sm`**. Table headers = uppercase micro-labels
(`text-[11px] uppercase tracking-wider text-tdf-text-secondary`) on `bg-white`
over a hairline; compact rows, **no zebra**, hairline dividers; points columns
gold (`text-tdf-score`); tabs/search/chips = white + 1px border with **yellow
(`tdf-accent`) = active**. Award bibs via `NumberBib` (`variant="combative"` red /
`variant="best"` yellow); jerseys via `JerseyIcon`/`JerseyList`.
- Flag surfaces that deviate (different radius/border/shadow, ad-hoc colors
  instead of `--color-tdf-*` tokens, zebra striping, non-gold points columns,
  inconsistent active-state color).
- **Specific lead to verify (don't assume):** `TABLE_CLASSES` in
  `lib/constants.ts` still defines `ROW_ODD: 'bg-tdf-bg'` and
  `HEADER: 'bg-table-header'`, which look like pre-redesign zebra/header
  leftovers. Grep for usages — if nothing consumes them, that's dead constants;
  if something does, that may be a design-language violation. Report which.
- Bibs/jerseys/medals rendered by hand anywhere instead of the shared
  components (`NumberBib`, `JerseyIcons`, `MedalDisplay`).
- Admin/`beheer` panels intentionally still use the older look — **out of
  scope** for design findings; note but don't flag.

### E. Cross-page consistency
Compare `/klassement` (Poule), `/ploegen`, `/etappes`, `/renners`, `/spelregels`
against each other:
- Same column produced by the same `Column` spec everywhere it appears
  (position, deelnemer, directie, points, medals, +/-). Same formatting for
  points (gold), decimals, medal display, rank change arrows/colors.
- Loading / error / empty states use the shared `StatusStates` /
  `FreshnessNote` and the same copy from `LABELS` on every page.
- Desktop `StandingsTable` and mobile `ExpandableCard` show the **same data**
  for the same page (parity — no column that exists on one and silently drops
  on the other).
- Page titles (`usePageTitle`), nav labels, and route redirects
  (`/poule`→`/klassement`, `/rennerpunten`→`/renners`, legacy PascalCase) are
  all consistent and actually wired in `src/App.tsx`.

### F. Dead code, leftovers & drift
- Unused exports/components/hooks/helpers. Cross-check against `docs/ideas.md`
  before flagging: the parked jersey-classification transforms
  (`stageWinCounts`, `combativityPointsByParticipant`, `classificationLeaders`
  in `lib/data-transforms.ts`) are **intentionally** built-but-unwired — report
  them as "parked (see ideas.md #12/#13)", not as dead code to delete.
- Stale redirects to routes that no longer exist; orphaned assets in `public/`.
- Commented-out blocks, `console.log`/debug leftovers, `TODO`/`FIXME`/`XXX`
  comments in code (list them).
- Doc drift: statements in `README.md` / `CLAUDE.md` that no longer match the
  code (route names, file locations, script names, conventions).
- `docs/TODO.md` items already shipped (should have been pruned) and shipped
  work missing from the archive.

### G. Types, lint, CI, build
- `any`, unsafe casts, `@ts-ignore`/`@ts-expect-error`, non-null `!` on values
  that can be null. Type coverage across the `tsconfig.api.json` boundary.
- Eslint is **zero-warnings**; report anything at the threshold and any
  `eslint-disable` comments.
- CI uses **`npm install`, not `npm ci`** (win32 lockfile is not
  cross-platform) — flag if a workflow reintroduced `npm ci`. Confirm the
  `.github/` workflow matches the documented gotcha.
- Any dependency imported but unused, or used but undeclared in `package.json`.

### H. Accessibility & responsive
- Icon-only controls (bibs, jerseys, pins, sort toggles, search) have
  accessible names / `aria-label`; the active tab exposes state to AT.
- Color is not the only signal (rank up/down uses arrow **and** color; jerseys
  have text labels available).
- Focus rings preserved on interactive elements; keyboard reachability of tabs,
  search, autocomplete (`src/components/Autocomplete.tsx`).
- No horizontal body scroll on mobile; the 128-row tables and any wide/expanded
  rows behave on small screens.

### I. Security & data integrity
- `require-admin.ts` / `adminAuth.ts` / the e-mail login: auth actually enforced
  on every `api/admin/*` route; no admin-only logic reachable unauthenticated.
- No secrets/tokens committed; `VITE_*` (build-time, public) vs server-only env
  vars used correctly — nothing server-only referenced in client bundles.
- Input validation on the entry payload (unresolvable rider names block; aliases
  resolve) and on the PCS prefill endpoint. `stage_entry_log` records rejected
  submissions too.
- Rider-name resolution/aliases (`lib/rider-names.ts`) — duplicates, unresolved
  spellings, and the merge-riders path.

## Severity rubric

- **P0 — Broken / incorrect:** wrong scoring, stale or mixed-`run_id` data,
  public page hitting the DB, auth bypass, build/test/typecheck failing,
  golden fixtures edited, a table showing dense server rank as position.
- **P1 — Real inconsistency / bug-prone:** cross-page divergence, design-system
  violation on a public surface, hardcoded Dutch strings, missing `fetchAll` on
  a large table, parser fragility with a plausible failing input.
- **P2 — Leftovers / drift:** dead code, unused constants/exports, doc drift,
  stale TODO items, debug logs, redundant helpers.
- **P3 — Polish / nits:** naming, a11y niceties, minor copy inconsistencies.

## Deliverable

Produce a report (print it in the session; optionally also write it to
`docs/audit-findings.md` **only if the operator asks** — default is print-only,
no file changes). Structure:

1. **Baseline** — verbatim result of `npm run check`, `npm test`, `npm run build`.
2. **Summary table** — one row per finding: `ID | Severity | Area | file:line |
   One-line description`, sorted P0→P3.
3. **Details** — per finding: what's wrong, the evidence (quoted code +
   `file:line`), why it matters, and a *suggested* fix direction (one or two
   sentences — do not implement it).
4. **Verified-clean** — invariants/dimensions you checked and found solid, so the
   operator knows the coverage was real.
5. **Open questions** — anything where intended behavior is ambiguous and you
   need the owner's ruling rather than guessing.

## Rules of engagement

- **Do not modify code, tests, fixtures, docs, or config.** Report only.
- Verify before asserting; read the code, run the tool. No hallucinated line
  numbers, no "probably".
- Respect intentional decisions documented in README/CLAUDE/TODO/ideas —
  cross-reference before calling something wrong.
- Golden fixtures are sacred: if the engine disagrees with a fixture, the
  engine is the suspect, not the fixture.
- Keep the admin/`beheer` visual redesign out of scope; audit its
  *correctness/security*, not its looks.
