#!/usr/bin/env bash
# Shows each coach with their story status and llm_use / tool_use counts.
#   ./scripts/db-counts.sh               all coaches (newest first)
#   ./scripts/db-counts.sh a@b.com       one coach, with the log rows
"$(dirname "$0")/_psql.sh" -v email="${1:-}" <<'SQL'
SELECT c.coach_email, c.auth_provider, c.status, c.bio_status,
       (SELECT count(*) FROM llm_use  l WHERE l.coach_id = c.coach_id) AS llm_use,
       (SELECT count(*) FROM tool_use t WHERE t.coach_id = c.coach_id) AS tool_use,
       array_length(regexp_split_to_array(trim(coalesce(c.coach_story,'')), '\s+'), 1) AS story_words
  FROM coaches c
 WHERE :'email' = '' OR lower(c.coach_email) = lower(:'email')
 ORDER BY c.created_at DESC LIMIT 20;
SELECT 'llm_use' AS log, l.status, l.model, l.input_tokens, l.output_tokens, l.cost_usd, left(l.error_message, 80) AS error, l.created_at
  FROM llm_use l JOIN coaches c USING (coach_id) WHERE :'email' <> '' AND lower(c.coach_email) = lower(:'email')
UNION ALL
SELECT 'tool_use', t.status, t.tool_name, NULL, NULL, t.credits_used, left(t.error_message, 80), t.created_at
  FROM tool_use t JOIN coaches c USING (coach_id) WHERE :'email' <> '' AND lower(c.coach_email) = lower(:'email')
 ORDER BY created_at;
SQL
