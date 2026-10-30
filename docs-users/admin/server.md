---
title: "Server settings, updates and logs"
description: "The Server pages of the AudioSilo admin console: every setting you can change while the server runs (name, address, HTTPS, app links, community metadata and keeping a local copy of it, transcoding, household members, demo mode, backups, notifications, importing from Audiobookshelf, the Bridge, optional modules), which ones wait for a restart, checking for new versions and what that sends, reading the server's log, and the audit log of what admins (and the people managing household members) changed."
---

The **Server** destination in the [admin console](console-tour.md) is where
you look after the server itself:

- **Settings** - the server's settings, one topic at a time.
- **Logs** - what the server has been doing since it started.
- **Audit log** - what admins changed (and what people did with their household
  members), and when.
- **About** - which version you run, whether a newer one exists, and how to
  update.

The health of what the server depends on - ffmpeg, the certificate, disk
space, backups - is on [Health > System](health.md#system).

## Settings

![Server settings, General](/img/screenshots/admin/settings.png)

**Server > Settings** lists its topics down the left (across the top on a
phone): **General**, **Network & HTTPS**, **Players & app links**,
**Community metadata**, **Transcoding**, **Household**, **Demo mode**,
**Backups**, **Notifications**, **Import**, **Bridge** and **Modules**. Each setting lives in exactly one of them.
Backups, Notifications, Import and Bridge have pages of their own:
[Backups and restoring](backups.md),
[Notifications and the bell](notifications.md),
[Importing from Audiobookshelf](import.md) and [The Bridge](bridge.md). The settings are the same ones the server keeps in
`config.yaml` in its data folder: a change you save here is written there, so
it lasts across restarts.

Most topics are made of cards. Change what you like in a card, then press
**Save changes** at its foot (**Reset** puts the card back as it was). Only
the values you changed are sent. If the server refuses one - an address
without `https://`, a time like "2 days" - the reason shows under that field
and nothing in the card is saved, so fix it and save again. A number outside
what the setting takes (**Days to keep sessions** below 30, say) is caught
before anything is sent: the field says "Enter a whole number from 30 to
3,650." and **Save changes** waits until it's in range. The switches
(**Check for new versions**, **Look up community metadata** and each
module's **Enable** switch) save the moment you flip them.

### When a change takes effect

Most settings apply the moment you save: the next request already uses
them, and a toast says "Applied now. No restart needed."

A few are only read when the server starts, and carry a **Restart to apply**
badge: the listen address, the HTTPS mode and certificate names, the web
player folder, the community metadata service address and where community
metadata is looked up (its **Source**), turning demo mode on or off, how long idle demo guests are kept, and the backups folder. When you save one of them:

- On **Network & HTTPS**, the console asks first ("Save and apply at the next
  restart?"), because a wrong value there can stop the server from starting.
- The toast says "Saved. Some of it takes effect when the server restarts."
- A notice at the top of every Settings topic, "Restart AudioSilo to finish
  applying your changes", names the settings waiting, and each carries a
  **Waiting for a restart** badge. The [Overview](console-tour.md#the-overview) shows the
  same notice, with **Open Settings**, so a choice made in the
  [setup flow](../getting-started/first-run.md#set-up-your-server) isn't left
  waiting unnoticed. Until you restart, the server keeps using its current
  values.

The console can't restart the server for you. Restart it the way you started
it: `docker compose restart` (or `docker restart` with your container's name),
restarting the service, or quitting and starting the program again.

:::warning[If the server won't start after a change]
A listen address whose port something else uses, or a Let's Encrypt name that
doesn't point at the server, can keep it from starting. Open `config.yaml` in
the server's data folder, put the old value back (the keys are listed in the
[configuration reference](/developers/server/configuration)), and start it
again.
:::

### Settings set somewhere else

Settings marked **Set by AUDIOSILO_...** can't be changed here: an environment
variable sets them (common with Docker, where `docker-compose.yml` passes
them). An environment variable wins over this page and over `config.yaml`, so
change it where it is set and recreate the container. The console never copies
its value into `config.yaml`, so removing the variable later brings back the
file's own value.

### General

- **Server name** - shown in the apps when someone connects, on invites and in
  this console's top bar. Leave it empty to be called "AudioSilo".
- **Public address** - the address people use from outside your home, like
  `https://books.example.com`, used in invite links and QR codes. Leave it
  empty to use whatever address the browser used. See
  [Tell the server its public address](../getting-started/remote-access.md#tell-the-server-its-public-address).
- **Home address** - the address devices use on your home network, like
  `http://192.168.1.20:8080`. The apps switch to it by themselves when they
  can reach it, and use the public address when they can't. Leave it empty to
  use the address the browser used when that is a home-network address. See
  [Tell the server its home address](../getting-started/remote-access.md#tell-the-server-its-home-address).

The **Listening history** card sets **Days to keep sessions** (400 out of the
box, anything from 30 to 3650). Each listening session records which device
and app it was on and the time of day. After this many days that detail is
dropped and the session is added into daily totals per person and book, which
[Activity](activity.md) keeps for good, so totals and books listened to stay
while "which phone, what time" goes. 400 days keeps a full year of detail for
the Activity pages' longest range. A change applies at the server's next daily
tidy-up. The `AUDIOSILO_SESSION_DAYS` variable sets it too, and then locks it
here.

The **Updates** card holds the **Check for new versions** switch, on out of
the box. While it is on, the server asks GitHub once a day whether a newer
AudioSilo exists, and [Server > About](#about-and-updates) shows the answer.
Turning it off stops the update check's requests to GitHub (a
[local copy of community metadata](#keeping-a-local-copy) still downloads from
GitHub). See [What the update check sends](#what-the-update-check-sends).

### Network & HTTPS

![Server settings, Network & HTTPS](/img/screenshots/admin/settings-network.png)

The **HTTPS** card chooses how the server proves who it is to browsers and
apps (the same three choices as [Remote access](../getting-started/remote-access.md)):

- **Off** - plain HTTP. Only behind a reverse proxy that does HTTPS.
- **Self-signed** - encrypted, but browsers warn the first time. The default,
  and fine on a home network.
- **Let's Encrypt** - free trusted certificates, renewed automatically. Needs
  ports 80 and 443 open to the internet, and shows **Certificate names**: one
  name per line, like `books.example.com`, each pointing at this server.

With **Self-signed** chosen, the card also shows **Plain HTTP at home**, on out
of the box. The phone apps can't trust a self-signed certificate, so while it is
on the server's port also answers plain HTTP to devices on your home network
(anything else is sent to HTTPS), and that is how the apps connect at home.
Turn it off and the apps can't connect to a self-signed server. See
[Plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect),
including what it means for your network. It has no effect when you give the
server your own certificate (`tls.cert_file`). `tls.home_http` in `config.yaml` or
`AUDIOSILO_TLS_HOME_HTTP` sets it too, and then locks it here.

The **Certificate** row says how the certificate the server serves now looks:
"Valid" with the days left, "Expires in *N* days" (under two weeks), "Expired",
"Not issued yet" (Let's Encrypt hasn't issued one yet), or "None (plain HTTP)".
Once there is a certificate, the line under it names who issued it and the
date it runs out.

The **Network** card:

- **Listen address** - the address and port the server listens on, like
  `0.0.0.0:8080`. Change it only if something else uses the port.
- **Trusted proxies** - your reverse proxies, one address or range per line.
  The server believes their `X-Forwarded-For` header, so devices, sessions and
  rate limits see each visitor's real address. A plain address like
  `10.0.0.2` is saved as the range `10.0.0.2/32`.
- **Allowed web origins** - other websites allowed to call this server's API
  from a browser, show its covers and play its audio, one per line (like
  `http://localhost:8081`). Usually empty; see
  [Settings you can leave alone](../getting-started/remote-access.md#settings-you-can-leave-alone).

The HTTPS mode, plain HTTP at home, the certificate names and the listen
address wait for a restart; trusted proxies and allowed origins apply at once.

### Players & app links

The **Web player** card says whether people can listen in a browser at `/web`:
**Built in** (this build carries the player), **Served from a folder** (with
the **Player folder** under it) or **Not available**. The player folder can
only be changed in `config.yaml` (`web_dir`) or with `AUDIOSILO_WEB_DIR`, and
takes effect at the next start.

The **App links** card lets invite links and QR codes on your own domain open
the installed app directly. It only helps with an app build that claims your
domain, so most servers leave it empty:

- **iOS app IDs** - team ID and bundle ID, like `ABCDE12345.app.audiosilo`, one
  per line.
- **Android package** - like `app.audiosilo`.
- **Android certificate fingerprints** - the SHA-256 of the app's signing
  certificate (32 pairs of hex digits joined by colons), one per line.

### Community metadata

![Server settings, Community metadata](/img/screenshots/admin/settings-metadata.png)

The **Look up community metadata** switch turns the community metadata lookup
on or off for the whole server. When it is on, books that can be matched (they
carry an ASIN or ISBN) gain an extra "About this book" block in the player - a
description, production details, the series they belong to, and (where the
community has written them) character cards and story-so-far recaps - drawn
from the free, community-run catalogue at
[meta.audiosilo.app](https://meta.audiosilo.app). For that lookup only a
book's ASIN or ISBN is sent, never file paths or who is listening. See
[A book's page](../listening/book-page.md#about-this-book) for what listeners
see.

Matching a book in the admin console sends more, since its job is to find a
book that has no ASIN or ISBN yet: when you open **Match with community
metadata** on a book, the book's tagged title, author and series, its length,
any ASIN or ISBN, what you type, and the names of up to three of its folders
(the top folder, the folder holding the book, and the book's own folder or
file name) go to the metadata service. Nothing is sent until you open the
dialog (or start [Match automatically](health.md#matching-every-book-at-once),
which sends the same for every book it looks up), and never anything about who
listens. See
[Matching with community metadata](books.md#matching-with-community-metadata).

While the lookup is on, the server also checks matched books against the
community's chapter lists in the background (see
[Community chapters](books.md#community-chapters)). That sends only the book's
ASIN or ISBN and then the community's own ids for the recording it names.
Turning the lookup off stops the checks; chapters already in use stay until
you switch a book back.

While the lookup is on, your server also downloads community cover images
from wherever the catalogue keeps them (Audible's image servers or Open
Library, for example) for the players' series rails and previous-book rows,
and hands the players small copies. Only the image itself is asked for, and
listeners' devices never contact those image hosts.

With a [local copy](#keeping-a-local-copy) (once it is ready), the lookup,
matching and the chapter checks are all answered on your server; only the
cover images are still downloaded from their hosts.

- Flipping the switch takes effect immediately for **everyone connected**, and
  the choice is remembered across restarts.
- Turning it **off** is a one-tap privacy switch: your server stops contacting
  the metadata service and the cover image hosts at all, and the extra section
  disappears from every player.
- While it is on, **Status** says whether the service answers ("Responding ·
  *N* ms" or "Not responding"). With a local copy it says how the copy is
  doing instead ("Local copy ready", "Local copy downloading", "Opening the
  local copy", "No local copy yet" or "Local copy couldn't download"), with a link to the details on
  [Health > System](health.md#the-local-copy-of-community-metadata).
- **Check for upcoming releases** turns on a daily check of the series your
  libraries hold: which books in them are preorders, which came out recently,
  and which are missing (on by default). Today it gives you the
  [notification](notifications.md#what-to-send) **New releases in your series**;
  a list of these books in the players is planned. It asks the metadata service
  only about series and books, never who is listening, and with a
  [local copy](#keeping-a-local-copy) your server answers it itself. The switch
  works only while the lookup is on (it is greyed out otherwise). Under it, the
  last check: "Not run yet" (the first check runs as soon as you switch it on,
  or about an hour after the server starts), "Last checked *when*: *N* series,
  *M* books coming or missing", or, in red, "Last check failed *when*" with the
  reason. How far back a release still counts as new (90 days) is set in the
  config file only.
- **Audible marketplace** in the **Matching** card is the store you buy from
  (United Kingdom, United States, Germany and so on). When a recording sells in
  several stores, a match takes this store's ASIN; with **No preference** it
  takes the US store's. It applies to the next match, and
  [Use *country* ASINs](health.md#which-asin-a-match-takes) can switch books
  matched earlier.
- **Service address** in the **Service** card is the metadata service your
  server uses (`https://meta.audiosilo.app` out of the box). Change it only if
  you run your own; a new address is used from the next restart. If no address
  is set, the switch is greyed out and a notice ("No metadata service is
  configured") asks you to enter one and restart.
- **Clear community matches**, in the **Danger zone** at the bottom, undoes
  every community match so you can match from fresh. With more than one books
  library, pick one (or **All libraries**); then click **Clear matches** and
  type the word it asks for. It removes the titles, authors, narrators, series,
  years, descriptions, ASINs, ISBNs and covers a community match wrote, whether
  you accepted it by hand or
  [in bulk](health.md#matching-every-book-at-once), along with the match runs
  and any review still waiting. Your own edits, the covers you uploaded and an
  ASIN or ISBN from a book's own tags stay. The books go back to what their tags
  and folders say and show under
  [Not matched](health.md#matching-every-book-at-once) again (unless their tags
  carry an ASIN or ISBN), ready for **Find matches**. Nothing is sent to the
  metadata service, so it works with the switch off too. It can't be undone:
  only matching again brings the values back. While a match run is working it
  asks you to wait for it, or stop it, first.

#### Keeping a local copy

Choose a local copy if you'd rather no book were looked up over the internet:
it costs about 1.8 GB of disk and about 450 MB of download a day. Otherwise keep
the default, which stores nothing.

The **Source** card has two choices:

- **Ask the metadata service for each book** (the default). Each lookup sends
  the book's ASIN or ISBN to the service, as described above, and matching
  sends what the match dialog needs.
- **Keep a local copy.** The server downloads a copy of the whole community
  database and answers every lookup from it, so **no book is looked up over
  the internet**: not the "About this book" lookups, not the match dialog or
  Match automatically, not the community chapter checks.

What a local copy costs:

- **Disk space:** the copy takes about 1.8 GB in the server's data folder. An
  update needs about 2.5 GB free on top of that while it runs; without that
  room the update is skipped, the current copy stays in use, and Health >
  System says how much space it needs.
- **Bandwidth:** about 450 MB for each new copy. The server looks for a new
  copy once a day, and since the community database changes several times a
  day, that usually means a download every day.

How it behaves:

- The choice applies **after a restart** (the card carries a **Restart to
  apply** badge). After the restart the first copy is downloaded shortly
  after the server starts, then updated once a day; [Health > System](health.md#the-local-copy-of-community-metadata)
  shows its progress, and **Check now** there looks for a newer copy at once.
- **Until the first copy is ready**, and whenever the copy runs into an error,
  lookups go to the online service as before, so listeners never lose the
  extra section while it downloads. Health > System says when that is
  happening.
- A book the copy doesn't know is **not** looked up online. If the server
  already had details for it, it keeps showing them rather than going blank.
- The copy comes from GitHub, so the server contacts GitHub once a day instead
  of the metadata service for each book (and lookups are quicker, since none
  of them waits on the internet). The download carries nothing about your
  books or listeners.
- Cover images are not part of the copy: the server still downloads the
  community covers the players show from wherever the catalogue keeps them
  (only the image itself is asked for).
- **Covers are not part of the copy:** book covers still come from their own
  sites (Audible, Open Library, publishers) in both modes.
- While the **Look up community metadata** switch is off, the copy isn't
  updated either, and turning it off stops an update that is downloading.
- The copy isn't part of the server's [backups](backups.md), and doesn't need
  to be in yours: it can always be downloaded again.
- Switching back to **Ask the metadata service for each book** deletes the
  copy when the server next starts.

### Transcoding

**Transcoding** shows **ffmpeg** and **ffprobe**: the version found and where,
"downloaded" when the server fetched its own copy into the data folder, or
**Not available** with what that means. ffmpeg converts formats browsers can't
play to MP3 while someone listens, and copies the MP3 out of `.mka` (Matroska)
files so every player can play them; ffprobe reads lengths, chapters and codecs.
When ffprobe is version 7.1 or 8.1, the server reads most files' lengths,
chapters and codecs itself during a scan, much faster, and uses ffprobe for the
rest; with another version, ffprobe reads every file (see
[ffmpeg and ffprobe](../getting-started/install-binary.md#ffmpeg-and-ffprobe)).

The MP3 copies are kept in the data folder, under `cache/remux`, so each book
is copied once rather than on every play. The folder holds at most 8 GiB: past
that, the copies played longest ago are removed (and made again if someone
plays them). The server makes no new copy while the disk would be left with
less than 1 GiB free; such a book then plays through the live conversion. The
folder is safe to delete and needs no backup. Opening a book in the player
starts its copies in the background, so they are usually ready by the time
someone presses play.

Nothing here can be changed in the console. The server finds the two tools
when it starts: next to its own program, on the system's PATH, or downloaded
into the data folder. To use other copies, start it with the `--ffmpeg` and
`--ffprobe` options (see the
[configuration reference](/developers/server/configuration#cli-flags-cmdaudiosilo)).

### Household

The **Household members** card: "People add kids and grown-ups to their
household from the player, with no invite from you. Each member is a real
account, managed by the person who added it." (See
[Household members](users-and-invites.md#household-members).)

- **People can add household members** - on out of the box. Off stops new
  members being added; members already added keep working, and the people who
  added them can still manage them.
- **Members per person** - from 1 to 50 (6 unless you change it). Lowering it
  never removes anyone: someone already over the new number just can't add more.

Both apply at once, with no restart. To stop one person adding members, turn
off **Can add household members** on their Account tab instead. The
`AUDIOSILO_HOUSEHOLD_MEMBERS_ENABLED` and `AUDIOSILO_HOUSEHOLD_MAX_MEMBERS`
variables set them too, and then lock them here.

### Demo mode

The **Demo mode** card runs a public demo from this server (see
[Demo](../demo.md)):

- **Enable demo mode** - hands out throwaway accounts at `/web/demo`, and sends
  visitors of the site's front page straight to the demo. Waits for a restart.
- **Guests can listen to** - the library every demo account gets. Use a
  library of public-domain books, never your own collection.
- **Most guests at once** - `0` means no limit; leave it empty for the default
  (200).
- **Remove idle guests after** - a length of time like `30m`, `2h` or `24h`;
  empty means 24 hours. Waits for a restart.

### Modules

![Server settings, Modules](/img/screenshots/admin/settings-modules.png)

Modules are optional features you choose to turn on. Every module starts off and
stays off until you turn it on; pairing a Bridge doesn't turn one on. **Modules**
shows a card for each one, with what it does, **Learn more** (which opens this
section) and its **Enable** switch. The switch saves the moment you flip it,
and the module starts or stops at once, with no restart.

Some modules need a [Bridge](bridge.md). Their card says where your Bridge
stands, under the switch's name:

- **Needs a Bridge** - no Bridge is paired, or it hasn't reported in the last
  two minutes.
- What your Bridge is missing, like **Sign in to GitHub on your Bridge** - the
  Bridge is online but can't do what this module needs yet.
- **Bridge ready** - the Bridge can do it.

Until the Bridge is ready, the card has a **Bridge settings** link to pair one or
see what is wrong.

You can turn a module on before its Bridge is ready. Its card then says **On,
but hidden from listeners until the Bridge is ready.** Listeners see what the
module adds only while the Bridge is ready: it appears and disappears on its own
as the Bridge comes and goes, without you touching the switch. Contributions,
which listeners never see, says **On, but nothing is sent until the Bridge is
ready.** instead.

The modules today:

- **Podcasts** - follows shows by feed URL, keeps their details and artwork up
  to date, downloads episodes and checks retention. An admin sets retention
  per show [through the API](podcasts.md#downloads-and-retention) for now.
  It needs an online Bridge that supports podcasts. With it on, the server can
  also [search podcast directories (no Bridge needed) and import OPML](podcasts.md#finding-shows-and-moving-subscriptions),
  which listeners use from the player's Add shows page; exporting OPML works
  with the module on or off.
  Player apps from 2.4.0
  [show podcasts](podcasts.md#what-is-available-now); older ones don't. Turning the
  module off stops follows and feed/download/retention scheduling, keeping the
  indexed shows and files. Work already held by the Bridge may finish; a
  compatible client can still read saved episodes without it.
- **Contributions** - sends your book corrections, and the characters and recaps
  your Bridge generates, to the community metadata database, so every AudioSilo
  server can use them. It needs a Bridge signed in to GitHub, or given a GitHub
  token of your own (**Sign in to GitHub on your Bridge** until it is, and also
  while a signed-in Bridge can't reach GitHub to renew its sign-in, which ends by
  itself: see [Bridge accounts](../getting-started/bridge-accounts.md#github)).
  While it is
  on and the Bridge is ready, the generate dialog offers **Also contribute to the
  community** (on by default), and a book's page offers
  [Share with the community](bridge.md#share-with-the-community) and
  [Suggest corrections](bridge.md#suggest-corrections). Turned off, none of them
  shows, and such a job already queued waits until it is on again, except a
  share, which is cancelled if the book's characters and recaps are generated
  again meanwhile. Listeners see nothing of it. See
  [Contributing from your server](../community/contributing-from-your-server.md).

A module's environment variable (`AUDIOSILO_MODULES_CONTRIBUTIONS_ENABLED=true`
turns Contributions on) sets its switch too, and then locks it here, like any
[setting set somewhere else](#settings-set-somewhere-else).
Each change is in the [audit log](#audit-log) as a settings change.

## About and updates

![Server > About](/img/screenshots/admin/about.png)

**Server > About** starts with the **Updates** card, which says one of:

- **You're up to date** - this version is the newest release.
- **AudioSilo *version* is available** - with a **Release notes** button, a
  line saying AudioSilo is free and that sponsors keep it going (with a
  **Sponsor on GitHub** link), and how to update this server:
  - **Docker**: pull the new image (`ghcr.io/kodestar/audiosilo-server:<version>`,
    or `:latest`) and recreate the container (`docker compose pull` then
    `docker compose up -d`). Your data folder stays as it is.
  - **The program on its own**: download the new version for your system from
    the release page, replace the program and start it again with the same data
    folder (see [Install the native binary](../getting-started/install-binary.md)).
  - **A local build**: pull the new tag and build again.
- **This is a development build** - a build of your own, or the
  [`:edge` image](../getting-started/quickstart-docker.md#testing-unreleased-builds),
  can't be compared with releases; the card names the newest release.
- **Couldn't check for updates** - GitHub limited requests from your address
  for now, couldn't be reached from the server (check its internet
  connection), or gave an answer that didn't make sense. The server tries
  again the next day.
- **Not checked yet** - the server checks a minute after it starts, then once a
  day.
- **The update check is off** - with a **General settings** button to turn it
  on.

![An update available, with the sponsor line](/img/screenshots/admin/update-notice.png)

The card's header says when the server last asked, and its foot names the
latest release and when it was published. **Check now** asks GitHub
straight away (a second press within a minute shows the same answer rather
than asking again).

When an update exists, the version line on the
[overview's Server card](console-tour.md#the-overview) also shows a
"*version* available" link to this page.

**A console tab left open during an update** still runs the console from before
it. The first page you open there that the new server no longer has reloads the
tab into the new console by itself, once. This works for a tab opened on 2.5.1
or later, so it starts with the update after 2.5.1: a tab still open from 2.5.0
needs reloading by hand. If the page still can't open, it says **AudioSilo was
updated**: "This tab still has the console from before the update. Reload to
open the new one.", with **Reload** and **Go to the overview**. A page that
fails for any other reason shows **This page hit a problem**, with **Reload** and
**Go to the overview**, and the console's menu stays in place.

The **About *name*** card lists the server's name, version, how it is installed
(Docker container, Program or Local build), platform, how long it has been
running, its data folder, the database's size and schema number, and its
server ID. Under it are links to this documentation, the source code, the
issue tracker and **Support AudioSilo** (the project's GitHub Sponsors page; see
[The support card](console-tour.md#the-support-card)).

### What the update check sends

The update check asks one fixed address at GitHub
(`api.github.com/repos/KodeStar/audiosilo-server/releases/latest`), at most
once a day plus whenever you press **Check now**. The request carries only your
server's version (as `AudioSilo/<version>`), and GitHub sees the address it
comes from, as with any request. Nothing about your libraries, books or people
is sent, and there is no identifier for your server. While **Check for new
versions** is off, the server doesn't make this request at all. Nothing is downloaded or
installed for you: updating is always your step.

## Logs

![Server > Logs](/img/screenshots/admin/logs.png)

**Server > Logs** shows what the server has been doing since it started: scans
starting and finishing, a library folder that went missing, a failed update
check, a warning about the HTTPS setup, and so on. The newest line is at the
bottom, and while you stay at the bottom the view follows new lines.

- **All**, **Warnings** and **Errors** filter by how serious a line is
  (Warnings also shows errors).
- **Search logs** keeps only the lines that contain what you type, in the
  message or its details.
- **Live tail** (on by default) fetches new lines every two seconds. Turn it
  off to read without the view moving.

A few things to know:

- The server keeps its **newest 2,000 lines in memory**, from when it started,
  and nothing is written to disk for this page. A restart empties it. The page
  opens on the newest 500 lines that match the filters and holds up to 1,000
  as new ones arrive; when there were more, "Older lines aren't shown." marks
  the gap at the top. After a server restart the live tail starts over with
  the new lines.
- The full log is wherever the server's output goes: `docker compose logs`
  under Docker, the terminal or service log otherwise. That is also where the
  first-run admin password was printed; it never appears here.
- Passwords, tokens, invite codes and other secrets are never shown: any detail
  named after one (a token, password, code, key, cookie or secret) is replaced
  with `[redacted]` before the line reaches this page.

## Audit log

![Server > Audit log](/img/screenshots/admin/audit.png)

**Server > Audit log** lists what admins changed, and what people did with their
household members in the player, newest first: when, who,
what they did and to what, with the details underneath. For example
"Changed settings" with each setting's old and new value, "Edited a book" with
the fields that changed, "Gave access" with the person and the share, or
"Downloaded a backup" with the backup's name. A key symbol next to a name
means the change was made with a personal API key rather than in a signed-in
app. Things the server did by itself on an admin's behalf, like applying a
restore at start, are listed under **AudioSilo**.

What is recorded: changes to accounts, invites, devices signed out, shares and
access, household members (what the people who manage them do in the
player, naming them as the one who did it), people's progress, libraries, books
and covers, ignored health issues,
settings, backups (including every download, restore and cancelled restore),
notification destinations, and answers to the
[support card](console-tour.md#the-support-card) ("Answered the support card",
with the answer and, for **Not now**, when the card shows again).

What isn't:

- **Sign-ins and listening.** They are in [Activity](activity.md) and on
  [People > Devices](users-and-invites.md#the-devices-page) (and you can be
  [notified](notifications.md) of sign-ins).
- **Scans** (and rescans of one book, and stopped scans): their history is in
  [Health > Jobs](health.md#jobs).
- Anything else people do in a player.

The log never holds a secret: a password change reads only "set" or "removed",
an invite never shows its code, and a notification destination's address or
secret only as "New address" or "New secret". It doesn't record IP addresses.
Entries are kept for a year.

To narrow the list, choose an **Area** (Accounts, Household members, Invites,
Devices, Shares and access, Progress, Imports, Libraries, Books, Health, Settings,
Backups, Notifications), a person under **Who** (everyone but demo accounts and
household members, since the people who manage household members appear in the log
too), or type in **Search names and paths** (it matches what a change was made to, or who made it). **Show older**
at the foot loads the next 50.

## Where to next

- [Backups and restoring](backups.md),
  [Notifications and the bell](notifications.md),
  [Importing from Audiobookshelf](import.md) and [The Bridge](bridge.md) - the
  topics with pages of their own.
- [Library health and jobs](health.md) - the System page, issues and scans.
- [Remote access](../getting-started/remote-access.md) - HTTPS, ports and
  proxies in more depth.
- [Troubleshooting](../troubleshooting.md) - when something isn't working.
