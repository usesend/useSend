#!/usr/bin/env bash
# Installs a pinned official Node.js build into /app/.node for Nixpacks builds
# and links it into /usr/bin
# (Railway and Coolify). Nixpacks' own Node comes from a nixpkgs snapshot that
# lags security releases by days or months, so we pin the release ourselves.
# To update: change NODE_VERSION and both hashes from
# https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt
set -euo pipefail

NODE_VERSION="22.23.5"
case "$(uname -m)" in
  x86_64) ARCH="x64"; SHA256="cdeb8670a0c81f51b4dc4ac61919f9b1ad917b304bf8221eb939570663d240f8" ;;
  aarch64 | arm64) ARCH="arm64"; SHA256="2babb9eb5264860d540849f4b064a6fbdebcdc323657d9d382ce23d313fd5e09" ;;
  *) echo "install-node: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

TARBALL="node-v${NODE_VERSION}-linux-${ARCH}.tar.xz"
DEST="/app/.node"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL --retry 3 -o "$TMP/$TARBALL" "https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
echo "${SHA256}  $TMP/$TARBALL" | sha256sum -c -

rm -rf "$DEST"
mkdir -p "$DEST"
tar -xJf "$TMP/$TARBALL" -C "$DEST" --strip-components=1

# On the default PATH, so both build steps and the running server use it.
ln -sf "$DEST/bin/node" "$DEST/bin/npm" "$DEST/bin/npx" /usr/bin/

node -v
