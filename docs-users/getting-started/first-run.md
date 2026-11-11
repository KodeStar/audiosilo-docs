---
title: Set up your server
description: "Create your admin account, then let the admin console walk you through your books folder, addresses, backups and your first phone."
---

A new server is set up in two parts. First you get an admin account. Then the admin console walks you through eight short steps, from your books folder to connecting your phone. Every step can be skipped and changed later.

## Your admin account

On its very first start, the server creates an `admin` account with a random password. It prints the password and an auth code to its log, **once**:

```text
========================================================
 AudioSilo first-run setup - store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : <data dir>/config.yaml
--------------------------------------------------------
 Finish setting up: open https://localhost:8080/admin and sign in as admin.
 Connect a device: open https://localhost:8080/ and enter the auth code.
 (API: POST /api/v1/auth/redeem or /api/v1/auth/login.)
========================================================
```

Save both now:

- The **admin password** signs you in to the admin console at `/admin`.
- The **auth code** signs a phone or browser in as the admin, from the connect page. See [Connect the app to your server](../listening/connecting.md).

The server keeps only scrambled copies, so it can't show them again. Under Docker, `docker compose logs` shows the banner until the container is recreated.

:::warning[Missed the banner?]
Before you've added people or listening, the simplest fix is to start over. Stop the server, delete the data folder, and start it again for a fresh banner. Later, see [I lost the first-run admin password](../troubleshooting.md#i-lost-the-first-run-admin-password).
:::

### Choose the password in your browser instead

Start the program with `--setup` (see [Install without Docker](./install-binary.md)). The server then prints a one-time link instead of a password.

1. Open the link from the server's log. (The normal sign-in page can't create the first admin.)
2. Choose an admin username and a password of at least 8 characters.
3. Press **Create account**, then **Continue setup**, and sign in.

![The --setup page: create your admin account](/img/screenshots/server/setup-wizard.png)

![Your account is ready, with Continue setup](/img/screenshots/server/setup-wizard-done.png)

The link stops working as soon as an admin account exists.

## Set up your server

The first time you open the admin console, it opens **Set up your server**, with the steps listed down the side.

![Step 1 of Set up your server: the books folder](/img/screenshots/setup/folder.png)

- Every step has **Skip**. A skipped step waits for you on the Overview (see [The Finish setting up card](#the-finish-setting-up-card)).
- **Finish later** takes you to the console. The flow opens again in your next browser session.
- Everything you choose is an ordinary setting. You can change it later in [Server > Settings](../admin/server.md#settings) and [Libraries](../admin/libraries.md).
- A setting fixed by an `AUDIOSILO_*` environment variable shows a lock and can't be changed here.

### Step 1: Where are your books?

Type the folder that holds your audiobooks and press **Check folder**. AudioSilo shows how many books it found before adding anything.

- **Use the path as the server sees it.** In Docker that's the path inside the container, like `/library`, not the folder on your NAS. If the server says the folder isn't there, this is usually why.
- Folders mounted into the server are offered as buttons under the field.
- **No audio files found here** usually means the wrong folder.
- **Library name** defaults to the folder's name. You can rename it later.

The library is created at the end of step 3, so its first scan uses your choices from steps 2 and 3.

### Step 2: How are your books named?

![Step 2: sample books named from tags and from folders](/img/screenshots/setup/naming.png)

Titles, authors, narrators and series can come from the files' **tags** or from the **folder names**. This step shows up to eight of your books both ways, side by side. The side with fewer blanks is marked **Suggested**.

- **The files' tags first** suits well-tagged files, like most bought audiobooks.
- **Folder names first** suits folders named like `Author / Series / 01 - Title`.

Either way, the other fills in what the first leaves empty. Changing this later re-reads the whole library, so it's worth a look now. See [Organize your audiobook files](./organizing-your-library.md#where-titles-authors-and-series-come-from).

### Step 3: Community metadata

![Step 3: community metadata, the marketplace and a local copy](/img/screenshots/setup/metadata.png)

Community metadata adds descriptions, series and covers from the community database on AudioSilo Meta.

- **Look up community metadata** turns it on or off. Off, nothing about your books leaves the server for it.
- **Audible marketplace** is the store you buy from. The wrong one matches the wrong edition.
- **Metadata source** asks AudioSilo Meta for each book, or keeps a [local copy](../admin/server.md#keeping-a-local-copy) (about 1.8 GB).

**Continue** (or **Skip**) adds your library and starts its first scan. You can carry on while it runs.

### Step 4: How will people reach the server?

![Step 4: the server's addresses and HTTPS](/img/screenshots/setup/reach.png)

Invite links and QR codes use the server's addresses. A wrong address is the usual reason a phone can't connect.

- **Home address** is the server's address on your home network, like `http://192.168.1.20:8080`.
- **Public address** works from anywhere, like `https://books.example.com`.
- The buttons under **This browser reaches the server at** fill either one with the address you're using now.
- If your requests come through a reverse proxy, **Trust** adds it to the trusted proxies.
- **Plain HTTP at home** lets the iOS and Android apps connect at home (see [Plain HTTP at home](./remote-access.md#plain-http-at-home-how-the-phone-apps-connect)).

See [Reach your server from outside your home](./remote-access.md).

### Step 5: Coming from Audiobookshelf?

![Step 5: the Audiobookshelf import](/img/screenshots/setup/abs.png)

**Open the import** brings each person's listening progress across from Audiobookshelf (see [the import](../admin/import.md)). It opens in a new tab. Audiobookshelf's `metadata.json` files are read as they are, with nothing to set.

### Step 6: Backups and updates

![Step 6: the backup schedule, how many to keep, and the update check](/img/screenshots/setup/backups.png)

- **Back up** sets when the database is copied. The default is every day at 03:00.
- **Scheduled backups to keep** defaults to 7.
- **Check for new versions** asks GitHub once a day for the newest release. Nothing about your library is sent.

Copy backups to another disk now and then. See [Backups](../admin/backups.md).

### Step 7: Connect a phone

![Step 7: a pairing QR code for your phone](/img/screenshots/setup/phone.png)

Scan the code with your phone's camera. It opens the app, or the web player, signed in as you. The code works once, for ten minutes; **New code** makes another. See [Connect the app to your server](../listening/connecting.md).

If you opened the console on the server itself (`localhost`), the code needs a home or public address from [step 4](#step-4-how-will-people-reach-the-server). The step tells you if one is missing.

### Step 8: Add a Bridge

![Step 8: adding a Bridge, with the compose snippet](/img/screenshots/setup/bridge.png)

Optional. A **Bridge** is a companion container that writes to your library folders and runs heavy jobs, like downloading podcasts. The server itself stays read-only.

1. Press **Copy snippet** and add the lines to the compose file that runs your server.
2. Replace each `/path/to/...` with that library's folder on your computer or NAS.
3. Press **Connect a Bridge** for the pairing code to enter on the Bridge's page.

[Add a Bridge](./running-a-bridge.md) has the full setup.

**Finish setup** ends the flow and opens the Overview. If a choice needs a restart (a local metadata copy or an HTTPS setting), the Overview reminds you until the server restarts.

## The Finish setting up card

![The Overview's Finish setting up card, listing two skipped steps](/img/screenshots/setup/finish-card.png)

If you skipped steps or chose **Finish later**, the Overview shows a **Finish setting up** card. Each line opens that step again. **Dismiss** hides the card for every admin.

## What's in the data folder

The data folder (`--data`, or `/data` under Docker) holds:

- `config.yaml`: the server's settings. The admin console writes it for you.
- `audiosilo.db`: accounts, listening progress, bookmarks and the index of your books. Back this up.
- `certs/` and `selfsigned-*.pem`: certificates.
- `tools/`: ffmpeg and ffprobe, if the server downloaded them.
- `cache/` and `meta-mirror/`: copies the server makes again when needed. No backup needed.

Your audiobooks are never copied here. See [Organize your audiobook files](./organizing-your-library.md).

Next, take the [console tour](../admin/console-tour.md).
