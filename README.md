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

## License

Private project
