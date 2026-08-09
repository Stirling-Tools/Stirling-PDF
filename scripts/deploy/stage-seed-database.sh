#!/usr/bin/env bash
#
# Puts the seed H2 database in place on the VPS before `docker-compose up`, so
# a preview deployment boots with teams, users and policies already present.
#
# Shared by the PR preview and main demo workflows so both behave identically.
# Seeding is optional and degrades quietly: a deployment without a seed file
# still boots, just empty.
#
# Inputs (env):
#   SSH_KEY            path to the private key (required)
#   VPS_USER, VPS_HOST target host (required)
#   REMOTE_DIR         deployment root on the VPS, e.g. /stirling/V2-PR-123 (required)
#   SEED_DB            local path to a .mv.db to seed with (optional)
#   RESET_SEED         "true" reseeds on every deploy, wiping existing data.
#                      Anything else only seeds when there is no database yet.
#
# Outputs (appended to GITHUB_OUTPUT when set):
#   seed_staged=true|false

set -euo pipefail

log() { printf '[stage-seed] %s\n' "$*" >&2; }
die() { printf '[stage-seed][error] %s\n' "$*" >&2; exit 1; }

: "${SSH_KEY:?SSH_KEY is required}"
: "${VPS_USER:?VPS_USER is required}"
: "${VPS_HOST:?VPS_HOST is required}"
: "${REMOTE_DIR:?REMOTE_DIR is required}"

SEED_DB="${SEED_DB:-}"
RESET_SEED="${RESET_SEED:-false}"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
remote_sh() { ssh "${SSH_OPTS[@]}" -T "$VPS_USER@$VPS_HOST" "$@"; }
push() { scp "${SSH_OPTS[@]}" "$1" "$VPS_USER@$VPS_HOST:$2"; }

emit() {
    [[ -n "${GITHUB_OUTPUT:-}" ]] && printf '%s\n' "$1" >> "$GITHUB_OUTPUT"
    log "$1"
}

# Namespaced by the deployment dir so parallel PR deploys never race on /tmp.
STAGING="/tmp/stirling-stage-$(basename "$REMOTE_DIR")-$$"

remote_sh "mkdir -p '$REMOTE_DIR'/{config,logs,data,storage} '$STAGING'"
# Clean up on any exit path, not just the happy one - a failure part way
# through would otherwise leave the staging dir (and a copy of the database)
# behind on the VPS on every retry.
cleanup_staging() { remote_sh "rm -rf '$STAGING'" 2>/dev/null || true; }
trap cleanup_staging EXIT

# The previous container has to be down before anything here touches the
# database file. A running app holds the H2 file open and flushes its own state
# on shutdown, so replacing the file underneath it loses the seed - or corrupts
# it. The deploy step's own `docker-compose down` is then a no-op.
if remote_sh "test -f '$REMOTE_DIR/docker-compose.yml'"; then
    log "Stopping the running deployment before staging..."
    remote_sh "cd '$REMOTE_DIR' && docker-compose down --remove-orphans 2>/dev/null || true"
fi

# Must match spring.datasource.url in application.properties; the container's
# base path is / so this lands at /configs/... inside the container.
DB_NAME="stirling-pdf-DB-2.3.232.mv.db"

seed_staged=false
if [[ -n "$SEED_DB" && ! -f "$SEED_DB" ]]; then
    # Expected for PR branches cut before the seed fixtures landed - those
    # should still deploy, just with an empty database. CI boot-tests the
    # fixtures on main, so a genuine typo gets caught there instead of here.
    log "WARNING: SEED_DB '$SEED_DB' not found in this checkout - skipping seed."
    SEED_DB=""
fi

if [[ -n "$SEED_DB" ]]; then
    if [[ "$RESET_SEED" == "true" ]]; then
        should_seed=true
    elif remote_sh "test -f '$REMOTE_DIR/config/$DB_NAME'"; then
        should_seed=false
    else
        should_seed=true
    fi

    if [[ "$should_seed" == true ]]; then
        log "Seeding database from $(basename "$SEED_DB") (reset=$RESET_SEED)..."
        push "$SEED_DB" "$STAGING/$DB_NAME"
        # Drop H2's sidecar files too - a stale .trace.db or lock left next to a
        # replaced .mv.db makes H2 refuse to open the new one.
        remote_sh "rm -f '$REMOTE_DIR/config/stirling-pdf-DB-'*.mv.db \
                         '$REMOTE_DIR/config/stirling-pdf-DB-'*.trace.db \
                         '$REMOTE_DIR/config/stirling-pdf-DB-'*.lock.db; \
                   install -m 644 '$STAGING/$DB_NAME' '$REMOTE_DIR/config/$DB_NAME'"
        seed_staged=true
    else
        log "Existing database found and RESET_SEED is not true - leaving data alone."
    fi
fi
emit "seed_staged=$seed_staged"
