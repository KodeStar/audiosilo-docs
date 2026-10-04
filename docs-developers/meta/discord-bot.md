---
title: Discord notification bot
description: Deploy the private AudioSilo watchlist bot and understand its feed notifications and delayed community announcements.
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

Members can DM `status`, `pause`, `resume`, `stop` or `help`. `stop` deletes their
subscription and pending messages. Replacing a URL also clears that user's old
pending messages. Members who leave the configured server are removed on the
next successful membership check. Blocked DMs pause delivery until `resume`.

## Community announcements

An optional channel receives spoiler-free titles and links for recaps and
character sheets. Announcements wait until both conditions hold:

- The content is present in the published metadata API.
- The earliest known audiobook recording release is at least 30 UTC days old.

Core composes the community repository into its data release, so the bot waits
for publication after the community merge. Year/month-only release dates use
the last day of that period; unknown release dates remain pending. Existing
eligible content is silently baselined on first startup, while newer books
remain queued until day 30. A given work/content type announces only once.

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

| Environment variable | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Required Discord application token |
| `DISCORD_GUILD_ID` | Required server ID |
| `DISCORD_ANNOUNCEMENT_CHANNEL_ID` | Optional channel in that server; blank disables announcements |
| `META_BASE_URL` | Allowed metadata HTTPS origin; defaults to `https://meta.audiosilo.app` |
| `POLL_INTERVAL` | Feed polling interval, default `5m` |
| `DATA_DIR` | State directory, `/data` in Compose |
| `HEALTH_ADDR` | Health listener, unexposed port 8080 in Compose |

Create a bot application in Discord's Developer Portal and install it with the
`bot` scope. Grant View Channels and Send Messages in the announcement channel.
Privileged intents and Administrator permission are unnecessary. Users must allow
DMs from server members. A GitHub token with package-read access is needed to pull
the private image; it is not passed into the running container.

Successful main-branch checks publish `latest` and `sha-<full-commit>` image tags.
The Go build, vet, race tests and lint run before publication. The repository's
AGENTS.md additionally requires simplification and review/fix passes before pushes.

## Operational limits

The upstream feed returns at most 200 entries from up to 200 series, has a default
90-day window and may be cached for an hour. Pauses and outages cannot recover
entries that have already left that feed. Community scans run hourly; pending
release-date checks are bounded per poll. Commands and polling are serialized,
so a large scan can delay a reply.

Delivery retries survive restarts. A crash between Discord accepting a message
and its local acknowledgment can produce a duplicate. Back up `state.json` while
the bot is stopped; deleting the volume loses subscriptions and delivery history.
Corrupt state and failed state writes stop the service instead of silently
resetting it. The container health check checks connectivity and worker progress.
