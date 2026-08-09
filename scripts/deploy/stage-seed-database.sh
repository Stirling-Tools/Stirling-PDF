#!/usr/bin/env bash
#
# Copies the seed H2 database onto the VPS before `docker-compose up`, so a
# preview deployment boots with teams, users and policies already present.
# Shared by the PR preview and main demo workflows.
#
# Inputs (env): SSH_KEY, VPS_USER, VPS_HOST, REMOTE_DIR (all required),
#   SEED_DB (optional path), RESET_SEED ("true" reseeds and wipes existing data).
# Outputs: appends seed_staged=true|false to $GITHUB_OUTPUT when set.

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
# Clean up on any exit path: a mid-run failure would otherwise leave a copy of
# the database on the VPS every retry.
cleanup_staging() { remote_sh "rm -rf '$STAGING'" 2>/dev/null || true; }
trap cleanup_staging EXIT

# Must stop first: a running app holds the H2 file open and flushes on shutdown,
# so swapping the file underneath it loses the seed.
if remote_sh "test -f '$REMOTE_DIR/docker-compose.yml'"; then
    log "Stopping the running deployment before staging..."
    remote_sh "cd '$REMOTE_DIR' && docker-compose down --remove-orphans 2>/dev/null || true"
fi

# Matches spring.datasource.url; the container's base path is /.
DB_NAME="stirling-pdf-DB-2.3.232.mv.db"

seed_staged=false
if [[ -n "$SEED_DB" && ! -f "$SEED_DB" ]]; then
    # Expected on PR branches cut before the fixtures landed; still deploy.
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
        # Stale .trace.db/.lock.db beside a replaced .mv.db blocks H2 opening it.
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
