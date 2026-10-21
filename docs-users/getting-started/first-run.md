---
title: First run
description: "Setting up a new AudioSilo server: the admin account (printed once, or chosen in the browser with --setup), then the admin console's eight-step Set up your server flow, the Finish setting up card, and the data directory."
---

## First run

A new server is set up in two parts:

1. **Your admin account.** The server makes it for you and prints its password once, or, started with `--setup`, lets you choose the password in your browser.
2. **Set up your server.** The first time you sign in to the admin console, it walks you through eight short steps: your books folder, how your books are named, community metadata, how people reach the server, Audiobookshelf, backups, connecting a phone and adding a Bridge. You end the flow listening, not reading settings.

## Your admin account

The first time the server starts with an empty data directory, it bootstraps itself. There are two ways it can make the admin account, depending on how you start it.

### The default: generated credentials, printed once

Started normally (including under Docker), the server creates the admin account itself - with a strong random password, never a default one - and prints everything you need to the log, **exactly once**:

```text
========================================================
 AudioSilo first-run setup - store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : <data dir>/config.yaml
========================================================
```

Save these now:

- The **admin password** signs you in to the admin console at `/admin`, which then [sets up your server](#set-up-your-server) with you (and to the player, if you want to listen as the admin account).
- The **auth code** is for pairing a listening device - enter it on the connect page and you get a QR code and links that sign a phone or browser in without typing a password. See [Connecting to a server](../listening/connecting.md). (The console's setup flow also shows a pairing code for your own phone, in [step 7](#step-7-connect-a-phone).)

The banner is shown once by design: the server stores only scrambled (hashed) versions of secrets, so it *cannot* show them again later. Under Docker, `docker compose logs` shows it until the container is recreated.

:::warning Missed the banner?
If you lost the credentials before setting anything up, the simplest fix is to start over: stop the server, delete the data directory, and start it again - a fresh first run prints a fresh banner. Only do this before you've added users or listening progress you care about, because the data directory is where those live. [Troubleshooting](../troubleshooting.md#i-lost-the-first-run-admin-password) has gentler options for later.
:::

### The alternative: choose the password in your browser (`--setup`)

Start the binary with `--setup` and the server skips creating an admin. Instead it prints a one-time link:

```text
========================================================
 AudioSilo first-run setup
========================================================
 Open this URL in your browser to finish setting up:
   https://localhost:8080/setup#token=...
--------------------------------------------------------
 You'll choose an admin password and your books folder.
========================================================
```

Open the link and choose the **admin username** (it defaults to `admin`) and an **admin password** you'll actually remember (at least 8 characters), then press **Create account**:

![The --setup page: create your admin account](/img/screenshots/server/setup-wizard.png)

That is all this page asks. Once the account exists it says **Your account is ready** and hands you over to the admin console, where the books folder and everything else is set up:

![Your account is ready, with Continue setup](/img/screenshots/server/setup-wizard-done.png)

**Continue setup** opens the admin console's sign-in; sign in with the account you just made and the [Set up your server](#set-up-your-server) flow opens.

A few things worth knowing about how this page is secured:

- The secret token rides in the part of the URL after the `#`, which browsers never send to servers - so it can't leak into logs. The link only works with the token.
- The page **shuts itself off the moment an admin account exists**. After setup - or on a server that was set up the normal way - `/setup` simply sends you to the admin console, and on a server never started with `--setup` it doesn't exist at all.

## Set up your server

The first time you open the admin console (`/admin`) on a new server, it takes you to **Set up your server**: a page of its own, with the steps listed down the side.

![Step 1 of Set up your server: the books folder](/img/screenshots/setup/folder.png)

How it works:

- **Every step has Back and Skip.** Nothing is required; a skipped step is waiting for you later on the Overview (see [Finish setting up](#the-finish-setting-up-card)).
- **The list on the left** marks each step done (a tick) or skipped (a dashed circle), and any step is a click away.
- **Finish later**, at the top, takes you to the console. The flow opens again the next time you open the console in a new browser session, until you finish it, and it picks up at the first step you haven't answered.
- **Everything you choose is an ordinary setting.** Each step saves to the same place as [Server > Settings](../admin/server.md#settings) and [Libraries](../admin/libraries.md), so you can change any of it there later.
- **Set by your config.** A setting fixed by an `AUDIOSILO_*` environment variable (or by the desktop app) shows a lock and **Set by your config**, and can't be changed here.

A server that was already in use before this flow existed (it had a library, or more than one account) never shows it.

### Step 1: Where are your books?

Type the folder on the server that holds your audiobooks and press **Check folder** (the screenshot above). AudioSilo checks the folder is there and readable, and shows what it found - the audio files, how many **book folders** and how many **single-file books** - before anything is added.

- **The path as the server sees it.** In Docker that's the path *inside* the container: the right-hand side of the volume, like `/audiobooks` - not the folder on your computer or NAS. Typing the host path is the usual first-run mistake, and this check catches it: the server says the folder "isn't there, or the server can't read it".
- **Folders mounted into the server** (on Linux, including Docker) are offered as buttons under the field; pressing one checks it.
- **No audio files found here** means the folder exists but holds no books AudioSilo recognizes - usually the wrong folder.
- A folder another library already uses gets a warning (adding it again makes a second library with the same books), and a folder inside, or around, a [podcast library's](../admin/podcasts.md) folder is refused.
- **Library name** defaults to the folder's name; it's shown in the apps and the console, and you can rename it later.

Libraries the server already has are listed under **Already added**, the ones from your `config.yaml` or environment marked **From your config**. With a library already there, you can leave the field empty and continue.

The library isn't created yet: that happens at the end of step 3, once its naming and region are chosen, so its very first scan uses them. Until then the folder is remembered by this browser.

### Step 2: How are your books named?

![Step 2: sample books named from tags and from folders](/img/screenshots/setup/naming.png)

Book details - title, author, narrator, series and number - can come from the files' **tags** or from the **folder names**. This step reads up to eight books spread across your folder and shows each one both ways, side by side:

- Rows where the two disagree are highlighted, and a field neither gives reads *none*. The line at the top counts the blank fields each way.
- A book with an Audiobookshelf `metadata.json` shows a **metadata.json** badge: that file is read over both.
- The side with fewer blanks is preselected and marked **Suggested**: **The files' tags first** suits files that are tagged well (most bought audiobooks are), **Folder names first** suits folders that follow `Author / Series / 01 - Title`. Either way, the other one fills what the first leaves empty.

This choice decides every book's names, and changing it later re-reads the whole library, so it's worth a look now. [Organizing your library](./organizing-your-library.md#where-titles-authors-and-series-come-from) explains the two in more detail; the same setting is **Book details come from** on each [library](../admin/libraries.md#where-book-details-come-from).

For a library from your config that has already been scanned, the step shows its current choice. Choosing the other re-reads its books' details straight away (your own edits stay).

### Step 3: Community metadata

![Step 3: community metadata, the marketplace and a local copy](/img/screenshots/setup/metadata.png)

[Community metadata](../admin/server.md#settings) adds descriptions, series and covers from the AudioSilo metadata service. Its lookups are the server's main traffic to the internet, so it's your choice:

- **Look up community metadata**: on or off. Off, nothing about your books leaves the server for it.
- **Audible marketplace**: the store you buy from. The wrong one matches books to the wrong edition.
- **Metadata source**: ask the service for each book, or **keep a local copy** (about 1.8 GB on disk and about 450 MB downloaded a day, so no book is looked up over the internet; it applies after a restart). See [Keeping a local copy](../admin/server.md#keeping-a-local-copy).

**Continue** - or **Skip**, which keeps these settings as they are - adds your library and starts its first scan. From here on the scan's progress shows above each step, and you can carry on while it runs.

### Step 4: How will people reach the server?

![Step 4: the server's addresses and HTTPS](/img/screenshots/setup/reach.png)

Invite links and pairing QR codes are built from the server's addresses, so a wrong one is the usual reason a phone can't connect.

- **This browser reaches the server at** shows the address you're using now, with buttons to use it as the **home address** (an address on your home network, like `http://192.168.1.20:8080`) or the **public address** (one that works from anywhere). An address only this computer can use (`localhost`) is offered as neither.
- **Public address** and **Home address** can also be typed. See [Tell the server its public address](./remote-access.md#tell-the-server-its-public-address) and [its home address](./remote-access.md#tell-the-server-its-home-address).
- **A reverse proxy is in front of the server** appears when your requests arrive through one the server doesn't trust yet; **Trust** adds its address to the trusted proxies, so sessions and devices show each person's real address. See [Behind a reverse proxy](./remote-access.md#behind-a-reverse-proxy).
- **HTTPS** shows the server's mode and what it means for phones. With the default self-signed certificate, the **plain HTTP at home** switch is here too ([why the apps need it](./remote-access.md#plain-http-at-home-how-the-phone-apps-connect)). These apply after a restart; **Change HTTPS in Settings** opens the rest.

### Step 5: Coming from Audiobookshelf?

![Step 5: the Audiobookshelf import](/img/screenshots/setup/abs.png)

If you're moving from Audiobookshelf, AudioSilo can bring each person's listening progress across, so nobody starts their books again. **Open the import** opens [the import](../admin/import.md) in a new tab, leaving the flow where it is. Audiobookshelf's `metadata.json` files in your book folders are read as they are, so their titles, authors, series and descriptions come across with the books.

This step counts as done only once you've opened the import; otherwise it's recorded as skipped, so it waits on the Overview for later.

### Step 6: Backups and updates

![Step 6: the backup schedule, how many to keep, and the update check](/img/screenshots/setup/backups.png)

- **Back up**: when the database (listening progress, edits, accounts) is copied. The default is every day at 03:00, in the server's time zone.
- **Scheduled backups to keep**: the newest 7 by default (1 to 365).
- **Folder**: where backups go. It's shown here but set only in `config.yaml` (`backups.dir`) or `AUDIOSILO_BACKUP_DIR`; copy backups to another disk now and then. See [Backups](../admin/backups.md).
- **Check for new versions**: once a day the server asks GitHub for the newest release. Only the request itself is sent - nothing about your library or people.

### Step 7: Connect a phone

![Step 7: a pairing QR code for your phone](/img/screenshots/setup/phone.png)

Scan the code with your phone's camera: it opens the AudioSilo app, or the web player, signed in as you. The code works once, for ten minutes; **New code** makes another. **Open the web player** opens the player in a new tab, signed in as you. See [Connecting to a server](../listening/connecting.md).

Below them:

- whether **ffmpeg** is ready: with it, books in formats a browser can't play are converted as they stream; without it, those books won't play in the web player.
- a reminder that each person can add their [household members](../listening/household.md) from **Me > Household** in the player.

### Step 8: Add a Bridge

![Step 8: adding a Bridge, with the compose snippet](/img/screenshots/setup/bridge.png)

Optional. A **Bridge** is a companion container that does the work the server won't: it writes to your library folders and runs heavy jobs like generated character sheets and recaps, so the server itself stays read-only. The step shows the lines to add to the compose file that runs your server (**Copy snippet**), and **Connect a bridge** shows the pairing code to enter on the Bridge's page. Once a Bridge is paired, this step shows its setup checklist instead. [Running a Bridge](./running-a-bridge.md) has the whole story.

**Finish setup** (or **Skip and finish**) ends the flow and takes you to the Overview. Any step you never reached counts as skipped.

## The Finish setting up card

![The Overview's Finish setting up card, listing two skipped steps](/img/screenshots/setup/finish-card.png)

When you finish with steps skipped, the Overview shows a **Finish setting up** card listing them. Each one opens that step again; once you've been through what's left, you're back on the Overview. **Dismiss** hides the card for good, for every admin of the server. The settings themselves stay where they always are, under [Server > Settings](../admin/server.md#settings) and [Libraries](../admin/libraries.md).

## What lives in the data directory

The `--data` directory (mounted at `/data` under Docker) is the server's home. After the first run it contains:

- `config.yaml` - all server settings. Most of them can be changed in the admin console under [Server > Settings](../admin/server.md#settings), which writes this file for you; or edit it and restart. See [Remote access](./remote-access.md) for the TLS mode and other network settings.
- `audiosilo.db` - the database: user accounts, listening progress, bookmarks, and a searchable index of your books. The index part is rebuildable from your files at any time; the accounts and progress are the part you'd back up.
- `certs/` - the Let's Encrypt (autocert) certificate cache. In self-signed TLS mode the certificate and key are written at the data directory root instead, as `selfsigned-cert.pem` / `selfsigned-key.pem`.
- `tools/` - ffmpeg/ffprobe, if the native binary had to download them (see [Install the native binary](./install-binary.md)).
- `meta-mirror/` - only when the server [keeps a local copy of the community metadata](../admin/server.md#keeping-a-local-copy): that copy (about 1.8 GB). It is downloaded again whenever it's missing, so it needs no backup.

Your audiobooks are **never** copied in here. The books folder you point a library at stays untouched, and stays the source of truth - see [Organizing your library](./organizing-your-library.md).

## Your first look around

Open the server's address in a browser (with the defaults, `https://your-server:8080` - expect a certificate warning until you've read [Remote access](./remote-access.md)).

The front page is the **connect page**. It's public and deliberately minimal: anyone you invite lands here, enters an auth code, and gets a QR code plus "Open in app" / "Open web player" buttons to pair their device.

![The connect page](/img/screenshots/server/connect-page.png)

The **admin console** lives at `/admin`. Sign in with the admin username and password from the banner or the `--setup` page; on a new server, it opens [Set up your server](#set-up-your-server) first.

![The admin console login](/img/screenshots/admin/login.png)

From here you manage libraries, people, invites and sharing - take the [console tour](../admin/console-tour.md) next. A server with no libraries (because you skipped the books folder) greets you with an **Add your first library** button on the Overview.
