---
title: "Podcasts"
description: "Podcast jobs, on-demand fetch/status/Retry, discovery and OPML, the player (2d-1) and its discovery and OPML screens (2d-2), queue prefetch, pinned generations, guarded downloads, retention, publication recovery, CHAP attachments and private feed secrets."
---

## Scope and ownership

Bridge Phase 2c-2 adds `podcast.fetch` (ordinary `download` plus a reserved
`interactive` slot, two downloads total) and
`podcast.retain` (`light`), alongside `podcast.subscribe` and `podcast.poll`
in `light`. All four are writing jobs needing a mapped, writable podcast
library and the server's `podcasts` module (`RequiresBridge: "podcast"`). The module ships
off. `capabilities.podcasts` is always present and is true only with the toggle
on and an online Bridge advertising the `podcast` feature.
The independent core flag `capabilities.podcast_fetch:true` advertises the
on-demand/status protocol even offline or module-off; older servers omit it.

The server holds follows, feed status, HTTP validators, schedules and job
intents, per-show retention policies and aggregate deletion eligibility. The
Bridge owns `feed.json`, artwork, audio, CHAP attachments and private
credentials, then asks the server to index the show. The server never
writes into the library. Implementations are the Bridge's `internal/podcast`,
`internal/podcastjob` and `internal/netguard`, and the server's
`internal/podcast`, `internal/catalog/podcasts.go` and `internal/library/podcasts.go`.

Downloads are scheduled by policy, requested by an admin, or triggered by
on-demand play and one-ahead queue preparation. Phase 2c-2b adds shared fetch
intents, status/Retry routes and a bounded stream wait. Phase 2c-3 adds
server-side [directory search and OPML import/export](#discovery-and-opml-transfer)
with no Bridge change. Phase 2d-1 adds the [player](#player-phase-2d-1)
(shows, show and episode pages, following, Home's New episodes, on-demand
play) with no Bridge change; Phase 2d-2 adds [discovery, follow by URL, OPML
and Check for new episodes](#player-discovery-and-opml-phase-2d-2) to the
player, with a CORS change on the server only.
External chapters and transcripts arrive later.
Players from **2.2.0** (`auth.PodcastPlayerMinVersion`), the admin console
and `AudioSilo/dev` see podcast libraries; 2.1.x and older players, the
manager, API keys and requests with no client header do not. Read routes are core and stay available without the module or
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
  <Show Folder>/2026-10-19-3fa94c0b1d.mp3
  <Show Folder>/.audiosilo/2026-10-19-3fa94c0b1d.chapters.json
  <Show Folder>/.audiosilo/2026-10-19-3fa94c0b1d.publish.json  (transient barrier)
  <Show Folder>/.audiosilo-tmp-<random>                      (staged audio)
  <Show Folder>/.audiosilo-trash/podcasts/<transaction>/     (owned deletion)
<Bridge data>/podcast-fetch/<pairing hash>/<checkpoint>.json
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

**Episode order** (`podcast.newestFirst`): the newest publication date first,
then, for episodes sharing a date or with none (a LibriVox serial), the higher
season (none counts as 0), then the higher episode number (a numbered episode
before an unnumbered one), then the path. So an undated serial lists from its
last numbered episode back to E1, not in the order of its hashed file names
(v0.3.0; before, date then path). The server's episode lists, `/next` and the
retention windows use the same key
([episode order](../server/api/reference.md#podcast-read-routes)).

`show` contains `title` (300 bytes), `author` (300), `description` (4,000),
`link` (`""` when private), `language` (35), `type` (`episodic` or `serial`),
`explicit`, `categories` (up to ten), `podcast_guid`, and nullable `image`.
An image is `{file, source_sha256, fetched_at}`: only the image URL's hash is
saved. Artwork uses the same guarded HTTP client as feeds, is sniffed as JPEG
or PNG, and is capped at **10 MiB**. Artwork failure does not fail the feed job.
Failures back off from one hour to 24 hours in the Bridge's durable
`podcast_artwork_state`, keyed by server/library/show id with an image-URL hash
identifying the current source.
A changed image hash retries; success clears the failure. Existing artwork
survives failures; a `304` fetches no artwork and writes no feed file. An
artwork failure alone does not change the feed timestamp.
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
| `fetch` | `null` until a download is committed; otherwise the pinned generation below, including after deletion |

```json
{"generation":2,"sha256":"7be5836ba147da1215098df9f7a34f33b157d07fd92dd801928c9caef17e6d2b","bytes":16493,"duration_ms":4056,"content_type":"audio/mpeg","fetched_at":"2026-10-21T08:00:00Z","deleted_at":"","timeline_changed":true,"codec":"mp3"}
```

Generation must be at least 1, SHA-256 64 lowercase hex, bytes and duration
positive, and timestamps RFC 3339 (`deleted_at` may be empty). `codec` is
optional for older files; absence uses conservative codec handling. An invalid
Fetch keeps the episode listed but grants no presence, ETag or deletion authority.
Polls and deletion preserve the known Fetch fields. A committed regular audio
file of the expected size, with no deletion timestamp or publication barrier,
gives `duration_source: "file"` and the probed duration/codec. Otherwise the
server uses a positive feed duration (`"feed"`) or zero (`"none"`), with size 0.
The server does not probe or hash podcast audio. Progress stays keyed by
`(library_id, path)`.

The server validates episode paths as `<show>/<audio filename>`, one level,
clean, non-hidden, unique and supported by `metadata.IsAudio`. Bad entries are
skipped and logged. It indexes episodes even when files are absent. `/fs` uses
the index and displays titles, with serial shows oldest first and episodic
shows newest first. Loose audio and the feed/artwork files do not become entries.
An undownloaded episode has an empty chapter list. Its stream request
triggers a shared fetch; the Bridge publishes and rescans before any bytes
can be served. The server still does no on-demand audio indexing itself.

## Names and identity

The Bridge assigns a show folder once from its title: NFC normalization;
control, bidi-control and replacement characters removed; `/ \ : * ? " < > |`
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

All four kinds are server-internal, module-owned and non-notable. The admin
enqueue route refuses them, and default admin job lists omit `podcast.poll`
unless explicitly filtered (fetch and retain jobs are listed); dedicated
actions and the scheduler create them. Subscribe has
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
`show_path` names an existing show when restoring a missing credential; new
repair subscribes also carry optional expected `show_id`. Poll's
`path` is one clean non-hidden show segment. Its params are optional `show_id`,
`etag` and `last_modified`, the validators each at most 512 bytes. New work
binds the expected show id; the Bridge checks it before writing. It drops URL-bearing or
overlong validator values before returning them to the server.

Progress uses `step` and `message`, with steps `fetching`, `parsing`, `writing`
and `indexing` (also `waiting` while an initial mapping check is pending).
Successful results:

| Kind | Result fields |
|---|---|
| `podcast.subscribe` | `library_id`, `show_path`, `show_id`, `created`, `private`, `episodes`, `skipped`, `status`, `etag`, `last_modified`, `next_poll_seconds` |
| `podcast.poll` | `library_id`, `show_path`, `show_id`, `status`, `changed`, `new_episodes`, `episodes`, `skipped`, `moved`, `etag`, `last_modified`, `next_poll_seconds` |

Validators are `""` when absent. `episodes` counts retained entries, including
removed ones; `skipped` counts unsupported items in the current feed. Failed
jobs carry a safe message in `error` and result
`{code, message, retry_after_seconds?}`. Codes and listener response shapes
are in the [API reference](../server/api/reference.md#podcast-actions).

### Fetch and retain jobs

`podcast.fetch` requires `library_id`, an exact indexed episode `path` and
strict params `{"show_id":"a1b2c3d4e5f60718","episode_id":"1cc306d831645e2b"}`.
No URL, credential, policy or book id travels in params. Dedupe is
`podcast.fetch|<library_id>|<path>`. A replacement identity cannot adopt an old
open job: the server settles that intent first. Both sides recheck identities
before work and publication. Fetch triggers use `bridge.EnsurePodcastFetch`;
retention has a lower housekeeping priority:

| Trigger | Priority |
|---|---|
| Play, Range, download, transcode or explicit listener Retry | `100` |
| Admin fetch | `20` |
| One-ahead queue prefetch | `10` |
| Policy-selected scheduled fetch | `-10` |
| Retention housekeeping (`podcast.retain`) | `-20` |

An existing queued, claimed, running or parked (`needs_attention`) intent is
shared and promoted with the maximum priority, never demoted. Promotion wakes
claims after commit without resetting requester, attempts, lease or progress;
it does not move a running job into another pool. Admin/listener Retry bypasses
terminal failure cooldown, but never open dedupe or a valid present pin.

Progress steps are `resolving`, `fetching`, `probing`, `writing`, `indexing`.
Byte counts are int64 `Progress.Extra` fields, including any proven prefix;
they may reset after a restart from zero. Unknown total is `null`:

```json
{"step":"fetching","bytes_received":1048576,"bytes_total":314572800,"message":"Fetching episode"}
```

Reports/keepalives occur at least every ten seconds. Success is
`{library_id,path,show_id,episode_id,fetch:Fetch,chapters:3,reused:false}`.
`reused:true` means a valid pin or recovered completed installation needed no
new enclosure GET. Failure is a failed job with safe `error` and
`{code,message,retry_after_seconds?}` result. Alongside guard codes, failures
include `episode_not_found`, `enclosure_missing`, `identity_changed`,
`invalid_audio`, `probe_unavailable`, `unsupported_encoding`, `index_failed`,
`library_not_writable`, `feed_secret_missing` (a private show's vault entry) and
`write_failed` (a disk failure, or an unverified file at the assigned path or an
invalid saved Fetch that needs administrator repair).
Results never include upstream bodies, URLs, headers or probe stderr.

`podcast.retain` requires the show `path` and `{"show_id":"<16 lowercase hex>"}`,
priority `-20`, no requester, dedupe by kind/library/path. Progress is
`{step:"retaining",message:"Checking retained episodes"}`. Success is
`{library_id,show_path,show_id,deleted:2,skipped:1}`. Protected, busy and stale
candidates count as skipped; mapping/feed/identity failures fail the job.

## On-demand play and shared intents

After authentication, client/private scope and exact indexed-path checks,
`/stream` uses `podcast.Demand.Fetch` for missing audio in every Range,
`download=1` and transcode branch. Unknown or hidden paths queue nothing.
It never passes through publisher bytes or serves a partial. A valid committed
descriptor can still play offline or module-off.

The absent-file fetch branch has one **two-second** budget for pin lookup,
enqueue/promotion, status reads and waiting. It registers a per-path broadcast
before rechecking presence, wakes on job/rescan changes and checks presence
once more before returning. Ready within the budget serves normal media;
otherwise it answers `503` with `Retry-After: 2`, `Cache-Control: no-store`
and `{error,code,fetch:Status}`. Codes are `podcast_fetching`,
`podcast_fetch_unavailable` or `podcast_fetch_failed`; exact shapes and
exceptions are in [status and Retry](../server/api/reference.md#podcast-fetch-status-and-retry).
Disconnect releases the waiter, never the shared household fetch. The final
budget-limited summary can still say queued after the job has started.

New work needs the module on, an online Bridge offering `podcast.fetch` and a
writable mapping. Existing work can still be returned/promoted when these
checks would refuse a new intent. Status overlays those refusals as
`unavailable`, including claimed/running work while module-off; those jobs may
finish. Ordinary stream retries respect terminal cooldown (30 minutes doubling
to 24 hours); observation never queues. Explicit listener/admin Retry bypasses
cooldown and still shares any open intent. Identity replacement can return
`409 identity_changed` rather than a retryable media 503.

Each non-admin creator has a cap of **five open `podcast.fetch` intents** across
libraries, including prefetch and parked work. The insert transaction checks
it after dedupe, so joining/promoting work succeeds at the cap and does not
transfer its requester or quota ownership. Admins and server-scheduled work
are exempt. A refused new stream fetch is `503 podcast_fetch_unavailable`
with `fetch.error.code: "fetch_limit"`; listener POST Retry uses
`409 fetch_limit`. This is independent of the subscribe-request cap.

### One-ahead queue preparation

`podcast.Prefetcher` starts a bounded background look after a play-fetch
request or ready stream start, without extending the stream wait. It uses the
actual caller's scoped `up_next`, including private-show proof, skipping book
entries. It selects at most the next visible podcast after the current item;
if current is not queued, the first visible podcast other than current wins.
Ready, fetching, failed/cooling or unavailable candidates create no new work;
an absent candidate can create priority 10 work and a queued candidate can
promote its existing row. Removed feed entries create no automatic fetch.

A successful queue mutation reconsiders while that user's current podcast
has a stream or open fetch, until one candidate is chosen. The bound is one
chosen candidate per user/current item, with global intent dedupe across users.
Removing it from the queue does not cancel shared work. Later play promotes
that same intent to 100. On demand permits this preparation, without
feed-wide scheduled downloads. Demo requests start neither fetch nor prefetch;
an existing shared fetch can still be promoted by a demo stream.

### Player (Phase 2d-1)

Phase 2d-1 ships the player side of this protocol and sets
`auth.PodcastPlayerMinVersion` to `"2.2.0"`: players from 2.2.0 (`app.json`
`expo.version`, sent as `X-AudioSilo-Client: AudioSilo/2.2.0 (<os>)`) see
podcast libraries; 2.1.x and older stay hidden
([client gate](../server/auth-and-security.md#podcast-visibility)). The
player-side walkthrough (screens, routes, the controller's wiring) is
[Frontend podcasts](../frontend/podcasts.md); this section is the wire and the
rules the player keeps.

**Types** (`src/api/types.ts`). Every new field on an existing type is
optional, so an older server leaves books as they were; every key *inside* a
new object is required, nulls included, as the server writes it. Open unions
(`| (string & {})`) take a value a newer server adds:

```ts
type LibraryKind = 'books' | 'podcasts';           // Library.kind?
type ChaptersSource = 'community' | 'generated' | 'id3_chap';
// Capabilities: podcasts?: boolean (the module), podcast_fetch?: boolean (core)
// Book: episode?: PodcastEpisodeInfo (only GET /item sends it)

type PodcastFetchState = 'absent' | 'queued' | 'fetching' | 'ready' | 'failed' | 'unavailable';
type PodcastFetchStatus = {
  state: PodcastFetchState | (string & {});
  request_id: number | null;
  bytes_received: number;
  bytes_total: number | null;
  retry_after_seconds: number;
  error: { code: string; message: string } | null;
};
type PodcastFetchResponse = { fetch: PodcastFetchStatus };
type PodcastFetchPendingCode =
  'podcast_fetching' | 'podcast_fetch_unavailable' | 'podcast_fetch_failed';
type PodcastGeneration = {
  fetch?: PodcastFetchStatus;
  generation?: number;
  sha256?: string;
  timeline_changed?: boolean;
};
type PodcastEpisodeInfo = PodcastGeneration & {
  show_path: string; published: string | null; season: number | null;
  episode: number | null; episode_type: 'full' | 'trailer' | 'bonus' | (string & {});
  explicit: boolean; downloaded: boolean;
  duration_source: 'file' | 'feed' | 'none' | (string & {}); removed: boolean;
};
type PodcastEpisode = PodcastGeneration & {
  path: string; title: string; published: string | null; duration: number;
  duration_source: 'file' | 'feed' | 'none' | (string & {});
  season: number | null; episode: number | null;
  episode_type: 'full' | 'trailer' | 'bonus' | (string & {});
  explicit: boolean; description: string; downloaded: boolean; size: number; removed: boolean;
};
type PodcastEpisodePage = { episodes: PodcastEpisode[]; next_cursor: string | null };
// PodcastShow, PodcastRequest, MyPodcasts and PodcastFollowResult mirror
// the read routes and POST /podcasts/follow in the API reference.
```

Do not confuse the public `fetch: PodcastFetchStatus` with the on-disk
`fetch: Fetch` pin. `generation`/`sha256`/`timeline_changed` are absent before
a valid pin and may remain after deletion; the player keeps an explicit
`timeline_changed: false`. A true flag only shows a notice on the episode page
(when the listener has progress): it never resets or rescales progress,
bookmarks or the finished mark. `id3_chap` is embedded MP3 metadata, not
generated chapters; the chapters tab captions it "Chapters from the episode
file".

**Client** (`src/api/client.ts`). Each method but the two follow writes takes
the optional abort `signal`:

| Method | Request |
|---|---|
| `podcastShows(libraryId)` | `GET /libraries/{id}/podcasts`, unwrapped to `PodcastShow[]` |
| `podcastEpisodes(libraryId, {show, order, limit?, cursor?})` | `GET /libraries/{id}/podcasts/episodes`, a `PodcastEpisodePage` |
| `myPodcasts()` | `GET /me/podcasts` (its `requests` are the follow requests [2d-2](#player-discovery-and-opml-phase-2d-2) shows) |
| `followPodcast(libraryId, path)` | `POST /podcasts/follow` with exactly `{library_id, path}`; never `private` beside a path |
| `unfollowPodcast(libraryId, path)` | `DELETE /podcasts/follow?library_id=&path=`, `204` |
| `podcastFetchStatus(libraryId, path)` | `GET /libraries/{id}/podcasts/fetch?path=`, observation only |
| `retryPodcastFetch(libraryId, path)` | `POST /libraries/{id}/podcasts/fetch` with exactly `{path}` |
| `prepareEpisodeStream(libraryId, path)` | `GET` the stream URL with `Range: bytes=0-0`, the token in `Authorization` (no `?token=`); a 2xx resolves |

Every JSON route and the probe decode a non-2xx answer through one helper
(`apiErrorOf`): a **503** whose JSON has a `podcast_fetch*` code and an object
`fetch` becomes `PodcastFetchPendingError` (an `ApiError` with `code`, `fetch`
and `retryAfterSeconds`: the `Retry-After` header when it reads as a
non-negative number, else `fetch.retry_after_seconds`, else 2). A non-JSON 503
from a proxy stays a plain `ApiError`. `API_ERROR_CODES` gains `module_off`,
`bridge_unavailable`, `fetch_limit`, `identity_changed` and `show_not_found`.
A cross-origin page reads `Retry-After` only from a server that exposes it
([CORS](../server/api/index.md#cors), Phase 2d-2); from an older one the
body's value is what it uses.

**Hooks** (`src/api/hooks.ts`). Reads are core and never gated on `podcasts`:
`usePodcastShows`, `usePodcastEpisodes` (an infinite query, 50 a page,
`next_cursor` as the page param), `myPodcastsQuery` and `latestEpisodesQuery`
(Home) ask only for a library whose `kind` is `podcasts`. `useFollowPodcast`
and `useUnfollowPodcast` are `useCapabilityMutation('podcasts', ...)`: they
patch `following` in the cached show list (an unfollowed private show leaves
it) and read `myPodcasts` again. `usePodcastFetchStatus` is a plain
`podcast_fetch` capability query with no interval. Query keys:
`['podcastShows', cid, lib]`, `['podcastEpisodes', cid, lib, show, order]`
(Home's one page is `[..., show, 'latest', limit]` under the same show prefix),
`['myPodcasts', cid]` and `['podcastFetch', cid, lib, path]`. There is no
retry hook: Try again is the controller's.

**The episode-fetch controller** (`src/playback/episode-fetch.ts`) is the one
poller. The rules it keeps:

- **The probe is the play trigger.** A start of an episode that is not
  downloaded, on a server with `podcast_fetch === true`, goes to
  `requestEpisodeFetch`, which asks `/stream` once (`prepareEpisodeStream`).
  A play goes through `/stream` rather than POST because an ordinary stream
  fetch respects the failure cooldown, while POST is reserved for the explicit
  Try again (it bypasses it). The stream's two-second hold also serves an
  episode that is about to be ready.
- **Polling.** While `queued` or `fetching`, it GETs the status every
  `max(2, Retry-After)` seconds and seeds `['podcastFetch', ...]` from every
  answer (the 503's `fetch`, the POST's, each GET's). A network error, a `429`
  or a `5xx` while polling reschedules the next turn with a backoff
  (`blipDelay`: 2 seconds, doubling with each failed look in a row up to 60,
  never under the answer's `Retry-After`; an answer resets it), so a server
  answering 5xx for good is not asked every 2 seconds.
- **Background.** It pauses while the app is not active and asks once at once
  on the way back (`onForeground`; RN-web maps it to `visibilitychange`).
- **It never POSTs by itself.** It stops at `failed`, `unavailable`, or
  `absent` after a trigger (shown as failed); only Try again
  (`retryEpisodeFetch()`, or `requestEpisodeFetch(..., {retry: true})` from a
  row or the episode page) sends the POST. `409 fetch_limit` is `refused`;
  `module_off`, `bridge_unavailable`, `library_not_writable` and
  `demo_account` are `unavailable` with that code; `identity_changed`
  invalidates the item and the library's episode lists and stops as failed.
- **Abort, never cancel on the server.** One `AbortController` per run. Any
  other start, a profile switch (`mayActFor`), a removed connection
  (`resolveClient`) or the listener's Cancel ends the run; the server's shared
  fetch carries on. There is no client time cap: the Bridge's size-scaled
  ceiling ends a dead fetch as `failed`.
- **Refresh at ready.** It reads the item and its chapters again
  (`staleTime: 0`), marks the show's episode lists stale, then starts the
  episode in place with `{fetched: true}`, which plays only while the fetch is
  still `starting` (a Cancel or another start since wins).

**Exclusions.** Episodes are never downloaded in 2d-1 (decision 6.1): the
downloads store refuses `book.episode` as `unsupported`, the download control
and the tile menu leave it out, and auto-download and keep-ahead skip it (an
absent episode would answer 503 to the native download engines, and nothing
would clean the files up). The Cast button hides for an episode (cast tokens
never see podcasts; the server answers `403` to `POST /cast/token` for one,
with `error.code: "not_a_book"` from 2.4.0), and starting an episode while a
book is cast is refused before any token is asked for (`CastBlockedError`
`episode`; a `not_a_book` refusal reads the same).
An episode never opens the end credits. Kids mode lists no podcast library
(decision 6.2). Golden: the player keeps `wire-2b.json` byte-identical in
`src/testing/podcast-fixtures/`.

## Discovery and OPML transfer

Phase 2c-3 adds two server-only flows, with **no Bridge change**: directory
search, whose results are followed through the existing follow by URL, and
OPML import and export of subscription lists. The player's screens for them
are [Phase 2d-2](#player-discovery-and-opml-phase-2d-2) (the console has
none); the routes, shapes and error codes are in the
[API reference](../server/api/reference.md#podcast-discovery).

- **Search runs on the server.** `internal/podcast/discovery` asks Apple's
  iTunes Search API by default, or Podcast Index when the caller picks it and
  the server holds its key pair (`AUDIOSILO_PODCAST_INDEX_KEY` /
  `_SECRET`, server environment only; see
  [configuration](../server/configuration.md#podcast-discovery-podcastsdiscovery)).
  The Bridge has no directory setting or credential and is never asked to
  search; the server proxies result artwork itself, so devices fetch nothing
  from third parties. Search does not need an online Bridge.
- **Following stays one path.** `podcast.Follower` (`internal/podcast/follow.go`)
  is the single follow by URL behind both `POST /podcasts/follow`'s `feed_url`
  and every OPML import row: whole-library grant, the URL's current or previous
  hash finds a known show (followed at once, offline too), and only a new feed
  or a secret repair queues the same `podcast.subscribe` job as before (priority
  10, quiet, internal). No new job kind, params, migration or heartbeat field.
- **Caps are unchanged and shared.** Single follows and imports share the
  five-open subscribe cap ([waves](../server/api/reference.md#post-apiv1podcastsopmlimport)). An open
  request is reused only at the same privacy: the other privacy is
  `409 privacy_conflict` (an `error` row in an import), checked inside the
  dedupe transaction, so a private URL is never attached to a public job.
- **Private URLs are unchanged.** An imported private feed is handled exactly
  like a single private follow ([Private URLs and recovery](#private-urls-and-recovery)).
  The export never writes a private show (there is no stored copy of its URL);
  it reports how many it left out in `X-OPML-Omitted-Private`.
- **Admission.** A URL must normalize to the same value when normalized again
  (`feed.NormalizeStable`), else `invalid_feed_url` (`400` on the single
  follow, an `invalid` row in an import), before anything is queued. The
  canonical hash bytes and the Bridge's URL vectors are unchanged.

### Player: discovery and OPML (Phase 2d-2)

The player (first released with these screens in 2.4.0) searches a
directory, follows a feed by its address, imports and exports OPML lists and
asks a followed show to check for new episodes. The
screens are in [Frontend: Podcasts](../frontend/podcasts.md#finding-shows);
this section is the wire mirror and the rules the player keeps. The only
server change is CORS: an allowed origin may read `Retry-After` and the
`X-OPML-*` counts and send `Range` ([CORS](../server/api/index.md#cors)). No
Bridge, console or migration change.

**Types** (`src/api/types.ts`). `Capabilities` gains the optional core flags
`podcast_discovery` and `podcast_opml` (not `ModuleFlag` entries). Every key
inside a returned object is always sent, nulls included:

```ts
type PodcastDiscoveryProvider = 'itunes' | 'podcast_index';
type PodcastDiscoveryProviders = {
  providers: { id: PodcastDiscoveryProvider | (string & {}); available: boolean }[];
};
type PodcastDiscoveryResult = {
  title: string; author: string;
  feed_url: string;               // normalized public address: what a follow sends
  artwork_url: string | null;     // relative: /api/v1/podcasts/discovery/artwork?id=<64 hex>
  provider_ids: { itunes: string | null; podcast_index: string | null }; // strings, they exceed 2^53
  episode_count: number | null; provider_url: string | null;
};
type PodcastDiscoverySearch = {
  provider: PodcastDiscoveryProvider; query: string;
  country: string | null;         // null for podcast_index
  results: PodcastDiscoveryResult[];
};
type PodcastCheckResult = { request: { id: number; state: string } }; // POST /podcasts/check 202
type OpmlImportResult = { library_id: number; rows: OpmlImportRow[] };
type OpmlExport = {               // client-side: the body and the X-OPML-* counts
  text: string; exported: number | null;
  omittedPrivate: number | null; omittedUnavailable: number | null;
};
```

`OpmlRowStatus` and `OpmlImportRow` mirror the
[import reference](../server/api/reference.md#post-apiv1podcastsopmlimport),
their one written copy.

**Client** (`src/api/client.ts`):

| Method | Request |
|---|---|
| `podcastDiscoveryProviders()` | `GET /podcasts/discovery/providers` |
| `searchPodcastDirectory({q, provider, country?, limit?})` | `GET /podcasts/discovery/search`; `country` is sent only with `provider=itunes` |
| `discoveryArtworkUrl(rel)` | no request: the artwork route rebuilt from the result's 64-hex `id` with the media token (`?id=&token=`); `null`, an absolute URL, another route or a bad id gives `null` (the placeholder) |
| `followPodcastByUrl(libraryId, feedUrl, {private})` | `POST /podcasts/follow` with exactly `{library_id, feed_url}`, plus `private: true` only when set |
| `checkPodcast(libraryId, path)` | `POST /podcasts/check` with exactly `{library_id, path}` |
| `importOpml(libraryId, body)` | `POST /podcasts/opml/import?library_id=` with the raw bytes (a `Blob` on the web, a `Uint8Array` on a device; `send()`'s `raw` body), always `Content-Type: text/x-opml`, no compression, a timeout of at least 45 s (the client's own when longer; the server's import budget is 30 s) |
| `exportOpml()` | `GET /podcasts/opml/export` with the `Authorization` header (no `?token=` link exists); the counts read through `Headers.get`, so Go's `X-Opml-*` spelling matches, and a missing or non-numeric one is `null` |

`ApiError` gains an optional `retryAfterSeconds`: `Retry-After` when it
reads as a non-negative number, on any status (a date, or a header the
browser can't read, is absent). `API_ERROR_CODES` adds `privacy_conflict`,
`too_many_requests`, `checked_recently`, `invalid_feed_url`,
`no_library_access`, `not_podcast_library`, the discovery codes
(`discovery_off`, `provider_unavailable`, `invalid_query`, `invalid_country`,
`discovery_rate_limited`, `provider_rate_limited`, `discovery_busy`,
`discovery_timeout`, `provider_rejected`, `discovery_unavailable`) and the
OPML codes (`opml_rate_limited`, `opml_busy`, `opml_limit`, `invalid_opml`,
`unsupported_opml_type`, `opml_export_limit`).

**Hooks** (`src/api/hooks.ts`):

- `usePodcastDiscoveryProviders` and `usePodcastSearch(params | null)` are
  `useCapabilityQuery('podcast_discovery', ...)` with `staleTime` 15 minutes
  (the server's own cache) and `retry: false`; `null` params ask nothing. Keys
  `['discoveryProviders', cid]` and
  `['discoverySearch', cid, provider, q, country, limit]`, so an unchanged
  repeat reuses the held results.
- `useFollowPodcastByUrl` and `useCheckPodcast` are
  `useCapabilityMutation('podcasts', ...)`; `useExportOpml` is
  `useCapabilityMutation('podcast_opml', ...)`. A `200 following` goes into
  the cached show list (`storeFollowing`; the list is read again when it lacks
  the show) and `['myPodcasts', cid]` is read again; a `202 subscribing`
  request goes to the head of the cached follow requests (`storeAnswer`, so a
  poll already in flight can't land over it).
- `useFollowRequests(libraryId, {active})` selects one library's
  `GET /me/podcasts` `requests`, open first then ended, newest first
  (`libraryRequests` in `src/lib/podcast-requests.ts`). It reads again every
  5 s (`FOLLOW_REQUEST_POLL_MS`) only while one of them is open (`queued`,
  `claimed`, `running` or `needs_attention`: `isOpenRequest`, the Bridge
  job's open states), its screen is focused (`active`) and the app is in the
  foreground, so nothing polls once they have all ended. `myPodcastsQuery`
  compares each answer with the last: a request it saw open that now reads
  `done` reads its library's show list again, whichever screen asked.

**The rules the player keeps:**

- **Flags.** An absent `podcast_discovery` or `podcast_opml` reads as
  unsupported. Adding shows (the page and its entry points) needs
  `podcasts === true` and is never offered to a kid's account or the demo;
  inside, Search needs `podcast_discovery`, Import needs `podcast_opml`, the
  feed address is always there. Export needs `podcast_opml` and not the demo,
  and works with the module off. Check for new episodes is for a followed
  show under the same rule as adding. The flags don't describe the caller, so
  the refusals (`kid_account`, `demo_account`, `no_library_access`,
  `module_off`, `discovery_off`, `not_podcast_library`) still have their own
  wording.
- **Search on submit only**, never while typing: the text trimmed with its
  whitespace runs collapsed (as the server cleans it) and at least two code
  points, `limit` 20 sent explicitly. The same search again reuses the held
  results; it is asked again only after it failed. Apple Podcasts unless
  `podcast_index` is `available`, when a picker chooses; a failed search is
  never retried on the other provider. `country` is the device locale's
  `regionCode` (expo-localization) when it is two letters A-Z, for iTunes
  only, never `metadata.region`; otherwise it is left out (the server's
  default, US). The list is captioned with the provider ("Results from Apple
  Podcasts") and each result links its `provider_url`. A `429` shows its
  `Retry-After` wait when it has one.
- **Artwork** loads only through the server's proxy (`discoveryArtworkUrl`),
  lazily as the list windows rows in. An image can't see the status and the
  route refuses any extra parameter (no cache buster), so a failed load (the
  server fetches uncached images a few at a time: `429`/`503`) mounts the
  image again with the same URL after 3, 10 and 30 seconds
  (`artworkRetryDelay`, four tries in all), then keeps the placeholder (an
  expired id is a `404` every time).
- **Follow by address** checks the address first (http or https with a host,
  at most 2,048 bytes), so a bad one sends nothing. A result's Follow is the
  same call with its `feed_url`.
- **Import waves** (`OpmlWaves`, `src/components/podcasts/opml-waves.ts`,
  framework-free with its own timers; `useOpmlImport` keeps it, and the
  picked bytes, for the Find shows page's life). A file over 1 MiB is refused
  before any upload. Each upload's rows merge by `outline_index` (the latest
  answer wins, except that a row this import followed or queued stays
  followed when a later wave answers it `already_following`). No `limited`
  row left: `done`, and no other wave is sent (what is queued is followed
  live). `error` rows never start a wave either: a server from 2.4.0 answers
  a feed whose follow failed within the hour `recently_failed` and queues
  nothing, so a few dead feeds no longer take every wave's slots. Otherwise the next upload of
  the same bytes waits until every request this import queued (`queued` and
  `already_queued` rows' `request_id`) is no longer open in
  `GET /me/podcasts` (absent counts as ended; read every 5 s), fewer than five
  of the caller's requests are open, and 30 seconds have passed since the last
  upload. `unavailable` rows never start a wave: a `done` import with some
  left offers a manual Try again (`canRetryImport`), which uploads once more.
  The panel reads each queued row's request live, so the import reads done
  ("All done.") only once none is still being added and none failed. **A row
  that could not be added** (`error`, `recently_failed` included, or one whose
  request ended `cancelled`) has its own **Try again**: a single
  `POST /podcasts/follow` by address, which the server always tries again.
  The server reports only a redacted label, so the address comes from the
  picked bytes (`outlineFeeds` in `opml-feeds.ts`, counting outlines as the
  server's parser does) and is used only when its scheme and host match the
  row's label (`rowFeedUrl`); a row whose address can't be found has no Try
  again. Its answer stands over the waves' answer for that row
  (`withRetries`). A wave that moves no row out
  of `limited` stops as `stalled` (Try again). `429 opml_rate_limited` and
  `503 opml_busy` wait their `Retry-After` (else 30 s and 2 s); five such
  answers in a row stop it. Any other refusal stops as `failed` with its code,
  and a network failure or a timeout as `failed` with none; Try again
  re-uploads, which is safe (rows already done answer `already_following` or
  `already_queued`). The controller holds its timers in the background and
  looks again at once on the way back, checks `mayActFor` before each upload,
  and sends nothing more after Stop or once the page is gone.
- **Export** reads the counts from the `X-OPML-*` headers; a count that
  reads `null` gives "Exported your shows", and `413 opml_export_limit` has
  its own message. How it is saved:
  [Entry points](../frontend/podcasts.md#entry-points).
- **Check for new episodes** refreshes once after the `202`, with no polling,
  since a check is not a follow request; `429 checked_recently` and
  `bridge_unavailable` have their own wording. The button and its timer:
  [Check for new episodes](../frontend/podcasts.md#check-for-new-episodes).
- **Copy** never shows the server's English and never says "Bridge":
  refusals read through `find-shows-model.ts`, and a failed request's
  `error.code` through `requestReasonKey` (`podcast-model.ts`: `dns`,
  `timeout`, `tls`, `network` could not reach the feed; `not_a_feed`,
  `not_a_podcast`; `gone` (410), `http_404` (nothing at that address),
  `http_401`/`http_403` (refused) and other `http_*`; `blocked_address` (a
  local network the server may not reach); `too_large`; `request_expired` and
  `feed_secret_missing` ask to follow again), all six locales. An import row's
  reason (`importRowReasonKey`) is its request's when the requests list it,
  else its own code's (`recently_failed`: it failed within the last hour,
  follow it on its own to try again).

**Goldens.** The player keeps the server's
`internal/podcast/testdata/phase2c3/` files it reads byte-identical in
`src/testing/podcast-fixtures/phase2c3/` (`wire.json`,
`providers/*-normalized.json`, `opml/duplicates-private-expected.json`,
`opml/export-expected.opml`, `opml/export-expected-headers.json`,
`opml/queue-cap.opml`), and `podcast-fixtures-2c3.test.ts` checks each one's
SHA-256 against the copied `manifest.json`.

## Retention policy and deletion authority

An admin sets one shared policy per show through the
[storage API](../server/api/reference.md#podcast-storage-admin); there is no
retention UI. The default is `{"mode":"keep","keep":3,"days":7}`.
All keys are required on PUT, including unused ones: `mode` is
`keep|on_demand|archive`, `keep` 1..1000, `days` 0..365.
Policies are durable server state keyed by library/path/show id, not feed data.
A replacement show at the same path starts with the default.

- Keep downloads the newest N currently listed entries in the episode order
  above (publication, season, episode number, path, descending), undated last.
  Deletion additionally requires being outside this window.
- Archive downloads every currently listed entry oldest first (the same key
  ascending), undated last, and never deletes.
- On demand fetches on play and permits one-ahead queue preparation, with no
  feed-wide scheduled downloads. Individual admin fetches work too. Its
  deletion rule has no Keep window.

Removed feed entries are never auto-fetched, but their saved bytes remain
playable and an admin fetch can try their saved enclosure. Without followers
there is no policy-scheduled download or deletion; authorized play/Retry and
queue preparation still work. Keep N is a window, not a disk limit: an
unfinished follower can keep files indefinitely.

Before deleting, the Bridge reads the policy and requests a
[retention aggregate](../server/api/reference.md#bridge-podcast-retention) for
the exact committed generation/hash/size. The server reads policy, follows,
progress, exact episode favourites, queues and open fetch jobs in one DB
snapshot, then adds the live stream mark. It returns a follower count and
booleans/times, never user ids, names or positions.

Followers count only while enabled, non-demo, bound to the current show id and
still granted the episode, with podcast access explicitly enabled for this
internal scope resolution. Missing progress, unfinished state or invalid
finish time denies deletion. Zero followers never means everyone finished.
A new follower blocks; unfollowing or losing access removes that follower.
An exact episode favourite protects conservatively even after access is
revoked; a show-folder favourite does not. Any exact queue entry, active
direct/download/transcode request or open fetch also protects.

`delete_after = max(all_finished_at, fetch.fetched_at) + days * 86400 seconds`.
Eligibility requires elapsed grace, every follower finished, no protection,
non-Archive policy and, for Keep, being outside its window. Refetching resets
grace. The Bridge rereads identities and verifies local audio hash/length
under the show mutation lock, then obtains a fresh aggregate immediately
before deletion. It rejects missing, stale, invalid or failed answers.
The five-second freshness bound uses elapsed time from request dispatch on
the Bridge's monotonic clock, including a final check at the rename boundary;
the server's `checked_at` remains on the wire but is not the freshness clock.
This is a snapshot, not a lock against later follows.

Deletion journals and renames only owned audio/CHAP into
`.audiosilo-trash/podcasts/<episode_id>-g<generation>-<nonce>/`, saves
`Fetch.deleted_at` without losing other Fetch fields, removes the barrier,
rescans the show and then unlinks trash. Entries, artwork and listener state
remain. Windows refusing an open-file rename skips that candidate. A delete
journal whose audio never moved is aborted during recovery; once it moved,
recovery finishes the tombstone before another fetch.

## Publication, generations and serving

A valid present pin is never replaced. First commit uses generation 1 and
`timeline_changed:false`. After deletion, the same hash keeps its generation;
a different hash increments it and latches `timeline_changed:true`, even with
the same duration. Later equal hashes retain that warning. Saved progress,
finished state, bookmarks, annotations and queues are never rescaled or reset.

Per-episode process/filesystem locks prevent overlapping reclaimed writers.
The filesystem lock is the episode's `.fetch.lock`; its holder removes it while
still holding it, as it lets go (`releaseLock`, v0.3.0; before, the files
stayed), and a waiter that then gets a lock on a file no longer at that path
opens the path again (`lockedAt`), so the files never pile up and no two jobs
hold one.
The short show mutation lock is shared by subscribe/poll/fetch/retain and never
spans an audio GET. A writer recovers journals, confirms its lease, checks
mapping and identities, and rereads the latest feed before committing, keeping
concurrent poll metadata changes.

Publication order is staged hash/probe, durable journal, audio installation,
atomic CHAP write/removal, atomic Fetch merge into `feed.json`, directory sync,
journal removal, then targeted `POST /bridge/rescan {library_id,path:<episode>}`.
Audio installation first tries an exclusive hard link, falling back on
unsupported filesystems to a no-replace rename. It stays on the show filesystem
and refuses foreign files at the assigned path; manual audio is a repair
conflict, never adopted or overwritten. Final files are `0644`, folders `0755`,
partials/checkpoints `0600`; symlinked show/audio/attachment/journal paths fail.

`<show>/.audiosilo/<stem>.publish.json` is a version-1, at most 4 MiB journal:

```text
{version:1, op:"install"|"delete", show_id, episode_id, path,
 audio_temp, trash_dir, fetch:Fetch, chapters:ChapterList|null}
```

Unused temp/trash fields are empty strings. Names are validated within the same
show, with no secrets or URLs. Its existence blocks indexing/serving that
episode; even a malformed or symlinked journal fails closed. Recovery verifies
owned staged/installed bytes and completes chapters/Fetch without incrementing
the generation again. Missing or corrupt candidates require repair. A new
generation without CHAP removes its old CHAP file. Failed rescan after disk
commit yields `index_failed`; a retry repairs indexing with `reused:true` and
no publisher GET. The shared `publish-v1.json` fixture fixes the exact shape.

The server opens a regular descriptor, checks current feed signature/identity,
expected size, named-file identity and absence of a journal, with a bounded
retry on change. That descriptor serves the whole request, including transcode;
the path is never reopened after validation. The transcode reads it as ffmpeg's
stdin through `fd:` (seekable: an input seek, and a non-faststart m4a demuxes)
when the ffmpeg has that protocol, else through the older non-seekable `pipe:0`
(see [Transcoding](../server/media.md#transcoding-mediatranscode)). Direct streams and downloads use
strong `ETag: "podcast-g<generation>-<sha256>"`, `Cache-Control: private, no-cache`
and byte ranges. Matching `If-Range` gives 206; an old validator gives a full
200 of the current generation. Changed bytes change the ETag even at equal
size/mtime. Transformed output has no source strong ETag or byte seeking.
An already-open descriptor can finish across deletion where the OS permits.

## Polling and outcomes

The module's `Start` runs the server scheduler. It wakes on a committed ended
job and every **60 seconds**, folds outcomes idempotently through
`podcast_folded(job_id)`, and recovers ended subscribe/poll jobs from the last
24 hours. Unfolded fetch/retain outcomes have no age cutoff.
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

The same scheduler considers downloads and retention at startup, every minute,
and after follow/policy changes and committed podcast outcomes, including an
unchanged poll. It admits at most ten new fetches per pass, two per show, with
a rotating show cursor for Archive fairness; existing open jobs do not spend
new quota. At most ten retains start per pass, no more than one per show per
hour by latest retain creation, requiring followers and present files.

Feed status is bound to `(library_id,show_path,show_id)`; late outcomes for a
replaced show and unbound pre-upgrade polls cannot restore its status or
validators. Fetch outcomes use separate `podcast_fetch_state`, backing off
from 30 minutes exponentially to 24 hours (a larger Retry-After also caps at
24 hours); success clears it. Cancellation/identity replacement is not a
failure. Fetch/retain never update poll validators or secret flags. When new
work is admitted, older terminal fetch/retain rows are pruned only after
folding, preserving the newest row and the separate summary.

Permanent 301/308 redirect chains and `itunes:new-feed-url` can move a feed.
The Bridge keeps previous hashes for dedupe; it rejects an HTTPS-to-HTTP
`new-feed-url` and avoids cycling back to a previous hash. A feed may become
private on a move and never becomes public again automatically.

## HTTP guard

`internal/netguard` handles feeds, artwork and episode audio. Only HTTP(S) is accepted.
Environment proxies are disabled. Every resolved address must be public or
explicitly allowed; IPv4-mapped addresses are unwrapped and NAT64 addresses
checked against their embedded IPv4 address. Loopback, private, link-local,
multicast, documentation, CGNAT and reserved ranges are refused by default.
The dialer connects to the addresses it checked and checks again immediately
before connect; redirects use the same guard, with at most ten redirects.

Limits: 10-second connect and TLS handshake, 15-second response headers,
30-second body stall and, for feeds/artwork, a three-minute fetch ceiling. Gzip is decoded under
the response size cap. The default feed cap is **32 MiB**, configurable from
1 to 64 MiB. Transient network failures and retryable HTTP responses get at
most two retries with jittered 1- and 4-second delays; a Retry-After above ten
seconds is returned for server scheduling instead of slept through.
Errors use bounded messages without remote URL text.

For feeds on a trusted local network, explicitly configure
`podcasts.allow_networks` (empty by default); it grants the named CIDRs to
**feeds, artwork and audio**, so use the narrowest range needed. See
[Configuration](configuration.md#podcasts) for exact keys and environment names.

### Episode downloads and proven resume

Audio uses a plain GET, never HEAD, `Accept-Encoding: identity`, no environment
proxy, and the same DNS/dial/redirect guard. Pairing credentials and cookies are
never sent upstream; source credentials are stripped on cross-origin redirects.
Non-identity audio encoding is refused, never decompressed. The default cap is
1024 MiB (`podcasts.max_episode_mb`, 1..4096), enforced against GET length or
resume total before writing, and against received bytes when unknown. Feed
length is not admission evidence. Two retries at jittered 1/4 seconds allow
at most three GET attempts, including fresh-GET resume fallback. Retry-After
above ten seconds returns to the scheduler.

The absolute download/probe/publication ceiling is
`5 min + 3 * ceil(B / 262144) seconds + 6 seconds`, using known whole-file
GET total or the configured cap. It starts before GET and can only tighten;
retries never reset it. A 300 MiB file gets 65 minutes 6 seconds. Mapping/lock
waits precede that budget. Complete nonempty bytes are hashed and locally
probed within 60 seconds for finite positive duration and a supported audio
stream. Detected codec/MIME and duration are recorded; tags never replace feed
metadata. Probe inputs cannot open network/playlist resources.

Resume needs matching pairing/library/show/episode identity, exact partial
size N, known total T within cap and a strong quoted ETag sealed in the vault.
The checkpoint stores owned temp name, offset/total and validator reference,
never a URL. Restart rehashes the prefix. Requests use `Range: bytes=N-` and
`If-Range`. Append requires 206 with the same strong ETag, exact
`Content-Range: bytes N-(T-1)/T`, matching length when supplied, identity
encoding and exactly T final bytes. A 200-on-Range starts from zero, never
appends. Weak/missing/changed tags, bad ranges, 416 and encoded resumes discard
the partial and try fresh within the attempt budget. Last-Modified, URL and
size alone prove nothing. A fresh unsolicited 206 is rejected.

Only a resumable stop with a proven partial may keep it. Terminal cancellation,
identity/pairing/mapping loss, cap/probe failure or exhausted work cleans owned
partials/validators when safe. Recovery cleans only owned records older than
24 hours with no live job, under mapping checks and locks.

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
job ends; deleting the library drops the URLs held for its jobs at once
(`Service.PruneSecrets`, server 2.4.0; before, they stayed until a restart).
Stored params have `feed_url: ""`; the URL is injected only into the
claim answer. A restart before claim fails it as `request_expired`: follow
again. The Bridge seals the URL **before** recording its local claim, under
`podcast_job_<id>_<attempt>`, then keeps the show's URL as
`podcast_feed_<show_id>`. The temporary credential is removed when the job ends.
The Bridge database and page responses never persist or expose the raw secret.

A private episode fetch resolves the saved vault feed with an unconditional
bounded feed GET. It matches assigned episode id/GUID, then a unique title/date
fallback, never list position; ambiguity is `enclosure_missing`. This does not
merge or poll the feed. The enclosure URL remains in memory for the job's GET
attempts and never enters the checkpoint or validator record in plaintext.

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

**Spike 5:** all 15 sampled feed URLs (14 distinct feeds; two URLs serve the
same show) retained their Podcast Namespace attributes in `gofeed.Extensions`.
Counted per URL, GUIDs appeared in 6, chapter links in 13 and transcripts in
12; every sample used the `podcast` prefix. The implementation
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

Phase 2c-2a implements a bounded Bridge ID3v2.3/v2.4 CHAP reader rather than
using ffprobe's chapter titles/order. The Spike 6 decisions are:

- Missing or blank TIT2 becomes `Chapter N` after chronological sorting, never
  a frame id. Latin-1, UTF-8 and UTF-16 titles are cleaned and capped at 200 bytes.
- Playback follows start times, regardless of physical CHAP or ordered CTOC
  order. APIC pictures and URLs are skipped, with no extracted files or requests.
- At most a 16 MiB tag and 2000 CHAP frames are read. Duplicate ids/starts,
  invalid/out-of-duration timing, a nonzero first start, gaps/overlaps over
  1000 ms, or a malformed list produce no optional attachment. Zero or one
  chapter also produces none; valid audio still installs. Unknown ends use the
  next start or probed end; known times are preserved.

The output file and how the server consumes it are in
[Podcast CHAP attachments](attachments.md#podcast-chap-attachments).
