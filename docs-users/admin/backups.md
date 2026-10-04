---
title: "Backups and restoring"
description: "Back up the AudioSilo server's database from the admin console: what a backup holds and what it doesn't, the schedule, how many are kept and where, downloading a copy, and restoring one at the next start."
---

Your audiobooks are files in your own folders, and AudioSilo never changes
them. Everything else lives in the server's **database**: who has an account,
how far everyone got in every book, bookmarks, notes, your metadata edits,
shares, invites and devices. The book list in it can be rebuilt by scanning
your folders again; the rest can't. A **backup** is a copy of that database.

Backups live in **Server > Settings > Backups** in the
[admin console](console-tour.md).

![Server > Settings > Backups](/img/screenshots/admin/settings-backups.png)

## What is in a backup

A backup is one file holding the whole database at the moment it was made:

- accounts (with their password hashes, never the passwords themselves),
  signed-in devices and API keys, and invites;
- listening progress, bookmarks, notes, history and favourites;
- shares and who can see what;
- your metadata edits, custom covers and folder detection choices;
- the [audit log](server.md#audit-log), your
  [notification](notifications.md) destinations, and the event list behind the
  bell.

It does **not** hold:

- your audiobooks (back up your book folders on their own);
- the server's settings file, `config.yaml` (the server name, address, HTTPS
  and the other [settings](server.md#settings)), or its HTTPS certificates.
  Keep a copy of the data folder's `config.yaml` with your backups.

## The schedule

The **Schedule** card:

- **Back up** - **Off**, **Every day** or **Every week**, then (for a weekly
  backup) the day and the time. The time is the server's own time zone. Out of
  the box the server backs up every day at 03:00.
- **Scheduled backups to keep** - how many scheduled backups stay in the
  folder, 7 out of the box (anything from 1 to 365). Once there are more, the
  oldest scheduled backup is deleted each time a new one is made. Backups you
  make with **Back up now** are never deleted for you: they stay until you
  delete them.
- **Folder** - where backups are kept: a `backups` folder inside the server's
  data folder unless you choose another one. It can't be changed here, only in
  `config.yaml` (`backups.dir`) or with the `AUDIOSILO_BACKUP_DIR` environment
  variable, and a new folder is used from the next restart.

Press **Save changes** to apply a new schedule. It takes effect at once, no
restart needed. The line under the list says when the next backup runs.

:::tip Keep a copy somewhere else
A backup on the same disk as the server is lost with it. Point the folder at
another disk (a NAS share, a second drive) in `config.yaml`, or download a
backup now and then and keep it somewhere else. Either way, keep it private: a
backup holds every account's password hashes.
:::

## The list

The **Backups** card lists every backup, newest first, with when it was made,
its kind, its file name and size:

- **Scheduled** - made by the schedule.
- **Manual** - made with **Back up now** (or a backup file you copied into the
  folder yourself).
- **Before a restore** - the copy of the database that a restore replaced.

**Back up now** makes a backup straight away; the button says "Backing up..."
until it's done, and a message says how it went. For each backup:

- **Download** saves the file to your computer. Downloads are recorded in the
  [audit log](server.md#audit-log).
- **Restore...** puts the server back to that backup (see below).
- The bin deletes it from the server's folder ("Delete this backup?"). Copies
  you downloaded aren't affected.

If a backup fails, a notice says so with the reason: the disk is full, the
server can't write to its backups folder (check the folder's permissions), or
something else (the cause is in [Server > Logs](server.md#logs)). The same
shows as **Failed** on [Health > System](health.md#system), and you can have
it [sent to you](notifications.md).

## Restoring a backup

A restore replaces the server's whole database with the backup, so everything
done since that backup was made is lost. It never happens while the server is
running: you choose the backup now, and the server swaps it in the next time it
starts.

1. Press **Restore...** on the backup you want.
2. Read what will happen, type `restore` in the box, and press **Restore at
   the next start**.

   ![Restore this backup?](/img/screenshots/admin/backup-restore.png)

   Before accepting it, the server checks the file: a damaged file, or one
   that isn't an AudioSilo backup, is refused, and so is a backup made by a
   newer version of AudioSilo (update this server first). A backup from an
   older version is fine: it is brought up to date when the server starts.
3. A notice, "A restore is waiting for a restart", now sits at the top of the
   page, with **Cancel restore** if you change your mind. Nothing has changed
   yet.
4. Restart the server the way you started it (`docker compose restart`,
   restarting the service, or quitting and starting the program again).

When the server starts, it checks the backup again, **keeps a copy of the
current database first** (it appears in the list as **Before a restore**),
then puts the backup in its place. Afterwards the Backups page says "Restored
from *backup* (*time*)" and names the copy it kept. To undo the restore,
restore that copy the same way.

If the backup can't be used when the server starts (it was deleted in the
meantime, or it turned out to be damaged), the server starts with its database
as it was, and the page says "The restore from *backup* wasn't applied" and
why. It doesn't try again at the next start.

What to expect after a restore:

- Accounts, passwords, progress, bookmarks, edits, shares, invites and devices
  are as they were when the backup was made.
- Phones and browsers set up after the backup must sign in again. Devices you
  signed out after it was made are signed in again, so sign them out again on
  [People > Devices](users-and-invites.md#the-devices-page) if that matters.
- Settings in `config.yaml` stay as they are, and the server's identity does
  too, so the apps still recognise it.
- Your books are read again from your folders when the server starts, so books
  added since the backup come back on their own.
- The restore is recorded in the [audit log](server.md#audit-log).

### Restoring a copy you kept elsewhere

The server only restores backups that are in its backups folder. To restore a
file you downloaded, copy it back into the folder, keeping its name (it starts
with `audiosilo-` and ends with `.db`). It appears in the list, and **Restore...**
works as above.

This is also how you move to a new disk or machine: install AudioSilo, sign
in to the new server's console once, copy your backup into its backups folder,
restore it and restart. Copy your old `config.yaml` into the new data folder
too if you want the same settings.

## Where to next

- [Notifications](notifications.md) - hear about a failed backup.
- [Server settings, updates and logs](server.md) - the other settings, and the
  audit log.
- [Health > System](health.md#system) - the backups at a glance.
