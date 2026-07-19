# ScraperAPI setup for the PCS-prefill button

*Why: Cloudflare blocks direct PCS fetches from Vercel's servers (confirmed
in production July 18, even with a full browser header set). The fix is the
`PCS_FETCH_PROXY` fallback built into `lib/pcs-fetch.ts`: a blocked direct
fetch automatically retries through a scraping proxy. This doc is the exact
setup — no code changes involved.*

## 1. Create the account (~2 min)

- Go to <https://www.scraperapi.com> → **Sign Up** (email + password; the
  free plan needs no credit card and gives **5,000 credits/month,
  recurring**).
- The dashboard shows your **API key** at the top. Copy it.

## 2. Test the key BEFORE touching Vercel

Open this in any browser, with your key pasted in:

```
https://api.scraperapi.com/?api_key=YOURKEY&url=https%3A%2F%2Fwww.procyclingstats.com%2Frace%2Ftour-de-france%2F2026%2Fstage-12
```

- **PCS page content comes back** (raw HTML or rendered) → the standard
  pool gets through; use the *plain* template in step 3.
- **Error / Cloudflare page** → add `&premium=true` after your key and
  retry. Whichever variant shows PCS content is the one to configure.

## 3. Set the env var in Vercel

Vercel dashboard → **tdf-pool** project → **Settings → Environment
Variables** → Add:

| Field | Value |
|---|---|
| Key | `PCS_FETCH_PROXY` |
| Value (plain worked) | `https://api.scraperapi.com/?api_key=YOURKEY&url={url}` |
| Value (premium needed) | `https://api.scraperapi.com/?api_key=YOURKEY&premium=true&url={url}` |
| Environment | **Production** only (same policy as the other secrets — keeps preview deploys from spending credits) |

Type `{url}` literally — the app substitutes the URL-encoded PCS page
address there at request time.

## 4. Redeploy

Env vars only apply to new deployments: **Deployments** → newest → ⋯ →
**Redeploy** (or push anything to main).

## 5. Tap "Haal op van PCS"

Flow after this: direct fetch → Cloudflare block detected → same page
re-requested through ScraperAPI → HTML parsed as usual. Proxied fetches
take 5–20 s per page (three pages, fetched in parallel), so the button
feels slower than a normal API call. That's expected.

## If it still fails

The error message tells you which case you're in:

- **"PCS blokkeert de server (Cloudflare)"** → the proxy's standard pool
  was also blocked. Escalate the template: `&premium=true` →
  `&ultra_premium=true` (≈30 credits/page — a full Tour still fits the
  free tier several times over). Save, redeploy, re-tap.
- **"PCS-pagina niet bereikbaar: … timeout"** → the proxy responded too
  slowly for the 30 s budget in `lib/pcs-fetch.ts`. Raising it is a
  one-line change — report it.
- Anything else → screenshot the message.

## Budget (for reference)

One button tap = 3 PCS pages. Plain = 3 credits/tap, premium ≈ 30,
ultra ≈ 90. A whole Tour at ~2 taps/stage × 21 stages is ~125 requests —
between 125 and ~3,800 credits depending on tier, against 5,000 free
credits *per month*. The dashboard at scraperapi.com shows live usage.

## Security notes

- The API key lives server-side in Vercel — it never reaches the browser.
- The only data ever sent to ScraperAPI is a public PCS page URL. No pool
  data, tokens, or DB credentials are involved.
- The proxy is used **only** when the direct fetch is blocked; if PCS ever
  unblocks Vercel, the proxy silently stops being called.
