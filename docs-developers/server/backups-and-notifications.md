---
title: "Backups, audit log and notifications"
description: "internal/backup (VACUUM INTO backups on a schedule, retention, restore applied at the next start), the admin audit log (catalog/audit.go), and internal/notify (the event feed behind the console's bell, and webhook, ntfy and Discord deliveries with their payloads, signature and retry rules)."
---

Three server features from admin console Phase 5b. They share one migration
(`0019_audit_notifications.sql`, see [Data model](data-model.md#audit-and-notifications))
and one rule: **no secret ever leaves through them**. A backup is the exception
by nature (it is the database), so it stays in a folder only the server's user
can read and every download is audited.

The endpoints are in the reference:
[Admin: backups](api/reference.md#admin-backups),
[Admin: notifications and events](api/reference.md#admin-notifications-and-events) and
[Admin: audit log](api/reference.md#admin-audit-log). The settings are
`backups.schedule`, `backups.keep` and `backups.dir`
([configuration](configuration.md#backups-backups)).

## Backups (`internal/backup`)

A backup is the **whole SQLite database** written with `VACUUM INTO`
(`store.DB.VacuumInto`) into the backups folder: `backups.dir`, or
`<data>/backups` when it is empty. `VACUUM INTO` reads the database in one read
transaction, so writers carry on (WAL) and the copy is the database as of the
moment it began, compacted and self-contained (no `-wal` beside it). It runs on
a short-lived connection of its own: the reader pool is `query_only`, which
refuses it, and the single writer would hold every write back for as long as
the copy takes.

What is in it: accounts and their password hashes, sessions and API keys
(as token hashes), invites, progress, bookmarks, notes, history, listening
sessions, favourites, shares, metadata edits, custom covers, folder detection
choices, ignored issues, the audit log, notification destinations (their
addresses and secrets included) and the event feed. The library index is in it
too, though the next scan would rebuild it anyway. **Not** in it:
`config.yaml`, the certificates, downloaded tools, and the audiobooks.

**Files.** Each backup is `audiosilo-<UTC time>-<kind>.db`, the time as
`20060102-150405Z` and the kind one of `scheduled`, `manual` or
`before-restore`. It is written under a hidden temporary name
(`.audiosilo-….db.tmp`), set to mode `0600` (it holds password and token
hashes), then renamed into place, so a half-written file is never listed; the
folder is created `0700`. A server that stops mid-backup leaves the temporary
file, which `Service.Run` removes at the next start. Two backups of one kind in
the same second fail (the name exists).

Only names matching `backup.validName` (`audiosilo-` + up to 101 plain
characters + `.db`, no `..`) are listed, served, deleted or restored, and only
regular files (`os.Lstat`: a symlink is never followed). A name from a request
therefore can't leave the folder. A file copied into the folder under such a
name from elsewhere is listed as `manual`, dated by its modification time.

**Schedule.** `backups.schedule` is `""` (off), `daily:HH:MM` or
`weekly:DAY:HH:MM` (`DAY` is `mon` … `sun`), in the server's local time zone;
the default is `daily:03:00`. `backup.ParseSchedule` checks it (two-digit hour
and minute), and the settings normalizer stores the canonical form.
`Service.Run` (started by `pkg/launcher`) wakes every minute, and at once when
the settings change (`SetSettings`). The next slot is counted from the newest
scheduled backup in the folder, whenever it was made (from when `Run` started
when there is none), or from the newest scheduled attempt (`tried`) when that
is later. Counting from the newest backup is what makes a server that was off
at its time **catch up**: its next slot has already passed, so one backup (however
many slots were missed) is made within a minute of the start. Counting from the attempt means a failed
backup waits for its next slot instead of retrying every minute.

**Retention.** After each successful *scheduled* backup, `prune` deletes the
scheduled backups past the newest `backups.keep` (1-365, default 7). Manual and
before-restore backups are never pruned: they stay until an admin deletes them.
Nor is the scheduled backup a waiting restore names (the next start would find
it gone); if the restore marker can't be read, nothing is pruned that time.
Lowering `keep` takes effect at the next scheduled backup.

**Status.** `Service.Status` is what the console shows (and
[`GET /admin/system`](api/reference.md#get-apiv1adminsystem)'s `backups`
block): the folder, whether a backup is being made, `last` (the newest attempt
since the server started, with a short `error`: `disk_full`,
`permission_denied` or `failed`; the cause is in the log), `latest` (the newest
backup in the folder that isn't a before-restore copy, whenever it was made)
and `next` (`null` when the schedule is off). A failed backup calls
`OnFailure`, which the launcher wires to the `backup_failed` notification; a
backup cut short because the server is stopping is not announced.

`Start` (what `POST /admin/backups` calls) marks the service as running before
it returns, so the request's own answer already reads `running: true`, then
makes a manual backup in the background, bound to the server's lifetime rather
than the request's (so it stops with the server, unannounced). A second
backup while one runs is refused (`ErrBusy`, answered `409 backup_running`).

## Restore at the next start

A restore never swaps the database under a running server. It is two steps:

1. **`RequestRestore`** (`POST /admin/backups/{name}/restore`) takes a quick
   look with `store.Inspect(…, false)`: opened read-only (`mode=ro`), it must
   have a `schema_migrations` table whose every name is a migration this server
   ships (a backup from a newer server fails with `store.ErrNewerDatabase`,
   answered `400 backup_too_new`) and a `users` table. Anything else is
   `store.ErrNotADatabase` (`400 invalid_backup`). The full integrity check
   (`PRAGMA quick_check`, which reads every page) is left for the start, so a
   request stays quick.
   Then it writes the marker `<data>/restore.json`
   (`{"name", "requested_at", "requested_by", "schema"}`), replacing any restore
   already waiting. `DELETE /admin/restore` removes it; deleting the backup it
   names removes it too.
2. **`ApplyPendingRestore`** runs in `pkg/launcher.Run` before `store.Open`.
   With no marker it does nothing. Otherwise it checks the backup again, in
   full this time (`store.Inspect(…, true)`, with `quick_check`): `missing` when
   the file is gone, `unusable` when it is damaged or not an AudioSilo database,
   `newer` for a newer server's. Then it copies it beside the database as
   `audiosilo.db.restoring` and keeps the current database:
   - normally as a backup of kind `before-restore` in the backups folder,
     written with `store.VacuumFile` (a `VACUUM INTO` of the file and its WAL,
     without opening it as the server's database);
   - if that copy fails (the database may be why it is being restored), by
     renaming `audiosilo.db` and its `-wal`/`-shm` to
     `audiosilo.db.before-restore-<time>` beside it in the data folder,
     untouched (if one of those renames fails, the files already moved are put
     back, so the database is never left without its WAL).

   It then removes the old `-wal` and `-shm` and renames the staged file to
   `audiosilo.db`. `store.Open` migrates it as usual, so an older backup is
   brought up to the current schema.

Whatever happened, the outcome goes to `<data>/restore-result.json`
(`{"name", "applied_at", "requested_by", "ok", "error", "safety_copy"}`, where
`error` is `missing`, `unusable`, `newer` or `failed` and `safety_copy` is the
before-restore backup's name or the kept-aside file's), and the marker is
**always removed**: a refused restore is reported once, in the console, rather
than retried at every start, and the database is left as it was. A marker that
can't be read (damaged JSON) is handled the same way: the outcome is `failed`
with no `name`, the marker is removed, and the server starts on its database as
it was. The launcher
then records it in the (now current) database's audit log as the server's own
act (`via: "system"`, `backup.restore_applied` or `backup.restore_failed`, with
`requested_by` and `safety_copy` or `error`). `GET /admin/backups` returns both
files' contents as `restore.pending` and `restore.last`; the console shows the
last outcome for 14 days.

Because the database goes back as a whole, so do the credentials in it:
devices signed in after the backup was made must sign in again, and a session
or API key revoked since is valid again. `config.yaml` (and so the
`server_id` players key on) is untouched.

## Audit log

`audit_events` (one row per admin change) is written by `API.audit`
(`internal/api/handlers_audit.go`) **after** a change succeeds, with an action
code (`<area>.<verb>`), a short human target (a username, a library name, a
book's `<library>: <path>`, a backup's file name) and a small JSON object of
details. Recording is best effort: the change has happened, so a failed insert
is logged, not answered as an error. The actor's id and username are copied
(no foreign key, so deleting or renaming an account keeps its history), with
`via` `session` (the console or another signed-in app), `api` (a personal API
key) or `system`. No IP address is stored.

| Area | Actions |
|---|---|
| `user` | `create`, `update`, `delete`, `recovery_clear` |
| `invite` | `create`, `rotate`, `revoke` |
| `library` | `create`, `update`, `reorder`, `folder_override`, `delete` |
| `book` | `edit`, `bulk_edit`, `enrichment`, `cover_set`, `cover_remove` |
| `share` | `create`, `update`, `delete`, `add_paths`, `remove_paths`, `grant`, `revoke` |
| `device` | `revoke` |
| `progress` | `edit` |
| `issue` | `ignore`, `unignore` |
| `settings` | `update` (details: `changes`, each `{setting, from, to}`) |
| `backup` | `create`, `download`, `delete`, `restore`, `restore_cancel`, `restore_applied`, `restore_failed` |
| `notify` | `create`, `update`, `delete` |

Details never hold a secret: a password change reads `password: "set"` or
`"cleared"`, an invite carries its limits but never its code, a share's paths
are listed as a count and the first ten, and a notification destination's
change says `address_changed` / `secret_changed` without either value.
Deliberately **not** audited: sign-ins and listening (Activity and People >
Devices have them), scans, rescans and job cancels (Health > Jobs keeps their
history), and anything a non-admin does. Backup **downloads** are audited
(a `GET`; a `HEAD` sends nothing and isn't), since a backup holds every
account's hashes.

`catalog.PruneAudit` runs at start and then daily (`launcher.retention`, with
the session roll-up): it deletes events older than 365 days
(`catalog.AuditRetention`) and anything past the newest 100,000.

## Notifications (`internal/notify`)

`notify.Service` records what happened in the event feed (`server_events`, the
console's bell) and delivers it to the enabled destinations subscribed to its
kind. A nil `*Service` does nothing, so callers don't check.

### Events

| Kind | Fired by | `data` |
|---|---|---|
| `book_added` | `Scanner.OnRunFinished`: a scan job ending `ok` or `partial` that added books (once per scan) | `library`, `library_id`, `count`, `titles` (the first five) |
| `scan_failed` | a scan job ending `failed` | `library`, `library_id`, `run_id`, `detail` (the error, as the scan's log has it: **bell only**, see below) |
| `library_unavailable` | a scan job ending `unavailable`, only when the library's previous scan that reached an answer wasn't (`catalog.PreviousRunStatus` passes over cancelled, interrupted and running scans, so a restart in between doesn't announce it again) | `library`, `library_id` |
| `new_device` | every pairing exchange (`POST /auth/exchange`), and a password sign-in (`POST /auth/login`) unless its `device_id` was already carried by an earlier session of the same person (`auth.IssueSession`; a sign-in without one always counts); not for demo accounts | `user`, `device` (the name the client sent, one plain line of at most 100 characters), `app` (from `X-AudioSilo-Client`, may be empty) |
| `invite_redeemed` | a pairing exchange whose token came from an invite code | `user` (whose invite), `device` |
| `update_available` | `updates.Checker.OnAvailable` after a check that finds a newer release; announced **once per version** (`dedup_key` is the version) | `version`, `name`, `url` (the release page) |
| `backup_failed` | `backup.Service.OnFailure` (scheduled or manual) | `trigger`, `error` (`disk_full`, `permission_denied`, `failed`) |

`notify.Kinds` lists them in this order, which is the order the console shows.

A failed scan's `detail` is the tool's or the operating system's own message,
which can name a folder on the server, so it stays inside: the bell shows it,
but no destination is sent it (`internalData`, stripped by `outbound` from a
webhook's `data`), and the message text of every `scan_failed` delivery is the
generic "See the scan's log in Health > Jobs."

### Delivery

`Emit` records the event, then queues one delivery per enabled destination
whose `events` include its kind. It never blocks: four workers drain a queue of
256, and a delivery that finds the queue full is dropped (and logged). Each
delivery is one `POST` with a 10 second timeout, retried **twice** (after 10
seconds, then a minute) when it timed out, couldn't connect, or got a `429` or
a `5xx`; any other status fails at once. A retry is queued again after its
delay (`time.AfterFunc`) rather than waited out on a worker, so a destination
that doesn't answer holds a worker for one attempt at a time and never delays
the other destinations' deliveries; a retry that finds the queue full is
dropped (and logged). A retry goes to the destination as it is set when it
runs: nowhere if it was deleted, switched off or unsubscribed from the event
meanwhile, and to its new address and secret if those changed. The HTTP client **never follows a
redirect** (a `3xx` is a failure, `http_3xx`): a redirect would send the message,
and a webhook's signature, somewhere the admin didn't type.

The outcome is recorded on the destination (`last_at`, `last_ok`,
`last_error`) as a short reason only: `timeout`, `unreachable`,
`http_<status>` or `failed`. Neither the address nor what the far end answered
is logged or shown; at most 64 KiB of an answer is read, then dropped.
`Test` (`POST /admin/notifications/{id}/test`) sends one `test` message at
once, without retries, records its outcome the same way, and is not added to
the feed.

Messages are written in English (destinations are outside the console's
language setting). Their links point into the console at
`<public_url>/admin/...` and are left out when no `public_url` is set. The
server name in a message is the live display name.

Private and loopback addresses are allowed on purpose: a webhook on the LAN
(Home Assistant, n8n) is the common case. Destinations are admin-only, and the
console never sees a response body.

### Destinations

`notify.Clean` checks a destination before it is saved; a refusal is a
`*notify.FieldError` naming the field and a `Reason` code (`400 invalid_target`
with `field`, `reason` and, for a length, `max`; the console words the reason in
its own language and falls back to the English `error` for one it doesn't know).
The reasons (`notify.Reason*`) are part of the wire: add new ones, never rename:

- `kind`: `webhook`, `ntfy` or `discord` (fixed once created).
- `name`: 1-64 characters, no control characters.
- `url`: an `http`/`https` address with a host, no fragment, at most 2048
  characters. **ntfy**: the topic's address, its last path segment the topic
  (`[-_A-Za-z0-9]{1,64}`), no query and no user info. **Discord**: `https` on
  `discord.com`, `discordapp.com`, `ptb.discord.com` or `canary.discord.com`,
  path `/api[/vN]/webhooks/<id>/<token>`, no port or user info.
- `secret`: at most 256 characters, no control characters; a webhook's
  signing secret or an ntfy access token. A Discord destination takes none (its
  address is its secret).
- `events`: known kinds only; repeats dropped.

A server has at most 20 destinations (`409 too_many_targets`). The address and
secret are write-only: the API returns `notify.Redact`'s address instead (the
scheme, host and path, with the last path segment cut to its first four
characters plus `…`, or to just `…` when it is four characters or fewer (an
ntfy topic is its own password), the query shown as `?…` and any user info dropped) and
`has_secret`.

A saved secret belongs to the server it was given for. A `PATCH` that moves the
address to another server (a different scheme, host or port, `notify.SameOrigin`)
without sending `secret` is refused with `field: "secret"`, so a signing key or
an ntfy token is never sent somewhere it wasn't meant for: send the secret again,
or `"secret": ""` to clear it. A new path on the same server keeps the secret.

### Webhook

A JSON `POST` to the address, with `Content-Type: application/json`,
`User-Agent: AudioSilo/<version>` and `X-AudioSilo-Event: <kind>`:

```json
{
  "event": "book_added",
  "id": 42,
  "at": "2026-10-04T18:20:11.503Z",
  "server": { "name": "Hearthside", "url": "https://books.example.com" },
  "title": "3 new books in Books",
  "message": "The Call of the Wild\nA Christmas Carol\nThe Art of War",
  "link": "https://books.example.com/admin/library",
  "data": {
    "library": "Books", "library_id": 1, "count": 3,
    "titles": ["The Call of the Wild", "A Christmas Carol", "The Art of War"]
  }
}
```

`id` and `at` are the feed's (`0` and the send time for a `test`, whose `data`
is `{}`); `server.url` and `link` are `""` without a public address; `data` is
the event's facts from the table above, **without** a failed scan's `detail`. For `book_added` with more than the
five titles listed, `message` ends with "and N more".

With a secret set, two more headers sign the request:

- `X-AudioSilo-Timestamp`: the send time in Unix seconds.
- `X-AudioSilo-Signature`: `sha256=` and the hex HMAC-SHA256, keyed by the
  secret, of the timestamp, a dot and the raw body (`notify.Sign`).

A receiver recomputes the signature over the exact bytes it received, compares
in constant time, and rejects an old timestamp so a captured request can't be
replayed. In Python:

```python
import hashlib, hmac, time

def verify(secret: bytes, headers, body: bytes, max_age=300) -> bool:
    ts = headers.get("X-AudioSilo-Timestamp", "")
    sig = headers.get("X-AudioSilo-Signature", "")
    if not ts.isdigit() or abs(time.time() - int(ts)) > max_age:
        return False
    want = "sha256=" + hmac.new(secret, ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, sig)
```

Without a secret neither header is sent. Any `2xx` answer counts as delivered.

### ntfy

A JSON publish to the ntfy server's root (the topic address minus its last
segment, so an ntfy behind a path prefix works), which accepts any title
(headers would need non-ASCII titles encoded). With a secret, it is sent as
`Authorization: Bearer <secret>`.

```json
{ "topic": "hearthside-alerts", "title": "Books is offline",
  "message": "Its folder can't be read, so the scan stopped. Nothing was removed: books and progress are kept until it is back.",
  "priority": 4, "tags": ["electric_plug"],
  "click": "https://books.example.com/admin/library/libraries" }
```

`message` falls back to the title when an event has no text; `click` is left
out without a link. Priority is 4 for `scan_failed`, `library_unavailable` and
`backup_failed`, 3 otherwise; tags are emoji shortcodes (`books`, `warning`,
`electric_plug`, `iphone`, `envelope`, `package`, `white_check_mark` for a
test).

### Discord

One embed, posted to the webhook address:

```json
{
  "username": "AudioSilo",
  "embeds": [{
    "title": "sam's invite was used",
    "description": "Pixel 8 was set up from it.",
    "color": 3890139,
    "footer": { "text": "Hearthside" },
    "url": "https://books.example.com/admin/people/invites"
  }],
  "allowed_mentions": { "parse": [] }
}
```

The title is cut at 256 characters and the description at 4000; the colour is
blue for information, amber for `library_unavailable` and red for
`scan_failed` and `backup_failed`. `allowed_mentions` is empty, so a book
title or a device name containing `@everyone` pings nobody.

### The feed (the console's bell)

`server_events` keeps every recorded event for 90 days
(`catalog.ServerEventRetention`, pruned with the audit log) whether or not any
destination exists. [`GET /admin/events`](api/reference.md#get-apiv1adminevents)
pages it newest first, optionally one `kind`. The bell asks for the newest 20
every minute and lists eight, with **See all** leading to **Server > Events**,
which pages through the whole feed (50 at a time) and filters by kind. Which
ones are new is a per-browser cursor (the newest id seen, in `localStorage` as
`audiosilo_events_seen`), not server state.

**Who is a new device.** The admin console signs in again after every sign-out,
so announcing each password sign-in would announce the admin every time. The
console keeps a random id per browser (`lib/browser-id.ts`, in `localStorage` as
`audiosilo_browser_id`, made with `crypto.getRandomValues` so it works on plain
http) and sends it as `device_id` with `POST /auth/login`. `auth.IssueSession`
stores its SHA-256 on the new session (`tokens.sign_in_key`, migration 0020) and
reports whether an earlier session of the same person, signed out or not,
carried it; `handleLogin` then skips `new_device`. It is not a credential: it
can only keep a notice quiet. Because of that, `auth.RevokeDevice` (an admin's
"Sign out" in People > Devices) blanks the key on every session of that person
that carries it, so a browser cut off for being someone else's is announced
again when it comes back, even with the password. A new password
(`auth.SetPassword`, the person's own change included) and disabling the account
forget every browser of that person (`forgetBrowsers`): both are what follows a
stolen password.
