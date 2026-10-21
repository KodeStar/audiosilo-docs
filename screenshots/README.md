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
frontend's web export (plus a `--setup` instance on `:8791` for the first-run
setup shots), builds the `audiosilo-meta` data artifact (composed with
`audiosilo-meta-community`) + site and starts a `metaserve` on `:8795` for the
meta-site shots, then runs the Playwright captures and backfills placeholders.
`SKIP_META=1` skips the meta stack (for a web/admin-only run).
The header of `run.sh` lists all of its knobs (which checkouts to use, skipping
the admin captures, ports and the rest).
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

The first-run setup shots (`server/setup-wizard*.png` and `setup/*.png`)
come from `capture-setup.mjs`, which `run.sh` runs after `capture-admin.mjs`
against the `--setup` instance (a fresh data dir, no admin yet, started only
when a setup shot is wanted). It creates the admin on the `--setup` page, then
runs the console's eight steps through their real UI and ends on the Overview's
**Finish setting up** card; its header comment has the details (the generated
books folder, `SETUP_BOOKS`, `SETUP_HOST`). It needs **ffmpeg** on PATH, and on
a macOS host the folder step shows no mounted-folder suggestions (they are read
on Linux only).

Because a fresh server sends its admin to that flow on the first console visit
of every browser session, `capture-admin.mjs` marks the demo server (and the
mirror-mode one) set up (`PUT /admin/setup`, finished and dismissed) before it
opens a browser, so its shots never land on the flow and the Overview shows no
setup card.

Two admin shots depend on the server's community metadata lookup, which the
demo server leaves at its default (`https://meta.audiosilo.app`, so it needs
the network): `admin/book-match.png` shows the match dialog's candidates, and
`admin/series.png` shows series gaps only for books the live catalogue
matches. Offline, the match shot captures the dialog's "isn't answering"
message instead and the series cards show no gaps.

`admin/system-mirror.png` shows Health > System on a server in metadata
**mirror mode**, which keeps a local copy of the community metadata (about
1.8 GB, downloaded from GitHub). The run never downloads one: right after it
builds the meta artifact (section 4 of `run.sh`, so not with `SKIP_META=1`), it
starts a third server on `:8792` (`SHOTS_MIRROR_PORT`) in `.cache/mirror-data`
in mirror mode, with no library and the update check off, and seeds its
`meta-mirror/` folder with that artifact (a hard link where it can, else a
copy) and a `state.json` saying it was downloaded and checked just now (after
the artifact's build time, as a real copy is), so the copy opens at start and
its next check is a day away. That server's HTTPS goes to a proxy on a closed
port, so it can never download a real copy. Should it refuse the seeded copy
(its log says "the local copy can't be used"), `run.sh` stops it and skips the
shot when it sees that by the time the server is healthy; the copy opens in the
background, so `capture-admin.mjs` also stops at once when the copy is in any
state but opening or ready, and turns that server's metadata off. Otherwise it waits for
the copy to open, signs in there and clips the
shot to the Community metadata row and the copy's panel. The server isn't
started when `SHOTS_ONLY` leaves the shot out; without the meta stack the step
is skipped and the shot keeps its previous image (or a placeholder).

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
unused personal API key; maya adds two household members through the player's API
(`POST /me/household/members` as maya, after the listening is set up and only when
those two shots are wanted: ivy, a kid on "Ivy's books", one of maya's collections,
and dan, a grown-up on everything), which `admin/people.png` shows as maya's
household and `admin/person-member.png` as ivy's Access tab (without the household
both keep their previous images); nora stops 90 s before the Activity shots, so Live now
shows her as paused. The Activity screens are captured last, once
`LISTEN_MINUTES` (default 8) have passed since the listeners started, so the
charts and totals have twenty-odd minutes of listening to show rather than a
sliver. That
wait is most of an admin run's length; a smaller value is fine for checking the
script.

The Bridge shots (`admin/settings-bridge.png`, `admin/bridge-pair.png`,
`admin/bridge-setup.png`, `admin/settings-bridge-paired.png`) need a server built
with the Bridge (its
`GET /server` lists a `bridge` capability; an older build fails the step and the
shots keep their previous images). The Bridge itself is a separate program, so a
stand-in plays its part through the server's own Bridge routes: Settings > Bridge
is shot unpaired, then **Connect a bridge** is pressed and the dialog shot with its
fresh code, which the stand-in reads from the dialog's environment-variable block
and exchanges (`POST /bridge/pair`, naming itself `AudioSilo Bridge/0.2.0 (linux)`).
It sends a heartbeat that offers `bridge.verify`, `sidecars.generate`,
`sidecars.contribute` and `meta.correct`, reports the
seeded library mapped and writable at its own root path (the default mapping), any
other library (the Inbox) mapped but read-only, a page address on a private LAN
address, and the `estimates.sidecars` figures of a Bridge whose claude agent is
signed in on a subscription and can contribute; the admin queues a `bridge.verify` for
the seeded library through the API, and the stand-in claims it and reports it
`done` with the sizes the server gave for the sample book. When the server's first
reply `accepts` a `setup` block (Bridge Phase 2b), the heartbeat also carries a
setup checklist built as a Bridge builds it: first with the budget not reviewed and
no GitHub sign-in, when the Setup card is shot clipped (`admin/bridge-setup.png`,
"3 of 5 required steps done"), then with both done, so the stand-in can
contribute. The paired page is shot as tall as it is, and then the Contributions
module is turned on (`PATCH /admin/settings`; the modules shot before shows it
off), which the generate dialog's contribute switch and the story step's
contributing job need. A shot that fails here still lets the module be turned on.
Nothing is written into a library. It runs after the audit log shot, so the
Bridge's audit entries stay out of it.

The generate shots (`admin/book-generate.png`, `admin/generate-dialog.png`) come
straight after, from the same stand-in (its heartbeat sent again so it is online):
the first book's page,
its Community metadata card clipped with **Generate characters and recaps**, then
the confirmation the button opens, once its estimate has loaded. The dialog is
closed, never submitted, so nothing is queued. They need community metadata on (the
default) and a first book the community has no characters and recaps for (a seeded
LibriVox book has no ASIN or ISBN, so it never matches); otherwise the step fails
and the shots keep their previous images.

The Characters and recaps shots (`admin/book-story.png`,
`admin/book-story-recaps.png`, Bridge Phase 1e) follow, on **The Call of the
Wild**, whose `.audiosilo/` folder `run.sh` seeds with characters and recaps
(below), so its Characters and recaps card shows them as **Generated on this
server**. First the admin queues a `sidecars.generate` job for the book that
contributes (the stand-in can, and the Contributions module is on), and the
stand-in claims it and reports it `done`
with a result naming a community issue for each part, as a Bridge that filed them
would, so the card also shows **Contributed, waiting for review**. Nothing is
written into the library: the files are `run.sh`'s. The card is shot clipped on
the Characters tab (12 characters, so **Show all** shows), then on the Recaps tab
with **Through chapter 1** opened, each in a viewport as tall as the page.

The Detect chapters shots (`admin/health-detect-chapters.png`,
`admin/detect-chapters-dialog.png`, `admin/book-chapters-generated.png`, Bridge
Phase 1d) are the last Bridge step. The stand-in's heartbeat is sent again with
`chapters.detect` among its kinds and the Inbox mapped and writable; Health >
Issues `?issue=no_chapters` is shot with **Detect chapters** on the Inbox's **A
Long Lecture** (so they need ffmpeg for that fixture), then its confirmation, which
is submitted. The stand-in claims the `chapters.detect` job and runs it as a Bridge
would: since the fixture's audio is silence, it writes a fixed six-chapter
`chapters.json` (and the `bridge.json` beside it) into the book's `.audiosilo/`
folder under the Inbox (`.cache/inbox`, rebuilt every run), asks for the attachments
rescan and reports the job done. The book's Chapters card is then shot clipped,
with the found chapters in use. Nothing is written into the seeded library.

The generated description shots (`admin/book-description.png`,
`web-player/book-about-generated.png`, Bridge Phase 1c) need a book with a
`description.json`. Before the servers start, on every run, `run.sh` writes the
files a generate run leaves into **The Call of the Wild**'s `.audiosilo/` folder:
the fixtures `fixtures/call-of-the-wild.{description,characters,recaps}.json`
(own-words `model.Description`, `model.Characters` and `model.Recaps`; the
description spoiler-free) and the `bridge.json` a generate job writes, dated two
days ago. No other shot shows that book's About, Community card or tabs, and its
files carry no description of their own. The console shot is taken before the stand-in
Bridge is paired, so its card shows only the Description part; the web shot is the
desktop About card on the book's page, reached through Library > Books.

The support shots come after those (`admin/support-card.png`,
`admin/account-menu.png`, `admin/update-notice.png`). The overview's support
card only shows once the server's first account is 30 days old, so the
"support card" step backdates every non-demo account by 40 days in the capture
database (**sqlite3**, like the web player's seeded year) and runs after every
other console shot, so none of them shows the card. The capture server is a
local build, which never has an update to offer, so the update notice is its
own `GET /admin/system` answer shown as a Docker server one release behind
would see it (a Playwright route), with the real latest release: the server's
own update check, or, when GitHub refused that (60 unauthenticated requests an
hour), asked again from the script with `GITHUB_TOKEN` when it is set
(`GITHUB_TOKEN=$(gh auth token)`).

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

The book page and Journal shots need the listener's own records. Each entry of
`capture-web.mjs`'s `WARM` table names a seeded book and the state it gets after the
warm-up, through the API (a server with the `annotations` capability; the step fails
loudly without it): a saved place, a finish and a rating, bookmarks, notes, listening
history, and a sleep-timer drift-off, timed so the Journal's Diary pairs the
bookmark with its span by the frontend's `matchDrifts` rule. History spans are posted
with their own times (`POST /libraries/{id}/history`); bookmarks can't be backdated,
so the drift-off span ends just before the run. The captures open those books by
title (the finished one) or as the most recent Continue listening card (the last
entry, the one with the place).

`web-player/book-bookmarks.png`, `bookmark-editor.png` and `book-details.png` are
taken on the playing book's page (reached through the full player's View book
details, so the book stays loaded); the editor is closed with Cancel, so nothing
changes. Before the Details shot the book is downloaded here unless it already is,
so the tab says Plays from this device.

The You shots (`web-player/you-stats.png`, `year.png`, `phone-you-stats.png`,
`phone-settings.png`) and Home's This week need a year of listening, and the server
only derives listening sessions from progress saves as they happen. So after the
warm-up, `capture-web.mjs` writes a year of sessions for the demo user straight into
the capture server's throwaway database (`.cache/data/audiosilo.db`, through the
**sqlite3** CLI, marked `token_id = -1`): most days, evening and morning-commute hours,
a running streak over the last ten days, spread over the seeded books. It removes them
again at the end of the web captures, so the admin Activity shots only show the
listeners they provision. It is seeded, so a re-run draws the same charts. Without
sqlite3 the step fails and those shots show only the warm-up's minute of listening.
Every capture context reduces motion, so the Year in listening story stays on its first
card. The desktop You shot picks Stats in the sub-nav first: the Journal shot (opened
from the profile menu) leaves the Me tab on its Journal section.

The household shots (`web-player/profiles.png`, `household.png`, `household-device.png`,
`household-member.png`, `household-add-kid.png`, `household-add-grownup.png`,
`phone-household.png`, `home-house.png`, `book-in-the-house.png`, `kids.png`,
`phone-kids.png`, `player-cast.png`) need people rather than the demo user: a demo
account can't share what it listens to or add household members, and the people on a
device, their PINs and kids mode live in that browser's `localStorage`. So
`capture-web.mjs` provisions three accounts through the admin API (`ADMIN_PASSWORD`):
**ellen** (the viewer and an ordinary owner, with a place in A Christmas Carol),
**jamie** and **rosa** (who share; their listening comes from progress saves as the
apps make them, two 15 s apart, and jamie keeps saving every 15 s, so the house shows
jamie listening now and rosa paused once the server reads rosa's last save as a minute
old; rosa is saved again if more than 5 minutes passed before Home is shot). Then, as
Ellen, through the player's own API (`addHousehold` in `lib.mjs`, which `capture-admin.mjs`
uses for maya's household too), it makes a "Leo's stories" collection (Alice,
Looking-Glass, A Christmas Carol) and **Leo**, a kid on "Only collections I share" with
that collection, only when a shot that shows Leo is wanted (the collection also for the
add-a-kid shot). **Ruth**, a grown-up on "Everything I can listen to", is added with the
add dialog when `household-add-grownup.png` is wanted, else through the API when
`household.png` is.

Then it drives the UI as a family would, in a fresh browser: Ellen signs in by
password, the Household page renames ellen to Ellen, "Sign in someone who already has an account"
signs Jamie in as a person of their own, Ellen switches back, gives Jamie a PIN, signs
Leo in with "Sign in on this device" on Leo's member card (Leo joins the device in kids
mode, as a kid's account does; the toast that says so is dismissed) and turns sharing
on. The On this device shot is taken at 1440x1000 with Leo's card at the top, and the
member card shot clips Leo's card (marked On this device, with this browser as This
device). The add-a-grown-up shot adds Ruth with Kids account off and waits for the
code's countdown; it runs before the Household page shot, which opens the same storage
in a light context (the app's own theme pick set to light), 1440 wide and as tall as
Your household and what follows, scrolled to Your household with Leo's and Ruth's
cards (without both cards it keeps its previous image). The add-a-kid shot types Mia
and picks "Create Mia's books" (then Cancel: nothing is saved). Leo's shots choose Leo
on "Who's listening?" (a reload asks, with two or more people) and load a story, paused; the
phone shots reuse that browser's storage. Every household context runs in a
fixed-offset time zone where it is 8 pm, after Leo's 7:30 pm bedtime, so the kids
bedtime card reads the same on every run.

If setting the household up fails part-way, its shots are skipped and keep their
previous images. The accounts are deleted again at the end (deleting Ellen deletes
Ellen's members too), even when a step failed part-way, and their sign-ins are taken out of the
server's event feed and Ellen's member writes out of the audit log (sqlite3), so the
admin console's shots never show them (the Audit log keeps the admin's create and
delete entries). Accounts left over from a run that was killed are deleted before
provisioning: the owners (their members go with them) and any member whose owner isn't
one of them. A run that only wants `player-cast.png` (`SHOTS_ONLY`) provisions Ellen
alone.

**The self-service rate limit.** Adding a household member, a member's session and
pairing code, and API keys (making one, and listing them, as an Account page does)
share the server's self-service limit: 10 per address, reset after 15 minutes with no
spend. A full run spends 8 of them (the web run 5: Leo, Leo's session here, Ruth,
Ruth's code and the admin's Account page for `account.png`; the admin run 3: ivy, dan
and theo's API key), and each `run.sh` starts a fresh server, so the budget starts full. Only a hand-run
`node capture-web.mjs` against a server that is still running needs 15 quiet minutes
first.

The Cast button only shows on an https page in a Chromium browser, and for a server
reached at a loopback address it is only dimmed and explains why it can't cast (its
name is then "Cast, not available for this book"); the capture server is plain http on
`127.0.0.1`. For `web-player/player-cast.png` the script starts a local https proxy in
front of it with a throwaway self-signed certificate (**openssl**, into
`.cache/cast-tls`, reused while under a day old), on a free port, and opens it as `audiosilo.shots.test` in a separate
Chromium that resolves that name to `127.0.0.1` and accepts the certificate. Ellen
signs in there, her book is loaded and paused, and the shot is clipped to the full
player's transport and action row. Nothing leaves the machine except the Cast sender
script the button loads from `www.gstatic.com` (offline, the button still shows).

The connect shots run last, in a fresh browser with nothing stored:
`web-player/connect.png` types the server's own address and presses Continue (the probe
card), then the run signs in as the **admin** with a username and password (a real
account, so the account page has its Password card and API keys; `ADMIN_PASSWORD` is
required) for `connect-ready.png` ("Your library is ready.", the first connection) and
`account.png` (Account on, from the profile menu). That player session is signed out
through the API at the end, so it never shows in the admin Devices shot. The capture
server is reached at `127.0.0.1`, a loopback address, so it has no home address and the
account page shows no At home and away card.

`SERVER_BIN=<file>` runs a server binary built elsewhere instead of building one
into the `SERVER` checkout (pair it with `SKIP_ADMIN=1` unless that binary
embeds a built admin console), which is how a docs worktree captures an unmerged
server branch without writing into it:

```sh
(cd ../../audiosilo-server-wt && go build -o /tmp/shots/audiosilo ./cmd/audiosilo)
SERVER_BIN=/tmp/shots/audiosilo FRONTEND=../../audiosilo-frontend-wt \
  SKIP_ADMIN=1 SKIP_META=1 SHOTS_ONLY=web-player/ ./run.sh
```

`SHOTS_PORT`, `SHOTS_SETUP_PORT` and `SHOTS_META_PORT` move the three servers
off 8790 / 8791 / 8795 when a run in another checkout (a worktree, say) already
holds them. Two runs in the same checkout can't overlap whatever the ports: they
share `.cache/` (the server data dir is wiped at start, and the admin password is
read from `.cache/server.log`).

Every capture is optimized in place with **pngquant** (`brew install pngquant`)
- a lossy-palette pass that shrinks the retina PNGs ~60% with no perceptible
loss, so the committed image is the optimized one. It's optional: if pngquant
isn't on `PATH` the shots are just left raw (with a one-time warning).

Prereqs: Go 1.26+, Node 24 (also builds the server's admin console), ffmpeg/ffprobe, openssl (the Cast shot's certificate), sqlite3 (the seeded year of
listening), pngquant (optional; for image
optimization), and a web export at `FRONTEND/dist` (the sibling
`../../audiosilo-frontend` by default; `audiosilo-server/scripts/build-web.sh`
builds one, and `run.sh` triggers it automatically when it is missing - an existing
export is used as it is, so rebuild it after changing the frontend).

### Staging the web-player shots

Each `web-player/` entry's `hint` in `manifest.mjs` says what state its shot shows.
The player shots are staged **paused**, so they are still frames: the full player,
the phone sheets, the end credits (opened early from the player's menu) and the
docked bar just after a next-chapter jump, while the Undo chip shows (it is undone
straight after). On a desktop every shot after `web-player/home.png` (which shows
the book playing) has the docked bar paused, in a `SHOTS_ONLY` run too: the Home
and pause steps always run, so a partial run stages its shots as a full one does.

## Adding a screenshot

1. Add an entry to `manifest.mjs` (file path, title, hint, capture group).
2. Teach the matching `capture-*.mjs` script to take it (or leave it to the
   placeholder generator if it can't be automated yet).
3. Reference it from the doc page as `![alt](/img/screenshots/<file>)`.
4. Run `./run.sh` (or at minimum `node placeholders.mjs`) so the file exists -
   the Docusaurus build fails on missing images by design.

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
