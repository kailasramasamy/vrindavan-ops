#!/usr/bin/env bash
# Deploy: pull, install (if needed), rebuild CSS, restart server.
# Apply pending DB migrations interactively.
#
# Usage:
#   ./scripts/deploy.sh
#
# Override the restart command by exporting RESTART_CMD before running.
# Defaults to `pm2 restart vrindavan-ops`. Examples:
#   RESTART_CMD="systemctl restart vrindavan-ops" ./scripts/deploy.sh
#   RESTART_CMD="pm2 restart all" ./scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."

RESTART_CMD="${RESTART_CMD:-pm2 restart vrindavan-ops}"
BRANCH="${BRANCH:-master}"

# Auto-detect package manager — prefer pnpm if available, fall back to npm,
# then yarn. Override with PKG_MGR=<...> if needed.
if [[ -z "${PKG_MGR:-}" ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    PKG_MGR="pnpm"
  elif command -v npm >/dev/null 2>&1; then
    PKG_MGR="npm"
  elif command -v yarn >/dev/null 2>&1; then
    PKG_MGR="yarn"
  else
    PKG_MGR=""
  fi
fi

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ─── 1. Sanity checks ─────────────────────────────────────────────────────────
log "Checking working tree…"
if ! git diff-index --quiet HEAD --; then
  warn "Local uncommitted changes detected:"
  git status --short
  read -r -p "Continue anyway? [y/N] " ok
  [[ "${ok:-}" =~ ^[Yy]$ ]] || err "Aborted."
fi

# ─── 2. Pull ──────────────────────────────────────────────────────────────────
log "Fetching origin/$BRANCH…"
git fetch origin "$BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "Already up to date ($LOCAL). Skipping pull, install, and CSS build."
  PULLED=0
else
  log "Pulling $LOCAL → $REMOTE…"
  git pull --ff-only origin "$BRANCH"
  PULLED=1
fi

# ─── 3. Install deps if package.json or lockfile changed ──────────────────────
if [[ $PULLED -eq 1 ]]; then
  if git diff "$LOCAL" "$REMOTE" --name-only | grep -qE '(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$'; then
    if [[ -n "$PKG_MGR" ]]; then
      log "package.json / lockfile changed — running $PKG_MGR install…"
      "$PKG_MGR" install
    else
      warn "Dependency changes detected but no package manager found. Install manually."
    fi
  else
    log "No dependency changes — skipping install."
  fi
fi

# ─── 4. CSS build ─────────────────────────────────────────────────────────────
log "Rebuilding CSS… (using ${PKG_MGR:-npx})"
if [[ -n "$PKG_MGR" ]]; then
  if [[ "$PKG_MGR" == "npm" ]]; then
    npm run css:build
  else
    "$PKG_MGR" css:build
  fi
else
  # Last-resort fallback — invoke tailwindcss directly via npx
  npx tailwindcss -i ./src/styles/tailwind.css -o ./public/assets/styles.css --minify
fi

# ─── 5. Pending migrations ────────────────────────────────────────────────────
log "Checking for pending migrations…"
PENDING_MIGRATIONS=()
if command -v mysql >/dev/null 2>&1; then
  if [[ -f .env ]]; then
    set -a; . ./.env; set +a
  fi
  if [[ -n "${DB_HOST:-}" && -n "${DB_USER:-}" && -n "${DB_NAME:-}" ]]; then
    # Heuristic: look at migrations/*.sql committed in the pull range and ask
    # the operator. We don't track applied migrations in a table, so this is
    # a manual confirmation step.
    if [[ $PULLED -eq 1 ]]; then
      mapfile -t PENDING_MIGRATIONS < <(git diff "$LOCAL" "$REMOTE" --name-only --diff-filter=A -- 'migrations/*.sql' 2>/dev/null || true)
    fi
    if [[ ${#PENDING_MIGRATIONS[@]} -gt 0 ]]; then
      warn "New migration files in this pull:"
      printf '  • %s\n' "${PENDING_MIGRATIONS[@]}"
      read -r -p "Apply now? [y/N] " ok
      if [[ "${ok:-}" =~ ^[Yy]$ ]]; then
        for f in "${PENDING_MIGRATIONS[@]}"; do
          log "Applying $f…"
          mysql -h "$DB_HOST" -u "$DB_USER" -p"${DB_PASS:-}" "$DB_NAME" < "$f"
        done
      else
        warn "Skipped. You'll need to apply them manually before restart."
      fi
    else
      log "No new migration files."
    fi
  else
    warn "DB env vars not set — skipping migration check. Apply migrations manually if needed."
  fi
else
  warn "mysql client not found — skipping migration check."
fi

# ─── 6. Restart ───────────────────────────────────────────────────────────────
log "Restarting server: $RESTART_CMD"
$RESTART_CMD

log "Done. Tail logs to confirm clean startup:"
echo "  pm2 logs vrindavan-ops --lines 50"
echo "  # or: journalctl -u vrindavan-ops -f"
