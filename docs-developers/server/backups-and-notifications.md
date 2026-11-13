---
title: "Backups, audit log and notifications"
description: "internal/backup (VACUUM INTO backups on a schedule, retention, restore applied at the next start), the admin audit log (catalog/audit.go), and internal/notify (the event feed behind the console's bell, and webhook, ntfy and Discord deliveries with their payloads, signature and retry rules)."
---

This page covers three server features of the admin console. They share one
migration (`0019_audit_notifications.sql`, see
[Data model](data-model.md#audit-and-notifications)) and one rule: **no secret
ever leaves through them**. A backup is the exception by nature, because it is
the database. So it stays in a folder only the server's user can read, and the
server audits every download.

The endpoints are in the reference:
[Admin: backups](api/reference.md#admin-backups),
[Admin: notifications and events](api/reference.md#admin-notifications-and-events) and
[Admin: audit log](api/reference.md#admin-audit-log). The settings are
`backups.schedule`, `backups.keep` and `backups.dir`
([Configuration: backups](configuration.md#backups-backups)).

## Backups (`internal/backup`)

A backup is the **whole SQLite database**, written with `VACUUM INTO`
(`store.DB.VacuumInto`) into the backups folder. That folder is `backups.dir`,
or `<data>/backups` when the setting is empty.

`VACUUM INTO` reads the database in one read transaction, so writers carry on
(WAL). The copy is the database as of the moment the read began, compacted and
self-contained, with no `-wal` beside it. The backup runs on a short-lived
connection of its own, for two reasons:

- the reader pool is `query_only`, which refuses `VACUUM INTO`;
- the single writer would hold every write back for as long as the copy takes.

**What is in it:**

- accounts and their password hashes;
- sessions and API keys (as token hashes);
- invites, progress, bookmarks, notes, history, listening sessions,
  favourites and shares;
- metadata edits, custom covers, folder detection choices and ignored issues;
- the audit log;
- notification destinations, their addresses and secrets included;
- the event feed;
- `server_state` (the support card's answer);
- the library index, though the next scan would rebuild it anyway.

**Not** in it: `config.yaml`, the certificates, downloaded tools, and the
audiobooks.

### Files

Each backup is named `audiosilo-<UTC time>-<kind>.db`:

- the time is written as `20060102-150405Z`;
- the kind is one of `scheduled`, `manual`, `before-restore` or
  `before-upgrade`.

The service writes a backup under a hidden temporary name
(`.audiosilo-….db.tmp`) and sets it to mode `0600`, because it holds password
and token hashes. Then it renames the file into place, so a half-written file is
never listed. The service creates the folder with mode `0700`. A server that
stops mid-backup leaves the temporary file behind, and `Service.Run` removes it
at the next start. Two backups of one kind in the same second fail, because the
name already exists.

The service lists, serves, deletes or restores only names that match
`backup.validName`: `audiosilo-`, up to 101 plain characters, then `.db`, with
no `..`. It also takes only regular files, checked with `os.Lstat`, so it never
follows a symlink. A name from a request therefore can't leave the folder. A
file copied into the folder from elsewhere under such a name is listed as
`manual`, dated by its modification time.

### Schedule

`backups.schedule` takes one of these forms, in the server's local time zone:

- `""`: off;
- `daily:HH:MM`;
- `weekly:DAY:HH:MM`, where `DAY` is `mon` … `sun`.

The default is `daily:03:00`. `backup.ParseSchedule` checks the value (a
two-digit hour and minute), and the settings normalizer stores the canonical
form.

`Service.Run`, which `pkg/launcher` starts, wakes every minute. It also wakes at
once when the settings change (`SetSettings`). It counts the next slot from the
later of these two:

- the newest scheduled backup in the folder, whenever it was made, or the time
  `Run` started when there is none;
- the newest scheduled attempt (`tried`).

Counting from the newest backup is what makes a server that was off at its time
**catch up**. Its next slot has already passed, so it makes one backup within a
minute of the start, however many slots it missed. Counting from the attempt
means a failed backup waits for its next slot instead of retrying every minute.

### Retention

After each successful *scheduled* backup, `prune` deletes the scheduled backups
past the newest `backups.keep` (1-365, default 7). Lowering `keep` takes effect
at the next scheduled backup. `prune` never deletes:

- manual and before-restore backups, which stay until an admin deletes them;
- the scheduled backup that a waiting restore names, since the next start would
  find it gone. If the restore marker can't be read, `prune` deletes nothing
  that time.

Before-upgrade backups have their own rule, described next.

### Before an upgrade

`pkg/launcher` calls `backup.BeforeUpgrade` before `store.Open` migrates the
database. `store.PendingMigrations` reads the database read-only and lists the
migrations it lacks. The list is empty for a fresh install (no database, or no
migration recorded) and for a database that is already up to date.

When migrations are pending, `BeforeUpgrade` writes the database into the
backups folder with `VACUUM INTO` as `audiosilo-<UTC time>-before-upgrade.db`
(`KindBeforeUpgrade`). It uses the same temporary name and `0600` mode as every
backup. One INFO line names the migrations and the copy ("copied the database
before applying new migrations"). A failed copy logs a WARN, and the start
carries on, migrating without a copy.

`pruneBeforeUpgrade` then keeps the newest three (`keepBeforeUpgrade`):

- the copy just made always stays;
- a waiting restore's backup is never removed;
- a copy holding the same pending migrations as a newer one counts once and
  goes.

The last rule matters when migrations fail part way. Such a start copies the
half-migrated database on every retry, and without the rule those copies would
push out the copy of the database as the older server left it.

### Status

`Service.Status` is what the console shows. It is also the `backups` block of
[`GET /admin/system`](api/reference.md#get-apiv1adminsystem). It holds:

- the folder;
- whether a backup is being made;
- `last`: the newest attempt since the server started, with a short `error`
  (`disk_full`, `permission_denied` or `failed`). The cause is in the log.
- `latest`: the newest backup in the folder that isn't a before-restore or
  before-upgrade copy, whenever it was made;
- `next`: `null` when the schedule is off.

A failed backup calls `OnFailure`, which the launcher wires to the
`backup_failed` notification. A backup cut short because the server is stopping
is not announced.

`POST /admin/backups` calls `Start`. `Start` marks the service as running before
it returns, so the request's own answer already reads `running: true`. It then
makes a manual backup in the background. That backup is bound to the server's
lifetime rather than the request's, so it stops with the server, unannounced.
A second backup while one runs is refused (`ErrBusy`, answered
`409 backup_running`).

## Restore at the next start

A restore never swaps the database under a running server. It takes two steps.

1. **`RequestRestore`** (`POST /admin/backups/{name}/restore`) takes a quick
   look with `store.Inspect(…, false)`. It opens the backup read-only
   (`mode=ro`) and requires:
   - a `schema_migrations` table in which every name is a migration this server
     ships. A backup from a newer server fails with `store.ErrNewerDatabase`,
     answered `400 backup_too_new`.
   - a `users` table.

   Anything else is `store.ErrNotADatabase` (`400 invalid_backup`). The full
   integrity check (`PRAGMA quick_check`, which reads every page) waits for the
   start, so the request stays quick.

   `RequestRestore` then writes the marker `<data>/restore.json`
   (`{"name", "requested_at", "requested_by", "schema"}`), replacing any restore
   already waiting. `DELETE /admin/restore` removes the marker. Deleting the
   backup it names removes it too.
2. **`ApplyPendingRestore`** runs in `pkg/launcher.Run` before `store.Open`.
   With no marker it does nothing. Otherwise it checks the backup again, in
   full this time (`store.Inspect(…, true)`, with `quick_check`). The check
   fails as `missing` when the file is gone, `unusable` when it is damaged or
   not an AudioSilo database, and `newer` for a newer server's backup.

   It then copies the backup beside the database as `audiosilo.db.restoring`
   and keeps the current database:
   - normally as a backup of kind `before-restore` in the backups folder. It
     writes that with `store.VacuumFile`, a `VACUUM INTO` of the file and its
     WAL that doesn't open it as the server's database.
   - if that copy fails (the database may be the reason for the restore), by
     renaming `audiosilo.db` and its `-wal` and `-shm` to
     `audiosilo.db.before-restore-<time>` beside it in the data folder,
     untouched. If one of those renames fails, it puts back the files already
     moved, so the database is never left without its WAL.

   Finally it removes the old `-wal` and `-shm` and renames the staged file to
   `audiosilo.db`. `store.Open` migrates it as usual, which brings an older
   backup up to the current schema.

Whatever happened, `ApplyPendingRestore` writes the outcome to
`<data>/restore-result.json`:
`{"name", "applied_at", "requested_by", "ok", "error", "safety_copy"}`.

- `error` is `missing`, `unusable`, `newer` or `failed`.
- `safety_copy` is the name of the before-restore backup or of the kept-aside
  file.

It **always removes** the marker. A refused restore is reported once, in the
console, rather than retried at every start, and the database is left as it
was. A marker that can't be read (damaged JSON) is handled the same way. The
outcome is `failed` with no `name`, the marker is removed, and the server
starts on its database as it was.

The launcher then records the outcome in the audit log of the database that is
now current, as the server's own act: `via: "system"`, action
`backup.restore_applied` or `backup.restore_failed`, with `requested_by` and
either `safety_copy` or `error`. `GET /admin/backups` returns both files'
contents as `restore.pending` and `restore.last`. The console shows the last
outcome for 14 days.

Because the database goes back as a whole, so do the credentials in it. Devices
signed in after the backup was made must sign in again, and a session or API
key revoked since is valid again. The restore leaves `config.yaml` untouched,
and with it the `server_id` that players key on.

## Audit log

`audit_events` holds one row per admin change. `API.audit`
(`internal/api/handlers_audit.go`) writes it **after** a change succeeds, with:

- an action code, `<area>.<verb>`;
- a short human target: a username, a library name, a book's
  `<library>: <path>`, or a backup's file name;
- a small JSON object of details.

Recording is best effort. The change has already happened, so a failed insert
is logged, not answered as an error. The row copies the actor's id and username
with no foreign key, so deleting or renaming an account keeps its history.
`via` is one of:

- `session`: the console or another signed-in app;
- `api`: a personal API key;
- `system`.

No IP address is stored.

| Area | Actions |
|---|---|
| `user` | `create`; `update`; `delete`; `recovery_clear`; `sign_out_everywhere` (details: `signed_out`, the sessions it ended). See the notes below the table for `update` and `delete`. |
| `member` | `create` (details: `member`, `kind`, `access`, `sign_in_here`); `update` (`member` plus what changed: `name`, `kind`, `access`, and `collections` as a count); `delete`; `session`; `pair`; `device_revoke` (`member`, `device_id`). These record [household members](api/reference.md#household-members) managed from the player. See the notes below the table. |
| `invite` | `create`, `rotate`, `revoke` |
| `library` | `create`, `update`, `reorder`, `folder_override`, `delete` |
| `book` | `edit`, `bulk_edit`, `enrichment`, `cover_set`, `cover_remove` |
| `share` | `create`, `update`, `delete`, `add_paths`, `remove_paths`, `grant`, `revoke` |
| `device` | `revoke` |
| `progress` | `edit` |
| `issue` | `ignore`, `unignore` |
| `settings` | `update` (details: `changes`, each `{setting, from, to}`); `support`; `setup`. See the notes below the table. |
| `backup` | `create`, `download`, `delete`, `restore`, `restore_cancel`, `restore_applied`, `restore_failed` |
| `notify` | `create`, `update`, `delete` |
| `bridge` | The [Bridge](api/reference.md#the-bridge): `code` (a pairing code made); `paired` (a Bridge exchanged a code; `via` `system`, details: `ip`); `unpair`; `job` (a job queued; details: `job`, `kind`, `library`; the target is the book's path); `cancel` (details: `job`, `kind`) |
| `import` | `start` (details: `import`, `source`); `apply` (`import`, `sessions`, `listened`); `undo` (`import`). The target is the person the history went to. Connecting, a cutoff change and deleting an unapplied import aren't audited. |

Notes on the longer rows:

- **`user.update`.** Details gain `can_add_members` when the request sets it.
  Whenever the request carries `managed_by`, details also gain `managed_by` (the
  owner's username, or `null`), `member_kind` and `member_access`, as the
  account is after the change.
- **`user.delete`.** Only for someone who had household members, details hold
  `members_deleted` (a count) and `members_kept` (usernames).
- **`member`.** The actor is the owner (an admin can be one too), and the target
  is the member's username. `DELETE /me/devices/{id}?also_members=1` also
  records one `device_revoke` per member it signs out, with the owner's device
  id.
- **`settings.support`.** An answer to the console's
  [support card](web-ui.md#the-support-card). Details: `choice` (`donated` or
  `snoozed`) and, for a snooze, `returns_at`. It is not recorded when a donation
  was already stored and nothing changed.
- **`settings.setup`.** A `PUT /admin/setup` from the console's
  [first-run setup flow](web-ui.md#the-first-run-setup-flow). Details hold
  whichever of `finished`, `dismissed` and `steps` the request sent. It is
  recorded on every successful request.

Details never hold a secret:

- a password change reads `password: "set"` or `"cleared"`;
- an invite carries its limits but never its code;
- a share's paths are listed as a count and the first ten;
- a notification destination's change says `address_changed` or
  `secret_changed`, without either value.

Deliberately **not** audited:

- sign-ins and listening (Activity and People > Devices have them);
- scans, rescans and job cancels (Health > Jobs keeps their history);
- a community chapter check, since it changes nothing an admin chose. Picking a
  book's chapter source is a `book.edit` or `book.bulk_edit`, with
  `chapter_source` in its details.
- anything else a non-admin does. The `member` area is the one exception: an
  owner managing their household members.

Backup **downloads** are audited, because a backup holds every account's
hashes. That covers a `GET`. A `HEAD` sends nothing and isn't audited.

`catalog.PruneAudit` runs at start and then daily (`launcher.retention`, with
the session roll-up). It deletes events older than 365 days
(`catalog.AuditRetention`) and anything past the newest 100,000.

## Notifications (`internal/notify`)

`notify.Service` records what happened in the event feed (`server_events`, the
console's bell). It also delivers each event to the enabled destinations
subscribed to its kind. A nil `*Service` does nothing, so callers don't check.

### Events

| Kind | Fired by | `data` |
|---|---|---|
| `book_added` | `Scanner.OnRunFinished`: a scan job ending `ok` or `partial` that added books (once per scan) | `library`, `library_id`, `count`, `titles` (the first five) |
| `scan_failed` | a scan job ending `failed` | `library`, `library_id`, `run_id`, `detail` (the error, as the scan's log has it; **bell only**, see below) |
| `library_unavailable` | a scan job ending `unavailable`, only when the library's previous scan that reached an answer wasn't unavailable. `catalog.PreviousRunStatus` passes over cancelled, interrupted and running scans, so a restart in between doesn't announce it again. | `library`, `library_id` |
| `new_device` | every pairing exchange (`POST /auth/exchange`), and a password sign-in (`POST /auth/login`) unless an earlier session of the same person already carried its `device_id` (`auth.IssueSession`). A sign-in without a `device_id` always counts. Never for demo accounts. | `user`, `device` (the name the client sent, one plain line of at most 100 characters), `app` (from `X-AudioSilo-Client`, may be empty) |
| `invite_redeemed` | a pairing exchange whose token came from an invite code | `user` (whose invite), `device` |
| `update_available` | `updates.Checker.OnAvailable` after a check that finds a newer release. Announced **once per version** (`dedup_key` is the version). | `version`, `name`, `url` (the release page) |
| `backup_failed` | `backup.Service.OnFailure` (scheduled or manual) | `trigger`, `error` (`disk_full`, `permission_denied`, `failed`) |
| `bridge_job_finished` | `bridge.Service.OnTransition` (wired by `API.SetBridge`): a [Bridge](../bridge/index.md) job moved **into** `done` | `job_id`, `job_kind`, `state`, `library`, `library_id`, `path`, `title`, plus per-kind fields. See [Bridge event data](#bridge-event-data). |
| `bridge_job_failed` | the same hook, for a job that moved **into** `failed` or into a notable `needs_attention`. See [Bridge event data](#bridge-event-data). | as `bridge_job_finished`, plus `code` and `detail` |
| `book_released` | the [upcoming releases](api/reference.md#upcoming-releases) job (`upcoming.Runner`, wired to `API.announceReleases`). See [`book_released`](#book_released). | `count`, `titles` (the first five, each `Title (Series #position)`, or `Title (Series)` without a position) |

`notify.Kinds` lists the kinds in this order, which is the order the console
shows.

#### Bridge event data

Both Bridge events carry:

- `job_id`, `job_kind`, `state`, `library`, `library_id`, `path`;
- `title`: the book's title as indexed now, one plain line of at most 200
  characters, or `""` when it can't be read.

`bridge_job_finished` adds per-kind fields:

- a `chapters.detect` job: `chapters_source`, where the book's chapters come
  from once the Bridge's attachments rescan has run (`generated`, `community` or
  `files`);
- a `sidecars.contribute` job that filed nothing because the community already
  had everything: `shared_nothing: true`;
- a `readalong.align` job: `coverage`, its result's `coverage.text` (0 to 1),
  when the result says.

`bridge_job_failed` fires when a job moves **into** `failed`, either from a
Bridge's report or from a lease that ran out on the last attempt. It also fires
when a job moves into `needs_attention` with a park that isn't transient
(`bridge.Job.Notable`). The transient parks are `agent_rate_limited`,
`agent_unavailable` and `asr_worker_waiting`, and they never fire it. A park
that changes its code in place fires it when the new code isn't transient. The
event adds:

- `code`: the park code, only for `needs_attention`;
- `detail`: the job's `error`. This is the Bridge's own text, which can name a
  folder on its disk, so it is **bell only**.

#### `book_released`

The upcoming releases job fires it at the end of a run that found works newly
`released`. A work is newly released when a preorder's day came, or when a new
release appeared within the window. The work must be in a series the server
holds, and the server must hold no copy of it anywhere.

- There is **one event per run**.
- Each work is announced **once**. `upcoming_announced` remembers it for 400
  days, longer than any release window. A repeated run, a work listed by two
  series, or an item that leaves and comes back says nothing again.
- The first run, and the first read of a series, is a **silent baseline**. What
  is out already is marked, not announced.
- `dedup_key` is `released:` plus a digest of the run's work ids.

#### Bridge messages

The server reports a Bridge event once per move, after the move has committed,
on a context that the request's end doesn't cancel. Its message names the book:
its title, else its path, else its library.

`bridge_job_finished` messages, by job kind:

| Job kind | Title | Text |
|---|---|---|
| `sidecars.generate` | `Characters and recaps ready: <title>` | "Listeners see them in the player now." |
| `sidecars.describe` | `Description ready: <title>` | "Listeners see it in the player's About when the book has no other description." |
| `chapters.detect` | `Chapters found: <title>` | "Listeners see them in the player now." only when its `chapters_source` is `generated`. Otherwise "The chapters were saved, but the book uses other chapters. Choose its chapter source on the book page.", and the console's bell says the same. |
| `sidecars.contribute` | `Shared with the community: <title>` | "What this server generated for the book went to the community for review. The book page links it." |
| `sidecars.contribute` that filed nothing because the community already had it (`contributed` empty, `covered` not) | `Already in the community: <title>` | |
| `meta.correct` | `Corrections sent: <title>` | "The book's corrections went to the community for review. The book page links them." |
| `readalong.align` | `Read-along made: <title> (N% lined up)`. The coverage is rounded down to a whole percent, so 0.996 reads 99%. | "It is saved with the book. Open the book in a compatible AudioSilo player to follow the text with the narration." |
| `librivox.fetch` | `Added from LibriVox: <title>`, the book its result names | "It is in the library now, matched to its LibriVox recording." |
| `bridge.verify` | `Bridge check finished: <library>`, or the book's title when the job named one | "The Bridge finished the job." |
| any other kind | `<kind> finished: <title>` | "The Bridge finished the job." |

In the bell, only `sidecars.generate`, `sidecars.describe`, `chapters.detect`,
`readalong.align` and `librivox.fetch` (`Added from LibriVox: <name>`) have titles
of their own (`FINISHED_OWN` in `lib/server-events.ts`). A read-along reads `Read-along made for <name>`, with
`N% of the text lined up. Open the book in a compatible AudioSilo player to
follow the text with the narration.` under it. Every other kind, including
`sidecars.contribute` and `meta.correct`, reads `Bridge job finished: <name>`
with the kind's name under it.

`bridge_job_failed` reads `A Bridge job needs attention: <title>` (in the
warning colour) or `<kind> failed: <title>`. The kind's words come from
`notify.bridgeKindWords`: `Characters and recaps`, `Description`, `Chapters`,
`Sharing with the community`, `Corrections`, `Read-along`, `Adding from LibriVox`,
`Bridge check`, else `Bridge job`. Its text is the park code in words:

- `book_not_writable`;
- `budget_exceeded`: raise the cap on the Bridge, or wait for the monthly one
  to reset. A cap set in its `config.yaml` or environment needs a restart,
  which resumes the job.
- `agent_credential_refused`: replace the credential where the agent gets it,
  either the agent container's own credential (which it uses first) or the
  Bridge's Accounts tab. The job then carries on by itself.
- `contrib_unavailable`: sign in to GitHub on the Bridge's Accounts tab and the
  job carries on. When the Bridge is signed in already, GitHub couldn't be
  reached to refresh its sign-in, so retry the job there once it can be.
- `core_needed`;
- `chapters_not_detected`;
- anything else: "See the job in Settings > Bridge."

Both Bridge events link to `/server?topic=bridge`. See
[Characters and recaps](../bridge/generating.md#notifications).

Following a saved read-along needs a compatible player.
[Text and Follow narration](../frontend/reader.md) require server and player
2.6.0 or later. Older players can still open the book, but cannot follow its
read-along.

#### Other messages

A `book_released` message reads `1 new release in your series` (or `N new
releases in your series`), with the titles one a line and `and N more` after
the fifth. It links to the console's Library > Series and carries the ntfy tag
`new` (priority 3). The bell shows the first three titles, then "and N more".

A failed scan's `detail`, and a failed Bridge job's, is the tool's or the
operating system's own message, which can name a folder on the server, so it
stays inside. The bell shows it, but no destination is sent it. The field is in
`internalData`, which `outbound` strips from a webhook's `data`. The message
text of every `scan_failed` delivery is the generic "See the scan's log in
Health > Jobs."

### Delivery

`Emit` records the event, then queues one delivery per enabled destination
whose `events` include its kind. It never blocks. Four workers drain a queue of
256, and a delivery that finds the queue full is dropped and logged.

Each delivery is one `POST` with a 10 second timeout. The service retries it
**twice**, after 10 seconds and then after a minute, when it timed out,
couldn't connect, or got a `429` or a `5xx`. Any other status fails at once.

- A retry is queued again after its delay (`time.AfterFunc`) rather than waited
  out on a worker. A destination that doesn't answer therefore holds a worker
  for one attempt at a time and never delays the other destinations'
  deliveries.
- A retry that finds the queue full is dropped and logged.
- A retry goes to the destination as it is set when the retry runs. If the
  destination was deleted, switched off or unsubscribed from the event
  meanwhile, it goes nowhere. If its address and secret changed, it goes to the
  new ones.

The HTTP client **never follows a redirect**, and a `3xx` is a failure
(`http_3xx`). A redirect would send the message, and a webhook's signature,
somewhere the admin didn't type.

The service records the outcome on the destination (`last_at`, `last_ok`,
`last_error`) as a short reason only: `timeout`, `unreachable`,
`http_<status>` or `failed`. Neither the address nor what the far end answered
is logged or shown. The client reads at most 64 KiB of an answer, then drops it.

`Test` (`POST /admin/notifications/{id}/test`) sends one `test` message at
once, without retries. It records its outcome the same way and is not added to
the feed.

Messages are written in English, because destinations are outside the
console's language setting. Their links point into the console at
`<public_url>/admin/...` and are left out when no `public_url` is set. The
server name in a message is the live display name.

Private and loopback addresses are allowed on purpose, because a webhook on the
LAN (Home Assistant, n8n) is the common case. Destinations are admin-only, and
the console never sees a response body.

### Destinations

`notify.Clean` checks a destination before it is saved. A refusal is a
`*notify.FieldError` naming the field and a `Reason` code. The API answers it
as `400 invalid_target` with `field`, `reason` and, for a length, `max`. The
console words the reason in its own language and falls back to the English
`error` for a reason it doesn't know. The reasons (`notify.Reason*`) are part of
the wire, so add new ones and never rename one.

The fields:

- `kind`: `webhook`, `ntfy` or `discord`, fixed once created.
- `name`: 1-64 characters, no control characters.
- `url`: an `http` or `https` address with a host, no fragment, at most 2048
  characters.
  - **ntfy**: the topic's address, whose last path segment is the topic
    (`[-_A-Za-z0-9]{1,64}`). No query and no user info.
  - **Discord**: `https` on `discord.com`, `discordapp.com`, `ptb.discord.com`
    or `canary.discord.com`, path `/api[/vN]/webhooks/<id>/<token>`, no port or
    user info.
- `secret`: at most 256 characters, no control characters. It is a webhook's
  signing secret or an ntfy access token. A Discord destination takes none,
  because its address is its secret.
- `events`: known kinds only, with repeats dropped.

A server has at most 20 destinations (`409 too_many_targets`).

The address and secret are write-only. The API returns `has_secret` and
`notify.Redact`'s version of the address instead:

- the scheme, host and path;
- the last path segment cut to its first four characters plus `…`, or to `…`
  alone when it is four characters or fewer (an ntfy topic is its own
  password);
- the query shown as `?…`;
- any user info dropped.

A saved secret belongs to the server it was given for. A `PATCH` that moves the
address to another server (a different scheme, host or port,
`notify.SameOrigin`) without sending `secret` is refused with
`field: "secret"`. That way a signing key or an ntfy token is never sent
somewhere it wasn't meant for. Send the secret again, or `"secret": ""` to
clear it. A new path on the same server keeps the secret.

### Webhook

A webhook delivery is a JSON `POST` to the address, with
`Content-Type: application/json`, `User-Agent: AudioSilo/<version>` and
`X-AudioSilo-Event: <kind>`:

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

- `id` and `at` are the feed's. A `test` sends `0` and the send time, and its
  `data` is `{}`.
- `server.url` and `link` are `""` without a public address.
- `data` is the event's facts from the [events table](#events), **without** a
  failed scan's `detail`.
- For `book_added` with more books than the five titles listed, `message` ends
  with "and N more".

With a secret set, two more headers sign the request:

- `X-AudioSilo-Timestamp`: the send time in Unix seconds.
- `X-AudioSilo-Signature`: `sha256=` and the hex HMAC-SHA256, keyed by the
  secret, of the timestamp, a dot and the raw body (`notify.Sign`).

A receiver recomputes the signature over the exact bytes it received and
compares in constant time. It also rejects an old timestamp, so a captured
request can't be replayed. In Python:

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

An ntfy delivery is a JSON publish to the ntfy server's root, which is the
topic address minus its last segment. That way an ntfy server behind a path
prefix works. The JSON form accepts any title, where headers would need
non-ASCII titles encoded. With a secret, the service sends it as
`Authorization: Bearer <secret>`.

```json
{ "topic": "hearthside-alerts", "title": "Books is offline",
  "message": "Its folder can't be read, so the scan stopped. Nothing was removed: books and progress are kept until it is back.",
  "priority": 4, "tags": ["electric_plug"],
  "click": "https://books.example.com/admin/library/libraries" }
```

- `message` falls back to the title when an event has no text.
- `click` is left out when there is no link.
- Priority is 4 for `scan_failed`, `library_unavailable` and `backup_failed`,
  and 3 otherwise.
- Tags are emoji shortcodes: `books`, `warning`, `electric_plug`, `iphone`,
  `envelope`, `package`, `new` for a release, and `white_check_mark` for a test.

### Discord

A Discord delivery is one embed, posted to the webhook address:

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

- The title is cut at 256 characters and the description at 4000.
- The colour is blue for information, amber for `library_unavailable`, and red
  for `scan_failed` and `backup_failed`.
- `allowed_mentions` is empty, so a book title or a device name containing
  `@everyone` pings nobody.

### The feed (the console's bell)

`server_events` keeps every recorded event for 90 days
(`catalog.ServerEventRetention`, pruned with the audit log), whether or not any
destination exists. [`GET /admin/events`](api/reference.md#get-apiv1adminevents)
pages it newest first, optionally for one `kind`.

The bell asks for the newest 20 every minute and lists eight. **See all** leads
to **Server > Events**, which pages through the whole feed (50 at a time) and
filters by kind. Which events are new is a per-browser cursor, not server
state: the newest id seen, kept in `localStorage` as `audiosilo_events_seen`.

**Who is a new device.** The admin console signs in again after every sign-out,
so announcing each password sign-in would announce the admin every time.
Instead:

1. The console keeps a random id per browser (`lib/browser-id.ts`, in
   `localStorage` as `audiosilo_browser_id`). It makes the id with
   `crypto.getRandomValues`, so it works on plain http.
2. The console sends the id as `device_id` with `POST /auth/login`.
3. `auth.IssueSession` stores its SHA-256 on the new session
   (`tokens.sign_in_key`, migration 0020). It reports whether an earlier session
   of the same person, signed out or not, carried the same key.
4. If one did, `handleLogin` skips `new_device`.

The id is not a credential. It can only keep a notice quiet. Because of that,
these actions clear it:

- `auth.RevokeDevice` (an admin's "Sign out" in People > Devices) blanks the key
  on every session of that person that carries it. A browser cut off for being
  someone else's is then announced again when it comes back, even with the
  password.
- A new password (`auth.SetPassword`, the person's own change included), the
  admin's Sign out everywhere (`auth.SignOutEverywhere`) and disabling the
  account forget every browser of that person (`forgetBrowsers`). All three are
  what follows a stolen password.
