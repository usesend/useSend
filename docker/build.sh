#!/usr/bin/env bash

command -v docker >/dev/null 2>&1 || {
    echo "Docker is not running. Please start Docker and try again."
    exit 1
}

SCRIPT_DIR="$(readlink -f "$(dirname "$0")")"
MONOREPO_ROOT="$(readlink -f "$SCRIPT_DIR/../")"

GIT_SHA="$(git rev-parse HEAD)"
# Try to get version from git tags, fall back to git describe, then to 'dev'
APP_VERSION="$(git describe --tags --exact-match 2>/dev/null || git describe --tags 2>/dev/null || echo "dev")"

echo "Building docker image for monorepo at $MONOREPO_ROOT"
echo "App version: $APP_VERSION"
echo "Git SHA: $GIT_SHA"

docker build -f "$SCRIPT_DIR/Dockerfile" \
    --progress=plain \
    --build-arg APP_VERSION="$APP_VERSION" \
    --build-arg GIT_SHA="$GIT_SHA" \
    -t "unsend/unsend:latest" \
    -t "unsend/unsend:$GIT_SHA" \
    -t "unsend/unsend:$APP_VERSION" \
    -t "ghcr.io/unsend-dev/unsend:latest" \
    -t "ghcr.io/unsend-dev/unsend:$GIT_SHA" \
    -t "ghcr.io/unsend-dev/unsend:$APP_VERSION" \
    "$MONOREPO_ROOT"