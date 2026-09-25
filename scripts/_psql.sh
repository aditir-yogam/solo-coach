#!/usr/bin/env bash
# Runs psql inside the db container (no local Postgres client needed).
cd "$(dirname "$0")/.." || exit 1
docker compose exec -T db psql -U dev -d coaching_platform_dev "$@"
