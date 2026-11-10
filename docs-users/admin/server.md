---
title: "Change server settings"
description: "Every server setting in the admin console, what each one does and when to change it, plus updates, logs and the audit log."
---

**Server > Settings** in the [admin console](console-tour.md) holds the
server's settings, one topic at a time. This page explains each one: what it
does, and when you would change it. You need to be an admin.

The **Server** area also has **About** (your version and updates), **Logs**
and the **Audit log**, covered at the end of this page. The health of what the
server depends on (ffmpeg, the certificate, disk space, backups) is on
[Health > System](health.md#system).

## Settings

![Server settings, General](/img/screenshots/admin/settings.png)

The topics are listed down the left (across the top on a phone). Four of them
have their own pages: [Backups](backups.md), [Notifications](notifications.md),
[Import](import.md) and [Bridge](bridge.md).

To change a setting:

1. Change the values you want in a card.
2. Press **Save changes** at the foot of the card (**Reset** undoes your edits).

If the server refuses a value, the reason shows under the field and nothing in
the card is saved. Switches, such as **Check for new versions**, save the
moment you flip them. The console warns you before you leave a card with
unsaved changes.

Your changes are written to `config.yaml` in the server's data folder, so they
last across restarts.

### When a change takes effect

Most settings apply as soon as you save. No restart is needed.

A few only apply after a restart, and carry a **Restart to apply** badge:

- the listen address, the HTTPS mode and certificate names;
- the web player folder and the backups folder;
- the community metadata service address and **Source**;
- turning demo mode on or off, and how long idle demo guests are kept.

After you save one, a notice at the top of
Settings lists what is waiting. The server keeps its current values until you
restart it.

The console can't restart the server. Restart it the way you started it: for
example `docker compose restart`, restarting the service, or quitting and
starting the program again.

:::warning[If the server won't start after a change]
A port that something else uses, or a Let's Encrypt name that doesn't point at
the server, can stop it from starting. Open `config.yaml` in the data folder,
put the old value back (the keys are in the
[configuration reference](/developers/server/configuration)), and start it
again.
:::

### Settings set somewhere else

A setting marked **Set by AUDIOSILO_...** is set by an environment variable,
often from your `docker-compose.yml`. It can't be changed here. An environment
variable wins over this page and `config.yaml`, so change it where it is set
and recreate the container.

### General

- **Server name** - shown in the apps, on invites and in the console's top
  bar. Set one so people recognize your server.
- **Public address** - the address people use from outside your home, like
  `https://books.example.com`. Invite links and QR codes use it. See
  [Tell the server its public address](../getting-started/remote-access.md#tell-the-server-its-public-address).
- **Home address** - the address devices use on your home network, like
  `http://192.168.1.20:8080`. The apps switch to it when they can reach it.
  See
  [Tell the server its home address](../getting-started/remote-access.md#tell-the-server-its-home-address).
- **Days to keep sessions** (in **Listening history**) - how long each
  listening session keeps its device and time of day. After that, it is folded
  into daily totals, which [Activity](activity.md) keeps for good. 400 days by
  default (30 to 3,650), which keeps a full year of detail.
- **Check for new versions** (in **Updates**) - on by default. The server asks
  GitHub once a day whether a newer AudioSilo exists. See
  [What the update check sends](#what-the-update-check-sends).

### Network & HTTPS

![Server settings, Network & HTTPS](/img/screenshots/admin/settings-network.png)

The **HTTPS** card chooses how the server secures connections (more in
[Reach your server from outside your home](../getting-started/remote-access.md)):

- **Off** - plain HTTP. Use it only behind a reverse proxy that does HTTPS.
- **Self-signed** - encrypted, but browsers warn the first time. The default,
  and fine on a home network.
- **Let's Encrypt** - free trusted certificates, renewed for you. Needs ports
  80 and 443 open to the internet. Enter each **Certificate name** (like
  `books.example.com`) on its own line.

With **Self-signed**, leave **Plain HTTP at home** on. The phone apps can't
trust a self-signed certificate, so they connect over plain HTTP on your home
network. Turn it off and the apps can't connect. See
[Plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect).

The **Certificate** row shows whether the current certificate is valid and when
it runs out.

The **Network** card:

- **Listen address** - the address and port the server listens on, like
  `0.0.0.0:8080`. Change it only if something else uses the port.
- **Trusted proxies** - your reverse proxies, one per line. Set this so the
  server sees each visitor's real address.
- **Allowed web origins** - other websites allowed to use this server from a
  browser. Usually empty; see
  [Settings you can leave alone](../getting-started/remote-access.md#settings-you-can-leave-alone).

### Players & app links

The **Web player** card says whether people can listen in a browser at `/web`.
The player folder can only be set in `config.yaml` (`web_dir`) or with
`AUDIOSILO_WEB_DIR`.

The **App links** card lets invite links on your own domain open the installed
app directly. It only helps with an app build made for your domain, so most
servers leave it empty.

### Community metadata

![Server settings, Community metadata](/img/screenshots/admin/settings-metadata.png)

**Look up community metadata** turns on extra book details from the free
community catalogue at [meta.audiosilo.app](https://meta.audiosilo.app). Books
with an ASIN or ISBN gain an "About this book" section in the player: a
description, series, and (where written) characters and recaps. See
[A book's page](../listening/book-page.md#about-this-book).

What is sent:

- **Looking up a book** sends only its ASIN or ISBN, never file paths or who
  is listening.
- **Matching a book** in the console sends its tagged title, author, series,
  length, narrators and language. It also sends any ASIN or ISBN, what you
  type, and up to three of its folder names. This happens only when you open **Match with community
  metadata** or run [Match automatically](health.md#matching-every-book-at-once).
  See [Matching with community metadata](books.md#matching-with-community-metadata).
- **Community chapters** are checked in the background for matched books (see
  [Community chapters](books.md#community-chapters)).
- **Cover images** are downloaded by your server from where the catalogue
  keeps them. Listeners' devices never contact those hosts.

Turning the switch **off** stops all of this at once, for everyone. The server
then never contacts the metadata service or the cover hosts.

The other settings on this topic:

- **Status** - whether the service (or your local copy) is answering.
- **Check for upcoming releases** - on by default. A daily check of the series
  you hold, for preorders, recent releases and missing books. Listeners (except
  kids) see them on [Upcoming releases](../listening/upcoming.md), and you can
  get a [notification](notifications.md#what-to-send). A calendar app in the
  cloud, like Google Calendar, needs a public HTTPS **Public address** with a
  trusted certificate.
- **Help complete the community database** - off by default. See
  [below](#helping-complete-the-community-database).
- **Audible marketplace** (in **Matching**) - the store you buy from. When a
  recording sells in several stores, a match takes this store's ASIN. It has
  nothing to do with your library's language. See
  [Which ASIN a match takes](health.md#which-asin-a-match-takes).
- **Service address** - `https://meta.audiosilo.app` by default. Change it only
  if you run your own.
- **Clear community matches** (in **Danger zone**) - undoes every community
  match in one library or all of them, so you can match again from fresh. Your
  own edits and uploaded covers stay. It can't be undone.

The upcoming-release check and the report below only work while the lookup is
on.

#### Helping complete the community database

Turn on **Help complete the community database** to tell the community which of
your books it is missing. Once a day, the server sends the metadata service the
Audible ASINs of your books that the community database doesn't know. The
community can then add those books.

Only the ASINs are sent: no titles, file paths, server name or anything about
listeners. The service doesn't store your IP address with them. Its
[privacy page](https://meta.audiosilo.app/privacy) has the details.

Good to know:

- It sends only over HTTPS.
- With a [local copy](#keeping-a-local-copy), nothing is sent until the copy is
  ready.
- A server in [demo mode](#demo-mode) never sends a report.
- An ASIN isn't sent again for a month.

A line under the switch says when the last report went out, and whether it
failed. A failed report is tried again the next day.

#### Keeping a local copy

The **Source** card chooses where lookups are answered:

- **Ask the metadata service for each book** (the default). Each lookup goes
  to the service online.
- **Keep a local copy.** The server downloads the whole community database and
  answers lookups, matching and chapter checks from it. Fewer requests leave
  your server.

A local copy takes about 1.8 GB of disk, plus about 2.5 GB free while it
updates. It downloads about 450 MB a day, from GitHub. Choose it if you want
fewer online lookups and have the space.

How it behaves:

- It applies after a restart. [Health > System](health.md#the-local-copy-of-community-metadata)
  shows the download's progress.
- Until the copy is ready, or if it fails, lookups go to the online service, so
  listeners don't lose anything.
- A book the copy doesn't know is not looked up online.
- Cover images still come from their hosts.
- The copy isn't in your [backups](backups.md). It can always be downloaded
  again.
- Switching back to **Ask the metadata service for each book** deletes the copy
  at the next start.

### Transcoding

**Transcoding** shows whether the server found **ffmpeg** and **ffprobe**.
Nothing here can be changed in the console.

- **ffmpeg** converts formats a browser can't play while someone listens, and
  makes the small copies the [Apple Watch app](../listening/apple-watch.md)
  downloads. Without it, some books won't play in a browser and watches get no
  copies.
- **ffprobe** reads lengths, chapters and codecs during a scan. See
  [ffmpeg and ffprobe](../getting-started/install-binary.md#ffmpeg-and-ffprobe).

The server finds them next to its own program, on the system's PATH, or
downloads its own copy. To use other copies, start it with the `--ffmpeg` and
`--ffprobe` options (see the
[configuration reference](/developers/server/configuration#cli-flags-cmdaudiosilo)).

Converted copies are kept in the data folder under `cache/`. They are capped in
size, safe to delete and need no backup.

### Household

These settings control [household members](users-and-invites.md#household-members):
kids and grown-ups people add from the player, with no invite from you.

- **People can add household members** - on by default. Off stops new members
  being added. Members already added keep working.
- **Members per person** - 6 by default (1 to 50). Lowering it never removes
  anyone.

To stop just one person adding members, turn off **Can add household members**
on their Account tab instead.

### Demo mode

The **Demo mode** card runs a public demo from this server (see
[Demo](../demo.md)):

- **Enable demo mode** - hands out throwaway accounts at `/web/demo`.
- **Guests can listen to** - the library guests get. Use public-domain books,
  never your own collection.
- **Most guests at once** - `0` means no limit; empty means 200.
- **Remove idle guests after** - like `30m` or `24h`; empty means 24 hours.

### Modules

![Server settings, Modules](/img/screenshots/admin/settings-modules.png)

Modules are optional features. Each one is off until you turn on its
**Enable** switch, which takes effect at once.

Some modules need a [Bridge](bridge.md). Their card says whether your Bridge is
ready, and links to **Bridge settings** if it isn't. You can turn a module on
before then: listeners see it once the Bridge is ready.

- **Podcasts** - follows shows by feed URL and downloads their episodes. Needs a
  Bridge. With it on, listeners can also search podcast directories and import
  OPML. See [Podcasts](podcasts.md).
- **Contributions** - sends your book corrections, and the characters and
  recaps your Bridge generates, to the community metadata database. Needs a
  Bridge signed in to GitHub. See
  [Contribute from your server](../community/contributing-from-your-server.md).
- **Audible** - shows the books in your Audible accounts and backs up the ones
  you choose into your library. Needs a Bridge. See [Audible](audible.md).

Turning a module off keeps what it already made (shows, files, accounts).

## About and updates

![Server > About](/img/screenshots/admin/about.png)

**Server > About** shows your version and whether a newer one exists. **Check
now** asks straight away.

When an update is available, the card shows the release notes and how to
update:

- **Docker** - pull the new image and recreate the container
  (`docker compose pull`, then `docker compose up -d`). Your data folder stays
  as it is.
- **The program on its own** - download the new version from the release page.
  Replace the program and start it with the same data folder (see
  [Install without Docker](../getting-started/install-binary.md)).

Nothing is installed for you: updating is always your step. Before you update,
see [Before an upgrade](backups.md#before-an-upgrade).

![An update available, with the sponsor line](/img/screenshots/admin/update-notice.png)

The **About** card below lists the server's details, such as how it is
installed, its data folder and the database size.

### What the update check sends

The update check asks GitHub about the latest release, at most once a day and
when you press **Check now**. It sends only your server's version. GitHub sees
your address, as with any request. Nothing about your libraries, books or
people is sent. Turn off **Check for new versions** in [General](#general) to
stop it.

## Logs

![Server > Logs](/img/screenshots/admin/logs.png)

**Server > Logs** shows what the server has been doing since it started: scans,
missing folders, warnings and errors. Filter by **Warnings** or **Errors**,
or search. **Live tail** keeps the view updated.

The page holds only the newest lines since the last restart. The full log is
wherever the server's output goes, such as `docker compose logs`. Passwords,
tokens and other secrets are never shown.

## Audit log

![Server > Audit log](/img/screenshots/admin/audit.png)

**Server > Audit log** lists what admins changed, newest first: who, what and
when, with the details. It also lists what people did with their household
members. Filter by **Area** or **Who**, or search.

It records changes to accounts, invites, devices, access, progress, libraries,
books, settings, backups and notifications. Sign-ins and listening are in
[Activity](activity.md), and scans in [Health > Jobs](health.md#jobs).

The log never holds a password or other secret, and no IP addresses. Entries
are kept for a year.
