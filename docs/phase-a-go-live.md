# Phase A go-live — manual steps

Everything in this document is a step **only the project owner can do** in the
Supabase and Vercel dashboards (plus two commands from this repo). The code
side of Phase A (WP-A0–A4) is merged; nothing here requires touching code.

Work through the sections in order — later steps depend on earlier ones.
Each step says how to verify it before moving on.

> The post-merge code review findings and their status live in
> [`phase-a-review-findings.md`](phase-a-review-findings.md). The critical one
> (cumulative totals publishing as 0 for a freshly entered stage) is fixed;
> two operational rules from the deferred findings matter here:
> **process stages in order**, and after correcting an old stage,
> **force-reprocess every later stage too**.

---

## 1. Supabase — database

### 1.0 Fresh project? Base schema first

`phase-a.sql` is **incremental**: it assumes the base tables and enum types
already exist. On a brand-new Supabase project, first run the full contents
of [`supabase/supabase-schema.sql`](../supabase/supabase-schema.sql) in the
SQL Editor (it drops-and-recreates everything, so it's written for exactly
this). Then continue with 1.1.

A fresh project also means an **empty database** — no startlist and no
stage rows. Steps 4–5 change accordingly: run the fixture import with
`--create-missing`, and rebuild stages 1–4 by replaying the fixture stage
results through `/api/admin/enter-stage` (or entering them in the beheer
UI) instead of force-reprocessing rows that aren't there.

### 1.1 Run the Phase A SQL

1. Open https://supabase.com/dashboard → your project → **SQL Editor**.
2. Paste the full contents of [`supabase/phase-a.sql`](../supabase/phase-a.sql) and **Run**.
   It is idempotent — safe to re-run if you're not sure it already ran.
3. What it creates:
   - `stage_entry_log` table — audit trail of every submitted stage payload
     (also rejected ones); doubles as poor-man's backup on the free tier.
   - `participants.ploeg` column — the team pick, needed by the fixture
     import and later the Dagploeg +6 rule (WP-B1).
   - `replace_stage_data(...)` function — the transactional swap the entry
     endpoint calls; also writes `stages.winning_team`.

**Verify:** in **Table Editor**, `stage_entry_log` exists and `participants`
has a `ploeg` column. In SQL Editor:
`select proname from pg_proc where proname = 'replace_stage_data';` → 1 row.

### 1.2 Auth (email-OTP login)

1. **Authentication → Sign In / Providers → Email**: make sure the Email
   provider is **enabled**, and turn **off** "Allow new users to sign up"
   (public signups). The login form also sends `shouldCreateUser: false`,
   but this is the server-side guarantee.
2. **Authentication → Users → Invite user** (or "Add user"): create the
   account for `lars.login@pm.me`. Only pre-created accounts can log in.
3. Note: the login screen asks for the **6-digit code** from the email, not
   the magic link. Supabase's default OTP expiry (1 hour) is fine; you can
   shorten it under Authentication → Email if you want.

### 1.3 Collect the keys

**Project Settings → API Keys** (Project URL is under **Settings → Data
API** / General). New projects show the new-style keys; the legacy JWT keys
are on the "Legacy API keys" tab. **Either style works** with this codebase
(supabase-js v2) — just be consistent:

| Value | Used as |
|---|---|
| Project URL (`https://<ref>.supabase.co`) | `SUPABASE_URL` **and** `VITE_SUPABASE_URL` |
| `sb_publishable_…` (or legacy `anon` key) | `VITE_SUPABASE_ANON_KEY` |
| `sb_secret_…` (or legacy `service_role` key) | `SUPABASE_SERVICE_ROLE_KEY` |

If this replaces an earlier project, update the values **everywhere they
live**: Vercel env vars (step 2.3) *and* your local `.env.local` (step 4).

Also confirm the project is on the **free tier** expectation from the plan:
no automatic backups (the entry log is the audit trail) and the project
**pauses after ~1 week of inactivity** — resume it from the dashboard if the
site suddenly serves errors during a quiet period.

---

## 2. Vercel — storage, env vars, compute

### 2.1 Blob store

1. Project → **Storage → Blob**. Create a store if there is none yet.
2. Copy the **read-write token** → `BLOB_READ_WRITE_TOKEN`.
3. Note the store's **public base URL**, shaped like
   `https://xxxxxxxxxxxx.public.blob.vercel-storage.com` → this is
   `VITE_DATA_BASE_URL` (no trailing slash).

### 2.2 Generate the admin token

```bash
openssl rand -hex 32
```

Keep it somewhere safe (password manager). It goes into Vercel as
`ADMIN_TOKEN` **and** you'll type it once into the beheer page (stored in
localStorage) — it's the fallback login when OTP is unavailable, and the
credential for scripts/curl.

### 2.3 Environment variables

Project → **Settings → Environment Variables**. Set:

| Variable | Value | Environment scope |
|---|---|---|
| `SUPABASE_URL` | from 1.3 | **Production only** |
| `SUPABASE_SERVICE_ROLE_KEY` | from 1.3 | **Production only** |
| `BLOB_READ_WRITE_TOKEN` | from 2.1 | **Production only** |
| `ADMIN_TOKEN` | from 2.2 | **Production only** |
| `SCRAPER_TOKEN` | optional, second token for scripts | Production only |
| `ADMIN_EMAILS` | `lars.login@pm.me` (comma-separated if more) | Production (+ Preview is harmless) |
| `SEASON` | `2026` (also the default if unset) | Production |
| `VITE_DATA_BASE_URL` | store URL from 2.1 | Production (+ Preview if previews should show prod data) |
| `VITE_SUPABASE_URL` | from 1.3 | Production |
| `VITE_SUPABASE_ANON_KEY` | from 1.3 | Production |

Notes:

- The **Production-only scoping of the four secrets is the actual safety
  mechanism** (Q21/R16) that stops preview deployments from writing
  production data — the `preview/` blob prefix in code is only belt-and-braces.
- `VITE_*` variables are **build-time**: changing them requires a redeploy
  to take effect.
- Review finding to be aware of: a preview deployment *reads* the production
  pointer but *writes* under `preview/` — so testing the entry flow on a
  preview will look like nothing happened. Test entry on production (or fix
  the read side first).

### 2.4 Compute

**Settings → Functions**: confirm **Fluid compute** is enabled. The two heavy
routes (`enter-stage`, `process-stage`) are configured for `maxDuration: 300`
in `vercel.json`, which on Hobby requires Fluid.

---

## 3. Deploy

Push/merge to `main` (or **Deployments → Redeploy** after setting the env
vars — required anyway so the `VITE_*` values bake into the build).

**Verify the deployment:**

```bash
# Health check (public)
curl https://<your-domain>/api/health

# Auth is enforced: must return 401, NOT succeed
curl -X POST https://<your-domain>/api/admin/process-stage \
  -H "Content-Type: application/json" -d '{"stage_number": 1}'
```

The 401 on the second call is the WP-A0 acceptance test.

---

## 4. Import the 2026 pool

The import script runs **from your machine** against Supabase directly.

1. Create `.env.local` in the repo root (never commit it) with:

   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```

2. **Dry run first** (default — reports, writes nothing):

   ```bash
   npm run import:fixtures
   ```

   It reads `data/2026/fixtures/team_selections.json` (128 anonymized
   P-coded participants) and resolves every rider name against the `riders`
   table. If riders are missing it stops and lists them — that means the
   startlist isn't in the DB yet; import it first, or accept placeholder
   riders with:

3. **Apply:**

   ```bash
   npm run import:fixtures -- --apply
   # or, if the dry run reported missing riders you want auto-created:
   npm run import:fixtures -- --apply --create-missing   # team ONBEKEND
   ```

   Idempotent — safe to re-run; it replaces each participant's selections.

---

## 5. Recompute stages 1–4 and publish

> **Fresh Supabase project:** the DB has no stage rows, so there is nothing
> to force-reprocess. Replay the fixture stage results instead — add
> `ADMIN_TOKEN=<token>` and `APP_URL=https://<your-domain>` to `.env.local`,
> then:
>
> ```bash
> npm run replay:stages              # dry run: reports what it would do
> npm run replay:stages -- --apply   # enter + publish stages 1–4 in order
> ```
>
> The script also creates riders that appear in the results but were never
> picked by a participant (team ONBEKEND) — the import in step 4 only
> creates picked riders. Then skip the curl loop below.

If migrating from the old project (stage rows exist): force-reprocess each
stage so points, ranks, and snapshots are rebuilt with the new engine:

```bash
TOKEN=<ADMIN_TOKEN>
for n in 1 2 3 4; do
  curl -X POST https://<your-domain>/api/admin/process-stage \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"stage_number\": $n, \"force\": true}"
  echo
done
```

Each call responds with `run_id` and any substitutions made. Process them
**in order 1→4** (cumulative totals depend on earlier stages being complete).

---

## 6. Smoke test

1. **Pointer + CORS:**

   ```bash
   curl -I <VITE_DATA_BASE_URL>/data/current.json
   ```

   Expect `access-control-allow-origin: *` and `cache-control` with
   `max-age=60` (the pointer must propagate within a minute).

2. **Site:** open the production URL — Klassement should show the 128
   P-coded participants with the stage-4 standings. Publishing propagates
   within ~2 minutes (60s pointer cache + 60s poll interval).

3. **Login:** go to `/admin` (not in the public nav) → enter
   `lars.login@pm.me` → 6-digit code from email → the Etappe Beheer screen
   opens with a logout link. Also try the fallback: "Inloggen met
   beheertoken" + the `ADMIN_TOKEN`.

4. **Golden check (optional but recommended):** the published stage-4
   cumulative totals should match
   `data/2026/fixtures/expected_standings.json` — same numbers the vitest
   golden suite verifies offline (`npm test`).

---

## 7. Rollback (if a publish goes wrong)

Snapshots are immutable under `data/2026/<runId>/…`; the last 10 runs are
kept. To roll back, re-point the pointer: download `data/current.json`,
change `run_id` and the six `files` URLs to an earlier run's, and re-upload
it to the same path (Vercel dashboard → Storage → Blob, or a one-off script
with `@vercel/blob`'s `put(..., { allowOverwrite: true })`). The site follows
within ~2 minutes. There is deliberately no UI for this.

---

## Checklist (short form)

- [ ] 1.1 `supabase/phase-a.sql` run and verified
- [ ] 1.2 signups off, `lars.login@pm.me` invited
- [ ] 2.1 Blob store + token + public URL noted
- [ ] 2.2 `ADMIN_TOKEN` generated
- [ ] 2.3 all env vars set, secrets scoped Production-only
- [ ] 2.4 Fluid compute on
- [ ] 3 deployed; unauthenticated POST → 401
- [ ] 4 fixtures imported (dry run, then `--apply`)
- [ ] 5 stages 1–4 force-reprocessed in order
- [ ] 6 pointer headers OK, site shows standings, OTP login works
