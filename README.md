# 留子情报 · liuziqingbao

US student & work visa policy watch. Static site on GitHub Pages, no server, no DB.

```
07:23 / 19:23 PT  GitHub Actions (fetch.yml): scripts/fetch.mjs, CLASSIFIER=none → items.json (ai:false) → push → deploy
08:23 / 20:23 PT  Claude cloud routine (subscription): pending.mjs → classify → apply.mjs → push → deploy
```
No local machine involved. Actions can reach .gov but has no Claude login; the Claude sandbox has the login but no .gov egress.

## Sources (v1)
- USCIS All News RSS
- White House Presidential Actions RSS
- Federal Register API (`"H-1B"`, `"optional practical training"`, `"F-1 nonimmigrant"`)

## Worker (manual runs)
```bash
CLASSIFIER=none npm run fetch    # fetch only, publish raw (what Actions does)
npm run fetch                    # fetch + classify via local `claude` CLI, if you have one
LOOKBACK_DAYS=60 npm run fetch   # widen window (catch-up)
```
Regex prefilter runs before AI. AI failure never blocks publish; item goes out with `summary: null`.

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
The Claude Code cloud routine "liuzi.win classify" does this twice daily on the subscription: https://claude.ai/code/routines/trig_01W3KFEYjdAV5uX9cJ8VNCJS
