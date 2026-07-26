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
    for migration_path in prisma/migrations/*; do
      [ -d "$migration_path" ] || continue
      prisma migrate resolve --applied "$(basename "$migration_path")"
    done
  elif [ "${PRISMA_UPGRADE_LEGACY_MVP_SCHEMA:-false}" = "true" ]; then
    echo "Existing database is the legacy MVP schema; applying the guarded, data-preserving upgrade."
    prisma db execute --file prisma/legacy/upgrade_mvp_schema.sql

    if ! prisma migrate diff \
      --from-schema prisma/legacy/v1.schema.prisma \
      --to-config-datasource \
      --exit-code; then
      echo "Legacy database upgrade did not produce the verified V1 schema; refusing to baseline." >&2
      exit 1
    fi

    for migration_name in \
      20260723100000_initial_schema \
      20260723154500_harden_defaults_and_lead_search \
      20260723190000_account_lifecycle \
      20260724130000_replace_deepseek_with_groq; do
      prisma migrate resolve --applied "$migration_name"
    done
  else
    echo "Existing database schema differs from the committed Prisma schema; refusing to baseline." >&2
    exit 1
  fi

  prisma migrate deploy
fi

exec node server/dist/index.js
