# liuzi.win handoff

Operating notes for whoever maintains the site next. README.md covers setup commands; this file covers how the site is run, the judgment calls behind it, and what is still open. Last updated 2026-11-18.

## What the site is

北美留子今天还活着 (liuzi.win): a US immigration policy tracker for Chinese international students and H-1B workers. Three surfaces:

- **Home `/`**: hand-curated tracking cards on the left (`data/issues.json`), an auto-updated feed on the right (`data/items.json`).
- **Issue pages `/issues/<id>`**: one per card, generated from `issues.json`. These exist mainly for SEO.
- **PERM tier list `/perm`**: which employers still sponsor green cards (`data/perm.json`), with a report form.

Stack: Astro static site on GitHub Pages (`TomYang1993/liuziqingbao`). The domain goes through Cloudflare DNS with the proxy off (grey cloud). Votes, feedback and PERM reports go to a Cloudflare Worker with a D1 database.

## How content flows

```
every 4h at :23 UTC   GitHub Actions fetch.yml   scripts/fetch.mjs (CLASSIFIER=none)
                                                 → new items into items.json, ai:false → push → deploy
+1h at :23 UTC        Claude cloud routine       pending.mjs → classify → apply.mjs → push as liuzi-bot → deploy
                      "liuzi.win classify"       https://claude.ai/code/routines/trig_01W3KFEYjdAV5uX9cJ8VNCJS
any push to main      GitHub Actions deploy.yml  astro build → Pages
```

- **Why split this way:** GitHub Actions can reach .gov and news sites but has no Claude login. The Claude cloud sandbox has the login but cannot reach .gov or news sites (it gets 403s). The routine must never run `fetch.mjs` or fetch URLs.
- **No API keys:** Tom will not pay per token. All AI work runs on his Claude subscription. Do not add `@anthropic-ai/sdk` or `ANTHROPIC_API_KEY`.
- **No local machine:** an old launchd job was removed on purpose. Do not bring back local cron jobs.
- **Feed sources:** USCIS RSS, White House presidential actions, the Federal Register API (including DOL/ETA queries), ICE news, Study in the States (RSS plus a blog scrape), and Google News. News is kept only from `NEWS_OUTLETS` and rejected if it matches `NEWS_BLOCK`. Both lists are in `scripts/fetch.mjs`, edit them freely.
- **Hidden until judged:** news items stay off the site until the routine classifies them. Official items show immediately, untagged.
- **Dedup:** `src/lib/feed.mjs` merges duplicates at display time, keeping the earliest item and turning the rest into "also" links. Two things trigger a merge:
  - near-identical titles within 45 days (a White House document that the Federal Register republishes, FR corrections)
  - a `duplicate_of` link the routine sets when several outlets cover one event

  When both an official item and news are in a group, the official one leads.
- **Routine instructions:** the full prompt lives in the routine itself (read it with RemoteTrigger `get`). It covers strict relevance rules for news, the event-grouping procedure for `duplicate_of`, and a git recovery path with no rebase or reset.

## The part that is NOT automated: tracking cards

`data/issues.json` is edited by hand. The routine never touches it. Nothing alerts you when a card goes stale, and it has happened. The card sync on 2026-11-16 found seven missed events across six cards.

How to sync the cards:
1. List each card's latest timeline date, then read the feed (`feed()` output) for anything newer: court rulings, rule publications, comment deadlines passing.
2. Verify every event before writing it. News headlines mislead (see the gotchas below).
3. For each card, update `status`, `summary` and `summary_zh` (the Chinese is required; keep the two in step), and append a timeline entry. Entries backed only by press coverage get `"note": "News report"`, and entries from law firms get `"note": "Law firm summary"`.
4. Check the Federal Register **public inspection** list for rules that will publish tomorrow. The PERM proposal was caught that way one day early:
   `https://www.federalregister.gov/api/v1/public-inspection-documents/current.json`
5. Swap a public-inspection link for the final FR document URL once the document is published.

Card fields:
- `status_kind`: proposed, final, effective, blocked, pending or unverified. It sets the colour of the news labels.
- `stamp` (optional): a short English word shown as a red-ink rubber stamp, e.g. "Blocked" or "Struck down". Tom wants these **English only**.
- `links` (optional): pill buttons such as CPT Map.
- **Order:** array order is display order, and the first card is open by default.

Court documents: CourtListener PDF links (`storage.courtlistener.com/recap/...`) are the best primary source when they exist. The CourtListener API needs auth, but the PDFs are public.

## Cards as of 2026-11-18

| id | state | what to watch |
|---|---|---|
| cpt-guidance | SEVP guidance in effect | Judge Kobick (D. Mass.) is ruling on a stay request heard Nov 6; schools keep cutting CPT (Brown, Nov 12) |
| f1-ds | **Struck down** Nov 16 (Judge Saylor) | Government appeal to the 1st Cir.; replace the news link with the opinion PDF once it is on CourtListener |
| grace-period | Proposed; comments closed Nov 10 | Final rule |
| ead-auto-extension | Final rule in effect since Oct 14 | Little; litigation if any |
| h1b-fee | **Blocked** (D. Mass. Jun 8, N.D. Cal. Sep 30); renewed to Sep 2027 | 1st Cir. and 9th Cir. appeals, the D.C. Cir. Chamber case (No. 25-5473), and the separate $103,265 fee final rule |
| opt-fee | Proposed ($70k + $30k charged to schools); comments closed Nov 9 | Final rule |
| dol-wage-levels | Final rule at White House review (early Nov) | Federal Register publication |
| perm-modernization | Proposed rule published Nov 17; comments due ~Jan 16, 2027 | Final rule |

## PERM tier page

- **Data:** `data/perm.json`. Tiers are 夯(S), 人上人(A), NPC(B) and 拉完了(F). Each company has `name` and `domain`, plus optional `note` (shown in the tooltip) and `logo` (to override the file).
- **Who decides tiers:** **Tom** assigns them. Never guess a tier. Move companies only when he tells you to.
- **Logos:** files live in `public/logos/<domain-without-.com>.png`. The fallback order that worked:
  1. the site's own apple-touch-icon
  2. Simple Icons SVG (`cdn.simpleicons.org/<name>/<hex>`)
  3. the Google favicon service (`sz=128`)

  These are still low-res: Amazon, Oracle, NVIDIA, LinkedIn, Intel.
- **Candidates:** https://www.h1btrends.com/perm/companies (top PERM filers, DOL data). Diff it against `perm.json`, skipping food, staffing and outsourcing filers, and give Tom the list to place.
- **Reports:** the form posts to Worker `/perm-report` → D1 `perm_reports`. Review it monthly (command in README).

## Cloudflare

- **Worker:** `liuziqingbao-votes.ycghost123.workers.dev`, deployed from `worker/` with `npx wrangler deploy`. Wrangler is logged in on Tom's Mac.
- **Endpoints:** `GET /counts`, `POST /vote` (egg/flower/banana, 600/hr per IP), `POST /feedback` (5/hr), `POST /perm-report` (5/hr).
- **Privacy:** IPs are SHA-256 hashed before storage, and a daily cron deletes old rate-limit rows. Keep it that way.
- **CORS:** the allow-list is in `wrangler.toml` `ORIGIN`, comma-separated.
- **Dashboard:** the D1 list page shows "Tables: 0". That is stale metadata; the tables are there.

## Gotchas learned the hard way

- **Headlines lie.**
  - The Washington Post "fee struck down" item was a video clip about an older ruling.
  - The Hill's "Supreme Court visa fine" story was an H-2A case, not the H-1B fee.
  - The First Circuit "upholds ruling" headlines in July were about a stay denial, not a merits ruling.

  The classifier misfiled the first two because their headlines never named a program. Check the facts before changing a card. Tom has repeatedly asked "did X happen?" based on headlines. Answer with what the court actually did (stay vs. vacatur vs. merits, which court).
- **Concurrent pushes:** the routine and the fetch job both push to main every few hours. Always `git pull --rebase` before pushing. The routine itself never rebases; it re-applies `apply.mjs` on a fresh branch.
- **Google News links:** they are JS redirects. `curl` and WebFetch only see "Google News"; open them in the in-app browser to find the real URL.
- **Fonts:** Ma Shan Zheng (the title brush font) is a 9 KB self-hosted subset (`public/msz-subset.woff2`). Adding new brush characters means re-subsetting with fontTools and extending the `unicode-range` in `index.astro` and `perm.astro`. Tier labels use a separate Noto Serif SC Black subset (`nserif-tiers.woff2`).
- **zsh brackets:** zsh globs `[id]` in paths. Quote `"src/pages/issues/[id].astro"`.
- **Missing node_modules:** after machine cleanups, `node_modules` may be gone. Run `npm ci` before `npm run build`.

## How Tom likes it done

- **Copy:** plain titles a student understands ("$100,000 H-1B fee", not legal names). Avoid em-dashes in UI copy.
- **Visual changes:** preview them on a branch with screenshots, then merge when he says so.
- **Git:** commit as "Tom Yang" (the repo's existing author identity) with a `Co-Authored-By` trailer for the model. Push straight to main for data and copy fixes.
- **Chinese:** issue pages show a 中文 summary block. The homepage cards stay English.

## Open items

- **Classifier rule (Tom has not decided):** proposed adding "if the headline does not name an in-scope program or a rule we track, mark it not relevant". It would stop misfires like the two above.
- **Not yet done:** SEO items 3–5 (topic hub pages `/h1b`, `/opt`…, news→issue internal links, `@astrojs/sitemap` niceties). Issue pages and Chinese summaries are done.
- **Search Console:** Tom still has to submit `https://liuzi.win/sitemap.xml`. It needs his Google account.
- **Analytics:** a Cloudflare Web Analytics beacon exists (`src/components/Analytics.astro`). It activates only if `PUBLIC_CF_BEACON_TOKEN` is set in `.env`.
