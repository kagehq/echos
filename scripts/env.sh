#!/usr/bin/env bash

# Resolve repository root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Detect platform-specific Node tarball path
NODE_DIR=""
if [ -d "$REPO_ROOT/.tools" ]; then
  # Prefer any node-v*/bin folder inside .tools
  NODE_DIR="$(find "$REPO_ROOT/.tools" -maxdepth 1 -type d -name 'node-v*' | head -n 1)"
fi

if [ -z "$NODE_DIR" ]; then
  echo "No embedded Node runtime found in .tools/. Run pnpm run setup:node to download it." >&2
  return 1 2>/dev/null || exit 1
fi

export PATH="$NODE_DIR/bin:$PATH"
export PNPM_HOME="$NODE_DIR/bin"

echo "Using embedded Node from $NODE_DIR"
node -v
pnpm -v
