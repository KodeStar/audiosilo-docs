#!/usr/bin/env bash
#
# Regenerates the documentation screenshots end-to-end:
#   1. builds the AudioSilo server from the sibling repo,
#   2. seeds a small public-domain library (LibriVox; cached in .cache/library),
#   3. starts a demo-mode server (port 8790) serving the frontend's web export,
#      plus a second --setup instance (port 8791) for the wizard shot,
#   4. builds the AudioSilo Meta data artifact + site and starts a local
#      metaserve (port 8795) for the meta.audiosilo.app site captures,
#   5. runs the Playwright captures (web player + admin console + public pages
#      + the meta site),
#   6. backfills placeholders for anything not captured (e.g. the desktop
#      manager on a headless run - see README.md for manager captures).
#
# Prereqs: Go 1.26+, Node 24, ffmpeg/ffprobe, sqlite3, `npm install` +
# `npx playwright install chromium` in this directory. The web export at
# FRONTEND/dist (below) is built with audiosilo-server/scripts/build-web.sh when
# it is missing; an existing one is used as it is.
# The meta section also needs yarn (for the sibling audiosilo-meta site build)
# and the sibling audiosilo-meta-community clone, whose CC BY-SA layer
# (characters, recaps, descriptions) is composed into the data artifact exactly
# as the real release does; once its caches are warm, only remote cover images
# touch the network.
#
# Env knobs: MAX_FILES (chapter files per seeded book, default 3),
#            SKIP_SEED=1 (reuse the cached library as-is),
#            SKIP_META=1 (skip the meta site stack + its captures),
#            LISTEN_MINUTES (how long the provisioned listeners play before
#              the Activity shots, default 8 - see README.md),
#            META=<dir> (the audiosilo-meta checkout, default the sibling
#              clone - point it at a worktree to capture an unmerged branch),
#            META_COMMUNITY=<dir> (the audiosilo-meta-community checkout,
#              default the sibling clone; its data/ is composed in),
#            SKIP_ADMIN=1 (skip the admin console build + admin/public
#              captures, for a web-player-only run),
#            SERVER_BIN=<file> (a server binary built elsewhere, used as it
#              is: nothing is built into the SERVER checkout; the admin
#              console it embeds is whatever that build had, so pair it with
#              SKIP_ADMIN=1 unless it was built with one),
#            SERVER=<dir> / FRONTEND=<dir> (the audiosilo-server and
#              audiosilo-frontend checkouts, default the sibling clones - point
#              them at worktrees to capture unmerged branches; FRONTEND/dist
#              is built when missing, else used as it is, so rebuild it after a
#              frontend change; relative paths are taken from where run.sh
#              starts),
#            SHOTS_PORT / SHOTS_SETUP_PORT / SHOTS_META_PORT /
#              SHOTS_MIRROR_PORT (default 8790 / 8791 / 8795 / 8792 - move them
#              when a run in another checkout holds those ports; two runs in one
#              checkout share .cache/ and clash).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$HERE/../.." && pwd)"
# Checkouts given as relative paths are taken from where run.sh starts: make them
# absolute before any step runs from another directory (`cd "$SERVER"`, `cd "$META"`).
abspath() { case "$1" in /*) printf '%s\n' "$1" ;; *) printf '%s\n' "$PWD/$1" ;; esac; }
SERVER="$(abspath "${SERVER:-$WORKSPACE/audiosilo-server}")"
SERVER_BIN="$(abspath "${SERVER_BIN:-$SERVER/bin/audiosilo}")"
FRONTEND="$(abspath "${FRONTEND:-$WORKSPACE/audiosilo-frontend}")"
META="$(abspath "${META:-$WORKSPACE/audiosilo-meta}")"
META_COMMUNITY="$(abspath "${META_COMMUNITY:-$WORKSPACE/audiosilo-meta-community}")"
CACHE="$HERE/.cache"
LIBRARY="$CACHE/library"
DATA="$CACHE/data"
SETUP_DATA="$CACHE/setup-data"
PORT="${SHOTS_PORT:-8790}"
SETUP_PORT="${SHOTS_SETUP_PORT:-8791}"
META_PORT="${SHOTS_META_PORT:-8795}"
MIRROR_PORT="${SHOTS_MIRROR_PORT:-8792}"
MIRROR_DATA="$CACHE/mirror-data"

mkdir -p "$CACHE"

# The meta artifact composes the community layer (section 4), so check for it
# before anything slow runs rather than after the server stack is up.
if [ "${SKIP_META:-0}" != "1" ] && [ ! -d "$META_COMMUNITY/data/works-community" ]; then
  echo "no community data at $META_COMMUNITY/data/works-community"
  echo "  the meta shots need the sibling audiosilo-meta-community clone:"
  echo "  run scripts/bootstrap.sh at the workspace root (or clone"
  echo "  KodeStar/audiosilo-meta-community there), or point META_COMMUNITY"
  echo "  at a checkout - or set SKIP_META=1 to skip the meta shots."
  exit 1
fi

# ── 1. Server binary ────────────────────────────────────────────────────────
# The admin console (admin-ui) is embedded at build time and never committed,
# so build it first or /admin serves a "console not built" page.
if [ "$SERVER_BIN" != "$SERVER/bin/audiosilo" ]; then
  [ -x "$SERVER_BIN" ] || { echo "SERVER_BIN $SERVER_BIN is not an executable"; exit 1; }
  echo "==> using the prebuilt server $SERVER_BIN"
else
  echo "==> building the admin console + audiosilo-server"
  if [ "${SKIP_ADMIN:-0}" != "1" ]; then
    "$SERVER/scripts/build-admin.sh" --build-only
  fi
  (cd "$SERVER" && go build -o bin/audiosilo ./cmd/audiosilo)
fi

# ── Web export ──────────────────────────────────────────────────────────────
if [ ! -f "$FRONTEND/dist/index.html" ]; then
  echo "==> no web export found; building via scripts/build-web.sh"
  (cd "$SERVER" && FRONTEND_DIR="$FRONTEND" DEST="$FRONTEND/dist" scripts/build-web.sh)
fi

# ── 2. Seed library (idempotent; ~8 short-capped books) ────────────────────
if [ "${SKIP_SEED:-0}" != "1" ]; then
  echo "==> seeding library into $LIBRARY (MAX_FILES=${MAX_FILES:-3})"
  MAX_FILES="${MAX_FILES:-3}" bash "$SERVER/scripts/seed-librivox.sh" "$LIBRARY" \
    alice_in_wonderland_librivox looking-glass_librivox \
    adventures_sherlock_holmes_rg_librivox hound_baskervilles_librivox \
    callofthewild_tc_1010_librivox scarlet_plague_0907_librivox \
    christmas_carol_1111_librivox art_of_war_librivox
fi

# ── 3. Servers ──────────────────────────────────────────────────────────────
cleanup() {
  [ -n "${MAIN_PID:-}" ] && kill "$MAIN_PID" 2>/dev/null || true
  [ -n "${SETUP_PID:-}" ] && kill "$SETUP_PID" 2>/dev/null || true
  [ -n "${META_PID:-}" ] && kill "$META_PID" 2>/dev/null || true
  [ -n "${MIRROR_PID:-}" ] && kill "$MIRROR_PID" 2>/dev/null || true
  rm -rf "$MIRROR_DATA"
}
trap cleanup EXIT

# The first-run admin password a server printed to <log> ("" when it didn't).
admin_password() { # <log>
  grep 'Admin password' "$1" | awk -F': ' '{print $2}' | tr -d ' ' || true
}

# Whether SHOTS_ONLY (see lib.mjs) keeps <file>: unset keeps everything, else
# one of its comma-separated prefixes must start the path.
shot_wanted() { # <file>
  [ -z "${SHOTS_ONLY:-}" ] && return 0
  local p
  for p in ${SHOTS_ONLY//,/ }; do
    case "$1" in "$p"*) return 0 ;; esac
  done
  return 1
}

wait_healthy() { # <url> <logfile> <name>
  for i in $(seq 1 60); do
    curl -fsS "$1" >/dev/null 2>&1 && return 0
    [ "$i" = 60 ] && { echo "$3 never became healthy; see $2"; exit 1; }
    sleep 1
  done
}

echo "==> starting demo server on :$PORT (fresh data dir)"
rm -rf "$DATA" && mkdir -p "$DATA"
cat > "$DATA/config.yaml" <<EOF
bind: "127.0.0.1:$PORT"
tls:
  mode: "off"
libraries:
  - name: "Books"
    root: "$LIBRARY"
demo:
  enabled: true
  library: "Books"
  idle_ttl: "24h"
EOF
AUDIOSILO_WEB_DIR="$FRONTEND/dist" "$SERVER_BIN" --data "$DATA" \
  > "$CACHE/server.log" 2>&1 &
MAIN_PID=$!

# The --setup instance only serves the admin captures' wizard shot.
if [ "${SKIP_ADMIN:-0}" != "1" ]; then
  echo "==> starting --setup server on :$SETUP_PORT"
  rm -rf "$SETUP_DATA" && mkdir -p "$SETUP_DATA"
  AUDIOSILO_BIND="127.0.0.1:$SETUP_PORT" AUDIOSILO_TLS_MODE=off \
    "$SERVER_BIN" --setup --data "$SETUP_DATA" \
    > "$CACHE/setup.log" 2>&1 &
  SETUP_PID=$!
fi

echo "==> waiting for the demo server"
wait_healthy "http://127.0.0.1:$PORT/healthz" "$CACHE/server.log" "server"
sleep 8   # let the startup scan index the seeded books

ADMIN_PASSWORD="$(admin_password "$CACHE/server.log")"
if [ -z "$ADMIN_PASSWORD" ]; then
  echo "could not parse admin password from $CACHE/server.log"; exit 1
fi
SETUP_URL=""
if [ "${SKIP_ADMIN:-0}" != "1" ]; then
  SETUP_URL="$(grep -o "http://[^ ]*/setup#token=[^ ]*" "$CACHE/setup.log" | head -1 || true)"
fi

# ── 4. AudioSilo Meta site (data artifact + site build + metaserve) ─────────
if [ "${SKIP_META:-0}" != "1" ]; then
  # The artifact is the COMPOSED one, as every data release is since the
  # community split: the CC0 core from audiosilo-meta plus the CC BY-SA layer
  # from audiosilo-meta-community. A core-only build has no characters, recaps
  # or descriptions, so the home counters and contribute totals read 0 and the
  # work page has no Characters tab. (Its presence is checked up front.)
  echo "==> building the meta data artifact (core + community)"
  (cd "$META" && go run ./cmd/metabuild -data data \
    --community "$META_COMMUNITY/data" -o "$CACHE/meta.sqlite")

  # A third server in metadata mirror mode, for the admin/system-mirror.png
  # shot. Its local copy is seeded with the artifact just built (a hard link
  # where it can be) and a state.json saying it was downloaded and checked just
  # now, so the mirror opens it and its next check is a day away: nothing is
  # downloaded. No library, no update check. Started now so the copy opens
  # (seconds: query.Open reads all of it) while metaserve starts.
  if [ "${SKIP_ADMIN:-0}" != "1" ] && shot_wanted admin/system-mirror.png; then
    echo "==> starting a mirror-mode server on :$MIRROR_PORT (seeded local copy)"
    rm -rf "$MIRROR_DATA" && mkdir -p "$MIRROR_DATA/meta-mirror"
    MIRROR_TAG="data-v$(date -u +%Y.%m.%d)-$(git -C "$META" rev-parse --short=7 HEAD)-$(git -C "$META_COMMUNITY" rev-parse --short=7 HEAD)"
    ln "$CACHE/meta.sqlite" "$MIRROR_DATA/meta-mirror/meta-$MIRROR_TAG.sqlite" 2>/dev/null \
      || cp "$CACHE/meta.sqlite" "$MIRROR_DATA/meta-mirror/meta-$MIRROR_TAG.sqlite"
    node -e '
      const [file, tag] = process.argv.slice(1);
      const now = new Date().toISOString(); // after the artifact was built, as a real copy is
      require("node:fs").writeFileSync(file, JSON.stringify({tag, downloaded_at: now, checked_at: now}));
    ' "$MIRROR_DATA/meta-mirror/state.json" "$MIRROR_TAG"
    AUDIOSILO_BIND="127.0.0.1:$MIRROR_PORT" AUDIOSILO_TLS_MODE=off \
      AUDIOSILO_UPDATE_CHECK=false AUDIOSILO_METADATA_MODE=mirror \
      "$SERVER_BIN" --data "$MIRROR_DATA" > "$CACHE/mirror.log" 2>&1 &
    MIRROR_PID=$!
  fi

  if [ ! -f "$META/site/dist/index.html" ]; then
    echo "==> no meta site build found; building (yarn, Node 24)"
    (cd "$META/site" && yarn install --frozen-lockfile && yarn build)
  fi

  echo "==> starting metaserve on :$META_PORT"
  (cd "$META" && go build -o bin/metaserve ./cmd/metaserve)
  "$META/bin/metaserve" --db "$CACHE/meta.sqlite" \
    --site "$META/site/dist" --addr "127.0.0.1:$META_PORT" \
    > "$CACHE/metaserve.log" 2>&1 &
  META_PID=$!

  echo "==> waiting for metaserve"
  wait_healthy "http://127.0.0.1:$META_PORT/healthz" "$CACHE/metaserve.log" "metaserve"

  if [ -n "${MIRROR_PID:-}" ]; then
    echo "==> waiting for the mirror-mode server"
    wait_healthy "http://127.0.0.1:$MIRROR_PORT/healthz" "$CACHE/mirror.log" "mirror-mode server"
    # A seeded copy it refused would be replaced by a real download (about
    # 450 MB, 1.8 GB on disk) half a minute after start: stop the server and
    # skip the shot instead.
    if grep -q "the local copy can't be used" "$CACHE/mirror.log"; then
      echo "  ! the mirror-mode server refused the seeded copy (see $CACHE/mirror.log); skipping admin/system-mirror.png"
      kill "$MIRROR_PID" 2>/dev/null || true
      MIRROR_PID=""
    else
      MIRROR_PASSWORD="$(admin_password "$CACHE/mirror.log")"
    fi
  fi
fi

# ── 5. Captures ─────────────────────────────────────────────────────────────
cd "$HERE"
echo "==> capturing web player"
AS_BASE="http://127.0.0.1:$PORT/web/" ADMIN_PASSWORD="$ADMIN_PASSWORD" node capture-web.mjs

if [ "${SKIP_ADMIN:-0}" != "1" ]; then
  echo "==> capturing admin console + public pages"
  AS_ORIGIN="http://127.0.0.1:$PORT" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    SETUP_URL="$SETUP_URL" \
    MIRROR_ORIGIN="${MIRROR_PASSWORD:+http://127.0.0.1:$MIRROR_PORT}" \
    MIRROR_PASSWORD="${MIRROR_PASSWORD:-}" node capture-admin.mjs
fi

if [ "${SKIP_META:-0}" != "1" ]; then
  echo "==> capturing the meta site"
  META_BASE="http://127.0.0.1:$META_PORT" node capture-meta.mjs
fi

# ── 6. Backfill placeholders for anything missing ──────────────────────────
echo "==> backfilling placeholders"
node placeholders.mjs

echo "Done. Screenshots are in static/img/screenshots/."
