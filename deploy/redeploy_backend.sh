#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-$HOME/HR_KMG}"
BRANCH="${2:-main}"

cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

docker compose up -d --build backend
docker compose ps backend
