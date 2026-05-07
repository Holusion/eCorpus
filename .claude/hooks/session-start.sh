#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Bootstraps the eCorpus monorepo so server tests, UI builds, and e2e can run.
# Idempotent: safe to re-run on resume / clear / compact.
set -euo pipefail

# Only run inside the remote/web container; locally the developer has their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

log() { printf '[session-start] %s\n' "$*" >&2; }

# 1. Submodules — UI build imports from source/voyager (recursive).
log "initializing git submodules"
git submodule update --init --recursive

# 2. Node deps — root postinstall recurses into every source/* package.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  log "installing npm dependencies"
  npm install --no-audit --no-fund
else
  log "node_modules up to date, skipping npm install"
fi

# 3. Playwright browsers for e2e (best-effort; some sandboxes block the CDN).
if [ -d source/e2e/node_modules ]; then
  log "installing playwright browsers (chromium)"
  (cd source/e2e && npx --yes playwright install chromium >/dev/null 2>&1) || \
    log "playwright install failed (non-fatal; e2e may be unavailable)"
fi

# 4. Postgres — server tests/e2e create real databases.
PG_PORT="${PGPORT:-5432}"
PG_USER="${PGUSER:-postgres}"
PG_PASSWORD="${PGPASSWORD:-postgres}"

if ! command -v pg_isready >/dev/null 2>&1; then
  log "installing postgresql"
  apt-get update -qq
  apt-get install -y --no-install-recommends postgresql >/dev/null
fi

if ! pg_isready -q -h localhost -p "$PG_PORT"; then
  PG_VERSION="$(ls /etc/postgresql/ 2>/dev/null | head -n1 || true)"
  if [ -n "$PG_VERSION" ]; then
    log "starting postgres cluster $PG_VERSION/main"
    pg_ctlcluster "$PG_VERSION" main start || service postgresql start || true
  else
    service postgresql start || true
  fi
  # Wait briefly for the socket to come up.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pg_isready -q -h localhost -p "$PG_PORT" && break
    sleep 1
  done
fi

# Make sure the postgres role has the password tests-common.ts expects.
sudo -u postgres psql -p "$PG_PORT" -tAc \
  "ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASSWORD}';" >/dev/null 2>&1 || \
  log "could not set postgres password (already correct?)"

# 5. Persist env vars for the rest of the session.
{
  echo "export PGHOST=localhost"
  echo "export PGPORT=${PG_PORT}"
  echo "export PGUSER=${PG_USER}"
  echo "export PGPASSWORD=${PG_PASSWORD}"
  echo "export PGDATABASE=postgres"
} >> "${CLAUDE_ENV_FILE:-/dev/null}"

log "ready: server tests, UI build, and e2e can now run"
