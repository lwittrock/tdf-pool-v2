# Stage-results prefill — investigation & plan

*July 18, 2026 — investigation for making per-stage entry less manual.*
*Updated same day: prototype built and verified headless (see §6). What
remains before use is ONE thing: the Cloudflare spike (§5 step 0), i.e.
`npm run pcs:fixtures -- <stage>` from a network that can reach PCS, and a
preview-deploy test of the button.*

**Goal:** open `/admin`, tap one button, and the whole stage form — top-20,
jerseys, combativity, Dagploeg, DNS/DNF — is prefilled. The admin checks it
against what they saw on TV and hits "Opslaan & Verwerken". The human
review stays: this is prefill, never auto-submit (consistent with the
season-2027 ruling that unreviewed scraping is not worth building — the
review *is* the quality gate that makes scraping acceptable at all).

## 1. Source evaluation

| Source | Verdict |
|---|---|
| **Official Tour / ASO (letour.fr)** | No public API. The site is a JS app over undocumented internal JSON endpoints that change every year; third-party wrappers (Apify scrapers) are paid and just as fragile. Doesn't carry the team *day* classification in an obviously scrapeable place. **Reject as primary.** |
| **`procyclingstats` python package** | The pain already experienced: it parses *everything* on PCS, so any markup change anywhere breaks it, and you wait for an upstream release ("not fully updated all the time"). Also the wrong runtime — this app is TypeScript on Vercel; adding a Python leg means a second deployment target. **Reject.** |
| **PCS HTML, parsed by our own small TS parser** | PCS has every field we need, updated within minutes of the finish, and *one stage page* contains nearly all of it. Owning the parser means a markup change is a 10-minute fix in our repo (with committed HTML fixtures to test against), not an upstream wait. Failure degrades gracefully to today's flow. **Recommended.** |

The decisive argument for scraping-with-our-own-parser: this app already
has the safety net a scraper needs. Rider names resolve through the
alias table, `enter-stage` **blocks** on any unresolvable name, the admin
reviews every field before submitting, and re-entering a stage self-heals.
A bad scrape can produce an empty or visibly-unmatched field — it cannot
silently corrupt standings.

## 2. Where each form field lives on PCS

| Form field | PCS location |
|---|---|
| Top-20 | Stage page result table (`race/tour-de-france/<season>/stage-N`) |
| Yellow / green / polka / white | Same page — the GC, Points, KOM and Youth classification tables are all embedded in the stage page HTML (the tabs); leader of each = jersey |
| DNF / DNS / OTL / DSQ | Bottom rows of the stage result table (rank column shows the abbreviation) |
| Combativity | Stage "Complementary results" section (the page the README already points admins to) |
| Dagploeg (team **day** classification) | Same complementary-results section — *not* the Teams tab, which is the cumulative classification |

So: one fetch of the stage page + one fetch of its complementary-results
page covers the entire form.

## 3. Architecture

Three small pieces, reusing what exists:

1. **`lib/pcs-parse.ts`** — pure function: HTML string → raw structured
   data (`{ top20: [{position, name}], gcLeader, pointsLeader, komLeader,
   youthLeader, combativity, teamDayWinner, dnf: [], dns: [] }`), all as
   **raw PCS strings**, no DB access. Each field parses independently: if
   the KOM table can't be found, `komLeader` is `null` and everything else
   still fills. Unit-tested against committed HTML fixture files
   (`tests/fixtures/pcs/`), so a PCS markup change is reproduced and fixed
   offline.

2. **`api/admin/prefill-stage.ts`** — `GET ?stage=N`, behind
   `requireAdmin`. Fetches the two PCS pages (browser User-Agent, ~10 s
   timeout, no caching), runs the parser, returns the raw prefill plus a
   per-field status. Read-only: no DB writes, nothing submitted.

3. **UI** — a "Vul automatisch in (PCS)" button at the top of
   `StageEntryMode`. On tap: call the endpoint, resolve the raw names
   against the loaded riders list with the *same* matcher the paste flow
   uses (extract `matchRider` from `lib/parse-results.ts` into a shared
   helper), fill the form, and show the paste-style feedback line
   ("18 van 20 posities gevuld … Niet herkend: …"). Unmatched names stay
   visible in their position, exactly like the paste parser's rule.
   The button is re-tappable — each tap re-fetches (useful when
   combativity/complementary results land a few minutes after the top-20).

Team matching for Dagploeg: match the scraped team name against the
distinct `riders.team` values, same folded-token approach.

Optionally, extend `/api/admin/riders-list` to also return
`rider_aliases`, so client-side matching benefits from aliases too
(submit-time alias resolution already exists as the backstop).

## 4. Risks & mitigations

- **PCS sits behind Cloudflare bot protection — confirmed.** The
  procyclingstats python package's own fetcher detects the "Just a
  moment…" challenge page and falls back to `cloudscraper`; that (plus
  upstream release lag) is why the package felt "semi successful". Our
  fetcher (lib/pcs-fetch.ts) sends browser-like headers, detects the
  challenge, and distinguishes 'blocked' from 'down'; when the env var
  `PCS_FETCH_PROXY` is set (a URL template with `{url}`, e.g. a
  scraping-proxy free tier), a blocked direct fetch retries through it.
  Whether Vercel's egress IPs get challenged is the one open question —
  **step 0 below settles it.** If blocked and no proxy is configured, the
  endpoint returns a clear message and the paste flow remains.
- **Markup changes mid-Tour.** Per-field independence means the blast
  radius is one empty field, and the fixture-based tests make the fix
  quick. Worst case: that field is typed by hand, i.e. today's flow.
- **Timing.** Top-20 appears within minutes; combativity/Dagploeg
  sometimes later. Re-tapping the button re-fetches; empty ≠ wrong.
- **PCS itself is wrong.** Happens (early results get corrected). The
  human check covers it, and re-entering a stage self-heals downstream.
- **Rate limiting.** ~2 requests per tap, a handful of taps per stage,
  21 stages — negligible.

## 5. Implementation steps

0. **Spike — the only step left:** run `npm run pcs:fixtures -- 12 13`
   from a network that reaches PCS (home connection). It fetches the three
   pages, saves them as `tests/fixtures/pcs/real-*.html` (the test suite
   picks them up automatically), and prints exactly what the parser
   extracts. Then confirm the same from Vercel: press the button on a
   preview deployment. *If PCS challenges Vercel's IPs, set
   `PCS_FETCH_PROXY` or accept the paste flow as fallback.*
1. ~~Parser + fixtures + tests~~ **done** (`lib/pcs-parse.ts`,
   `tests/pcs-parse.test.ts`, synthetic fixtures under
   `tests/fixtures/pcs/`).
2. ~~Endpoint~~ **done** (`api/admin/prefill-stage.ts`, fetcher in
   `lib/pcs-fetch.ts`).
3. ~~UI button + matcher + feedback~~ **done** ("Haal op van PCS" card in
   the entry form; matching in `lib/prefill.ts`, reusing the paste
   matcher; re-tapping refetches without wiping filled fields).
4. ~~Aliases in `riders-list`~~ **done** (client matching now resolves
   e.g. PCS "GATE Aaron" → DB "AARON MURRAY GATE" via `rider_aliases`).

Explicitly **not** built: scheduled/cron auto-fetching, drafts stored in
the DB, auto-submit — on-demand prefill with human review does the whole
job with far less machinery.

## 6. Verification status (July 18)

- 59 vitest tests green (incl. 22 new parser/prefill tests), lint + both
  typechecks clean.
- Headless end-to-end run (vite + puppeteer, admin APIs stubbed with the
  synthetic-fixture payload and the real 184-rider startlist): one tap
  filled **20/20 positions**, all four jerseys, strijdlust, Dagploeg
  (PCS "Netcompany INEOS Cycling Team" → pool "NETCOMPANY INEOS CYCLING
  TEAM") and the DNF/DNS split (OTL → DNF list), with zero unmatched-name
  warnings.
- NOT yet verified (sandbox cannot reach PCS): live fetching, the exact
  markup of the complementary-results page (my reconstruction is
  header-driven and deliberately loose — `sections_found` in the endpoint
  diagnostics shows what a real page contains), and Cloudflare behaviour
  toward Vercel. That is what step 0 answers.
