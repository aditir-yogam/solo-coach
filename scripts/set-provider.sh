#!/usr/bin/env bash
# Switch the story LLM and restart the app:  ./scripts/set-provider.sh groq | anthropic
set -e
[ "$1" = "groq" ] || [ "$1" = "anthropic" ] || { echo "usage: $0 groq|anthropic"; exit 1; }
cd "$(dirname "$0")/.."
if grep -q '^LLM_PROVIDER=' .env; then sed -i.bak "s/^LLM_PROVIDER=.*/LLM_PROVIDER=$1/" .env && rm -f .env.bak; else echo "LLM_PROVIDER=$1" >> .env; fi
docker compose up -d --force-recreate app
echo "LLM_PROVIDER=$1 — app restarted"
