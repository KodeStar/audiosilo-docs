---
title: "Back up your server"
description: "Back up your server's database on a schedule or by hand, keep a copy somewhere safe, and restore one when you need to."
---

AudioSilo backs up its **database** every day by itself: accounts, everyone's
progress, bookmarks, notes, your edits, shares and invites. Your audiobooks are
not in it, so back up your book folders separately. You manage backups in
**Server > Settings > Backups** in the [admin console](console-tour.md).

![Server > Settings > Backups](/img/screenshots/admin/settings-backups.png)

## What is in a backup

A backup is one file holding the whole database. It does **not** hold:

- your audiobooks;
- the settings file, `config.yaml`, or your HTTPS certificates. Keep a copy of
  the data folder's `config.yaml` with your backups.

A backup holds every account's password hashes, so keep it private.

## The schedule

The **Schedule** card sets:

- **Back up** - **Off**, **Every day** or **Every week**, and the time. Out of
  the box, every day at 03:00 (the server's time zone). If the server was off
  when a backup was due, it makes one when it is back.
- **Scheduled backups to keep** - 7 by default (1 to 365). The oldest scheduled
  backup is deleted when a new one is made.
- **Folder** - a `backups` folder in the data folder, unless you set
  `backups.dir` in `config.yaml` or `AUDIOSILO_BACKUP_DIR`. A new folder is used
  after a restart.

Press **Save changes** to apply a new schedule.

:::tip[Keep a copy somewhere else]
A backup on the same disk as the server is lost with it. Point the backups
folder at another disk, or download a backup now and then and keep it
elsewhere.
:::

## Making and downloading backups

The **Backups** card lists every backup, newest first.

- **Back up now** makes one straight away. These are never deleted for you.
- **Download** saves a backup to your computer.
- The bin deletes a backup from the server.

If a backup fails, a notice gives the reason, such as a full disk or a folder
the server can't write to. You can have it [sent to you](notifications.md).

## Before an upgrade

When a new version of the server needs to change the database, it copies the
database first. The copy shows in the list as **Before an upgrade**. The newest
three are kept, apart from your scheduled backups.

If the copy can't be made (a full disk, say), the server starts anyway. So with
little room left, make a backup yourself before you update.

To go back to the version you had, run it again and restore the **Before an
upgrade** backup made when you updated.

## Restoring a backup

A restore replaces the whole database with the backup. Everything done since
that backup is lost. The server swaps it in the next time it starts.

1. Press **Restore...** on the backup you want.
2. Type `restore` in the box and press **Restore at the next start**.

   ![Restore this backup?](/img/screenshots/admin/backup-restore.png)

3. Restart the server the way you started it (for example
   `docker compose restart`).

Changed your mind before restarting? Press **Cancel restore**.

When the server starts, it saves the current database as a **Before a restore**
backup, then puts your backup in its place. To undo the restore, restore that
copy the same way. If the backup can't be used, the server starts as it was and
the Backups page says why.

After a restore:

- Accounts, progress, edits, shares and invites are as they were when the
  backup was made.
- Devices set up since the backup must sign in again.
- Devices you signed out since the backup work again. Sign them out again on
  [People > Devices](users-and-invites.md#the-devices-page).
- Your settings in `config.yaml` stay as they are.
- Books added since the backup come back on their own: the server reads your
  folders again when it starts.

A backup from an older version works. One from a newer version doesn't: update
this server first.

### Restoring a copy you kept elsewhere

The server only restores backups in its backups folder. Copy your file back into
that folder, keeping its name (it starts with `audiosilo-` and ends with `.db`).
It then appears in the list.

**Moving to a new machine** works the same way:

1. Install AudioSilo and sign in to the new console once.
2. Copy your backup into its backups folder.
3. Restore it and restart.
4. Copy your old `config.yaml` into the new data folder if you want the same
   settings.
