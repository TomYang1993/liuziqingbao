# 留子情报 · liuziqingbao

US student & work visa policy watch. Static site on GitHub Pages, no server, no DB.

```
launchd (Mac, 2x/day) → scripts/run.sh → node scripts/fetch.mjs → data/items.json → git push
                                                                                      ↓
                                                              GitHub Action → astro build → Pages
```

## Sources (v1)
- USCIS All News RSS
- White House Presidential Actions RSS
- Federal Register API (`"H-1B"`, `"optional practical training"`, `"F-1 nonimmigrant"`)

## Worker
```bash
npm run fetch                    # fetch + classify via local `claude` CLI (subscription)
CLASSIFIER=none npm run fetch    # skip AI, publish raw
LOOKBACK_DAYS=60 npm run fetch   # widen window (first run / catch-up)
```
Regex prefilter runs before AI. AI failure never blocks publish; item goes out with `summary: null`.

## Schedule (Mac)
```bash
cp launchd/com.tomyang.liuziqingbao.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tomyang.liuziqingbao.plist
tail -f /tmp/liuziqingbao.log
```

## Site
```bash
npm run dev
```
Deploys on push to `main` via `.github/workflows/deploy.yml`. Repo Settings → Pages → Source: GitHub Actions.

## Tracked issues
`data/issues.json`, hand-curated. Status kinds: `proposed | final | effective | blocked | pending | unverified`. Timeline entries link official docs; news-sourced ones carry a `note`.

## Egg / flower votes
Anonymous global counters. Cloudflare Worker + D1 in `worker/`. One-time setup:
```bash
npx wrangler login
cd worker
npx wrangler d1 create liuziqingbao          # paste database_id into wrangler.toml
npx wrangler d1 execute liuziqingbao --remote --file schema.sql
npx wrangler deploy                          # prints https://liuziqingbao-votes.<acct>.workers.dev
```
Put that URL in `.env` as `PUBLIC_VOTES_URL=` and rebuild. Empty URL = buttons animate, counts don't persist.

## Classification without an API key
Cloud fetch (`fetch.yml`) publishes raw items (`ai: false`). Anything with a Claude login can classify them:
```bash
node scripts/pending.mjs                 # unclassified items as JSON
node scripts/apply.mjs < result.json     # { "<url>": {relevant, topics, doc_type, summary} }
```
`scripts/fetch.mjs` (local, `CLASSIFIER=cli`) does the same automatically via `claude -p`. A Claude Code cloud routine does it twice daily on the subscription.
