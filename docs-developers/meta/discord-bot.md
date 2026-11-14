---
title: Discord notification bot
description: Deploy the private AudioSilo watchlist bot and understand its held feed notifications and delayed community announcements.
---

## Purpose

`audiosilo-meta-bot` is a private, separately deployed Discord bot. Members of the
configured AudioSilo server DM it the Atom feed URL from the metadata site's
Watching page. Pasting another feed replaces the subscription. The server
administrator must install and configure the bot before members can use it.

The bot accepts Atom and JSON Feed links, including compact watchlists. It reads
the equivalent JSON Feed and notifies on new item IDs or changed entry content.
A preorder becoming a release has a new ID, so both events notify. The first
fetch is a silent baseline; reordering and entries aging out do not notify.

A new item ID waits `NOTIFY_HOLD` (6 hours by default) before its DM.
[meta-sync](./sync-bot.md#every-stores-copy-of-a-book) often adds a book's
other stores in a later cycle, so the wait lets the linked page fill in first.
If the entry changes while it waits, the one DM carries the latest version, and
the wait still counts from when the ID first appeared. A change to an entry
that is not waiting, such as a date correction to one already sent or in the
baseline, goes out at once. Polling continues while entries wait, and `status`
counts them among its queued notifications. `NOTIFY_HOLD=0` sends new entries
at once and releases anything still waiting.

Members can DM `status`, `pause`, `resume`, `stop` or `help`. `stop` deletes their
subscription, pending messages and waiting entries. Replacing a URL also clears
that user's old pending messages and drops the waiting entries the new list
does not contain. The others keep their wait. `pause` keeps waiting entries,
which arrive after `resume` once due. Members who leave the configured server
are removed on the next successful membership check. Blocked DMs pause delivery
until `resume`.

## Community announcements

An optional channel receives spoiler-free titles and links for recaps and
character sheets. Announcements wait until both conditions hold:

- The content is present in the published metadata API.
- The earliest known audiobook recording has been released (from that UTC day).

There is no further wait after release: recaps and character sheets are spoiler
gated on the site, so an announcement is useful to listeners of the current book.
`NOTIFY_HOLD` applies to feed DMs only, never to announcements.

Core composes the community repository into its data release, so the bot waits
for publication after the community merge. A release date stating only a year,
or only a year and month, uses the last day of that period. Unknown release dates
remain pending. Existing eligible content is silently baselined on first startup,
while content for a book not yet released stays queued until its release day.
Each content type of a given work announces only once.

### Release-day spot check

The catalogue learns of a slipped release late: meta-sync re-reads upcoming
recordings weekly, and a change takes a day or more to be published. So on the
due day the bot asks [libex](https://libexdb.com) for the current release date
before announcing. It looks up the store listings (ASINs) of the recording that
set the due date, at most five, largest stores first, each with its own store
region. It asks the live endpoint (`/book/{asin}`, which reads Audible) and falls
back to the mirror (`/db/book/{asin}`) only when the live one cannot answer. The
earliest date any store reports decides, since a book out in any region is out.

- **On or before today:** announce.
- **Still ahead (the release slipped):** hold the announcement, remember the new
  date and check again on that day. A second slip pushes it again.
- **No ASIN, no record, or no usable date:** no evidence of a slip, so announce
  on the catalogue date.
- **libex unreachable:** retry at the next hourly check, and announce on the
  catalogue date after 24 hours, so an outage cannot block announcements. A
  later date from one store while another store could not be asked counts as
  unreachable.

A poll spends at most two minutes on libex, and stops asking once two rows in a
row find it unreachable, so a slow libex cannot hold up DMs or the health check.
A work's recap and character sheet share one check. The check never runs for
silently baselined content and never writes back to the catalogue. Set
`LIBEX_BASE_URL=off` to turn it off and announce on the catalogue date.

When a catalogue repair merges duplicate works, the retired slug answers `301`
with its survivor, where the community content reappears. The survivor inherits
the retired row's announced or baselined state, so a merged book does not
announce again. A failed redirect lookup keeps the previous baseline.

Discovery uses paginated coverage results, including whole-book recap summaries,
and checks catalogue identity around each complete scan. Failed scans preserve
the previous baseline. Announcements contain no recap text or character details;
link previews and mentions are disabled.

## Deployment

The private image is `ghcr.io/kodestar/audiosilo-meta-bot:latest`, available for
Linux amd64 and arm64. The repository contains `docker-compose.yml`, `.env.example`
and the full Ploi setup runbook in its README. Run one replica with a persistent
`/data` volume. No inbound port, public domain or reverse proxy is required.
Outbound, it reaches Discord, the metadata origin and, for the release-day spot
check, `libexdb.com`.

| Environment variable | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Required Discord application token |
| `DISCORD_GUILD_ID` | Required server ID |
| `DISCORD_ANNOUNCEMENT_CHANNEL_ID` | Optional channel in that server; blank disables announcements |
| `META_BASE_URL` | Allowed metadata HTTPS origin; defaults to `https://meta.audiosilo.app` |
| `LIBEX_BASE_URL` | HTTPS origin for the release-day spot check; defaults to `https://libexdb.com`, `off` disables it |
| `POLL_INTERVAL` | Feed polling interval, default `5m` |
| `NOTIFY_HOLD` | How long a new feed entry waits before its DM, default `6h`, from `0` (off) to `24h` |
| `DATA_DIR` | State directory, `/data` in Compose |
| `HEALTH_ADDR` | Health listener, unexposed port 8080 in Compose |

Create a bot application in Discord's Developer Portal and install it with the
`bot` scope. Grant View Channels and Send Messages in the announcement channel.
Privileged intents and Administrator permission are unnecessary. Users must allow
DMs from server members. A GitHub token with package-read access is needed to pull
the private image; it is not passed into the running container.

Successful main-branch checks publish `latest` and `sha-<full-commit>` image tags.
The Go build, vet, race tests and lint run before publication. The repository's
AGENTS.md additionally requires simplification and review-and-fix passes before pushes.

## Operational limits

The upstream feed returns at most 200 entries from up to 200 series, has a default
90-day window and may be cached for an hour. Pauses and outages cannot recover
entries that have already left that feed. Community scans run hourly; pending
release-date checks are bounded per poll. Commands and polling are serialized,
so a large scan can delay a reply.

Delivery retries survive restarts, and so do waiting entries with the time
each first appeared. A waiting entry is saved like a pending message and joins
the queue once its wait is over and anything already queued has been sent. A
crash between Discord accepting a message and its local acknowledgment can
produce a duplicate.

Back up `state.json` while the bot is stopped; deleting the volume loses
subscriptions and delivery history. Corrupt state and failed state writes stop
the service instead of silently resetting it. The container health check checks
connectivity and worker progress.
