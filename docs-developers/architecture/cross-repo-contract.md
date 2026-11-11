---
title: Cross-repo contract
description: "Every seam where changing one AudioSilo repo forces a change in another, with the files on each side and what a change requires. A digest of the workspace CROSS-REPO.md."
---

The server defines the JSON and HTTP contract. The frontend and the
[Bridge](../bridge/index.md) mirror it **by hand**, with no codegen. This page lists
every seam: every place where a change in one repo forces a change, or a deliberate
decision, in another. Each seam gives, in order, what couples the repos, the files
and symbols on each side, and what a change requires. Detail that a seam needs only
sometimes follows in its sub-sections.

:::info[This page is the digest, not the source]
The **normative** contract is `~/dev/audiosilo/CROSS-REPO.md` in the workspace
root. When a seam changes, **update CROSS-REPO.md first**, in the same logical
change as the code, then bring this page in line. If this page and CROSS-REPO.md
ever disagree, CROSS-REPO.md wins. Its sections are numbered differently from this
page's seams, so this page writes "seam N" for its own sections and
"CROSS-REPO.md §N" for the workspace file.
:::

Canonical reference points on each side of the main seam:

- Server route table: `internal/api/api.go`
- Frontend client (mirrors it 1:1): `src/api/client.ts`
- Frontend wire types: `src/api/types.ts`
- The Bridge's mirrored routes: `internal/link` (in audiosilo-bridge, a public
  repository)

## 1. Path is the identity: `(library_id, rel_path)` {/* #1-path-is-the-identity---library_id-rel_path */}

**What couples:** the deepest shared invariant. Content is addressed by
`(library_id, rel_path)`, with the path in a `?path=` query param, never by DB id
(see [Invariants §1](invariants.md#1-path-is-the-identity)).

**Server:**

- `catalog.GetBookByPath` resolves `(library, path)` to a book, indexing it on demand.
- `library.SafeJoin` guards every user-derived filesystem access.
- Durable user state is path-keyed, with no FK to `books`.
- `GET`, `PUT` and `PATCH /libraries/{id}/progress` read and write the book's row
  when given the book's own path or one of its track files (`api.progressPath`).
  This holds for any client. Any other progress path keeps its key, and the server
  does not re-key other path-keyed user state.
- `POST /cast/token` grants the book's path. It resolves a part path (a disc folder
  too) the way the media routes do.

**Frontend:**

- Every content call in `src/api/client.ts` passes `?path=`. The helpers are in
  `src/lib/paths.ts`.
- Client state persists keyed by `(library_id, path)`.
- The book route can be given a track file or a disc folder inside a book, which
  `/item` resolves to the book above it. From 2.4.1 the route then moves to the
  book's own `rel_path` before it renders (`useCanonicalBookPath`). The page asks
  for progress, plays and casts by the book path only.

See [the progress path](../server/api/reference.md#the-progress-path) for the
server's rules.

**A change requires:** a change to path semantics (normalization, casing, or what a
"book path" and a "file path" mean) changes both sides at once. It also changes the
move-tracking fingerprint logic. Re-check seam 6 too, because a track URL must stay a
real file path.

### Folders not indexed yet

`/fs` marks a folder `pending_book: true` when the scanner would read it as a book
but the index doesn't hold it yet. The field is optional and has no capability, so an
older player ignores it.

- The player's `FsEntry` mirrors the field.
- A pending row opens the book route like an `is_book` folder.
- The book screen's read (`/item`) indexes the folder on demand.

See [`GET /libraries/{id}/fs`](../server/api/reference.md#get-apiv1librariesidfs).

## 2. JSON envelopes (hand-mirrored, no codegen)

**What couples:** every response shape.

| Response | Shape |
|---|---|
| Auth | `{ token, user }` |
| `/me` | the user directly |
| Lists | wrapped: `{ libraries }`, `{ books, next_cursor }`, `{ progress }`, `{ bookmarks }`, `{ notes }`, `{ history }`, `{ favourites }` |
| The all-books `/me/bookmarks`, `/me/notes` and `/me/history` | the list wrapper plus an optional `next_cursor` |
| Chapters | `{ chapters, files, duration }` |
| Errors | `{ error }` |

The `user` object carries `has_password` and `has_recovery`, which drive the
frontend's sign-out warning.

**Server:** `internal/api/handlers_*.go` define the JSON.

**Frontend:**

- `src/api/types.ts` re-declares the shapes.
- `src/api/client.ts` unwraps the envelopes. Errors become `ApiError(status, error)`.
- `src/api/hooks.ts` exposes React Query hooks.

**A change requires:** the full [wire-change checklist](#the-wire-change-checklist).
A field rename touches the server and every client that reads that shape.

### Admin metadata edits don't move the player wire

The book JSON's metadata fields carry the *effective* values: scan, then
enrichment, then any admin override. A player receives the edited title, author and
the rest with no new field to mirror.

Of the columns the edits introduced:

- `published` is on every player book.
- `description` is on `GET /libraries/{id}/item` only, because it can be long, so
  list pages leave it out.
- `has_cover`, the scanned values and per-file codec stay off the player's book JSON
  (`json:"-"` on `catalog.Book`). They surface only through the admin-only catalog
  API (`/api/v1/admin/books` and friends), which the admin console in the server repo
  consumes.

### More book metadata, genres and tags

Every `Book` (list, search, recent, `/item` and `/next` alike) also carries these
fields, all `omitempty`:

- `subtitle`, `publisher` and `language`.
- `abridged`, a bool that is **absent while unknown** and is never read as
  unabridged.
- `genres` and `tags`, string lists.

`GET /libraries/{id}/books` takes `genre=` and `tag=` (`catalog.labelFilters`). Each
takes one value, is case-insensitive, and narrows the list. Search matches genres and
tags too.

There is no capability. An older server sends none of the fields and ignores the
params, so the player shows them only when they arrive:

- The Library genre and tag filters (`books/label-filter.tsx`) appear only when a
  loaded book has a label. The player computes them on the device from the loaded
  books and keeps them in the URL as `genre=` and `tag=`.
- The book page shows the `subtitle` under the title, and the labels as chips in the
  About card (`openLabelBooks`), only when the server sends them.

The player mirrors the fields in `types.ts` `Book` and the params in `client.ts`
`BookListQuery`.

The library export (`GET /admin/libraries/{id}/export`) is consumed by the meta site.
It gains five of these fields, plus `published` and `series_list`, and its `version`
stays `1`. The site's parser reads subtitle, publisher, language and abridged and
ignores the rest. The default export still carries no path and no tag. Two options
are opt-in, for the admin's own scripts:

- `?include=paths,tags,description`.
- `?copies=separate`, one row per copy instead of one per book.

See [`GET /admin/libraries/{id}/export`](../server/api/reference.md#get-apiv1adminlibrariesidexport)
for the options, and [`GET /libraries/{id}/books`](../server/api/reference.md#get-apiv1librariesidbooks)
for the field sources and rules.

### Browse and player data shapes

These shapes are additive. The frontend mirrors them in `types.ts`, `client.ts` and
`hooks.ts`, each behind a capability flag (seam 8). The browse screens, Home and the
player (the cover wash, the end of a book) read them.

- Every `Book` gains `published`.
- Every `Book` gains `cover_color` (`{bg, accent?, on_accent?}`). The server sends
  it only while it matches the current art.
- Every `Book` gains `cover_version`, a hash of the book's cover art identity. It is
  a cache buster rather than a content hash.
- `GET /libraries/{id}/authors` and `/narrators` answer
  `{ authors|narrators, unknown }`. The client normalises both to
  `PeopleList { people, unknown }`.
- `/series` answers `{ series }`.
- These browse lists are scope-filtered.
- `/books` takes `narrator=` (`useLibraryBooks`).
- `GET /libraries/{id}/series/books?name=A&name=B` (`series_books`) answers
  `{ series: [{ name, books, next_cursor? }] }` (`SeriesBooks`). Each entry is exactly
  the first page of `/books?series=<name>&memberships=1`. `client.seriesBooksPage`
  batches the Series cards on screen into it.
- `GET /libraries/{id}/next` answers `{ source, next?, book?, work? }` (`NextBook`,
  seam 14).

The share-scope SQL behind all of these (`pathFilterSQL`) is a case-sensitive
byte-range prefix, which matches `Scope.Allows` exactly.

### The listener's own state

The listener's own state is mirrored the same way and gated per feature (seam 8).
Up next, collections, the book menu, Home, the end credits and the You hub (Your
listening, Year in listening, the Account page's devices) read it.

| State | Routes and shapes |
|---|---|
| Up next | `/me/queue`, `{ queue }` |
| Collections, shared read-only with named users | `/me/collections/**`, `{ collections }` and `{ collection, items }`; `/me/share-targets`, `{ users }` |
| Ratings | `/libraries/{id}/rating`, `{ rating }`; `/me/ratings` |
| The caller's own progress edit | `PATCH /libraries/{id}/progress`: mark finished or unfinished, edit the dates. Every progress response carries `started_at` and `finished_at`. |
| Personal stats | `/me/stats`, `{ stats }`; `/me/listening`; `/me/goal`, a books-per-year goal |
| The caller's devices | `/me/devices` |

List entries are `{ library_id, path }` book references (seam 1) that carry an
optional list-shape `book`. The server filters every list by the caller's current
access, and an id that isn't the caller's is a `404`.

The shapes and status codes are in
[Up next, collections and ratings](../server/api/reference.md#up-next-collections-and-ratings).
The security rules are in
[Auth & security](../server/auth-and-security.md#the-listeners-own-state-me).

### Bookmark labels, edits and the lists across books

These are gated by `annotations` (seam 8).

- Every bookmark carries `label`, which `POST .../bookmarks` accepts.
- The owner edits a row with `PATCH /bookmarks/{id}` and `PATCH /notes/{id}`. Each
  answers the bare row.
- `GET /me/bookmarks` (`{ bookmarks, next_cursor? }`) and `/me/notes`
  (`{ notes, next_cursor? }`) list the caller's rows across books.
- `/me/history` pages on the same `cursor`, with a `book?` per row.

The shapes, bounds and status codes are in
[`PATCH /bookmarks/{id}`](../server/api/reference.md#patch-apiv1bookmarksid). The
security rules are in
[Auth & security](../server/auth-and-security.md#the-listeners-own-state-me), and
the client side is in
[State & data](../frontend/state-and-data.md#bookmarks-notes-and-the-journal).

## 3. Media auth rides in the URL (`?token=`) {/* #3-media-auth-rides-in-the-url---token */}

**What couples:** browsers can't set an `Authorization` header on `<img>` or
`<audio>`. So cover and stream GETs accept the session token as a `?token=` query
param on every platform.

**Server:** `internal/api/middleware.go`. Only these routes call
`bearerToken(r, true)`, all through `mediaAuth`:

- The cover and stream routes (`requireBookMediaAuth`, which also takes a cast token).
- The two community cover routes, `/meta/cover` and `/me/upcoming/cover`
  (`requireMediaAuth`).
- The calendar feed, `/me/upcoming/releases.ics` (`requireFeedAuth`), which takes a
  `feed` token only.

All other routes are header-only (`bearerToken(r, false)`). Tokens never ride the
query string there, where they could leak into access logs or Referer headers.

**Frontend:**

- `client.ts` `mediaTokenQuery()` feeds `coverUrl()` and `streamUrl()`.
- Native sends the header as well as the query parameter.
- The web player relies on the query parameter alone. A web cover is a plain `<img>`
  (`CoverImage`), which can't send a header.

**A change requires:** do **not** "tighten" the server to reject query-param tokens
on media routes without first removing the web player's dependency on them. The web
player cannot authenticate media any other way, and neither can a Cast receiver.

### Cover thumbnails

Thumbnails use the same auth. `GET /libraries/{id}/cover?size=160|320|640`
(capability `cover_sizes`) is a JPEG of the same art.

- Its `ETag` combines the size, the server's thumbnail revision
  (`media.ThumbnailRev`) and the art version: `"thumb-<size>-<rev>-<hash>"`.
- Its `Cache-Control` is `private, no-cache` for a custom cover and
  `private, max-age=86400` for file art.
- Any other `size` is a `400`.
- A thumbnail the server can't make is a `404`. The client answers it by falling back
  to the full-art URL.

Clients add the book's `cover_version` as `v=`, purely as a cache buster:
`coverUrl(lib, path, { size, version })`.

From 2.5.1 the server takes `size=96` too. The sizes are shared with
`POST /admin/covers`, where the admin console asks for `96` for its table rows. The
player never sends it, because an older server answers it `400`. See
[`GET /libraries/{id}/cover`](../server/api/reference.md#get-apiv1librariesidcover).

### Community covers

Community covers (capability `meta_covers`) are the other media-auth image route.
`GET /libraries/{id}/meta/cover?path=&url=&size=160|320|640` (`96` too from 2.5.1)
is a JPEG thumbnail of a community `cover_url` that the server fetched. The web
player's CSP stays `img-src 'self' data: blob:`, so the web player never contacts a
cover host. See [seam 13](#13-community-metadata-a-three-repo-seam).

### Upcoming covers

`GET /me/upcoming/cover?work=&size=` (capability `upcoming_covers`) is the same kind
of thumbnail for an upcoming release. The server serves it only when the caller's own
upcoming list hands out that work's cover (see
[`GET /me/upcoming/cover`](../server/api/reference.md#get-apiv1meupcomingcover)).
The player builds it with `client.upcomingCoverUrl`, with the media token like every
cover.

### The calendar feed token

The calendar feed (capability `upcoming_calendar`) is the one `?token=` that is not
a session. `GET /me/upcoming/releases.ics?token=<secret>` takes a token of kind
`feed` and no other kind. Every other route refuses a feed token. So the link a
listener pastes into a calendar app reads their upcoming releases and nothing more.

- The server answers `POST /me/upcoming/calendar` with a server-relative `path`.
- The player puts that path on the server's away address, or else on the address in
  use.
- The player keeps the full URL in its secure store, like a session token.

See [The calendar feed](../server/api/reference.md#the-calendar-feed) and
[Calendar feed tokens](../server/auth-and-security.md#calendar-feed-tokens).

### Cast tokens on media URLs

Cast tokens (capability `cast`) ride the same `?token=`, on a book's cover and stream
only. A player casting to a Chromecast mints one for the book (`POST /cast/token`)
and builds the receiver's URLs with it, never with its session token. See
[seam 14](#14-listening-in-the-house-and-casting).

### The ebook takes no URL token

`GET /libraries/{id}/ebook` (capability `ebooks`) takes header auth only
(`requireAuth`). It never reads `?token=`, it refuses a cast token, and there is no
URL token kind for it. The web player fetches the bytes with the `Authorization`
header (`client.ebook`) and posts them to the reader frame. A read-along map
(`GET /libraries/{id}/readalong`, capability `readalong`) follows the same rule. See
[seam 18](#18-the-ebook-reader).

## 4. Audio `Content-Type` must be real (byte-sniffed)

**What couples:** iOS AVPlayer rejects audio served as `application/octet-stream`
under `nosniff` (error `-12847`). So the served MIME type must be genuinely correct.

**Server:** `internal/media/media.go` `ServeFile` sniffs the magic bytes and falls
back to the extension:

| Magic bytes | Type |
|---|---|
| `ftyp` | `audio/mp4` |
| ID3 or MPEG sync | `audio/mpeg` |
| ADTS | `audio/aac` |
| `fLaC`, `OggS`, `RIFF`, `WAVE` | their own audio types |

**Frontend:** assumes a correct `Content-Type`. There is deliberately no client
workaround.

**A change requires:** any change to how audio is served (new container support, a
proxy in front) must preserve true audio MIME types. Validate it on an iOS device.

## 5. Transcode negotiation: `direct_playable` and `?transcode=1`

**What couples:** whether a file needs server-side transcoding to play in a given
client.

**Server:**

- The scanner records each book's `codec` (ffprobe `codec_name`, migration
  `0008_book_codec`).
- `item` and `chapters` expose `direct_playable`. It means **plays in browsers as the
  server serves it**: `Book.PlaysInBrowsers` (`media.DirectPlayable`; from 2.4.0 the
  container counts too) or, while ffmpeg is configured, `Book.PlaysRemuxed`.
- With ffmpeg, an MP3-in-Matroska `.mka` is served at the same stream URL as MP3. It
  is a cached lossless remux, and `?original=1` serves the stored bytes (see
  [Remuxing Matroska](../server/media.md#remuxing-matroska-medianewremuxer)). It
  streams in every client, shipped native builds included, so it is `true`.
- An `.mka` holding another codec stays `false`, so the web player transcodes it. The
  iOS app can't play it, and the Android app plays it only where Media3 decodes the
  codec inside.
- `GET .../stream?path=…&transcode=1` pipes through ffmpeg to MP3 (`media.Transcode`).
  `&t=<seconds>` starts mid-file, because transcoded output isn't byte-seekable.
- The `--ffmpeg` flag gates all of this, and the `transcode` capability (seam 8)
  reflects it. The remux has no flag of its own.

**Frontend:**

- `Book.direct_playable` and `codec`, and `ChaptersResponse.direct_playable` and
  `codec`, are mirrored in `types.ts`.
- `client.ts` `streamUrl(…, { transcode, t })` builds a transcoded stream URL.
- The **web player negotiates it** (`src/playback/transcode.ts`). On web, a book
  whose `direct_playable` is explicitly `false` streams with `?transcode=1` when its
  server's `transcode` capability is `true`.
- The web engine re-requests with a new `&t=` on every seek and keeps positions
  track-absolute.
- For such a book, the book page says the audio is converted for this browser, and
  downloading it is off in the browser.
- Native engines never transcode. They rely on the platform's own decoders, and a
  downloaded file is never transcoded.
- An `.mka` file is saved offline as `<i>.mp3` on iOS only (see
  [Native engine](../frontend/offline.md#native-engine-enginenativets---expo-file-system)
  in Offline).

See [Web transcode negotiation](../frontend/playback.md#web-transcode-negotiation-transcodets)
in frontend playback.

**A change requires:** changing `direct_playable`'s meaning or the transcode query
params changes both sides. The negotiation degrades by design. These all stream the
file directly, exactly as before negotiation existed:

- An absent `direct_playable`, from an older server or any list response (only
  `item` and `chapters` carry it), reads as playable.
- A codec never probed is sent as `true`.
- An unknown or `false` `transcode` capability.

### Watch renditions

The same stream route serves a different kind of copy for a watch.
`?rendition=watch` answers with a cached AAC copy of the audio file: AAC-LC mono
48 kb/s in MP4.

- The copy has the **same duration** as the source, so whole-book positions,
  chapters and file places hold.
- The same `media.FileCache` the remux uses makes it once, into the data directory.
- It is served with Range and a strong ETag, so a watch resumes a download.
- A cold encode answers `503 rendition_pending` with `Retry-After`, never a live
  transcode.
- `POST` and `GET /libraries/{id}/renditions` prepare a whole book and report each
  file.

The `renditions` capability (seam 8) gates it. The
[Apple Watch app](../frontend/apple-watch.md) is its client. The player only mirrors
the flag and `ServerInfo.renditions`. See
[Watch renditions](../server/media.md#watch-renditions-medianewrenditioncache) in
the server's media page and [Watch renditions](../server/api/reference.md#watch-renditions)
in the API reference.

## 6. The chapter and whole-book timeline model {/* #6-the-chapter--whole-book-timeline-model */}

**What couples:** the subtlest shared model. Single-file m4b chapters and multi-file
mp3 "parts" are normalized to one shape, so a player renders both identically.

**Server:**

- `metadata.Chapter` carries `file_path` (the library-relative file to stream),
  in-file `start` and `end`, and `book_offset` (its start on the whole-book
  timeline).
- `GET .../chapters` returns `{ chapters, files, duration }`.

**Frontend:**

- `src/playback/book-queue.ts` builds the track queue from `files`. Without them it
  uses the distinct chapter `file_path`s, and without those the single-file path.
- `src/playback/store.ts` maps between `(trackIndex, position)` and the whole-book
  position through cumulative `offsets`, and overlays chapters by `book_offset`.

**A change requires:** any change to chapter normalization changes the queue builder
and the timeline math with it. And always **stream the file, not the book**. A folder
path in a track URL is the MediaToolbox `-12864` bug class (see
[Invariants §3](invariants.md#3-stream-the-file-never-the-book)).

### Community and generated chapters

The chapters may come from somewhere other than the files:

- A community recording's list fitted onto the audio
  ([Community chapters](../server/community-chapters.md)).
- The chapters a Bridge found in the narration of a book with none of its own
  ([Generated chapters](../server/community-chapters.md#generated-chapters)).

They keep this exact shape, so a player needs nothing to play them. The only
additive marker is `chapters_source: "community"` or `"generated"` on `/chapters` and
the `/item` book. The player mirrors it as `Book.chapters_source` and
`ChaptersResponse.chapters_source` (the `ChaptersSource` union).

- The player's book page captions such chapters. An older app shows them as ordinary
  chapters.
- A downloaded book replaces its saved chapters with a newer server answer while its
  audio files are unchanged: same paths, order and sizes (`startChapterRefresh`).
- The same files in a new order (the server's natural file order, 2.4.0) are taken
  only by a start that loads them that way (`adoptStartedChapters`), never from a
  background answer.
- From 2.4.1 the download hot-swap can take them too. A copy that lands while a
  start's new order streams takes that start's chapters, only when they give the
  order the engine plays, so only the files' urls change (see
  [Offline](../frontend/offline.md)).

### Podcast episode chapters

Podcasts also return `id3_chap` from the server's CHAP attachments. The player
(2.2.0 and later, first released in 2.4.0) captions it "Chapters from the episode
file". See [seam 17](#17-podcast-shows-feeds-and-client-visibility).

## 7. Pairing and connect deep links {/* #7-pairing--connect-deep-links */}

**What couples:** the handshake from an auth code to a session. It spans both repos
and two URL carriers.

**Server:**

- `internal/api/qr.go` `buildPairing` emits two links:
  - `web_url` (`<base>/web/connect?token=…`) is encoded in the QR. It opens the app
    through Universal Links or App Links on claimed domains, and otherwise the web
    player.
  - `uri` (`audiosilo://connect?server=<base>&token=<pairing_token>`) uses the custom
    scheme.
- The flow is `POST /auth/redeem` (a code for a pairing payload), then
  `POST /auth/exchange` (a pairing token for a device-scoped session).

**Frontend:**

- The `audiosilo` scheme in `app.json`.
- The connect and pairing parser and the `/web/connect` route consume both carriers.
- `client.ts` `redeemCode()` and `exchange()`.
- The app's scanner and the web player's paste field also read the console's invite
  link (`inviteURL`, `<base>/connect#code=…`; `parseInviteScan` from player 2.4.0).
  They sign in with its code through the same redeem and exchange. A change to that
  link's shape changes both repos.

**A change requires:** these are a contract:

- The scheme.
- The query keys: `server`, `token`, and the optional `home`, `away`, `sid`, and
  `uid`, `book`, `path`.
- The `/web/connect` route path.

Change the server emitter, the parser and `app.json` together, or pairing breaks.

### Home and away addresses

Every pairing payload (`/auth/redeem`, `/auth/pair`, the demo session's `pairing`)
may carry `addresses: { home?, away? }` (the `addresses` capability).

- `away` is `public_url`.
- `home` is `lan_url`, or else the request's own `Host` when that is a home-network
  host (`config.Addresses`). The host rule is in
  [Configuration](../server/configuration.md#home-address-lan_url).
- The server drops a home equal to the away.

Both links carry them as extra query params **after** the existing ones, and only
when set (`…&away=…&home=…`). Read them by name, because the encoder sorts them. Old
clients ignore them.

The `/auth/exchange`, `/auth/login` and `/demo/session` answers carry `addresses`
too. `GET /addresses` lets a paired device learn one set later. The shapes are in
[Home and away addresses](../server/api/reference.md#home-and-away-addresses).

On the frontend:

- `parsePairingScan` returns `addresses`.
- The connect flow stores them on the connection (`Connection.addresses`).
  `mergeAddresses` keeps a known `home` that an answer lacks.
- `serverUrl` is never rewritten.
- The native app picks the address per request. It uses home only after a tokenless
  `GET <home>/api/v1/server` answered with this connection's `server_id`, else away,
  else `serverUrl`.
- **Never send a token to a home address before its `server_id` matched.**
- The web player never switches, because it is served same-origin.

See [Connect and home/away addresses](../frontend/connect-and-addresses.md#home-and-away-addresses).

### Listen in player

The admin console's book page mints a token for its own user (`POST /auth/pair`). It
then opens the same-origin
`/web/connect?token=…&sid=…&uid=…&book=<library_id>&path=<rel_path>` in a new tab.

- The player skips the exchange when it is already signed in as `uid` on `sid`.
- The player ends the flow on that book. It rebuilds the route with `bookHref`, never
  from a URL in the link.

See [Connect and onboarding](../frontend/connect-and-addresses.md#a-link-that-names-a-book).

### Handing a pairing to an Apple Watch

The phone mints a token for its own user (`POST /auth/pair {"ttl_seconds": 600}`).
It sends the token to the watch in a `pair` message over WatchConnectivity, not a
link. The watch exchanges it with `POST /auth/exchange` under the same address rules,
and identifies as `audiosilo-watch/<ver> (watchos)`. The messages between phone and
watch are a contract inside the frontend repo, not the server's (see
[The message contract](../frontend/apple-watch.md#the-message-contract)).

## 8. Capability flags: `GET /api/v1/server`

**What couples:** feature negotiation, so any app build can talk to any server
version.

**Server:** `handleServerInfo` advertises the capability flags and the server
version (`api.Version`, stamped from the release tag through ldflags). The full flag
table, with what each one gates and when it is `true`, is owned by
[API conventions](../server/api/index.md#capability-flags---gate-your-features).
By what decides their value, the flags are:

- **Server setup:** `web_player` (whether `/web` is populated), `transcode` (ffmpeg
  availability) and `renditions` (true with ffmpeg and a data directory, else
  `false`; the kinds are a top-level `renditions` list, seam 5).
- **Always true:** `admin_ui`, `api_keys` (the server accepts user-minted API keys)
  and `export`.
- **The runtime metadata switch:** `metadata`, `meta_bundle` and `meta_covers`.
- **Always true on a server that has them:** `browse_people`, `cover_sizes`,
  `next_book` and every flag added after it, including `household` and `cast`
  ([seam 14](#14-listening-in-the-house-and-casting)), `household_members`
  ([seam 15](#15-household-members-profiles-and-kids-mode-stay-client-side)),
  `podcast_opml`, `ebooks` and `readalong` (the reader and read-along maps,
  [seam 18](#18-the-ebook-reader)), and `listening_sync` (listening as events,
  [seam 19](#19-listening-sync-sync-v2)).
- **The Bridge's heartbeat:** `bridge` ([seam 16](#16-the-bridge)). The
  `bridge: {version, features}` block beside `capabilities` goes to a signed-in caller
  only (a session or API key of any role, not a demo account). The `bridge` flag
  itself stays public.
- **A managed module:** one flag per [managed module](../server/modules.md),
  `contributions`, `podcasts` and `audible`. A module flag is `true` when the
  module's toggle **and** its Bridge requirement are met, and is sent `false`
  otherwise. The console reads `contributions` to offer contributing. `podcasts`
  needs the `podcast` Bridge feature and gates actions, while reads stay core and
  players older than 2.2.0 are excluded. Only the console reads `audible`
  ([seam 16](#audible-accounts)).
- **Podcast protocol flags:** `podcast_fetch:true` is an independent protocol flag,
  sent even when the Bridge is offline or the module is off. Older servers omit it
  ([seam 17](#17-podcast-shows-feeds-and-client-visibility)). `podcast_discovery` is
  true when the boot-only `podcasts.discovery.enabled` **and** the module toggle are
  on, independent of the Bridge, and is sent `false` otherwise.
- **Upcoming releases:** `upcoming` is true while community metadata is on **and**
  `upcoming.enabled` is set. It gates
  [`GET /me/upcoming`](../server/api/reference.md#get-apiv1meupcoming), the upcoming
  releases in the caller's series. `upcoming_calendar` and `upcoming_covers` are
  exactly `upcoming`. They gate the
  [calendar feed](../server/api/reference.md#the-calendar-feed) and
  [`/me/upcoming/cover`](../server/api/reference.md#get-apiv1meupcomingcover).
- **Reserved:** `upload` and `websocket` are reserved for **planned** phases.
  `POST /uploads` and WebSocket sync are not shipped.

**Frontend:**

- The `ServerInfo` type. Feature gating and the "connected server version" display
  key off it.
- Every flag from `meta_bundle` on is optional on `Capabilities`. The player reads it
  through the exported, tri-state `useCapability(flag, connectionId?)` in `hooks.ts`.
  It is `undefined` until `/server` answers, then `true` or `false`.
- The gated hooks give a server without the flag no query function (`skipToken`), so
  the player never asks it.
- The gated mutations (`useCapabilityMutation`) reject with `CapabilityError` without
  sending anything while the flag is false or `/server` hasn't answered.
  `CapabilityError` is not an `ApiError`, so it shows no reconnect banner.

**A change requires:** adding a capability is a two-repo change. Flip the flag as the
feature lands on the server, and gate the new UI on it in the client. Never assume a
capability is present. The one exception is `listening_sync` while unknown (see
[The gate](#the-gate) in seam 19). A module's flag is its id. It is
mirrored in `Capabilities` (`types.ts`) like any other flag and named in the player's
`ModuleFlag` too, except `audible`, which the player doesn't mirror (see
[Player modules](../frontend/state-and-data.md#player-modules-srcmodules)).

## 9. The web player is served *by* the server at `/web`

**What couples:** the frontend's web build is not vendored in the server repo. The
server serves it at runtime from `web_dir`. Docker bakes a pinned build in, and
native binaries embed one through `-tags embedplayer`.

**Frontend:** `app.json` sets `experiments.baseUrl: "/web"` and
`web.output: "static"`. The export must be built with `baseUrl=/web` so asset URLs
resolve under the subpath.

**Server:** `internal/web/web.go` serves `web_dir` at `/web`.

- It falls back to `index.html` for SPA routes.
- It answers 404 for missing assets.
- It sends a per-response scoped CSP that hashes each document's inline scripts.
- The one exception is the player's ebook reader document, `reader.html`, served at
  `/web/reader.html` under its own policy ([seam 18](#18-the-ebook-reader)).

**A change requires:** watch the CSP coupling. The server computes the hash per
document at serve time, so it usually tracks automatically. A change in how Expo
inlines bootstrap scripts can still break strict CSP. Otherwise the two are
compatible by construction, because the server image pins a specific web build.

## 10. Demo mode (`demo.audiosilo.app`) {/* #10-demo-mode---demoaudiosiloapp */}

**What couples:** the public throwaway-account demo flow.

**Server:**

- `config.demo.*` (enabled, library, max_users, idle_ttl).
- `POST /demo/session` mints a throwaway account that the server reaps later
  (migration `0005_user_is_demo`).
- In demo mode the site root `/` redirects to `const webDemoPath = "/web/demo"` in
  `api.go`. This constant is explicitly the single point of coupling with the
  player's router.

**Frontend:** `client.ts` `demoSession()`, the `DemoSession` type, and the
`/web/demo` route and screen in the Expo router.

**A change requires:** when you rename the player's demo route, update
`webDemoPath` in the server in the same change.

## 11. Build and release coupling (order matters) {/* #11-build--release-coupling-order-matters */}

**What couples:** the deployable server image contains a **pinned** web player, so
the web image must exist before the server image builds.

**Frontend:** `.github/workflows/web.yml` exports the web build and pushes
`ghcr.io/<owner>/audiosilo-web`.

**Server:**

- `Dockerfile` does `FROM ${WEB_IMAGE} AS web`, then `COPY --from=web /web /app/web`.
- `.github/workflows/image.yml` builds and pushes `ghcr.io/<owner>/audiosilo-server`.
- `.github/workflows/release.yml` and `scripts/fetch-web-player.sh` embed the same
  pinned build into native binaries.

**A change requires:** publish the web image **before** the server image on every
release. The served `/web` identifies as its `app.json` version, and the server's
podcast gate keys on it (2.2.0 and later see podcasts). So a server release that
bakes in an older web image serves a player that shows no podcasts. The full detail
is in [Release pipeline](release-pipeline.md), and the operator runbook is
[Releasing](../contributing/releasing.md).

## 12. CORS for web development

**What couples:** during development the web player (`expo start --web` on `:8081`)
and the API (`:8080`) are different origins.

**Server:** set `cors_origins` to include the web origin (for example
`http://localhost:8081`). `"*"` disables the check. Empty means no cross-origin
headers, and native and same-origin clients still work.

**Frontend:** `npm run web` serves on `:8081` by default.

**A change requires:** nothing structural. Self-signed TLS (the server default) needs
trusting in the browser, or use `AUDIOSILO_TLS_MODE=off` for plain-HTTP local dev.

### The identity header and cross-origin calls

The player's `X-AudioSilo-Client` identity header is a custom header, so it would
force a preflight on every cross-origin call. The server's
`Access-Control-Allow-Headers` lists it, but servers released before it don't.

- So the web player sends it **only same-origin** (`shouldIdentify` in
  `src/lib/client-id.ts`). Native always sends it.
- Keep that rule when adding any custom request header (see
  [Client identification](../server/api/index.md#client-identification-x-audiosilo-client)).
- The server shows podcasts only to an identified 2.2.0 or later player, so the
  cross-origin dev loop shows none. A development build can opt in with
  `EXPO_PUBLIC_IDENTIFY_CROSS_ORIGIN=1`, never a production build.

For an allowed origin the server also allows `Range`, and exposes `Retry-After` and
the OPML export's `X-OPML-*` counts. What an older server means for the player is in
[CORS](../server/api/index.md#cors).

### Media for a player on another site

The web player loads another origin's covers, artwork and audio in CORS mode
(`corsModeFor`, applied by `CoverImage` and the `<audio>` element; see
[the web engine](../frontend/playback.md#web-engine-servicewebts)). So the server's
`cors_origins` governs them. An older player loads them no-cors and relies on
`Cross-Origin-Resource-Policy` instead ([CORS](../server/api/index.md#cors)). Media
takes only an explicit token, never a cookie, which is why both are safe (see
[Transport hardening](../server/auth-and-security.md#transport-hardening)).

## 13. Community metadata: a three-repo seam

**What couples:** enriched book metadata (description, characters, recaps, "more in
this series") originates in `audiosilo-meta` and flows through the server to the
player.

**audiosilo-meta (upstream):** `metaserve` serves the community metadata read-only:
`GET /lookup`, `/works/{id}`, `/series/{id}`, and
`/works/{id}/recordings/{rid}/chapters` for
[community chapters](../server/community-chapters.md). See the
[metadata database developer pages](../meta/overview.md).

**Server:**

- `internal/meta` resolves a book's ASIN or ISBN against `metaserve` and composes an
  enrichment envelope. `GET /libraries/{id}/meta` returns it, behind an admin
  off-switch and a bounded cache.
- `GET /meta/work?id=…` serves one work document straight through, from the same
  cache, for the earlier books of a series the caller does not own. It is authed but
  **not** library-scoped, since a work id names nothing on this server.
- The `metadata` capability on `GET /server` reflects whether either lookup is live.
- The admin console's match dialog (`GET /admin/libraries/{id}/book/match`) asks
  `metaserve`'s structured `GET /works/match` (see
  [Community metadata matching](#community-metadata-matching)).
- Community chapters (`internal/chaptercheck`), upcoming releases
  (`internal/upcoming`) and the unknown-ASIN report (`internal/coverage`) also read
  from `metaserve`, and the report writes to it. Each has its own sub-section below.

**Frontend:**

- The `BookMeta` envelope is hand-mirrored in `src/api/types.ts` and fetched by
  `client.bookMeta`.
- The book screen renders it, capability-gated, on its Recaps, Characters and Series
  tabs.
- The series page, Home (the Now card and Previously on), Search, the end credits and
  the player's companion and reveal toast read it too.
- `client.metaWork` and `useMetaWork` lazily fetch a previous book's work when the
  reader opens its row.

**A change requires:** the server consumes `metaserve`'s response shapes. So a
change to those shapes ripples from audiosilo-meta to the server's `internal/meta`,
and on to the player only if the server's outward `/meta` envelope changes. Keep it
additive, same as every other seam here. A change to the exported API of `pkg/query`
or `pkg/release` reaches the server through its `go.mod`.

### Community metadata matching

The match dialog sends `GET /works/match` the book's tag and path facts:

- Its `language` and repeatable `narrator`. An older `metaserve` ignores them.
- Its tag hints, as `asin` and `isbn`.

Against a `metaserve` that predates the route, the server falls back to `lookup` and
`works/search`. The candidates pass `metaserve`'s `score` and `reasons` through to
the console's hand-mirrored types (`admin-ui/src/api/types.ts`), not to the player.

The server, not the console, decides which ASIN a match attaches:

- Each recording's ASINs keep their `region` (`asin_refs`).
- The server orders `asins` by its preferred marketplace (`metadata.region`).
- Bulk match runs reuse the same match per book.
- The server decides what is confident (`matchrun.Classify`, the `ReviewFloor`).

Where the scoring comes from:

- A mirror-mode server gets `metaserve`'s scoring with the `audiosilo-meta` version
  in `go.mod` (v0.24.0).
- An online server gets the scoring of the service it asks. meta.audiosilo.app has
  run v0.24.0 since 2026-11-05, so the position and runtime factors are live for
  every online server that asks `works/match`.
- `language` and `narrator` count only from a server that sends them (2.6.0).
- In 2.6.0 the identifier rule, the floor, title tidying and tag hints are
  server-side.

A run in `match` mode also sends [`expand=work`](../meta/api.md#expandwork), so one
answer per book carries the best work and its series facts. The dialog, a refresh and
a repick never send it. An old `metaserve` ignores it, and then the server fetches the
work and series itself (see
[What a run asks of the community service](../server/api/reference.md#what-a-run-asks-of-the-community-service)).

### Dramatizations

A dramatization is a recording of its book. So a plain book matches the work but
never takes that recording.

- `works/match` names none by length.
- The server's `meta.DefaultRecording` keeps the same rule by hand. A recording
  counts as a dramatization by its publisher or full-cast credit, or by the work's
  label only when the recording states no publisher. So a server asking an older
  `metaserve` is safe too.

From 2.6.0 the server alone goes further. None of these needs a `metaserve` change:

- A book's author credit or genre can state a dramatization.
- A work holding only dramatizations gives a plain book the one its length names.
- A match run trades an off-length recording (mostly a tag hint's) for one of the
  same work that fits (`meta.FitRecording`).

The rules are in
[`GET /admin/libraries/{id}/book/match`](../server/api/reference.md#get-apiv1adminlibrariesidbookmatch).

Otherwise a run holds for review a plain book whose work holds only dramatizations
(item `detail: "dramatization_only"`, no identifier to attach). The candidate's
additive `dramatization_only` makes the console's dialog preselect no recording.

Which statement speaks for which recording:

- A work's label speaks only for a recording that states no publisher.
- A statement that stays on the title (`(Dramatized)`, a split part's label) speaks
  for every recording.
- When no recording of a work says so of itself, the title's statement covers them
  all.

### Matches by work id

From 2.6.0 the server records each match by its work id (`book_matches`). So a store
listing that `metaserve` holds with no ASIN or ISBN counts as matched. A refresh
looks such a book up by `works/{id}`, following a retired slug's `301`. The rule a
run applies to such a book is in
[Bulk community matching](../server/api/reference.md#bulk-community-matching). The
player's `/meta` stays identifier-keyed, so it shows no community content for such a
book yet.

### Community chapters from the meta side

Community chapters (`internal/chaptercheck`) fetch the chapter list of the lookup's
exact `recording_id` only, never the first recording a work lists. The server fits
the list onto the book's audio. The chapters reach the player as ordinary chapters
with the additive `chapters_source: "community"` (see
[seam 6](#6-the-chapter--whole-book-timeline-model)). The console's panel reads the
admin book page's `community_chapters`.

### Upcoming releases from the meta side

Upcoming releases (2.6.0, `internal/upcoming`) read from `metaserve` once a day:

- The watch feed (`watch/feed.json?s=`), 50 series a request. The work id is taken
  from each item's tag or URL.
- `GET /series/{id}` for a series never read, one with news, or one read over a week
  ago.

The series rails' work cards carry `release_date` through to `/meta` (additive).

The player (2.6.0) reads
[`GET /me/upcoming`](../server/api/reference.md#get-apiv1meupcoming) as
`UpcomingResponse` in `types.ts` (`client.upcoming()`, `useUpcomingAll()`). It asks
only a server that sends `upcoming`, and never for a kid.

- Home's Coming up in your series, the `/upcoming` page and the You hub's Upcoming
  section show it.
- An item opens its series page by its `local` view.
- The series page dates its not-yet-released ghosts from the rails' `release_date`
  ("Out Nov 12, 2026").
- The player also shows each item's real cover (`upcoming_covers`) and offers a
  calendar feed (`upcoming_calendar`, a `feed` token). Both carry their token in the
  URL (see [seam 3](#3-media-auth-rides-in-the-url---token)).

See [Upcoming releases](../frontend/state-and-data.md#upcoming-releases).

### The unknown-ASIN report

The server's one write to `metaserve` is the opt-in unknown-ASIN report (2.6.0,
`internal/coverage`, `metadata.report_unknown`, off by default). Once a day the
server sends
[`POST /api/v1/intake/unknown-asins`](../meta/api.md#post-apiv1intakeunknown-asins)
with exactly `{"asins":[...]}`, holding only the ASINs a lookup answered 404 for. The
transport rules (https only, no identifying headers, no redirects), and how the
server handles an older `metaserve` or intake turned off, are in
[Configuration](../server/configuration.md#the-unknown-asin-report-metadatareport_unknown).

### Reading-order families

Reading-order families (metaserve `schema_version` 7 `ordering`, `ordering_of` and
`orderings`) are collapsed **server-side** into one rail per family, with the other
orders as additive alternates. So a shipped player that ignores them still sees one
rail in the primary order. The current player adds a per-family order toggle that its
"previous books" list follows (see
[Reading-order families](../server/api/reference.md#reading-order-families)).

### The `/meta` bundle fields

These are all additive:

- `work.community_description`, the CC BY-SA description, kept apart from the CC0
  `description`.
- `work.attribution`, present iff the work carries CC BY-SA content. **The server
  writes the legal text.** A client must render it beside that content and never
  compose it.
- `recording.chapter_count`.
- `local` `{library_id, path}` on each rail entry the caller owns, in the main view
  and the orderings. The server resolves `local` **per request, after the shared
  cache, on a copy**, and never stores it there. A failure placing the caller's books
  sends the envelope without `local` rather than failing it.

Two query params sit behind the `meta_bundle` capability:

- `?include=previous` adds `previous[]`: the main view's earlier works, nearest
  first, at most 5.
- `?spoilers=hide` gates the envelope by the caller's saved server progress.

Spoiler gating still **stays on the device by default**. The player gates against its
live position and does not send the param.

`reveal` and `through` are numbers a gate compares with the listener's chapter. When
the book has more chapters than the work's `position_scale` states, the server
answers them [on this book's chapters](../server/api/reference.md#positions-on-this-books-chapters).
It does so per request, never cached, and always errs later. Only the server can do
that for a shipped app.

### What `/next` answers

`GET /libraries/{id}/next` follows every series the book is in: main first, then its
other series.

1. It takes the community rails in that order, with rails named like none of its
   series last. The first rail with a next work that doesn't step back decides.
2. That rail answers when it places that work on one of the caller's books, possibly
   in another library. A later rail never answers in its place.
3. Otherwise the local series answer (each in turn), then the folder, then none.
4. When one of those answers, an unplaced community next work rides along as `work`
   without `local`.

The wire shape is the same as for one series.

### The persistent metadata cache

The server also keeps answers in a persistent `meta_cache` table, so a restart is
warm and an outage serves the last known answer.

- It has no config key and follows `metadata.enabled`.
- It holds community data only.
- It keeps the newest 20,000 rows, of which works fetched by id are at most 2,000.

See [`/meta`](../server/api/reference.md#get-apiv1librariesidmeta) and
[Configuration](../server/configuration.md#the-persistent-cache).

### Community covers through the server

`meta_covers` tracks `metadata`.
`GET /libraries/{id}/meta/cover?path=&url=&size=160|320|640` uses media auth
(`?token=`) and answers `image/jpeg`, a thumbnail of `url`. `size` is optional, with a
default of 320, and takes `96` too from 2.5.1.

- The server answers **only when** that exact URL is a `cover_url` that the `/meta`
  envelope for the same `(library_id, path)` hands out: the recording's, or any rail
  entry's in a main view or an ordering.
- Anything else is `404 no such cover` **before any fetch**. It is never an open
  proxy.
- Scope and errors are as for `/meta`: 403 or 404 for the path, 404 with metadata
  off, and 502 metadata unavailable.
- `502 cover_unavailable` means the fetch failed. The server does not fetch that URL
  again for a minute, and concurrent misses share one fetch.
- `404 no cover` means the file is not an image or is over the pixel bound.
- Only a re-encoded JPEG is served, with `ETag` `"community-<size>-<rev>-<hash>"` and
  `private, max-age=86400`.

On the frontend:

- `Capabilities.meta_covers`.
- `client.communityCoverUrl(lib, path, cover_url, { size })`.
- `communityCoverSource` and `useCommunityCover` use the proxy when the flag is on.
  Without it (an older server, or `/server` unreachable), native loads `cover_url`
  directly, and the web player shows the placeholder because its CSP blocks
  third-party images by design.

With metadata on, the server, not listeners' devices, contacts the cover hosts. See
[`/meta/cover`](../server/api/reference.md#get-apiv1librariesidmetacover).

### Mirror mode

Mirror mode (`metadata.mode: mirror`, opt-in; `remote` is the default) makes the seam
tighter.

- Once a day the server downloads audiosilo-meta's data release artifact
  (`meta.sqlite.gz`) into `<data>/meta-mirror/`. The file holds the CC0 core and the
  CC BY-SA community layer.
- It fetches the artifact with audiosilo-meta's public `pkg/release`.
- It answers the same `/api/v1` requests in-process with audiosilo-meta's public
  [`pkg/query`](../meta/overview.md#public-go-packages) (`Open`, `NewHandler`), which
  is metaserve's own handler, byte for byte.
- `internal/meta`'s client is unchanged. The local copy answers while one is ready,
  and `base_url` otherwise (see the full
  [fallback ladder](../server/configuration.md#mirror-mode-metadatamode-mirror)).
- The player is untouched. There is no wire change and no capability change.

Two couplings follow, both part of this seam:

- **The handler's responses are a public API.** A mirror-mode server decodes the
  local answers with the same structs it uses against meta.audiosilo.app. So
  `pkg/query`'s responses change the way metaserve's always have: additively.
- **The artifact schema is a direct coupling.** A mirror-mode server reads whatever
  the newest data release is, routinely an artifact **newer** than its own code. So
  artifact schema changes must stay **additive**: new tables and columns, never a
  renamed or dropped one, and never a changed meaning for an existing column. A newer
  artifact still opens and answers. How the versions are gated and bumped is in
  [the meta data model](../meta/data-model.md#the-compiled-artifact-and-schema-versioning).
  A server picks up `pkg/query` changes only when its `go.mod` moves to a new
  audiosilo-meta tag.

### Contributing back

The server never writes to the community repositories. What an admin shares or
corrects is a Bridge job ([seam 16](#16-the-bridge)). The Bridge files it as a GitHub
issue under the admin's own account:

- When the Bridge uses its Accounts sign-in, it files through the AudioSilo
  Contributions App.
- With a token from its environment or `gh`, it files a plain issue. `route.yml`
  leaves that issue to the routing labels the Bridge set, when they stuck, or to a
  maintainer.

Two meta-side pieces make that a seam:

- The [correction-batch form](../meta/contributing-data.md#the-correction-batch-form):
  `[corrections] ` issues with a fenced, versioned `changes` block, which the Bridge
  writes and meta's `correctBatch` reads.
- [`route.yml`](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app),
  which routes an App-filed issue by its title prefix (`[work] `, `[corrections] `;
  `[characters] ` and `[recaps] ` on the community repository) or holds it
  (`intake:held`).

The title prefixes and the batch's `v: 1` block are the contract between the Bridge
and meta. Two more couplings ride on the corrections:

- How meta's form reads a value (`issueform` `formValue`, with character references
  decoded) is mirrored by the server's `meta.correct` checks and by the console's
  dialog. A change there moves both (see
  [Corrections: `meta.correct`](../bridge/contributions.md#corrections-metacorrect)).
- The server's bounds on a batch (128 KiB of params, the value and evidence lengths)
  must stay within what the Bridge reads (64 KiB as stored, an unknown field refused)
  and what meta takes. Raising one starts with meta and the Bridge.

## 14. Listening in the house and casting

**What couples:** two additive features, each behind its own flag (seam 8).

**Server:** the routes below. Every privacy rule for Listening in the house is the
server's alone.

**Frontend:** mirrored in `types.ts` (`HouseholdSettings`, `HouseListeningRow`,
`HouseListening`, `CastToken`), `client.ts` and `hooks.ts`.

**A change requires:**

- The household rules stay in the server's catalog. A player must never filter
  someone in.
- Any widening of where a cast token is accepted is a security-critical change, with
  allowed and denied tests on the server.

### Listening in the house: the wire

Capability `household`:

- `GET` and `PUT /me/household` (`{ share_listening }`).
- `GET /household/listening` (`{ sharing, listening: [Row] }`).

The shapes are in
[Listening in the house](../server/api/reference.md#listening-in-the-house). Every
privacy rule is the server's (see
[what other people see](../server/auth-and-security.md#listening-in-the-house-what-other-people-see)).
The player only decides what to show of the answer and how often to ask. The client
side is in [Listening in the house](../frontend/listening-in-the-house.md).

### Casting: the wire

Capability `cast`. `POST /cast/token` `{ library_id, path }` answers
`201 { token, expires_at }`. The token is a credential for one book, accepted only as
the `?token=` of that book's cover and stream (see
[Cast tokens as media auth](../server/api/reference.md#cast-tokens-as-media-auth)).
Its lifetime and policy are in [Cast tokens](../server/auth-and-security.md#cast-tokens).

- The web player's CSP admits the Cast Web Sender's three scripts on
  `https://www.gstatic.com` by path in `script-src`, and nothing else.
- The receiver never sees the session token.
- No flag means no Cast button.

The client side, including which address the receiver's URLs use, is in
[Chromecast](../frontend/chromecast.md).

## 15. Household members (profiles and kids mode stay client-side)

**What couples:** household members are server-side, while profiles and kids mode
are client-side.

- A profile (a person on this device), its PIN and its kids mode never reach a server
  (see [Profiles](../frontend/profiles.md)).
- A **household member** (capability `household_members`) is a real account that an
  owner creates from the player. Everything about what it may do is the server's.

**The wire.** All of it is additive. The shapes are in
[Household members](../server/api/reference.md#household-members).

- `/me/household/members` (list, create) and `/{id}` (`PATCH`, `DELETE`),
  `/{id}/session`, `/{id}/pair`, `/{id}/devices` and `/{id}/devices/{device_id}`.
  They are mirrored in `types.ts`, `client.ts` and `hooks.ts` (see
  [State and data](../frontend/state-and-data.md#household-members)).
- The `user` object (`/me` and every session envelope) gains `managed_by`
  (`{ id, username }` or `null`) and `member_kind` (`"kid"`, `"grownup"` or `null`).
- For a member only, the `user` object also gains `display_name`, the name the owner
  typed. The player names a new profile for the account after it.
- The member's access is not on the `user` object. The player can't see it and never
  needs it.
- `/me/devices` rows gain `member_sign_ins`, and
  `DELETE /me/devices/{id}?also_members=1` answers `{ current, members_signed_out }`.
- The admin console's fields and settings stay inside the server repo (see
  [Admin: users](../server/api/reference.md#get-apiv1adminusers)).

**Server rules.** Each has an allowed and a denied test (see
[Auth & security](../server/auth-and-security.md#household-members)).

- What a member may listen to: the owner's access, or the collections the owner
  shares, plus their own grants.
- One level, and never an admin.
- The kid refusals (`403 kid_account`).
- Kids are kept out of share targets and Listening in the house.
- Someone else's member is a `404`, like no such account.
- A disabled member's session and pairing code are `409 member_disabled`.

**Client rules** (see [Household page and members](../frontend/household.md)):

- `addMemberHere` places a member that the owner signs in on this device from the
  Household page. The owner stays the person listening, and the default connection
  doesn't move.
- `member_kind === 'kid'` turns kids mode on by default and allows it with no grown-up
  on the device.
- `managed_by` picks the kids shelf's collections.
- The player never filters a kid's access itself.
- The player reads refusals by `code`, never by the server's message (see
  [Error mapping](../frontend/state-and-data.md#the-api-client-srcapiclientts)). A
  new `code` needs a case in `API_ERROR_CODES` and its words in the player, or the
  player reads it by its status.

**A change requires:**

- Any change to the member rule is security-critical, with allowed and denied tests
  on the server.
- A new member field is the usual wire change in both repos, gated on the flag.

### Household members and old clients

- A shipped player ignores the new `user` fields and sees a member as an ordinary
  account.
- A kid signed in to an old player is still limited by the server.
- An older server has no flag. The player then offers no "Add someone to your
  household", and profiles and kids mode work as before.

## 16. The Bridge

**What couples:** the [Bridge](../bridge/index.md) (`audiosilo-bridge`, public,
AGPL-3.0) is a companion client of the server's wire format, alongside the player.
The server defines the contract, and the Bridge mirrors it by hand in
`internal/link`. A change to the server's `internal/bridge` or `handlers_bridge.go`
is a change in both repos, with a test on each side.

**Server:** defines the contract in `internal/bridge` and `handlers_bridge.go`. The
sub-sections below cover the routes, the `bridge` token kind, the `bridge_jobs`
queue and the `.audiosilo/` files the server reads.

**Bridge:** `internal/link` mirrors the routes and shapes by hand. Its
`internal/link/audiblesync.go` mirrors position sync. The Bridge sends
`X-AudioSilo-Client: AudioSilo Bridge/<version> (<os>)` on every call.

**Frontend:** the player's admin-only generate action and the mirrored types (see
[The player's Bridge surface](#the-players-bridge-surface)).

**A change requires:**

- The server handler and its test.
- The mirrored type in the Bridge's `internal/link` and its test.
- For the generate action, also the console's `admin-ui` and the player's
  `types.ts`, `client.ts` and hooks, with their tests.
- For a new optional heartbeat block, both `accepts` lists.
- CROSS-REPO.md §23.

The token's rules are security-critical, so they need allowed and denied tests on the
server.

### The Bridge pulls

The server never connects to the Bridge. The server calls no route on the Bridge and
dials no Bridge address. The console links to the Bridge's page (`ui_url` from the
heartbeat, `http(s)` only) for the browser to open, and nothing more.

### Pairing and the `bridge` token

**Pairing:**

- The console's `POST /admin/bridge/pair` (a session only) mints a 15-minute code.
  The console's pairing code comes with the server's home address when there is one.
- The Bridge's public `POST /bridge/pair` trades the code for a token of kind
  `bridge`.
- One Bridge per server. Pairing another revokes the first.
- The Bridge keeps the token sealed, never in its config.

**The token kind:**

- The server accepts it only on `/api/v1/bridge/*`, from the header only, and only
  while its admin is an enabled admin.
- Every other route refuses it, media `?token=` included.
- Heartbeats and claims check it again inside their own write.
- A `401` means the server refuses the token. The Bridge stops calling in, says why,
  and retries every 5 minutes. A demoted admin's Bridge comes back when they are
  re-promoted. An unpair or a new pairing revoked it for good.
- A failure to check the token is a `503`, which the Bridge retries.

### The routes the Bridge calls

The shapes are in [The Bridge](../server/api/reference.md#the-bridge) in the API
reference.

| Route | What it does |
|---|---|
| `PUT /bridge/status` | The heartbeat, every 30 s. The answer lists the libraries and `accepts`. |
| `GET /bridge/jobs/next?wait=&kind=` | A long-poll claim, at most 25 s, narrowed to the kinds with a free lane. `204` for none. |
| `PATCH /bridge/jobs/{id}` | Takes `{attempt, state?, progress?, result?, error?}`. The answer's `cancel_requested` asks the Bridge to stop. `409 not_held` when its claim no longer holds the job, a job that no longer exists included. The server cleans free text and never refuses it. |
| `GET /bridge/libraries/{id}/book[?path=]` | An indexed book's files with the sizes the server sees now. A single-file book is its own file. With no path, the first whole book among the library's first five by title. `404 no_book`. With a path, an additive `book` of the book's facts: title, credits split, series and position, ASIN, ISBN, duration and the cached `work_id`. |
| `POST /bridge/rescan {library_id, path, mode?, from?}` | `full` (optionally carrying a Bridge-made move's durable state from `from`), or `attachments` (only the book's `.audiosilo/` files). |

The heartbeat carries an additive `estimates` block. The server reads it leniently:
it ignores an unknown key and drops a bad block, never the heartbeat. A `setup`
block is read the same way. The Bridge sends `setup` only once a reply's `accepts`
lists `setup`, because an older server refuses an unknown heartbeat field.

### The claim floor

`accepts` may also list `claim_min_priority`. It permits an optional signed int32
`min_priority` on the claim.

- The server filters it inside the claim transaction.
- A malformed value is `400 invalid_request`.
- Omitting it keeps the ordinary behavior.

A change in the Bridge's eligible kinds, pairing or capacity cancels its outstanding
claim and reissues it at once. The server releases a lease whose reply was never
delivered without spending an attempt. See
[claims and leases](../bridge/pairing-and-jobs.md#claims-and-leases).

### The `bridge` capability

- `capabilities.bridge` is true only while the last heartbeat is under two minutes
  old.
- `bridge: {version, features}` sits beside `capabilities`. `features` is a list,
  never `null`.
- The server reuses a heartbeat it read for up to 5 s.
- The `bridge` block goes to signed-in callers only. The flag stays public.
- Clients never assume it. A feature the Bridge doesn't advertise is off even when
  the flag is on.
- `features` may also hold `contribute` (the Bridge can file contributions; see
  [the heartbeat](../bridge/pairing-and-jobs.md#the-heartbeat-and-the-capability)),
  which the `contributions` module's flag needs
  ([seam 8](#8-capability-flags-get-apiv1server)).
- `features` may also hold `meta`, when the Bridge files corrections.

### The job model

- The server's `bridge_jobs` row is the intent and the lease. It is path-keyed,
  moves with its book, and goes with its library.
- The Bridge's `server_jobs` row is the execution truth.
- Leases last 2 minutes, and every report renews them.
- A job gets three attempts.
- Kinds are allow-listed twice. The server must know the kind **and** the Bridge must
  have advertised it, else `409 kind_unavailable`.

See [Pairing and jobs](../bridge/pairing-and-jobs.md).

### Library mappings are checked

The Bridge never assumes a mapping. Before it calls a books library mapped, it
compares a known indexed book's file sizes through its mount with the server's. Then
it probes writing. A podcast library instead uses a shared root marker that the
Bridge reads back through the server, even when the library is empty.

The Bridge checks after pairing, when the server's libraries change, every
`mapping.check_minutes` (default 10), and on demand. Each heartbeat carries the last
results. See [Library mappings](../bridge/mappings.md).

### Hidden folders

No content route reaches a path through a dot-folder by name
(`library.ContentPath`). Such a path is never indexed, listed, streamed or served,
and is a `404`. So the Bridge's `.audiosilo/` inside a book can't become a phantom
book or a streamable file.

### The `.audiosilo/` file contract

The Bridge writes `characters.json` and `recaps.json` (audiosilo-meta's
`model.Characters` and `model.Recaps`) and `bridge.json` into a book's folder. For a
single-file book, each name has `<stem>.` before it.

The server indexes them: checked, size-capped, regular files only. It lays them into
`/meta` per request:

- Community content wins per dimension.
- `work.generated` names what came from the files.
- An unmatched book answers `matched: false` with a `work`.
- The CC BY-SA `attribution` never covers them.

A change to the formats touches audiosilo-meta's model, the Bridge's writer and the
server's reader. See [The .audiosilo folder](../bridge/attachments.md).

### The job kinds

| Kind | What it does |
|---|---|
| `sidecars.generate` | Writes characters, recaps and a description into the book's `.audiosilo/` folder. The first job that writes. |
| `sidecars.describe` | Writes a description alone, from the notes a run kept. |
| `chapters.detect` | Finds a chapterless book's chapters, without the agent. |
| `readalong.align` | Writes a read-along map, with no agent. |
| `sidecars.contribute` | Files generated content on GitHub. Writes nothing. |
| `meta.correct` | Files an admin's corrections on GitHub. |
| `audible.poll` | Polls one Audible account. |
| `audible.import` | Backs up one Audible title. |
| `audible.sync` | Syncs listening positions with one Audible account. |

Each kind's rules follow.

### `sidecars.generate`

- The server checks the params `{source, contribute, work_id}` strictly.
- It refuses `409 library_not_writable` for a library that the heartbeat doesn't
  report mapped and writable.
- It refuses `409 cannot_contribute` for `contribute: issue` unless the heartbeat
  says the Bridge can.
- The progress (`step`, `stage`, `eta_seconds`, `cost_usd`, `source`,
  `park {code, hint, retry_at}`) and result shapes are the Bridge's. The server
  stores them opaquely, and the console and the player read them by hand.
- `GET /admin/bridge/estimate` costs a run from the heartbeat's figures.
- The server announces `bridge_job_finished` and `bridge_job_failed` itself, on
  transitions.

See [Characters and recaps](../bridge/generating.md).

### Own-words descriptions

A `sidecars.generate` run also writes `description.json` (audiosilo-meta's
`model.Description`, 200-1500 characters).

- The Bridge writes it from the opening chapters' fact notes only, so it is
  spoiler-free.
- It is local only and is never contributed.

`sidecars.describe` writes one alone from the notes a run kept. Its params are `{}`.
It meets `409 generate_open` while a generate job is open for the book, and a
generate job cancels an open describe job.

`/meta` serves it in its **own** additive field, `work.generated_description: {text}`:

- Never in `community_description`. The shipped 2.0 app shows that one first and
  credits the community, so a generated text there would replace real blurbs on old
  apps.
- Only when the community work has no `community_description`.
- Marked by `work.generated.description`. The three booleans are always sent.
- Kept under `spoilers=hide`.

The player orders About itself: the community description, the book's own, the
work's core one, then the generated one with its mark.

The estimate gains `can_describe` and `has.*.description`. The admin book detail
gains `generated_description`, and the attachments rescan answer gains
`description`. See [The description step](../bridge/generating.md#the-description-step).

### Chapterless books

The Bridge transcribes a single file with no usable chapter markers in windows and
finds its chapters in the narration. It writes them as `.audiosilo/chapters.json`:

- Version 1.
- `files` named relative to the book's folder, with their sizes.
- `chapters` on the whole-book timeline, contiguous, 2 to 2000, with entry k being
  logical position k.

The server stores the file checked (`book_attachments.chapters`, migration `0051`).
It uses it as a chapter source between the community's and the files'
(`chapters_source: "generated"`). It does so only with no admin choice, and only on
the files the chapters were found on.

`chapters.detect` (feature `chapters`, params `{}`) does this without the agent, for
Health's `no_chapters`. `409 generate_open`, `detect_open`, `describe_open` and
`chapters_chosen` keep it apart from the other kinds.

The rescan answer gains `attachments.chapters`, the admin rows `chapter_choice`, and
the admin book detail `generated_chapters_fit`. A change to the file touches the
Bridge's writer and the server's reader. See [Chapterless books](../bridge/chapters.md).

### Read-along maps

`readalong.align` (feature `readalong`, params `{}`) writes, with no agent.

- It lines the book's ebook up with its narration. The ebook is the server's pick,
  the book route's new `book.ebook {path, size}`.
- It writes `.audiosilo/readalong.json` (`audiosilo-readalong/v1`), only when at
  least half the text lined up.
- It is timed on the server's file lengths, the book route's new `files[].duration`.
- `409 no_ebook`, `generate_open` and `detect_open` refuse it.
- A new generate or detect job meets `409 readalong_open`. A generate job cancels a
  parked one.

The estimate gains `kind=readalong.align`, and the rescan answer gains
`attachments.readalong`. A change to the map touches the Bridge's writer, the
server's head checks and the player's reader. See [Read-along](../bridge/readalong.md).

### Setup and contributions

The heartbeat's `setup` block is the Bridge's onboarding checklist: `paired`,
`libraries`, `asr`, `agent`, `budget`, `github`, plus `can_contribute` and
`github_login`. `agent` and `github` are optional. It reaches the console only, as
`setup` on `GET /admin/bridge` (see
[the checklist](../bridge/pairing-and-jobs.md#the-setup-checklist)).

Two kinds belong to the `contributions` module. While the module is off they answer
`404 module_off` and are held in the queue (see
[jobs of a managed module](../bridge/pairing-and-jobs.md#jobs-of-a-managed-module)).

- `sidecars.contribute` takes params `{work_id?, dimensions?}` and writes nothing.
  It meets `409 generate_open`. A new generate job meets `409 contribute_open` while
  one is queued or working, and cancels a parked or held one.
- `meta.correct` takes params
  `{work_id, recording_id?, asin?, isbn?, region?, changes, evidence, source?}`. The
  server refuses `400 not_edited` for a change that isn't the book's admin edit.

The Bridge files both on GitHub ([seam 13](#13-community-metadata-a-three-repo-seam)).
Its GitHub sign-in, and the agent credential it hands to the agent container, live on
its own page and never cross to the server. See
[Contributions](../bridge/contributions.md).

### Audible accounts

The Bridge signs in to Audible (a paste-back PKCE sign-in on its Accounts tab) and
keeps every credential in its vault. The server never talks to Audible.

These Bridge-token routes are **not** behind the module's toggle:

| Route | What it does |
|---|---|
| `GET /bridge/users` | Who an account may be mapped to: enabled adults and admins, never a kid, demo or disabled account. |
| `PUT` and `DELETE /bridge/audible/accounts/{account}` | The mapping. The delete answers `204` whether the account is known or not. |
| `PUT .../titles` | Up to 500 a call under one `poll_id`. The last call is `final`, which marks the rest `gone`. |
| `GET /bridge/libraries/{id}/books` | A books library's books by path, 500 a page, for matching. |
| `PUT /bridge/libraries/{id}/enrichment?path=` | An unambiguous match's ASIN. `409 asin_set` never goes under one. |

`audible.poll` (feature `audible`, params `{account}`, no library) is internal, quiet
and deduped per account. The `audible` module's scheduler queues it every
`poll_hours`, and so does the console's Check now.

The module (`modules.audible.enabled`, off by default):

- Gates the console's `/admin/audible/*` routes (`404 module_off`). The admin
  `DELETE /admin/audible/accounts/{account}` works either way.
- Holds the polls.

A title's match is path-keyed with no FK, and a book's move carries it. The player
doesn't mirror the `audible` flag, because it has no Audible surface yet. See
[Audible](../bridge/audible.md).

### Audible backups

`audible.import` (feature `audible`) is internal and writing, not quiet, and deduped
per account and title.

- The server builds its params: `{account, asin, library_id, dest_path, template}`.
  The Bridge reads them leniently and ignores unknown fields.
- The Bridge reports progress steps `license|download|decrypt|place|rescan|enrich`.
- The result is `{library_id, path, files, bytes, enriched}`, where `path` is the
  book path that `POST /bridge/rescan` answered.
- A failure is `{code, message}` with one of eight codes.
- It uses no new route.
- The server folds a done result into the title's match (`how: "import"`) only for the
  title's own book.

Only new console routes were added (admin, behind the toggle). The Bridge's account
PUT now sets `policy` on create only. See
[Backing up a title](../bridge/audible.md#backing-up-a-title-audibleimport).

### Audible planned destinations

- Each title of the titles PUT gains `planned`
  (`{library_id, path, file, kind, siblings, state, conflict, template}` or null).
  It is where a backup would go, planned by the Bridge during the poll.
- Each title also gains `contested_path` (omitempty), the book a contested title tied
  for.
- `GET /admin/audible/titles` gains `planned` and `contested`
  (`{library_id, path, with: [{asin, title}]}` or null).
- `audible.poll`'s params gain `template` (omitempty).
- Server migration `0065`, Bridge migration `0010` (the device profile).

**Server 2.6.0 and its accompanying new Bridge release must be deployed together for
Audible.** Server 2.5.1 and Bridge 0.5.0 predate this wire format.

- An older Bridge's strict decoder refuses a poll with a placement template.
  `template` is omitted only when `""`.
- An older server's strict decoder refuses the new title fields.
- Older servers also lack the progress feed that position sync needs.

Pairing or a heartbeat alone does not prove compatibility, and there is no separate
version gate on these payloads. Use the actual paired release tags from the release
notes. See [Planned destinations](../bridge/audible.md#planned-destinations).

### Audible position sync

`audible.sync` (feature `audible`) is internal, quiet, deduped per account, and
promoting.

- The server builds its params: `{account, titles: [{asin, library_id, path, runtime_s}]}`,
  strict on both sides, at most 1 MiB.
- The server queues it every 15 minutes for each account whose sync is on, and at
  once on a console change.
- Its failure codes are `audible_refused` and `audible_sign_in` (transient). On
  `audible_refused` the server sets `refused_at` and stops queueing until a Bridge
  PUT or a complete poll.

Two new Bridge-token routes act for the account's person:

- `POST /bridge/audible/accounts/{account}/listening` takes `{sent_at, events}`, the
  Sync v2 event shapes. The server applies them **furthest only**, under device
  `audible:<account>` named `Audible (<label>)`, with token 0 and no sessions or
  stats. Event ids are stable per place, so a resend is a `duplicate`.
- `GET /bridge/progress?account=&since=&limit=` answers `{rows, next, more}`. It is
  keyset on `progress.change_seq` and leaves out the account's own rows.

Both answer `403 sync_off`, `403 user_unavailable` and `404 unknown_account`. The
feed also answers `400 invalid_request`.

- A `preorder` title takes no part in either direction. It is not in the params, it
  is `not_synced` on the listening route, and it is not in the feed. Its release
  offers its book's place again (server `0071`).
- The account's `sync` is the console's now. The Bridge's PUT sends it and the server
  ignores it.
- The `audible:` device id is reserved. `/me/listening/sync` refuses it, and a
  progress PUT saves it as none.
- Server migration `0066`, Bridge `0011`. The heartbeat gains no block.
- The Bridge mirrors it in `internal/link/audiblesync.go`.

See [Position sync](../bridge/audible.md#position-sync-audiblesync-and-the-push-loop).

### The player's Bridge surface

The player's first admin-only UI is gated on all of these:

- `user.role === 'admin'`, never a demo account, a household member or a kid's
  account.
- `capabilities.bridge`.
- `bridge.features` holding `sidecars`.
- `capabilities.metadata`.

Its confirmation holds Generate back while the estimate's `open_job` is a
`chapters.detect` or `sidecars.contribute` job. `Book.generated` makes it ask `/meta`
for a book with no ASIN or ISBN. Its `types.ts` mirrors the job, the estimate,
`BookMetaWork.generated` and `BookMetaWork.generated_description` by hand.

### Bridge seam and old clients

Everything is additive.

- An older server has no Bridge routes and no `bridge` flag. The Bridge's pairing gets
  a `404` and says the server is too old. Shipped players never see either.
- A shipped player ignores a `work` beside `matched: false`. It shows a matched book's
  merged work without the `generated` mark (the owner kept that as built), and it
  ignores `generated_description` entirely.

Setup and contributions:

- An older server sends no `accepts`, so a newer Bridge sends it no `setup`.
- An older Bridge doesn't advertise the new kinds.
- A signed-in player still gets the `bridge` block.

Read-along:

- An older Bridge ignores the book route's `duration` and `ebook`, and never
  advertises `readalong.align`.
- A newer Bridge reads an older server's missing fields as none.

Audible accounts:

- An older Bridge never advertises `audible.poll`.
- An older console ignores the `audible` setup item and module.
- A shipped player ignores the `audible` flag.

Audible backups:

- An older Bridge never advertises `audible.import`, so the server queues nothing for
  it (`kind_unavailable`, and a poll's policy pass queues nothing).
- Its account PUT's `policy` still creates an account as before.

Audible position sync:

- An older Bridge never advertises `audible.sync`, so the server queues none and the
  feed is never read. Its account PUT's `sync` is ignored.
- A shipped player sees Audible's place as any other device's (by its `device_name`).
  One that echoes the row's `audible:` device id in a progress `PUT` saves under none.
- A Bridge with position sync, against an older server, gets no sync queued and a
  `404` from the feed. Its push loop asks again each minute. Deploy the Bridge with the
  server.

## 17. Podcast shows, feeds and client visibility

**What couples:** podcast libraries extend the seam between the server and the
Bridge with episodes on disk, retention, and on-demand fetching with status and
Retry. The player shows podcasts to the players the gate admits (2.2.0 and later;
first released in the 2.4.0 player), including discovery, follow by URL, OPML and
Check for new episodes.

**Server:** the library `kind`, the client gate (`auth.SeesPodcasts`), the podcast
jobs and their scheduling, the storage and retention routes, the on-demand stream
branch, discovery and OPML.

**Bridge:** runs the podcast job kinds, owns `feed.json`, and keeps the show
credentials in its vault.

**Frontend:** mirrors the types, client and hooks by hand (see
[Player views](#podcast-player-views)).

**A change requires:** the shared fixtures `wire-2a.json` (the jobs),
`wire-2b.json` (the fetch status) and `publish-v1.json` (the journal and list) fix
the contract, so a change to one of those shapes changes both repos. A breaking
`feed.json` change bumps its version. See
[Podcasts](../bridge/podcasts.md) and
[Podcasts in the API reference](../server/api/reference.md#podcasts) for exact fields.

### Podcast library kind

- Every library JSON and heartbeat reply includes `kind: books|podcasts`.
- Create defaults to books. Unknown values give `400 invalid_kind`.
- PATCH cannot change it (`400 kind_immutable`).
- Podcast roots cannot overlap any library (`409 root_overlaps`), including when a
  books root is created or moved.

### Podcast capability flags

- `capabilities.podcasts` is always sent. It is false unless
  `modules.podcasts.enabled` is set and an online Bridge offers `podcast` from its
  podcast kinds.
- The Bridge advertises subscribe, poll, fetch and retain in `kinds`, with no new
  heartbeat request field.
- The independent, optional core flag `capabilities.podcast_fetch:true` advertises
  on-demand and status support, even when the Bridge is offline or the module is
  off. Older servers omit it.
- With the module off, the server gates actions, stops the scheduler and holds
  queued jobs. Reads stay core.

### Which clients see podcasts

`auth.SeesPodcasts(Credential.Client)` feeds `catalog.Caller.Podcasts`.

- `AudioSilo Admin` qualifies.
- `AudioSilo` version `dev` qualifies.
- A released player qualifies from `auth.PodcastPlayerMinVersion` = `"2.2.0"`. The
  version is numeric `X.Y.Z`, and a pre-release counts as its base version.
- Players 2.1.x and older, unidentified clients, and API tools without a recognized
  client do not qualify, admins included.

The served `/web` identifies as its `app.json` version, so release the 2.2.0 web
image before the server that bakes it in.

Other visibility rules:

- A whole-list replace (`PUT /me/queue`, `PUT /me/collections/{id}/items`) from a
  caller the gate hides podcasts from keeps the stored episodes that only the gate
  hides (`catalog.GatedScopes`). So an old player can't delete them.
- Media tokens inherit the stored client when no valid request header exists.
- Private-show scopes apply after grants, only for followers matching the show's id.
  The admin catalog remains separate.
- An authorized library with no visible shows returns empty lists.
- Cast tokens do not expose podcasts.

### Books stay separate

Podcast libraries are excluded from cross-library book search and recent, author and
series aggregates, book stats and admin book tools. Podcast `/fs` reads titles from
the index, not from loose audio on disk.

### Podcast actions

- Adults may follow by URL (a whole-library grant) or by visible path, unfollow, and
  check. These sit behind the module's user wrapper, so no kids and no demo.
- The server creates the podcast jobs. The admin enqueue route refuses these kinds.
- A private URL's normalized current or previous hash proves the follow.
- A user may have five open subscribe requests.
- Manual checks are limited to one per 60 seconds when no poll is already open.

### Podcast storage API

Retention `GET`, `PUT` and `DELETE` and episode fetch are
[dedicated routes](../server/api/reference.md#podcast-storage-admin), for an admin
and never a demo account.

- The policy defaults to `{mode:"keep",keep:3,days:7}`. It is keyed by library, show
  path and show id, and is durable across index rebuilds.
- `PUT` requires all fields: mode `keep|on_demand|archive`, keep 1..1000, days 0..365.
- Writes need the module, the exact kind from an online Bridge, and a writable
  mapping. `GET` stays core.
- A valid fetch of a present file returns 200 before the storage checks.
- A new fetch is 202 with an existing or open job state, at priority 20. It forces
  no pin replacement.

### Podcast retention

- **Keep** downloads the newest N listed episodes.
- **Archive** downloads all listed episodes, oldest first, and never deletes.
- **On demand** fetches on play, prepares one ahead in the queue, and runs no
  feed-wide scheduled downloads.

No followers means no policy-scheduled work. Authorized play, Retry and queue
preparation still work. Deletion eligibility (followers finished plus grace,
protections, Keep's window) is in
[retention](../bridge/podcasts.md#retention-policy-and-deletion-authority). Keep is a
window, not a disk quota.

Bridge-only policy and aggregate routes expose all
[aggregate fields](../server/api/reference.md#bridge-podcast-retention), with no
names, ids or positions. A mismatched generation, hash or size is
`409 identity_changed`. Immediately before a journaled move to owned trash,
tombstone and rescan, the Bridge verifies the local bytes and a five-second request
age on its own clock.

### Podcast fetch and retain jobs

- Fetch binds `{show_id,episode_id}` and an indexed episode path. Its dedupe key is
  `podcast.fetch|<library_id>|<path>`, with no URL or credentials.
- Retain binds the show path and id, at priority -20.
- All triggers share one fetch intent, at these priorities: play, Range, download,
  transcode and Retry 100; admin 20; prefetch 10; scheduled -10.
- Promotion takes the maximum and preserves the requester, attempts and progress.
  Running jobs keep their pool.
- Fetch has one ordinary download slot and one reserved interactive slot. Retain is
  light (2). Both are internal, writing and quiet.
- Replacements settle old work.
- Fetch byte progress is int64 with a nullable total. Successful results include
  Fetch, chapters and reused.

The [job shapes](../bridge/podcasts.md#fetch-and-retain-jobs) and the shared
`wire-2a.json` fix the contract.

### Podcast polling and scheduling

- The server schedules. The Bridge returns an adaptive `next_poll_seconds`, which the
  server clamps to 15 minutes through 24 hours.
- HTTP validators and status live on the server.
- The server folds ended jobs idempotently, with a completion wake and a 60-second
  recovery tick.
- `gone` stops automatic checks. Other failures back off.
- Default admin job lists omit polls unless filtered explicitly. Fetch and retain are
  listed.
- Podcast jobs never notify.
- New poll params and results, and feed status, bind the show id. Late or unbound
  results cannot recreate replacement status.
- Fetch backoff is separate from feed state: 30 minutes, doubling to 24 hours. The
  per-pass limits are in [polling](../bridge/podcasts.md#polling-and-outcomes).
- Fetch and retain never change poll validators or secret flags.

### Podcast files

- The Bridge-owned `feed.json` v1 is the shared format. The server indexes episodes
  even without audio.
- Paths are assigned once. `fetch` records a committed generation or a tombstone,
  with an optional codec.
- Readers ignore unknown fields. Breaking format changes bump the version.
- At the cap, removed never-fetched episodes may be dropped, oldest-removed first.
- Manually renaming a show folder breaks paths.

### Podcast publication and media

The commit order of journal, audio, CHAP and Fetch keeps new bytes behind
`<stem>.publish.json` until they are complete. Recovery reuses the same generation.

- The first fetch is g1. An identical refetch keeps g. A changed hash increments it
  and latches `timeline_changed`.
- Episode and `Book.episode` expose the optional generation, hash and flag, even after
  deletion. Progress and bookmarks stay unchanged.
- One validated descriptor serves each request.
- The direct ETag is `"podcast-g<generation>-<sha256>"`, with private revalidation
  and byte ranges. Transformed output has no source ETag.
- Missing media triggers shared work, never publisher pass-through or partial
  playback.

### On-demand fetch, status and Retry

After the auth, client and private scope, and exact-path checks, the stream branch for
an absent file has at most two seconds for the DB, the enqueue, promotion and the
wait.

- When the file is ready, the server serves normal media.
- Otherwise it answers `503` with `Retry-After: 2`, `Cache-Control: no-store` and
  `{error,code,fetch:Status}`. The codes are `podcast_fetching`,
  `podcast_fetch_unavailable` and `podcast_fetch_failed`.
- A disconnect or timeout never cancels shared work.

The routes:

- Core, authenticated `GET /libraries/{id}/podcasts/fetch?path=` only observes.
- `POST` `{path}` (never a demo account) is an explicit Retry. It answers 202 with the
  same `{fetch:Status}`, or 200 if ready.
- Kids with read scope qualify.

Rules for new work:

- New work needs the module, the exact kind from an online Bridge, and a writable
  mapping. Ready files work with the Bridge offline or the module off.
- Existing intents may still promote.
- Ordinary streams honor the failure cooldown. `POST` bypasses it, but never dedupe or
  a present pin.
- Identity races remain `409 identity_changed`.

### The fetch status on episode lists

Episode lists and `Book.episode` add an optional `fetch:Status`, batched per page.
Every key inside a Status is required, nullable ones included. It carries no
requester, params or raw progress text. The
[exact shapes](../server/api/reference.md#podcast-fetch-status-and-retry) and the
shared `wire-2b.json` fix the protocol.

### The listener's fetch cap

A non-admin creator may have five open fetch intents. A refused stream creation is
`503 podcast_fetch_unavailable` with `fetch.error.code:"fetch_limit"`. A `POST` Retry
is `409 fetch_limit`. See the
[rules](../server/api/reference.md#podcast-fetch-status-and-retry).

### Podcast prefetch

- The server prefetches at most one next visible podcast from the actual caller's
  queue, per user and current item, skipping books.
- If the current item is absent from the queue, it takes the first visible podcast
  other than the current one.
- A play-fetch or a ready stream starts a bounded background look. Successful queue
  changes can reconsider during the current stream or fetch.
- Global dedupe shares work, and a removal never cancels it.
- A new prefetch is priority 10. A later play promotes the same row to 100.

### Podcast claims and capacity

Once the [claim floor](#16-the-bridge) is negotiated, the Bridge's reserved
interactive slot claims `kind=podcast.fetch&min_priority=100&wait=25` and never takes
background work. The ordinary download lane drops to 1, which keeps two enclosure
downloads in total. An older server gets two ordinary download slots and no reserved
claim.

### Podcast player views

The player mirrors the
[types, client and hooks](../bridge/podcasts.md#player-phase-2d-1) by hand. It ships
the shows, show and episode pages, following, Home's New episodes, and on-demand play
through one controller:

- It probes `/stream` once.
- It polls only queued or fetching episodes, every `max(2, Retry-After)` seconds.
- It offers an explicit Retry for a terminal failure.
- At ready, it refreshes the item and chapters, and marks the episode lists stale.

It preserves generation warnings without rescaling state, and recognizes
`chapters_source:id3_chap`. There are no download, cast or kids-mode podcasts, and no
server route changed. See [Frontend podcasts](../frontend/podcasts.md).

### Podcast discovery and OPML

This touches the server and docs only. The Bridge and the player are unchanged.

`GET /podcasts/discovery/providers|search|artwork` has the adult, non-demo, module
and client gates. Artwork takes a media `?token=`.

- It searches iTunes by default, or Podcast Index when picked and configured. Podcast
  Index takes a server env key pair only, with no fallback and no merged ranking.
- Results are public data with relative, proxied artwork.
- A result is followed through the existing `POST /podcasts/follow {library_id, feed_url}`.

`POST /podcasts/opml/import?library_id=` takes the raw XML.

- It validates the whole document before any effect, and answers per-row decisions.
- It makes at most five new subscribe requests per upload, within the five-open cap.
  The rest are `limited`, for a re-upload wave.

`GET /podcasts/opml/export` is core, so it works with the module off too.

- It writes only the caller's followed public shows, never a private one.
- It counts omissions in `X-OPML-Exported`, `X-OPML-Omitted-Private` and
  `X-OPML-Omitted-Unavailable`.

An open subscribe is reused only at the same privacy (`409 privacy_conflict`). The
optional flags are `podcast_discovery` and `podcast_opml`. The exact shapes and the
player's rules (search on submit, artwork through the proxy only, the import waves,
export with the `Authorization` header) are in
[Player: discovery and OPML](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2)
and [Podcast discovery](../server/api/reference.md#podcast-discovery). For an allowed
origin, CORS exposes `Retry-After` and the `X-OPML-*` counts and allows `Range`
([CORS](../server/api/index.md#cors)).

### Podcast CHAP chapters

The [sidecar](../bridge/attachments.md#podcast-chap-attachments) is a version-1,
stem-prefixed `chapters.json` using `from:id3_chap`, with a Fetch timestamp and one
matching basename, size and duration.

- There is no ASR, agent or generated flag.
- The server consumes valid times directly and returns the optional
  `chapters_source:id3_chap`.
- Invalid lists, and lists of 0 or 1 chapters, install the audio without CHAP.
- The shared `publish-v1.json` fixes the journal and list.

### Podcast mapping and rescan

- `.audiosilo/library.json` v1 holds `{library_id,nonce}`.
- `GET /bridge/libraries/{id}/marker` returns the matching nonce. It reads a regular
  file only, at most 4 KiB, with no marker-directory symlink.
- A podcast sample-book lookup without a path is `404 no_book`.
- A podcast `POST /bridge/rescan` indexes a show, or the show of an indexed episode.
  It refuses attachments mode and `from`.

### Podcast secrets and HTTP

Feed URLs stay out of private files, persisted job params, listings and logs.

- The server holds the pending credential in memory and injects it into the claim
  only. A restart before the claim is `request_expired`.
- The Bridge seals it before local claim storage, and keeps the show credential in
  its vault.
- `feed_secret_missing` is repaired by following the URL again.

The HTTP rules for feed, artwork and audio:

- The Bridge checks all DNS results and every dial and redirect, with no proxy.
- It strips source credentials from cross-origin requests.
- Private networks require an explicit Bridge `podcasts.allow_networks`.
- Audio uses an identity GET and no HEAD, with an independent 1024 MiB cap (1..4096)
  and at most three attempts.
- A proven resume requires an exact 206 range, total and strong ETag. A 200 restarts
  from zero.
- Checkpoints omit URLs and seal validators.
- Private enclosure resolution is a fresh, bounded feed read, with no merge. URLs stay
  in memory.

## 18. The ebook reader

**What couples:** the reader (capability `ebooks`) reads a book's EPUB, keeps a
reading place, and loads a reader document the server serves. It is all additive. An
older client ignores the field, and an older server has no flag, so the player
offers no Read. The apps and the ebook in downloads needed no server change.
Read-along maps (capability `readalong`) build on it, with the player following the
narration in the text (server and player 2.6.0).

**Server:**

- Every `Book` carries `ebook: {path, size}` when the scan found one (`library.BookEbook`).
- `GET /libraries/{id}/ebook` serves the bytes, with header auth only.
- `GET` and `PUT /libraries/{id}/reading-progress` keep the place.
- `/web/reader.html` is served under `readerCSP`.
- `Book.readalong` on `/item` and `GET /libraries/{id}/readalong` serve a read-along
  map.

**Frontend:**

- `Book.ebook?: BookEbook` in `types.ts`.
- `client.ebook()`, `readingProgress()` and `saveReadingProgress()`, read through
  `useReadingPlace`.
- `public/reader.html` for the web, and `reader-html.native.ts` in the apps.

**A change requires:**

- A new field on the place, or a change to the conflict rule, changes both repos. It
  is the same rule listening sync uses ([seam 19](#19-listening-sync-sync-v2)).
- The reader document's policy and the player's route names are coupled.
  `/web/reader*` is the document, so the player never has a `/reader` route.
- Any URL credential for the ebook is a security-critical change, with allowed and
  denied tests on the server.

### The book's ebook

Every `Book` the server returns carries `ebook: {path, size}` when the scan found one
readable `.epub` beside its audio, and omits it otherwise. The rule is the Bridge's
own, `library.BookEbook`:

- One `.epub` in a folder book's folder. Several count as none.
- `<stem>.epub` beside a single-file book.

See [the scan rule](../server/scanner.md#a-books-ebook). The player mirrors it as
`Book.ebook?: BookEbook` in `types.ts`. Its `path` is for display only.

### The ebook bytes

`GET /libraries/{id}/ebook?path=<the book's path>` takes the `Authorization` header
only. It never takes `?token=` or a URL token of any kind (see
[`GET /libraries/{id}/ebook`](../server/api/reference.md#get-apiv1librariesidebook)).

- The web player's `client.ebook()` fetches it and posts the bytes to the reader.
  Nothing ever holds a URL that carries a credential.
- The apps download it with the header into a local file, and post it to the reader
  in base64 chunks (see [the app host](../frontend/reader.md#the-app-host)).

### The reading place

`GET` and `PUT /libraries/{id}/reading-progress?path=` are keyed on the **book's**
path, under Sync v2's rule:

- A save carries `base_version`.
- A diverged save keeps the further place and answers the other as `other_place`
  (see [the conflict rule](../server/api/reference.md#the-conflict-rule-sync-v2)).
- `device_name` is the server's, taken from the saving token.

The player mirrors it as `ReadingProgress`, `ReadingProgressInput`,
`ReadingProgressSaved`, `OtherReadingPlace` and the client's `readingProgress()` and
`saveReadingProgress()`, read through `useReadingPlace`. The player's queue sends the
last version it acknowledged (see
[the reading place](../frontend/reader.md#the-reading-place)).

Listening sync reuses the rule for listening progress, and persists its other place
on the row ([seam 19](#19-listening-sync-sync-v2)).

### The reader document

- The frontend builds `public/reader.html` (vendored foliate-js, one inline script).
- The web export ships it as `reader.html`.
- The server serves it at `/web/reader.html` under `readerCSP`, not the player's
  `htmlCSP`. `readerCSP` holds the hash of that script, computed at serve time,
  `connect-src 'none'`, `frame-ancestors 'self'` and
  `X-Frame-Options: SAMEORIGIN`.
- The apps' variant of the document is bundled in the app (`reader-html.native.ts`,
  the same CSP) and never fetched from the server.
- The host-reader `postMessage` protocol is the frontend's alone (see
  [the protocol](../frontend/reader.md#the-protocol)).
- The player's service worker (`public/sw.js`) must never answer the document with
  the app shell. That would boot the whole player inside the reader's frame.

### Read-along maps

A Bridge's `readalong.align` job ([seam 16](#16-the-bridge)) writes the book's
`.audiosilo/readalong.json` (see
[the format](../bridge/readalong.md#the-map-audiosilo-readalongv1)). It holds:

- Sentence spans as EPUB CFIs that match foliate's `epubcfi.js` (UTF-16 offsets),
  with whole-book `start` and `end` seconds.
- The ebook's sha256.
- The audio files it was made from, book-relative.

The server:

- Stores only the checked head (migration `0058`).
- Hashes the ebook only for a book with a map.
- Answers `Book.readalong` on `/item`, never on a list row:
  `{state: "ready", coverage, generated_at}` or `{state: "stale", reason}`
  (`ebook_changed`, `audio_changed`).
- Serves `GET /libraries/{id}/readalong?path=` with header auth only, as `/ebook`. It
  re-checks the file against the book on every request, and answers
  `404 no_readalong` or `409 readalong_stale` (see
  [`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong)).

The player shows its Text panel only for a `ready` map of a book it can read.

## 19. Listening sync (Sync v2)

**What couples:** with capability `listening_sync`, a player records listening as
**events**: a span of playing, a finish, an unfinish. Each event has its own id and
waits in a durable per-connection outbox. The player posts them to
[`POST /me/listening/sync`](../server/api/reference.md#post-apiv1melisteningsync).
The server derives progress, listening sessions and history from them, and answers
a status per event. All of it is additive. The workspace's CROSS-REPO.md §25 is the
full seam.

**Server:**

- `internal/api/handlers_listening_sync.go`.
- `internal/catalog/listening_sync.go` (`SyncListening`).
- Migration `0061` (`listening_events`, the progress columns).
- `PruneListeningEvents` in the launcher's retention.
- The legacy `PUT` is logged as a `put` event (`SaveProgressFrom`).

**Frontend** (see [Listening sync: the outbox](../frontend/offline.md#listening-sync-the-outbox)):

- `src/playback/listening-outbox.ts`, the outbox and sending.
- `listening-sync.ts`, the triggers.
- The spans in `store.ts`.
- `ack_version` in `progress-sync.ts`.
- `offerOf` in `place-reconcile.ts`.
- `src/components/book/listening-offer.tsx`.
- `src/components/account/listening-sync-card.tsx`.

**A change requires:**

- A new event field or status changes both repos. The server decodes events
  strictly, so an unknown field makes that event `rejected` `invalid`. Gate a new
  field on a flag.
- A change to the cadence, the ack rule, the backstop or the offer thresholds is a
  change to the conflict model on both sides.

### Listening sync: the wire

- The request carries `device_id`, `sent_at` or `clock_offset`, and 0-500 events.
- The per-event statuses are `applied`, `duplicate`, `diverged` (with `kept` and
  `other_place`), `not_applied` (with `older` or `resume_behind`), and `rejected`
  (with its reason).
- The answer carries `progress` rows.
- The player mirrors these by hand in `types.ts` (`ListeningSyncRequest`,
  `ListeningEvent`, `ListeningSyncResult`, `ListeningSyncResponse`) and in
  `client.syncListening(body, {keepalive})`.
- Every progress response gains `device_name` and `other_place` (`Progress`,
  `ListeningOtherPlace`), both omitempty.

### The ack rule

Each span carries `base_version`, the progress version the device last acknowledged
for the book. The device keeps it in its local mirror as `ack_version`, and reads it
when the span closes.

The server resolves the place by
[the conflict rule](../server/api/reference.md#the-conflict-rule-sync-v2). An event
made without seeing the stored row is `diverged`. The server keeps the further place
and offers the other.

When the player acknowledges a row is listed in
[the mirror's Sync v2 fields](../frontend/state-and-data.md#progress-sync-srcplaybackprogress-syncts).
Changing when the player acknowledges changes what the server keeps, so both sides
change together.

### The backstop

A `resume` or `continue` span that ends more than 60 s before an unfinished stored
place is `resume_behind`, so a cold start never pulls a book back. The player's
`start` reasons (`moved_back`, `jump`, `restart` for a deliberate move) are what let
a move back apply.

### The offered place

The server persists a diverged event's lost place on the row (`other_place`). So a
device that never saw that answer still offers it.

- The player's `offerOf` decides when to show it: another device's place, more than
  30 s away, not answered yet.
- The player shows it as a Jump or Stay toast, and as the book page's "Play from
  there".
- Answering acknowledges the row.
- The server clears the offer on the first span of that device that it applies on a
  version at or after the offer's (`other_version`). When the server kept the stored
  row, that is its next version, so the span after the answer's first one.

### File places

Each end of a span may carry its audio file and the seconds into it. The server
places it on the book's current file order. So listening on a download with an older
order lands in the same file ([seam 6](#6-the-chapter--whole-book-timeline-model)).

### Sessions and history

On this path the player stops its periodic `PUT` loop and its `POST /history`. The
server builds both from the spans, at their clock-corrected device times.

The player's online cut keeps live sessions and Listening in the house working. It
sends `continue` spans every 15 s, or every 60 s with the app in the background or
the book downloaded (see
[the pace](../frontend/playback.md#the-periodic-saves-pace)). The server reads them
against its `livePlaying` and `SessionGap` (see
[Listening sessions](../server/data-model.md#listening-sessions-how-they-are-derived)
in the data model). At the 60 s pace a session can read as paused for a moment.

### Rollback to the legacy save

A `404` or `405` on the route, confirmed by the server's own `/server` (no flag),
turns the outbox into one legacy `PUT` per book. The connection goes back on the
`PUT` path.

### The gate

The player takes the events path on the flag that the connection's server last
answered, kept across launches. It takes it while the flag is unknown too, for an
offline cold launch on a connection whose answer it never kept. The rollback covers
an older server. Only `false` takes the `PUT` path.

### Batch size

A body over 1 MiB is `413` code `too_large`. Older servers answered it with a `400`.
The player halves its chunk on a `413` and resends one event at a time on a `400`, so
both reach it.

### Listening sync and old clients

- A shipped player keeps `PUT` and `POST /history`, which behave exactly as before.
  The server only logs the `PUT`, and its answer gains the two omitempty fields.
- A new player on an older server sees no flag and does the same (see
  [The gate](#the-gate)).

## The wire-change checklist

Every change to the wire format follows the same shape. The worked example in
CROSS-REPO.md is the listening-history feature. The step-by-step checklist, with
that example file by file, is in
[Landing a cross-repo change](../contributing/cross-repo-changes.md#the-wire-change-checklist).
