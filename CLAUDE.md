# CLAUDE.md

Guidance for working in this repo. For the domain/architecture, read
[README.md](README.md) first — it explains the snapshot/publish model, scoring
rules, and stage-entry flow. This file covers conventions and gotchas.

## What it is
A 128-participant Tour de France fantasy pool: a public read-only standings
site + an admin stage-entry panel. Dutch UI. React + Vite + TypeScript +
Tailwind v4, React Router, TanStack Query, Zustand. Vercel serverless functions
(`api/`), Supabase Postgres, published JSON snapshots on Vercel Blob.

## Commands
- `npm run dev` — Vite dev server (picks the next free port if 5173 is busy).
- `npm run build` — `tsc && vite build`.
- `npm run typecheck` — `tsc --noEmit` for app + `tsconfig.api.json`.
- `npm run lint` — eslint, **zero warnings allowed**.
- `npm test` — vitest (includes the golden 2026 suite).
- `npm run check` — lint + typecheck. Run this (and `npm test`) before committing.

## Architecture in one paragraph
The **public site never queries the DB**. Each publish writes immutable JSON
snapshots to the Blob store and flips one pointer (`data/current.json`); the
frontend polls the pointer (`src/hooks/useTdfData.ts`) and keys every query on
its `run_id`. Scoring is pure and **golden-tested** in `lib/scoring.ts` /
`lib/scoring-constants.ts` — don't change point values without updating the
golden tests (`tests/golden-2026.test.ts`). Shared frontend logic lives in
`lib/` (`data-transforms.ts`, `json-generators.ts`, `pipeline.ts`); pages and
components in `src/`; maintenance/replay scripts in `scripts/` (run with `tsx`).

## Conventions
- **Dutch UI strings** come from `LABELS` in `lib/constants.ts` — don't hardcode.
- **Domain naming:** a *ploeg* is a participant's 10-rider selection; a *team*
  is a real pro team; a *directie* is the mini-league a participant belongs to.
- **Ranks are tie-aware on the client** (`competitionRankMap` /
  `assignCompetitionRanks` in `data-transforms.ts`, 1-2-2-4). Snapshots store
  dense server ranks; use those only as a fallback / for the +/- arrows.
- **Standings tables** all flow through `src/components/shared/StandingsTable.tsx`
  (desktop) and `ExpandableCard` (mobile). Add a column via the `Column` spec
  (`header`/`render`/`align`/`cellClassName`) rather than hand-rolling a table.
- **Award bibs:** `NumberBib` (`variant="combative"` red / `variant="best"`
  yellow). Jerseys via `JerseyIcon`/`JerseyList`.

## Design language (surface system, set 2026-07)
Design tokens are `--color-tdf-*` in `src/index.css`. One surface recipe across
the public UI: **`rounded-xl` + `border border-gray-200` + `shadow-sm`**.
- Table header = uppercase micro-labels (`text-[11px] uppercase tracking-wider
  text-tdf-text-secondary`) on `bg-white` over a hairline; compact rows, no
  zebra, hairline dividers.
- Points columns are gold (`text-tdf-score`).
- Tabs / search / chips: white + 1px border, **yellow (`tdf-accent`) = active**.
- The admin/`beheer` panels still use the older look — out of scope so far.

## Routes
`/klassement` (home/standings), `/ploegen`, `/etappes`, `/renners`,
`/spelregels`; `/admin` is the entry panel (behind login). Old paths
(`/poule`, `/rennerpunten`, legacy PascalCase) redirect to the current ones.

## Gotchas
- **CI uses `npm install`, not `npm ci`.** The lockfile is win32-generated and
  not cross-platform; `npm ci` fails on the Linux runner. Don't switch it back.
- A **"vercel run failed"** message almost always means the GitHub Actions CI
  failed at the install/lint step, not a Vercel deploy problem.
- Windows dev (git-bash): stop stray dev servers with `taskkill //F //IM node.exe`.
- **Verifying UI:** `.env` points `VITE_DATA_BASE_URL` at the live Blob store,
  so `npm run dev` shows real published data. Drive headless with
  `puppeteer-core` against the system Chrome (see the `verify` skill).
