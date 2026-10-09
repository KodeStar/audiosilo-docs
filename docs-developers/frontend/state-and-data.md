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
- **Error mapping.** Any non-2xx throws `ApiError(status, message)` carrying
  the server's `{ error }` string. A request that exceeds the client timeout
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
  back, `onSettled` invalidates to reconcile server-derived fields.
- `useMarkFinished` deliberately routes through the offline-aware
  `saveProgress` (below) instead of a bare mutation, so a "mark finished"
  reconciles with playback progress under the same last-write-wins rules.
- `useServerInfo` uses `useOptionalApi` + `enabled: !!api` and a 5-minute
  `staleTime`, so chrome that renders before a connection exists is safe.

**Multi-connection support.** The app can be signed in to several servers at
once. `ApiProvider` builds an `ApiClient` per connection (memoized on the
connection list, so switching the active server doesn't recreate clients) and
exposes them via `useApi(connectionId?)` (active by default, throws if none),
`useOptionalApi`, and `useApis` (all of them). The `use*All` hooks
(`useLibrariesAll`, `useSearchAll`, `useRecentAll`, `useFavouritesAll`,
`useAllProgressAll`, `useBookCopies`) fan out with `useQueries` + `combine`,
tag results with their connection, and de-duplicate books via `src/lib/dedup.ts`
(source order = user's connection order breaks ties). `useSourceLabeller` names
where a result lives ("server · library") for de-duplicated rows.

`provider.tsx` also registers an `onReconnect` handler that invalidates **all**
queries when the server becomes reachable again - screens that errored or
emptied while offline repopulate without a remount.

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
| `seriesBooks(lib, names, { limit })` / `seriesBooksPage(lib, name, { limit })` | `useLibraryBooks(..., { batch: true })` (the Series cards, through `useSeriesBooks`) | `series_books` | `GET /libraries/{id}/series/books?name=...` (`SeriesBooks`, one `SeriesBooksEntry` per name) |
| `nextBook(lib, path)` | `useNextBook(lib, path, enabled?, connectionId?)` | `next_book` | `GET /libraries/{id}/next` (`NextBook`) |
| `bookMeta(lib, path, signal, { includePrevious, hideSpoilers })` | `useBookMeta(lib, path, enabled, opts?)` | `meta_bundle` (the caller checks it; the hook gates only on `enabled`) | `GET /libraries/{id}/meta?include=previous&spoilers=hide` |
| `coverUrl(lib, path, { size, version })` | - | `cover_sizes` for `size` | `GET /libraries/{id}/cover?size=&v=` |

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
  `memberships` and no other filter) fetches its **first page** through
  `client.seriesBooksPage`. That is a per-(library, page size) `createBatchLoader`
  (`src/lib/batch-loader.ts`): every series asked for within 10 ms goes out as one
  `GET /libraries/{id}/series/books` per 50 names (`SERIES_BOOKS_MAX_NAMES`), or
  fewer when long names would pass 4000 bytes of query
  (`SERIES_BATCH_MAX_QUERY_BYTES`). The page lands under the same
  `qk.libraryBooks` key as an ordinary `listBooks` answer, so the series page,
  which asks plainly, reuses the cards' cache, and later pages stay on `/books`.
  The batched fetch never reads react-query's `signal`: the request is shared, so a
  card scrolled off still caches its page instead of cancelling it for the others.
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

Writes from screens follow the [1b write rules](#the-listeners-own-state-player-redesign-phase-1b)
(positioned adds, exact-path removes): Up next's drag/keys and a collection's Move
up / Move down send `position` = the visible index (`moveIndex` in
`collections-model.ts`, `moveItem` in `up-next-model.ts`), and an Undo re-adds at
the old index. `useSetQueue` / `useSetCollectionItems` have no caller.

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
horizontal rail per series family). `matchedMeta(meta, enabled)` narrows the
envelope once for the screen; `seriesRails(series, currentWorkId, picks)` builds
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

### Home

Home (`src/components/home/`) aggregates every connection and keeps its rules
pure:

- `home-model.ts`: `pickNowBook` (the loaded book, else the most recently played
  in progress), `syncPill` (told as it is: a save still in the offline queue, or an
  unreachable server, is "Saved on this device, will sync"; otherwise the newest
  `updated_at` any server holds), `nextCandidates` (the Now book, other books in
  progress, then recently finished, at most `NEXT_CANDIDATES` = 6, one `/next` each
  on the candidate's own server), `nextInSeriesItems` (an owned next book, else the
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

- **Books**: `useSearchAll` across every connection, de-duplicated (`src/lib/dedup.ts`),
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

## Zustand stores

### Session (`src/stores/session.ts`)

Multi-connection: a `Connection` is `{ id, serverUrl, name, token, user,
needsReconnect?, addresses? }`. The `id` is the server-minted `server_id`, so it keys
every per-server store. `serverUrl` is the address the listener paired with or typed,
never rewritten; `addresses` is the server's home and away addresses (capability
`addresses`), and which one requests go to right now is an in-memory pick, never stored
(see [Connect and home/away addresses](connect-and-addresses.md#home-and-away-addresses)).
Connection **metadata** persists to AsyncStorage (`audiosilo.connections` +
`audiosilo.activeConnection`, the default connection's id under its legacy name); each
connection's **token** lives in secure-store under `audiosilo.token.<id>` - tokens are
stripped before the metadata is persisted. `hydrate()` restores the connections whose
token is still there (it runs after the launch reset, below, so it never reads
wrongly-keyed records). `setSession` refuses an empty `server_id`, then adds or updates
**by `server_id`** (re-pairing the same server at another URL updates its connection
instead of adding one), merges the addresses it is given with what the device knew
(`mergeAddresses`), makes it the default, remembers the server durably without its
token (`src/lib/known-servers.ts`, the connect screen's Reconnect rows), and drops any
**other** connection at the same URL: a rebuilt server mints a new `server_id` at the
same address, so that one is a dead identity, whose token and scoped state go.
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

### Settings (`src/stores/settings.ts`)

Playback tunables persisted as one JSON blob (`audiosilo.settings`):
`skipForward` (30), `skipBackward` (15), `defaultRate` (1), `autoRewindMax`
(5 s), `virtualChapterInterval` (30 min), and the audio effects `smartSpeed` and
`voiceBoost` (off; see [Smart speed and Voice boost](audio-effects.md#the-settings-and-the-ui)).
The playback layer subscribes and re-`configure`s the engine whenever these change.
The same document holds the end-of-book and download behaviour - `autoPlayNext` (off), `autoDownloadNext`
(`never | wifi | always`, default `wifi`), `keepAhead` (`0 | 1 | 2 | 3`, default
`0` = off; `toKeepAhead` reads a stored value that isn't one as off; see
[Offline](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts))
and `autoDeleteFinished`
(on) - and the auto sleep timer's settings.

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
  cache; bump it only when the connection identity scheme itself changes, because it
  signs everyone out. The **cache** axis (`audiosilo.cacheVersion`) wipes only the
  scoped cache (`audiosilo.downloads`, `audiosilo.progressMirror`,
  `audiosilo.progressQueue`, `audiosilo.offlineServers`) and keeps every login: it is
  the knob for any change to how that cache is keyed (a pre-split install adopts the
  version without a wipe). Either reset makes `bootstrapPlayback` wipe the on-disk
  downloads too. An `onConnectionRemoved` handler drops a removed connection's mirror
  records and queued saves.

:::note No realtime sync
Progress sync is REST-only. The server advertises a `websocket` capability flag
for a future realtime channel, but no WebSocket client exists in the frontend -
don't document or rely on one.
:::

## Reachability (`src/api/reachability.ts`)

A tiny Zustand store (`useReachability { online }`) plus module functions,
tracking whether the **active server** is reachable so the sync layer stops
hammering a dead endpoint:

- Starts optimistic (`online: true`).
- `noteError(e)` classifies failures: an `ApiError` means the server *answered*
  (even a 500) → reachable; an `AbortError` (deliberate cancel) is ignored;
  anything else - including the client's `TimeoutError` - flips to offline.
  `noteSuccess()` flips back.
- While offline, a 20 s probe loop calls `serverInfo()` on each offline connection's
  client (the map `ApiProvider` registers via `setReachabilityClients`) until it answers.
- On web only, the browser's `online`/`offline` events short-circuit the loop
  (an `online` event triggers an immediate probe - the NIC being up doesn't
  prove the *server* is).
- `onReconnect(cb)` is the hook everything else builds on: the progress queue
  flush and the global query invalidation both register here. The offline
  banner (`src/components/layout/offline-banner.tsx`) reads the store
  reactively.

Callers in the write paths (`progress-sync`, the history recorder in the player
store) consult `isReachable()` before firing and call `noteError`/`noteSuccess`
around requests, which is what keeps the classification current without a
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
