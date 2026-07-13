# TdF Pool V2

Modern Tour de France pool tracking application built with React, TypeScript, Vite, Tailwind v4, and Supabase.

## Quick Start

### 1. Environment Setup

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Get your Supabase credentials:
1. Go to https://supabase.com/dashboard
2. Create a new project
3. Go to Settings > API
4. Copy the URL and anon key to `.env.local`

### 2. Database Setup

1. Open Supabase SQL Editor
2. Copy the contents of `supabase/migrations/initial_schema.sql`
3. Run the SQL
4. **Important:** Update the admin email in the SQL before running!

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:5173

## Project Structure

```
src/
├── components/
│   ├── layout/           # Navigation, Layout
│   └── admin/            # Admin-specific components
├── pages/                # Route pages
│   ├── Klassement.tsx
│   ├── RennerPunten.tsx
│   ├── TeamSelectie.tsx
│   ├── OverDezePoule.tsx
│   ├── Login.tsx
│   └── admin/
│       ├── AdminLayout.tsx
│       ├── StageResults.tsx
│       └── Riders.tsx
├── lib/
│   ├── supabase.ts       # Supabase client
│   └── queries/          # React Query hooks
├── hooks/                # Custom React hooks
└── types/                # TypeScript types
```

## Features

- ✅ Real-time leaderboard
- ✅ Stage results management
- ✅ Rider database
- ✅ Admin authentication (magic link)
- ✅ Public viewing, admin editing
- ✅ Responsive design
- ✅ Tailwind v4 styling

## Admin Access

1. Go to `/login`
2. Enter your admin email
3. Check email for magic link
4. Click link to authenticate
5. You can now edit data on `/admin` pages

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, add environment variables when asked
```

### Manual Build

```bash
npm run build
# Upload dist/ folder to your hosting provider
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (PostgreSQL)
- **Data Fetching:** TanStack Query (React Query)
- **Routing:** React Router v6
- **Auth:** Supabase Auth (magic links)
- **Deployment:** Vercel

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Phase A — omgeving & runbook (juli 2026)

> NB: de rest van deze README is verouderd (herschrijven staat gepland in WP-B8).
> Deze sectie is actueel en hoort bij `docs/implementation-plan.md`.

### Environment variables

Zie `.env.example` voor de volledige lijst met uitleg. Samengevat:

| Variabele | Waar | Doel |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | DB-toegang voor API-routes |
| `BLOB_READ_WRITE_TOKEN` | Vercel (server) | Snapshots publiceren naar Vercel Blob |
| `ADMIN_TOKEN` | Vercel (server) | Interim beheertoken (WP-A0); vereist op alle schrijf-routes |
| `SCRAPER_TOKEN` | Vercel (server) | Optioneel token voor scripts/scraper |
| `ADMIN_EMAILS` | Vercel (server) | Allowlist voor OTP-login (WP-A4) |
| `SEASON` | Vercel (server) | Seizoen in snapshot-paden (default 2026) |
| `VITE_DATA_BASE_URL` | Vercel (build) | Publieke Blob-store origin voor de frontend |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel (build) | OTP-loginscherm (WP-A4) |

### Dashboard-checklist (eenmalig, handmatig — WP-A0/Q15/Q17/Q21)

> Uitgebreide stap-voor-stap instructies (met verificatie per stap):
> `docs/phase-a-go-live.md`.

Deze stappen kan alleen de eigenaar in de dashboards doen; vink af en noteer de uitkomst hier:

- [ ] **Vercel plan + Fluid compute**: controleer in Project Settings dat Fluid compute aanstaat
      en welke `maxDuration` het plan toelaat (plan gaat uit van Hobby + Fluid, 300s).
- [ ] **Blob store URL + CORS**: noteer de publieke store-origin (voor `VITE_DATA_BASE_URL`) en
      verifieer met `curl -I <store-url>/data/current.json` dat `access-control-allow-origin: *`
      en een `cache-control` ≤ 60s op de pointer staan.
- [ ] **Supabase tier**: bevestig free tier (geen backups → entry-log is de audit trail;
      let op: free projecten pauzeren na ~1 week inactiviteit — hervatten kan via het dashboard).
- [ ] **Preview-scoping (Q21/R16)**: zet `SUPABASE_SERVICE_ROLE_KEY`, `BLOB_READ_WRITE_TOKEN` en
      `ADMIN_TOKEN` in Vercel op **Production only**, zodat preview-deployments nooit
      productie-data kunnen overschrijven.
- [ ] **`ADMIN_TOKEN` genereren**: `openssl rand -hex 32`, in Vercel zetten én eenmalig invoeren
      op de beheerpagina (wordt in localStorage bewaard).
- [ ] **Supabase Auth (WP-A4)**: public signups uitzetten (Authentication → Providers → Email),
      het beheeraccount vooraf aanmaken (Authentication → Users → Invite), en
      `ADMIN_EMAILS` + `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in Vercel zetten.
- [ ] **SQL uitvoeren**: draai `supabase/phase-a.sql` in de Supabase SQL-editor
      (entry-log-tabel + transactionele swap-functie voor WP-A2).

### Checks

```bash
npm run check   # lint + typecheck (web én api/lib)
npm test        # vitest (scoring golden tests, vanaf WP-A3)
```

## License

Private project
