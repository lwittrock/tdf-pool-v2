---
name: verify
description: Build, launch, and drive the TdF pool frontend to verify changes end-to-end.
---

# Verifying the TdF pool frontend

## Launch

```bash
npm run dev        # Vite; picks the next free port if 5173 is busy — read the banner
```

`.env` already points `VITE_DATA_BASE_URL` at the public Vercel Blob store, so the app
loads the real published snapshots — no local data setup. Data arrives async; wait for
`table tbody tr` rows before scraping.

## Drive (headless browser)

No Playwright in the repo. Install `puppeteer-core` in the session scratchpad (not the
repo) and point it at the system Chrome:

```js
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});
```

Routes: `/Klassement` (participants: Algemeen / Etappe / Directie tabs),
`/RennerPunten` (riders: Algemeen / Etappe / Team tabs), `/TeamSelectie`.
Desktop tables render at width ≥1024; mobile cards below (`.space-y-2 > div`).
Tab buttons are plain `<button>`s matched by text. Rows expand on click
(expanded desktop row = `tr > td[colspan]`).

## Gotchas

- The search input is React-controlled: setting `.value` + dispatching `input` does
  NOT update state reliably — use `page.type()` and navigate afresh to reset it.
- Ranks/medals are derived client-side (tie-aware competition ranking, 1,2,2,4) from
  points in the snapshot; the snapshot's own `*_rank` fields are dense and only used
  as fallback. Verify ties by grouping rendered rows on equal points.
