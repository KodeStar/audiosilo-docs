---
title: "Podcasts"
description: "Podcast jobs, on-demand fetch, status and Retry, discovery and OPML, the player and its discovery and OPML screens, queue prefetch, pinned generations, guarded downloads, retention, publication recovery, CHAP attachments and private feed secrets."
---

## Scope and ownership

The Bridge runs four podcast kinds:

| Kind | Lane |
|---|---|
| `podcast.fetch` | `download`: an ordinary slot plus a reserved `interactive` slot, two downloads in total |
| `podcast.retain`, `podcast.subscribe`, `podcast.poll` | `light` |

All four are writing jobs. Each needs a mapped, writable podcast library and the
server's `podcasts` module (`RequiresBridge: "podcast"`). The module ships off.

- `capabilities.podcasts` is always present. It is true only while the toggle is
  on and an online Bridge advertises the `podcast` feature.
- The independent core flag `capabilities.podcast_fetch:true` advertises the
  on-demand and status protocol, even with the Bridge offline or the module off.
  Older servers omit it.

The server and the Bridge split the work:

| Side | Holds | Code |
|---|---|---|
| The server | follows, feed status, HTTP validators, schedules and job intents, per-show retention policies and aggregate deletion eligibility. It never writes into the library | `internal/podcast`, `internal/catalog/podcasts.go`, `internal/library/podcasts.go` |
| The Bridge | `feed.json`, artwork, audio, CHAP attachments and private credentials. It then asks the server to index the show | `internal/podcast`, `internal/podcastjob`, `internal/netguard` |

A download starts in one of these ways:

- the show's policy schedules it;
- an admin requests it;
- on-demand play triggers it;
- one-ahead queue preparation triggers it.

On-demand play uses shared fetch intents, the status and Retry routes, and a
bounded stream wait. Three further parts need no Bridge change:

- server-side [directory search and OPML import/export](#discovery-and-opml-transfer);
- the [player](#player-phase-2d-1): shows, show and episode pages, following,
  Home's New episodes and on-demand play;
- the player's [discovery, follow by URL, OPML and Check for new episodes](#player-discovery-and-opml-phase-2d-2),
  which needed a CORS change on the server only.

External chapters and transcripts arrive later.

**Who sees podcast libraries.** Players from **2.2.0**
(`auth.PodcastPlayerMinVersion`), the admin console and `AudioSilo/dev` see them.
Players 2.1.x and older, the manager, API keys and requests with no client header
do not.

The read routes are core. They stay available without the module or the Bridge,
subject to the
[client gate and private scope](../server/auth-and-security.md#podcast-visibility).
Follow, unfollow and manual check are module actions for authenticated adults, not
demo accounts. See the [API reference](../server/api/reference.md#podcasts).

## Library kind and mapping

`libraries.kind` is `books` (the default) or `podcasts`, and can't change after the
library is created. A podcast root cannot equal, contain or sit inside another
library root. The server checks this when creating or moving a library of either
kind. Heartbeat replies include each library's `kind`. To the Bridge, a missing
kind means `books`.

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

The Bridge writes the file and the server reads it as a rebuildable input to its
show and episode index. Unknown keys are ignored. A breaking change requires a
version bump, and the server skips and logs a version it doesn't support.

- The Bridge caps the file at **24 MiB** and **20,000 episodes**.
- The server reads at most **32 MiB**, and requires a regular file, never a
  symlink.

A show is one real, non-hidden directory directly beneath the root.

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

**Episode order** (`podcast.newestFirst`) sorts by:

1. the newest publication date first;
2. for episodes sharing a date or with none (a LibriVox serial), the higher season
   (none counts as 0);
3. then the higher episode number (a numbered episode before an unnumbered one);
4. then the path.

So an undated serial lists from its last numbered episode back to E1, not in the
order of its hashed file names. The server's episode lists, `/next` and the retention windows use the same
key ([episode order](../server/api/reference.md#podcast-read-routes)).

`show` contains `title` (300 bytes), `author` (300), `description` (4,000),
`link` (`""` when private), `language` (35), `type` (`episodic` or `serial`),
`explicit`, `categories` (up to ten), `podcast_guid`, and nullable `image`.
An image is `{file, source_sha256, fetched_at}`. Only the image URL's hash is
saved. Show and episode descriptions become plain text, and byte clipping keeps
valid UTF-8.

**Artwork** uses the same guarded HTTP client as feeds. The Bridge sniffs it as
JPEG or PNG and caps it at **10 MiB**.

- An artwork failure does not fail the feed job, and does not change the feed
  timestamp on its own. Existing artwork survives failures.
- Failures back off from one hour to 24 hours. The backoff is kept in the Bridge's
  durable `podcast_artwork_state`, keyed by server, library and show id, with an
  image-URL hash that identifies the current source.
- A changed image hash retries, and success clears the failure.
- A `304` fetches no artwork and writes no feed file.

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

A valid Fetch has:

- `generation` at least 1;
- `sha256` as 64 lowercase hex;
- `bytes` and `duration_ms` positive;
- RFC 3339 timestamps (`deleted_at` may be empty);
- optionally `codec`. Older files have none, and its absence uses conservative
  codec handling.

An invalid Fetch keeps the episode listed but grants no presence, ETag or deletion
authority. Polls and deletion preserve the known Fetch fields.

**Duration.** A committed regular audio file of the expected size, with no
deletion timestamp or publication barrier, gives `duration_source: "file"` and the
probed duration and codec. Otherwise the server uses a positive feed duration
(`"feed"`) or zero (`"none"`), with size 0. The server does not probe or hash
podcast audio. Progress stays keyed by `(library_id, path)`.

**Episode paths.** The server accepts an episode path only as
`<show>/<audio filename>`: one level, clean, non-hidden, unique and supported by
`metadata.IsAudio`. It skips and logs a bad entry. It indexes episodes even when
their files are absent.

`/fs` uses the index and displays titles, with serial shows oldest first and
episodic shows newest first. Loose audio and the feed and artwork files do not
become entries.

An undownloaded episode has an empty chapter list. Its stream request triggers a
shared fetch, and the Bridge publishes and rescans before any bytes can be served.
The server still does no on-demand audio indexing itself.

## Names and identity

The Bridge assigns a show folder once, from the show's title:

- NFC normalization;
- control, bidi-control and replacement characters removed;
- `/ \ : * ? " < > |` replaced by spaces;
- whitespace collapsed;
- a 100-byte rune-safe cap;
- leading and trailing spaces and dots trimmed.

An empty name becomes `Podcast`, and Windows reserved names get ` (podcast)`. A
name that clashes with any root entry, case-folded in NFC, gets ` (2)`, ` (3)`
and so on. A change to the feed's title never renames the folder. **Do not rename
show folders by hand.** The saved episode paths contain the folder name.

Episode paths are `<show>/<UTC YYYY-MM-DD|undated>-<10 hex>.<ext>`. On a collision
the hash expands to 16 hex, then the Bridge adds `-2`, `-3` and so on. The hash is
SHA-256 of the first available identity:

1. `guid:<guid>`.
2. `url:<enclosure URL>` without its fragment. The query is stripped only when
   the URL path has a supported audio extension; extensionless download URLs
   retain it because it may identify the episode.
3. `title:<title>|<published>`.

**Merging** a new feed into the file matches identities first, then public
enclosure URLs, then title and date pairs.

- Existing paths, ids, `first_seen` and `fetch` survive metadata changes.
- Duplicate items collapse, without merging distinct episodes that only share a
  title and date.
- Missing items gain `removed_at`, and returning items clear it.
- At the episode cap the Bridge drops removed episodes it never fetched, oldest
  removed first. If that is not enough it fails `too_large`.
- At the byte cap it first clears the descriptions of removed episodes, then fails
  if the file is still too large.

**Extensions.** The supported output extensions are `mp3`, `m4a`, `m4b`, `mp4`,
`ogg`, `opus` and `flac`. The MIME type selects MP3 (including the implemented
MPEG and MP3 aliases), M4A, Ogg, Opus or FLAC. An empty or
`application/octet-stream` MIME type falls back to a supported URL-path extension.
Unsupported enclosures, including AAC and WAV, are skipped and counted in the
result.

Files use `0644` and directories `0755`. Writes use hidden temporary files, fsync
and an atomic rename.

## Job wire format

All four kinds are server-internal, module-owned and non-notable. Dedicated
actions and the scheduler create them, and the admin enqueue route refuses them.
Default admin job lists omit `podcast.poll` unless explicitly filtered. Fetch and
retain jobs are listed.

**Subscribe** has `library_id`, a null `path`, priority 10 and the listener's
`requested_by`. Its dedupe key is
`podcast.subscribe|<library_id>||<feed_url_sha256>|<user_id>`. Its stored params
are strict, server-built JSON:

```json
{
  "feed_url": "https://example.com/feed.xml",
  "feed_url_sha256": "<64 lowercase hex>",
  "feed_host": "example.com", "private": false, "show_path": ""
}
```

A private request stores `feed_url: ""` (see
[Private URLs](#private-urls-and-recovery)).
`show_path` names an existing show when the subscribe restores a missing
credential. New repair subscribes also carry an optional expected `show_id`.

**Poll**'s `path` is one clean, non-hidden show segment. Its params are an
optional `show_id`, `etag` and `last_modified`, the validators each at most 512
bytes. New work binds the expected show id, and the Bridge checks it before
writing. The Bridge drops URL-bearing or overlong validator values before
returning them to the server.

**Progress** uses `step` and `message`. The steps are `fetching`, `parsing`,
`writing` and `indexing`, and `waiting` while an initial mapping check is pending.

Successful results:

| Kind | Result fields |
|---|---|
| `podcast.subscribe` | `library_id`, `show_path`, `show_id`, `created`, `private`, `episodes`, `skipped`, `status`, `etag`, `last_modified`, `next_poll_seconds` |
| `podcast.poll` | `library_id`, `show_path`, `show_id`, `status`, `changed`, `new_episodes`, `episodes`, `skipped`, `moved`, `etag`, `last_modified`, `next_poll_seconds` |

Validators are `""` when absent. `episodes` counts retained entries, including
removed ones. `skipped` counts unsupported items in the current feed. A failed job
carries a safe message in `error`, and the result
`{code, message, retry_after_seconds?}`. Codes and listener response shapes
are in the [API reference](../server/api/reference.md#podcast-actions).

### Fetch and retain jobs

`podcast.fetch` requires `library_id`, an exact indexed episode `path` and the
strict params `{"show_id":"a1b2c3d4e5f60718","episode_id":"1cc306d831645e2b"}`.
No URL, credential, policy or book id travels in the params. The dedupe key is
`podcast.fetch|<library_id>|<path>`.

A replacement identity cannot adopt an old open job, because the server settles
that intent first. Both sides recheck identities before the work and before
publication.

Fetch triggers use `bridge.EnsurePodcastFetch`. Retention has a lower housekeeping
priority:

| Trigger | Priority |
|---|---|
| Play, Range, download, transcode or explicit listener Retry | `100` |
| Admin fetch | `20` |
| One-ahead queue prefetch | `10` |
| Policy-selected scheduled fetch | `-10` |
| Retention housekeeping (`podcast.retain`) | `-20` |

An existing intent that is queued, claimed, running or parked (`needs_attention`)
is shared, and promoted to the maximum priority, never demoted.

- Promotion wakes claims after the commit. It does not reset the requester,
  attempts, lease or progress.
- Promotion does not move a running job into another pool.
- An admin's or a listener's Retry bypasses the terminal failure cooldown. It never
  bypasses open dedupe or a valid present pin.

**Progress** steps are `resolving`, `fetching`, `probing`, `writing` and
`indexing`. Byte counts are int64 `Progress.Extra` fields, and include any proven
prefix. They may reset to zero after a restart. An unknown total is `null`:

```json
{"step":"fetching","bytes_received":1048576,"bytes_total":314572800,"message":"Fetching episode"}
```

Reports and keepalives follow the usual
[report timing](pairing-and-jobs.md#claims-and-leases).

**Success** is
`{library_id,path,show_id,episode_id,fetch:Fetch,chapters:3,reused:false}`.
`reused:true` means a valid pin, or a recovered completed installation, needed no
new enclosure GET.

**Failure** is a failed job with a safe `error` and a
`{code,message,retry_after_seconds?}` result. Results never include upstream
bodies, URLs, headers or probe stderr. Besides the guard codes, the failures are:

- `episode_not_found`;
- `enclosure_missing`;
- `identity_changed`;
- `invalid_audio`;
- `probe_unavailable`;
- `unsupported_encoding`;
- `index_failed`;
- `library_not_writable`;
- `feed_secret_missing`: a private show's vault entry is missing;
- `write_failed`: a disk failure, or an unverified file at the assigned path, or an
  invalid saved Fetch that needs administrator repair.

`podcast.retain` requires the show `path` and `{"show_id":"<16 lowercase hex>"}`.
It has priority `-20` and no requester, and is deduped by kind, library and path.
Progress is `{step:"retaining",message:"Checking retained episodes"}`. Success is
`{library_id,show_path,show_id,deleted:2,skipped:1}`. Protected, busy and stale
candidates count as skipped. Mapping, feed and identity failures fail the job.

## On-demand play and shared intents

`/stream` first checks authentication, the client gate and private scope, and that
the path is exactly an indexed one. Then, for missing audio, it uses
`podcast.Demand.Fetch` in every branch: Range, `download=1` and transcode.

- An unknown or hidden path queues nothing.
- `/stream` never passes publisher bytes through and never serves a partial.
- A valid committed descriptor can still play with the Bridge offline or the module
  off.

### The two-second wait

The fetch branch for an absent file has one **two-second** budget. It covers the
pin lookup, the enqueue or promotion, the status reads and the waiting. The branch:

1. registers a per-path broadcast;
2. rechecks presence;
3. wakes on job and rescan changes;
4. checks presence once more before returning.

When the file is ready within the budget, the server serves normal media.
Otherwise it answers `503` with `Retry-After: 2`, `Cache-Control: no-store` and
`{error,code,fetch:Status}`. The codes are `podcast_fetching`,
`podcast_fetch_unavailable` or `podcast_fetch_failed`. The exact shapes and the
exceptions are in
[status and Retry](../server/api/reference.md#podcast-fetch-status-and-retry).

A disconnect releases the waiter, never the shared household fetch. The final
summary, limited by the budget, can still say queued after the job has started.

### New work and cooldown

New work needs the module on, an online Bridge offering `podcast.fetch`, and a
writable mapping. Existing work can still be returned or promoted when these
checks would refuse a new intent. Status shows those refusals as `unavailable`.
That includes claimed or running work while the module is off, and those jobs may
finish.

- Ordinary stream retries respect the terminal cooldown: 30 minutes, doubling up
  to 24 hours. Observing the status never queues.
- An explicit Retry by a listener or an admin bypasses the cooldown, and still
  shares any open intent.
- An identity replacement can return `409 identity_changed` rather than a
  retryable media 503.

### The per-person cap

Each non-admin creator has a cap of **five open `podcast.fetch` intents** across
libraries, including prefetch and parked work. Admins and server-scheduled work
are exempt. The insert transaction checks the cap after dedupe. So joining or
promoting existing work succeeds at the cap, and does not transfer its requester or
quota ownership.

- A refused new stream fetch is `503 podcast_fetch_unavailable` with
  `fetch.error.code: "fetch_limit"`.
- A listener's POST Retry gets `409 fetch_limit`.

This cap is independent of the subscribe-request cap.

### One-ahead queue preparation

`podcast.Prefetcher` starts a bounded look in the background after a play-fetch
request, or after a stream of a ready episode starts. It doesn't extend the stream
wait.

- It reads the actual caller's scoped `up_next`, including the private-show proof,
  and skips book entries.
- It selects at most the next visible podcast after the current item. If the
  current item is not queued, the first visible podcast other than the current one
  wins.
- A candidate that is ready, fetching, failed and cooling, or unavailable creates
  no new work.
- An absent candidate can create work at priority 10, and a queued candidate can
  promote its existing row.
- Removed feed entries create no automatic fetch.

A successful queue change makes the prefetcher look again while that user's
current podcast has a stream or an open fetch, until it chooses one candidate. The
bound is one chosen candidate per user and current item, with global intent dedupe
across users. Removing the candidate from the queue does not cancel shared work.
Playing it later promotes that same intent to 100.

The On demand policy permits this preparation, without feed-wide scheduled
downloads. Demo requests start neither a fetch nor a prefetch, but a demo stream
can still promote an existing shared fetch.

### Player {/* #player-phase-2d-1 */}

The player side of this protocol sets `auth.PodcastPlayerMinVersion` to
`"2.2.0"`. Players from 2.2.0 see podcast libraries, and 2.1.x and older stay
hidden ([client gate](../server/auth-and-security.md#podcast-visibility)). The
player's version is `app.json` `expo.version`, sent as
`X-AudioSilo-Client: AudioSilo/2.2.0 (<os>)`.

The player-side walkthrough (screens, routes, the controller's wiring) is
[Frontend podcasts](../frontend/podcasts.md). This section is the wire and the
rules the player keeps.

**Types** (`src/api/types.ts`).

- Every new field on an existing type is optional, so an older server leaves books
  as they were.
- Every key *inside* a new object is required, nulls included, as the server
  writes it.
- Open unions (`| (string & {})`) take a value a newer server adds.


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
`fetch: Fetch` pin.

- `generation`, `sha256` and `timeline_changed` are absent before a valid pin, and
  may remain after deletion. The player keeps an explicit
  `timeline_changed: false`.
- A true `timeline_changed` only shows a notice on the episode page, when the
  listener has progress. It never resets or rescales progress, bookmarks or the
  finished mark.
- `id3_chap` is embedded MP3 metadata, not generated chapters. The chapters tab
  captions it "Chapters from the episode file".

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

Every JSON route and the probe decode a non-2xx answer through one helper,
`apiErrorOf`.

- A **503** whose JSON has a `podcast_fetch*` code and an object `fetch` becomes
  `PodcastFetchPendingError`. That is an `ApiError` with `code`, `fetch` and
  `retryAfterSeconds`.
- `retryAfterSeconds` is the `Retry-After` header when it reads as a non-negative
  number, else `fetch.retry_after_seconds`, else 2.
- A non-JSON 503 from a proxy stays a plain `ApiError`.

`API_ERROR_CODES` gains `module_off`, `bridge_unavailable`, `fetch_limit`,
`identity_changed` and `show_not_found`. A cross-origin page reads `Retry-After`
only from a server that exposes it ([CORS](../server/api/index.md#cors)). From an
older server it uses the body's value.

**Hooks** (`src/api/hooks.ts`).

- Reads are core and never gated on `podcasts`. `usePodcastShows`,
  `usePodcastEpisodes`, `myPodcastsQuery` and `latestEpisodesQuery` (Home) ask
  only for a library whose `kind` is `podcasts`. `usePodcastEpisodes` is an
  infinite query, 50 a page, with `next_cursor` as the page param.
- `useFollowPodcast` and `useUnfollowPodcast` are
  `useCapabilityMutation('podcasts', ...)`. They patch `following` in the cached
  show list, and read `myPodcasts` again. An unfollowed private show leaves the
  list.
- `usePodcastFetchStatus` is a plain `podcast_fetch` capability query with no
  interval.
- There is no retry hook. Try again belongs to the controller.

The query keys are `['podcastShows', cid, lib]`,
`['podcastEpisodes', cid, lib, show, order]`, `['myPodcasts', cid]` and
`['podcastFetch', cid, lib, path]`. Home's one page is
`[..., show, 'latest', limit]`, under the same show prefix.

**The episode-fetch controller** (`src/playback/episode-fetch.ts`) polls for a
play. The downloads store's wait (`src/downloads/episode-ready.ts`) polls for a
download, and shares the timing rules (`episode-fetch-rules.ts`). The rules the
controller keeps:

- **The probe is the play trigger.** A start of an episode that is not
  downloaded, on a server with `podcast_fetch === true`, goes to
  `requestEpisodeFetch`. That asks `/stream` once (`prepareEpisodeStream`). A play
  goes through `/stream` rather than POST because an ordinary stream fetch
  respects the failure cooldown. POST is kept for the explicit Try again, which
  bypasses the cooldown. The stream's two-second hold also serves an episode that
  is about to be ready.
- **Polling.** While the state is `queued` or `fetching`, it GETs the status every
  `max(2, Retry-After)` seconds. It seeds `['podcastFetch', ...]` from every
  answer: the 503's `fetch`, the POST's, and each GET's. A network error, a `429`
  or a `5xx` while polling reschedules the next turn with a backoff
  (`blipDelay`). The backoff starts at 2 seconds and doubles with each failed look
  in a row, up to 60, and is never under the answer's `Retry-After`. An answer
  resets it. So a server that answers 5xx for good is not asked every 2 seconds.
- **Background.** It pauses while the app is not active and asks once at once
  on the way back (`onForeground`; RN-web maps it to `visibilitychange`).
- **It never POSTs by itself.** It stops at `failed`, at `unavailable`, or at
  `absent` after a trigger, which it shows as failed. Only Try again sends the
  POST: `retryEpisodeFetch()`, or `requestEpisodeFetch(..., {retry: true})` from a
  row or the episode page. The answers map like this:
  - `409 fetch_limit` is `refused`;
  - `module_off`, `bridge_unavailable`, `library_not_writable` and
    `demo_account` are `unavailable` with that code;
  - `identity_changed` invalidates the item and the library's episode lists, and
    stops as failed.
- **Abort, never cancel on the server.** There is one `AbortController` per run.
  Any other start, a profile switch (`mayActFor`), a removed connection
  (`resolveClient`) or the listener's Cancel ends the run, and the server's shared
  fetch carries on. There is no client time cap. The Bridge's size-scaled ceiling
  ends a dead fetch as `failed`.
- **Refresh at ready.** It reads the item and its chapters again
  (`staleTime: 0`) and marks the show's episode lists stale. Then it starts the
  episode in place with `{fetched: true}`. That plays only while the fetch is still
  `starting`, since a Cancel or another start since then wins.

**Exclusions.**

- A device download of an episode not on its server waits outside the player's
  download queue, under the same probe and poll rules, until the server has the file
  ([Offline](../frontend/offline.md#an-episode-not-on-its-server-yet)). Keep-ahead
  never plans an episode, and a device's copy never holds a file against the show's
  retention.
- The Cast button hides for an episode, because cast tokens never see podcasts.
  From 2.4.0 the server answers `403` to `POST /cast/token` for an episode, with
  `error.code: "not_a_book"`.
- Starting an episode while a book is cast is refused before any token is asked
  for (`CastBlockedError` `episode`). A `not_a_book` refusal reads the same.
- An episode never opens the end credits.
- Kids mode lists no podcast library.

**Golden.** The player keeps `wire-2b.json` byte-identical in
`src/testing/podcast-fixtures/`.

## Discovery and OPML transfer

Two flows run on the server only, with **no Bridge change**:

- directory search, whose results are followed through the existing follow by
  URL;
- OPML import and export of subscription lists.

The player has screens for them
([Player: discovery and OPML](#player-discovery-and-opml-phase-2d-2)); the console
has none. The routes, shapes and error codes are in the
[API reference](../server/api/reference.md#podcast-discovery).

- **Search runs on the server.** `internal/podcast/discovery` asks Apple's iTunes
  Search API by default. It asks Podcast Index instead when the caller picks it
  and the server holds its key pair (`AUDIOSILO_PODCAST_INDEX_KEY` / `_SECRET`,
  server environment only; see
  [configuration](../server/configuration.md#podcast-discovery-podcastsdiscovery)).
  The Bridge has no directory setting or credential, and is never asked to search.
  The server proxies result artwork itself, so devices fetch nothing from third
  parties. Search does not need an online Bridge.
- **Following stays one path.** `podcast.Follower` (`internal/podcast/follow.go`)
  is the single follow by URL behind both `POST /podcasts/follow`'s `feed_url` and
  every OPML import row. It needs a whole-library grant. The URL's current or
  previous hash finds a known show, which is followed at once, offline too. Only a
  new feed or a secret repair queues a `podcast.subscribe` job, the same as before
  (priority 10, quiet, internal). There is no new job kind, params, migration or
  heartbeat field.
- **Caps are unchanged and shared.** Single follows and imports share the
  five-open subscribe cap
  ([waves](../server/api/reference.md#post-apiv1podcastsopmlimport)). An open
  request is reused only at the same privacy. The other privacy gets
  `409 privacy_conflict` (an `error` row in an import). The server checks this
  inside the dedupe transaction, so a private URL is never attached to a public
  job.
- **Private URLs are unchanged.** An imported private feed is handled exactly like
  a single private follow
  ([Private URLs and recovery](#private-urls-and-recovery)). The export never
  writes a private show, since there is no stored copy of its URL. It reports how
  many it left out in `X-OPML-Omitted-Private`.
- **Admission.** Before anything is queued, a URL must normalize to the same value
  when normalized again (`feed.NormalizeStable`). Otherwise it is
  `invalid_feed_url`: `400` on the single follow, an `invalid` row in an import.
  The canonical hash bytes and the Bridge's URL vectors are unchanged.

### Player: discovery and OPML {/* #player-discovery-and-opml-phase-2d-2 */}

The player searches a directory, follows a feed by its address, imports and
exports OPML lists, and asks a followed show to check for new episodes. It was
first released with these screens in 2.4.0. The screens are in
[Frontend: Podcasts](../frontend/podcasts.md#finding-shows). This section is the
wire mirror and the rules the player keeps.

The only server change is CORS. An allowed origin may read `Retry-After` and the
`X-OPML-*` counts, and send `Range` ([CORS](../server/api/index.md#cors)). There
is no Bridge, console or migration change.

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

`ApiError` gains an optional `retryAfterSeconds`. It is `Retry-After` when that
reads as a non-negative number, on any status. A date, or a header the browser
can't read, leaves it absent. `API_ERROR_CODES` adds `privacy_conflict`,
`too_many_requests`, `checked_recently`, `invalid_feed_url`,
`no_library_access`, `not_podcast_library`, the discovery codes
(`discovery_off`, `provider_unavailable`, `invalid_query`, `invalid_country`,
`discovery_rate_limited`, `provider_rate_limited`, `discovery_busy`,
`discovery_timeout`, `provider_rejected`, `discovery_unavailable`) and the
OPML codes (`opml_rate_limited`, `opml_busy`, `opml_limit`, `invalid_opml`,
`unsupported_opml_type`, `opml_export_limit`).

**Hooks** (`src/api/hooks.ts`):

- `usePodcastDiscoveryProviders` and `usePodcastSearch(params | null)` are
  `useCapabilityQuery('podcast_discovery', ...)`, with `staleTime` 15 minutes
  (the server's own cache) and `retry: false`. `null` params ask nothing. The keys
  are `['discoveryProviders', cid]` and
  `['discoverySearch', cid, provider, q, country, limit]`, so an unchanged repeat
  reuses the held results.
- `useFollowPodcastByUrl` and `useCheckPodcast` are
  `useCapabilityMutation('podcasts', ...)`. `useExportOpml` is
  `useCapabilityMutation('podcast_opml', ...)`.
  - A `200 following` goes into the cached show list (`storeFollowing`), and
    `['myPodcasts', cid]` is read again. The show list is read again when it lacks
    the show.
  - A `202 subscribing` request goes to the head of the cached follow requests
    (`storeAnswer`), so a poll already in flight can't land over it.
- `useFollowRequests(libraryId, {active})` selects one library's
  `GET /me/podcasts` `requests`: open first, then ended, newest first
  (`libraryRequests` in `src/lib/podcast-requests.ts`). It reads again every 5 s
  (`FOLLOW_REQUEST_POLL_MS`), but only while all of these hold:
  - one of the requests is open: `queued`, `claimed`, `running` or
    `needs_attention` (`isOpenRequest`, the Bridge job's open states);
  - its screen is focused (`active`);
  - the app is in the foreground.

  So nothing polls once the requests have all ended. `myPodcastsQuery` compares
  each answer with the last. A request it saw open that now reads `done` reads its
  library's show list again, whichever screen asked.

**The rules the player keeps:**

- **Flags.** An absent `podcast_discovery` or `podcast_opml` reads as
  unsupported.
  - Adding shows (the page and its entry points) needs `podcasts === true`, and is
    never offered to a kid's account or the demo. Inside the page, Search needs
    `podcast_discovery` and Import needs `podcast_opml`. The feed address is always
    there.
  - Export needs `podcast_opml` and not the demo. It works with the module off.
  - Check for new episodes is for a followed show, under the same rule as adding.

  The flags don't describe the caller, so the refusals (`kid_account`,
  `demo_account`, `no_library_access`, `module_off`, `discovery_off`,
  `not_podcast_library`) still have their own wording.
- **Search on submit only**, never while typing.
  - The text is trimmed with its whitespace runs collapsed, as the server cleans
    it, and must be at least two code points. `limit` 20 is sent explicitly.
  - The same search again reuses the held results. It is asked again only after
    it failed.
  - The provider is Apple Podcasts, unless `podcast_index` is `available`. Then a
    picker chooses. A failed search is never retried on the other provider.
  - `country` is the device locale's `regionCode` (expo-localization) when it is
    two letters A-Z, for iTunes only, never `metadata.region`. Otherwise it is
    left out, and the server's default, US, applies.
  - The list is captioned with the provider ("Results from Apple Podcasts"), and
    each result links its `provider_url`.
  - A `429` shows its `Retry-After` wait when it has one.
- **Artwork** loads only through the server's proxy (`discoveryArtworkUrl`),
  lazily as the list windows rows in. An image can't see the status, and the route
  refuses any extra parameter, so there is no cache buster. A failed load mounts
  the image again with the same URL after 3, 10 and 30 seconds
  (`artworkRetryDelay`, four tries in all), then keeps the placeholder. A load can
  fail because the server fetches uncached images a few at a time, and answers
  `429`/`503`. An expired id is a `404` every time.
- **Follow by address** checks the address first: http or https with a host, at
  most 2,048 bytes. So a bad address sends nothing. A result's Follow is the same
  call with its `feed_url`.
- **Import waves** follow the rules in [The import waves](#the-import-waves).
- **Export** reads the counts from the `X-OPML-*` headers. A count that reads
  `null` gives "Exported your shows", and `413 opml_export_limit` has its own
  message. How the file is saved is in
  [Entry points](../frontend/podcasts.md#entry-points).
- **Check for new episodes** refreshes once after the `202`, with no polling,
  since a check is not a follow request. `429 checked_recently` and
  `bridge_unavailable` have their own wording. The button and its timer are in
  [Check for new episodes](../frontend/podcasts.md#check-for-new-episodes).
- **Copy** never shows the server's English and never says "Bridge". It covers
  all six locales.
  - Refusals read through `find-shows-model.ts`.
  - A failed request's `error.code` reads through `requestReasonKey`
    (`podcast-model.ts`). `dns`, `timeout`, `tls` and `network` say the feed could
    not be reached. Then there are `not_a_feed` and `not_a_podcast`; `gone`
    (410); `http_404` (nothing at that address); `http_401`/`http_403` (refused)
    and other `http_*`; `blocked_address` (a local network the server may not
    reach); and `too_large`. `request_expired` and `feed_secret_missing` ask to
    follow again.
  - An import row's reason (`importRowReasonKey`) is its request's when the
    requests list it, else its own code's. `recently_failed` says it failed within
    the last hour, and to follow it on its own to try again.

**Goldens.** The player keeps the server's
`internal/podcast/testdata/phase2c3/` files it reads byte-identical in
`src/testing/podcast-fixtures/phase2c3/` (`wire.json`,
`providers/*-normalized.json`, `opml/duplicates-private-expected.json`,
`opml/export-expected.opml`, `opml/export-expected-headers.json`,
`opml/queue-cap.opml`), and `podcast-fixtures-2c3.test.ts` checks each one's
SHA-256 against the copied `manifest.json`.

#### The import waves

`OpmlWaves` (`src/components/podcasts/opml-waves.ts`) is framework-free, with its
own timers. `useOpmlImport` keeps it, and the picked bytes, for the life of the
Find shows page. A file over 1 MiB is refused before any upload.

**Merging rows.** Each upload's rows merge by `outline_index`, and the latest
answer wins. The exception is a row this import followed or queued. It stays
followed when a later wave answers it `already_following`.

**When the import is done.** With no `limited` row left, the import is `done` and
no other wave is sent. What is queued is followed live.

- `error` rows never start a wave. A server from 2.4.0 answers a feed whose follow
  failed within the hour `recently_failed` and queues nothing. So a few dead feeds
  no longer take every wave's slots.
- `unavailable` rows never start a wave either. A `done` import with some left
  offers a manual Try again (`canRetryImport`), which uploads once more.

**The next wave.** Otherwise the next upload of the same bytes waits until all of
these hold:

- every request this import queued is no longer open in `GET /me/podcasts`. Those
  are the `request_id`s of the `queued` and `already_queued` rows. An absent
  request counts as ended, and the list is read every 5 s;
- fewer than five of the caller's requests are open;
- 30 seconds have passed since the last upload.

The panel reads each queued row's request live. So the import reads done ("All
done.") only once none is still being added and none failed.

**A row that could not be added** has its own **Try again**. That is an `error`
row, `recently_failed` included, or a row whose request ended `cancelled`. Try
again is a single `POST /podcasts/follow` by address, which the server always
tries again.

- The server reports only a redacted label, so the address comes from the picked
  bytes. `outlineFeeds` in `opml-feeds.ts` counts outlines as the server's parser
  does.
- The address is used only when its scheme and host match the row's label
  (`rowFeedUrl`). A row whose address can't be found has no Try again.
- The Try again answer stands over the waves' answer for that row
  (`withRetries`).

**Stopping.**

- A wave that moves no row out of `limited` stops as `stalled` (Try again).
- `429 opml_rate_limited` and `503 opml_busy` wait their `Retry-After`, else 30 s
  and 2 s. Five such answers in a row stop the import.
- Any other refusal stops as `failed` with its code. A network failure or a
  timeout stops as `failed` with none.
- Try again re-uploads, which is safe: rows already done answer
  `already_following` or `already_queued`.

The controller holds its timers in the background and looks again at once on the
way back. It checks `mayActFor` before each upload, and sends nothing more after
Stop or once the page is gone.

## Retention policy and deletion authority

An admin sets one shared policy per show through the
[storage API](../server/api/reference.md#podcast-storage-admin). There is no
retention UI. The default is `{"mode":"keep","keep":3,"days":7}`. All keys are
required on PUT, including unused ones:

- `mode` is `keep|on_demand|archive`;
- `keep` is 1..1000;
- `days` is 0..365.

Policies are durable server state keyed by library, path and show id, not feed
data. A replacement show at the same path starts with the default.

| Mode | Downloads | Deletes |
|---|---|---|
| Keep | the newest N currently listed entries in the [episode order](#files-on-disk-feedjson-v1) (publication, season, episode number, path, descending), undated last | only outside this window |
| Archive | every currently listed entry, oldest first (the same key ascending), undated last | never |
| On demand | on play, and it permits one-ahead queue preparation. There are no feed-wide scheduled downloads. Individual admin fetches work too | with no Keep window |

Removed feed entries are never fetched automatically. Their saved bytes remain
playable, and an admin fetch can try their saved enclosure. A show without
followers gets no download or deletion scheduled by its policy. Authorized play,
Retry and queue preparation still work. Keep N is a window, not a disk limit, so
an unfinished follower can keep files indefinitely.

### The retention aggregate

Before deleting, the Bridge reads the policy and requests a
[retention aggregate](../server/api/reference.md#bridge-podcast-retention) for the
exact committed generation, hash and size. The server reads the policy, follows,
progress, exact episode favourites, queues and open fetch jobs in one database
snapshot, then adds the live stream mark. It returns a follower count, booleans
and times, never user ids, names or positions.

**Followers** count only while all of these hold:

- the account is enabled and not a demo account;
- the follow is bound to the current show id;
- the person is still granted the episode, with podcast access explicitly enabled
  for this internal scope resolution.

A new follower blocks deletion. Unfollowing or losing access removes that
follower. Missing progress, an unfinished state or an invalid finish time denies
deletion. Zero followers never means everyone finished.

**Protection.** An exact episode favourite protects the episode conservatively,
even after access is revoked. A show-folder favourite does not. Any exact queue
entry, an active direct, download or transcode request, or an open fetch also
protects it.

**Eligibility.**
`delete_after = max(all_finished_at, fetch.fetched_at) + days * 86400 seconds`.
An episode is eligible when all of these hold:

- the grace period has elapsed;
- every follower finished;
- nothing protects it;
- the policy is not Archive;
- for Keep, the episode is outside its window.

Refetching resets the grace period.

**The Bridge's checks.** Under the show mutation lock, the Bridge rereads
identities and verifies the local audio's hash and length. Then it obtains a fresh
aggregate immediately before deletion. It rejects a missing, stale, invalid or
failed answer.

The five-second freshness bound uses the elapsed time since the request was
dispatched, on the Bridge's monotonic clock. It includes a final check at the
rename boundary. The server's `checked_at` remains on the wire but is not the
freshness clock. The aggregate is a snapshot, not a lock against later follows.

### Deleting

Deletion journals and renames only owned audio and CHAP files into
`.audiosilo-trash/podcasts/<episode_id>-g<generation>-<nonce>/`. Then it saves
`Fetch.deleted_at` without losing the other Fetch fields, removes the barrier,
rescans the show, and unlinks the trash. Entries, artwork and listener state
remain.

- When Windows refuses to rename an open file, the Bridge skips that candidate.
- Recovery aborts a delete journal whose audio never moved. Once the audio moved,
  recovery finishes the tombstone before another fetch.

## Publication, generations and serving

### Generations

A valid present pin is never replaced.

- The first commit uses generation 1 and `timeline_changed:false`.
- After deletion, the same hash keeps its generation.
- A different hash increments the generation and latches `timeline_changed:true`,
  even with the same duration. Later equal hashes keep that warning.

Saved progress, the finished state, bookmarks, annotations and queues are never
rescaled or reset.

### Locks

Per-episode process and filesystem locks keep reclaimed writers from overlapping.

- The filesystem lock is the episode's `.fetch.lock`. Its holder removes the file
  while still holding it, as it lets go (`releaseLock`).
- A waiter that then gets a lock on a file no longer at that path opens the path
  again (`lockedAt`). So the files never pile up, and no two jobs hold one.
- A `.fetch.lock` that an earlier Bridge left behind is opened and locked like any
  other, and removed when its new holder lets go.

The short show mutation lock is shared by subscribe, poll, fetch and retain, and
never spans an audio GET. Before committing, a writer recovers journals, confirms
its lease, checks the mapping and identities, and rereads the latest feed. That
keeps metadata changes from a concurrent poll.

### Publication order

1. Stage, hash and probe the audio.
2. Write a durable journal.
3. Install the audio.
4. Write or remove the CHAP file, atomically.
5. Merge the Fetch into `feed.json`, atomically.
6. Sync the directory.
7. Remove the journal.
8. Request a targeted `POST /bridge/rescan {library_id,path:<episode>}`.

The audio install first tries an exclusive hard link. On a filesystem that doesn't
support that, it falls back to a no-replace rename. It stays on the show's
filesystem and refuses foreign files at the assigned path. Manual audio is a
repair conflict, never adopted or overwritten.

Final files are `0644` and folders `0755`. Partials and checkpoints are `0600`. A
symlinked show, audio, attachment or journal path fails.

### The journal

`<show>/.audiosilo/<stem>.publish.json` is a version-1 journal of at most 4 MiB:

```text
{version:1, op:"install"|"delete", show_id, episode_id, path,
 audio_temp, trash_dir, fetch:Fetch, chapters:ChapterList|null}
```

- Unused temp and trash fields are empty strings. Names are validated within the
  same show, with no secrets or URLs.
- While it exists, the journal blocks indexing and serving that episode. Even a
  malformed or symlinked journal fails closed.
- Recovery verifies the owned staged or installed bytes, and completes the
  chapters and the Fetch without incrementing the generation again. Missing or
  corrupt candidates require repair.
- A new generation without CHAP removes its old CHAP file.
- A failed rescan after the disk commit gives `index_failed`. A retry repairs the
  indexing with `reused:true` and no publisher GET.

The shared `publish-v1.json` fixture fixes the exact shape.

### Serving

The server opens a regular descriptor and checks the current feed signature and
identity, the expected size, the named file's identity and that no journal exists.
It retries a bounded number of times on a change. That descriptor serves the whole
request, transcode included, and the path is never reopened after validation. The
transcode reads it as ffmpeg's stdin, through the seekable `fd:` protocol when that
ffmpeg has it, else the older `pipe:0` (see
[Transcoding](../server/media.md#transcoding-mediatranscode)).

Direct streams and downloads use a strong `ETag: "podcast-g<generation>-<sha256>"`,
`Cache-Control: private, no-cache` and byte ranges.

- A matching `If-Range` gives 206. An old validator gives a full 200 of the current
  generation.
- Changed bytes change the ETag, even at an equal size and mtime.
- Transformed output has no source strong ETag and no byte seeking.
- An already-open descriptor can finish across a deletion where the OS permits.

## Polling and outcomes

The module's `Start` runs the server scheduler. It wakes on a committed ended job
and every **60 seconds**.

- It folds outcomes idempotently through `podcast_folded(job_id)`.
- It recovers ended subscribe and poll jobs from the last 24 hours. Unfolded fetch
  and retain outcomes have no age cutoff.
- It queues up to ten due shows per pass while an online Bridge offers
  `podcast.poll`. Only shows with a follower qualify, and open polls are deduped.

Scheduled polls have priority `-10`, manual checks `0` and subscribes `10`.

The Bridge returns `next_poll_seconds` based on the newest active episode:

| Episode age | Base interval |
|---|---|
| less than 2 days | 30 minutes |
| less than 14 days | 2 hours |
| less than 60 days | 6 hours |
| older or unknown | 24 hours |

`Cache-Control: max-age` can lengthen that interval. The server clamps a
successful interval to **15 minutes through 24 hours**.

Validators live in `podcast_feed_state`, not in a disk file updated on every poll.
A `304` keeps the saved validators, updates the check and success times, and
leaves unchanged feed files alone. A poll also repairs indexing owed by an earlier
failed rescan.

**Failures** update the status. They back off exponentially from 30 minutes to 24
hours, or use `retry_after_seconds` clamped to 60 seconds through 24 hours.

- `gone` (HTTP 410) stops automatic polls.
- Unwritable libraries are deferred.
- Turning the module off stops scheduling and folding, and holds queued podcast
  jobs. Jobs already claimed can finish.

**Downloads and retention.** The same scheduler considers them at startup, every
minute, after follow or policy changes, and after committed podcast outcomes,
including an unchanged poll.

- It admits at most ten new fetches per pass, two per show. A rotating show cursor
  keeps Archive fair. Existing open jobs do not spend new quota.
- At most ten retains start per pass, and no more than one per show per hour, by
  the latest retain's creation. A retain needs followers and present files.

**Binding and fetch outcomes.** Feed status is bound to
`(library_id,show_path,show_id)`. Late outcomes for a replaced show, and unbound
polls from before an upgrade, cannot restore its status or validators.

- Fetch outcomes use a separate `podcast_fetch_state`. They back off exponentially
  from 30 minutes to 24 hours, and a larger Retry-After also caps at 24 hours.
  Success clears it.
- A cancellation or an identity replacement is not a failure.
- Fetch and retain never update poll validators or secret flags.
- When new work is admitted, older terminal fetch and retain rows are pruned, only
  after folding. The newest row and the separate summary are kept.

**Moved feeds.** Permanent 301/308 redirect chains and `itunes:new-feed-url` can
move a feed. The Bridge keeps previous hashes for dedupe. It rejects an
HTTPS-to-HTTP `new-feed-url` and avoids cycling back to a previous hash. A feed may
become private on a move, and never becomes public again automatically.

## HTTP guard

`internal/netguard` handles feeds, artwork and episode audio. It accepts only
HTTP(S), and disables environment proxies.

- Every resolved address must be public or explicitly allowed. IPv4-mapped
  addresses are unwrapped, and NAT64 addresses are checked against their embedded
  IPv4 address.
- Loopback, private, link-local, multicast, documentation, CGNAT and reserved
  ranges are refused by default.
- The dialer connects to the addresses it checked, and checks again immediately
  before it connects.
- Redirects use the same guard, with at most ten redirects.

**Limits:**

| Limit | Value |
|---|---|
| connect and TLS handshake | 10 seconds |
| response headers | 15 seconds |
| body stall | 30 seconds |
| whole fetch, feeds and artwork | 3 minutes |
| feed size | **32 MiB** by default, configurable from 1 to 64 MiB |

Gzip is decoded under the response size cap. Transient network failures and
retryable HTTP responses get at most two retries, with jittered delays of 1 and 4
seconds. A Retry-After above ten seconds is returned for the server to schedule,
instead of slept through. Errors use bounded messages without remote URL text.

For feeds on a trusted local network, configure `podcasts.allow_networks`
explicitly (it is empty by default). It grants the named CIDRs to **feeds, artwork
and audio**, so use the narrowest range needed. See
[Configuration](configuration.md#podcasts) for the exact keys and environment
names.

### Episode downloads and proven resume

The audio download uses a plain GET, never HEAD, with
`Accept-Encoding: identity`, no environment proxy, and the same DNS, dial and
redirect guard.

- Pairing credentials and cookies are never sent upstream. Source credentials are
  stripped on cross-origin redirects.
- A non-identity audio encoding is refused, never decompressed.
- The default cap is 1024 MiB (`podcasts.max_episode_mb`, 1..4096). It is enforced
  against the GET length or the resume total before writing, and against the
  received bytes when the length is unknown. The feed's length is not admission
  evidence.
- Two retries, at jittered delays of 1 and 4 seconds, allow at most three GET
  attempts, including a fallback from resume to a fresh GET. A Retry-After above
  ten seconds returns to the scheduler.

**The ceiling.** The absolute ceiling for the download, probe and publication is
`5 min + 3 * ceil(B / 262144) seconds + 6 seconds`. `B` is the known whole-file GET
total, or the configured cap. A 300 MiB file gets 65 minutes 6 seconds. The
ceiling starts before the GET and can only tighten, and retries never reset it.
Waits for the mapping and the locks come before it.

**The probe.** The complete, nonempty bytes are hashed and probed locally within
60 seconds, for a finite positive duration and a supported audio stream. The
detected codec, MIME type and duration are recorded. Tags never replace the feed's
metadata. The probe's inputs cannot open network or playlist resources.

**Resume** needs all of these:

- a matching pairing, library, show and episode identity;
- an exact partial size N;
- a known total T within the cap;
- a strong quoted ETag, sealed in the vault.

The checkpoint stores the owned temp name, the offset and total, and a reference
to the validator, never a URL. A restart rehashes the prefix. Requests use
`Range: bytes=N-` and `If-Range`.

An append requires all of these: a 206 with the same strong ETag, exactly
`Content-Range: bytes N-(T-1)/T`, a matching length when one is supplied, identity
encoding, and exactly T bytes at the end.

- A 200 to a Range request starts from zero, and never appends.
- A weak, missing or changed tag, a bad range, a 416 or an encoded resume discards
  the partial and tries fresh, within the attempt budget.
- Last-Modified, the URL and the size prove nothing on their own.
- A fresh, unsolicited 206 is rejected.

**Cleanup.** Only a resumable stop with a proven partial may keep it. A terminal
cancellation, a lost identity, pairing or mapping, a cap or probe failure, or
exhausted work cleans the owned partials and validators when that is safe.
Recovery cleans only owned records older than 24 hours with no live job, under
mapping checks and locks.

## Private URLs and recovery

Both repos implement the same URL normalization, hashing and privacy rules.

**Normalization** trims the URL and accepts HTTP(S) only. It lowercases the scheme
and host, removes one trailing host dot and a default port, and drops the
fragment. It keeps the userinfo, the escaped path and the raw query, makes an empty
path `/`, and caps the URL at 2,048 bytes. `RedactURL` keeps the scheme and the
host and port, with `/...` when a path or query exists.

**A URL is private** when it has any of these:

- userinfo;
- any query;
- a known private-feed host, including subdomains: `patreon.com`,
  `supercast.com`, `supercast.tech`, `memberfulcontent.com`, `supportingcast.fm`,
  `glow.fm`, `steadyhq.com`;
- a hostname ending in `substack.com`, with `/private/` in the path;
- a path segment of at least 24 URL-safe characters containing both a letter and a
  digit.

`private:true` forces privacy. `false` cannot force a private URL public.

**Following a private URL.** The server holds a private subscribe URL only in
memory, from the follow until the job ends. Deleting the library drops the URLs
held for its jobs at once (`Service.PruneSecrets`, from server 2.4.0). The stored
params have `feed_url: ""`, and the URL is injected only into the claim answer. A
restart before the claim fails the job as `request_expired`, and the listener must
follow again.

The Bridge seals the URL **before** recording its local claim, under
`podcast_job_<id>_<attempt>`. Then it keeps the show's URL as
`podcast_feed_<show_id>`. The temporary credential is removed when the job ends.
The Bridge's database and page responses never persist or expose the raw secret.

**Fetching a private episode.** The fetch resolves the saved vault feed with an
unconditional, bounded feed GET. It matches the assigned episode id or GUID, then
falls back to a unique title and date, never the list position. Ambiguity is
`enclosure_missing`. This does not merge or poll the feed. The enclosure URL stays
in memory for the job's GET attempts, and never enters the checkpoint or the
validator record in plaintext.

**Private files and scope.**

- Private `feed.json` files omit the feed, enclosure, chapter and transcript URLs
  and the show link. URL-bearing text is redacted and URL-bearing GUIDs are hashed.
- Job params, errors and results are redacted at the read and report boundaries
  too.
- Private shows are scoped to their followers, including player-facing admin
  requests. The admin catalog remains an administrative view of the disk.
- Knowing the normalized URL's current or previous hash is the proof for another
  follow.

**Recovery.** Lost vault credentials give `feed_secret_missing`. Following the URL
again queues a subscribe that restores the credential for the existing show. The
server's `secret_missing` latch keeps this recovery available after a later poll
fails for a different reason. A follow is bound to the show's `show_id` as well as
its path, so a private show replaced at the same path does not inherit follows.

## Spike results: extensions and MP3 chapters

**Spike 5:** all 15 sampled feed URLs (14 distinct feeds; two URLs serve the
same show) retained their Podcast Namespace attributes in `gofeed.Extensions`.
Counted per URL, GUIDs appeared in 6, chapter links in 13 and transcripts in
12. Every sample used the `podcast` prefix. The implementation uses extension data
from gofeed and resolves prefixes by the namespace URI,
`https://podcastindex.org/namespace/1.0`. It scans XML declarations for that
mapping, rather than maintaining a second parser for extension values. Chapter and
transcript links are stored for future work, and not fetched.

**Spike 6:** with ffprobe 7.1.1, the server's `metadata.Extract` matched all
89 ID3v2 CHAP chapters across five original Chaosradio MP3s, including every
title and start and end timestamp (rounding below 0.000001 ms). A sixth source MP3
had no chapters and did not count toward the five-file check. Controlled variants
exposed gaps:

- without TIT2, the title became the frame id `chp0`;
- chapter APIC images were absent from the server model;
- reversed ordered CTOC children did not change the timestamp order or the
  physical CHAP order.

The Bridge implements a bounded ID3v2.3/v2.4 CHAP reader rather than
using ffprobe's chapter titles and order. The Spike 6 decisions are:

- Missing or blank TIT2 becomes `Chapter N` after chronological sorting, never
  a frame id. Latin-1, UTF-8 and UTF-16 titles are cleaned and capped at 200 bytes.
- Playback follows start times, regardless of physical CHAP or ordered CTOC
  order. APIC pictures and URLs are skipped, with no extracted files or requests.
- At most a 16 MiB tag and 2000 CHAP frames are read.
- These produce no optional attachment: duplicate ids or starts, timing that is
  invalid or outside the duration, a nonzero first start, gaps or overlaps over
  1000 ms, or a malformed list. Zero or one chapter also produces none. Valid audio
  still installs.
- An unknown end uses the next start or the probed end. Known times are kept.

The output file and how the server consumes it are in
[Podcast CHAP attachments](attachments.md#podcast-chap-attachments).
