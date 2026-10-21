---
title: "Podcasts"
description: "Podcast subscribe and poll jobs, feed.json v1, stable show and episode paths, server scheduling, guarded HTTP, private feed secrets, and the feed-extension and ID3 chapter spike results."
---

## Scope and ownership

Bridge Phase 2c-1 adds `podcast.subscribe` and `podcast.poll`, both writing jobs
in the Bridge's `light` lane. They need a mapped, writable podcast library and
the server's `podcasts` module (`RequiresBridge: "podcast"`). The module ships
off. `capabilities.podcasts` is always present and is true only with the toggle
on and an online Bridge advertising the `podcast` feature.

The server holds follows, feed status, HTTP validators, schedules and job
intents. The Bridge fetches and parses feeds, owns `feed.json`, artwork and
private credentials, then asks the server to index the show. The server never
writes into the library. Implementations are the Bridge's `internal/podcast`,
`internal/podcastjob` and `internal/netguard`, and the server's
`internal/podcast`, `internal/catalog/podcasts.go` and `internal/library/podcasts.go`.

There is no `podcast.fetch`, audio download, retention policy, OPML, discovery,
podcast chapter/transcript playback or podcast player UI in this phase.
Released players do not see podcast libraries; only the admin console lists
them for now. Read routes are core and stay available without the module or
Bridge, subject to the [client gate and private scope](../server/auth-and-security.md#podcast-visibility).
Follow, unfollow and manual check are module actions for authenticated adults,
not demo accounts. See the [API reference](../server/api/reference.md#podcasts).

## Library kind and mapping

`libraries.kind` is `books` (the default) or `podcasts`, immutable after create.
A podcast root cannot equal, contain or sit inside another library root; the
check applies when creating or moving either kind. Heartbeat replies include
each library's `kind`; a missing kind means `books` to the Bridge.

A podcast library, including an empty one, uses a marker instead of a sample
book. The Bridge writes `.audiosilo/library.json` with version `1`, the server's
`library_id` and a random 32-character lowercase hex `nonce`, then compares the
nonce returned by `GET /api/v1/bridge/libraries/{id}/marker`. See
[Library mappings](mappings.md#podcast-libraries-the-marker).

## Files on disk: `feed.json` v1

```text
<podcast root>/
  .audiosilo/library.json
  <Show Folder>/feed.json
  <Show Folder>/cover.jpg       (or cover.png, when fetched)
  <Show Folder>/2026-10-19-3fa94c0b1d.mp3  (reserved audio path; no download yet)
```

The file is a rebuildable show/episode index input, written by the Bridge and
read by the server. Unknown keys are ignored. A breaking change requires a
version bump; the server skips and logs unsupported versions. The Bridge caps
the file at **24 MiB** and **20,000 episodes**; the server reads at most **32 MiB**
and requires a regular file, never a symlink. A show is one real, non-hidden
directory directly beneath the root.

Top-level fields:

| Fields | Meaning |
|---|---|
| `version`, `generator` | `1`, and `audiosilo-bridge/<version>` |
| `show_id` | random 16-character hex id, used for the show's vault entry |
| `feed_url`, `feed_url_sha256` | normalized current URL and its lowercase SHA-256; URL is `""` for a private show |
| `previous_feed_url_sha256` | up to five previous URL hashes, newest first, used to recognise a follow after a feed moves |
| `private`, `feed_host` | privacy flag and feed hostname |
| `subscribed_at`, `updated_at` | RFC 3339 UTC timestamps |
| `show`, `episodes` | show object and episodes, newest first |

`show` contains `title` (300 bytes), `author` (300), `description` (4,000),
`link` (`""` when private), `language` (35), `type` (`episodic` or `serial`),
`explicit`, `categories` (up to ten), `podcast_guid`, and nullable `image`.
An image is `{file, source_sha256, fetched_at}`: only the image URL's hash is
saved. Artwork uses the same guarded HTTP client as feeds, is sniffed as JPEG
or PNG, and is capped at **10 MiB**. Artwork failure does not fail the feed job.
Show and episode descriptions become plain text; byte clipping keeps valid UTF-8.

An episode has:

| Fields | Meaning |
|---|---|
| `id`, `guid`, `path` | 16-character identity hash; feed GUID (up to 1,024 bytes); assigned library-relative audio path |
| `title`, `description` | up to 500 and 2,000 bytes; empty title becomes `Untitled episode` |
| `published` | RFC 3339 UTC, or `""` when unknown |
| `season`, `episode` | positive integer or `null` |
| `episode_type`, `explicit` | `full`, `trailer` or `bonus`; explicit flag |
| `duration_seconds` | parsed iTunes duration, integer or `null` |
| `enclosure` | `{url, type, length}`; private shows save `url: ""` |
| `chapters_url`, `transcripts` | Podcast Namespace chapter URL and up to eight `{url,type,language}` transcripts; private shows save `""` and `[]` |
| `first_seen`, `removed_at` | first observation; `""` until absent from a later feed |
| `fetch` | `null` in this phase; reserved file-generation information below |

The reserved `fetch` object is
`{generation, sha256, bytes, duration_ms, content_type, fetched_at, deleted_at, timeline_changed}`.
The server already reads it: a present file with positive `duration_ms` gives
`duration_source: "file"`; otherwise a positive feed duration gives `"feed"`,
else `"none"` with duration zero. Presence is observed by listing the show
directory, without probing audio. Progress stays keyed by `(library_id, path)`.

The server validates episode paths as `<show>/<audio filename>`, one level,
clean, non-hidden, unique and supported by `metadata.IsAudio`. Bad entries are
skipped and logged. It indexes episodes even when files are absent. `/fs` uses
the index and displays titles, with serial shows oldest first and episodic
shows newest first. Loose audio and the feed/artwork files do not become entries.
An undownloaded episode streams as `404 not_downloaded` and has an empty chapter
list; neither route tries on-demand audio indexing.

## Names and identity

The Bridge assigns a show folder once from its title: NFC normalization;
control, bidi-control and replacement characters removed; `/ \\ : * ? " < > |`
replaced by spaces; whitespace collapsed; 100-byte rune-safe cap; leading and
trailing spaces/dots trimmed. Empty becomes `Podcast`; Windows reserved names
get ` (podcast)`. Case-folded NFC clashes with any root entry get ` (2)`,
` (3)` and so on. Feed title changes never rename the folder. **Do not rename
show folders by hand:** the saved episode paths contain that folder name.

Episode paths are `<show>/<UTC YYYY-MM-DD|undated>-<10 hex>.<ext>`, expanding
the hash to 16 hex on a collision, then adding `-2`, `-3` and so on. The hash
is SHA-256 of the first available identity:

1. `guid:<guid>`.
2. `url:<enclosure URL>` without its fragment. The query is stripped only when
   the URL path has a supported audio extension; extensionless download URLs
   retain it because it may identify the episode.
3. `title:<title>|<published>`.

Merging matches identities first, then public enclosure URLs and title/date
pairs. Existing paths, ids, `first_seen` and `fetch` survive metadata changes.
Duplicate items collapse without merging distinct episodes that merely share
a title/date. Missing items gain `removed_at`; returning items clear it.
At the episode cap the Bridge drops removed episodes it never fetched, oldest
removed first. If that is insufficient it fails `too_large`. At the byte cap it
first clears descriptions of removed episodes, then fails if still too large.

Supported output extensions are `mp3`, `m4a`, `m4b`, `mp4`, `ogg`, `opus` and
`flac`. MIME selects MP3 (including the implemented MPEG/MP3 aliases), M4A, Ogg,
Opus or FLAC; an empty or `application/octet-stream` MIME falls back to a
supported URL-path extension. Unsupported enclosures, including AAC and WAV,
are skipped and counted in the result. Files use `0644`, directories `0755`;
writes use hidden temporary files, fsync and atomic rename.

## Job wire format

Both kinds are server-internal, module-owned and non-notable. The admin enqueue
route refuses them, and default admin job lists omit `podcast.poll` unless
explicitly filtered; follow/check and the scheduler create them. Subscribe has
`library_id`, null `path`, priority 10 and the listener's `requested_by`.
Its dedupe key is `podcast.subscribe|<library_id>||<feed_url_sha256>|<user_id>`.
Stored params are strict, server-built JSON:

```json
{
  "feed_url": "https://example.com/feed.xml",
  "feed_url_sha256": "<64 lowercase hex>",
  "feed_host": "example.com", "private": false, "show_path": ""
}
```

A private request stores `feed_url: ""` (see
[Private URLs](#private-urls-and-recovery)).
`show_path` names an existing show when restoring a missing credential. Poll's
`path` is one clean non-hidden show segment. Its params are optional `etag`
and `last_modified`, each at most 512 bytes. The Bridge drops URL-bearing or
overlong validator values before returning them to the server.

Progress uses `step` and `message`, with steps `fetching`, `parsing`, `writing`
and `indexing` (also `waiting` while an initial mapping check is pending).
Successful results:

| Kind | Result fields |
|---|---|
| `podcast.subscribe` | `library_id`, `show_path`, `show_id`, `created`, `private`, `episodes`, `skipped`, `status`, `etag`, `last_modified`, `next_poll_seconds` |
| `podcast.poll` | `library_id`, `show_path`, `status`, `changed`, `new_episodes`, `episodes`, `skipped`, `moved`, `etag`, `last_modified`, `next_poll_seconds` |

Validators are `""` when absent. `episodes` counts retained entries, including
removed ones; `skipped` counts unsupported items in the current feed. Failed
jobs carry a safe message in `error` and result
`{code, message, retry_after_seconds?}`. Codes and listener response shapes
are in the [API reference](../server/api/reference.md#podcast-actions).

## Polling and outcomes

The module's `Start` runs the server scheduler. It wakes on a committed ended
job and every **60 seconds**, folds outcomes idempotently through
`podcast_folded(job_id)`, and recovers ended podcast jobs from the last 24 hours.
It queues up to ten due shows per pass while an online Bridge offers
`podcast.poll`; only shows with a follower qualify, and open polls are deduped.
Scheduled polls have priority `-10`, manual checks `0`, subscribes `10`.

The Bridge returns `next_poll_seconds` based on the newest active episode:

| Episode age | Base interval |
|---|---|
| less than 2 days | 30 minutes |
| less than 14 days | 2 hours |
| less than 60 days | 6 hours |
| older or unknown | 24 hours |

`Cache-Control: max-age` can lengthen that interval. The server clamps a
successful interval to **15 minutes through 24 hours**. Validators live in
`podcast_feed_state`, not a disk file updated on every poll. `304` preserves
the saved validators, updates check/success times, and leaves unchanged feed
files alone. A poll also repairs indexing owed by an earlier failed rescan.

Failures update status and back off from 30 minutes exponentially to 24 hours,
or use `retry_after_seconds` clamped to 60 seconds through 24 hours. `gone`
(HTTP 410) stops automatic polls. Unwritable libraries are deferred. Turning
the module off stops scheduling and folding and holds queued podcast jobs;
already claimed jobs can finish.

Permanent 301/308 redirect chains and `itunes:new-feed-url` can move a feed.
The Bridge keeps previous hashes for dedupe; it rejects an HTTPS-to-HTTP
`new-feed-url` and avoids cycling back to a previous hash. A feed may become
private on a move and never becomes public again automatically.

## HTTP guard

`internal/netguard` handles feeds and artwork. Only HTTP(S) is accepted.
Environment proxies are disabled. Every resolved address must be public or
explicitly allowed; IPv4-mapped addresses are unwrapped and NAT64 addresses
checked against their embedded IPv4 address. Loopback, private, link-local,
multicast, documentation, CGNAT and reserved ranges are refused by default.
The dialer connects to the addresses it checked and checks again immediately
before connect; redirects use the same guard, with at most ten redirects.

Limits: 10-second connect and TLS handshake, 15-second response headers,
30-second body stall and a three-minute fetch ceiling. Gzip is decoded under
the response size cap. The default feed cap is **32 MiB**, configurable from
1 to 64 MiB. Transient network failures and retryable HTTP responses get at
most two retries with jittered 1- and 4-second delays; a Retry-After above ten
seconds is returned for server scheduling instead of slept through.
Errors use bounded messages without remote URL text.

For feeds on a trusted local network, explicitly configure
`podcasts.allow_networks` (empty by default); it grants the named CIDRs to
**feeds and artwork**, so use the narrowest range needed. See
[Configuration](configuration.md#podcasts) for exact keys and environment names.

## Private URLs and recovery

Both repos implement the same URL normalization, hashing and privacy rules.
Normalization trims, accepts HTTP(S) only, lowercases scheme/host, removes one
trailing host dot and a default port, drops fragments, preserves userinfo,
escaped path and raw query, makes an empty path `/`, and caps at 2,048 bytes.
`RedactURL` keeps scheme and host/port, with `/...` when a path or query exists.

A URL is private with userinfo, any query, a known private-feed host
(`patreon.com`, `supercast.com`, `supercast.tech`, `memberfulcontent.com`,
`supportingcast.fm`, `glow.fm`, `steadyhq.com`, including subdomains),
a hostname ending in `substack.com` with `/private/` in the path, or a path segment
of at least 24 URL-safe characters containing both a letter and a digit.
`private:true` forces privacy; `false` cannot force a private URL public.

The server holds a private subscribe URL only in memory from follow until the
job ends. Stored params have `feed_url: ""`; the URL is injected only into the
claim answer. A restart before claim fails it as `request_expired`: follow
again. The Bridge seals the URL **before** recording its local claim, under
`podcast_job_<id>_<attempt>`, then keeps the show's URL as
`podcast_feed_<show_id>`. The temporary credential is removed when the job ends.
The Bridge database and page responses never persist or expose the raw secret.

Private `feed.json` files omit feed/enclosure/chapter/transcript URLs and the
show link. URL-bearing text is redacted and URL-bearing GUIDs hashed. Job
params, errors and results are redacted at read/report boundaries too. Private
shows are scoped to their followers, including player-facing admin requests;
the admin catalog remains an administrative disk view. Knowing the normalized
URL's current or previous hash is the proof for another follow. Lost vault
credentials yield `feed_secret_missing`; following the URL again queues a
subscribe restoring the credential for the existing show. The server's
`secret_missing` latch keeps this recovery available after a later poll fails
for a different reason. A follow is bound to the show's `show_id` as well as
its path, so replacing a private show at the same path does not inherit follows.

## Spike results: extensions and MP3 chapters

**Spike 5:** all 15 sampled feeds retained their Podcast Namespace attributes
in `gofeed.Extensions`. GUIDs appeared in 6 feeds, chapter links in 13 and
transcripts in 12; every sample used the `podcast` prefix. The implementation
uses extension data from gofeed and resolves prefixes by the namespace URI,
`https://podcastindex.org/namespace/1.0`. It scans XML declarations for that
mapping rather than maintaining a second parser for extension values.
Chapter/transcript links are stored for future work, not fetched in this phase.

**Spike 6:** with ffprobe 7.1.1, the server's `metadata.Extract` matched all
89 ID3v2 CHAP chapters across five original Chaosradio MP3s, including every
title and start/end timestamp (rounding below 0.000001 ms). A sixth source MP3
had no chapters and did not count toward the five-file check. Controlled
variants exposed gaps: without TIT2 the title became the frame id `chp0`;
chapter APIC images were absent from the server model; reversed ordered CTOC
children did not change timestamp/physical CHAP order.

The probe covers ordinary titled chronological chapters, not full CHAP
fidelity. A Bridge CHAP reader and `.audiosilo/<stem>.chapters.json` output with
a new `from` value remain a later-phase follow-up, with explicit decisions
needed for missing titles, images and CTOC order. This phase changes no chapter
behavior.
