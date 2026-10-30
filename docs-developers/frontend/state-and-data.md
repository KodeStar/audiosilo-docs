---
title: State & data
description: "The typed API client and its hand-mirrored types, React Query conventions, capability gating in the screens, the annotations data layer, Home and Search's models (including the character spoiler rules), the Zustand stores, offline-safe progress sync, reachability tracking, and the two storage layers."
---

The data layer follows one split consistently: **server state lives in TanStack
Query** (fetched through a typed client), **client state lives in Zustand
stores**, and **anything durable is persisted path-keyed** through one of two
storage layers.

## The API client (`src/api/client.ts`)

`ApiClient` is a thin, fully-typed fetch wrapper over the server's REST API -
one instance per server connection, holding the base URL and (optional) session
token. See the [API reference](../server/api/reference.md) for the endpoints
themselves.

- **Envelope unwrapping.** The Go handlers wrap lists (`{ libraries }`,
  `{ books }`, `{ progress }`, `{ bookmarks }`, `{ notes }`, `{ favourites }`,
  `{ history }`); the client methods unwrap them and default `null` to `[]`, so
  callers always get plain arrays. Auth returns `{ token, user }`; `/me`
  returns the user directly.
- **Error mapping.** Any non-2xx throws `ApiError(status, message, code?)`
  carrying the server's `{ error }` string and, when the route gives one, its
  machine-readable `code`. Screens branch on `apiErrorKind(e)`, never on the
  message (the server's English, never shown): the code when it is one the app
  knows (the `API_ERROR_CODES` list: `member_limit`, `username_taken`,
  `invalid_name`, `invalid_collections`, `feature_off`, `not_allowed`,
  `member_cannot_manage`, `member_disabled`, `kid_account`, `demo_account`, and
  the Bridge's `library_not_writable`, `kind_unavailable`, `detect_open`,
  `contribute_open`, `generate_open`, `readalong_open` and `no_ebook`, and the
  read-along map's `no_readalong` and `readalong_stale`), else
  the status's kind (`too_many` 429, `not_found` 404, `forbidden` 403, `invalid`
  400, `conflict` 409, `failed` for anything else or no answer), so an older
  server without codes still reads sensibly. A new code needs a case in the list
  and its words in the screens, or it reads by its status. A request that exceeds the client timeout
  (default 15 s, enforced with an internal `AbortController`) throws
  `TimeoutError` - deliberately distinct from the `AbortError` a
  caller-supplied signal raises, so the reachability layer can classify a
  timeout as "server unreachable" while ignoring deliberate cancels.
- **Client identification.** `request()` sends
  `X-AudioSilo-Client: AudioSilo/<APP_VERSION, or dev> (<Platform.OS>)` on every
  API call (`clientIdentity` in `src/lib/client-id.ts`), so the server records
  which app and build owns each session token for the admin console. Native
  always sends it. On web, `shouldIdentify` sends it **only when the API base URL
  is same-origin with the page**: a custom header makes a cross-origin request
  non-simple (a CORS preflight), and servers released before the header don't
  list it in `Access-Control-Allow-Headers`, so a newer web build would fail
  every cross-origin call to an older server. The embedded `/web` player is
  same-origin and always identifies itself; a dev build on `:8081` against a
  server on `:8080` doesn't. `authHeaders()` (used by the media layers) doesn't
  carry it - the server keeps the stored app when a request has no header. See
  [Client identification](../server/api/index.md#client-identification-x-audiosilo-client).
- **Path-addressed everything.** Content calls are
  `GET /libraries/{id}/{item,chapters,cover,stream}?path=…` etc.; the path
  rides as a query param (never a URL segment - encoded slashes are a trap).
- **`mediaTokenQuery`.** Cover and stream URLs embed the session token as
  `?token=` **on every platform** - required on web, where `<img>`/`<audio>`
  can't set an `Authorization` header, and used uniformly so media auth never
  depends on whether a given native library forwards custom headers. Native
  additionally passes `authHeaders()` on the playback track/artwork requests as
  belt-and-braces. The server side of this seam is the media-GET `?token=`
  fallback in `internal/api/middleware.go` - see
  [auth & security](../server/auth-and-security.md).
- **`streamUrl(libraryId, path, download?, opts?)`** can request the
  download-disposition variant (`download=1`, used by the download engines) and
  an on-the-fly MP3 transcode (`transcode=1`, `t=<seconds>` for a mid-file
  start); when the web player uses it is
  [web transcode negotiation](playback.md#web-transcode-negotiation-transcodets).
- **`history(libraryId, path, limit?)`** returns a book's listening spans, newest
  first ([`limit`](../server/api/reference.md#get-apiv1librariesidhistory) as the
  server takes it); the end credits ask for 500 to sum the time listened.
- **`coverUrl(libraryId, path, opts?)`** takes `{ size, version }`: `size`
  (`CoverSize`, `160 | 320 | 640`) asks for a JPEG thumbnail whose **longer side**
  is at most that many pixels, and only when the server advertises `cover_sizes`
  (any other value is a `400`; an older server ignores it and sends the full art).
  A thumbnail is a `404` when none can be made (art the server can't decode, or
  over 40 megapixels) while the full-art URL may still serve it, so fall back to
  the URL without `size`. `version` is the book's `cover_version`, appended as
  `v=` purely as a cache buster (the server ignores it); it is not a content hash
  (see `Book.cover_version` in `types.ts` for when it moves). An empty version
  adds nothing. With no options the URL is exactly what it was before
  (`?path=&token=`).

## `types.ts` - the mirroring rule

`src/api/types.ts` holds hand-written TypeScript mirrors of the server's JSON
shapes (`ServerInfo`, `User`, `Book`, `Chapter`, `ChaptersResponse`,
`Progress`, `Favourite`, …). There is **no codegen**: a wire-format change must
touch the Go handler *and* this file (plus `client.ts`/`hooks.ts` and tests on
both sides) in one logical change. This is the core of the
[cross-repo contract](../architecture/cross-repo-contract.md); the workflow is
described in [making cross-repo changes](../contributing/cross-repo-changes.md).

Also worth internalizing from the comments in that file: `Book.id` exists but
is an internal index artifact - identity is `(library_id, rel_path)`, and
`dedup_key` is a display-grouping hint, never something to key durable state on.

## React Query (`src/api/hooks.ts`, `src/api/provider.tsx`)

The `QueryClient` is a module-level singleton (`queryClient` in `provider.tsx`)
with `retry: 1`, `staleTime: 30s`, and `refetchOnWindowFocus: false`. Being
module-level matters: non-React code (the playback and downloads stores) uses
it to invalidate and seed queries.

**Key conventions.** All keys come from the `qk` factory and are **scoped by
connection id** as their first coordinate (the app can be signed in to several
servers at once, and two of them can each have a "library 1"): `qk.item(cid, lib,
path)`, `qk.chapters(cid, lib, path)`, `qk.progress(cid, lib, path)`,
`qk.allProgress(cid)`, `qk.bookmarks/notes/history(cid, lib, path)`,
`qk.favourites(cid)`, `qk.libraries(cid)`, `qk.browse(cid, lib, path)`,
`qk.bookMeta(cid, lib, path, opts?)`, `qk.metaWork(cid, workId)`, `qk.authors/narrators/seriesList(cid, lib)`,
`qk.libraryBooks(cid, lib, query)`, `qk.nextBook(cid, lib, path)`, `qk.server(cid)`, `qk.myHistory(cid)`,
`qk.myBookmarks(cid)`, `qk.myNotes(cid)` - so mutations can invalidate
precisely and one server's cache never shadows another's. Content keys are `(connectionId, libraryId, path)` tuples,
extending the path-is-identity rule across connections.

Patterns to copy when adding an endpoint:

- Plain reads: `useQuery` + a `qk` key + `enabled: path.length > 0` guards.
- Paged reads: `useBrowseInfinite` uses `useInfiniteQuery` against the server's
  `next_offset` cursor (500-entry pages); the browse screen drains all pages so
  the A–Z rail and filter operate on the complete folder. The across-books lists
  are infinite query options, [below](#bookmarks-notes-and-the-journal). The
  community metadata reads are query options too (`bookMetaQuery`, `metaWorkQuery`),
  shared by `useBookMeta` / `useMetaWork`, the offline companion and Search.
- Mutations invalidate their exact key on success (`useAddNote`,
  `useDeleteBookmark`, …; `addBookmark()` is the framework-free twin for callers
  outside React and invalidates `qk.bookmarks` and `qk.myBookmarks` after the
  write). `useToggleFavourite` shows the full optimistic pattern:
  `onMutate` cancels + snapshots + patches the cached list, `onError` rolls
  back, `onSettled` invalidates to reconcile server-derived fields. The server
  derives a favourite's `is_book` from its index, so hearting a folder `/fs` flags
  `pending_book` (`pendingBook` in `ToggleFavouriteVars`) also reads the book
  through the item query beside the add (`GET /item` indexes it on demand; asked
  once, `networkMode: 'always'`, no retry, best effort) and, once that read
  succeeds, marks the parent folder's browse listing stale. The optimistic stub is
  `is_book: true`, and the mutation settles only once both are done, so Favourites
  and Home show a book, not a folder (a failed read leaves the server's answer a
  folder until a scan indexes it; the favourite is saved either way). Toggles of
  one connection run one at a time (the mutation `scope`),
  and only the last of a run invalidates the list, so an earlier answer can't flip
  the heart back.
- `useMarkFinished` deliberately routes through the offline-aware
  `saveProgress` (below) instead of a bare mutation, so a "mark finished"
  reconciles with playback progress under the same last-write-wins rules.
- `useServerInfo` uses `useOptionalApi` + `enabled: !!api` and a 5-minute
  `staleTime`, so chrome that renders before a connection exists is safe.

**Multi-connection support.** The app can be signed in to several servers at
once. `ApiProvider` builds an `ApiClient` per connection (memoized on the
connection list, so switching the active server doesn't recreate clients) and
exposes them via `useApi(connectionId?)` (active by default, throws if none),
`useOptionalApi`, and `useApis` (the person listening's: the active profile's
connections, none while someone must be chosen; see
[Profiles](profiles.md#visible-and-background-connections)). The `use*All` hooks
(`useLibrariesAll`, `useSearchAll`, `useRecentAll`, `useFavouritesAll`,
`useAllProgressAll`, `useBookCopies`) fan out with `useQueries` + `combine`,
tag results with their connection, and de-duplicate books via `src/lib/dedup.ts`
(source order = user's connection order breaks ties). `useSourceLabeller` names
where a result lives ("server · library") for de-duplicated rows.

`provider.tsx` also registers an `onReconnect` handler that invalidates **all**
queries when the server becomes reachable again - screens that errored or
emptied while offline repopulate without a remount. Since 2.4.1 the query cache
also tells reachability what a query learnt (frontend#131): `onError` hands a
failure to `noteFailure`, and `onSuccess` for a connection marked down asks for
a check (`recheckReachability`; the public `/server` query's success is that
check's own answer, `noteSuccess`). No other query sets the state itself: a
failure or a success only asks for a check (below).

The default retry is `retryQuery`: once, never for a 401 (frontend#124). A
refused token stays refused, so a retry only doubled every dead request. A
screen whose load failed for a connection that needs signing in again
(`useSignedOutConnections`, the person listening's connections with
`needsReconnect`) shows one `SignInAgainState` ("Sign in again to
&lt;server&gt;", with the banner's Reconnect flow, `reconnectConnection`) in
place of its load error, its Retry and its empty state: Home's Now card (and
Recently added hides its error), the Library (`refusedConnection` over the
library groups when it has no library to show, and in Folders mode; Books mode
too), Up next (a compact row), You > Stats and Year (`useSignedOutConnection(cid)`
when their reads fail), and, through `LoadFailedNote` (the sign-in state for
the page's `cid`, else the `ErrorNote` with its Retry), the book page, the
episode page and folder browse (2.4.1, CONNECT-03). Its components are in
`src/components/layout/sign-in-again.tsx`.

Folders mode lists one group per server that has libraries or failed to list
them, each under its server's name when there are several. A failed group that
is not signed out shows "Couldn't load libraries from &lt;server&gt;."
(`library.list.loadServerLibrariesError`) with a Retry that refetches only that
server's list (`useLibrariesAll().retryServer(connectionId)`).

### The startup cache (web)

`src/api/startup-cache.ts` keeps the answers the first screens paint from, so
a reload of the web player paints at once and asks again behind it (a "stale
while revalidate" start). Without it a reload waited for `/server`, the
libraries and the first page of books before a single cover was drawn. A start
with nothing kept (a first visit, a private window) asks the same first answers
as the gate opens instead (see
[the web start](overview.md#the-web-start-a-split-build)).

- **What is kept** (`isStartupQuery`): `/server`, the libraries, favourites,
  the queue, collections, the listening goal, the household, the author,
  narrator and series lists, Home's shelves and cards (Recently added, Continue
  listening, the Now card's and This week's ranges) and, of the whole-library
  list (`useWholeLibrary`, the one the Library grid paints from), only its
  first page. Never a book's detail or anything per book; a new first-screen
  query joins the list only if it is small.
- **Restore.** `provider.tsx` calls `restore(queryClient, { dropOnError })` at
  module load, before anything renders: each kept answer goes into the query
  cache invalidated (a query already there is left alone), so it shows until
  the new one lands. Each is asked again by its first observer, also one with
  `refetchOnMount: false` (a tile's saved progress, Up next), which would
  otherwise keep the last visit's answer as the truth. A kept answer whose ask
  fails with a refused token (`isSignedOutError`, a 401) is cleared, so the
  screen shows the sign-in state rather than the last visit's.
- **Save.** `startSaving` writes the document `SAVE_DELAY_MS` (2 s) after a kept
  query's answer (debounced) and when the page is hidden or left, only for the
  signed-in connections. Each entry is written while the document stays under
  `MAX_CHARS` (500,000 characters, about 100 KB for a 1,000-book library):
  localStorage's small per-origin quota is shared with the session, the progress
  queue and the downloads registry, whose writes fail quietly once it is full.
- **Scope.** It lives under `STARTUP_CACHE_KEY` (`audiosilo.startupCache`), one
  of the scoped keys, so a storage reset wipes it; signing out or removing a
  connection drops its entries (`forget`), and every key carries its
  connection id, so another connection's or a signed-out one's entry is never
  read. A document written by another app version is ignored (the answers'
  shapes may have changed).
- **Native keeps none**: its query cache lives as long as the app, a cold
  start is not a browser reload, and AsyncStorage can't be read before the
  first render.

### Capability-gated reads (player redesign Phase 1a)

The player redesign's data layer landed ahead of its screens: these methods and
hooks are tested in `client.test.ts` and `hooks-capability.test.tsx`, and the
Phase 2 browse screens consume them (see
[Who reads what](#who-reads-what-phase-2) below).

**`useCapability(flag, connectionId?)`** (exported from `hooks.ts`) is tri-state:
`undefined` while the connection's `/server` info is unknown (still loading, or
unreachable), then `true` or `false` (a server that predates the flag reads
`false`). A screen picks its fallback, or hides the feature, on `false`, and on
`undefined` waits or decides for itself. Outside React, `cachedCapability(cid, flag)`
reads the cached flag without asking, and `fetchCapabilities(cid, client)` reads the
flags through `fetchFailFast` - `fetchQuery` with `networkMode: 'always'` and no
retry, after cancelling a paused fetch a mounted hook holds for the same key, so a
framework-free reader (the play path, the end of a book, keep-ahead) always settles
instead of waiting for the browser's online flag or a hidden tab's focus - falling
back to the cached flags when the server can't be read. `useServerInfo(connectionId?)` takes the
same optional connection id as `useCapability` and keeps its answer (`gcTime: Infinity`), so a gated
hook mounted later starts from the known flags.

Each gated hook asks only a server whose flag is `true`. Until then its query has
**no function at all** (`skipToken`), so not even a manual `refetch` reaches an
older server (React Query rejects it instead) and the query stays pending.

| Client method | Hook | Capability | Endpoint |
|---|---|---|---|
| `listBooks(lib, { author, series, narrator, sort, limit, cursor })` | `useLibraryBooks(lib, query?, connectionId?)` | `browse_people`, only when `query.narrator` is set | `GET /libraries/{id}/books` (keyset pages of 100, `BookPage`; key `qk.libraryBooks`) |
| `authors(lib)` / `narrators(lib)` | `useAuthors` / `useNarrators(lib, connectionId?)` | `browse_people` | `GET /libraries/{id}/authors`, `/narrators` |
| `seriesList(lib)` | `useSeriesList(lib, connectionId?)` | `browse_people` | `GET /libraries/{id}/series` (`SeriesCount[]`) |
| `seriesBooks(lib, names, { limit })` / `seriesBooksPage(lib, name, { limit })` | `useLibraryBooks(..., { batch: true })` (the Series cards, through `useSeriesBooks`) | `series_books` picks this endpoint for the first page; without it the hook still asks `listBooks` | `GET /libraries/{id}/series/books?name=...` (`SeriesBooks`, one `SeriesBooksEntry` per distinct name) |
| `nextBook(lib, path)` | `useNextBook(lib, path, enabled?, connectionId?)` | `next_book` | `GET /libraries/{id}/next` (`NextBook`) |
| `bookMeta(lib, path, signal, { includePrevious, hideSpoilers })` | `useBookMeta(lib, path, enabled, opts?)` | `meta_bundle` (the caller checks it; the hook gates only on `enabled`) | `GET /libraries/{id}/meta?include=previous&spoilers=hide` |
| `coverUrl(lib, path, { size, version })` | - | `cover_sizes` for `size` | `GET /libraries/{id}/cover?size=&v=` |
| `communityCoverUrl(lib, path, coverUrl, { size })` | `useCommunityCover(cid, lib, path)` (a resolver, not a query) | `meta_covers` | `GET /libraries/{id}/meta/cover?path=&url=&size=` ([below](#community-covers-clientcommunitycoverurl)) |
| `readalong(lib, path)` | `useReadalong(lib, path, { enabled, generatedAt }, connectionId?)`, behind `useBookReadalong` | `readalong` | `GET /libraries/{id}/readalong` (the map, checked span by span: `CheckedReadalongMap`; [below](#read-along-usereadalong-and-usebookreadalong)) |
| `readalongEstimate(lib, path)` | `useReadalongEstimate(lib, path, connectionId?)` | `bridge` | `GET /admin/bridge/estimate?kind=readalong.align` (`ReadalongEstimate`, admin only) |

- **People lists are normalised.** The server answers `{ authors, unknown }` and
  `{ narrators, unknown }`; the client returns both as one shape,
  `PeopleList { people: PersonCount[], unknown: number }`, defaulting a `null`
  array to `[]` and a missing count to `0`. `seriesList` unwraps `{ series }` to
  `SeriesCount[]` and `listBooks` defaults `books` to `[]`. The three browse
  lists are whole-library aggregates, so they keep a **5-minute** `staleTime`.
- **`useLibraryBooks`** pages on the server's cursor (`BookListQuery`: exact
  `author`/`series`/`narrator`, `sort`). `author` and `series` work on every
  server; a `narrator` filter needs `browse_people`, because an older server
  ignores it and would answer with the whole library.
- **Series cards share one request.** With the `batch` option (only the Series
  cards pass it, through `useSeriesBooks(..., { batch: true })`) and `series_books`
  on the server, a plain series list (`isPlainSeriesQuery`: `series` with
  `memberships`, which `series_memberships` adds, and no other key, so no other
  filter and the default sort) fetches its **first page** through
  `client.seriesBooksPage`. That is a per-(library, page size) `createBatchLoader`
  (`src/lib/batch-loader.ts`): every series asked for within 10 ms goes out as one
  `GET /libraries/{id}/series/books` per 50 names (`SERIES_BOOKS_MAX_NAMES`), or
  fewer when long names would pass 4000 bytes of query
  (`SERIES_BATCH_MAX_QUERY_BYTES`). The page lands under the same
  `qk.libraryBooks` key as an ordinary `listBooks` answer, so the series page,
  which asks plainly, reuses the cards' cache, and later pages stay on `/books`.
  The batched fetch never reads react-query's `signal`: react-query cancels and
  throws away a fetch whose signal was read once its last observer leaves, so a
  card scrolled off before its page arrives still caches it from the shared
  request (which no caller can cancel, with the client's normal timeout).
  Without `series_books` each card asks `/books` on its own.
- **`bookMeta` options are part of the key.** `qk.bookMeta(cid, lib, path, opts)`
  adds a variant segment only when an option is set, under the plain key as a
  prefix (invalidating the plain key reaches every variant). A `hideSpoilers`
  envelope is cut at the caller's saved progress when it is fetched, so it keeps
  the default 30 s `staleTime` instead of an hour.
- **Longer timeouts for upstream waits.** `nextBook` and `bookMeta` with
  `includePrevious` use a 30 s request timeout (the server's own request budget)
  instead of the client's 15 s, because the server can spend its whole
  community-metadata budget before answering.
- **`useNextBook`** takes an optional `connectionId` like `useBook`, so the player
  (outside any route scope) can ask the playing book's own server, and an
  `enabled` flag so it fetches only when the answer is needed. A community `next`
  can be in another of the caller's libraries: open it by its own `library_id`.
  The end-of-book flow asks it through `resolveUpNext` after the Up next queue,
  keeping the device-side folder sibling as the fallback for a server without
  `next_book` ([The end of a book](end-of-book.md#what-plays-next-up-next-resolverts)).
- **New wire fields** (all optional, absent on older servers): `Book.published`,
  `description` (`/item` only), `cover_color` (`CoverColor { bg, accent?,
  on_accent? }`, read by the cover wash) and `cover_version` (the cover cache
  buster); `BookMetaWork.community_description` and `attribution`
  (`BookMetaAttribution`: the server writes the CC BY-SA credit, and a screen that
  shows community content must render it beside that content, never compose it -
  the series page and Search's character group do); `BookMetaRecording.chapter_count`;
  `local` (`BookRef`) on rail entries (how the series page and Next in your series
  tell an owned book from a ghost); and `previous` on a matched `BookMeta`.
  `community_description` feeds the book page's About card (`aboutContent`), and
  `previous` is kept and seeded by the [offline companion](offline.md#the-offline-companion-offline-metats);
  `chapter_count` has no reader yet.

### Who reads what (Phase 2)

Every screen reads a capability with `useCapability(flag, connectionId)` for the
connection it is about, and treats the three states the same way: `undefined`
(the `/server` answer isn't in) hides the feature or waits, never shows it and
takes it away; `false` hides it (or picks the old behaviour); `true` shows it.
Cross-server screens ask per connection (`useCapabilitiesAll` /
`anyCapability` in `src/components/search/use-search-sources.ts`).

| Capability | Read by |
|---|---|
| `browse_people` | the Library's Authors / Series / Narrators modes and their counts, the person pages (`narrator=` filter), Search's series and people groups, Home's "&lt;narrator&gt; reads" shelf |
| `series_books` | the Library's Series cards and Search's series results (one request for the cards on screen; without it, one `/books` per card) |
| `next_book` | Home's Next in your series (`useNextInSeries`, one `/next` per candidate on its own server), Up next's suggestions, keep-ahead's series window |
| `metadata` | the series page's community rails (`useBookMeta` + `useMetaWork`), the Now card's Who's who / Story so far, Search's character sources |
| `cover_sizes` | `BookCover`'s thumbnail choice |
| `queue` | every Up next entry point and panel, the book menu's Up next item, the series page's Queue it (else Play), keep-ahead's queue window |
| `collections` | the Collections mode, the collection page, the book menu's Add to collection |
| `progress_edit` | the book menu's Mark as not finished, and Mark as finished with Undo (without it: `useMarkFinished`, no Undo) |
| `user_stats` | Home's This week card, the Now card's finish date and the "&lt;narrator&gt; reads" shelf's top narrator (`useMyStats('30d')`, `useMyListening`, `useListeningGoal`) |
| `ratings` | the end credits' and the book page's stars (`useBookRating`) |
| `annotations` | bookmark labels in the editor and on the one-tap toast's Add note, Edit on bookmark and note rows, "See all in your journal", the Journal's Bookmarks and Notes lists and their export (the full list: [Where the capability matters](annotations.md#where-the-capability-matters)) |
| `user_stats` (You) | Your listening (`StatsSection`: `useMyListening('1y')`, `useMyStats('year')`, the goal hooks) and Year in listening (`useYearStory`: `useMyStats(range)`, past years probed by `useStoryYears`); see [You, Settings and Account](you-and-settings.md) |
| `my_devices` | the Account page's signed-in devices and the identity card's device count (`useMyDevices`, `useRevokeMyDevice`, never on the current device) |
| `addresses` | the Account page's At home and away card (`useServerAddresses`) and the native address runner's refresh (`addressesQuery`); see [Connect and home/away addresses](connect-and-addresses.md#home-and-away-addresses) |
| `household` | Home's Listening in the house row, the book page's In the house card and the sharing switch (`useHousehold`, `useSetHousehold`, `useHouseListening`); see [Listening in the house](listening-in-the-house.md) |
| `ebooks` | Read the ebook on the book page (`canRead`, [the rule](reader.md#read-on-the-book-page)) and the reader screen's own check; see [The ebook reader](reader.md) |
| `readalong` | the companion's Text tab, the full-screen reader's Follow narration (`readalongReady`), the admin's Make read-along (`mayMakeReadalong`, with `bridge` and the Bridge's `readalong` feature), the map in downloads (`wantsReadalong`); see [Read-along](reader.md#read-along-following-the-narration) |
| `upcoming` | Home's Coming up in your series, the `/upcoming` page and the You hub's Upcoming section (`useUpcomingAll`, `useUpcomingAvailable`; never asked for a kid); see [Upcoming releases](#upcoming-releases) |
| `upcoming_calendar` | the Add to your calendar card's row for that connection (`calendarConnections`; never a kid's); see [The upcoming calendar](#the-upcoming-calendar) |
| `upcoming_covers` | an upcoming item's real cover over its ghost (`UpcomingCover`, from the item's own connection, only when `true`, never while unknown); see [Upcoming releases](#upcoming-releases) |
| `cast` | the Cast button and `prepareCast` (no flag, or flags not known yet: no button, and a cast is refused); see [Chromecast](chromecast.md) |

Writes from screens follow the [1b write rules](#the-listeners-own-state-player-redesign-phase-1b)
(positioned adds, exact-path removes): Up next's drag/keys and a collection's Move
up / Move down send `position` = the visible index (`moveIndex` in
`collections-model.ts`, `moveItem` in `up-next-model.ts`), and an Undo re-adds at
the old index. `useSetQueue` / `useSetCollectionItems` have no caller.

### Read-along (`useReadalong` and `useBookReadalong`)

Bridge Phase 3c-2. `Book.readalong` (`BookReadalong`: `state` `ready` with
`coverage` and `generated_at`, or `stale` with a `reason`, `ebook_changed` or
`audio_changed`) rides only on `GET /libraries/{id}/item`, never a list row, and is
absent on older servers and for a book with no ebook or no valid map. The map itself
(`ReadalongMap`, hand-mirrored from the Bridge's `internal/readalong` mapfile;
`ReadalongSpan` is `{cfi, start, end}` in whole-book seconds) comes from
`client.readalong`, checked span by span as [The ebook reader](reader.md#the-map)
describes.

- **`useReadalong`** is keyed by the map's `generated_at` (`qk.readalong(cid, lib,
  path, generatedAt)`), `staleTime: Infinity`, **no retry**: a 404 `no_readalong` or a
  409 `readalong_stale` is final. A map is one `generated_at`, so no copy is ever
  fetched twice; a map made again comes under its new key once the item names it. A
  done `readalong.align` job reads the book's item again (`refreshAfterFinish`, the
  same as a generate or detect job), and `useBridgeJobs` polls the book's jobs while
  a read-along job is open on a surface on screen.
- **`useBookReadalong`** (`src/reader/use-book-readalong.ts`) is what the surfaces
  call: it picks the download's copy or the server's map; its contract is on
  [The ebook reader](reader.md#the-map).
- **`useReadalongEstimate`** sits under the book's `qk.bridgeEstimate` prefix
  (`qk.readalongEstimate`), so a refused queue reads it again with the other
  estimates; it gets `bridgeEstimate`'s longer budget, since the server may hash the
  ebook first. `ReadalongEstimate` carries `asr_hours`, `figures`, `writable`, the
  book's `ebook` (null: the job would be refused 409 `no_ebook`), its `readalong` now
  and the `open_job` a new one would be or wait for.
- **The job**: `readalong.align`, queued with `useQueueBridgeJob` and params `{}`;
  its result on `done` is `ReadalongAlignResult` (the file written, `coverage`,
  `sections`, `spans`, `audio_gaps`, `heal_windows`, `transcribed`,
  `ebook_sha256`).

### Player modules (`src/modules/`)

A server's [managed modules](../server/modules.md) ship off; an admin turns one on in
the console, and its capability flag (named after the module) reads `true` only while
it is on **and** its Bridge requirement is met. The player's side is its own registry,
`PLAYER_MODULES` in `src/modules/registry.ts` (not the repo-root `modules/`, which
holds the native Expo modules). It is **empty** through Bridge Phase 2b: the slots
are open and exercised only by tests, so the player renders exactly as before. The
Contributions module's actions are the console's: the player never contributes.

- **A module** is a `PlayerModule`: `{id, homeRails?, youSections?, bookActions?}`,
  each slot optional:
  - `homeRails` renders once on Home, after Next in your series (`ModuleRails`).
  - `youSections` (`{key, label, render}`, a `YouModuleSection`) are sections of the
    You hub, after Account on a phone and after Journal in the wide sub-nav. `label`
    is a function of `t`, so it follows the language; `render` returns a column the
    hub scrolls.
  - `bookActions` adds items to the book page's menu (`HeroActions`, after
    Regenerate) for a book whose server has the flag, each keyed `<id>:<key>` so it
    never meets the menu's own keys or another module's.
  - Hooks: a slot returns elements, so its hooks live in the components it returns.
    The slots call `homeRails` and `render` inside a component of their own, so a
    hook stays with its module as the active list changes. `bookActions` is a plain
    function, never a hook.
- **The You hub's keys.** `youModuleSections(active)` maps the active modules' sections
  by key, in registry order: the first of a key wins, and a blank key or one of the
  hub's own (`CoreYouSection`) is ignored. `parseYouSection(raw, moduleKeys)` opens an
  active module's key and Stats for an off module's link. A link (`youHref`, `openYou`)
  takes the hub's own sections only.
- **Which are on.** `useActiveModules(list)` keeps the modules some server of the
  person listening has on (`anyCapability` over `useCapabilitiesAll`); `useModulesOn(cid,
  list)` one server's, since a book's actions go to its own server. Each slot reads
  them through `WithActiveModules` (`active-modules.tsx`), which asks nothing with an
  empty list. Slots take an optional `modules` prop (default the registry), which the
  tests fill with a fake.
- **Module flags are mirrored.** A module's `id` is a `ModuleFlag` (`registry.ts`): a
  flag added to `Capabilities` in `types.ts` like any other and named in `ModuleFlag`
  too, never a core flag such as `queue` (the server refuses a module named after
  one). The capability hooks keep their closed key (`keyof Capabilities`), so a typo
  in a flag name stays a type error. `Capabilities.contributions` is typed already and
  read by nothing yet; `ServerInfo.bridge.features` may hold `contribute`.
- The book page's tabs (`BookTab`), the book menu's own keys (`BookActionKey`) and
  Settings' sections (`SettingsSection`) stay closed until a module needs them.

### The listener's own state (player redesign Phase 1b)

Phase 1b adds the listener's own state to the data layer the same way: typed
mirrors in `types.ts`, methods in `client.ts` and hooks in `hooks.ts`, each gated
on its capability. Phase 2 consumes `queue`, `collections`, `progress_edit` and
`user_stats`; Phase 3's end credits read `ratings` (`useRating` + `useMyRatings`,
`useSetRating`) and the year's stats; the You hub reads `user_stats` and `my_devices` (Your listening, Year in listening, the Account page's devices).

| Capability | Query hooks | Mutation hooks | Types |
|---|---|---|---|
| `queue` | `useQueue` | `useSetQueue`, `useAddToQueue`, `useRemoveFromQueue` | `QueueEntry` (an alias of `BookListEntry`) |
| `collections` | `useCollections`, `useCollection(id)`, `useShareTargets(enabled)` | `useCreateCollection`, `useUpdateCollection`, `useDeleteCollection`, `useSetCollectionItems`, `useAddCollectionItem`, `useRemoveCollectionItem`, `useSetCollectionShares` | `Collection`, `CollectionDetail`, `CollectionItem` (= `BookListEntry`), `CollectionInput`, `CollectionPatch`, `ShareTarget` (= `UserRef`) |
| `ratings` | `useRating(lib, path)`, `useMyRatings` | `useSetRating`, `useDeleteRating` | `Rating`, `RatedBook`, `RatingValue` |
| `progress_edit` | - | `useEditProgress` | `ProgressEdit`; `started_at?` / `finished_at?` on `Progress` |
| `user_stats` | `useMyStats(range)`, `useMyListening(range)`, `useListeningGoal` | `useSetListeningGoal`, `useClearListeningGoal` | `UserStats` (with `StatsTotals`, `ListeningDay`, `StatsTopBook`, `StatsTopName`, `StatsFinishedBook`, `StatsPlayback`, `StatsClient`; `StatsRange`), `MyListening`, `ListeningGoal`, `ListeningGoalStatus` |
| `my_devices` | `useMyDevices` | `useRevokeMyDevice` | `MyDevice`, `MyDeviceRevoked`, `ClientInfo` |

Every hook takes an optional trailing `connectionId`, and the keys are
connection-scoped like the rest (`qk.queue`, `qk.collections`, `qk.collection`,
`qk.shareTargets`, `qk.rating`, `qk.myRatings`, `qk.myStats`, `qk.myListening`,
`qk.listeningGoal`, `qk.myDevices`).

- **Queries** are gated like the Phase 1a reads: `useCapability` plus
  `skipToken`, so a server without the flag is never asked.
- **Mutations go through `useCapabilityMutation`**, which checks the flag when
  the mutation runs. When the flag is false, or `/server` hasn't answered yet,
  it rejects with the exported **`CapabilityError`** and sends nothing, so an
  older server never answers a write with a bare `404`. `.capability` names the
  flag, and `.unknown` is true (with its own message) when `/server` simply
  hasn't answered yet. It is not an `ApiError`, so it never raises the reconnect
  banner.
- **One connection, one write at a time.** Writes of one capability on one
  connection run one after another, in the order they were made (a React Query
  `scope`), so the server applies them and the cache takes their answers in that
  order. Each mutation's `mutationKey` names its connection, so a hook switched to
  another connection never sends a queued write there.
- **The cache write is part of the mutation.** It runs inside the mutation
  function, against the connection the request went to, before the mutation
  resolves. Answers land through `storeAnswer`: it cancels an in-flight read of
  the same key (which may have been answered before the write), keeps a pending
  refresh, and refetches when it can't place the answer. Every list write
  answers with the stored list, and a whole-list `PUT` silently skips entries
  that aren't an indexed book the caller can open, so the cache holds the
  server's answer, never what was sent; nothing is optimistic. A list entry
  carries `book` only while its path is indexed; render it by its path leaf
  otherwise.
- **Bodies carry only the contract's fields**, because the server decodes
  strictly (an unknown key is a `400`). `setQueue` / `setCollectionItems` send
  only `{ library_id, path }` per item, so cached entries (with `added_at` and
  `book`) can be passed straight back; `createCollection`, `updateCollection` and
  `editProgress` send only their own fields.
- **Reorder with positioned adds, not a whole-list replace.** A replace deletes
  the caller's hidden entries (books under a share since taken away), so moving
  one book is `useAddToQueue` / `useAddCollectionItem` with a `position`, an
  index in the list as the caller sees it. Removes and deletes (queue,
  collection items, rating) are exact-path: pass the stored `path`. Adds and
  rating `PUT`s resolve a part path to its book.
- **Viewers can't edit.** A collection with `owned: false` is shared with the
  caller read-only: writes answer `403` with `code: "not_owner"`, and
  `useDeleteCollection` on it means leave it. A deleted collection's detail is
  marked stale rather than removed.
- **`useSetRating` replaces the whole rating**: leaving the note out clears a
  saved one.
- **Progress changes refresh what depends on them.** `useEditProgress` and the
  existing `useMarkFinished` refresh the listening stats, the goal and the
  book's `spoilers=hide` metadata variant. `useEditProgress` is server-side
  only: it does **not** touch the player's local progress mirror or the offline
  queue, so a device with the book loaded overrides the edit on its next save,
  as last-write-wins intends. Creating or revoking an API key refreshes My
  devices.
- **Never revoke the current device.** The row with `current: true` is the
  device the app is on: sign out of that connection the normal way
  (`useSignOut`), which stops playback, saves the final position and flushes the
  queued progress before the token goes. Revoking it with `useRevokeMyDevice`
  would kill the token first, so those saves would be refused and lost. If it is
  revoked anyway, the answer is `{ current: true }`, the hook refetches nothing
  (a refetch would only 401 and raise the reconnect banner), and the app must
  sign out locally.
- **Streaks are computed on the device** from `useMyListening`'s `days` (server
  time).

### Household members

Capability `household_members`; the wire is
[Household members](../server/api/reference.md#household-members), the screens
[Household page and members](household.md). Types in
`types.ts`: `MemberKind`, `MemberAccess`, `HouseholdMember` (and its
`HouseholdMemberCollection`), `HouseholdMembers` (`{ allowed, reason?, max, members
}`, `HouseholdMembersReason`), `AddMemberBody`, `AddMemberResult` (`{ member,
session? }`), `UpdateMemberBody`; `User` gains the optional `managed_by` (a `UserRef`),
`member_kind` (null for a non-member, absent on an older server) and `display_name` (a
member's name as the owner typed it, absent for everyone else; `personName` names a new
profile after it), `MyDevice` gains
`member_sign_ins`, the revoke's answer is `MyDeviceRevoked` (`{ current,
members_signed_out? }`), and `Capabilities`
gains `household_members`.

`client.ts`: `members`, `addMember`, `memberSession`, `memberPairing`,
`memberDevices`, `revokeMemberDevice`, `updateMember`, `deleteMember`, and
`revokeMyDevice(id, { alsoMembers })`, which adds `?also_members=1` only when asked
(the old one-argument call is unchanged). `hooks.ts`: `useHouseholdMembers` and
`useMemberDevices(id)` (queries gated on `useCapability('household_members')` with
`skipToken`), and the mutations `useAddMember`, `useMemberSession`,
`useMemberPairing`, `useRevokeMemberDevice`, `useUpdateMember` and `useDeleteMember`
(each rejects with `CapabilityError` while the flag is off or unknown, sending
nothing, so it is never a network failure for reachability). They refresh the members list, that member's devices and, when a
sign-in on this device appears or goes, the caller's own devices (whose rows carry
`member_sign_ins`; `invalidateHousehold`); a refused write reads the list again (a 404
means the member is gone). A member change that touches sharing (`collection_ids`, a
delete) also reads the collections again, since each lists the people it is shared
with. `useRevokeMyDevice` takes `{ id, alsoMembers? }` (`RevokeMyDeviceVars`), sending
`alsoMembers` only to a server with the flag. Every connection removed from the device
(`removeConnection`, by any path) has the other connections to that server read their
household again (`onConnectionRemoved` in `hooks.ts`).

- **Refusals are read by kind** ([Error mapping](#the-api-client-srcapiclientts)).
- **The members list never refuses an ordinary session**: a demo or member caller
  gets `allowed: false` with a `reason`, and "at the cap" is the client's own
  `members.length >= max` (`addBlock` in `src/components/household/household-model.ts`).
- **A session the owner mints for this device** (the add's `session`,
  `useMemberSession`) **is placed with `addMemberHere`** (`renewMemberHere` for a
  member already here), never `finishConnect` (see
  [Signing a member in here](household.md#signing-a-member-in-here)): the owner stays
  the person listening and the default connection doesn't move. A member pairing their
  own device from the owner's code goes through `finishConnect` like anyone else.
- **What a member may open is the server's answer.** The player reads `member_kind`
  and `managed_by` only to shape its own screens, never to filter: `member_kind`
  (`isKidAccount`) starts kids mode by default, lets a kid's own profile be in kids
  mode with no grown-up (`mayTurnOnKids`) and leaves out what a kid's account can't do
  (the password button, Pair another device, API keys, house sharing); `managed_by`
  picks the kids shelf's collections ([Kids mode](kids-mode.md)), names the owner
  (`managerName`) and finds the owner's sign-in that can renew the member's session
  (`memberOwnerHere`).

### Bookmarks, notes and the Journal

The server's `annotations` capability, mirrored like the 1b state: every hook takes an
optional trailing `connectionId` and gates on the flag.

| Capability | Queries | Mutation hooks | Types |
|---|---|---|---|
| `annotations` | `myBookmarksQuery`, `myNotesQuery` | `useUpdateBookmark`, `useUpdateNote` (`useCapabilityMutation`); `useAddBookmark` / `addBookmark` send a `label` only with the flag | `BookmarkLabel`, `BookmarkPatch`, `NotePatch`, `MyBookmark`, `MyNote`, `Page<T>`, `PageQuery`; `label?` on `Bookmark` |
| none | `myHistoryQuery` (every server has `GET /me/history`) | - | `HistoryEntry` |

- **The lists across books are infinite query options**, not hooks, because the
  Journal reads every server's at once
  ([`useInfiniteQueries`](journal.md#sources-one-infinite-query-per-server)). Each is
  `pagedList`: pages of 100 on the server's opaque `next_cursor`, which the client
  normalises to `Page<T> = { items, next_cursor? }` (`flattenPages` joins them), fresh
  for five minutes since this device's own writes refresh them; a gated one has no
  query function (`skipToken`) until the flag is known to be `true`. `keepFirstPage`
  trims a list nothing reads any more to its first page, so a later visit doesn't
  refetch twenty pages one after another.
- **A label goes only to a server with the flag.** Bodies are decoded strictly
  ([Capability flags](../server/api/index.md#capability-flags---gate-your-features)):
  `ApiClient.addBookmark` sends `label` only when given, and `useAddBookmark` and the
  framework-free `addBookmark` give it only when the flag is `true` (`useCapability` /
  `cachedCapability`). `updateBookmark` and `updateNote` send only the patch's own
  fields, so a spread `Bookmark` never reaches the wire.
- **Cache writes:** an edit stores its answer in the book's own list
  (`storeAnswer`) and patches the across-books pages in place (`replaceInPages`)
  before invalidating them; a delete removes the row from the pages
  (`removeFromPages`); an add invalidates the across-books key.

The screens are [Bookmarks and notes](annotations.md) and [The Journal](journal.md);
the wire format is in the [API reference](../server/api/reference.md#patch-apiv1bookmarksid).

### Enriched book metadata

The meta-driven tabs are rendered from `src/components/library/book-meta.tsx`
(the About card is the book page's own `BookAbout`, see
[The book page](book-page.md#the-aside)):
`BookMetaRecapsTab`, `BookMetaCharactersTab`, and `BookMetaSeriesTab` (one
horizontal rail per series family). Each field is read through one of two
readers, never both: `matchedMeta(meta, enabled)` narrows the envelope once for
the screen (the matched half only: the rails, the AudioSilo Meta links, the end
credits and About's recording facts need a real community match);
`bookMetaWork(meta, enabled)` is the work About's text and every work-level field,
the Characters and Recaps tabs, their counts and the companion render: the
matched work, or an unmatched book's [generated work](../server/api/reference.md#generated-content)
(`matched: false` with a `work`, Bridge Phase 1a), so an unmatched book's generated
description (Phase 1c) reaches About too. `metaEnabledFor` asks `/meta`
for a book with an ASIN or ISBN **or** `generated: true`; an answer that is only
generated content goes stale after 2 minutes (`META_GENERATED_ONLY_STALE_MS`)
rather than the hour a community answer keeps. `work.generated` drives the
"Generated on this server" chip (`GeneratedChip`: `GeneratedMark` heads a
Characters panel and the Previously On card's recap; About wears it for
`generated.description`), and `communityCredit` drops the CC BY-SA credit from a
generated dimension.

The Recaps tab and Story so far mark their two parts apart (`recapMarks`, Bridge
Phase 1e): the recap list by `generated.recaps`, the whole-book summary by
`generated.recap_summary` (falling back to `generated.recaps` when an older server
leaves it out), so a community summary kept beside a generated list keeps its
credit. One chip heads the panel when every part shown was generated; when the
parts differ, the generated one wears its own chip (the list's under its Story so
far heading, and in Story so far again over the recaps **Show anyway** reveals);
the credit ends the panel whenever a community part shows.

`seriesRails(series, currentWorkId, picks)` builds
one rail per family showing the picked reading order, drops the current work from
it, and drops a rail only when **every** one of its orders is empty once the
current work is removed (so switching order can never make the tab vanish).

#### Reading-order families

The server collapses a primary series and its variant reading orders into one rail
(see [Reading-order families](../server/api/reference.md#reading-order-families)):
`BookMetaSeries` is the family's main view plus the additive `ordering`,
`ordering_of` and `orderings[]` (`BookMetaSeriesOrdering`). An older server sends
none of them, so every series is its own family with a single view - the old
behaviour, unchanged. The pure rules live in `src/lib/series-orderings.ts`
(unit-tested):

- `familyKey(series)` is `ordering_of || id` - the family's primary id.
- `seriesViews(series)` normalizes the main view and every alternate into one
  `SeriesView` shape and sorts them into family order (primary first, then variants
  by id), so the toggle reads the same on every book of a family even when the main
  view is a variant.
- `selectedView(series, picks)` returns the remembered pick for the family when it
  names one of its views, else the main view - an unknown or stale pick falls back.
- `viewHoldsWork(view, workId)` - whether the current book is part of that order.
  A view without it still lists its order, with a short "This book isn't part of
  this reading order." note.
- `orderingLabelKey(ordering)` labels the toggle segments **Publication**,
  **Chronological** or **Recommended** (`book.meta.ordering.*`), falling back to
  the series' own name for an unset or unknown ordering; `familyName` keeps the rail
  heading on the primary's name whichever order is shown.

A family with more than one view gets a compact scrollable `SegmentedControl`
(`src/components/ui/toggle-group.tsx`, a single-choice toggle group labelled
*Reading order*) above its rail. The pick is held by the
`useSeriesOrderings` store (below) and reported through `BookMetaSeriesTab`'s
`onSelectView(family, viewId)`, so the screen - not the tab - owns it.

Characters and recaps are the community expressive layer (`work.characters` /
`work.recaps` / `work.recap_summary`, the `BookMetaCharacter` / `BookMetaRecap` /
`BookMetaRecapSummary` types). Each character card shows name/role/aliases and
"from chapter N" up front with a per-card accordion for the own-words description
(no blur - a tap reveals it); each recap likewise opens only when tapped. The
current book's `recap_summary` is a spoiler in both fields: `in_short` is the whole
book in one paragraph, ending included. Once the book is finished it renders as an
**In short** intro above the story-so-far recaps, followed by the `ending` ("How it
ends") accordion. Before that, `in_short` sits behind a collapsed, spoiler-chipped
"Whole-book summary" row and the `ending` is not offered at all. All of
these are absent from the envelope when the upstream has none, so a work without
them simply shows no such tab. Pure label helpers
(`roleLabelKey`, `revealFromStart`, `recapDescriptor`, `sortRecaps`,
`summaryIsVisible`) are unit-tested, and the strings live under `book.meta.*` in
all locale catalogs.

#### Spoiler gating (`src/components/library/meta-gating.ts`)

Character and recap visibility is derived from **where the listener actually is**,
in a framework-free module of pure functions:

- `listeningProgressFor(input)` maps one whole-book position (the live one while
  this book is loaded, else the saved one) onto the chapter list (via
  `chapterNumberAt` over the cumulative chapter starts). `NO_PROGRESS` is the not-started value, and
  a finished book short-circuits everything to visible.
- `characterIsVisible(c, p)` hides a character whose `reveal.chapter` is past the
  listener; `recapIsVisible(r, p)` hides a recap whose `through.chapter` has not
  been *finished* (strictly less than the current chapter; a `chapter: 0` recap is
  always safe).
- `splitCharacters` / `splitRecaps` partition into `{ visible, hidden }`, which the
  tabs render as a footer row - "*N* hidden to avoid spoilers" with a **Show
  anyway** toggle - and each revealed-anyway entry carries a small spoiler chip.

The saved-progress side comes from `useBookProgress(libraryId, path, cid?)`, which
reuses the existing `qk.progress(cid, lib, path)` key rather than introducing a
second progress cache. Chapter numbers are the *work's* logical chapters, which
only approximate a given recording's edition - hence the deliberate escape hatches
(the toggle, and a finished book showing everything).

The **live** side is `src/components/player/use-listening-position.ts`:
`useListeningPosition` (the book page, at `LIVE_POSITION_BUCKET_S`, 15 s; the
series page's Resume chapter, per minute), `useListeningChapter` (the player's
companion: the same rule at 15 s, selected as a chapter number) and
`useLivePosition` (Search's characters, floored by the saved place in Search's own
model). Each reads the player's position while the book is loaded, never below the
saved one, in buckets rounded down - and only once the book is
**placed** (`selectPlacedBookKey`): right after `playBook` swaps a book in, the
snapshot still holds the previous book's place until the engine load lands (the
store's `loadingBook`), and reading it as the new book's would reveal its cast by a
position the listener never reached. Previously on reads the saved place only. The
chain that feeds the player-side gates (the `metadata` flag, the book, `/meta`, the
chapters, the corrected starts) is `useBookCommunity`
(`src/components/library/use-book-community.ts`).

#### Catching up on previous books (`client.metaWork`)

Both the Recaps and Characters tabs end with a **Previous books** block: one closed
accordion row per earlier book of the series, most recent first.
`previousWorks(rails)` builds that list from the very rails `seriesRails` built -
every entry of each rail's **shown** order whose position sorts before this work's
position in that order, deduped by work id, sorted descending - on top of
`seriesPositionValue` (a `parseFloat` of the position string, so "1-3.5" reads as 1
and an unparsable position is excluded). The screen computes both in one memo, so
the rail and the catch-up can never follow different orders: each family
contributes from the order the reader picked (else the main view), never the union
of its orders, and an order the current book is not part of contributes nothing.
That is the spoiler guard - in publication order The Lion, the Witch and the
Wardrobe is book 1, and the chronological order must not offer The Magician's
Nephew as a "previous book" to a reader going in publication order (pinned as a
regression test). Different families still union.

Opening a row **lazily** fetches that work: `client.metaWork(workId, signal)` calls
`GET /meta/work?id=…` and unwraps `{ work }` to a `BookMetaWork`;
`useMetaWork(workId, enabled)` keys on `qk.metaWork(cid, workId)` with the same
1 h `staleTime` / `retry: false` tuning as `useBookMeta`, and `enabled` stays false
until the row is opened, so a series rail never fires N requests up front. The
route is not library-scoped (a work id addresses the metadata database, not this
server's content), so no path rides with it.

What each row shows: under Recaps, that book's `recap_summary.in_short` plus a
separately-tapped, spoiler-chipped **How it ends** accordion, falling back to
`lastBookRecap(recaps)` (the furthest book-scope recap) and then to a quiet note
plus an external metadata-site link; under Characters, that book's character cards.
Any failure - an older server with no such route, a metadata service that is down -
renders the same quiet "couldn't load" plus the external link, so the block
degrades exactly like the rest of the section.

Three details make all of this safe to add to a screen everyone sees:

- **Capability-gated.** The metadata query fires only when the server advertises
  the `metadata` capability (`!!server.capabilities.metadata`, optional in
  `types.ts` so an older server reads as absent → false). On a server without
  the feature nothing is fetched.
- **Progressive enhancement.** The meta-driven tabs contribute **nothing** while
  loading, on error, or on `{ matched: false }` - and because `bookTabs()` derives
  the row from the data it has, they simply don't appear in the tab row. The page
  is never worse for having them, and their absence is indistinguishable from a
  book the metadata service doesn't know. `chapters`/`bookmarks`/`history`/`notes`
  never depend on any of this.
- **Fetch tuned for a best-effort side dish.** `useBookMeta` keys on
  `qk.bookMeta(cid, lib, path)` with a **1 h `staleTime`** (the server caches the
  composed envelope too, so re-fetching sooner buys nothing) and **`retry: false`**
  so a 502 from a down metadata service resolves once and stops - it must not
  spin or block the rest of the screen.

`client.bookMeta(libraryId, path, signal, opts?)` calls `GET /libraries/{id}/meta`
(the optional `{ includePrevious, hideSpoilers }` add the `meta_bundle` params,
which `useBookMeta(..., opts)` passes through; the book screen sends neither, so it
still gates spoilers on the device); the
`BookMeta` discriminated union (`{ matched: false } | { matched: true; work;
recording?; series?; web_url }`) in `types.ts` is hand-mirrored from the server's
envelope, and `client.metaWork` reuses the very same `BookMetaWork` type rather
than declaring a second one (the mirroring rule above applies - a change to
either shape is a two-repo change with tests on both sides). Every series-rail entry
carries its own `web_url`, so tapping a series work or the footer link opens the
metadata site **externally** (a real new tab on web, an in-app browser tab on
native) - the client never constructs a metadata URL. UI strings live under
`book.meta.*` in the locale catalogs.

#### Community covers (`client.communityCoverUrl`)

The envelope's covers - each series rail entry's `cover_url` (the Series tab's
tiles) and the Previous books rows - point at third-party hosts, which the web
player's CSP refuses (`img-src` takes only the server). A server with
`meta_covers` serves them itself: `client.communityCoverUrl(libraryId, path,
coverUrl, { size })` builds `GET /libraries/{id}/meta/cover?path=&url=&size=`
with `?token=` like every media URL. The server serves only a `cover_url` the
envelope of that book hands out, so the call takes the same `libraryId`/`path`
`useBookMeta` was asked for.

`BookTabPanel` builds one resolver per book with
`useCommunityCover(useScopedCid(), libraryId, path)` and passes it to the Series,
Recaps and Characters tabs as `coverFor`. Every community cover is asked for at
one size, 320 (`COMMUNITY_COVER_SIZE` in `book-meta.tsx`), so the same cover is
fetched and cached once, on the server and on the device, whichever tab shows it
first. A tab without `coverFor` (`noCommunityCover`) shows placeholders: the
title on a rail tile, the title's monogram on a previous book's row.

The rule is the pure `communityCoverSource` (`community-cover.ts`), unit-tested:

- **`meta_covers` on:** the proxied URL.
- **`meta_covers` off** (an older server, or metadata off): native loads the
  direct `cover_url`, as it always has; the web player shows the placeholder.
- **`/server` unreachable:** counts as no flag (a server that can't answer
  `/server` can't serve a cover either), so native loads a kept envelope's
  covers directly and the web player shows placeholders.
- **`/server` not answered yet:** nothing loads, so a cover is never fetched
  twice (directly, then proxied).

### Home

Home (`src/components/home/`) aggregates every connection and keeps its rules
pure (the podcast "New episodes" rail, `use-new-episodes.ts` and
`new-episodes-model.ts`, is in [Podcasts](podcasts.md#homes-new-episodes);
`bookRowTest` keeps episodes off the book shelves below, by library kind, and
says which rows wait on a server's libraries, so Home holds a shelf's place with a
skeleton meanwhile):

- `home-model.ts`: `pickNowBook` (the loaded book, else the most recently played
  in progress), `syncPill` (told as it is: a save still in the offline queue, or the server
  holding the newest progress marked down, is "Saved on this device, will sync";
  otherwise the newest `updated_at` any server holds. Another server being down
  says nothing about the place: the greeting's servers pill names it, on a
  phone too, where it gets a row of its own under the date), `nextCandidates`
  (the Now book, other books in progress, then recently finished, at most
  `NEXT_CANDIDATES` = 6, one `/next` each on the candidate's own server), `nextInSeriesItems` (an owned next book, else the
  community rail's next work as a ghost; books already on Home are skipped and a
  book two candidates lead to shows once), `smartShelves` (Finish what you started,
  Short listens = recently added books in the Library's `len=short` bucket
  (`lengthBucket`, under five hours), the top narrator's shelf, Added this week;
  fewer than two gives none). Its links into the Library's Books mode are
  `libraryBooksHref` from `books-view.ts`.
- `listening.ts`: the streak, the seven day bars and the pace behind the finish
  date, all in **server time** (a stats response's days are dates in the server's
  zone; "today" is its `to` moved by `utc_offset`, never the device clock). No pace
  from fewer than three listening days or under an hour in all.
- `now-card-model.ts`: the whole-book scale (one tick per chapter, merged past 120
  chapters), bookmark pins, chapter place, percent heard (100 only once finished)
  (the time left comes from `src/playback/time-left.ts`, at the book's own speed,
  [Player UI](player-ui.md#time-left-time-leftts)). Chapter starts come from the file
  durations (`chapterStartsOf`), as on the book page.

### Search and the spoiler model

`useSearch(query, { limit, refetchProgress })` (`src/components/search/use-search.ts`)
is shared by the Search screen and the palette. Each group carries its own
`GroupState` (`supported`, `isLoading`, `isError`, `retry`), so a failing group never
hides the others:

- **Books**: `useSearchAll` across the person listening's connections, de-duplicated (`src/lib/dedup.ts`),
  "Also on" for the other servers.
- **Series and people** (`usePeopleSources`): every library's `seriesList`,
  `authors` and `narrators` lists on every `browse_people` server (sharing the
  Library's `qk.*` cache, 5-minute `staleTime`), matched **on the device** by
  `matchNamed` in `search-model.ts`: folded (case and accents), ranked starts-with
  > word-start > contains, one hit per folded name opening the first copy in
  connection order, the rest kept as `also`.
- **Characters** (`useCharacterSources`): the community characters of the
  listener's started books (in progress or finished, newest first, on `metadata`
  servers, at most `MAX_CHARACTER_BOOKS` = 8, `characterBooksToLoad`). The plain
  `/meta` envelope is fetched and gated **on the device**; chapters are fetched
  only for unfinished books that have characters. `listeningIn` places the listener
  with the book page's rule (`meta-gating`'s `listeningProgressFor` over
  `chapterStartsOf`): the saved position, or the live one when the book is loaded
  and further on (sampled every 15 s, so a reveal is only ever late), and "from the
  start" until the chapters arrive - a late chapter list can reveal more, never
  less.

`matchCharacters` is where spoiler safety lives. A character matches by name or
alias; one the listener hasn't reached (`characterIsVisible` false) goes into an
`unmet` set and is **only counted**, never named - also not through an alias, and
an alias-only match ranks after every name match. A name met in any book shows
once (the most recently played book's entry) and is not counted again for another
book that hasn't reached it. The counted remainder is the `hidden` number behind
"2 more matches after your place in the book". The result carries the CC BY-SA
`attributions` of the books its hits come from, rendered beside the group.

### Podcasts

Podcast reads (`usePodcastShows`, `usePodcastEpisodes`, `myPodcastsQuery`,
`latestEpisodesQuery`) are core and asked only for a library whose `kind` is
`podcasts`; Follow and Unfollow are `useCapabilityMutation('podcasts', ...)`;
`usePodcastFetchStatus` is a `podcast_fetch` capability query the
episode-fetch controller seeds and is the only one to poll. Keys and shapes:
[Bridge podcasts](../bridge/podcasts.md#player-phase-2d-1); screens and the
controller: [Podcasts](podcasts.md).

### Upcoming releases

*(2.6.0, Tracks U2 and U3; the wire is the server's, [`GET /me/upcoming`](../server/api/reference.md#upcoming-releases), [the calendar feed](../server/api/reference.md#the-calendar-feed) and [`/me/upcoming/cover`](../server/api/reference.md#get-apiv1meupcomingcover).)*
The listener's preorders, recent releases and missing volumes in the series they hold,
merged across their servers. User guide: [Upcoming releases](/users/listening/upcoming).

- **Wire and reads.** `types.ts` mirrors the envelope as `UpcomingResponse {status,
  generated_at?, window_days, items}` (`UpcomingItem`, `UpcomingKind`; `items` never
  null) and adds `upcoming?: boolean` to `Capabilities` and the additive
  `release_date?` to `BookMetaSeriesWork`. `client.upcoming()` is `GET /me/upcoming`,
  keyed `qk.upcoming(cid)` with a 15-minute `staleTime` (the server's job runs daily).
- **`useUpcomingAll()`** (`hooks.ts`): `useApis()` + `useQueries` + `combine`, one query
  per connection in `useApis()` order. A connection is asked only when its server
  advertises `upcoming` **and** its user is not a kid (`isKidAccount`; the route answers
  a kid `403 kid_account`); every other connection gets `skipToken`, so it is never
  asked, not even by a manual `refetch`. It returns `items`, `available` (true once a
  server offers it, false once none can, `undefined` while a server's flags load;
  `useUpcomingAvailable` reads only that), `isLoading`, `statuses` (each answered
  server's `ok|pending|stale`), `failed` (the servers that didn't answer, including one
  whose `/server` flags couldn't be read, so a cold link settles instead of loading
  forever) and `retry` (refetches each errored one and reads the unreadable servers'
  flags again; a request paused for the network is not re-asked, it resumes when the
  network returns).
- **The pure rules** (`src/lib/upcoming.ts`, tested apart): `upcomingEligibility` (who
  may be asked, and `available`), `mergeUpcoming` (tags each item with its connection,
  keeps the **first** connection's row of a `work.id`, then `compareUpcoming`: the
  server's order across servers, preorders soonest first, releases newest first, then
  missing by series name and numeric position), `upcomingSectionOf` and `isNewUpcoming`
  (`first_seen_at` within seven days: the "New" badge). A date's own rules are
  `src/lib/release-date.ts`: `parseReleaseDate` and `releaseIsFuture` (a date at its
  own precision against the UTC day: "2026" or "2026-10" is ahead only while the whole
  period is). `formatReleaseDate` (`src/lib/format.ts`) prints "2027", "Nov 2026" or
  "Nov 12, 2026" (read in UTC, written in the app's UI language, `getLocale()`: a bare
  code such as `en`, so English always reads "Nov 12, 2026" and German "12. Nov. 2026";
  other text as it came), and `upcomingDateLabel` labels it by kind:
  "Out", "Released", "First released" (the metadata's one date is a work's **first**
  release), no line without a date.
- **Surfaces** (`src/components/upcoming/`): `UpcomingRail` on Home, after Next in your
  series (`HomeSection` + `ShelfRow`, at most `UPCOMING_RAIL_LIMIT` = 12, See all ->
  `upcomingHref()`); it renders nothing while loading, while empty or where no server
  offers it, so Home never holds a skeleton for a rail that may never show.
  `UpcomingContent` (`upcoming-screen.tsx`) is the `/upcoming` page's body and the You
  hub's Upcoming section: Coming soon, Just released, Missing from your series (an empty
  section hidden), and its states (rows standing in while loading, "Checking for
  releases" while every answering server is `pending`, "Nothing coming up", "No upcoming
  releases here" where no server offers it, and "Couldn't load" with Retry when no server
  answered, never "Nothing coming up" for a failure); a failed server beside answering
  ones, a `stale` one or a `pending` one is a note over the list. Under the list,
  while `available`, the [calendar card](#the-upcoming-calendar). The server name (`useServerFlag`: only a non-default server, only with
  several connections) reads "From &lt;server&gt;". A tap opens
  `seriesHref(connectionId, local.library_id, { name: local.series, work: work.id })`.
- **Covers** (Track U3, `upcoming-cover.tsx`). Every item is an `UpcomingCover`: a
  `GhostCover` with the work's real cover drawn over it only when the item's **own**
  connection (the one whose row won the merge) advertises `upcoming_covers === true`
  (never while unknown) and the item has a `cover_url`. The image is
  `client.upcomingCoverUrl(work.id, { size, version })`, `GET
  /me/upcoming/cover?work=&size=&v=` with the media token, never the `cover_url`
  itself: the device never contacts the cover's host, and the web player's CSP
  refuses another host. `size` is `coverSizeFor` the tile; `v` is `fnv1a(cover_url)`,
  purely a cache buster (the server caches the image for a day, and its job can
  change a work's `cover_url` in place). The ghost stays underneath, so it shows
  while the image loads, and alone without the flag or once the image fails (`failed`
  is keyed by the URI, so a recycled tile starts afresh).
- **Series pages.** `railEntries` (`series-model.ts`) gives a ghost its `release_date`:
  `outDate` while it is still ahead (the list's `entryLine` and the face-out note show
  "Out Nov 12, 2026" in place of "Not in your library"), else its year.
- **Kids and demo.** A kid gets no rail, You section, cover or calendar row, and the
  route shows the "not here" state. A demo account reads the list like anyone else;
  its calendar row explains that it can't subscribe and asks nothing.

#### The upcoming calendar

*(Track U3; the card is `UpcomingCalendarCard`, `src/components/upcoming/upcoming-calendar.tsx`;
the pure rules and the device copy are `src/lib/upcoming-calendar.ts`.)* User guide:
[Add to your calendar](/users/listening/upcoming#add-to-your-calendar).

- **Wire.** `types.ts` mirrors `UpcomingCalendarStatus {active, created_at?}` and
  `UpcomingCalendarLink {path, created_at}` and adds `upcoming_calendar?` and
  `upcoming_covers?` to `Capabilities`. `client.upcomingCalendar()` is `GET
  /me/upcoming/calendar`, `mintUpcomingCalendar()` the `POST` (201; it replaces the
  previous link; refused `403 kid_account` / `demo_account`, and to an API key),
  `deleteUpcomingCalendar()` the `DELETE` (204).
- **The full URL.** `path` is server-relative: `calendarFeedUrl(path, addresses,
  baseUrl)` puts it on the server's away address when it has one (a calendar app may
  fetch from anywhere), else on the address in use.
- **The device's copy is a credential.** The server answers the secret once, so this
  device keeps `{url, created_at}` per connection in the **secure store**
  (`calendarLinkKey`: the keychain or keystore, localStorage on the web, like the
  session token), never AsyncStorage or the startup query cache. Its query
  (`qk.upcomingCalendarLink`) reads the secure store, is not a startup query, and is
  `meta.local`, so its success says nothing about the server (no reconnect flag
  cleared, no reachability check). It is forgotten with the connection
  (`removeConnection`, a retired stale identity and the auth reset in
  `src/stores/session.ts`, so it goes on sign-out even if Upcoming never mounted; a
  mint that lands after its connection signed out is forgotten, not kept), moved by
  the identity migration (`moveCalendarLink`), forgotten on Turn off and replaced on
  Reset (the mutation stores it before it resolves).
- **Rows and states.** One row per connection from `calendarConnections` (the flag
  on, not a kid: a kid is never asked; a demo account's row explains and asks
  nothing), named by server when there are several. `calendarRowState` gives
  `loading`, `error` (Retry), `none` (Get calendar link), `shown` (the URL, Copy link
  everywhere, Subscribe where `canSubscribeWebcal`: the iOS app and a browser on an
  Apple device, which `openWebcal` hands a `webcal://` URL; Reset link and Turn off,
  each behind a `ConfirmDialog`) and `elsewhere` (a link is active but this device has
  no copy: "Reset it to see it here").
- **Staleness.** A copy whose `created_at` is not the server's (compared as
  instants), or a copy of an inactive link, is stale and forgotten, but never while
  the row's own mint or delete is pending. A write sets the copy and the status in
  one step after cancelling any read of either in flight (an answer sent before the
  write would land over it and the row would forget the new copy). A write that got
  no answer (the network, not a refusal) reads the status again, since it may have
  landed. A failed change shows the player's own words by `code` (`kid_account`,
  `demo_account`, else "refused" or "couldn't reach"), never the server's English.

## Zustand stores

### Session (`src/stores/session.ts`)

Multi-connection: a `Connection` is `{ id, serverId?, serverUrl, name, token, user,
needsReconnect?, addresses? }`, **one user signed in to one server**. The `id` is the
connection id, `<server_id>.<user_id>` ([below](#connection-identity-server_iduser_id)),
so it keys every per-connection store; `serverId` is the server's `server_id`, read
through `serverIdOf(conn)`. `serverUrl` is the address the listener paired with or typed,
never rewritten; `addresses` is the server's home and away addresses (capability
`addresses`), and which one requests go to right now is an in-memory pick, never stored
(see [Connect and home/away addresses](connect-and-addresses.md#home-and-away-addresses)).
Connection **metadata** persists to AsyncStorage (`audiosilo.connections` +
`audiosilo.activeConnection`, the default connection's id under its legacy name); each
connection's **token** lives in secure-store under `audiosilo.token.<id>` - tokens are
stripped before the metadata is persisted. `hydrate()` restores the connections whose
token is still there (it runs after the launch reset, below, so it never reads
wrongly-keyed records), filling `serverId` on a connection persisted before it
existed. `setSession({ serverId, user, ... })` refuses an empty `server_id`, then adds
or updates **by server and user**: the prior connection is the one with
`serverIdOf(c) === serverId` and the same `user.id` (a legacy one saved without a
usable user id counts as this user, since it was the server's one connection), so
re-pairing the same account at another URL updates its connection instead of adding
one, while **another user on the same server is another connection**. A prior
connection keeps its id (a legacy id stays until the key migration moves it, so its
downloads and saves stay reachable); a new one gets `connectionIdOf(serverId,
user.id)`, and `setSession` returns the id it used. It merges the addresses it is
given with what the device knew (the prior connection's, else another user's
connection to the same server, else the remembered server's; `mergeAddresses`), makes
it the default (unless the caller passes `{ makeDefault: false }`, as `addMemberHere`
does for a household member signed in beside the owner; it still becomes the default
when there is none, or the current default is no longer signed in), remembers the server durably without its token
(`src/lib/known-servers.ts`, the connect screen's Reconnect rows, keyed by `server_id`
with no user). A connection at the same URL **whose `server_id` differs**
(`staleIdentities`: a rebuilt server mints a new `server_id` at the same address) is a
dead identity, but only the ones named in `retire` go, with their token and scoped
state: `finishConnect` names the **re-pairing person's own** (`staleToRetire`: the
profile holding the reconnect banner's connection, else the person listening; nobody's
for **Add someone**), and the new connection takes the retired one's place in that
person's profile (`onConnectionReplaced`). Every other stale identity is another
person's: it stays, flagged `needsReconnect: 'server-reset'`, for them to sign in again
(dropping it would delete their profile, PIN and kids settings). A different user is
never a reason to drop one.
`learnAddresses` merges a `GET /addresses` answer into a connection's addresses
(`mergeAddresses`, so a known `home` survives; the address runner calls it). `removeConnection` (and `logout`,
which removes the active one) deletes its token **and purges the connection's
scoped state** - downloads, the progress mirror + offline queue, cached queries,
and scroll memory. It does this by running an `onConnectionRemoved` cleanup
registry that those owners subscribe to (they can't be imported directly here -
they import the session store, so a direct import would cycle); a failing cleanup
is logged, never blocks removal. `status` is
`loading | unauthenticated | authenticated`, and the `(app)` layout guard
redirects on it. `user` mirrors the default connection's (`defaultConnectionId`)
user, for ergonomic selectors.

**A hydrate that can't read the tokens** leaves `sessionHydrateFailed()` true: the
persisted connections are not in memory, so nothing may act on the empty list as if it
were real (`sessionReady()` stays false, so the offline queue's replay keeps every save
instead of dropping them as unroutable; car bookmarks waiting to be sent are kept; the car
snapshot isn't rewritten as signed out; a sign-in hydrates first, so it keeps the stored
servers, and only when that read fails again does it write a list holding just its own
server and stop retrying). On iOS a failure that is only the **locked keychain**
(`isLockedKeychainError`, "interaction is not allowed": a CarPlay launch with the phone
locked, before the token moved to its after-first-unlock item, see
[Native integrations](native-integrations.md#tokens-on-a-locked-phone-srclibsecure-storets))
keeps `status` on `loading` (screens wait on their spinner, never the connect screen) and
retries every `LOCKED_RETRY_MS` (5 s) and when the app comes to the front. Any other failure
is surfaced as `unauthenticated` (never stuck on `loading`) and retried on the next
foreground.

### Connection identity: `<server_id>.<user_id>`

A connection is one user on one server, so its id is `connectionIdOf(serverId,
userId)` = `<server_id>.<user_id>` (`src/lib/connection-id.ts`): two people signed in
to the same server on one device are two connections, each with its own token,
downloads, progress and query cache. The server's `server_id` is base64url
(`[A-Za-z0-9_-]`, never `.`) and `user.id` a positive integer, so the `.` is an
unambiguous separator, and the id stays inside expo-secure-store's key alphabet
(`audiosilo.token.<id>`, `[\w.-]`), a file name and a URL path segment. It never holds
`:` (`contentKey` joins on it, and is unchanged: `${connectionId}:${libraryId}:${path}`),
`/`, `%`, `#` or `?`.

Before the player redesign's Phase 8 the id was the bare `server_id`, a **legacy** id
(`isLegacyConnectionId`). A legacy connection keeps working everywhere, forever: one
the migration can't move (no usable `user.id`) or hasn't moved yet (a locked keychain)
keeps its id. So:

- **Compare servers only through `serverIdOf(conn)`** (its `serverId`, else what the
  id says), never `conn.id`: the server-reset check (a `/server` answer whose
  `server_id` differs, `serverResetCid`), the home-address probe and pick, the connect
  flow's repair and Reconnect rows, `learnAddresses` (which remembers addresses under
  the server's id).
- `parseConnectionId(id)` gives `{ serverId, userId? }` and `usableUserId(user)` the
  user id an id can carry; never split an id by hand.

**The one-time key migration** (`migrateConnectionIdentity`,
`src/lib/identity-migration.ts`) moves every legacy connection to its new id without
signing anyone out. `migrateStorage()` runs it after `resetStaleStorage` and before any
store hydrates or any lazy reader runs. Until the plan is stored, a crash, a locked
keychain or a failed write leaves the legacy data usable and the run waits for the next
launch. Once the plan is stored the run only goes **forward**: `migrateStorage()` runs
it up to `RECOVERY_ATTEMPTS` (5) times in all, a second apart, with every reader held, so no store
ever sees half-moved documents. When it still fails it gives up for this launch and sets
`identityMovePending()`: the downloads store and the offline queue's replay keep what
names an id no connection has yet instead of pruning it as gone, and a later launch
finishes the plan.

1. **Read and plan** `{ legacyId: newId }` for each legacy connection with a usable
   `user.id` whose new id no other connection already has (plus the plan a run cut
   short left, `audiosilo.identityPlan`). Nothing moves while the Android playback
   service holds a book of a connection being moved (its tracks are files under the
   old download folder); when the service doesn't answer within 3 s, the run waits for
   a later launch.
2. **Tokens first.** Copy each `audiosilo.token.<old>` to `audiosilo.token.<new>` and
   read it back. Any failure, a locked keychain included (a CarPlay launch with the
   phone locked), aborts with nothing else changed. Old tokens are never deleted here,
   and a copy is never undone.
3. **Record the plan, then move the files**: native `downloads/<old>` to
   `downloads/<new>` (`engine.native`'s `moveConnection`). Moves are idempotent and
   **never reversed** (a retry can't tell which moves an earlier process made, and the
   documents may already name the new ids); a failure keeps the plan and the next try
   goes on from there. The web moves **no** files: `engine.web` has no `moveConnection`
   and keeps a moved connection's Cache API entries under the legacy id
   (`/_offline/<legacyId>/`), which the registry's new ids reach through the aliases
   (`legacyIdOf`).
4. **Rewrite every document naming a connection id in one `setMany`**: the
   connections (new `id`, `serverId` added), the default connection, the downloads
   registry (keys and each `connectionId`), the progress mirror (keys and values) and
   queue, `offlineServers`, the car bookmarks waiting to be sent, the library
   selection, Smart speed's time saved, the drift-offs, plus the aliases and the first
   profiles document. A failed write (iOS and the web write key by key) keeps the plan,
   and the next try finishes it. `audiosilo.carSnapshotWritten` is removed, so the next car snapshot is built fresh
   (even offline).
5. **Mark it done**: `audiosilo.identityVersion` = `2`.
6. **Delete the old tokens, then the plan**, best effort. A plan still stored (the app was
   killed first, or its removal failed) is replayed by a later launch, which deletes the old
   tokens again; a token delete that fails while the plan's removal succeeds is not
   retried, so that old copy stays in the secure store.

Every rewrite maps ids through the stored plan, so it is idempotent: a run cut short
mid-write (`setMany` is not atomic on iOS or the web) is finished by the next one with
the same plan. A legacy list written back after the mark (a web tab still running the
old code) is moved by the next launch the same way. A new document keyed by a
connection id must be added to `ID_DOCUMENTS` or it is left behind. In-memory state
(scroll memory, the React Query cache) needs no migration.

The same `setMany` writes the **first profiles document** (`audiosilo.profiles`); how
it groups the connections is on [Profiles](profiles.md#the-store-srcstoresprofilests).

**Aliases.** The migration records `{ [old]: new }` under `audiosilo.connectionAliases`.
Every launch loads them into memory with the migration's own first read
(`migrateConnectionIdentity`, together with the landed moves of a run cut short);
`bootstrapPlayback` reads them itself (`loadConnectionAliases`) only when that read
failed.
`resolveConnectionId(id)` maps an old id to its new one (else returns it) at every
entry point JS can't rewrite first: a route's `?connection=` (`connectionParam`: web
history, widget and Live Activity deep links), a car item id from an old snapshot
(`parseCarItemId`), the book the Android service loaded (`getLoadedBook`,
`adoptLoaded`), bookmarks the service queued (`onRemoteBookmark`,
`consumePendingBookmarks`), the iOS widget's last props, and `resolveClient` as a
safety net.

**Why `AUTH_STORAGE_VERSION` is never bumped for it.** Bumping the auth axis wipes
every connection and token, signing everyone out (below). That was right for v2, when
the old ids could not be re-keyed; the Phase 8 ids can, so the migration re-keys them
instead and nobody re-pairs. Bump the auth axis only for an identity change that
genuinely can't be migrated.

### Settings (`src/stores/settings.ts`)

Playback tunables persisted as one JSON blob (`audiosilo.settings`):
`skipForward` (30), `skipBackward` (15), `defaultRate` (1), `autoRewindMax`
(5 s), `virtualChapterInterval` (30 min), and the audio effects `smartSpeed` and
`voiceBoost` (off; see [Smart speed and Voice boost](audio-effects.md#the-settings-and-the-ui)).
The playback layer subscribes and re-`configure`s the engine whenever these change.
The same document holds the end-of-book and download behaviour - `autoPlayNext` (off), `autoDownloadNext`
(`never | wifi | always`; `defaultAutoDownload()` is `wifi` on native and `never` on web, see
[Auto-download on play](end-of-book.md#auto-download-on-play)), `keepAhead` (`0 | 1 | 2 | 3`, default
`0` = off; `toKeepAhead` reads a stored value that isn't one as off; see
[Offline](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts))
and `autoDeleteFinished`
(on) - and the auto sleep timer's settings.

The stored document carries a schema `version` (`SETTINGS_VERSION`; a document
without one is version 0), written with every save and dropped from the store state
on hydrate. `migrateSettings` runs in the document's parse step and brings an older
document up to date; today its one rule is version 1's (on web only, a stored
`'wifi'` `autoDownloadNext` becomes `'never'` unless `toKeepAhead(keepAhead)` is
above 0). It re-runs on each load, with the same answer, until the next save writes
the current version. A new settings change that must move stored values bumps
`SETTINGS_VERSION` and adds its rule there.

### Series orderings (`src/stores/series-orderings.ts`)

`useSeriesOrderings` holds `picks` - family key -> the id of the reading order the
reader chose - persisted as one JSON document (`audiosilo.seriesOrderings`, validated
by `parsePicks`) and hydrated once at boot by `bootstrapPlayback` (`src/lib/bootstrap.ts`,
which the root layout and the car's headless task run). It is a **device**
preference, not per-server state: family keys are community-metadata series ids, the
same on every server, so it is deliberately not one of the session's scoped storage
keys and neither storage-reset axis wipes it.

### Persisted documents (`persistedDocument`)

Settings and series orderings share one hydration rule, `persistedDocument(key,
parse)` in `src/lib/storage.ts`: a change made before hydration finishes (a fast tap
on a cold start) is remembered and laid over the stored values when they load, so it
wins as the newer statement of what the user wants - and it never clobbers the stored
values it did not touch, because nothing is written until hydration has merged them.
`parse` validates whatever is stored, so a corrupt or foreign value never reaches the
store.

### Search (`src/stores/search.ts`)

The search screen's `query` string, held in a store so it survives the screen
remounting, plus a `focusRequest` counter: on a native tablet the top bar's search
field calls `requestFocus()` and jumps to the Search tab, and the screen keys its
input on the counter so a fresh mount with `autoFocus` takes the focus even when
the tab was already open. (On web that field opens the command palette, whose
open state and query are `usePalette` in `src/components/shell/palette-store.ts`;
see [the shell](overview.md#command-palette-web).) The shell (`useShellEffects`)
clears the query when you leave the Search tab; within the tab it is kept, so
opening a result and coming back shows the same results. The query is not
persisted.

The same module holds **`useRecentSearches`**: ONE recent list for the Search
screen and the palette (newest first, at most `MAX_RECENT` = 5, de-duplicated
ignoring case by `addRecent`), persisted per device - not per server, they are the
listener's words - under `audiosilo.paletteRecent` (the key predates the sharing).
`hydrate()` is lazy (whichever opens first) and replays searches remembered before
the read finished on top of the stored list.

### Library selection (`src/stores/library-selection.ts`)

`useLibrarySelection` is the library the Library tab's single-library modes show:
`{ connectionId, libraryId }` or null, a `persistedDocument` under
`audiosilo.librarySelection`, hydrated at boot by `bootstrapPlayback`. An
`onConnectionRemoved` handler drops a removed connection's pick; it is not a scoped
storage key, because a stale pick is harmless. Read it through
`useSelectedLibrary()` (`src/components/library/use-selected-library.ts`), which runs
the pure `resolveLibrarySelection` against every connection's library list (sharing
`qk.libraries`): the stored pick while its server's list still has it - or while
that list is loading or failing, since offline is not gone - else the library the
modes last showed (`shown`, in memory only) while it stands, else the first library of
the first connection that has one. That fallback passes over a connection still
loading (a slow first server would otherwise hold the Library up), and holding `shown`
keeps it from jumping to that earlier server when its list arrives. The car's Library
tab resolves its library the same way.

### Other device preferences

`persistedDocument` stores that are deliberately not per server: `useBooksLayout`
(`audiosilo.booksLayout`, grid or list for book lists, hydrated on first use) and
`useUpNext` (`audiosilo.upNext`, the desktop drawer's open state and width). The
keep-ahead count is not one of these: it is `keepAhead` in the
[settings](#settings-srcstoressettingsts).

### Player and downloads stores

`usePlayer` (`src/playback/store.ts`) exposes `nowPlaying` (book identity +
the built queue), the engine `snapshot`, `rate`, and the actions
(`playBook`, `toggle`, `pause`, `retry`, `seekBook`, `seekInTrack`,
`goToTrack`, `skipSeconds`, `setRate`, `stop`) plus selectors
(`selectBookPosition`, `selectCurrentChapter`, `selectIsPlaying`). Everything
behind that surface - timeline math, the stall watchdog, resume protection -
is documented in [Playback](playback.md). `useDownloads`
(`src/downloads/store.ts`) is covered in [Offline](offline.md). Both follow the
same shape: a Zustand store for reactive state, module-level variables for
orchestration that must not trigger renders.

## Progress sync (`src/playback/progress-sync.ts`)

The offline-safe write path for listening progress:

- **Last-write-wins.** Every save carries `version: 0`, a per-install
  `device_id` (generated once, cached under `audiosilo.deviceId`), and an
  `updated_at` captured **at save time** - so replays that land late still
  reconcile correctly by timestamp. The server's `SaveProgress` applies the
  same newest-`updated_at`-wins rule (see the
  [server data model](../server/data-model.md)).
- **Connection-scoped.** Every `ProgressSave` carries a `connectionId`, and both
  the mirror and the queue key on `(connectionId, libraryId, path)` - which,
  crucially, stops the queue from replaying one server's positions against
  another.
- **Durable mirror first.** `saveProgress` always upserts the local mirror
  (`audiosilo.progressMirror`, keep-newest per `(connectionId, libraryId, path)`)
  before touching the network. The mirror is never pruned on sync; it is the
  resume fallback when the server can't be reached.
- **Offline replay queue.** If the server is known unreachable the save is
  queued locally (`audiosilo.progressQueue`, latest save per
  `(connectionId, libraryId, path)`) without firing a doomed request; a network
  failure en route also queues. 4xx responses are treated as unrecoverable and
  dropped (retrying forever can't help an auth/forbidden error). Read-modify-write
  access to both the queue and the mirror is serialized through in-module promise
  locks so a flush and a concurrent save can't clobber each other.
- **Flush routes per connection.** `flushQueue` runs on reconnect (registered via
  `onReconnect` at module load), after any successful direct save, and when a
  book starts playing. It groups the queue **by connection** and replays each save
  through **its own** connection's client (`resolveClient`, keyed on the save's
  `connectionId`) - never against whichever server happens to be active. Groups
  replay concurrently (order preserved within each connection), so one slow or
  dead server can't stall another server's replay. A save whose connection was
  removed is unroutable and dropped; a connection drop mid-flush keeps the
  remaining items; only the active connection's success/failure moves the
  reachability banner. It also waits for the session to hydrate (`sessionReady`)
  so a flush racing startup can't null-route the whole queue.
- **`loadInitialProgress(api, connectionId, libraryId, path)`** reconciles
  server + mirror + queue into the `ResumeLookup` (`progress`/`empty`/`failed`)
  that drives resume - the semantics live in
  [Playback](playback.md#resume-protection).
- **Launch reset + purge.** The mirror and the queue need no migration of their own:
  the launch-time `migrateStorage()` (`src/lib/storage-migration.ts`, one memoised run
  `bootstrapPlayback` awaits before any store hydrates) runs `resetStaleStorage`
  (`src/stores/session.ts`), which reconciles storage along two independent version
  axes. The **auth** axis (`audiosilo.storageVersion`, now `2`) wipes the connections,
  their tokens, the pre-multi-server single-session keys and, with them, the scoped
  cache; bump it only for a connection identity change that can't be migrated, because
  it signs everyone out (one that can be re-keyed gets a key migration instead, as Phase
  8's did: [Connection identity](#connection-identity-server_iduser_id)). The **cache** axis (`audiosilo.cacheVersion`) wipes only the
  scoped cache (`audiosilo.downloads`, `audiosilo.progressMirror`,
  `audiosilo.progressQueue`, the reader's `audiosilo.readingMirror` and
  `audiosilo.readingQueue`, `audiosilo.offlineServers`) and keeps every login: it is
  the knob for any change to how that cache is keyed (a pre-split install adopts the
  version without a wipe). Either reset makes `bootstrapPlayback` wipe the on-disk
  downloads too. After both axes, the same `migrateStorage()` run moves legacy
  connection ids to `<server_id>.<user_id>`
  ([Connection identity](#connection-identity-server_iduser_id)), keeping every login.
  An `onConnectionRemoved` handler drops a removed connection's mirror
  records and queued saves.

:::note[No realtime sync]
Progress sync is REST-only. The server advertises a `websocket` capability flag
for a future realtime channel, but no WebSocket client exists in the frontend -
don't document or rely on one.
:::

## Reachability (`src/api/reachability.ts`)

A tiny Zustand store (`useReachability { online }`) plus module functions,
tracking whether the **active server** is reachable so the sync layer stops
hammering a dead endpoint:

- Starts optimistic (`online: true`).
- `noteFailure(cid, e)` is how every request path reports a failure: the
  query cache, `loadInitialProgress`, `fetchBookProgress`'s mirror fallback,
  the progress saves (`saveProgress`, `flushGroup`, which keep the save queued)
  and the listening span (`endHistory`). It
  only asks for a check (`checkReachability`), and only for no answer
  (`isUnreachableError`: a `TimeoutError`, or a fetch's own `TypeError`) on a
  connection not already marked down. A capability gate or a cancel says
  nothing. So one slow or broken read never marks a healthy server down, and a
  read answered from a local copy never marks a dead one up (2.4.1,
  frontend#131). Apart from the web `offline` event (below), nothing marks a
  server down without a check.
- `noteSuccess(cid)` marks a connection up: a save that got through,
  `loadInitialProgress` reading an `ApiError` (the server answered), or the
  `/server` query succeeding for a connection marked down (the query cache).
- `noteAnswer(cid)` counts an answer without changing the state. Every
  connection's `ApiClient` gets it as its `onAnswer` callback (the provider's
  clients and the ones `resolveClient` builds for the save loop, the car and the
  downloads), called whenever a fetch resolves, whatever the status. So a check
  that timed out on a slow but healthy server sees that another request was
  answered meanwhile and leaves it up (2.4.1).
- `checkReachability(cid)` asks `GET /server` (one check per connection at a
  time): any answer, an `ApiError` included, is reachable; no answer is
  unreachable. It records nothing once stale: the connection was removed or
  moved to another address while it waited, or (for no answer) another request
  was answered meanwhile. `recheckReachability` runs it once more after a check
  already in flight, so a Retry that got through is not lost to a stale check.
  The probe loop uses it too.
- While offline, a 20 s probe loop runs `checkReachability` on each offline connection
  (through the client map `ApiProvider` registers via `setReachabilityClients`) until
  it answers.
- `firstOffline(connections, online)` names the first connection that is not
  answering: the top bar's server line and Home's servers pill show "&lt;server&gt;
  isn't answering" for it (`shell.notAnswering`) rather than a green count.
- On web only, the browser's `online`/`offline` events short-circuit the loop
  (an `online` event triggers an immediate probe - the NIC being up doesn't
  prove the *server* is).
- `onReconnect(cb)` is the hook everything else builds on: the progress queue
  flush and the global query invalidation both register here. The offline
  banner (`src/components/layout/offline-banner.tsx`) reads the store
  reactively.

Callers in the write paths (`progress-sync`, the history recorder in the player
store) consult `isReachable()` before firing and report a failure with
`noteFailure` (the progress saves also call `noteSuccess` when one gets
through), which is what keeps the classification current without a
dedicated heartbeat while healthy.

## Storage layers

Two deliberate tiers - know which one you're writing to:

| Layer | Module | Backing | Used for |
|---|---|---|---|
| Plain | `src/lib/storage.ts` (`getItem`/`setItem`/`removeItem`, JSON-serialized) | AsyncStorage (native) / localStorage (web, via AsyncStorage's web shim) | connection metadata, settings, language pref, downloads registry, progress mirror + queue, device id |
| Secret | `src/lib/secure-store.ts` (`getSecure`/`setSecure`/`deleteSecure`) | **expo-secure-store** (iOS Keychain / Android Keystore) on native (on iOS in the `audiosilo.tokens.afu` keychain service, readable after first unlock: [Native integrations](native-integrations.md#tokens-on-a-locked-phone-srclibsecure-storets)); localStorage on web, where SecureStore doesn't exist | **session tokens only** (`audiosilo.token.<connectionId>`) |

The split exists because tokens are the only true secret the app holds:
hardware-backed storage on native is worth the extra API, while everything else
is non-sensitive state that benefits from the simpler JSON layer. On web both
tiers degrade to localStorage - same-origin script access is the trust boundary
there regardless. `storage.ts` swallows storage errors (best-effort semantics), so
its callers never need try/catch for a full disk or a blocked localStorage.
`secure-store.ts` does so only on the web: on native a token read can reject (on iOS
a locked keychain, "interaction is not allowed"), and the session's hydrate relies on
that ([Session](#session-srcstoressessionts)).
