#!/bin/zsh
# Scheduled entry point: fetch, commit data if changed, push. GitHub Action builds + deploys.
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v24.12.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/fetch.mjs
git add data/items.json
git diff --cached --quiet && exit 0
git commit -m "data: $(date +%F) update"
git push
