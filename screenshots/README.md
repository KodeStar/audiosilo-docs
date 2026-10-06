# Documentation screenshots

Every image the docs embed lives in `../static/img/screenshots/` and is listed
in [`manifest.mjs`](manifest.mjs) - that file is the single source of truth.
Doc pages may only reference images that appear in the manifest, and the
pipeline guarantees every manifest entry exists (a real capture, or a styled
placeholder so the site build never breaks).

## Regenerate everything

```sh
cd screenshots
npm install && npx playwright install chromium   # first time only
./run.sh
```

`run.sh` builds the sibling `audiosilo-server`, seeds a small public-domain
LibriVox library (cached in `.cache/library`; `MAX_FILES=3` chapter files per
book keeps it ~100 MB), starts a demo-mode server on `:8790` serving the
frontend's web export (plus a `--setup` instance on `:8791` for the wizard
shot), builds the `audiosilo-meta` data artifact (composed with
`audiosilo-meta-community`) + site and starts a `metaserve` on `:8795` for the
meta-site shots, then runs the Playwright captures and backfills placeholders.
`SKIP_META=1` skips the meta stack (for a web/admin-only run).
`SHOTS_ONLY=<prefix>` writes only the screenshots whose path starts with it
(e.g. `SHOTS_ONLY=admin/`), so adding a few shots doesn't re-encode every
other committed PNG. It takes a comma-separated list too
(`SHOTS_ONLY=admin/activity,admin/people.png`).

`run.sh` builds the server's admin console (`admin-ui`) first, because its
output is embedded in the binary, never committed. `capture-admin.mjs` signs in
through the console's own login form and drives it with role/label selectors
that use the exact English labels from the server's
`admin-ui/src/i18n/locales/en.json`, so a renamed button or field there needs
the same rename in the script (a failed step is logged and its shot falls back
to the previous image or a placeholder).

Two admin shots depend on the server's community metadata lookup, which the
demo server leaves at its default (`https://meta.audiosilo.app`, so it needs
the network): `admin/book-match.png` shows the match dialog's candidates, and
`admin/series.png` shows series gaps only for books the live catalogue
matches. Offline, the match shot captures the dialog's "isn't answering"
message instead and the series cards show no gaps.

The Health shots (`admin/health-*.png`) need issues to show, and the seeded
library has almost none. After the other admin shots, `capture-admin.mjs`
builds a small **Inbox** library under `.cache/inbox` (`INBOX_DIR` overrides)
with one of each issue - two copies of a seeded book, an empty file, a damaged
m4b, a folder of two hour-long books, a long book without chapters and an ALAC
file (the generated audio is silence, made with **ffmpeg**) - and adds it
through the API with a daily schedule and skip rules, which
`admin/library-edit.png` then shows. It runs last so the Books screens keep
showing only the seeded library; the seeded files are only read.

The Backups and Notifications shots (`admin/settings-backups.png`,
`admin/backup-restore.png`, `admin/settings-notifications.png`,
`admin/bell.png`) need state too. `capture-admin.mjs` makes a manual backup and
sets the schedule to two minutes ahead, so a scheduled backup is made while the
other shots run, then puts the schedule back to `daily:03:00` before the System
and Backups shots. The restore dialog is captured with the word typed but never
confirmed. It adds two notification destinations: a webhook to a small receiver
the script runs on `127.0.0.1` (it checks the `X-AudioSilo-Signature` of every
request and fails the "webhook deliveries" step if one doesn't verify), and an
ntfy topic at a TEST-NET address (`192.0.2.20`, never assigned), whose
deliveries time out so the list shows a failure. No message reaches anything
outside this machine.

The Activity shots (`admin/activity*.png`, `admin/devices.png`,
`admin/person-listening.png`) need real listening sessions, and the server
only derives those from progress saves as they happen: a device's listened time
is its position advance, capped by the server's clock between two saves, so it
can't be faked faster than real time. `capture-admin.mjs` therefore signs three
listeners in with a password (maya, theo and nora, each naming a different app
build in `X-AudioSilo-Client`), saves each one's progress twice 15 s apart
before the first shot (so the overview and the people cards show them live),
and keeps saving every 15 s in the background. Theo's device fetches a
`?transcode=1` stream first (so his session counts as transcoded) and has an
unused personal API key; nora stops 90 s before the Activity shots, so Live now
shows her as paused. The Activity screens are captured last, once
`LISTEN_MINUTES` (default 8) have passed since the listeners started, so the
charts and totals have twenty-odd minutes of listening to show rather than a
sliver. That
wait is most of an admin run's length; a smaller value is fine for checking the
script.

The web player's browse shots need state the seeded library doesn't carry.
Before warming the demo session, `capture-web.mjs` signs in as the admin
(`run.sh` passes `ADMIN_PASSWORD`), sets **series overrides** on four seeded
books - Sherlock Holmes 3 and 5 (so the series page shows the missing numbers
as gaps) and Alice 1 and 2 - and signs that session out again so it never shows
in the admin Devices shot. These are ordinary admin metadata edits, so they
also appear in the admin Books, Series and Audit log shots of the same run.
After warming, it gives the demo user an **Up next** queue of three books and a
**"Victorian evenings"** collection through the API, using the token the web
player keeps in `localStorage`. Every desktop capture context starts with the Up
next drawer closed (an init script writes `audiosilo.upNext`), so only
`web-player/up-next.png` shows it; `web-player/downloads.png` downloads one
short book first. The series, Up next and collection shots need a server with
the `browse_people`, `queue` and `collections` capabilities.

`SHOTS_PORT`, `SHOTS_SETUP_PORT` and `SHOTS_META_PORT` move the three servers
off 8790 / 8791 / 8795 when another run already holds them.

Every capture is optimized in place with **pngquant** (`brew install pngquant`)
- a lossy-palette pass that shrinks the retina PNGs ~60% with no perceptible
loss, so the committed image is the optimized one. It's optional: if pngquant
isn't on `PATH` the shots are just left raw (with a one-time warning).

Prereqs: Go 1.26+, Node 24 (also builds the server's admin console), ffmpeg/ffprobe, pngquant (optional; for image
optimization), and a web export at `../../audiosilo-frontend/dist`
(`audiosilo-server/scripts/build-web.sh` builds one; `run.sh` triggers it
automatically when missing).

## Adding a screenshot

1. Add an entry to `manifest.mjs` (file path, title, hint, capture group).
2. Teach the matching `capture-*.mjs` script to take it (or leave it to the
   placeholder generator if it can't be automated yet).
3. Reference it from the doc page as `![alt](/img/screenshots/<file>)`.
4. Run `./run.sh` (or at minimum `node placeholders.mjs`) so the file exists -
   the Docusaurus build fails on missing images by design.

## Desktop manager captures

The Wails manager can't be captured headlessly in CI, and its screens need a
signed-in Audible account and configured servers to look real. Capture it
semi-manually instead:

1. `cd ../../audiosilo-manager && wails dev` (or run a built app).
2. Arrange each screen listed under `manager/` in `manifest.mjs`
   (a dev/dummy server is fine; avoid real credentials/emails in frame).
3. Screenshot the window (macOS: `⌘⇧4` + space, or
   `screencapture -l <windowid>`) at ~1440×900, dark mode.
4. Save over the placeholder in `../static/img/screenshots/manager/` using the
   exact manifest filename.

Anything not replaced stays a labelled placeholder - visible in the docs as
"regenerate me", never a broken image.

## AudioSilo Meta site captures

The `meta/` shots come from `capture-meta.mjs`, which drives the
meta.audiosilo.app site (the sibling `audiosilo-meta` repo: an Astro static
site served same-origin by the Go `metaserve` together with its read-only
`/api/v1` JSON). `run.sh` handles it end-to-end: it builds the data artifact
(`metabuild` into `.cache/meta.sqlite`), builds the site once if
`audiosilo-meta/site/dist` is missing, and starts `metaserve` on `:8795`.

The artifact is the **composed** one, exactly as every data release is since
the community split: `metabuild -data data --community
"$META_COMMUNITY/data"`, the CC0 core from `audiosilo-meta` plus the CC BY-SA
layer (characters, recaps, descriptions) from the sibling
`audiosilo-meta-community` clone. A core-only build has none of that layer, so
the home page's community counters and the contribute page's coverage totals
read 0 and the work page has no Characters tab - which is why `run.sh` refuses
to start (before anything slow) when `$META_COMMUNITY/data/works-community` is
missing, and says to run the workspace's `scripts/bootstrap.sh` or clone the
repo. Two env knobs point the meta stack elsewhere: `META` (default the sibling
`audiosilo-meta`; a worktree captures an unmerged branch) and `META_COMMUNITY`
(default the sibling `audiosilo-meta-community`).
Because the site build is reused while it exists, **delete
`audiosilo-meta/site/dist` after changing the meta site's UI** so the next run
rebuilds it - otherwise the shots silently show the old UI.

Needs: Go 1.26+, the `audiosilo-meta-community` clone, and (only for the site
build) yarn + Node 24. After the caches
are warm (node_modules, Go modules, `site/dist`), a run only touches the network
for remote cover images - and the capture waits on rendered content, not on
covers, so missing cover art never fails a shot.

`capture-meta.mjs` is standalone: point `META_BASE` at any `metaserve` (or the
live site) and run `META_BASE=http://127.0.0.1:8795 node capture-meta.mjs` - it
needs no other services (the /import fixture is vendored in `fixtures/`).

The two watchlist shots (`meta/series-watching.png`, `meta/watching.png`) need a
site build that has the `/watching` page in it, and they run as a **pair**: the
series step presses **Watch this series** and ticks two volumes, and the
`/watching` step reads the marks that left in `localStorage` (same browser
context, same origin). Nothing else is seeded, so the catalogue behind
`META_BASE` must hold the series `capture-meta.mjs` names (`SERIES_ID`) with
more than two volumes in it. A **Preorder** group appears only when some
recording of a member work carries a future `release_date`; without one the shot
is still valid, it simply has no preorder section.

The language shots (`meta/languages.png`, `meta/language-prompt.png`,
`meta/language-search.png`) need a site build with the header **Languages**
selector and an artifact whose `/api/v1/stats` lists more than one language.
The selector shot opens the list in the shared context (opening it stores
nothing). The other two run in a **fresh `de-DE` context** with empty
`localStorage`, the one state the "Show only Deutsch audiobooks?" line appears
in; the search shot then answers it with **Only Deutsch**, so that choice never
reaches the other shots.

## The store/marketing pipeline is separate

`~/dev/audiosilo/store/tools` + `SCREENSHOTS.md` produce the app-store and
marketing-site assets (device frames, captions, icons). The two pipelines share
the same technique (demo-mode server + Playwright + the `Audio` constructor
hook for warming progress) but different outputs - a UI change usually means
running both.
