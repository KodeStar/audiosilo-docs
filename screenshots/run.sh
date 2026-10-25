#!/usr/bin/env bash
#
# Regenerates the documentation screenshots end-to-end:
#   1. builds the AudioSilo server from the sibling repo,
#   2. seeds a small public-domain library (LibriVox; cached in .cache/library),
#      the generated files of one book (2b) and three made-up podcast shows
#      (2c, .cache/podcasts: feed.json, cover and short silent episodes, two
#      of them left off the server; capture-web.mjs adds it as a podcast
#      library for its podcast shots and removes it again),
#   3. starts a demo-mode server (port 8790) serving the frontend's web export,
#      plus a second --setup instance (port 8791) for the first-run setup shots
#      (the --setup page and the console's "Set up your server" flow),
#   4. builds the AudioSilo Meta data artifact + site and starts a local
#      metaserve (port 8795) for the meta.audiosilo.app site captures,
#   5. runs the Playwright captures (web player + admin console + public pages
#      + the first-run setup flow + the meta site), and starts a real Bridge
#      (from the BRIDGE checkout, when there is one) for its own page's shots,
#   6. backfills placeholders for anything not captured.
#
# Prereqs: Go 1.26+, Node 24, ffmpeg/ffprobe, sqlite3, openssl, `npm install` +
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
#            BRIDGE=<dir> (the audiosilo-bridge checkout, default the sibling
#              clone; without it the Bridge page shots keep
#              their previous images), SKIP_BRIDGE=1 (skip them anyway),
#            BRIDGE_VERSION (the version the Bridge page shows, default the
#              checkout's git describe; set the release's, e.g. 0.3.0),
#            SHOTS_PORT / SHOTS_SETUP_PORT / SHOTS_META_PORT /
#              SHOTS_MIRROR_PORT / SHOTS_BRIDGE_PORT (default 8790 / 8791 / 8795 /
#              8792 / 8793 - move them
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
BRIDGE="$(abspath "${BRIDGE:-$WORKSPACE/audiosilo-bridge}")"
CACHE="$HERE/.cache"
LIBRARY="$CACHE/library"
DATA="$CACHE/data"
SETUP_DATA="$CACHE/setup-data"
PORT="${SHOTS_PORT:-8790}"
SETUP_PORT="${SHOTS_SETUP_PORT:-8791}"
META_PORT="${SHOTS_META_PORT:-8795}"
MIRROR_PORT="${SHOTS_MIRROR_PORT:-8792}"
BRIDGE_PORT="${SHOTS_BRIDGE_PORT:-8793}"
BRIDGE_DATA="$CACHE/bridge-data"
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

# ── 2b. Generated content (Bridge Phases 1a, 1c and 1e) ────────────────────
# One seeded book gets the files a Bridge leaves when it generates characters
# and recaps (sidecars.generate, which writes a description too):
# .audiosilo/characters.json and recaps.json (audiosilo-meta's model.Characters
# and model.Recaps, own words, fixtures/), description.json (an own-words,
# spoiler-free model.Description) and the bridge.json such a run writes (dated
# two days ago), for admin/book-description.png, admin/book-story*.png and
# web-player/book-about-generated.png. The Call of the Wild: no other shot shows
# its About, its Community card or its tabs, and its files describe nothing
# themselves, so the player's About falls through to the generated one. Written
# on every run (the cached library may predate it); the server only reads it.
GEN_BOOK="$LIBRARY/Jack London/The Call of the Wild"
if [ -d "$GEN_BOOK" ]; then
  mkdir -p "$GEN_BOOK/.audiosilo"
  for part in description characters recaps; do
    cp "$HERE/fixtures/call-of-the-wild.$part.json" "$GEN_BOOK/.audiosilo/$part.json"
  done
  node -e '
    const at = new Date(Date.now() - 2 * 86400e3).toISOString().replace(/\.\d+Z$/, "Z");
    const prov = {
      generator: "audiosilo-bridge", version: "0.2.0", kind: "sidecars.generate", job_id: 7,
      generated_at: at, source: "audio", work_id: "the-call-of-the-wild", inputs: [],
      description: {job_id: 7, generated_at: at, from: "opening_notes", chapters: 2, checked_against: "transcripts"},
    };
    require("node:fs").writeFileSync(process.argv[1], JSON.stringify(prov, null, 2) + "\n");
  ' "$GEN_BOOK/.audiosilo/bridge.json"
else
  echo "  ! no $GEN_BOOK: the generated content shots will fail"
fi

# ── 2c. Podcast shows (Bridge Phase 2d-1) ─────────────────────────────────
# The web player's podcast shots (web-player/library-shows.png, podcast-show.png,
# home-new-episodes.png, episode-fetching.png, phone-podcast-show.png) need a
# podcast library, which is only ever written by a Bridge. No Bridge runs here:
# seed-podcasts.mjs writes what one leaves in a podcast library root from
# fixtures/podcasts.json (own words, made-up shows): per show a feed.json (v1),
# a cover.jpg and a short silent mp3 per episode with its fetch pin read from
# that file, dated back from now (so the newest episodes are always within
# Home's 14 days). Two episodes (the serial's newest and the daily show's) have
# no file and no pin, so they are not on the server and playing one asks for a
# fetch. Rebuilt on every run (ffmpeg/ffprobe); the server only reads it.
# capture-web.mjs adds it as a podcast library through the admin API (and
# deletes it again before any other shot could show it).
PODCASTS="$CACHE/podcasts"
echo "==> seeding podcast shows into $PODCASTS"
(cd "$HERE" && node seed-podcasts.mjs "$PODCASTS") \
  || echo "  ! the podcast seed failed: the podcast shots will fail"

# ── 3. Servers ──────────────────────────────────────────────────────────────
cleanup() {
  [ -n "${MAIN_PID:-}" ] && kill "$MAIN_PID" 2>/dev/null || true
  [ -n "${SETUP_PID:-}" ] && kill "$SETUP_PID" 2>/dev/null || true
  [ -n "${META_PID:-}" ] && kill "$META_PID" 2>/dev/null || true
  [ -n "${BRIDGE_PID:-}" ] && kill "$BRIDGE_PID" 2>/dev/null || true
  # Stopped before its folder goes, so nothing writes there meanwhile.
  [ -n "${MIRROR_PID:-}" ] && { kill "$MIRROR_PID" 2>/dev/null; wait "$MIRROR_PID" 2>/dev/null; } || true
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

# Whether SHOTS_ONLY keeps any shot the manifest gives to capture <name> (setup, bridge).
capture_wanted() { # <name>
  (cd "$HERE" && CAPTURE="$1" node --input-type=module -e '
    import {SHOTS} from "./manifest.mjs";
    import {wanted} from "./lib.mjs";
    process.exit(wanted(...SHOTS.filter((s) => s.capture === process.env.CAPTURE).map((s) => s.file)) ? 0 : 1);
  ')
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

# The --setup instance serves capture-setup.mjs: the --setup page, then the
# console's first-run flow (with the web player, so its phone step offers it).
# It starts only when a setup shot is wanted.
WANT_SETUP=0
if [ "${SKIP_ADMIN:-0}" != "1" ] && capture_wanted setup; then
  WANT_SETUP=1
fi
if [ "$WANT_SETUP" = 1 ]; then
  echo "==> starting --setup server on :$SETUP_PORT"
  rm -rf "$SETUP_DATA" && mkdir -p "$SETUP_DATA"
  AUDIOSILO_BIND="127.0.0.1:$SETUP_PORT" AUDIOSILO_TLS_MODE=off \
    AUDIOSILO_WEB_DIR="$FRONTEND/dist" \
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
if [ "$WANT_SETUP" = 1 ]; then
  # Healthy before its log is read: the setup URL is printed as it starts, and
  # capture-setup.mjs opens it at once.
  echo "==> waiting for the --setup server"
  wait_healthy "http://127.0.0.1:$SETUP_PORT/healthz" "$CACHE/setup.log" "--setup server"
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
  # downloaded. No library, no update check, and its HTTPS goes to a proxy on a
  # closed port, so even a copy it refused (in the background, after it is
  # healthy) can't be replaced by a real download. Started now so the copy opens
  # (seconds: query.Open reads all of it) while metaserve starts.
  if [ "${SKIP_ADMIN:-0}" != "1" ] && shot_wanted admin/system-mirror.png; then
    echo "==> starting a mirror-mode server on :$MIRROR_PORT (seeded local copy)"
    rm -rf "$MIRROR_DATA" && mkdir -p "$MIRROR_DATA/meta-mirror"
    MIRROR_TAG="data-v$(date -u +%Y.%m.%d)-$(git -C "$META" rev-parse --short=7 HEAD 2>/dev/null || echo local)-$(git -C "$META_COMMUNITY" rev-parse --short=7 HEAD 2>/dev/null || echo local)"
    ln "$CACHE/meta.sqlite" "$MIRROR_DATA/meta-mirror/meta-$MIRROR_TAG.sqlite" 2>/dev/null \
      || cp "$CACHE/meta.sqlite" "$MIRROR_DATA/meta-mirror/meta-$MIRROR_TAG.sqlite"
    node -e '
      const [file, tag] = process.argv.slice(1);
      const now = new Date().toISOString(); // after the artifact was built, as a real copy is
      require("node:fs").writeFileSync(file, JSON.stringify({tag, downloaded_at: now, checked_at: now}));
    ' "$MIRROR_DATA/meta-mirror/state.json" "$MIRROR_TAG"
    AUDIOSILO_BIND="127.0.0.1:$MIRROR_PORT" AUDIOSILO_TLS_MODE=off \
      AUDIOSILO_UPDATE_CHECK=false AUDIOSILO_METADATA_MODE=mirror \
      HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 \
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
    # A seeded copy it refused already by now (the copy opens in the
    # background, so a later refusal is capture-admin.mjs's to catch): stop the
    # server and skip the shot.
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
AS_BASE="http://127.0.0.1:$PORT/web/" ADMIN_PASSWORD="$ADMIN_PASSWORD" PODCASTS_DIR="$PODCASTS" \
  node capture-web.mjs

if [ "${SKIP_ADMIN:-0}" != "1" ]; then
  echo "==> capturing admin console + public pages"
  AS_ORIGIN="http://127.0.0.1:$PORT" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    MIRROR_ORIGIN="${MIRROR_PASSWORD:+http://127.0.0.1:$MIRROR_PORT}" \
    MIRROR_PASSWORD="${MIRROR_PASSWORD:-}" WEB_DIR="$FRONTEND/dist" node capture-admin.mjs

  echo "==> capturing the first-run setup flow"
  if [ "$WANT_SETUP" != 1 ]; then
    echo "  no setup shots wanted, skipped."
  elif [ -n "$SETUP_URL" ]; then
    SETUP_URL="$SETUP_URL" WEB_DIR="$FRONTEND/dist" node capture-setup.mjs
  else
    echo "  ! no setup URL in $CACHE/setup.log: the setup shots keep their previous images"
  fi
fi

# The Bridge's own page: a real Bridge, built with its page embedded, on a fresh
# data dir, paired with the demo server by capture-bridge.mjs (see its header).
if [ "${SKIP_BRIDGE:-0}" != "1" ] && capture_wanted bridge; then
  echo "==> capturing the Bridge's page"
  if [ ! -x "$BRIDGE/scripts/build-web.sh" ]; then
    echo "  ! no audiosilo-bridge checkout at $BRIDGE: the Bridge shots keep their previous images"
  else
    # Its page synced into the checkout (built, never committed), the binary into
    # .cache, stamped with BRIDGE_VERSION (default: git describe, no leading v).
    BRIDGE_VERSION="${BRIDGE_VERSION:-$(git -C "$BRIDGE" describe --tags --always 2>/dev/null | sed 's/^v//')}"
    (cd "$BRIDGE" && scripts/build-web.sh --sync-only \
        && go build -tags embedui -ldflags "-X main.version=${BRIDGE_VERSION:-dev}" \
          -o "$CACHE/audiosilo-bridge" ./cmd/audiosilo-bridge) > "$CACHE/bridge-build.log" 2>&1 \
      || { echo "  ! the Bridge build failed (see $CACHE/bridge-build.log)"; exit 1; }
    rm -rf "$BRIDGE_DATA" "$CACHE/bridge-home" && mkdir -p "$BRIDGE_DATA" "$CACHE/bridge-home"
    # As in a fresh container: none of this machine's tools on PATH (no gh sign-in,
    # no local speech recognition) and a HOME of its own.
    env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$CACHE/bridge-home" \
      "$CACHE/audiosilo-bridge" serve --data "$BRIDGE_DATA" --listen "127.0.0.1:$BRIDGE_PORT" \
      > "$CACHE/bridge.log" 2>&1 &
    BRIDGE_PID=$!
    wait_healthy "http://127.0.0.1:$BRIDGE_PORT/api/health" "$CACHE/bridge.log" "Bridge"
    BRIDGE_PASSWORD="$(grep "The password for the Bridge's page is:" "$CACHE/bridge.log" | awk -F': ' '{print $2}' | tr -d ' ' || true)"
    if [ -z "$BRIDGE_PASSWORD" ]; then
      echo "  ! no one-time password in $CACHE/bridge.log: the Bridge shots keep their previous images"
    else
      BRIDGE_BASE="http://127.0.0.1:$BRIDGE_PORT/" BRIDGE_PASSWORD="$BRIDGE_PASSWORD" \
        AS_ORIGIN="http://127.0.0.1:$PORT" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
        node capture-bridge.mjs
    fi
    kill "$BRIDGE_PID" 2>/dev/null || true
    BRIDGE_PID=""
  fi
fi

if [ "${SKIP_META:-0}" != "1" ]; then
  echo "==> capturing the meta site"
  META_BASE="http://127.0.0.1:$META_PORT" node capture-meta.mjs
fi

# ── 6. Backfill placeholders for anything missing ──────────────────────────
echo "==> backfilling placeholders"
node placeholders.mjs

echo "Done. Screenshots are in static/img/screenshots/."
