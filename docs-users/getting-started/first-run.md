---
title: Set up your server
description: "Create your admin account, then let the admin console walk you through your own sign-in, your books folder, addresses, backups and your first phone."
---

A new server is set up in two parts. First you get an admin account. Then the admin console walks you through nine short steps, from your own username and password to connecting your phone. Every step can be skipped and changed later.

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

The server keeps only scrambled copies, so it can't show them again. With Docker the banner is at the start of the container's log: `docker compose logs`, or on a NAS the container app's log view (see [Where do I find the server's log?](../troubleshooting.md#where-do-i-find-the-servers-log)). It stays there until the container is recreated.

### If you lose the password

Until an admin signs in with a password, in the console or an app, every later start repeats where the password is:

```text
========================================================
 AudioSilo: the admin account hasn't signed in yet
========================================================
 Sign in at https://localhost:8080/admin as "admin" with the password printed
 when this server first started (the start of the container's log).
 Lost it? Set a new one:
   docker exec -u 1000:1000 <container> audiosilo --data /data reset-admin
========================================================
```

The `reset-admin` command sets a new admin password and prints it once. Run the line for your install:

| Install | Command |
| --- | --- |
| Docker Compose | `docker compose exec -u 1000:1000 audiosilo audiosilo --data /data reset-admin` |
| `docker run` | `docker exec -u 1000:1000 audiosilo audiosilo --data /data reset-admin` |
| Unraid (in the terminal) | `docker exec -u 99:100 audiosilo /app/audiosilo/audiosilo --data /config reset-admin` |
| Synology (over SSH, in `/volume1/docker/audiosilo`) | `sudo docker compose exec -u 1026:100 audiosilo audiosilo --data /data reset-admin` |
| Linux package | `sudo -u audiosilo audiosilo --data /var/lib/audiosilo reset-admin` |
| From a terminal | `./audiosilo --data ./data reset-admin` |

- After `-u`, use your `PUID:PGID`. The reminder prints the right ones.
- `--data` goes before `reset-admin`. With several admins, add the username at the end.
- It works while the server runs. Every session that used the old password is signed out within a minute, and the first-run auth code stops working. If it says revoking that code failed, the new password still works: revoke the code in [People > Invites](../admin/users-and-invites.md).
- It refuses while a restore is waiting for the next start, since the restore would replace the new password. Start the server once, or cancel the restore in [Backups](../admin/backups.md), then run it again.

`reset-admin` also ends the reminder. A server started with `--setup` never prints it.

### Choose the password in your browser instead

Start the program with `--setup` (see [Install without Docker](./install-binary.md)). The server then prints a one-time link instead of a password.

1. Open the link from the server's log. (The normal sign-in page can't create the first admin.)
2. Choose an admin username and a password of at least 8 characters.
3. Press **Create account**, then **Continue setup**, and sign in.

![The --setup page: create your admin account](/img/screenshots/server/setup-wizard.png)

![Your account is ready, with Continue setup](/img/screenshots/server/setup-wizard-done.png)

The link stops working as soon as an admin account exists.

## Set up your server

The first time you open the admin console, it opens **Set up your server**, with the steps listed down the side. Until setup is finished, opening `/admin` starts the flow once in each browser session.

- Every step has **Skip**. A skipped step waits on the Overview (see [The Finish setting up card](#the-finish-setting-up-card)).
- **Finish later** takes you to the console until your next browser session.
- Everything you choose is an ordinary setting, which you can change later in [Server > Settings](../admin/server.md#settings) and [Libraries](../admin/libraries.md). A setting fixed by an `AUDIOSILO_*` environment variable shows a lock.

### Step 1: Your account

![Step 1 of Set up your server: your username and password](/img/screenshots/setup/account.png)

Choose the username and password you sign in to the console with. The username is also what you type in the apps.

- If you signed in with the password from the log, the step asks for a new one. Type it twice, then the log's password as **Current password**.
- If you chose your password on the `--setup` page, a new one is optional.
- **Keep admin and this password** skips the step.

A new password doesn't end the auth code from the log. Once your devices are set up, revoke it in [People > Invites](../admin/users-and-invites.md).

### Step 2: Where are your books?

![Step 2: the books folder](/img/screenshots/setup/folder.png)

Type the folder that holds your audiobooks and press **Check folder**. AudioSilo shows how many books it found before adding anything.

- **Use the path as the server sees it.** In Docker that's the path inside the container, like `/library`, not the folder on your NAS. Folders mounted into the server are offered as buttons under the field.
- **No audio files found here** usually means the wrong folder.
- **Library name** defaults to the folder's name.

The library is created at the end of step 4, so its first scan uses your choices from steps 3 and 4.

### Step 3: How are your books named?

![Step 3: sample books named from tags and from folders](/img/screenshots/setup/naming.png)

Titles, authors, narrators and series can come from the files' **tags** or from the **folder names**. This step shows up to eight of your books both ways, side by side. The side with fewer blanks is marked **Suggested**.

- **The files' tags first** suits well-tagged files, like most bought audiobooks.
- **Folder names first** suits folders named like `Author / Series / 01 - Title`.

Either way, the other fills in what the first leaves empty. Changing this later re-reads the whole library, so it's worth a look now. See [Organize your audiobook files](./organizing-your-library.md#where-titles-authors-and-series-come-from).

### Step 4: Community metadata

![Step 4: community metadata, the marketplace and a local copy](/img/screenshots/setup/metadata.png)

Community metadata adds descriptions, series and covers from the community database on AudioSilo Meta.

- **Look up community metadata** turns it on or off. Off, nothing about your books leaves the server for it.
- **Audible marketplace** is the store you buy from. The wrong one matches the wrong edition. Until one is chosen, the step picks the store nearest you from your browser's language and time zone.
- **Metadata source** asks AudioSilo Meta for each book, or keeps a [local copy](../admin/server.md#keeping-a-local-copy) (about 1.8 GB).

**Continue** (or **Skip**) adds your library and starts its first scan. You can carry on while it runs.

### Step 5: How will people reach the server?

![Step 5: the server's addresses and HTTPS](/img/screenshots/setup/reach.png)

Invite links and QR codes use the server's addresses. A wrong address is the usual reason a phone can't connect.

- **Home address** is the server's address on your home network, like `http://192.168.1.20:8080`.
- **Public address** works from anywhere, like `https://books.example.com`.
- The buttons under **This browser reaches the server at** fill either one with the address you're using now.
- If your requests come through a reverse proxy, **Trust** adds it to the trusted proxies.
- **Plain HTTP at home** lets the iOS and Android apps connect at home (see [Plain HTTP at home](./remote-access.md#plain-http-at-home-how-the-phone-apps-connect)).

See [Reach your server from outside your home](./remote-access.md).

### Step 6: Coming from Audiobookshelf?

![Step 6: the Audiobookshelf import](/img/screenshots/setup/abs.png)

This step runs the [Audiobookshelf import](../admin/import.md) right here. Connect to Audiobookshelf, review what matches for each person, then apply it. It brings each person's listening progress across, and Audiobookshelf's ASIN and ISBN for your books as hints for matching.

- **Wait for the scan to finish.** The import pairs Audiobookshelf's books with the ones the scan finds, so **Connect** stays off while the library's first scan runs.
- **Then match your books.** If community metadata is on and books are not matched, the step says how many, with **Match automatically**. It opens Library health in a new tab, where you start the run and review what it found. Nothing is matched until you apply it.
- **Continue** moves on whether or not you imported anything. The import stays in **Server > Settings > Import**.

AudioSilo also reads the `metadata.json` files Audiobookshelf leaves beside your books. [Move over from Audiobookshelf](./coming-from-audiobookshelf.md) covers the rest.

### Step 7: Backups and updates

![Step 7: the backup schedule, how many to keep, and the update check](/img/screenshots/setup/backups.png)

- **Back up** sets when the database is copied. The default is every day at 03:00.
- **Scheduled backups to keep** defaults to 7.
- **Check for new versions** asks GitHub once a day for the newest release. Nothing about your library is sent.

Copy backups to another disk now and then. See [Backups](../admin/backups.md).

### Step 8: Add a Bridge

![Step 8: adding a Bridge, with the compose snippet](/img/screenshots/setup/bridge.png)

Optional. A **Bridge** is a companion container that writes to your library folders and runs heavy jobs, like downloading podcasts. The server itself stays read-only.

1. Press **Copy snippet** and add the lines to the compose file that runs your server.
2. Replace each `/path/to/...` with that library's folder on your computer or NAS.
3. Press **Connect a Bridge** for the pairing code to enter on the Bridge's page.

[Add a Bridge](./running-a-bridge.md) has the full setup.

### Step 9: Connect a phone

![Step 9: a pairing QR code for your phone, and how signing in works](/img/screenshots/setup/phone.png)

Install the AudioSilo app on your phone, open it and tap **Scan a QR code**, then scan this code. The app signs in as you. The code works once, for ten minutes, and **New code** makes another. With no camera to hand, enter the server's address in the app and sign in with your username and password, or with the auth code from the log. See [Connect the app to your server](../listening/connecting.md).

If you opened the console on the server itself (`localhost`), the code needs a home or public address from [step 5](#step-5-how-will-people-reach-the-server). The step tells you if one is missing.

Everyone else needs an invite of their own. **Invite someone** opens one in People. An invite signs them in, so they don't need a password.

**Finish setup** ends the flow and opens the Overview. If a choice needs a restart (a local metadata copy or an HTTPS setting), the Overview reminds you until the server restarts.

## The Finish setting up card

![The Overview's Finish setting up card, listing a skipped step](/img/screenshots/setup/finish-card.png)

If you skipped steps or chose **Finish later**, the Overview shows a **Finish setting up** card. Each line opens that step again. **Dismiss** hides the card for every admin.

## What's in the data folder

The data folder (`--data`, or `/data` under Docker) holds:

- `config.yaml`: the server's settings, written by the admin console.
- `audiosilo.db`: accounts, listening progress, bookmarks and the index of your books. Back this up.
- `backups/`: the server's [backups](../admin/backups.md) of `audiosilo.db`, unless you set another backups folder.
- `certs/` and `selfsigned-*.pem`: certificates.
- `tools/`, `cache/` and `meta-mirror/`: tools and copies the server fetches or makes again when needed.

Your audiobooks are never copied here. See [Organize your audiobook files](./organizing-your-library.md).

Next, take the [console tour](../admin/console-tour.md).
