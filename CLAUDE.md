# CLAUDE.md — Project Guide for Claude Code

## Project Overview

TdF Pool V2 is a **Tour de France fantasy pool web application** for a group of colleagues. Participants select 10 riders + 1 backup before the Tour starts. Points are earned based on stage results and tracked via leaderboards.

This is a **private, small-scale app** — not a SaaS product. Prioritize simplicity and reliability over enterprise patterns. The audience is ~50-100 colleagues.

## Architecture

### Design Pattern: Static JSON + CDN

The core architectural choice: **the frontend never queries the database directly**. Instead:

1. Backend calculates all points and rankings → stores in pre-calculated DB tables
2. JSON generators query DB → produce 6 static JSON files
3. JSON files uploaded to Vercel Blob (CDN)
4. React frontend fetches JSON files with `staleTime: Infinity`

**Preserve this pattern.** Don't add direct Supabase calls to the frontend. Don't add real-time subscriptions. The static JSON approach is intentional — it's simple, fast, and cheap.

### Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v4 + React Router v6
- **State:** TanStack React Query (for JSON fetching) + Zustand (minimal use)
- **Backend:** Vercel Serverless Functions (TypeScript, in `/api/`)
- **Database:** Supabase (PostgreSQL) with Row-Level Security
- **Storage:** Vercel Blob (for static JSON files)
- **Data Ingestion:** Python scrapers targeting procyclingstats.com
- **Deployment:** Vercel

### Key Directories

```
src/           → React frontend (pages, components, hooks)
api/           → Vercel serverless functions (backend API)
lib/           → Shared code between frontend and API (types, constants, transforms)
scripts/       → Python scrapers for procyclingstats.com
supabase/      → Database schema (single SQL file)
data/          → JSON data files (generated, not hand-edited)
public/        → Static SVG assets (jersey icons)
```

## Critical Files

| File | Why It Matters |
|------|---------------|
| `lib/scoring-constants.ts` | **Single source of truth** for all point values. Change scoring rules HERE only. |
| `lib/types.ts` | All TypeScript interfaces shared between frontend and API. |
| `lib/json-generators.ts` | Generates all 6 JSON files from database. Called during stage processing. |
| `api/admin/calculate-points.ts` | **Core scoring engine.** Calculates rider → participant → directie points. |
| `api/admin/process-stage.ts` | **Orchestrator.** Runs the full pipeline: selections → points → mark complete → JSON → upload. |
| `supabase/supabase-schema.sql` | Complete database schema. 13 tables, RLS policies, helper functions. |

## Scoring Rules

- **Stage finish:** Top 20 get points (1st=25, 2nd=19, 3rd=18, 4th=17, ..., 20th=1)
- **Jerseys per stage:** Yellow=15pts, Green=10pts, Polka Dot=10pts, White=10pts
- **Combativity:** 5pts per stage
- **Team size:** 10 main riders + 1 backup (backup activates on DNS only)
- **Directie scoring:** Top 5 participants' **stage scores** (not cumulative) per directie per stage
- All constants in `lib/scoring-constants.ts`

## Data Flow

```
Python scraper → POST /api/submit-stage-results → DB
                                                    ↓
Admin triggers → POST /api/admin/process-stage
                  ├→ update-active-selections (DNS substitutions)
                  ├→ calculate-points (rider + participant + directie)
                  ├→ mark stage complete
                  ├→ generate 6 JSON files
                  └→ upload to Vercel Blob
                                                    ↓
React frontend ← fetches JSON from /data/*.json (Vercel Blob)
```

## Development Commands

```bash
# Frontend dev server
npm run dev

# Build (TypeScript check + Vite build)
npm run build

# Lint
npm run lint

# Python scraper (requires: cloudscraper, procyclingstats, selectolax, requests)
python scripts/submit_to_api.py [year] [stage_number] [--force]
python scripts/scrape_startlist.py [year]
```

## Environment Variables

Required for backend API:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (full DB access)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage token

Required for frontend (in Vite):
- `VITE_SUPABASE_URL` — (if used, currently frontend reads from JSON only)
- `VITE_SUPABASE_ANON_KEY` — (if used)

## Conventions

### Code Style
- **TypeScript strict mode** — All code must pass `tsc` with strict enabled
- **UI language is Dutch** — All user-facing text is in Dutch (this is for Dutch colleagues)
- **Code language is English** — Variables, functions, comments in English
- **Shared types in `lib/types.ts`** — Don't define API/data types in components
- **Shared constants in `lib/`** — Scoring in `scoring-constants.ts`, UI in `constants.ts`

### Frontend Patterns
- **Data fetching:** Use React Query hooks from `src/hooks/useTdfData.ts`
- **Business logic:** Use hooks from `src/hooks/useBusinessLogic.ts`
- **Components:** Presentational components in `src/components/shared/`
- **Pages:** Full page components in `src/pages/`
- **Responsive:** Cards on mobile (`< lg`), tables on desktop (`lg:`)
- **Theme:** TdF yellow branding via `tailwind.config.ts` custom colors

### Backend Patterns
- **API responses:** Use `createSuccessResponse()` / `createErrorResponse()` from `lib/api-utils.ts`
- **Database access:** Always use Supabase service role client for writes
- **Idempotency:** Stage processing uses `is_complete` flag + `force` parameter
- **JSON generation:** All 6 generators in `lib/json-generators.ts`, called by `process-stage.ts`

### Database
- Schema is in `supabase/supabase-schema.sql`
- RLS enabled on all tables — public can read (except incomplete stages), writes via service role only
- Pre-calculated points tables: `rider_stage_points`, `participant_stage_points`, `participant_rider_contributions`, `directie_stage_points`
- Fuzzy matching available via `find_rider_by_name_fuzzy()` RPC

## Known Issues / Tech Debt

See `AUDIT.md` for the full list. Key items:
- No tests (0% coverage)
- No authentication on admin page/endpoints
- `process-stage.ts` Steps D-E (JSON gen + Blob upload) lack error handling
- N+1 query performance in `generateLeaderboardsJSON()` and `calculate-points.ts`
- `OverDezePoule` page is a stub
- "Team" tab on `RennerPunten` page is unimplemented (shows "coming soon")
- `directie_stage_points` DB table may be unpopulated (directie rankings calculated in JSON generators)
- Missing scripts referenced in package.json: `seed-participants.ts`, `seed-stages.ts`, `manage-data.js`

## What NOT to Do

- Don't add direct Supabase queries to React components — use the JSON/React Query pattern
- Don't change scoring constants anywhere except `lib/scoring-constants.ts`
- Don't define new types in page/component files — add them to `lib/types.ts`
- Don't add heavy dependencies for simple tasks — this is a small app, keep it lean
- Don't over-engineer — no microservices, no message queues, no GraphQL. Vercel serverless + JSON is the right level of complexity
- Don't add English UI text — keep the frontend in Dutch for the target audience
