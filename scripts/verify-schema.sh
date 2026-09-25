#!/usr/bin/env bash
# Proves the live database matches init.sql exactly: same 4 tables, same
# columns/types/defaults/nullability, same CHECK constraints — nothing added.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="docker compose exec -T db psql -U dev -X -q"

dump() { # $1 = database
  $PSQL -d "$1" -At -c "
    SELECT table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' default='||coalesce(column_default,'')
      FROM information_schema.columns WHERE table_schema='public' ORDER BY 1;
    SELECT conrelid::regclass||' '||pg_get_constraintdef(oid) FROM pg_constraint
     WHERE connamespace='public'::regnamespace ORDER BY 1;"
}

echo "Building a reference database from init.sql ..."
$PSQL -d postgres -c "DROP DATABASE IF EXISTS schema_reference;" -c "CREATE DATABASE schema_reference;"
docker compose exec -T db psql -U dev -X -q -d schema_reference -v ON_ERROR_STOP=1 < init.sql

if diff <(dump schema_reference) <(dump coaching_platform_dev) > /tmp/schema.diff; then
  echo "PASS  live schema is identical to init.sql"
  $PSQL -d coaching_platform_dev -At -c "SELECT '  tables: '||count(*) FROM information_schema.tables WHERE table_schema='public';"
  $PSQL -d coaching_platform_dev -At -c "SELECT '  columns: '||count(*) FROM information_schema.columns WHERE table_schema='public';"
else
  echo "FAIL  schema differs from init.sql:"; cat /tmp/schema.diff; STATUS=1
fi
$PSQL -d postgres -c "DROP DATABASE schema_reference;"

echo "Checking application code for schema-changing SQL ..."
if grep -rInE '\b(ALTER|CREATE|DROP)\s+(TABLE|INDEX|COLUMN|SCHEMA)\b' backend/app; then
  echo "FAIL  schema-changing SQL found in backend/app"; STATUS=1
else
  echo "PASS  no CREATE/ALTER/DROP statements in backend/app"
fi
exit "${STATUS:-0}"
