#!/usr/bin/env bash
# Wipes all local data (database, emails, uploaded files) and starts fresh.
cd "$(dirname "$0")/.." || exit 1
docker compose down -v && docker compose up --build -d && echo "Fresh stack starting — open http://localhost:4000"
