#!/usr/bin/env bash
# Test 8 helper: simulates 24 hours passing for a coach's unused magic links.
#   ./scripts/expire-magic-link.sh someone@example.com
[ -z "${1:-}" ] && { echo "usage: $0 <email>"; exit 1; }
"$(dirname "$0")/_psql.sh" -v email="$1" <<'SQL'
UPDATE magic_link_tokens t SET expires_at = now() - interval '1 hour'
  FROM coaches c
 WHERE c.coach_id = t.coach_id AND lower(c.coach_email) = lower(:'email') AND t.used_at IS NULL;
SQL
echo "Done. Now click the link in Mailpit — you should see the expired-link screen."
