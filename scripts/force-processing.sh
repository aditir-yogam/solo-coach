#!/usr/bin/env bash
# Test 13 helper: puts a coach into bio_status = 'processing' so the Portfolio
# shimmer can be seen, then back.
#   ./scripts/force-processing.sh someone@example.com          -> processing
#   ./scripts/force-processing.sh someone@example.com --done   -> done
[ -z "${1:-}" ] && { echo "usage: $0 <email> [--done]"; exit 1; }
STATUS=processing; [ "${2:-}" = "--done" ] && STATUS=done
"$(dirname "$0")/_psql.sh" -v email="$1" -v st="$STATUS" <<'SQL'
UPDATE coaches SET bio_status = :'st', updated_at = now()
 WHERE lower(coach_email) = lower(:'email')
 RETURNING coach_email, bio_status;
SQL
