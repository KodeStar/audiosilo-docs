---
title: Cross-repo contract
description: "Every seam where changing one AudioSilo repo forces a change in another - a readable digest of the workspace CROSS-REPO.md."
---

The server defines the JSON/HTTP contract; the frontend and the
[Bridge](../bridge/index.md) mirror it **by hand** (no codegen). This page is a tour of every seam - every place where a
change in one repo forces a change (or a deliberate decision) in another.

:::info[This page is the tour, not the source]
The **normative** contract is `~/dev/audiosilo/CROSS-REPO.md` in the workspace
root. When a seam changes, **update CROSS-REPO.md first**, in the same logical
change as the code - then bring this page in line. If this page and CROSS-REPO.md
ever disagree, CROSS-REPO.md wins.
:::

Canonical reference points on each side of the main seam:

- Server route table: `internal/api/api.go`
- Frontend client (mirrors it 1:1): `src/api/client.ts`
- Frontend wire types: `src/api/types.ts`
- The Bridge's mirrored routes: `internal/link` (in audiosilo-bridge, private)

## 1. Path is the identity - `(library_id, rel_path)`

**What couples:** the deepest shared invariant - content is addressed by
`(library_id, rel_path)` with the path in a `?path=` query param, never by DB id
(see [Invariants §1](invariants.md#1-path-is-the-identity)).

**Server:** `catalog.GetBookByPath` resolves `(library, path)` → book (indexing
on demand); `library.SafeJoin` guards every user-derived filesystem access;
durable user state is path-keyed with no FK to `books`.
**Frontend:** every content call in `src/api/client.ts` passes `?path=`; helpers
in `src/lib/paths.ts`; client state persists keyed by `(library_id, path)`. From
2.4.1 the book route given a track file or a disc folder inside a book (which
`/item` resolves to the book above it) moves to the book's own `rel_path` before
it renders (`useCanonicalBookPath`), so the page asks for progress, plays and
casts by the book path only. The server keys progress the same way for any client
(#199): `GET`/`PUT`/`PATCH /libraries/{id}/progress` given a book's own path or one
of its track files read and write the book's row (`api.progressPath`); any other
progress path keeps its key, and other path-keyed user state is not re-keyed.
`POST /cast/token` grants the book's path, resolved as the media routes resolve a
part path (a disc folder too) (see
[the progress path](../server/api/reference.md#the-progress-path)).

**Folders not indexed yet.** `/fs` marks a folder the scanner would read as a book
that the index doesn't hold yet `pending_book: true` (#193; optional, no
capability: an older player ignores it). The player's `FsEntry` mirrors it, and a
pending row opens the book route like an `is_book` folder; the book screen's read
(`/item`) indexes it on demand
([`GET /libraries/{id}/fs`](../server/api/reference.md#get-apiv1librariesidfs)).

**A change requires:** touching path semantics (normalization, casing, what a
"book path" vs a "file path" means) means changing both sides at once, **plus**
the move-tracking fingerprint logic - and re-checking seam 6 (a track URL must
stay a real file path).

## 2. JSON envelopes (hand-mirrored, no codegen)

**What couples:** every response shape. Auth returns `{ token, user }`; `/me`
returns the user directly; lists are wrapped (`{ libraries }`,
`{ books, next_cursor }`, `{ progress }`, `{ bookmarks }`, `{ notes }`,
`{ history }`, `{ favourites }`; the all-books `/me/bookmarks`, `/me/notes` and
`/me/history` add an optional `next_cursor`); chapters return `{ chapters, files, duration }`;
errors are `{ error }`. The `user` object carries `has_password`/`has_recovery`,
which drive the frontend's sign-out warning.

**Server:** `internal/api/handlers_*.go` define the JSON.
**Frontend:** `src/api/types.ts` re-declares the shapes; `src/api/client.ts`
unwraps the envelopes (errors become `ApiError(status, error)`); `src/api/hooks.ts`
exposes React Query hooks.

**A change requires:** the full [wire-change checklist](#the-wire-change-checklist)
- a field rename touches the server and every client that reads that shape.

**Admin metadata edits don't move the player wire.** The book JSON's metadata
fields carry the *effective* values (scan, then enrichment, then any admin
override), so a player simply receives the edited title/author/etc. with no new
field to mirror. Of the columns the edits introduced, `published` rides on every
player book and `description` on `GET /libraries/{id}/item` only (it can be long,
so list pages leave it out); `has_cover`, the scanned values and per-file codec stay
off the player's book JSON (`json:"-"` on `catalog.Book`) and surface only through
the admin-only catalog API (`/api/v1/admin/books` and friends), which the admin
console in the server repo consumes.

**More book metadata, and genres and tags.** Every `Book` (list, search, recent,
`/item` and `/next` alike) also carries `subtitle`, `publisher`, `language`,
`abridged` (a bool, **absent while unknown**, never read as unabridged) and
`genres` / `tags` (string lists), all `omitempty`; `GET /libraries/{id}/books`
takes `genre=` and `tag=` (one value each, case-insensitive, both narrowing;
`catalog.labelFilters`), and search matches genres and tags. No capability: an
older server sends none of the fields and ignores the params, so the player shows
its Library genre and tag filters (`books/label-filter.tsx`, computed on the device
from the loaded books, in the URL as `genre=` / `tag=`) only when a loaded book has
a label, and its book page shows the `subtitle` under the title and the labels as
chips in the About card (`openLabelBooks`) only when they are sent. The player
mirrors the fields in `types.ts` `Book` and the params in `client.ts`
`BookListQuery`. The library export (`GET /admin/libraries/{id}/export`, consumed
by the meta site) gains five of them, plus `published` and `series_list`, with
its `version` still `1` (the site's parser reads subtitle, publisher, language and
abridged and ignores the rest). The default export still carries no path and no
tag: `?include=paths,tags,description` and `?copies=separate` (one row per copy
instead of one per book) are opt-in, for the admin's own scripts. See the
[export reference](../server/api/reference.md#get-apiv1adminlibrariesidexport)
for the options and the [book reference](../server/api/reference.md#get-apiv1librariesidbooks)
for the field sources and rules.

**Player-redesign data API (Phase 1a).** Additive shapes the frontend mirrors in
`types.ts`/`client.ts`/`hooks.ts`, each behind a capability flag (seam 8), read by
the browse screens and Home and by the player (the cover wash, the end of a book):
every `Book` gains `published`, `cover_color` (`{bg,
accent?, on_accent?}`, sent only while it matches the current art) and
`cover_version` (a hash of the book's cover art identity, a cache buster rather than
a content hash); `GET /libraries/{id}/authors`,
`/narrators` (`{ authors|narrators, unknown }`, normalised by the client to
`PeopleList { people, unknown }`) and `/series` (`{ series }`) are scope-filtered
browse lists, and `/books` takes `narrator=` (`useLibraryBooks`); added after
Phase 1a, `GET /libraries/{id}/series/books?name=A&name=B` (`series_books`) answers
`{ series: [{ name, books, next_cursor? }] }` (`SeriesBooks`), each entry exactly
the first page of `/books?series=<name>&memberships=1` (`client.seriesBooksPage`
batches the Series cards on screen into it); `GET
/libraries/{id}/next` answers `{ source, next?, book?, work? }` (`NextBook`, seam
14). The share-scope SQL behind all of these (`pathFilterSQL`) is a case-sensitive
byte-range prefix, matching `Scope.Allows` exactly.

**Player-redesign user state (Phase 1b).** The listener's own state, mirrored the
same way and gated per feature (seam 8), read by Up next, collections, the book
menu, Home, the end credits and the You hub (Your listening, Year in listening, the Account page's devices): up next
(`/me/queue`, `{ queue }`), collections shared read-only with named users
(`/me/collections/**`, `{ collections }` / `{ collection, items }`, and
`/me/share-targets`, `{ users }`), ratings (`/libraries/{id}/rating`,
`{ rating }`, and `/me/ratings`), the caller's own progress edit
(`PATCH /libraries/{id}/progress`, mark finished or unfinished, edit the dates)
with `started_at` / `finished_at` on every progress response, personal stats
(`/me/stats`, `{ stats }`; `/me/listening`; `/me/goal`, a books-per-year goal)
and the caller's devices (`/me/devices`). List entries are `{ library_id, path }`
book references (seam 1) carrying an optional list-shape `book`; every list is
filtered by the caller's current access, and an id that isn't the caller's is a
`404`. Shapes and status codes are in the
[reference](../server/api/reference.md#up-next-collections-and-ratings); the
security rules in
[Auth & security](../server/auth-and-security.md#the-listeners-own-state-me).

**Bookmark labels, edits and the lists across books.** Gated by `annotations`
(seam 8): every bookmark carries `label`, which `POST .../bookmarks` accepts; the
owner edits a row with `PATCH /bookmarks/{id}` and `PATCH /notes/{id}`, each
answering the bare row; `GET /me/bookmarks` (`{ bookmarks, next_cursor? }`) and
`/me/notes` (`{ notes, next_cursor? }`) list the caller's rows across books, and
`/me/history` pages on the same `cursor` with a `book?` per row. Shapes, bounds and
status codes are in the [reference](../server/api/reference.md#patch-apiv1bookmarksid),
the security rules in
[Auth & security](../server/auth-and-security.md#the-listeners-own-state-me), and the
client side in [State & data](../frontend/state-and-data.md#bookmarks-notes-and-the-journal).

## 3. Media auth rides in the URL - `?token=`

**What couples:** browsers can't set an `Authorization` header on
`<img>`/`<audio>`, so cover and stream GETs accept the session token as a
`?token=` query param on every platform.

**Server:** `internal/api/middleware.go` - only the cover and stream routes
(`requireBookMediaAuth`, which also takes a cast token), the two community cover
routes (`/meta/cover` and `/me/upcoming/cover`, `requireMediaAuth`) and the calendar
feed (`/me/upcoming/releases.ics`, `requireFeedAuth`: a `feed` token only) call
`bearerToken(r, true)`, all through `mediaAuth`; all other routes are
header-only (`bearerToken(r, false)`), so tokens never ride the query string where
they could leak into access logs or Referer headers.
**Frontend:** `client.ts` `mediaTokenQuery()` → `coverUrl()`/`streamUrl()`. Native
also sends the header (belt-and-braces); web relies solely on the query param (a web
cover is a plain `<img>`, `CoverImage`, which can't send one).

**Cover thumbnails** ride the same path: `GET /libraries/{id}/cover?size=160|320|640`
(capability `cover_sizes`) is a JPEG of the same art with an `ETag` of size + the
server's thumbnail revision (`media.ThumbnailRev`) + art version
(`"thumb-<size>-<rev>-<hash>"`) and `Cache-Control: private, no-cache` (custom
cover) or `private, max-age=86400` (file art); any other `size` is a `400`, and a
thumbnail that can't be made is a `404` the client answers by falling back to the
full-art URL. Clients add the book's `cover_version` as `v=` purely as a cache buster:
`coverUrl(lib, path, { size, version })`. From 2.5.1 the server takes `size=96` too
(the sizes are shared with `POST /admin/covers`, where the admin console asks for `96`
for its table rows); the player never sends it, since an older server answers it `400`
([reference](../server/api/reference.md#get-apiv1librariesidcover)).

**Community covers** (capability `meta_covers`) are the other media-auth image
route: `GET /libraries/{id}/meta/cover?path=&url=&size=160|320|640` (`96` too from
2.5.1) is a JPEG thumbnail of a community `cover_url` that the server fetched, so the web player,
whose CSP stays `img-src 'self' data: blob:`, never contacts a cover host. Details
in [§13](#13-community-metadata-a-three-repo-seam).

**Upcoming covers** (capability `upcoming_covers`): `GET
/me/upcoming/cover?work=&size=` is the same kind of thumbnail for an upcoming
release, served only when the caller's own upcoming list hands out that work's cover
([reference](../server/api/reference.md#get-apiv1meupcomingcover)). The player builds
it with `client.upcomingCoverUrl` (media token, like every cover).

**The calendar feed** (capability `upcoming_calendar`) is the one `?token=` that is
not a session: `GET /me/upcoming/releases.ics?token=<secret>` takes a token of kind
`feed` and no other kind, and a feed token is refused everywhere else, so the link a
listener pastes into a calendar app reads their upcoming releases and nothing more.
The server answers it as a server-relative `path` (`POST /me/upcoming/calendar`); the
player puts it on the server's away address (else the address in use) and keeps the
full URL in its secure store, like a session token
([reference](../server/api/reference.md#the-calendar-feed),
[Calendar feed tokens](../server/auth-and-security.md#calendar-feed-tokens)).

**Cast tokens** (capability `cast`) ride the same `?token=`, on a book's cover and
stream only: a player casting to a Chromecast mints one for the book
(`POST /cast/token`) and builds the receiver's URLs with it, never with its session
token. Details in [§14](#14-listening-in-the-house-and-casting).

**Not the ebook** (capability `ebooks`): `GET /libraries/{id}/ebook` is header auth
only (`requireAuth`): it never reads `?token=`, refuses a cast token, and there is no
URL token kind for it. The web player fetches the bytes with the `Authorization`
header (`client.ebook`) and posts them to the reader frame. A read-along map
(`GET /libraries/{id}/readalong`, capability `readalong`) follows the same rule.
Details in [§18](#18-the-ebook-reader).

**A change requires:** do **not** "tighten" the server to reject query-param
tokens on media routes without first removing the web player's dependency on
them - the web player cannot authenticate media any other way (and a Cast
receiver has no other way either).

## 4. Audio `Content-Type` must be real (byte-sniffed)

**What couples:** iOS AVPlayer rejects audio served as `application/octet-stream`
under `nosniff` (error `-12847`), so the served MIME type must be genuinely
correct.

**Server:** `internal/media/media.go` `ServeFile` sniffs magic bytes - `ftyp` →
`audio/mp4`, ID3/MPEG-sync → `audio/mpeg`, ADTS → `audio/aac`, plus
`fLaC`/`OggS`/`RIFF`/`WAVE` - falling back to the extension.
**Frontend:** assumes a correct `Content-Type`; there is deliberately no client
workaround.

**A change requires:** any change to how audio is served (new container support,
a proxy in front) must preserve true audio MIME types, validated on an iOS device.

## 5. Transcode negotiation: `direct_playable` and `?transcode=1`

**What couples:** whether a file needs server-side transcoding to play in a given
client.

**Server:** the scanner records each book's `codec` (ffprobe `codec_name`,
migration `0008_book_codec`); `item`/`chapters` expose `direct_playable`,
meaning **plays in browsers as the server serves it**: `Book.PlaysInBrowsers`
(`media.DirectPlayable`; from 2.4.0 the container counts too) or, while ffmpeg
is configured, `Book.PlaysRemuxed`. With ffmpeg an MP3-in-Matroska `.mka` is
served at the same stream URL as MP3 (a cached lossless remux, `?original=1`
for the stored bytes; see
[Remuxing Matroska](../server/media.md#remuxing-matroska-mediaremuxer)), so it
streams in every client, shipped native builds included, and is `true`. An
`.mka` holding another codec stays `false`, so the web player transcodes it; the
iOS app can't play it, and the Android app plays it only where Media3 decodes
the codec inside.

`GET .../stream?path=…&transcode=1` pipes through ffmpeg to MP3
(`media.Transcode`), with `&t=<seconds>` to start mid-file (transcoded output
isn't byte-seekable). All gated by the `--ffmpeg` flag and reflected in the
`transcode` capability (seam 8); the remux has no flag of its own.
**Frontend:** `Book.direct_playable`/`codec` and
`ChaptersResponse.direct_playable`/`codec` are mirrored in `types.ts`, and
`client.ts` `streamUrl(…, { transcode, t })` builds a transcoded stream URL. The
**web player negotiates it** (`src/playback/transcode.ts`): on web, a book whose
`direct_playable` is explicitly `false` streams with `?transcode=1` when its
server's `transcode` capability is `true`; the web engine re-requests with a new
`&t=` on every seek and keeps positions track-absolute, the book page says the
audio is converted for this browser, and downloading such a book is off in the
browser. Native engines never transcode (they rely on the platform's own
decoders); a downloaded file is never transcoded. An `.mka` file is saved
offline as `<i>.mp3` on iOS only
([why](../frontend/offline.md#native-engine-enginenativets---expo-file-system)).
Details in
[frontend playback](../frontend/playback.md#web-transcode-negotiation-transcodets).

**A change requires:** changing `direct_playable`'s meaning or the transcode query
params changes both sides. The negotiation degrades by design: an absent
`direct_playable` (an older server, or any list response - only `item` and
`chapters` carry it) reads as playable, as does a codec never probed (sent as
`true`), and
an unknown or `false` `transcode` capability streams the file directly, exactly as
before negotiation existed.

## 6. The chapter / whole-book timeline model

**What couples:** the subtlest shared model - single-file m4b chapters and
multi-file mp3 "parts" are normalized to one shape so a player renders both
identically.

**Server:** `metadata.Chapter` carries `file_path` (the library-relative file to
stream), in-file `start`/`end`, and `book_offset` (its start on the whole-book
timeline); `GET .../chapters` returns `{ chapters, files, duration }`.
**Frontend:** `src/playback/book-queue.ts` builds the track queue from `files`
(else distinct chapter `file_path`s, else the single-file path);
`src/playback/store.ts` maps `(trackIndex, position)` ↔ whole-book position via
cumulative `offsets` and overlays chapters by `book_offset`.

The chapters may be a community recording's list fitted onto the audio instead of
the files' own ([Community chapters](../server/community-chapters.md)), or the
chapters a Bridge found in the narration of a book with none of its own (Bridge
Phase 1d, [Generated chapters](../server/community-chapters.md#generated-chapters));
they keep this exact shape, so a player needs nothing to play them.
`chapters_source: "community"` or `"generated"` on `/chapters` and the `/item`
book is the only additive marker (mirrored as `Book.chapters_source` /
`ChaptersResponse.chapters_source`, the `ChaptersSource` union): the player's book
page captions such chapters (an older app shows them as ordinary chapters), and a downloaded book replaces its
saved chapters with a newer server answer while its audio files are unchanged
(same paths, order and sizes; `startChapterRefresh`). The same files in a new
order (the server's natural file order, 2.4.0) are taken only by a start that
loads them that way (`adoptStartedChapters`), never from a background answer. From 2.4.1 the
download hot-swap can take them too: a copy that lands while a start's new order streams takes
that start's chapters, only when they give the order the engine plays, so only the files' urls
change ([Offline](../frontend/offline.md)). Podcasts additionally
return `id3_chap` from the server's CHAP attachments; the player (2.2.0 and
later, first released in 2.4.0) captions it "Chapters from the episode file". See [podcasts](#17-podcast-shows-feeds-and-client-visibility).

**A change requires:** any change to chapter normalization changes the queue
builder and the timeline math with it. And always: **stream the file, not the
book** - a folder path in a track URL is the MediaToolbox `-12864` bug class
(see [Invariants §3](invariants.md#3-stream-the-file-never-the-book)).

## 7. Pairing / connect deep links

**What couples:** the auth-code → session handshake, spanning both repos and two
URL carriers.

**Server:** `internal/api/qr.go` `buildPairing` emits `web_url`
(`<base>/web/connect?token=…`, encoded in the QR - opens the app via
Universal/App Links on claimed domains, else the web player) and `uri`
(`audiosilo://connect?server=<base>&token=<pairing_token>`, custom scheme). Flow:
`POST /auth/redeem` (code → pairing payload) → `POST /auth/exchange` (pairing
token → device-scoped session).
**Frontend:** the `audiosilo` scheme in `app.json`; the connect/pairing parser and
the `/web/connect` route consume both carriers; `client.ts`
`redeemCode()`/`exchange()`. The app's scanner and the web player's paste field also
read the console's invite link (`inviteURL`, `<base>/connect#code=…`; `parseInviteScan`
from player 2.4.0) and sign in with its code through the same redeem and exchange, so
a change to that link's shape changes both repos.

**Home and away addresses (`addresses` capability).** Every pairing payload
(`/auth/redeem`, `/auth/pair`, the demo session's `pairing`) may carry
`addresses: { home?, away? }`: `away` is `public_url`; `home` is `lan_url`, else the
request's own `Host` when that is a home-network host (`config.Addresses`; the
host rule is in [Configuration](../server/configuration.md#home-address-lan_url)); a home equal to the away is dropped. Both links carry them
as extra query params **after** the existing ones, only when set
(`…&away=…&home=…`; read them by name, the encoder sorts them; old clients ignore them).
The `/auth/exchange`, `/auth/login` and `/demo/session` answers carry `addresses` too, and
`GET /addresses` lets a paired device learn one set later (shapes in the
[reference](../server/api/reference.md#home-and-away-addresses)). **Frontend:**
`parsePairingScan` returns `addresses`; the connect flow stores them on the connection
(`Connection.addresses`; `mergeAddresses` keeps a known `home` an answer lacks);
`serverUrl` is never rewritten; and the native app picks the address per request:
home only after a tokenless `GET <home>/api/v1/server` answered with this connection's
`server_id`, else away, else `serverUrl`. **Never send a token to a home address before
its `server_id` matched.** The web player never switches (it is served same-origin).
Details: [Connect and home/away addresses](../frontend/connect-and-addresses.md#home-and-away-addresses).

**Listen in player.** The admin console's book page mints a token for its own user
(`POST /auth/pair`) and opens the same-origin
`/web/connect?token=…&sid=…&uid=…&book=<library_id>&path=<rel_path>` in a new tab; the
player skips the exchange when it is already signed in as `uid` on `sid`, and ends the flow
on that book (rebuilt with `bookHref`, never a URL from the link). Details:
[Connect and onboarding](../frontend/connect-and-addresses.md#a-link-that-names-a-book).

**A change requires:** the scheme, the query keys (`server`, `token`, and the optional
`home`, `away`, `sid`, and `uid`, `book`, `path`), and the `/web/connect` route path are a contract - change the server
emitter, the parser, and `app.json` together, or pairing breaks.

## 8. Capability flags: `GET /api/v1/server`

**What couples:** feature negotiation, so any app build can talk to any server
version.

**Server:** `handleServerInfo` advertises `admin_ui`, `web_player`, `upload`,
`transcode`, `websocket`, `api_keys`, `export`, `metadata`, `meta_bundle`,
`browse_people`, `cover_sizes`, `next_book` and the flags added after it (the
latest: `household` and `cast`, which gate [§14](#14-listening-in-the-house-and-casting),
`household_members`, which gates [§15](#15-household-members-profiles-and-kids-mode-stay-client-side),
and `bridge`, which follows the Bridge's heartbeat, [§16](#16-the-bridge)),
one flag per [managed module](../server/modules.md) (`contributions` and `podcasts`: the module's
toggle **and** its Bridge requirement met, sent `false` otherwise; the console reads
it to offer contributing; `podcasts` needs `podcast` and gates actions, while
reads stay core and players older than 2.2.0 are excluded), the independent
`podcast_fetch:true` protocol flag (even offline/module-off; older servers omit
it, [§17](#17-podcast-shows-feeds-and-client-visibility)), the Phase 2c-3 core
flags `podcast_discovery` (boot-only `podcasts.discovery.enabled` **and** the
module toggle, independent of the Bridge, sent `false` otherwise) and
`podcast_opml` (always true), `ebooks` (always true; the reader,
[§18](#18-the-ebook-reader)), `readalong` (always true; read-along maps,
[§18](#18-the-ebook-reader)), `upcoming` (2.6.0: community metadata on **and**
`upcoming.enabled`; [`GET /me/upcoming`](../server/api/reference.md#get-apiv1meupcoming),
upcoming releases in the caller's series) with `upcoming_calendar` and
`upcoming_covers` (Track U3, exactly `upcoming`: the
[calendar feed](../server/api/reference.md#the-calendar-feed) and
[`/me/upcoming/cover`](../server/api/reference.md#get-apiv1meupcomingcover)), plus the
server version
(`api.Version`, stamped from the release tag via ldflags). `transcode` reflects
ffmpeg availability; `web_player` reflects whether `/web` is populated; the
`bridge: {version, features}` block beside `capabilities` is sent to a signed-in
caller only (a session or API key of any role, not a demo account), while the
`bridge` flag itself stays public; `api_keys`
reflects that the server accepts user-minted API keys; `metadata`,
`meta_bundle` and `meta_covers` follow the runtime metadata switch; `browse_people`, `cover_sizes`,
`next_book` and every flag after it are always true on a server that has them (the
full table is in
[API conventions](../server/api/index.md#capability-flags---gate-your-features)).
(`upload` and `websocket` are reserved for **planned** phases - `POST /uploads`
and WebSocket sync are not shipped.)
**Frontend:** the `ServerInfo` type; feature gating and the "connected server
version" display key off it. Every flag from `meta_bundle` on is optional on `Capabilities`
and read through the exported, tri-state `useCapability(flag, connectionId?)` in
`hooks.ts` (`undefined` until `/server` answers, then `true`/`false`); the gated
hooks give a server without the flag no query function (`skipToken`), so it is
never asked, and the gated mutations (`useCapabilityMutation`) reject with
`CapabilityError` (not an
`ApiError`, so no reconnect banner) without sending anything while the flag is
false or `/server` hasn't answered.

**A change requires:** adding a capability is a two-repo change - flip the flag as
the feature lands server-side, and gate the new UI on it client-side. Never assume
a capability is present. A module's flag is its id, mirrored in `Capabilities`
(`types.ts`) like any other flag and named in the player's `ModuleFlag` too (see
[Player modules](../frontend/state-and-data.md#player-modules-srcmodules)).

## 9. The web player is served *by* the server at `/web`

**What couples:** the frontend's web build is not vendored in the server repo -
the server serves it at runtime from `web_dir` (Docker bakes a pinned build in;
native binaries embed one via `-tags embedplayer`).

**Frontend:** `app.json` `experiments.baseUrl: "/web"` - the export must be built
with `baseUrl=/web` so asset URLs resolve under the subpath; `web.output: "static"`.
**Server:** `internal/web/web.go` serves `web_dir` at `/web` with an SPA fallback
to `index.html`, 404s for missing assets, and a per-response scoped CSP that
hashes each document's inline scripts. The one exception is the player's ebook
reader document, `reader.html`, served at `/web/reader.html` under its own policy
([§18](#18-the-ebook-reader)).

**A change requires:** watch the CSP coupling - the hash is computed per document
at serve time, so it usually tracks automatically, but a change in how Expo
inlines bootstrap scripts can break strict CSP. Compatibility is otherwise "by
construction": the server image pins a specific web build.

## 10. Demo mode - `demo.audiosilo.app`

**What couples:** the public throwaway-account demo flow.

**Server:** `config.demo.*` (enabled/library/max_users/idle_ttl);
`POST /demo/session` mints a reaped throwaway account (migration
`0005_user_is_demo`); in demo mode the site root `/` redirects to
`const webDemoPath = "/web/demo"` in `api.go` - explicitly the single point of
coupling with the player's router.
**Frontend:** `client.ts` `demoSession()` + the `DemoSession` type, and the
`/web/demo` route/screen in the Expo router.

**A change requires:** rename the player's demo route → update `webDemoPath` in
the server, in the same change.

## 11. Build & release coupling (order matters)

**What couples:** the deployable server image contains a **pinned** web player, so
the web image must exist before the server image builds.

**Frontend:** `.github/workflows/web.yml` exports the web build and pushes
`ghcr.io/<owner>/audiosilo-web`.
**Server:** `Dockerfile` does `FROM ${WEB_IMAGE} AS web` then `COPY --from=web /web /app/web`;
`.github/workflows/image.yml` builds and pushes
`ghcr.io/<owner>/audiosilo-server`; `.github/workflows/release.yml` +
`scripts/fetch-web-player.sh` embed the same pinned build into native binaries.

**A change requires:** publish the web image **before** the server image on every
release. The served `/web` identifies as its `app.json` version, and the
server's podcast gate keys on it (2.2.0 and later see podcasts), so a server
release that bakes in an older web image serves a player that shows no
podcasts. Full detail in [Release pipeline](release-pipeline.md); the operator
runbook is [Releasing](../contributing/releasing.md).

## 12. CORS for web development

**What couples:** during development the web player (`expo start --web` on
`:8081`) and the API (`:8080`) are different origins.

**Server:** set `cors_origins` to include the web origin (e.g.
`http://localhost:8081`); `"*"` disables the check; empty means no cross-origin
headers (native and same-origin still work).
**Frontend:** `npm run web` serves on `:8081` by default.

The player's `X-AudioSilo-Client` identity header is a custom header, so it
would force a preflight on every cross-origin call. The server's
`Access-Control-Allow-Headers` lists it, but servers released before it don't,
so the web player sends it **only same-origin** (`shouldIdentify` in
`src/lib/client-id.ts`; native always sends it). Keep that rule when adding any
custom request header (see
[Client identification](../server/api/index.md#client-identification-x-audiosilo-client)).
Since podcasts are shown only to an identified 2.2.0 or later player, the
cross-origin dev loop shows none unless a development build opts in with
`EXPO_PUBLIC_IDENTIFY_CROSS_ORIGIN=1` (never in a production build).

For an allowed origin the server also allows `Range` and exposes
`Retry-After` and the OPML export's `X-OPML-*` counts (Phase 2d-2), with what
an older server means for the player: [CORS](../server/api/index.md#cors).

**Media for a player on another site.** The web player loads another origin's
covers, artwork and audio in CORS mode (`corsModeFor`, applied by `CoverImage`
and the `<audio>` element; see
[the web engine](../frontend/playback.md#web-engine-servicewebts)), so the
server's `cors_origins` governs them; an older player loads them no-cors and
relies on `Cross-Origin-Resource-Policy` instead
([CORS](../server/api/index.md#cors)). Media takes only an explicit token, never
a cookie, which is why both are safe
([Transport hardening](../server/auth-and-security.md#transport-hardening)).

**A change requires:** nothing structural - just remember self-signed TLS (the
server default) needs trusting in the browser, or use `AUDIOSILO_TLS_MODE=off`
for plain-HTTP local dev.

## 13. Community metadata: a three-repo seam

**What couples:** enriched book metadata (description, characters, recaps, "more
in this series") originates in `audiosilo-meta`, and flows through
the server to the player.

**Upstream (`audiosilo-meta`):** `metaserve` serves the community metadata
read-only (`GET /lookup`, `/works/{id}`, `/series/{id}`, and
`/works/{id}/recordings/{rid}/chapters` for
[community chapters](../server/community-chapters.md)) - see the
[metadata database developer pages](../meta/overview.md).
**Server:** `internal/meta` resolves a book's ASIN/ISBN against `metaserve` and
composes an enrichment envelope, returned at `GET /libraries/{id}/meta` behind an
admin off-switch and a bounded cache; `GET /meta/work?id=…` serves one work
document straight through (authed but **not** library-scoped, since a work id
names nothing on this server) from the same cache, for the earlier books of a
series the caller does not own. The `metadata` capability on `GET /server`
reflects whether either lookup is live. The admin console's match dialog
(`GET /admin/libraries/{id}/book/match`) asks `metaserve`'s structured
`GET /works/match` with the book's tag and path facts, falling back to
`lookup` + `works/search` against a `metaserve` that predates the route; its
candidates pass `metaserve`'s `score` and `reasons` through to the console's
hand-mirrored types (`admin-ui/src/api/types.ts`), not to the player. Each
recording's ASINs keep their `region` (`asin_refs`), and `asins` is ordered by
the server's preferred marketplace (`metadata.region`), so the server, not the
console, decides which ASIN a match attaches; bulk match runs reuse the same
match per book. Community chapters (`internal/chaptercheck`) fetch the chapter
list of the lookup's exact `recording_id` only (never the first recording a
work lists), fit it onto the book's audio server-side, and reach the player as
ordinary chapters with the additive `chapters_source: "community"` (see
[§6](#6-the-chapter--whole-book-timeline-model)); the console's panel reads the
admin book page's `community_chapters`. Upcoming releases (2.6.0, `internal/upcoming`) read
`metaserve`'s watch feed (`watch/feed.json?s=`, 50 series a request, the work id
taken from each item's tag or URL) once a day, and `GET /series/{id}` for a series
never read, one with news or one read over a week ago, and the
series rails' work cards carry `release_date` through to `/meta` (additive). The
player (2.6.0, Track U2) reads [`GET /me/upcoming`](../server/api/reference.md#get-apiv1meupcoming)
as `UpcomingResponse` in `types.ts` (`client.upcoming()`, `useUpcomingAll()`; only a
server that sends `upcoming`, never for a kid) for Home's Coming up in
your series, the `/upcoming` page and the You hub's Upcoming section, opening an item's
series page by its `local` view; the series page dates its not-yet-released ghosts from
the rails' `release_date` ("Out Nov 12, 2026"). Track U3 adds each item's real cover
from the server (`GET /me/upcoming/cover`, only the `cover_url` the caller's own list
hands out, flag `upcoming_covers`; the player draws it over the ghost) and a calendar
feed (`/me/upcoming/calendar` and `releases.ics`, a `feed` token, flag
`upcoming_calendar`; see [§3](#3-media-auth-rides-in-the-url---token)). Details:
[Upcoming releases](../frontend/state-and-data.md#upcoming-releases).
**Frontend:** the `BookMeta` envelope (hand-mirrored in `src/api/types.ts`) is
fetched by `client.bookMeta` and rendered capability-gated on the book screen's
Recaps/Characters/Series tabs, and also read by the series page, Home (the Now card
and Previously on), Search, the end credits and the player's companion and reveal
toast; `client.metaWork` / `useMetaWork` lazily fetch a
previous book's work when the reader opens its row. Reading-order families
(metaserve `schema_version` 7 `ordering` / `ordering_of` / `orderings`) are
collapsed **server-side** into one rail per family, with the other orders as
additive alternates, so a shipped player that ignores them still sees one rail in
the primary order; the current player adds a per-family order toggle that its
"previous books" list follows (see
[Reading-order families](../server/api/reference.md#reading-order-families)).

The player-redesign bundle (Phase 1a) adds, all additive: `work.community_description`
(the CC BY-SA description, apart from the CC0 `description`), `work.attribution`
(present iff the work carries CC BY-SA content; **the server writes the legal
text** and a client must render it beside that content, never compose it),
`recording.chapter_count`, and `local` `{library_id, path}` on each rail entry the
caller owns (main view and orderings). `local` is resolved **per request, after
the shared cache, on a copy**, and never stored in it. `?include=previous` adds
`previous[]` (the main view's earlier works, nearest first, at most 5) and
`?spoilers=hide` gates the envelope by the caller's saved server progress, both
behind the `meta_bundle` capability; spoiler gating still **stays on the device
by default** (the player gates against its live position and does not send the
param). A failure placing the caller's books sends the envelope without `local`
rather than failing it. `GET /libraries/{id}/next` follows every series the book
is in (main first, then its other series): of the community rails in that order
(rails named like none of its series last), the first with a next work that
doesn't step back decides, and answers when it places that work on one of the
caller's books (possibly in another library; a later rail never answers in its
place); otherwise the local series (each in turn),
then the folder, then none answer, with an unplaced community next work riding
along as `work` without `local`. The wire shape is the same as for one series.
Answers are also kept in a persistent `meta_cache` table (no config key, follows
`metadata.enabled`, community data only; the newest 20,000 rows, works fetched by
id at most 2,000 of them) so a restart is warm and an outage serves the last known
answer. See
[`/meta`](../server/api/reference.md#get-apiv1librariesidmeta) and
[Configuration](../server/configuration.md#the-persistent-cache).

**Community covers through the server** (`meta_covers`, which tracks `metadata`).
`GET /libraries/{id}/meta/cover?path=&url=&size=160|320|640` (`size` optional,
default 320, `96` too from 2.5.1; media auth, `?token=`) answers `image/jpeg`, a thumbnail of `url`,
**only when** that exact URL is a `cover_url` the `/meta` envelope for the same
`(library_id, path)` hands out (the recording's, or any rail entry's in a main
view or an ordering). Anything else is `404 no such cover` **before any fetch**:
it is never an open proxy. Scope and errors are as `/meta` (403/404 for the path,
404 with metadata off, 502 metadata unavailable), plus `502 cover_unavailable`
(the fetch failed; that URL is not fetched again for a minute, and concurrent
misses share one fetch) and `404 no cover` (not an image, or over the pixel
bound). Only a re-encoded JPEG is served, with `ETag` `"community-<size>-<rev>-<hash>"`
and `private, max-age=86400`. Frontend: `Capabilities.meta_covers`,
`client.communityCoverUrl(lib, path, cover_url, { size })`, and
`communityCoverSource` / `useCommunityCover`: proxied when the flag is on; without
it (an older server, or `/server` unreachable) native loads `cover_url` directly
and the web player shows the placeholder, because its CSP blocks third-party
images by design. Privacy: with metadata on, the server, not listeners' devices,
contacts the cover hosts. See
[`/meta/cover`](../server/api/reference.md#get-apiv1librariesidmetacover).

**Mirror mode** (`metadata.mode: mirror`, opt-in; `remote` is the default)
makes the seam tighter. The server downloads audiosilo-meta's data release
artifact (`meta.sqlite.gz`, the CC0 core and the CC BY-SA community layer in one
file) once a day into `<data>/meta-mirror/`, and answers the same `/api/v1`
requests in-process with audiosilo-meta's public
[`pkg/query`](../meta/overview.md#public-go-packages) (`Open`, `NewHandler`:
metaserve's own handler, byte for byte), fetched with its public `pkg/release`.
`internal/meta`'s client is unchanged: the local copy answers while one is
ready, and `base_url` otherwise (the full
[fallback ladder](../server/configuration.md#mirror-mode-metadatamode-mirror)).
The player is untouched: no wire change and no capability change.

Two couplings follow, both now part of this seam:

- **The handler's responses are a public API.** A mirror-mode server decodes the
  local answers with the same structs it uses against meta.audiosilo.app, so
  `pkg/query`'s responses change the way metaserve's always have: additively.
- **The artifact schema is a direct coupling.** A mirror-mode server reads
  whatever the newest data release is, routinely an artifact **newer** than its
  own code, so artifact schema changes must stay **additive**: new tables and
  columns, never a renamed or dropped one, and never a changed meaning for an
  existing column. A newer artifact still opens and answers; how the versions
  are gated and bumped is in
  [the meta data model](../meta/data-model.md#the-compiled-artifact-and-schema-versioning).
  A server picks up `pkg/query` changes only when its `go.mod` moves to a new
  audiosilo-meta tag.

**Contributing back (Bridge Phase 2b).** The server never writes to the community
repositories: what an admin shares or corrects is a Bridge job
([§16](#16-the-bridge)) the Bridge files as a GitHub issue under the
admin's own account, through the AudioSilo Contributions App when it uses its
Accounts sign-in (a token from its environment or `gh` files a plain issue, which
`route.yml` leaves to the routing labels the Bridge set, when they stuck, or to a
maintainer). Two meta-side pieces
make that a seam: the [correction-batch form](../meta/contributing-data.md#the-correction-batch-form)
(`[corrections] ` issues with a fenced, versioned `changes` block, which the Bridge
writes and meta's `correctBatch` reads), and
[`route.yml`](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app),
which routes an App-filed issue by its title prefix (`[work] `, `[corrections] `;
`[characters] `, `[recaps] ` on the community repository) or holds it
(`intake:held`). The title prefixes and the batch's `v: 1` block are the contract
between the Bridge and meta. Two more couplings ride on the corrections: how
meta's form reads a value (`issueform` `formValue`, character references
decoded) is mirrored by the server's `meta.correct` checks and by the console's
dialog, so a change there moves both
([details](../bridge/contributions.md#corrections-metacorrect)); and the server's
bounds on a batch (128 KiB of params, the value and evidence lengths) must stay
within what the Bridge reads (64 KiB as stored, an unknown field refused) and
what meta takes, so raising one starts with meta and the Bridge.

**A change requires:** because the server consumes `metaserve`'s response shapes,
a change to those shapes ripples audiosilo-meta -> the server's `internal/meta` ->
the player (only if the server's outward `/meta` envelope changes). Keep it
additive, same as every other seam here. A change to `pkg/query` or
`pkg/release`'s exported API reaches the server through its `go.mod`.

## 14. Listening in the house and casting

The player redesign's Phase 8, two additive features each behind its own flag
(seam 8), mirrored in `types.ts` (`HouseholdSettings`, `HouseListeningRow`,
`HouseListening`, `CastToken`), `client.ts` and `hooks.ts`.

**Listening in the house** (capability `household`): `GET`/`PUT /me/household`
(`{ share_listening }`) and `GET /household/listening` (`{ sharing, listening: [Row] }`);
shapes in [the reference](../server/api/reference.md#listening-in-the-house). Every
privacy rule is the server's alone
([what other people see](../server/auth-and-security.md#listening-in-the-house-what-other-people-see)):
the player only decides what to show of the answer and how often to ask. Client side:
[Listening in the house](../frontend/listening-in-the-house.md).

**Casting** (capability `cast`): `POST /cast/token` `{ library_id, path }` ->
`201 { token, expires_at }`, a credential for one book accepted only as the
`?token=` of that book's cover and stream
([Cast tokens as media auth](../server/api/reference.md#cast-tokens-as-media-auth);
its lifetime and policy: [Cast tokens](../server/auth-and-security.md#cast-tokens)).
The web player's CSP admits the Cast Web Sender's three scripts on
`https://www.gstatic.com` by path in `script-src`, and nothing else. The receiver
never sees the session token; no flag, no Cast button. Client side, including which
address the receiver's URLs use: [Chromecast](../frontend/chromecast.md).

**A change requires:** the household rules stay in the server's catalog (a player
must never filter someone in); any widening of where a cast token is accepted is a
security-critical change with allowed and denied tests on the server.

## 15. Household members (profiles and kids mode stay client-side)

**Profiles and kids mode are client-side; household members are server-side.** A
profile (a person on this device), its PIN and its kids mode never reach a server
([Profiles](../frontend/profiles.md)). A **household member** (capability
`household_members`) is a real account an owner creates from the player, and
everything about what it may do is the server's.

**The wire** (all additive; shapes in
[the reference](../server/api/reference.md#household-members)):

- `/me/household/members` (list, create) and `/{id}` (`PATCH`, `DELETE`),
  `/{id}/session`, `/{id}/pair`, `/{id}/devices` and `/{id}/devices/{device_id}`;
  mirrored in `types.ts`, `client.ts` and `hooks.ts`
  ([State and data](../frontend/state-and-data.md#household-members)).
- The `user` object (`/me` and every session envelope) gains `managed_by` (`{ id,
  username }` or `null`) and `member_kind` (`"kid"`, `"grownup"` or `null`), and, for a
  member only, `display_name` (the name the owner typed; the player names a new profile
  for the account after it). The member's access is not on it: the player can't see it
  and never needs it.
- `/me/devices` rows gain `member_sign_ins`, and `DELETE /me/devices/{id}?also_members=1`
  answers `{ current, members_signed_out }`.
- The admin console's fields and settings stay inside the server repo
  ([Admin: users](../server/api/reference.md#get-apiv1adminusers)).

**Server rules** (each with an allowed and a denied test;
[Auth & security](../server/auth-and-security.md#household-members)): what a member may
listen to (the owner's access, or the collections the owner shares, plus their own
grants), one level and never an admin, the kid refusals (`403 kid_account`), kids out
of share targets and Listening in the house, someone else's member `404` like no such account, a
disabled member's session and pairing code `409 member_disabled`.

**Client rules** ([Household page and members](../frontend/household.md)): a member
the owner signs in on this device from the Household page is placed by `addMemberHere`
(the owner stays the person listening, the default connection doesn't move); `member_kind === 'kid'` turns
kids mode on by default and allows it with no grown-up on the device; `managed_by`
picks the kids shelf's collections. The player never filters a kid's access itself.
Refusals are read by `code`, never by the server's message
([Error mapping](../frontend/state-and-data.md#the-api-client-srcapiclientts)), so a new
`code` needs a case in `API_ERROR_CODES` and its words in the player, or it reads by
its status.

**Old clients:** a shipped player ignores the new `user` fields and sees a member as
an ordinary account; a kid signed in to an old player is still limited by the
server. An older server has no flag, so the player offers no "Add someone to your
household" and profiles and kids mode work as before.

**A change requires:** any change to the member rule is security-critical (allowed and
denied tests on the server); a new member field is the usual wire change in both
repos, gated on the flag.

## 16. The Bridge

**What couples:** the [Bridge](../bridge/index.md) (`audiosilo-bridge`, private) is
a companion client of the server's wire format, alongside the player. The
server defines the contract and the Bridge mirrors it by hand in `internal/link`;
a change to the server's `internal/bridge` or `handlers_bridge.go` is a change in
both repos, with a test on each side.

- **The Bridge pulls; the server never connects to it.** No route on the Bridge is
  called by the server, and no Bridge address is dialled. The console links to the
  Bridge's page (`ui_url` from the heartbeat, `http(s)` only) for the browser to
  open, nothing more.
- **Pairing:** the console's `POST /admin/bridge/pair` (a session only) mints a
  15-minute code; the Bridge's public `POST /bridge/pair` trades it for a token of
  kind `bridge`. One Bridge per server: pairing another revokes the first. The
  Bridge keeps the token sealed, never in its config.
- **The token kind:** accepted only on `/api/v1/bridge/*`, from the header only,
  and only while its admin is an enabled admin; refused everywhere else, media
  `?token=` included; heartbeats and claims check it again inside their own
  write. A `401` means the token is refused: the Bridge stops calling in, says why
  and retries every 5 minutes (a demoted admin's Bridge comes back when they are
  re-promoted; an unpair or a new pairing revoked it for good). A failure to check
  the token is a `503`, which the Bridge simply retries. The console's pairing code
  comes with the server's home address when there is one.
- **The routes it calls:** `PUT /bridge/status` (the heartbeat, every 30 s; the
  answer lists the libraries and, since Phase 2b, `accepts`), `GET /bridge/jobs/next?wait=&kind=` (a long-poll
  claim, at most 25 s, narrowed to the kinds with a free lane; `204` for none),
  `PATCH /bridge/jobs/{id}` (`{attempt, state?, progress?, result?, error?}`; the
  answer's `cancel_requested` asks it to stop; `409 not_held` when its claim no
  longer holds the job, a job that no longer exists included; free text is
  cleaned, never refused), `GET /bridge/libraries/{id}/book[?path=]` (an indexed
  book's files with the sizes the server sees now, a single-file book as its own
  file; no path = the first whole book among the library's first five by title;
  `404 no_book`; with a path, an additive `book` of the book's facts: title,
  credits split, series and position, ASIN, ISBN, duration and the cached
  `work_id`) and `POST /bridge/rescan {library_id, path, mode?, from?}` (`full`,
  optionally carrying a Bridge-made move's durable state from `from`, or
  `attachments`: only the book's `.audiosilo/` files). The heartbeat carries an
  additive `estimates` block the server reads leniently (an unknown key ignored,
  a bad block dropped, never the heartbeat), and since Phase 2b a `setup` block
  read the same way, which the Bridge sends only once a reply's `accepts` lists
  `setup` (an older server refuses an unknown heartbeat field). Shapes:
  [the reference](../server/api/reference.md#the-bridge).
- **Claim floor (Phase 2c-2b):** `accepts` may also list `claim_min_priority`,
  which permits an optional signed int32 `min_priority` on the claim (filtered
  inside the claim transaction; malformed is `400 invalid_request`; omitted
  keeps ordinary behavior). A change in the Bridge's eligible kinds, pairing or
  capacity cancels and immediately reissues its outstanding claim. A lease whose
  reply was never delivered is released without spending an attempt. Detail:
  [claims and leases](../bridge/pairing-and-jobs.md#claims-and-leases).
- **The capability:** `capabilities.bridge` is true only while the last heartbeat
  is under two minutes old, with `bridge: {version, features}` beside
  `capabilities` (`features` a list, never `null`; the server reuses a heartbeat
  it read for up to 5 s). Clients never assume it, and a feature the Bridge doesn't
  advertise is off even when the flag is on. `features` may also hold `contribute`
  (the Bridge can file contributions; see
  [the heartbeat](../bridge/pairing-and-jobs.md#the-heartbeat-and-the-capability)),
  which the `contributions` module's flag needs ([§8](#8-capability-flags-get-apiv1server)),
  and `meta` (the Bridge files corrections). Since Phase 2b the `bridge` block goes
  to signed-in callers only; the flag stays public.
- **The job model:** the server's `bridge_jobs` row is the intent and the lease
  (path-keyed, moved with its book, gone with its library); the Bridge's
  `server_jobs` row is the execution truth. Leases of 2 minutes, renewed by every
  report; three attempts; kinds allow-listed twice (the server knows it **and** the
  Bridge advertised it, else `409 kind_unavailable`). Detail:
  [Pairing and jobs](../bridge/pairing-and-jobs.md).
- **Library mappings are checked, never assumed:** the Bridge compares a known
  indexed book's file sizes through its mount with the server's before it calls a
  books library mapped, then probes writing. Podcast libraries instead use a
  shared root marker read back through the server, even when empty. It checks
  after pairing, when the server's
  libraries change, every `mapping.check_minutes` (default 10) and on demand; each
  heartbeat carries the last results. See [Library mappings](../bridge/mappings.md).
- **Hidden folders:** no content route reaches a path through a dot-folder by name
  (`library.ContentPath`: never indexed, listed, streamed or served; `404`), so the
  Bridge's `.audiosilo/` inside a book can't become a phantom book or a streamable
  file.
- **`sidecars.generate` (Phase 1a):** the first job that writes. Params
  `{source, contribute, work_id}` checked strictly; refused `409
  library_not_writable` for a library the heartbeat doesn't report mapped and
  writable, and `409 cannot_contribute` for `contribute: issue` unless the
  heartbeat says it can; the progress (`step`, `stage`, `eta_seconds`,
  `cost_usd`, `source`, `park {code, hint, retry_at}`) and result shapes are the
  Bridge's, stored opaquely by the server and read by the console and the player
  by hand. `GET /admin/bridge/estimate` costs a run from the heartbeat's figures.
  The server announces `bridge_job_finished` / `bridge_job_failed` itself, on
  transitions. Detail: [Characters and recaps](../bridge/generating.md).
- **`.audiosilo/` is a file contract:** the Bridge writes `characters.json` and
  `recaps.json` (audiosilo-meta's `model.Characters` / `model.Recaps`) and
  `bridge.json` into a book's folder (`<stem>.` before each for a single-file
  book); the server indexes them (checked, size-capped, regular files only) and
  lays them into `/meta` per request: community content wins per dimension,
  `work.generated` names what came from the files, an unmatched book answers
  `matched: false` with a `work`, and the CC BY-SA `attribution` never covers
  them. A change to the formats touches audiosilo-meta's model, the Bridge's
  writer and the server's reader. Detail: [The .audiosilo folder](../bridge/attachments.md).
- **Own-words descriptions (Phase 1c):** a `sidecars.generate` run also writes
  `description.json` (audiosilo-meta's `model.Description`, 200-1500 characters,
  written from the opening chapters' fact notes only, so spoiler-free, and local
  only: never contributed), and `sidecars.describe` writes one alone from the
  notes a run kept (params `{}`; `409 generate_open` while a generate job is open
  for the book, and a generate job cancels an open describe job). `/meta` serves
  it in its **own** additive field, `work.generated_description: {text}`, never in
  `community_description` (the shipped 2.0 app shows that one first and credits
  the community, so a generated text there would replace real blurbs on old apps),
  only when the community work has no `community_description`, marked by
  `work.generated.description` (the three booleans are always sent), kept under
  `spoilers=hide`. The player orders About itself: the community description, the
  book's own, the work's core one, then the generated one with its mark. The
  estimate gains `can_describe` and `has.*.description`, the admin book detail
  `generated_description`, the attachments rescan answer `description`. Detail:
  [The description step](../bridge/generating.md#the-description-step).
- **Chapterless books (Phase 1d):** a single file with no usable chapter markers
  is transcribed in windows and its chapters found in the narration; the Bridge
  writes them as `.audiosilo/chapters.json` (version 1, `files` named relative to
  the book's folder with their sizes, `chapters` on the whole-book timeline,
  contiguous, 2 to 2000, entry k being logical position k), which the server
  stores checked (`book_attachments.chapters`, migration `0051`) and uses as a
  chapter source between the community's and the files' (`chapters_source:
  "generated"`; only with no admin choice and only on the files it was found on).
  `chapters.detect` (feature `chapters`, params `{}`) does it without the agent
  for Health's `no_chapters`; `409 generate_open`, `detect_open`,
  `describe_open` and `chapters_chosen` keep it apart from the other kinds. The
  rescan answer gains `attachments.chapters`, admin rows `chapter_choice`, the
  admin book detail `generated_chapters_fit`. A change to the file touches the
  Bridge's writer and the server's reader. Detail:
  [Chapterless books](../bridge/chapters.md).
- **Read-along (Phase 3c-1):** `readalong.align` (feature `readalong`, params
  `{}`, writes) lines the book's ebook (the server's pick, the book route's new
  `book.ebook {path, size}`) up with its narration, with no agent, and writes
  `.audiosilo/readalong.json` (`audiosilo-readalong/v1`; only when at least half the
  text lined up), timed on the server's file lengths (the book route's new
  `files[].duration`). `409 no_ebook`, `generate_open` and `detect_open` refuse it;
  a new generate or detect job meets `409 readalong_open` (a generate job cancels a
  parked one). The estimate gains `kind=readalong.align`; the rescan answer gains
  `attachments.readalong`. A change to the map touches the Bridge's writer, the
  server's head checks and the player's reader. Detail:
  [Read-along](../bridge/readalong.md).
- **Setup and contributions (Phase 2b):** the heartbeat's `setup` block (the
  Bridge's onboarding checklist: `paired`, `libraries`, `asr`, `agent`, `budget`,
  `github`, plus `can_contribute` and `github_login`) reaches the console only, as
  `setup` on `GET /admin/bridge`
  ([the checklist](../bridge/pairing-and-jobs.md#the-setup-checklist)). Two new
  kinds, both owned by the `contributions` module (`404 module_off` while it is
  off, and held in the queue meanwhile:
  [jobs of a managed module](../bridge/pairing-and-jobs.md#jobs-of-a-managed-module)):
  `sidecars.contribute` (params `{work_id?, dimensions?}`; writes nothing; `409
  generate_open`, and a new generate job meets `409 contribute_open` while one is
  queued or working, and cancels a parked or held one) and
  `meta.correct` (params `{work_id, recording_id?, asin?, isbn?, region?, changes,
  evidence, source?}`; the server refuses `400 not_edited` for a change that isn't
  the book's admin edit). The Bridge files both on GitHub
  ([§13](#13-community-metadata-a-three-repo-seam)); its GitHub sign-in and the
  agent credential it hands to the agent container live on its own page and never
  cross to the server. Detail: [Contributions](../bridge/contributions.md).
- **The player (Phase 1a):** its first admin-only UI, gated on `user.role ===
  'admin'` (never a demo account, a household member or a kid's account),
  `capabilities.bridge`, `bridge.features` holding `sidecars` and
  `capabilities.metadata`; its confirmation holds Generate back while the
  estimate's `open_job` is a `chapters.detect` (Phase 1d) or `sidecars.contribute`
  (Phase 2b) job. `Book.generated` makes it ask `/meta` for a book with no ASIN or
  ISBN. Its `types.ts` mirrors the job, the estimate,
  `BookMetaWork.generated` and (Phase 1c) `BookMetaWork.generated_description` by
  hand.

**Old clients:** everything is additive. An older server has no Bridge routes (the
Bridge's pairing gets a `404` and says the server is too old) and no `bridge` flag;
shipped players never see either. A shipped player ignores a `work` beside
`matched: false`, and shows a matched book's merged work without the
`generated` mark (the owner kept that as built); it ignores
`generated_description` entirely. Phase 2b's are additive too: an older server
sends no `accepts`, so a newer Bridge sends it no `setup`; an older Bridge doesn't
advertise the new kinds; a signed-in player still gets the `bridge` block. Phase
3c-1's are too: an older Bridge ignores the book route's `duration` and `ebook` and
never advertises `readalong.align`; a newer one reads an older server's missing
fields as none. The Bridge sends `X-AudioSilo-Client:
AudioSilo Bridge/<version> (<os>)` on every call.

**A change requires:** the server handler and its test, the mirrored type in the
Bridge's `internal/link` and its test (and, for the generate action, the console's
`admin-ui` and the player's `types.ts`/`client.ts`/hooks with theirs; for a new
optional heartbeat block, both `accepts` lists), and CROSS-REPO.md §23. The token's rules are
security-critical: allowed and denied tests on the server.

## 17. Podcast shows, feeds and client visibility

Phase 2c-2 extends the server/Bridge seam with episodes on disk, retention
and on-demand fetching/status/Retry. Phase 2d-1 ships the player's views
(shown to players the gate admits, 2.2.0 and later; first released in the
2.4.0 player); Phase 2d-2 adds discovery, follow by URL, OPML and Check
for new episodes to the player.
See [Podcasts](../bridge/podcasts.md) and the
[API reference](../server/api/reference.md#podcasts) for exact fields.

- **Kind:** every library JSON and heartbeat reply includes `kind: books|podcasts`;
  create defaults to books (unknown values give `400 invalid_kind`); PATCH cannot change
  it (`400 kind_immutable`). Podcast roots cannot overlap any library
  (`409 root_overlaps`), including when a books root is created or moved.
- **Capability:** `capabilities.podcasts` is always sent, false unless
  `modules.podcasts.enabled` and an online Bridge offers `podcast` from its
  podcast kinds. The Bridge advertises subscribe/poll/fetch/retain in `kinds`,
  with no new heartbeat request field. Independent optional core
  `capabilities.podcast_fetch:true` advertises on-demand/status support even
  offline/module-off; older servers omit it.
  Off gates actions, stops the scheduler and holds queued jobs; reads stay core.
- **Visibility:** `auth.SeesPodcasts(Credential.Client)` feeds `catalog.Caller.Podcasts`.
  `AudioSilo Admin` qualifies; `AudioSilo` version `dev` qualifies; a released
  player qualifies from `auth.PodcastPlayerMinVersion` = `"2.2.0"` (numeric
  `X.Y.Z`, a pre-release counts as its base version). Players 2.1.x and older,
  unidentified clients and API tools without a recognized client do not
  qualify, admins included. The served `/web` identifies as its `app.json`
  version (2.2.0 from this phase), so release the 2.2.0 web image before the
  server that bakes it in.
  A whole-list replace (`PUT /me/queue`, `PUT /me/collections/{id}/items`)
  from a caller the gate hides podcasts from keeps the stored episodes only
  the gate hides (`catalog.GatedScopes`), so an old player can't delete them.
  Media tokens inherit the stored client when no valid request header exists.
  Private-show scopes apply after grants, only for followers matching the
  show's id; the admin catalog remains separate. An authorized library with
  no visible shows returns empty lists. Cast tokens do not expose podcasts.
- **Books stay separate:** podcast libraries are excluded from cross-library
  book search/recent, author/series aggregates, book stats and admin book tools.
  Podcast `/fs` reads titles from the index, not loose disk audio.
- **Actions:** adults may follow by URL (whole-library grant) or visible path,
  unfollow and check, behind the module user wrapper (no kids/demo). The server
  creates the podcast jobs; the admin enqueue route refuses these kinds.
  A private URL's normalized current/previous hash proves the follow. Five open
  subscribe requests per user; manual checks limited to one per 60 seconds when
  no poll is already open.
- **Storage API:** admin/not-demo retention GET/PUT/DELETE and episode fetch
  are [dedicated routes](../server/api/reference.md#podcast-storage-admin).
  Policy defaults to `{mode:"keep",keep:3,days:7}`, keyed by
  library/show path/show id, durable across index rebuilds. PUT requires all
  fields: mode `keep|on_demand|archive`, keep 1..1000, days 0..365. Writes need
  the module, exact online Bridge kind and writable mapping. GET stays core;
  valid present fetch returns 200 before storage checks. New fetch is 202 with
  an existing/open job state, priority 20; no forced pin replacement.
- **Retention:** Keep downloads newest N listed episodes; Archive all listed
  oldest first and never deletes; On demand fetches on play with one-ahead
  queue preparation and no feed-wide scheduled downloads.
  No followers means no policy-scheduled work; authorized play/Retry and queue
  preparation still work. Deletion eligibility (followers
  finished plus grace, protections, Keep's window) is in
  [retention](../bridge/podcasts.md#retention-policy-and-deletion-authority);
  Keep is a window, not a disk quota. Bridge-only policy/aggregate routes expose all
  [aggregate fields](../server/api/reference.md#bridge-podcast-retention), no
  names/ids/positions; mismatched generation/hash/size is 409 identity_changed.
  Bridge verifies local bytes and five-second request age on its own clock
  immediately before a journaled move to owned trash, tombstone and rescan.
- **Jobs:** fetch binds `{show_id,episode_id}` and an indexed episode path,
  dedupe `podcast.fetch|<library_id>|<path>`, with no URL/credentials. Retain
  binds show path/id, priority -20. All triggers share one fetch intent:
  play/Range/download/transcode/Retry 100, admin 20, prefetch 10, scheduled -10.
  Promotion takes the maximum, preserving requester, attempts and progress;
  running jobs keep their pool. Fetch has one ordinary download slot and one
  reserved interactive slot, retain light (2); both internal/writing/quiet.
  Replacements settle old work.
  Fetch byte progress is int64 with nullable total; successful results include
  Fetch/chapters/reused. [Job shapes](../bridge/podcasts.md#fetch-and-retain-jobs)
  and shared `wire-2a.json` fix the contract.
- **Pull and schedule:** the server schedules; the Bridge returns adaptive
  `next_poll_seconds`, clamped by the server to 15 minutes through 24 hours.
  HTTP validators/status live on the server. Ended jobs are folded idempotently
  with a completion wake and a 60-second recovery tick. `gone` stops automatic
  checks; other failures back off. Polls are omitted from default admin job
  lists unless filtered explicitly; fetch/retain are listed. Podcast jobs never notify.
  New poll params/results and feed status bind show id; late/unbound results
  cannot recreate replacement status. Fetch backoff is separate from feed
  state, 30 minutes doubling to 24 hours; per-pass limits are in
  [polling](../bridge/podcasts.md#polling-and-outcomes). Fetch/retain never
  mutate poll validators/secret flags.
- **Files:** Bridge-owned `feed.json` v1 is the shared format; server indexes
  episodes even without audio. Paths are assigned once; `fetch` records a
  committed generation or tombstone, with optional codec. Unknown fields are ignored; breaking format
  changes bump the version. At the cap, removed never-fetched episodes may be
  dropped oldest-removed first. Manually renaming a show folder breaks paths.
- **Publication/media:** journal/audio/CHAP/Fetch commit order keeps new bytes
  behind `<stem>.publish.json` until complete; recovery reuses the same
  generation. First fetch
  is g1; identical refetch keeps g, changed hash increments and latches
  `timeline_changed`. Episode/Book.episode expose optional generation/hash/flag
  even after deletion; progress and bookmarks stay unchanged. One validated
  descriptor serves each request. Direct ETag is
  `"podcast-g<generation>-<sha256>"`, private revalidation and byte ranges;
  transformed output has no source ETag. Missing media triggers shared work,
  never publisher pass-through or partial playback.
- **On-demand/status/Retry:** after auth, client/private scope and exact-path
  checks, the absent-file stream branch has at most two seconds for DB/enqueue/
  promotion/wait. Ready serves normal media; otherwise `503` with
  `Retry-After: 2`, `Cache-Control: no-store`, `{error,code,fetch:Status}`.
  Codes: `podcast_fetching`, `podcast_fetch_unavailable`, `podcast_fetch_failed`.
  Disconnect/timeout never cancels shared work. Core authenticated
  `GET /libraries/{id}/podcasts/fetch?path=` observes only; not-demo POST
  `{path}` is explicit Retry, 202 with the same `{fetch:Status}`, 200 if ready.
  Kids with read scope qualify. New work needs module/exact online kind/
  writable mapping; ready files work offline/module-off. Existing intents may
  still promote. Ordinary streams honor failure cooldown; POST bypasses it,
  never dedupe or a present pin. Identity races remain `409 identity_changed`.
- **Status extension:** episode lists and `Book.episode` add optional
  `fetch:Status`, batched per page. Every key inside a Status is required
  (nullable ones included); no requester, params or raw progress text.
  [Exact shapes](../server/api/reference.md#podcast-fetch-status-and-retry) and
  shared `wire-2b.json` fix the protocol.
- **Listener cap:** five open fetch intents per non-admin creator. Refused
  stream creation is `503 podcast_fetch_unavailable` with
  `fetch.error.code:"fetch_limit"`; POST Retry is `409 fetch_limit`.
  [Rules](../server/api/reference.md#podcast-fetch-status-and-retry).
- **Prefetch:** at most one next visible podcast from the actual caller's
  queue per user/current item, skipping books; if current is absent from queue,
  first visible podcast other than current. Play-fetch/ready-stream starts a
  bounded background look; successful queue mutations can reconsider during
  current stream/fetch. Global dedupe shares work; removal never cancels it.
  New prefetch is priority 10, later play promotes the same row to 100.
- **Claim/capacity:** after the [claim floor](#16-the-bridge) is negotiated,
  the Bridge's reserved interactive slot claims
  `kind=podcast.fetch&min_priority=100&wait=25` and never takes background
  work; the ordinary download lane drops to 1, keeping two enclosure downloads
  in total. An older server gets two ordinary download slots and no reserved
  claim.
- **Player (Phase 2d-1):** the player mirrors the [types, client and
  hooks](../bridge/podcasts.md#player-phase-2d-1) by hand and ships the shows,
  show and episode pages, following, Home's New episodes and on-demand play
  through one controller: probe `/stream` once, poll only queued/fetching every
  `max(2, Retry-After)` seconds, explicit Retry for terminal failure, refresh
  item/chapters (and mark the episode lists stale) at ready. It preserves
  generation warnings without rescaling state and recognizes
  `chapters_source:id3_chap`. No download, cast or kids-mode podcasts; no
  server route changed. See [Frontend podcasts](../frontend/podcasts.md).
- **Discovery and OPML (Phase 2c-3):** server and docs only; the Bridge and
  the player are unchanged. `GET /podcasts/discovery/providers|search|artwork`
  (adult, non-demo, module, client gate; artwork takes a media `?token=`) search
  iTunes by default or Podcast Index when picked and configured (server env
  key pair only, no fallback, no merged ranking); results are public data with
  relative proxied artwork, followed through the existing
  `POST /podcasts/follow {library_id, feed_url}`.
  `POST /podcasts/opml/import?library_id=` takes the raw XML, validates the whole
  document before any effect and answers per-row decisions; at most five new
  subscribe requests per upload within the five-open cap, the rest `limited`
  for a re-upload wave. `GET /podcasts/opml/export` is core (module off too),
  writes only the caller's followed public shows, never a private one, and
  counts omissions in `X-OPML-Exported` / `X-OPML-Omitted-Private` /
  `X-OPML-Omitted-Unavailable`. An open subscribe is reused only at the same
  privacy (`409 privacy_conflict`). Optional flags `podcast_discovery` and
  `podcast_opml`; exact shapes and the player's rules (search on submit,
  artwork through the proxy only, the import waves, export with the
  `Authorization` header) are in
  [Player: discovery and OPML](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2)
  and the [reference](../server/api/reference.md#podcast-discovery). CORS
  exposes `Retry-After` and the `X-OPML-*` counts and allows `Range` for an
  allowed origin ([CORS](../server/api/index.md#cors)).
- **CHAP:** the [sidecar](../bridge/attachments.md#podcast-chap-attachments)
  is a version-1 stem-prefixed `chapters.json` using `from:id3_chap`, Fetch timestamp and one matching
  basename/size/duration. No ASR/agent/generated flag; server consumes valid
  times directly and returns optional `chapters_source:id3_chap`. Invalid/0/1
  lists install audio without CHAP. Shared `publish-v1.json` fixes journal/list.
- **Mapping/rescan:** `.audiosilo/library.json` v1 holds `{library_id,nonce}`;
  `GET /bridge/libraries/{id}/marker` returns the matching nonce, regular file
  only, at most 4 KiB, no marker-directory symlink. Podcast sample-book lookup
  without a path is `404 no_book`. Podcast `POST /bridge/rescan` indexes a show
  or the show of an indexed episode; attachments mode and `from` are refused.
- **Secrets/HTTP:** feed URLs stay out of private files, persisted job params,
  listings and logs. The server holds the pending credential in memory and
  injects it into the claim only; restart before claim is `request_expired`.
  The Bridge seals it before local claim storage and keeps the show credential
  in its vault. `feed_secret_missing` is repaired by following the URL again.
  Feed/artwork/audio HTTP checks all DNS results and every dial/redirect, with no
  proxy and cross-origin source credential stripping; private networks require
  explicit Bridge `podcasts.allow_networks`. Audio uses identity GET/no HEAD,
  independent 1024 MiB cap (1..4096) and at most three attempts. Proven resume
  requires exact 206 range/total/strong ETag; 200 restarts from zero. Checkpoints
  omit URLs and seal validators. Private enclosure resolution is a fresh
  bounded feed read, no merge; URLs stay in memory.

## 18. The ebook reader

Bridge Phase 3b-1 (capability `ebooks`, the web) and 3b-2 (the apps and the ebook in
downloads, no server change), all additive: an older client ignores the field, and
an older server has no flag, so no Read. Phase 3c-1 adds read-along maps (below);
the player's side, following the narration in the text, is 3c-2 and not built yet.

**The book's ebook.** Every `Book` the server returns carries `ebook: {path, size}`
when the scan found one readable `.epub` beside its audio (the Bridge's own rule,
`library.BookEbook`: one in a folder book's folder, several being none, or
`<stem>.epub` beside a single-file book; [the scan rule](../server/scanner.md#a-books-ebook)),
omitted otherwise. Mirrored as `Book.ebook?: BookEbook` in `types.ts`. Its `path`
is for display only.

**The bytes.** `GET /libraries/{id}/ebook?path=<the book's path>`, the
`Authorization` header only: never `?token=`, and no URL token of any kind
([the reference](../server/api/reference.md#get-apiv1librariesidebook)). The web
player's `client.ebook()` fetches it and posts the bytes to the reader; nothing ever
holds a URL that carries a credential. The apps (3b-2) download it with the header
into a local file and post it to the reader in base64 chunks
([the app host](../frontend/reader.md#the-app-host)).

**The place.** `GET`/`PUT /libraries/{id}/reading-progress?path=` keyed on the
**book's** path, under Sync v2's rule: a save carries `base_version`, a diverged
save keeps the further place and answers the other as `other_place`
([the rule](../server/api/reference.md#the-conflict-rule-sync-v2)). Mirrored as
`ReadingProgress`, `ReadingProgressInput`, `ReadingProgressSaved`, `OtherReadingPlace`
and the client's `readingProgress()` / `saveReadingProgress()` (read through
`useReadingPlace`); the player's queue sends the last
version it acknowledged ([the reading place](../frontend/reader.md#the-reading-place)).
`device_name` is the server's, from the saving token. Listening progress is
untouched; it adopts the same rule later.

**The reader document.** The frontend builds `public/reader.html` (vendored
foliate-js, one inline script); the web export ships it as `reader.html`; the server
serves it at `/web/reader.html` under `readerCSP` (the hash of that script, computed
at serve time, `connect-src 'none'`, `frame-ancestors 'self'`, `X-Frame-Options:
SAMEORIGIN`), not the player's `htmlCSP`. The apps' variant of the document is
bundled in the app (`reader-html.native.ts`, the same CSP) and never fetched from the
server. The host-reader `postMessage` protocol is the frontend's alone
([the protocol](../frontend/reader.md#the-protocol)). The player's service worker
(`public/sw.js`) must never answer the document with the app shell, which would boot
the whole player inside the reader's frame.

**Read-along maps** (Phase 3c-1, capability `readalong`). A Bridge's
`readalong.align` job ([§16](#16-the-bridge)) writes the book's
`.audiosilo/readalong.json`: sentence spans as EPUB CFIs that match foliate's
`epubcfi.js` (UTF-16 offsets) with whole-book `start`/`end` seconds, the ebook's
sha256 and the audio files it was made from, book-relative
([the format](../bridge/readalong.md#the-map-audiosilo-readalongv1)). The server
stores only the checked head (migration `0058`), hashes the ebook of a book with a
map only, and answers `Book.readalong` on `/item` (never a list row):
`{state: "ready", coverage, generated_at}` or `{state: "stale", reason}`
(`ebook_changed`, `audio_changed`). `GET /libraries/{id}/readalong?path=` is header
auth only, as `/ebook`, re-checks the file against the book on every request, and
answers `404 no_readalong` or `409 readalong_stale`
([the reference](../server/api/reference.md#get-apiv1librariesidreadalong)). The
player will show its Text panel only for a `ready` map of a book it can read
(planned, 3c-2).

**A change requires:** a new field on the place or the conflict rule changes both
repos (and is the same rule listening progress will reuse); the reader document's
policy and the player's route names are coupled (`/web/reader*` is the document, so
the player never has a `/reader` route); any URL credential for the ebook is a
security-critical change with allowed and denied tests on the server.

## The wire-change checklist

Every change to the wire format follows the same shape (the worked example in
CROSS-REPO.md is the listening-history feature):

1. **Server**: add/modify the handler in `internal/api/handlers_*.go`; wire the
   route in `internal/api/api.go`; keep business logic in
   `auth`/`catalog`/`library`/`media` (the `api` package is transport-only).
2. **Server test**: `internal/api/*_test.go` (security-critical paths need both an
   allowed and a denied test).
3. **Frontend types**: mirror the shape in `src/api/types.ts`.
4. **Frontend client**: add/extend the method in `src/api/client.ts`.
5. **Frontend hooks**: expose it via `src/api/hooks.ts`; consume it in a screen.
6. **Frontend test**: `src/api/client.test.ts`.
7. **The Bridge**, if it reads the changed shape (the `/bridge/*` routes): update
   its `internal/link` + its tests ([§16](#16-the-bridge)).
8. **Update `~/dev/audiosilo/CROSS-REPO.md`** - the seam catalog must describe the
   new reality (ideally edited first, as the design step).
9. Run **each touched repo's full gate** ([gates and CI](../contributing/gates-and-ci.md))
   and land the PRs as a mentioned pair.

The step-by-step contributor walkthrough is
[cross-repo changes](../contributing/cross-repo-changes.md).
