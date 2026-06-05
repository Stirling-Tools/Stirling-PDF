#!/bin/bash
#
# Cucumber harness for the PAYG shadow-mode scenarios. Brings up the
# saas-profile docker-compose, waits for backend health, pipes the seed SQL
# into the test postgres, then invokes Behave against features/payg/.
#
# Companion to testing/test.sh (which covers the proprietary-flavor stack
# and skips features/payg via behave.ini's exclude_re). Kept as a separate
# entrypoint so the saas variant can be reviewed + iterated on without
# touching the main cucumber harness.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/testing/compose/docker-compose-saas.yml"
SEED_FILE="$PROJECT_ROOT/testing/compose/payg/saas-seed.sql"

cd "$PROJECT_ROOT"

# Swap behave.ini for the run. The project-default behave.ini excludes
# features/payg so the proprietary CI (which boots without the saas profile)
# can't try to run scenarios that need PAYG tables. behave's exclude_re takes
# priority over a path argument, so even `behave features/payg` would find
# zero features against the default config. The PAYG harness needs a config
# without the payg exclusion — restored on exit.
BEHAVE_INI="$PROJECT_ROOT/testing/cucumber/behave.ini"
BEHAVE_INI_BACKUP="$BEHAVE_INI.payg-backup"

cleanup() {
    echo "==> Tearing down saas compose stack"
    docker compose -f "$COMPOSE_FILE" down -v || true
    if [ -f "$BEHAVE_INI_BACKUP" ]; then
        mv "$BEHAVE_INI_BACKUP" "$BEHAVE_INI"
    fi
}
trap cleanup EXIT

cp "$BEHAVE_INI" "$BEHAVE_INI_BACKUP"
cat > "$BEHAVE_INI" <<'EOF'
# Temporary behave.ini written by testing/test-payg.sh for the PAYG harness
# run only. Restored on exit. The project default (in git) excludes
# features/payg so the proprietary-flavor CI doesn't try to run them.
[behave]
exclude_re = features/enterprise
EOF

echo "==> Building + starting saas compose stack"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for backend health (max 180s)"
deadline=$(( SECONDS + 180 ))
until curl -fsS http://localhost:8080/api/v1/info/status > /dev/null 2>&1; do
    if [ $SECONDS -ge $deadline ]; then
        echo "Backend did not become healthy in 180s"
        docker compose -f "$COMPOSE_FILE" logs --tail 200 stirling-pdf-saas
        exit 1
    fi
    sleep 3
done
echo "Backend healthy."

echo "==> Seeding test team / user / wallet_policy (PAYG_SHADOW)"
docker compose -f "$COMPOSE_FILE" exec -T postgres-saas \
    psql -U postgres -d postgres < "$SEED_FILE"

echo "==> Running PAYG cucumber scenarios"
cd "$PROJECT_ROOT/testing/cucumber"
PAYG_BASE_URL="${PAYG_BASE_URL:-http://localhost:8080}" \
PAYG_API_KEY="${PAYG_API_KEY:-payg-cucumber-key}" \
PAYG_DB_HOST="${PAYG_DB_HOST:-localhost}" \
PAYG_DB_PORT="${PAYG_DB_PORT:-5433}" \
PAYG_DB_USER="${PAYG_DB_USER:-postgres}" \
PAYG_DB_PASSWORD="${PAYG_DB_PASSWORD:-postgres}" \
PAYG_DB_NAME="${PAYG_DB_NAME:-postgres}" \
PAYG_DB_SCHEMA="${PAYG_DB_SCHEMA:-stirling_pdf}" \
python -m behave features/payg \
    -f behave_html_formatter:HTMLFormatter -o report-payg.html \
    -f pretty \
    --junit --junit-directory junit-payg

echo "==> PAYG cucumber run complete"
