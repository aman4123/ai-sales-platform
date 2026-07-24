#!/bin/sh
set -eu

prisma() {
  node node_modules/prisma/build/index.js "$@"
}
migration_log="$(mktemp)"
trap 'rm -f "$migration_log"' EXIT

if prisma migrate deploy >"$migration_log" 2>&1; then
  cat "$migration_log"
else
  migration_status=$?
  cat "$migration_log" >&2

  if [ "${PRISMA_BASELINE_EXISTING_DATABASE:-false}" != "true" ] || ! grep -q "P3005" "$migration_log"; then
    exit "$migration_status"
  fi

  echo "Prisma found an existing schema without migration history; verifying it before baselining."
  if prisma migrate diff \
    --from-schema prisma/schema.prisma \
    --to-config-datasource \
    --exit-code; then
    echo "Existing database already matches the committed Prisma schema."
  elif [ "${PRISMA_UPGRADE_LEGACY_MVP_SCHEMA:-false}" = "true" ]; then
    echo "Existing database is the legacy MVP schema; applying the guarded, data-preserving upgrade."
    prisma db execute --file prisma/legacy/upgrade_mvp_schema.sql

    if ! prisma migrate diff \
      --from-schema prisma/schema.prisma \
      --to-config-datasource \
      --exit-code; then
      echo "Legacy database upgrade did not produce the committed Prisma schema; refusing to baseline." >&2
      exit 1
    fi
  else
    echo "Existing database schema differs from the committed Prisma schema; refusing to baseline." >&2
    exit 1
  fi

  for migration_path in prisma/migrations/*; do
    [ -d "$migration_path" ] || continue
    migration_name="$(basename "$migration_path")"
    prisma migrate resolve --applied "$migration_name"
  done

  prisma migrate deploy
fi

exec node server/dist/index.js
