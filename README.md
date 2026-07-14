# TdF Pool

The live administration of a 128-participant Tour de France pool: public
standings site + admin stage entry. React/Vite frontend on Vercel, Vercel
serverless functions, Supabase Postgres, published JSON snapshots on Vercel
Blob. Season 2026 is the first fully app-administered Tour (migrated from an
Excel administration mid-race — the golden test suite verifies the engine
against that sheet cell-for-cell).

## How it works

- **The public site never queries the database.** Every publish writes six
  immutable JSON snapshots to `data/<season>/<runId>/` on the Blob store and
  atomically flips one small pointer (`data/current.json`, 60 s cache). The
  frontend polls the pointer and keys all queries on its `run_id`.
- **One authenticated entry endpoint** (`POST /api/admin/enter-stage`)
  validates a full stage payload (blocking errors on unresolvable rider
  names — aliases resolve known alternative spellings), swaps the stage's
  rows transactionally, recomputes points, and publishes. Entry happens in
  the beheer UI at `/admin`.
- **Scoring rules** live in [lib/scoring.ts](lib/scoring.ts) (pure,
  golden-tested): finish points 25/19/18…1, jerseys 15/10/10/10,
  combativity 5, Dagploeg +6 (winner of the stage's *team day
  classification* → participants whose Ploeg pick matches). Reserves
  activate on a casualty: from the DNS stage itself, or from the stage
  after a DNF/OTL/DSQ; at most one substitution per participant.
- **Directie klassement** shows the **average** of each directie's top-5
  participants (by cumulative points), one decimal — the sheet's formula
  (owner ruling July 2026). Directies with fewer than 5 participants
  average over what they have.
- **Corrections self-heal:** re-entering any stage recomputes cumulative
  totals and overall ranks for every stage in one pass (~6 s/stage).

## Operations (during the Tour)

- **Enter a stage:** `/admin` (e-mail login or beheertoken) → top-20,
  jerseys, combativity *(optional)*, Dagploeg *(optional — PCS → stage →
  "Complementary results" → team day classification)*, DNS/DNF riders (PCS
  startlist annotations). Save; the site follows within ~2 minutes.
- **Correct an old stage:** re-enter it (the UI asks for overwrite
  confirmation). Everything downstream recomputes automatically.
- **Verify against the golden standings:** `npm run verify:standings`
  (cell-for-cell check of the DB against the Excel-extracted fixtures).
- Every submission — also rejected ones — is recorded in `stage_entry_log`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in (see the table below)
npm run dev                  # local dev (set VITE_DATA_BASE_URL to see data)
npm run check                # lint + typecheck (web AND api/lib)
npm test                     # vitest incl. the golden suite (128 × 9 cells)
```

### Environment variables

See [.env.example](.env.example) for details. Server values are Vercel env
vars (secrets scoped **Production only** — that's what keeps preview
deployments from writing production data); `VITE_*` are build-time.

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) + local `.env` | DB access for API routes and scripts |
| `BLOB_READ_WRITE_TOKEN` | Vercel (server) + local `.env` | publish snapshots to Vercel Blob |
| `ADMIN_TOKEN` | Vercel (server) | static admin credential (UI fallback + scripts) |
| `ADMIN_EMAILS` | Vercel (server) | allowlist for the e-mail login |
| `SEASON` | Vercel (server) | season in snapshot paths (default 2026) |
| `VITE_DATA_BASE_URL` | Vercel (build) + local | public Blob store origin |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel (build) | e-mail login screen |

### Database

SQL migrations live in [supabase/migrations/](supabase/migrations/) — run
them **in order** in the Supabase SQL editor (000 base schema, 001 phase A,
002 phase B1). They are idempotent. Full dashboard walkthrough (auth, blob
store, env vars, smoke tests): [docs/phase-a-go-live.md](docs/phase-a-go-live.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run rebuild -- --apply` | **disaster recovery**: rebuild DB + snapshots from the repo (import → startlist → replay → rulings → reprocess → verify) |
| `npm run verify:standings` | DB standings must equal the golden standings, cell for cell |
| `npm run import:fixtures -- --apply` | import the 128 participants + selections (fixtures) |
| `npm run apply:startlist -- --apply` | set rider teams from [data/2026/startlist.json](data/2026/startlist.json) |
| `npm run replay:stages -- --apply --local [N…]` | enter fixture stage results through the full pipeline |
| `npm run process:stages -- --apply N…` | recompute + republish stages from DB rows |
| `npm run merge:riders -- --apply --keep A --remove B` | merge duplicate rider rows (then reprocess) |

Data quirks of the 2026 season (Excel legacy: spelling variants, the
9-rider participant, owner rulings) are documented in
[data/2026/fixtures/README.md](data/2026/fixtures/README.md) and
[docs/phase-a-review-findings.md](docs/phase-a-review-findings.md).

## Repository layout

```
api/            Vercel serverless functions (enter-stage, riders-list, health)
lib/            server + shared logic (scoring, pipeline, publish, generators)
src/            React frontend (public pages + /admin beheer UI)
scripts/        operational tools (see table above)
supabase/       ordered SQL migrations
data/2026/      startlist, rulings, golden fixtures (verbatim-Excel)
data/2025/      legacy v1 season data (reference only)
docs/           plans, runbook, review findings
tests/          vitest: scoring unit tests + the golden suite
```

## Engineering notes

- Any Supabase table that can exceed 1,000 rows must be read via
  `fetchAll` ([lib/supabase-server.ts](lib/supabase-server.ts)) — PostgREST
  silently truncates un-ranged selects.
- The golden fixtures are verbatim-Excel: **never edit them to make code
  pass**. Owner rulings on top of them live in
  [data/2026/rulings.json](data/2026/rulings.json).
- Supabase free tier pauses after ~1 week of inactivity (resume via the
  dashboard) and has no backups — `npm run rebuild` is the recovery story.

## License

Private project.
