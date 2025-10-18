#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$REPO_ROOT/.tools" ]; then
  echo "Embedded Node runtime not found. Run 'pnpm run setup:node' first." >&2
  exit 1
fi

# Load local Node + pnpm
source "$REPO_ROOT/scripts/env.sh"

echo "Starting daemon and dashboard..."

pnpm -r --parallel \
  --filter @echos/daemon \
  --filter @echos/dashboard \
  run dev
