#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-20.12.2}"
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.tools"
mkdir -p "$TOOLS_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_NAME="darwin" ;;
  Linux) OS_NAME="linux" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH_NAME="arm64" ;;
  x86_64) ARCH_NAME="x64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

NODE_DIR="$TOOLS_DIR/node-v${NODE_VERSION}-${OS_NAME}-${ARCH_NAME}"
if [ -d "$NODE_DIR" ]; then
  echo "Node $NODE_VERSION already installed at $NODE_DIR"
  exit 0
fi

TARBALL="node-v${NODE_VERSION}-${OS_NAME}-${ARCH_NAME}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
TMP_TGZ="$TOOLS_DIR/${TARBALL}"

echo "Downloading Node $NODE_VERSION for $OS_NAME-$ARCH_NAME..."
curl -fsSL "$URL" -o "$TMP_TGZ"

echo "Extracting..."
tar -xzf "$TMP_TGZ" -C "$TOOLS_DIR"
rm -f "$TMP_TGZ"

echo "Installed Node $NODE_VERSION at $NODE_DIR"
