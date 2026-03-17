# TdF Pool V2 — Full Repository Audit

**Date:** 2026-03-17
**Scope:** Complete inventory of codebase, architecture, gaps, and readiness assessment
**Target:** Tour de France 2026 (starts ~July 2026, ~2 months to prepare)

---

## 1. PROJECT OVERVIEW

**What it is:** A Tour de France fantasy pool web application where participants select 10 riders + 1 backup, earn points based on stage results (finishing positions, jerseys, combativity), and compete individually and in "directie" (department) teams.

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
- `src/App.tsx` — Router + navigation (6 routes)
- `index.html` — HTML shell
- `src/index.css` — Global Tailwind styles

**Pages (5):**
| File | Purpose | Status |
|------|---------|--------|
| `src/pages/Klassement.tsx` | Leaderboard — individual + directie standings | ✅ Built |
| `src/pages/RennerPunten.tsx` | Rider points — stage/total/team rankings | ✅ Built |
| `src/pages/TeamSelectie.tsx` | Team selection viewer — who picked whom | ✅ Built |
| `src/pages/EtappeBeheer.tsx` | Stage management — admin panel for processing stages | ✅ Built |
| `src/pages/OverDezePoule.tsx` | About page — pool rules and info | ✅ Built |

**Components (9):**
| File | Purpose |
|------|---------|
| `src/components/Layout.tsx` | Page layout wrapper |
| `src/components/Card.tsx` | Reusable card component |
| `src/components/Button.tsx` | Reusable button component |
| `src/components/Autocomplete.tsx` | Autocomplete dropdown |
| `src/components/shared/MedalDisplay.tsx` | Gold/silver/bronze medal display |
| `src/components/shared/JerseyIcons.tsx` | Jersey (yellow/green/polka/white) icons |
| `src/components/shared/CombativityIcon.tsx` | Combativity award icon |
| `src/components/shared/RankChange.tsx` | Rank up/down indicator |
| `src/components/shared/StageBreakdown.tsx` | Expandable stage-by-stage breakdown |

**Hooks (3):**
| File | Purpose |
|------|---------|
| `src/hooks/useTdfData.ts` | React Query hooks for all data fetching (metadata, leaderboards, riders, stages, selections) |
| `src/hooks/useBusinessLogic.ts` | Filtering, sorting, search, expansion state for leaderboard + rider views |
| `src/hooks/useRefreshTdfData.ts` | Force-refresh via page reload |

### 2.2 Backend API (`api/`) — 10 serverless functions

**Public Endpoints (3):**
| File | Route | Purpose |
|------|-------|---------|
| `api/health.ts` | `GET /api/health` | Health check |
| `api/submit-startlist.ts` | `POST /api/submit-startlist` | Ingest scraped rider startlist |
| `api/submit-stage-results.ts` | `POST /api/submit-stage-results` | Ingest scraped stage results with fuzzy rider matching |

**Admin Endpoints (7):**
| File | Route | Purpose |
|------|-------|---------|
| `api/admin/stages-list.ts` | `GET /api/admin/stages-list` | List all stages |
| `api/admin/riders-list.ts` | `GET /api/admin/riders-list` | List all riders |
| `api/admin/stage.ts` | `GET /api/admin/stage?n=X` | Get specific stage details |
| `api/admin/calculate-points.ts` | `POST /api/admin/calculate-points` | Calculate all points for a stage |
| `api/admin/update-active-selections.ts` | `POST /api/admin/update-active-selections` | Handle DNS rider replacements |
| `api/admin/process-stage.ts` | `POST /api/admin/process-stage` | Orchestrator: calculate points + update selections |
| `api/admin/manual-entry.ts` | `POST /api/admin/manual-entry` | Manual stage data entry |

### 2.3 Shared Library (`lib/`) — 8 files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `lib/types.ts` | All TypeScript interfaces (80+) | `LeaderboardEntry`, `RiderData`, `StageData`, `TeamSelection`, etc. |
| `lib/scoring-constants.ts` | Scoring rules (single source of truth) | `POINTS_FOR_RANK`, `JERSEY_POINTS`, `COMBATIVITY_POINTS`, `TOP_N_FOR_DIRECTIE` |
| `lib/constants.ts` | UI constants | Jersey icons/labels, rank colors, table CSS classes, data paths |
| `lib/config.ts` | Environment config | API URLs, data file paths, asset paths |
| `lib/api-utils.ts` | API helpers | `getApiUrl()`, `createErrorResponse()`, `createSuccessResponse()`, `validateEnv()` |
| `lib/data-transforms.ts` | Data transformation utilities | Medal calculations, rider/participant stats, search, filtering |
| `lib/json-generators.ts` | JSON data generation (Supabase queries) | `generateLeaderboardsJSON()`, `generateRidersJSON()`, `generateRiderRankingsJSON()` |
| `lib/scraper-types.ts` | Scraper integration types | `SubmitStartlistRequest`, `SubmitStageResultsRequest`, `RiderMatchWarning` |

### 2.4 Python Scripts (`scripts/`) — 3 files

| File | Purpose | Dependencies |
|------|---------|-------------|
| `scripts/scrape_stage_results.py` | `TdFScraper` class — scrapes procyclingstats.com for startlist + stage data | `cloudscraper`, `procyclingstats`, `selectolax` |
| `scripts/scrape_startlist.py` | Submits scraped startlist to API endpoint | Uses `TdFScraper` |
| `scripts/submit_to_api.py` | Submits scraped stage results to API endpoint | Uses `TdFScraper` |

### 2.5 Database (`supabase/`) — 1 file

- `supabase/supabase-schema.sql` — Complete schema (446 lines)

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
| `stages` | TdF stages | stage_number, date, cities, type, difficulty, is_complete |

**Selection Tables:**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `participant_rider_selections` | Each participant's 10+1 rider picks | participant_id, rider_id, position (1-11), is_active, replaced_at_stage |

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
| `rider_stage_points` | Rider points per stage | finish/jersey/combativity points breakdown, stage_rank |
| `participant_stage_points` | Participant points per stage | stage_points, cumulative_points, ranks, rank_changes |
| `participant_rider_contributions` | Which riders contributed to each participant | points_contributed |
| `directie_stage_points` | Directie team points per stage | top_contributors (JSONB) |

### 3.2 Schema Strengths
- ✅ Well-normalized relational design
- ✅ 25+ performance indexes
- ✅ Row-Level Security (RLS) enabled on all tables
- ✅ Public read access, service-role-only writes
- ✅ Stage results hidden until stage marked complete
- ✅ Fuzzy matching via `pg_trgm` extension
- ✅ Helper functions (`get_current_stage()`, `find_rider_by_name_fuzzy()`)
- ✅ Table comments for documentation
- ✅ Proper foreign keys with CASCADE deletes
- ✅ Unique constraints preventing duplicate entries
- ✅ Check constraints (e.g., position BETWEEN 1 AND 11)

### 3.3 Schema Concerns
- ⚠️ **No admin write RLS policies** — Comment on line 420: "TODO: Add admin write policies later when we implement auth. For now, use service role key for all writes"
- ⚠️ **No migration system** — Single SQL file with DROP/CREATE, no versioned migrations
- ⚠️ **No `updated_at` columns** — Only `created_at`, no way to track when records were last modified
- ⚠️ **No soft delete** — Using hard deletes via CASCADE
- ⚠️ **`distance` is TEXT** — Could be numeric for calculations
- ⚠️ **`stage_type` and `difficulty` are TEXT** — Could be enums for consistency

---

## 4. SCORING SYSTEM ANALYSIS

### 4.1 Points Structure (from `lib/scoring-constants.ts`)

**Stage Finish Points (top 20):**
1st: 25, 2nd: 19, 3rd: 18, 4th: 17, ... 10th: 11, ... 20th: 1

**Jersey Points (per stage held):**
- Yellow (GC): 15 pts
- Green (Sprint): 10 pts
- Polka Dot (KOM): 10 pts
- White (Young Rider): 10 pts

**Combativity:** 5 pts per stage

**Team Size:** 10 main + 1 backup (activates on DNS)

**Directie Scoring:** Top 5 participants' stage scores per directie per stage

### 4.2 Scoring Concerns
- ✅ Constants centralized in one file
- ✅ Helper functions for point lookups
- ⚠️ **No points for winning team of the day** — The schema has `winning_team` on stages but no scoring constant references it
- ⚠️ **Gap between 1st (25) and 2nd (19) is 6 points** — Intentional? Standard TdF pool scoring typically has a smaller gap
- ⚠️ **Backup rider activation only on DNS** — What about DNF mid-stage? The schema supports DNF/DNS/OTL/DSQ but scoring logic may not handle all cases

---

## 5. DATA FLOW ARCHITECTURE

### 5.1 Stage Processing Pipeline

```
1. SCRAPE: Python scripts scrape procyclingstats.com
   └─→ scripts/scrape_stage_results.py (TdFScraper class)

2. SUBMIT: Python POSTs to API
   └─→ scripts/submit_to_api.py → POST /api/submit-stage-results
   └─→ Fuzzy rider name matching via pg_trgm
   └─→ Inserts into: stage_results, stage_jerseys, stage_combativity, stage_dnf

3. PROCESS: Admin triggers stage processing
   └─→ POST /api/admin/process-stage
       ├─→ /api/admin/calculate-points (rider + participant + directie points)
       └─→ /api/admin/update-active-selections (DNS backup substitutions)

4. GENERATE: JSON data files generated from database
   └─→ lib/json-generators.ts → generates leaderboards, riders, rankings, selections

5. DEPLOY: JSON files uploaded to Vercel Blob
   └─→ Frontend fetches from /data/*.json paths

6. DISPLAY: React frontend renders leaderboards/standings
   └─→ React Query caching + Zustand state
```

### 5.2 Data Flow Concerns
- ⚠️ **Manual pipeline** — Each step requires manual intervention (scrape → submit → process → generate → upload)
- ⚠️ **No automation** — No cron jobs, GitHub Actions, or scheduled tasks
- ⚠️ **Scraper fragility** — Depends on procyclingstats.com HTML structure not changing
- ⚠️ **JSON generation unclear** — `json-generators.ts` queries Supabase but it's unclear how/when these are invoked in production
- ⚠️ **Missing scripts** — `package.json` references scripts that don't exist (see Section 7)

---

## 6. FRONTEND ANALYSIS

### 6.1 Routing Structure (from App.tsx)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Klassement | Main leaderboard (default) |
| `/klassement` | Klassement | Leaderboard |
| `/renner-punten` | RennerPunten | Rider points |
| `/team-selectie` | TeamSelectie | Team selections |
| `/etappe-beheer` | EtappeBeheer | Stage management (admin) |
| `/over-deze-poule` | OverDezePoule | About/rules |

### 6.2 Frontend Strengths
- ✅ Clean component architecture with shared components
- ✅ Custom hooks for data fetching and business logic
- ✅ React Query for caching and background refetching
- ✅ TypeScript strict mode throughout
- ✅ Responsive design with Tailwind
- ✅ TdF-branded yellow theme

### 6.3 Frontend Concerns
- ⚠️ **No authentication on admin page** — `EtappeBeheer` appears accessible to anyone
- ⚠️ **No loading skeletons** — Just loading states but no skeleton UI
- ⚠️ **No error boundaries** — No React error boundaries for crash recovery
- ⚠️ **No PWA support** — No service worker, no offline mode
- ⚠️ **No analytics** — No tracking of page views or user engagement
- ⚠️ **Zustand imported but unclear usage** — React Query seems to handle most state

---

## 7. WHAT'S MISSING

### 7.1 Critical Missing Items 🔴

| Item | Impact | Notes |
|------|--------|-------|
| **Tests (0% coverage)** | HIGH | No test framework installed, no test files, no coverage config. 50+ functions untested |
| **Authentication** | HIGH | Admin endpoints only protected by service role key; no user auth, no login page |
| **`.env.example`** | MEDIUM | README mentions env vars but no example file for new developers |
| **Missing npm scripts** | MEDIUM | `seed-participants.ts`, `seed-stages.ts`, `manage-data.js` referenced in package.json but don't exist |
| **CI/CD pipeline** | MEDIUM | No GitHub Actions, no automated builds/deploys, no lint checks on PR |
| **Error monitoring** | MEDIUM | No Sentry, no error tracking in production |

### 7.2 Important Missing Items 🟡

| Item | Impact | Notes |
|------|--------|-------|
| **Admin write RLS policies** | MEDIUM | Schema TODO: currently relies entirely on service role key |
| **Database migrations** | MEDIUM | Single monolithic SQL file, no version history |
| **Participant onboarding flow** | MEDIUM | No way for participants to sign up or submit their team selections through the UI |
| **Data refresh automation** | MEDIUM | Manual scrape → submit → process → generate → upload pipeline |
| **API rate limiting** | LOW | No rate limiting on public or admin endpoints |
| **Input validation** | MEDIUM | Some validation exists but not comprehensive across all endpoints |
| **Prettier config** | LOW | No code formatter configured (only ESLint) |
| **ESLint config file** | LOW | No `.eslintrc` found — may be using package.json config |

### 7.3 Nice-to-Have Missing Items 🟢

| Item | Impact | Notes |
|------|--------|-------|
| **API documentation** | LOW | No Swagger/OpenAPI docs |
| **License file** | LOW | Private project but good practice |
| **Docker setup** | LOW | Could help with local development consistency |
| **Component library docs** | LOW | No Storybook |
| **Performance monitoring** | LOW | No web vitals tracking |
| **Accessibility audit** | LOW | No a11y testing or ARIA considerations noted |
| **SEO** | LOW | SPA without SSR, but likely not needed for private pool |
| **Internationalization** | LOW | Hardcoded Dutch strings, fine for target audience |

---

## 8. SECURITY ASSESSMENT

### 8.1 Current Security Posture

| Area | Status | Details |
|------|--------|---------|
| Environment secrets | ✅ OK | `.env` files in `.gitignore` |
| Database RLS | ⚠️ Partial | Read policies in place, write policies TODO |
| Admin endpoints | ⚠️ Weak | Only service role key, no proper auth |
| Frontend admin | 🔴 Open | Admin page accessible without login |
| API input validation | ⚠️ Partial | Some validation, not comprehensive |
| CORS | ❓ Unknown | No explicit CORS config found |
| Rate limiting | 🔴 None | No rate limiting |
| SQL injection | ✅ OK | Uses Supabase client (parameterized queries) |
| XSS | ✅ OK | React's built-in escaping |
| Dependency vulnerabilities | ❓ Unknown | No `npm audit` in CI |

### 8.2 Hardcoded Values to Review
- Python scripts default to `year=2025` — needs updating to 2026
- API URLs default to `localhost:3000` — appropriate for dev, check production config
- `TOP_N_FOR_DIRECTIE = 5` — hardcoded, would need code change if rules change
- Profile score thresholds in scraper: 150, 100, 50 — for stage difficulty calculation

---

## 9. DEPENDENCY HEALTH

### 9.1 Key Dependencies

| Package | Version | Status |
|---------|---------|--------|
| react | 18.3.1 | ✅ Current |
| typescript | 5.3.3 | ⚠️ 5.7+ available |
| vite | 5.0.12 | ⚠️ 6.x available |
| tailwindcss | 4.0.0-alpha.25 | 🔴 Alpha — risky for production |
| @supabase/supabase-js | 2.89.0 | ✅ Recent |
| @tanstack/react-query | 5.90.16 | ✅ Current |
| zustand | 4.5.0 | ⚠️ 5.x available |
| react-router-dom | 6.22.0 | ⚠️ 7.x available |
| date-fns | 3.3.1 | ✅ Current |

### 9.2 Dependency Concerns
- 🔴 **Tailwind CSS v4 alpha** — Using pre-release version in production. Could have breaking changes.
- ⚠️ **No `npm audit`** in any workflow — vulnerability checks not automated
- ⚠️ **Python dependencies not tracked** — No `requirements.txt` or `pyproject.toml` for Python scripts

---

## 10. DATA FILES ANALYSIS

### 10.1 JSON Data in Repository
The `data/` directory contains 3.4 MB of JSON files committed to git. This appears to be data from a previous TdF (likely 2025 based on content).

**Concerns:**
- ⚠️ Large JSON files (1.4 MB main data) tracked in git — increases repo size over time
- ⚠️ Data appears to be from a previous year — will need clearing/resetting for 2026
- ⚠️ `stage_results/` has stages 1-12 — incomplete (TdF has 21 stages)
- ⚠️ No clear data lifecycle — when/how to reset for new season

---

## 11. 2-MONTH READINESS CHECKLIST

Assuming TdF 2026 starts early July, here's a prioritized checklist:

### Must-Have Before TdF Starts (Priority 1) 🔴

- [ ] **Update year references** — Python scripts hardcoded to 2025
- [ ] **Add admin authentication** — At minimum, password-protect the admin page and API endpoints
- [ ] **Create `.env.example`** — Document all required environment variables
- [ ] **Fix missing scripts** — Create or remove references to `seed-participants.ts`, `seed-stages.ts`, `manage-data.js`
- [ ] **Participant registration flow** — How do participants submit their team selections? No UI for this exists
- [ ] **Test the full pipeline end-to-end** — Scrape → Submit → Process → Generate → Display
- [ ] **Clear/reset 2025 data** — Prepare database and data files for 2026 season
- [ ] **Seed 2026 startlist** — Load rider data when startlist is announced (usually late June)
- [ ] **Seed participants + directies** — Load all pool participants and their departments
- [ ] **Verify Vercel deployment** — Ensure production environment is working
- [ ] **Upgrade Tailwind from alpha** — v4 stable should be available by now; alpha is risky

### Should-Have (Priority 2) 🟡

- [ ] **Add basic tests** — At minimum: scoring calculations, medal logic, data transforms
- [ ] **Add CI/CD** — GitHub Actions for lint + build on push
- [ ] **Add error monitoring** — Sentry or similar for production error tracking
- [ ] **Add admin write RLS policies** — Per the schema TODO
- [ ] **Add `updated_at` columns** — For debugging and audit trail
- [ ] **Create database migration system** — Even a simple numbered SQL file approach
- [ ] **Add Python `requirements.txt`** — Track Python dependencies
- [ ] **Automate stage processing** — Reduce manual steps in the daily pipeline
- [ ] **Add proper loading states** — Skeleton UI for better UX during data fetches

### Nice-to-Have (Priority 3) 🟢

- [ ] **Error boundaries** in React
- [ ] **Rate limiting** on API endpoints
- [ ] **API documentation** (Swagger/OpenAPI)
- [ ] **Comprehensive test suite** (100+ tests)
- [ ] **Performance monitoring** (web vitals)
- [ ] **PWA support** for mobile users
- [ ] **Notification system** — Alert participants when new stage results are in

---

## 12. ARCHITECTURE STRENGTHS

What's working well:
1. **Clean separation of concerns** — lib/types shared between frontend and API
2. **Pre-calculated points tables** — Smart denormalization for fast reads
3. **Fuzzy rider matching** — Handles scraper name mismatches gracefully
4. **Comprehensive schema** — Well-thought-out database design
5. **Centralized scoring constants** — Single source of truth for all point values
6. **Vercel-native architecture** — Serverless functions + blob storage + React SPA
7. **React Query caching** — Good data fetching pattern
8. **Responsive TdF-branded design** — Professional-looking frontend

---

## 13. SUMMARY

| Category | Grade | Notes |
|----------|-------|-------|
| **Database Design** | A- | Solid schema, good indexes, RLS enabled. Needs migrations and write policies |
| **Frontend** | B+ | Clean React app, good UX. Missing auth, error boundaries, tests |
| **Backend API** | B | Functional endpoints, fuzzy matching. Missing auth, validation, rate limiting |
| **Scoring Logic** | A | Well-centralized, clear constants. Consider edge cases (DNF vs DNS) |
| **Data Pipeline** | C+ | Works but fully manual. Scraper depends on external site structure |
| **Testing** | F | Zero tests, zero coverage, no test framework |
| **DevOps/CI** | F | No CI/CD, no automated deployments, no monitoring |
| **Security** | D+ | RLS helps, but no auth, no rate limiting, admin page open |
| **Documentation** | C | README exists but sparse. No API docs, no `.env.example` |
| **Production Readiness** | C | Deployed on Vercel but significant gaps for production use |

**Bottom Line:** The core application architecture and database design are solid. The scoring logic is well-organized. The main gaps are around operational readiness: testing, authentication, automation, and monitoring. With 2 months, focusing on the Priority 1 checklist items will get you to a usable state for TdF 2026.
