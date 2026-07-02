#!/usr/bin/env bash
#
# Regenerates the documentation screenshots end-to-end:
#   1. builds the AudioSilo server from the sibling repo,
#   2. seeds a small public-domain library (LibriVox; cached in .cache/library),
#   3. starts a demo-mode server (port 8790) serving the frontend's web export,
#      plus a second --setup instance (port 8791) for the wizard shot,
#   4. runs the Playwright captures (web player + admin console + public pages),
#   5. backfills placeholders for anything not captured (e.g. the desktop
#      manager on a headless run - see README.md for manager captures).
#
# Prereqs: Go 1.25+, Node 24, ffmpeg/ffprobe, `npm install` +
# `npx playwright install chromium` in this directory, and a web export at
# ../audiosilo-frontend/dist (run audiosilo-server/scripts/build-web.sh once).
#
# Env knobs: MAX_FILES (chapter files per seeded book, default 3),
#            SKIP_SEED=1 (reuse the cached library as-is).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$HERE/../.." && pwd)"
SERVER="$WORKSPACE/audiosilo-server"
FRONTEND="$WORKSPACE/audiosilo-frontend"
CACHE="$HERE/.cache"
LIBRARY="$CACHE/library"
DATA="$CACHE/data"
SETUP_DATA="$CACHE/setup-data"
PORT=8790
SETUP_PORT=8791

mkdir -p "$CACHE"

# ── 1. Server binary ────────────────────────────────────────────────────────
echo "==> building audiosilo-server"
(cd "$SERVER" && go build -o bin/audiosilo ./cmd/audiosilo)

# ── Web export ──────────────────────────────────────────────────────────────
if [ ! -f "$FRONTEND/dist/index.html" ]; then
  echo "==> no web export found; building via scripts/build-web.sh"
  (cd "$SERVER" && scripts/build-web.sh)
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
}
trap cleanup EXIT

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
AUDIOSILO_WEB_DIR="$FRONTEND/dist" "$SERVER/bin/audiosilo" --data "$DATA" \
  > "$CACHE/server.log" 2>&1 &
MAIN_PID=$!

echo "==> starting --setup server on :$SETUP_PORT"
rm -rf "$SETUP_DATA" && mkdir -p "$SETUP_DATA"
AUDIOSILO_BIND="127.0.0.1:$SETUP_PORT" AUDIOSILO_TLS_MODE=off \
  "$SERVER/bin/audiosilo" --setup --data "$SETUP_DATA" \
  > "$CACHE/setup.log" 2>&1 &
SETUP_PID=$!

echo "==> waiting for the demo server"
for i in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
  [ "$i" = 60 ] && { echo "server never became healthy; see $CACHE/server.log"; exit 1; }
  sleep 1
done
sleep 8   # let the startup scan index the seeded books

ADMIN_PASSWORD="$(grep 'Admin password' "$CACHE/server.log" | awk -F': ' '{print $2}' | tr -d ' ')"
if [ -z "$ADMIN_PASSWORD" ]; then
  echo "could not parse admin password from $CACHE/server.log"; exit 1
fi
SETUP_URL="$(grep -o "http://[^ ]*/setup#token=[^ ]*" "$CACHE/setup.log" | head -1 || true)"

# ── 4. Captures ─────────────────────────────────────────────────────────────
cd "$HERE"
echo "==> capturing web player"
AS_BASE="http://127.0.0.1:$PORT/web/" node capture-web.mjs

echo "==> capturing admin console + public pages"
AS_ORIGIN="http://127.0.0.1:$PORT" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  SETUP_URL="$SETUP_URL" node capture-admin.mjs

# ── 5. Backfill placeholders for anything missing ──────────────────────────
echo "==> backfilling placeholders"
node placeholders.mjs

echo "Done. Screenshots are in static/img/screenshots/."
