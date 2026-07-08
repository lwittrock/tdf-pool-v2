# TdF Pool V2 — Full Repository Audit

**Date:** 2026-03-17
**Scope:** Complete inventory of codebase, architecture, deep logic review, gaps, and readiness assessment
**Target:** Tour de France 2026 (starts ~July 2026, ~2 months to prepare)

---

## 1. PROJECT OVERVIEW & DESIGN INTENT

**What it is:** A Tour de France fantasy pool web application for a group of colleagues. Participants each select 10 riders + 1 backup before the Tour starts. As stages are completed, riders earn points for finishing positions (top 20), holding jerseys, and combativity awards. Participants score the sum of their riders' points. Participants are also grouped into "directies" (departments) that compete as teams using their top 5 participants' stage scores.

**Design philosophy:** The app is designed around a **static JSON + CDN pattern** — all data is pre-calculated on the backend, exported as JSON files, and uploaded to Vercel Blob. The frontend is a pure reader that never directly queries the database. This keeps the frontend fast, cheap, and simple.

**Operational model:** An admin (you) manually processes each stage:
1. Run Python scraper to pull results from procyclingstats.com
2. Submit scraped data to API endpoint
3. Trigger processing (points calculation, substitutions, JSON generation, upload)
4. Frontend automatically shows new data

**Tech Stack:**
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v4 (alpha) |
| State | TanStack Query (React Query) + Zustand |
| Routing | React Router v6 |
| Backend | Vercel Serverless Functions (TypeScript) |
| Database | Supabase (PostgreSQL) |
| File Storage | Vercel Blob |
| Data Ingestion | Python scrapers (procyclingstats.com) |
| Deployment | Vercel |
| Language | Dutch (UI), English (code) |

**Repo Stats:** 35 commits, 74 files, ~4 MB total (3.4 MB is JSON data)

---

## 2. COMPLETE FILE INVENTORY

### 2.1 Frontend (`src/`) — 16 TSX + 4 TS files

**Entry Points:**
- `src/main.tsx` — React entry, QueryClient setup
- `src/App.tsx` — Router + navigation (6 routes), responsive hamburger menu
- `index.html` — HTML shell
- `src/index.css` — Global Tailwind styles

**Pages (5):**
| File | Purpose | Status |
|------|---------|--------|
| `src/pages/Klassement.tsx` | Leaderboard — 3 tabs: individual standings, stage results, directie standings | ✅ Built, fully functional |
| `src/pages/RennerPunten.tsx` | Rider points — 3 tabs: total rankings, stage rankings, team standings | ✅ Built (team tab is placeholder) |
| `src/pages/TeamSelectie.tsx` | Team selection viewer — rider popularity + participant team lookup | ✅ Built |
| `src/pages/EtappeBeheer.tsx` | Admin panel — enter stage data, trigger processing | ✅ Built (no auth gate) |
| `src/pages/OverDezePoule.tsx` | About page — pool rules and info | ⚠️ Stub ("Work in progress") |

**Components (9):**
| File | Purpose |
|------|---------|
| `src/components/Layout.tsx` | Page layout wrapper with title/subtitle |
| `src/components/Card.tsx` | Reusable card component |
| `src/components/Button.tsx` | Reusable button component |
| `src/components/Autocomplete.tsx` | Autocomplete dropdown (used in admin form) |
| `src/components/shared/MedalDisplay.tsx` | Gold/silver/bronze medal emoji display |
| `src/components/shared/JerseyIcons.tsx` | Jersey SVG icons (yellow/green/polka/white) |
| `src/components/shared/CombativityIcon.tsx` | Red square combativity award icon |
| `src/components/shared/RankChange.tsx` | Rank up/down arrow indicator |
| `src/components/shared/StageBreakdown.tsx` | Expandable stage-by-stage breakdown |

**Hooks (3):**
| File | Purpose |
|------|---------|
| `src/hooks/useTdfData.ts` | React Query hooks — fetches JSON files with `staleTime: Infinity` (never auto-refetch) |
| `src/hooks/useBusinessLogic.ts` | Filtering, sorting, search, expansion state — pure transforms on pre-calculated data |
| `src/hooks/useRefreshTdfData.ts` | Invalidates all React Query caches after admin processing |

### 2.2 Backend API (`api/`) — 10 serverless functions

**Public Endpoints (3):**
| File | Route | Purpose |
|------|-------|---------|
| `api/health.ts` | `GET /api/health` | Health check (Supabase + Blob + env) |
| `api/submit-startlist.ts` | `POST /api/submit-startlist` | Ingest scraped rider startlist (upserts to `riders` table) |
| `api/submit-stage-results.ts` | `POST /api/submit-stage-results` | Ingest scraped stage results with fuzzy rider matching via `pg_trgm` |

**Admin Endpoints (7):**
| File | Route | Purpose |
|------|-------|---------|
| `api/admin/stages-list.ts` | `GET /api/admin/stages-list` | List all stages |
| `api/admin/riders-list.ts` | `GET /api/admin/riders-list` | List all riders |
| `api/admin/stage.ts` | `GET /api/admin/stage?n=X` | Get specific stage details (results, jerseys, DNF/DNS) |
| `api/admin/calculate-points.ts` | `POST /api/admin/calculate-points` | **Core engine** — calculates rider/participant/directie points for a stage |
| `api/admin/update-active-selections.ts` | `POST /api/admin/update-active-selections` | DNS backup rider substitutions |
| `api/admin/process-stage.ts` | `POST /api/admin/process-stage` | **Orchestrator** — runs selections update → calculate points → mark complete → generate JSON → upload to Blob |
| `api/admin/manual-entry.ts` | `POST /api/admin/manual-entry` | Manual stage data entry (exact name match, no fuzzy) |

### 2.3 Shared Library (`lib/`) — 8 files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `lib/types.ts` | All TypeScript interfaces (80+) | `LeaderboardEntry`, `RiderData`, `StageData`, `TeamSelection`, etc. |
| `lib/scoring-constants.ts` | Scoring rules (single source of truth) | `POINTS_FOR_RANK`, `JERSEY_POINTS`, `COMBATIVITY_POINTS`, `TOP_N_FOR_DIRECTIE` |
| `lib/constants.ts` | UI constants | Jersey icons/labels, rank colors, table CSS classes, data paths |
| `lib/config.ts` | Environment config | API URLs, data file paths, asset paths |
| `lib/api-utils.ts` | API helpers | `getApiUrl()`, `createErrorResponse()`, `createSuccessResponse()`, `validateEnv()` |
| `lib/data-transforms.ts` | Data transformation utilities | Medal calculations, rider/participant stats, search, filtering |
| `lib/json-generators.ts` | JSON data generation (Supabase → JSON) | `generateLeaderboardsJSON()`, `generateRidersJSON()`, `generateRiderRankingsJSON()`, etc. |
| `lib/scraper-types.ts` | Scraper integration types | `SubmitStartlistRequest`, `SubmitStageResultsRequest`, `RiderMatchWarning` |

### 2.4 Python Scripts (`scripts/`) — 3 files

| File | Purpose | Dependencies |
|------|---------|-------------|
| `scripts/scrape_stage_results.py` | `TdFScraper` class — scrapes procyclingstats.com for startlist + stage data | `cloudscraper`, `procyclingstats`, `selectolax` |
| `scripts/scrape_startlist.py` | Submits scraped startlist to API endpoint | Uses `TdFScraper` |
| `scripts/submit_to_api.py` | Submits scraped stage results to API endpoint, displays fuzzy match warnings | Uses `TdFScraper` |

### 2.5 Database (`supabase/`) — 1 file

- `supabase/supabase-schema.sql` — Complete schema (446 lines, 13 tables, 25+ indexes, RLS, helper functions)

### 2.6 Static Assets (`public/`) — 5 SVG files

- `icon_jersey.svg`, `jersey_yellow.svg`, `jersey_green.svg`, `jersey_white.svg`, `jersey_polka_dot.svg`

### 2.7 Data Files (`data/`) — 16 JSON files

- `tdf_data.json` (1.4 MB) — Main TdF data blob
- `tdf_team_selections.json` (964 KB) — All team selections
- `team_selections_active.json` (964 KB) — Currently active selections
- `participant_selections_anon.json` (62 KB) — Anonymized selections
- `data/stage_results/stage_1.json` through `stage_12.json` — Per-stage result snapshots

### 2.8 Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `package-lock.json` | Locked dependency versions |
| `tsconfig.json` | TypeScript config (strict mode) |
| `tsconfig.node.json` | Node-specific TS config |
| `vite.config.ts` | Vite build config |
| `tailwind.config.ts` | Tailwind theme (TdF yellow branding) |
| `vercel.json` | Vercel deployment + rewrites |
| `.gitignore` | Comprehensive ignore rules |

---

## 3. DATABASE SCHEMA ANALYSIS

### 3.1 Tables (13 total)

**Core Tables:**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `riders` | All TdF riders | name, team, rider_number, country, is_active |
| `participants` | Pool participants | name, email, directie_id |
| `directie` | Departments/teams | name |
| `stages` | TdF stages | stage_number, date, cities, type, difficulty, is_complete, winning_team |

**Selection Tables:**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `participant_rider_selections` | Each participant's 10+1 rider picks | participant_id, rider_id, position (1-11), is_active, replaced_at_stage, replacement_for_rider_id |

**Result Tables:**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `stage_results` | Top 20 finishers per stage | stage_id, rider_id, position, time_gap |
| `stage_jerseys` | Jersey holders per stage | stage_id, jersey_type, rider_id |
| `stage_combativity` | Most combative rider per stage | stage_id, rider_id |
| `stage_dnf` | DNF/DNS/OTL/DSQ per stage | stage_id, rider_id, status |

**Pre-calculated Points Tables:**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `rider_stage_points` | Rider points per stage | stage_finish_points, yellow/green/polka_dot/white_points, combativity_points, total_points, stage_rank |
| `participant_stage_points` | Participant points per stage | stage_points, stage_rank, cumulative_points, overall_rank, rank_changes |
| `participant_rider_contributions` | Which riders contributed to each participant | points_contributed |
| `directie_stage_points` | Directie team points per stage | stage/cumulative points, ranks, top_contributors (JSONB) |

### 3.2 Schema Strengths
- ✅ Well-normalized relational design
- ✅ 25+ performance indexes (including partial indexes on `is_active` and `is_complete`)
- ✅ Row-Level Security (RLS) enabled on all 13 tables
- ✅ Smart read policies: public can see everything except incomplete stages/results
- ✅ Fuzzy matching via `pg_trgm` extension + `find_rider_by_name_fuzzy()` function
- ✅ Helper functions (`get_current_stage()`, `get_total_participants()`, `get_rider_id_by_name()`)
- ✅ Table comments for documentation on every table and key column
- ✅ Proper foreign keys with CASCADE deletes
- ✅ Unique constraints preventing duplicate entries
- ✅ Check constraints (e.g., `position BETWEEN 1 AND 11`)
- ✅ Enum types for `jersey_type` and `dnf_status`

### 3.3 Schema Concerns
- ⚠️ **No admin write RLS policies** — Line 420: `TODO: Add admin write policies later when we implement auth. For now, use service role key for all writes`
- ⚠️ **No migration system** — Single SQL file with DROP/CREATE, no versioned migrations. Any schema change requires full rebuild.
- ⚠️ **No `updated_at` columns** — Only `created_at`, no way to track when records were last modified
- ⚠️ **No soft delete** — Hard deletes via CASCADE. Reprocessing a stage wipes all prior data for that stage.
- ⚠️ **`distance` is TEXT** — e.g., "175.5 km" instead of numeric. Fine for display, but can't calculate.
- ⚠️ **`stage_type` and `difficulty` are TEXT** — Could be enums for consistency, but flexible for scraper data.
- ⚠️ **`directie_stage_points` calculated in JSON generators, not in `calculate-points.ts`** — This table exists in schema but it's unclear if the API endpoint populates it or only the JSON generators do.

---

## 4. SCORING SYSTEM — DEEP ANALYSIS

### 4.1 Points Structure (from `lib/scoring-constants.ts`)

**Stage Finish Points (top 20):**
| Pos | Pts | Pos | Pts | Pos | Pts | Pos | Pts |
|-----|-----|-----|-----|-----|-----|-----|-----|
| 1st | 25 | 6th | 15 | 11th | 10 | 16th | 5 |
| 2nd | 19 | 7th | 14 | 12th | 9 | 17th | 4 |
| 3rd | 18 | 8th | 13 | 13th | 8 | 18th | 3 |
| 4th | 17 | 9th | 12 | 14th | 7 | 19th | 2 |
| 5th | 16 | 10th | 11 | 15th | 6 | 20th | 1 |

**Jersey Points (per stage held):**
- Yellow (GC): 15 pts
- Green (Sprint): 10 pts
- Polka Dot (KOM): 10 pts
- White (Young Rider): 10 pts

**Combativity:** 5 pts per stage

**Team Rules:**
- 10 main riders + 1 backup (position 11)
- Backup activates only on DNS (not DNF/OTL/DSQ)
- Directie score = sum of top 5 participants' **stage** scores (not cumulative)

### 4.2 Points Calculation Algorithm (from `api/admin/calculate-points.ts`)

The engine runs in this exact order:
1. **Clear existing** — DELETE all points for this stage from 3 tables
2. **Calculate rider points** — For each rider: sum finish points + jersey points + combativity
3. **Assign rider stage ranks** — Sort riders by total_points descending
4. **Calculate participant points** — For each participant: sum their active riders' total_points
5. **Store rider contributions** — Record which riders contributed what to each participant
6. **Assign participant stage ranks** — Sort participants by stage_points
7. **Calculate cumulative points** — For each participant × each completed stage: running sum
8. **Assign overall ranks** — Sort by cumulative_points
9. **Calculate rank changes** — Compare overall_rank to previous stage

### 4.3 Scoring Concerns & Design Questions

- ⚠️ **No points for winning team** — Schema has `winning_team` on stages table but no constant or calculation references it. Is this an intentional omission or a planned feature?
- ⚠️ **Gap between 1st (25) and 2nd (19) is 6 points** — All other gaps are 1 point (19→18→17→...). This heavily rewards stage wins. Is this intentional?
- ⚠️ **Backup rider activation only on DNS** — `update-active-selections.ts` only checks `stage_dnf` table for DNS status. If a rider crashes out mid-stage (DNF), the backup is NOT activated. The rider just scores 0 from that stage onward but remains "active." Is this the intended rule?
- ⚠️ **What if both main rider AND backup DNS?** — Current code: backup not activated (correct). But no warning or notification to admin.
- ⚠️ **Directie scoring uses per-stage top 5, not overall top 5** — The `TOP_N_FOR_DIRECTIE = 5` takes the 5 participants with the highest points for *that specific stage*, not the 5 with the highest cumulative. This means different participants can contribute on different stages.
- ⚠️ **Directie points calculated in JSON generators, not in `calculate-points.ts`** — The `directie_stage_points` table exists but the calculate-points endpoint doesn't populate it. Directie rankings are computed on-the-fly during JSON generation. This means the database table may be empty/stale.

---

## 5. DATA FLOW ARCHITECTURE — DEEP ANALYSIS

### 5.1 Complete Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: SCRAPE (Manual — Python CLI)                           │
│                                                                 │
│  $ python scripts/submit_to_api.py [year] [stage] [--force]    │
│    └─→ TdFScraper.get_complete_stage_data()                    │
│        ├─→ _get_stage_data()      → results, jerseys, metadata │
│        ├─→ _get_combativity()     → combativity winner         │
│        ├─→ _get_dnf_dns()         → DNF/DNS lists              │
│        └─→ _get_team_classification() → winning team           │
│                                                                 │
│  Scraper formats names: "Surname Firstname" → "Firstname Surname"│
│  Handles particles: van, de, der, den, le, la, del, da, di, etc│
│                                                                 │
│  POST /api/submit-stage-results                                 │
│    └─→ Fuzzy match each rider name against DB (pg_trgm)        │
│        ├─→ Exact match → accept                                │
│        ├─→ similarity > 0.8 → accept with warning              │
│        ├─→ 0.6 < similarity ≤ 0.8 → reject with warning       │
│        └─→ < 0.6 → not found                                   │
│    └─→ Inserts: stage_results, stage_jerseys, stage_combativity│
│         stage_dnf, stages (upsert)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: PROCESS (Manual — Admin UI or API call)                │
│                                                                 │
│  POST /api/admin/process-stage { stage_number }                 │
│    │                                                            │
│    ├─→ Step A: update-active-selections                         │
│    │   └─→ Check DNS riders → activate backup (pos 11) if needed│
│    │                                                            │
│    ├─→ Step B: calculate-points                                 │
│    │   └─→ Rider points → Participant points → Cumulative →    │
│    │       Stage ranks → Overall ranks → Rank changes           │
│    │                                                            │
│    ├─→ Step C: UPDATE stages SET is_complete = true             │
│    │                                                            │
│    ├─→ Step D: Generate 6 JSON files from database              │
│    │   ├─→ metadata.json                                        │
│    │   ├─→ leaderboards.json (participant + directie)           │
│    │   ├─→ riders.json (all rider data + medals)                │
│    │   ├─→ rider_rankings.json                                  │
│    │   ├─→ stages_data.json (admin panel)                       │
│    │   └─→ team_selections.json                                 │
│    │                                                            │
│    └─→ Step E: Upload all 6 JSON files to Vercel Blob           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: DISPLAY (Automatic — React frontend)                   │
│                                                                 │
│  useTdfData hooks fetch JSON from /data/*.json (Vercel Blob)   │
│    └─→ staleTime: Infinity (data only updates on process-stage)│
│                                                                 │
│  useBusinessLogic hooks filter/sort pre-calculated data         │
│    └─→ No recalculation, just presentation transforms           │
│                                                                 │
│  data-transforms.ts provides utility functions                  │
│    └─→ Medal counting, stage extraction, search, formatting     │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Sources of Truth

| Data | Calculated In | Stored In | Frontend Gets From |
|------|--------------|-----------|-------------------|
| Rider stage points | `calculate-points.ts` | `rider_stage_points` table | `riders.json` + `rider_rankings.json` |
| Participant stage points | `calculate-points.ts` | `participant_stage_points` table | `leaderboards.json` |
| Participant rider contributions | `calculate-points.ts` | `participant_rider_contributions` table | `leaderboards.json` |
| Directie rankings | `json-generators.ts` (on-the-fly) | `leaderboards.json` (NOT in DB reliably) | `leaderboards.json` |
| Rider medals | `json-generators.ts` (from stage_results positions) | `riders.json` | `riders.json` |
| Current stage | `stages.is_complete` flag | `metadata.json` | `metadata.json` |
| Active selections | `update-active-selections.ts` | `participant_rider_selections` table | `team_selections.json` |

### 5.3 Data Flow Concerns

- ⚠️ **Manual pipeline** — Each stage requires: run Python script → review warnings → trigger process-stage. During a 3-week Tour, this is 21 stages, often with late-evening finishes.
- ⚠️ **No rollback on partial failure** — If `process-stage` succeeds at step C (mark complete) but fails at step D (JSON generation), the stage is marked complete but JSON files are stale. Re-running with `force=true` would fix this, but you'd need to know it failed.
- ⚠️ **N+1 query problems** — `generateLeaderboardsJSON()` queries `participant_rider_contributions` for EACH participant-stage combo. With 100 participants × 21 stages = 2,100 extra queries. Similarly, `calculate-points.ts` has N+1 patterns for cumulative calculation and rank updates.
- ⚠️ **No transaction wrapping** — `calculate-points.ts` performs ~8 sequential database operations without a transaction. A failure mid-way leaves inconsistent data.
- ⚠️ **Scraper depends on external HTML structure** — `_get_team_classification()` does raw HTML parsing with selectolax, looking for specific table headers. This is the most fragile part.
- ⚠️ **JSON files are the single point of truth for frontend** — If Blob upload fails, frontend shows stale data with no indication something went wrong.

---

## 6. FRONTEND — DEEP ANALYSIS

### 6.1 Page-by-Page Breakdown

**Klassement (Leaderboard) — `src/pages/Klassement.tsx`**
- 3 tab views: Algemeen (overall standings), Etappe (stage results), Directie (team standings)
- Expandable rows showing stage-by-stage breakdown per participant
- Participant medals calculated from `stage_rank` positions (1st/2nd/3rd)
- Directie view shows which participants contributed and how many points
- Responsive: cards on mobile, tables on desktop

**RennerPunten (Rider Points) — `src/pages/RennerPunten.tsx`**
- 3 tab views: Algemeen (total), Etappe (current stage), Team (placeholder)
- Expandable rows with stage-by-stage breakdown per rider
- Shows jersey icons inline (which jerseys a rider held on which stages)
- Combativity icon (red square with #)
- Medal display (gold/silver/bronze for stage wins/podiums)
- **Team tab shows "komt binnenkort beschikbaar"** (coming soon) — not implemented

**TeamSelectie (Team Selection) — `src/pages/TeamSelectie.tsx`**
- Default view: Rider Popularity ranking (how many participants chose each rider)
- Search for a participant: shows their specific team ranked by popularity
- Shows selection percentage (e.g., "65% selected this rider")
- Special icons for popular top-10 riders vs rare top-10 riders

**EtappeBeheer (Admin) — `src/pages/EtappeBeheer.tsx`**
- 3 modes: list view (all stages), view mode (read-only), entry mode (form)
- Entry form: 20 autocomplete fields for finishers, 4 for jerseys, 1 for combativity, multi-select for DNF/DNS
- On submit: calls `manual-entry` then `process-stage` sequentially
- Confirmation dialog when re-processing a completed stage
- Refreshes all React Query caches after processing
- **Max 21 stages hardcoded**, stage types hardcoded: Flat, Hills flat, Hills uphill, Mountains flat, Mountains uphill

**OverDezePoule (About) — `src/pages/OverDezePoule.tsx`**
- **Stub only** — "Work in progress" heading

### 6.2 Frontend Strengths
- ✅ Clean component architecture with shared presentational components
- ✅ Custom hooks cleanly separate data fetching → business logic → presentation
- ✅ React Query with `staleTime: Infinity` — perfect for static JSON pattern
- ✅ `useRefreshTdfData` properly invalidates all 6 query keys after processing
- ✅ TypeScript strict mode throughout
- ✅ Responsive design with consistent mobile/desktop patterns
- ✅ TdF-branded yellow theme with professional appearance
- ✅ Admin page has good UX: stage list → view → edit flow with confirmation dialogs

### 6.3 Frontend Concerns
- 🔴 **No authentication on admin page** — `EtappeBeheer` is accessible to anyone who knows the URL
- ⚠️ **OverDezePoule is a stub** — Participants have no way to see the rules/scoring system
- ⚠️ **No error boundaries** — A React crash in one component takes down the whole app
- ⚠️ **"Team" tab on RennerPunten is unimplemented** — Shows a "coming soon" message
- ⚠️ **Rider rank re-sorted in frontend** — `useRiderRankings` re-sorts by `total_points` and assigns new rank indices. If two riders have identical points, the order is non-deterministic (JS sort is not stable across engines). The backend-calculated `overall_rank` from `riders.json` should be used instead.
- ⚠️ **No loading skeletons** — Just loading text, no skeleton UI
- ⚠️ **Zustand dependency appears unused** — All state management done via React Query + local React state. If Zustand isn't used, it should be removed.

---

## 7. BACKEND API — DEEP ANALYSIS

### 7.1 `submit-stage-results.ts` — Fuzzy Matching Deep Dive

The fuzzy matching flow:
1. Receives rider name from scraper (already formatted as "Firstname Surname")
2. Tries exact case-insensitive match against `riders` table
3. If no exact match: calls `find_rider_by_name_fuzzy()` RPC (uses `pg_trgm` similarity)
4. Accepts match if similarity > 0.8, warns if 0.6-0.8, rejects if < 0.6
5. Unmatched riders generate warnings but don't block the submission

**Issue:** Each rider = 1 separate RPC call. With 20 finishers + 4 jerseys + combativity + DNF/DNS, that's 30+ sequential database calls per stage submission.

**Issue:** The `year` parameter in `submit-startlist.ts` is received but never used in database queries. All riders go into the same table regardless of year. This works fine for a single-year pool but means you need to clear/reset the `riders` table between years.

### 7.2 `calculate-points.ts` — Performance Concerns

This is the most complex endpoint. Key performance issues:

1. **Cumulative calculation is O(participants × stages)** — For each participant, queries each completed stage individually to build running total. With 100 participants × 21 stages = 2,100 queries. Could be a single window function query.

2. **Rank updates are O(n) individual UPDATEs** — Each participant's rank is updated individually. Could be a single bulk UPDATE.

3. **Rank changes require O(n) paired lookups** — Fetches current stage rank AND previous stage rank per participant. Could be a single query joining both stages.

4. **No transaction** — If the function crashes after clearing old data but before inserting new data, that stage has no points data at all.

### 7.3 `process-stage.ts` — Orchestration Risks

```
Step A: update-active-selections  ← can fail independently
Step B: calculate-points          ← depends on A completing
Step C: mark stage complete       ← point of no return
Step D: generate JSON             ← if this fails, stage is "complete" but JSON is stale
Step E: upload to Blob            ← if this fails, same problem
```

**Key risk:** Steps D and E have no try-catch. If JSON generation or Blob upload throws, the entire request fails but step C has already committed. The stage is marked complete with stale JSON files.

### 7.4 `update-active-selections.ts` — Substitution Logic

Current behavior:
1. Find all DNS riders for the stage
2. For each participant with a DNS main rider (positions 1-10):
   - Set that rider's `is_active = false` and `replaced_at_stage = stage_number`
   - If backup rider (position 11) exists and is NOT also DNS: activate backup
3. Backup rider can only replace ONE main rider (first DNS found)

**Design question:** What if a participant has 2 riders DNS in the same stage? Only the first gets the backup. The second just loses that rider with no replacement. Is this the intended rule?

**Issue:** If backup rider IS also DNS, the code simply skips activation. The backup stays at `is_active = true` (its default) but contributes no points. No warning is generated.

---

## 8. PYTHON SCRAPER — DEEP ANALYSIS

### 8.1 Name Formatting (`_format_name`)

This is critical because it bridges external data (procyclingstats) to internal data (Supabase).

**Algorithm:**
```
Input:  "van den Berg Marijn"  (PCS format: surname first)
Output: "Marijn van den Berg"  (display format: firstname last)

Particles recognized: van, de, der, den, le, la, del, da, di, dos, von, zu
```

Steps:
1. Split name by spaces
2. Find last particle (lowercase word matching particle set)
3. Everything up to and including 1 word after the last particle = surname
4. Remaining words = firstname
5. Rejoin as "Firstname Surname"
6. Title-case any ALL CAPS words (combativity data comes in CAPS)

**Edge cases handled:** Multi-word surnames (van den Berg), multiple first names (Tobias Halland Johannessen), ALL CAPS names.

**Fragile point:** If PCS ever changes their name format, all matching breaks. The particle list is hardcoded — missing particles (e.g., "el", "al", "bin") would cause incorrect parsing for riders from certain nationalities.

### 8.2 Data Sources per Stage

| Data | Source | Method | Fragility |
|------|--------|--------|-----------|
| Results (top 20) | PCS stage page | `procyclingstats` library | Medium — library maintains parser |
| Jerseys (GC, Sprint, KOM, Youth) | PCS stage page | `procyclingstats` library | Medium |
| Combativity | PCS combative-riders page | `procyclingstats` library | Medium — format "Stage X" match |
| Team classification | PCS complementary-results page | `selectolax` raw HTML parsing | **HIGH** — directly parses table structure |
| DNF/DNS | PCS stage results | `procyclingstats` library | Medium — depends on `status` field |
| Difficulty | PCS profile_score | Threshold calculation | Low — simple math |

### 8.3 Python Dependency Issues
- **No `requirements.txt` or `pyproject.toml`** — Dependencies must be installed manually
- **`cloudscraper`** — For Cloudflare bypass. May break if Cloudflare updates their protection
- **`procyclingstats`** — Third-party library for parsing PCS pages. If unmaintained, could break on site redesign
- **`selectolax`** — Only used for team classification parsing (could be replaced)

---

## 9. WHAT'S MISSING

### 9.1 Critical Missing Items 🔴

| Item | Impact | Details |
|------|--------|--------|
| **Tests (0% coverage)** | HIGH | No test framework, no test files. 50+ functions including critical scoring logic completely untested |
| **Authentication on admin** | HIGH | `EtappeBeheer` page and all `/api/admin/*` endpoints are publicly accessible. Anyone could submit fake stage data or trigger processing |
| **`.env.example`** | MEDIUM | README mentions env setup but no template. New devs have to guess what vars are needed |
| **Missing npm scripts** | MEDIUM | `package.json` references 3 non-existent files: `scripts/seed-participants.ts`, `scripts/seed-stages.ts`, `scripts/manage-data.js` |
| **OverDezePoule page** | MEDIUM | Participants can't see the rules, scoring system, or how the pool works |
| **Python `requirements.txt`** | MEDIUM | Python dependencies not tracked; can't reliably set up scraper environment |
| **Year hardcoded to 2025** | MEDIUM | Python scripts default to 2025. Need to update for 2026 |

### 9.2 Important Missing Items 🟡

| Item | Impact | Details |
|------|--------|--------|
| **Transaction safety** | MEDIUM | `calculate-points.ts` performs 8+ sequential DB operations without transaction wrapping |
| **Error handling in process-stage** | MEDIUM | Steps D (JSON gen) and E (Blob upload) have no try-catch; failure leaves stage marked complete with stale JSON |
| **Participant onboarding** | MEDIUM | No UI for participants to submit their team selections. How are teams entered? (Likely manually seeded into DB) |
| **Admin write RLS policies** | MEDIUM | Schema TODO: all writes rely on service role key |
| **Database migrations** | MEDIUM | Monolithic SQL file. Schema changes require full rebuild or manual ALTER |
| **Data lifecycle** | MEDIUM | No documented process for resetting between years (clear 2025 data, prepare 2026) |
| **CI/CD pipeline** | MEDIUM | No GitHub Actions or automated builds/deploys |
| **Error monitoring** | MEDIUM | No Sentry or error tracking in production |

### 9.3 Nice-to-Have Missing Items 🟢

| Item | Impact | Details |
|------|--------|--------|
| **React error boundaries** | LOW | Crash in one component takes down entire app |
| **API rate limiting** | LOW | No rate limits on any endpoint |
| **Loading skeletons** | LOW | Better UX during data fetches |
| **"Team" tab on RennerPunten** | LOW | Placeholder for team classification rankings |
| **Notification system** | LOW | Alert participants when new results are in |
| **PWA support** | LOW | Mobile offline access |
| **`updated_at` columns** | LOW | For debugging and audit trail |

---

## 10. BUGS & INCONSISTENCIES FOUND

### 10.1 Confirmed Issues

1. **Frontend re-sorts rider rankings instead of using backend rank** — `useRiderRankings` in `useBusinessLogic.ts` sorts by `total_points` and assigns `overall_rank: index + 1`. This should use the pre-calculated `overall_rank` from `riders.json` to avoid non-deterministic ordering when riders have equal points.

2. **N+1 query in `generateLeaderboardsJSON()`** — For each participant-stage entry, a separate query fetches rider contributions. With 100 participants × 21 stages, that's 2,100 queries. Should batch-fetch all contributions in one query.

3. **N+1 query in `calculate-points.ts` cumulative calculation** — For each participant × completed stage, separate query fetches stage_points. Should use window functions or a single aggregation query.

4. **`submit-startlist.ts` ignores year parameter** — The `year` field is received in the request but never used. All riders upserted to same table regardless of year.

5. **`process-stage.ts` no error handling on Steps D-E** — JSON generation and Blob upload run without try-catch after stage is already marked complete.

6. **Backup rider edge case** — If backup rider (pos 11) is also DNS, the code silently skips. No warning, no audit trail. The backup remains `is_active = true` in the database even though they can't race.

7. **`directie_stage_points` table likely unpopulated** — The schema defines this table but `calculate-points.ts` doesn't write to it. Directie rankings are calculated in `json-generators.ts` on-the-fly. The table may be completely empty.

### 10.2 Potential Issues (Need Verification)

1. **Stale data after failed Blob upload** — If upload fails, frontend shows old JSON. No mechanism to detect this. Could add a version/timestamp check.

2. **Tie-breaking** — Multiple riders or participants with identical points get arbitrary rank ordering. No secondary sort (e.g., by name or by number of wins) defined anywhere.

3. **`stage_score` vs `stage_points` naming** — `types.ts` has a comment: "CRITICAL FIX: stage_score → stage_points to match database schema" but `LeaderboardEntry` still uses `stage_score` for "compatibility." JSON generators map `stage_points` → `stage_score`. This works but is confusing.

---

## 11. SECURITY ASSESSMENT

### 11.1 Current Security Posture

| Area | Status | Details |
|------|--------|---------|
| Environment secrets | ✅ OK | `.env` files in `.gitignore` |
| Database RLS (read) | ✅ OK | Good read policies, incomplete stages hidden |
| Database RLS (write) | 🔴 TODO | No write policies, relies on service role key |
| Admin API endpoints | 🔴 Open | No auth check — anyone can call `/api/admin/*` |
| Frontend admin page | 🔴 Open | No login gate — accessible via URL |
| Input validation | ⚠️ Partial | Stage number validated, but no sanitization of text fields |
| CORS | ⚠️ Unknown | No explicit CORS config (Vercel defaults may help) |
| Rate limiting | 🔴 None | No rate limiting on any endpoint |
| SQL injection | ✅ OK | Supabase client uses parameterized queries |
| XSS | ✅ OK | React's built-in escaping |
| Dependency vulns | ❓ Unknown | No `npm audit` in any workflow |

### 11.2 Practical Risk Assessment

For a private pool among colleagues, the main risk is:
- Someone accidentally or deliberately visiting `/etappe-beheer` and submitting fake data
- The public APIs (`submit-startlist`, `submit-stage-results`) are callable by anyone

**Minimum fix:** Add a shared secret/password to the admin page and API endpoints. Supabase Auth with magic links is already in the stack (per README) but not implemented.

---

## 12. DEPENDENCY HEALTH

### 12.1 Key Dependencies

| Package | Version | Status |
|---------|---------|--------|
| react | 18.3.1 | ✅ Current |
| typescript | 5.3.3 | ⚠️ 5.7+ available |
| vite | 5.0.12 | ⚠️ 6.x available |
| **tailwindcss** | **4.0.0-alpha.25** | **🔴 Alpha — risky for production** |
| @supabase/supabase-js | 2.89.0 | ✅ Recent |
| @tanstack/react-query | 5.90.16 | ✅ Current |
| zustand | 4.5.0 | ⚠️ 5.x available (also possibly unused) |
| react-router-dom | 6.22.0 | ⚠️ 7.x available |
| date-fns | 3.3.1 | ✅ Current |
| @vercel/blob | 2.0.0 | ✅ Current |

### 12.2 Concerns
- 🔴 **Tailwind CSS v4 alpha** — Pre-release in production. Tailwind v4 should be stable by now; upgrade.
- ⚠️ **No `npm audit`** in any workflow
- ⚠️ **Python dependencies untracked** — `cloudscraper`, `procyclingstats`, `selectolax`, `requests` not in any requirements file
- ⚠️ **Zustand may be unused** — Should verify and remove if not needed

---

## 13. DATA FILES ANALYSIS

The `data/` directory contains 3.4 MB of JSON from what appears to be TdF 2025 (based on the 12 stages of data):

- `tdf_data.json` (1.4 MB) — Full data blob
- `tdf_team_selections.json` (964 KB) — All selections
- `team_selections_active.json` (964 KB) — Active selections
- `participant_selections_anon.json` (62 KB) — Anonymized
- `stage_results/stage_1.json` through `stage_12.json`

**Concerns:**
- Large JSON files tracked in git (repo grows with each year)
- Data from previous year needs clearing for 2026
- Only 12 of 21 stages present — was the 2025 run incomplete?
- No documented data lifecycle (how to archive/reset between years)

---

## 14. 2-MONTH READINESS CHECKLIST

Assuming TdF 2026 starts early July:

### Must-Have Before TdF Starts (Priority 1) 🔴

- [ ] **Update year references** — Python scripts default to 2025
- [ ] **Add admin authentication** — At minimum: shared password on admin page + API key for admin endpoints. Supabase Auth magic links already in README as planned approach.
- [ ] **Create `.env.example`** — Document: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `BLOB_READ_WRITE_TOKEN`, any admin auth secrets
- [ ] **Fix missing scripts** — Create or remove `seed-participants.ts`, `seed-stages.ts`, `manage-data.js` from package.json
- [ ] **Build OverDezePoule page** — Participants need to see rules, scoring system, team size, directie rules
- [ ] **Participant registration flow** — Decide: manual DB seeding, spreadsheet import, or UI form
- [ ] **Test full pipeline end-to-end** — Scrape → Submit → Process → Verify JSON → Verify frontend. Use 2025 data as test.
- [ ] **Prepare 2026 data reset** — Script to clear 2025 data, prepare fresh database
- [ ] **Create Python `requirements.txt`** — `cloudscraper`, `procyclingstats`, `selectolax`, `requests`
- [ ] **Upgrade Tailwind from alpha** — v4 stable should be available now
- [ ] **Add error handling to process-stage Steps D-E** — Wrap JSON gen + Blob upload in try-catch; don't mark complete until everything succeeds

### Should-Have (Priority 2) 🟡

- [ ] **Add basic tests** — Scoring calculations, medal logic, data transforms, cumulative points. Even 20 tests would catch most regressions.
- [ ] **Add transaction wrapping** to `calculate-points.ts` — Or at minimum, ensure re-running with `force=true` cleanly recovers
- [ ] **Fix N+1 query in `generateLeaderboardsJSON`** — Batch-fetch contributions
- [ ] **Fix frontend rider rank re-sorting** — Use backend `overall_rank` instead of re-sorting
- [ ] **Add CI/CD** — GitHub Actions for lint + build on push
- [ ] **Add error monitoring** — Sentry free tier for production error tracking
- [ ] **Verify/remove Zustand** — If unused, remove dependency
- [ ] **Define tie-breaking rules** — What happens when participants/riders have equal points?

### Nice-to-Have (Priority 3) 🟢

- [ ] **React error boundaries**
- [ ] **Rate limiting on API endpoints**
- [ ] **"Team" tab on RennerPunten** (team classification)
- [ ] **Loading skeletons for better UX**
- [ ] **Database migration system**
- [ ] **Automate stage processing** (reduce manual steps)
- [ ] **Notification system** (email/push when new results are in)

---

## 15. ARCHITECTURE STRENGTHS

What's working well and should be preserved:

1. **Static JSON + CDN pattern** — Pre-calculate everything, upload as JSON, frontend just reads. This is elegant, cheap, and fast. Don't add direct DB queries to the frontend.
2. **Centralized scoring constants** — `lib/scoring-constants.ts` is the single source of truth. Keep it that way.
3. **Shared types** — `lib/types.ts` used by both API and frontend. Prevents drift.
4. **Pre-calculated points tables** — Smart denormalization. The 5 points tables make reads fast.
5. **Fuzzy rider matching** — `pg_trgm` handles name mismatches between scraper and DB gracefully.
6. **Admin UI with autocomplete** — Good UX for manual data entry as fallback to scraper.
7. **Vercel-native architecture** — Serverless functions + Blob + React SPA. No server to maintain.
8. **Responsive TdF-branded design** — Professional look with the yellow theme.
9. **Idempotent processing** — `force=true` allows re-processing stages safely.
10. **Python scraper separation** — Clean boundary between data ingestion and application logic.

---

## 16. SUMMARY

| Category | Grade | Notes |
|----------|-------|-------|
| **Database Design** | A- | Solid schema, good indexes, RLS. Needs migrations, write policies, and the directie_stage_points table actually populated |
| **Scoring Logic** | A | Well-centralized, clear constants, correct algorithm. Clarify edge cases (DNF vs DNS, ties) |
| **Frontend** | B+ | Clean React app, good UX, proper data flow. Missing auth, error boundaries, one unfinished page |
| **Backend API** | B- | Functional but has N+1 performance issues, no transactions, no auth, partial error handling |
| **Data Pipeline** | C+ | Works but fully manual, fragile scraper, no automation, no rollback |
| **Python Scrapers** | B | Good name formatting, PCS integration works. Fragile HTML parsing for team classification |
| **Testing** | F | Zero tests, zero coverage, no test framework |
| **DevOps/CI** | F | No CI/CD, no automated builds, no monitoring |
| **Security** | D | RLS helps for reads, but admin is wide open, no auth, no rate limiting |
| **Documentation** | C | README exists but sparse. No rules page, no API docs, no `.env.example` |
| **Production Readiness** | C | Deployed and working for 2025 (12 stages), but significant gaps for reliable 2026 operation |

**Bottom Line:** The core architecture is well-designed — the static JSON pattern, centralized scoring, shared types, and pre-calculated tables are all solid choices. The main gaps are operational: authentication, error recovery, testing, and automation. With 2 months, focus on Priority 1 items (auth, error handling, data reset, pipeline testing, rules page) to be ready for TdF 2026. The Priority 2 items (tests, CI/CD, performance fixes) would make the system significantly more reliable during the 3-week race when you'll be processing stages daily.
