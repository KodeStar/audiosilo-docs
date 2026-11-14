---
title: State & data
description: "The typed API client and its hand-mirrored types, React Query conventions, capability gating in the screens, the annotations data layer, the models behind Home and Search (including the character spoiler rules), the Zustand stores, offline-safe progress sync, reachability tracking, and the two storage layers."
---

The data layer follows one split consistently:

- **Server state lives in TanStack Query**, fetched through a typed client.
- **Client state lives in Zustand stores.**
- **Anything durable is persisted path-keyed** through one of two storage layers.

## The API client (`src/api/client.ts`)

`ApiClient` is a thin, fully-typed fetch wrapper over the server's REST API. There
is one instance per server connection, holding the base URL and the optional
session token. The [API reference](../server/api/reference.md) lists the
endpoints themselves.

- **Envelope unwrapping.** The Go handlers wrap lists (`{ libraries }`,
  `{ books }`, `{ progress }`, `{ bookmarks }`, `{ notes }`, `{ favourites }`,
  `{ history }`). The client methods unwrap them and default `null` to `[]`, so
  callers always get plain arrays. Auth returns `{ token, user }`, and `/me`
  returns the user directly.
- **Errors.** Any non-2xx answer throws an `ApiError`. A request with no answer
  throws `TimeoutError` or `NetworkError`. See [Error mapping](#error-mapping).
- **Client identification.** `request()` sends
  `X-AudioSilo-Client: AudioSilo/<APP_VERSION, or dev> (<Platform.OS>)` on every
  API call (`clientIdentity` in `src/lib/client-id.ts`). The server records which
  app and build owns each session token, for the admin console.
  - Native always sends the header.
  - On web, `shouldIdentify` sends it **only when the API base URL is same-origin
    with the page**. A custom header makes a cross-origin request non-simple (it
    needs a CORS preflight). Servers released before the header don't list it in
    `Access-Control-Allow-Headers`, so a newer web build would fail every
    cross-origin call to an older server. The embedded `/web` player is
    same-origin and always identifies itself. A dev build on `:8081` against a
    server on `:8080` doesn't.
  - `authHeaders()`, which the media layers use, doesn't carry the header. The
    server keeps the stored app when a request has no header.

  See [Client identification](../server/api/index.md#client-identification-x-audiosilo-client).
- **Proxy headers.** A connection's [proxy headers](#proxy-headers) are the
  constructor's sixth argument. `request()` and every hand-built request send
  them, `authHeaders()` hands them to the media layers with the token, and
  `proxyHeadersFor(url)` gives them alone for a URL that carries `?token=`.
- **Path-addressed everything.** Content calls are
  `GET /libraries/{id}/{item,chapters,cover,stream}?path=…` and the like. The path
  rides as a query parameter, never a URL segment, because encoded slashes are a
  trap.
- **`mediaTokenQuery`.** Cover and stream URLs embed the session token as
  `?token=` **on every platform**. Web requires it, because `<img>` and `<audio>`
  can't set an `Authorization` header. Native uses it too, so media auth never
  depends on whether a given native library forwards custom headers. Native also
  passes `authHeaders()` on the playback track and artwork requests as a second
  safeguard. The server side of this seam is the media-GET `?token=` fallback in
  `internal/api/middleware.go` (see [auth & security](../server/auth-and-security.md)).
- **`streamUrl(libraryId, path, download?, opts?)`** can ask for the
  download-disposition variant (`download=1`, used by the download engines) and
  for an on-the-fly MP3 transcode (`transcode=1`, with `t=<seconds>` for a
  mid-file start). [Web transcode negotiation](playback.md#web-transcode-negotiation-transcodets)
  covers when the web player uses it.
- **`history(libraryId, path, limit?)`** returns a book's listening spans, newest
  first. It passes [`limit`](../server/api/reference.md#get-apiv1librariesidhistory)
  as the server takes it. The end credits ask for 500 to sum the time listened.
- **`coverUrl(libraryId, path, opts?)`** takes `{ size, version }`. With no
  options the URL is the plain `?path=&token=` form, as it always was.
  - `size` (`CoverSize`, `160 | 320 | 640`) asks for a JPEG thumbnail whose
    **longer side** is at most that many pixels. Send it only when the server
    advertises `cover_sizes`. Any other value is a `400`, and an older server
    ignores it and sends the full art.
  - A thumbnail is a `404` when the server can't make one (art it can't decode,
    or over 40 megapixels), while the full-art URL may still serve the art. Fall
    back to the URL without `size`.
  - `version` is the book's `cover_version`, appended as `v=` purely as a cache
    buster; the server ignores it. It is not a content hash (`Book.cover_version`
    in `types.ts` says when it moves). An empty version adds nothing.

### Error mapping

Any non-2xx answer throws `ApiError(status, message, code?)`. It carries the
server's `{ error }` string and, when the route gives one, its machine-readable
`code`. Screens branch on `apiErrorKind(e)`, never on the message, which is the
server's English and is never shown. `apiErrorKind` returns:

- the code, when it is one the app knows (the `API_ERROR_CODES` list below);
- otherwise the kind of the status: `too_many` for 429, `not_found` for 404,
  `forbidden` for 403, `invalid` for 400, `conflict` for 409, and `failed` for
  anything else or no answer. So an older server without codes still reads
  sensibly.

| Codes in `API_ERROR_CODES` | From |
|---|---|
| `member_limit`, `username_taken`, `invalid_name`, `invalid_collections`, `feature_off`, `not_allowed`, `member_cannot_manage`, `member_disabled`, `kid_account`, `demo_account` | the household members routes, and pairing (`kid_account`) |
| `library_not_writable`, `kind_unavailable`, `detect_open`, `contribute_open`, `generate_open`, `readalong_open`, `no_ebook` | the Bridge's routes |
| `no_readalong`, `readalong_stale` | the read-along map |
| `module_off`, `bridge_unavailable`, `fetch_limit`, `identity_changed`, `show_not_found`, `privacy_conflict`, `too_many_requests`, `checked_recently`, `invalid_feed_url`, `no_library_access`, `not_podcast_library` | podcasts (following, fetching, adding shows) |
| `discovery_off`, `provider_unavailable`, `invalid_query`, `invalid_country`, `discovery_rate_limited`, `provider_rate_limited`, `discovery_busy`, `discovery_timeout`, `provider_rejected`, `discovery_unavailable` | podcast directory search |
| `opml_rate_limited`, `opml_busy`, `opml_limit`, `invalid_opml`, `unsupported_opml_type`, `opml_export_limit` | OPML import and export |
| `not_a_book` | `POST /cast/token` for an item that is not a book |
| `invite_used`, `invite_expired` | redeeming an invite code |

A new code needs a case in the list and its words in the screens. Without them it
reads by its status.

Two other errors cover a request that gets no answer:

- **`TimeoutError`.** A request that exceeds the client timeout (default 15 s,
  enforced with an internal `AbortController`) throws `TimeoutError`. It is
  deliberately distinct from the `AbortError` that a caller-supplied signal
  raises, so the reachability layer can classify a timeout as "server
  unreachable" while ignoring deliberate cancels.
- **`NetworkError`.** A fetch that gets no answer at all (no network, refused,
  DNS, TLS) throws `NetworkError` on every platform. It is a `TypeError` that
  carries the fetch's rejection as its `cause`. The app's fetch is Expo's, which
  rejects with a plain `Error`, so this wrapper is what lets an offline phone be
  classed unreachable.

## `types.ts`: the mirroring rule {/* #typests---the-mirroring-rule */}

`src/api/types.ts` holds hand-written TypeScript mirrors of the server's JSON
shapes (`ServerInfo`, `User`, `Book`, `Chapter`, `ChaptersResponse`,
`Progress`, `Favourite`, …). There is **no codegen**. A wire-format change must
touch the Go handler *and* this file, plus `client.ts`, `hooks.ts` and tests on
both sides, in one logical change. This rule is the core of the
[cross-repo contract](../architecture/cross-repo-contract.md), and
[making cross-repo changes](../contributing/cross-repo-changes.md) describes the
workflow.

Two more points from the comments in that file. `Book.id` exists but is an
internal index artifact; identity is `(library_id, rel_path)`. `dedup_key` is a
display-grouping hint, never something to key durable state on.

## React Query (`src/api/hooks.ts`, `src/api/provider.tsx`)

The `QueryClient` is a module-level singleton (`queryClient` in `provider.tsx`)
with `retry: retryQuery`, `staleTime: 30s` and `refetchOnWindowFocus: false`. It is
module-level because non-React code (the playback and downloads stores) uses it
to invalidate and seed queries.

### Query keys

All keys come from the `qk` factory and are **scoped by connection id** as their
first coordinate. The app can be signed in to several servers at once, and two of
them can each have a "library 1". With scoped keys, mutations can invalidate
precisely and one server's cache never shadows another's. Content keys are
`(connectionId, libraryId, path)` tuples, which extends the path-is-identity rule
across connections.

| Arguments | Keys |
|---|---|
| `(cid)` | `qk.server`, `qk.libraries`, `qk.favourites`, `qk.allProgress`, `qk.myHistory`, `qk.myBookmarks`, `qk.myNotes` |
| `(cid, lib)` | `qk.authors`, `qk.narrators`, `qk.seriesList` |
| `(cid, lib, path)` | `qk.item`, `qk.chapters`, `qk.progress`, `qk.bookmarks`, `qk.notes`, `qk.history`, `qk.browse`, `qk.nextBook` |
| `(cid, lib, path, opts?)` | `qk.bookMeta` |
| `(cid, lib, query)` | `qk.libraryBooks` |
| `(cid, workId)` | `qk.metaWork` |

### Patterns to copy when adding an endpoint

- **Plain reads.** `useQuery` with a `qk` key and an `enabled: path.length > 0`
  guard.
- **Paged reads.** `useBrowseInfinite` uses `useInfiniteQuery` against the
  server's `next_offset` cursor (500-entry pages). The browse screen drains all
  pages, so the A–Z rail and the filter work on the complete folder. The
  across-books lists are infinite query options (see
  [Bookmarks, notes and the Journal](#bookmarks-notes-and-the-journal)). The
  community metadata reads are query options too (`bookMetaQuery`,
  `metaWorkQuery`), shared by `useBookMeta` and `useMetaWork`, the offline
  companion and Search.
- **Mutations** invalidate their exact key on success (`useAddNote`,
  `useDeleteBookmark`, …). `addBookmark()` is the framework-free twin for callers
  outside React. It invalidates `qk.bookmarks` and `qk.myBookmarks` after the
  write. In the app a mutation is never held for the network (see
  [The online flag](#the-online-flag-srclibdevice-onlinets)).
- **Optimistic updates.** `useToggleFavourite` shows the full pattern. `onMutate`
  cancels, snapshots and patches the cached list; `onError` rolls back;
  `onSettled` invalidates to reconcile server-derived fields.
  - When no list had been read before the toggle, `onError` has no snapshot to put
    back. It resets the query to unread, so a failed heart doesn't stay shown as
    saved.
  - The server derives a favourite's `is_book` from its index. So hearting a
    folder that `/fs` flags `pending_book` (`pendingBook` in
    `ToggleFavouriteVars`) also reads the book through the item query beside the
    add. `GET /item` indexes the book on demand. The read is asked once, with
    `networkMode: 'always'` and no retry, as a best effort. Once it succeeds, the
    hook marks the parent folder's browse listing stale.
  - The optimistic stub is `is_book: true`, and the mutation settles only once
    both requests are done, so Favourites and Home show a book, not a folder. If
    the read fails, the server's answer stays a folder until a scan indexes it.
    The favourite is saved either way.
  - Toggles of one connection run one at a time (the mutation `scope`), and only
    the last of a run invalidates the list, so an earlier answer can't flip the
    heart back.
- **`useMarkFinished`** never sends a bare mutation. It takes one of two routes.
  - **On a `listening_sync` server** it records a `finish` event through the
    player's store (`recordFinishEvent` in `src/playback/finish-route.ts`). The
    store registers that function as it loads, since the hooks can't import the
    store. The book's open span closes first and goes before the finish, and the
    finish is dated after that span's end, because the server applies a batch in
    time order. The mirror records the book finished (`finishedSave`, the same
    record the `PUT` path sends). Offline, the event waits in
    [the outbox](offline.md#listening-sync-the-outbox). The mutation runs
    whatever the online flag says (`networkMode: 'always'`; both routes work
    offline), so the toast with Undo shows offline too. The mutation resolves
    once the event waits in the outbox. The store reads the lists and the book's
    progress row again once the event is sent.
  - **Elsewhere** it goes through the offline-aware `saveProgress` (see
    [Progress sync](#progress-sync-srcplaybackprogress-syncts)), so a "mark
    finished" reconciles with playback progress under the same last-write-wins
    rules.

  The book menu (`onFinish` in `book-actions.tsx`) calls the hook only where the
  finish goes as an event (`finishTakesEvent`) or the server has no
  `progress_edit`. With `progress_edit` and no event route, its Mark as finished
  is a `useEditProgress` edit, which needs the server. Nothing queues it offline.
- **`useServerInfo`** uses `useOptionalApi` with `enabled: !!api` and a 5-minute
  `staleTime`, so chrome that renders before a connection exists is safe.

### Several connections

The app can be signed in to several servers at once. `ApiProvider` builds an
`ApiClient` per connection, memoized on the connection list, so switching the
active server doesn't recreate clients. Three hooks expose them:

- `useApi(connectionId?)` gives the active connection's client by default and
  throws if there is none.
- `useOptionalApi`.
- `useApis` gives the clients of the person listening: the active profile's
  connections, or none while someone must be chosen (see
  [Profiles](profiles.md#visible-and-background-connections)).

The `use*All` hooks (`useLibrariesAll`, `useSearchAll`, `useRecentAll`,
`useFavouritesAll`, `useAllProgressAll`, `useBookCopies`) fan out with
`useQueries` and `combine`. They tag each result with its connection and
de-duplicate books through `src/lib/dedup.ts`. The source order, which is the
user's connection order, breaks ties. `useSourceLabeller` names where a result
lives ("server · library") for de-duplicated rows.

### Reconnects and retries

`provider.tsx` also registers an `onReconnect` handler that invalidates **all**
queries when the server becomes reachable again. Screens that errored or emptied
while offline repopulate without a remount.

The query cache also tells reachability what a query learnt:

- `onError` hands a failure to `noteFailure`.
- `onSuccess`, for a connection marked down, asks for a check
  (`recheckReachability`). The public `/server` query's success is that check's
  own answer (`noteSuccess`).

No other query sets the state itself. A failure or a success only asks for a
check (see [Reachability](#reachability-srcapireachabilityts)).

The default retry is `retryQuery`. It retries once, and never for a 401 or for
content that isn't there (`isNotInLibraryError`: a 404, 403 or 400). A refused
token stays refused and a missing book stays missing, so a retry only doubled
every dead request.

### The online flag (`src/lib/device-online.ts`)

`useDeviceOnline()` and `watchDeviceOnline(listener)` say whether the device has a
network at all. They never say whether the internet answers.

- **On the web** the signal is the browser's `online` and `offline` events.
- **In the app** it is expo-network's `isConnected`. `isInternetReachable` is not
  read. A phone on Wi-Fi with no internet still reaches a server on the same
  network. Calling that phone offline would hide Retry and the Library.
- **Unknown counts as online.** That covers a state not yet read, a read that
  failed, and a network Android can't name (`type: UNKNOWN`, which Android reports
  with `isConnected: false`).
- **The first read never undoes a change the listener already reported.** iOS can
  answer `getNetworkStateAsync` up to 5 s late.

In the app the same source drives TanStack's `onlineManager`
(`onlineManager.setEventListener(watchDeviceOnline)` in `provider.tsx`). The web
keeps TanStack's own window listeners, which are the same events. So every
platform follows these rules:

- **A query waits while the device has no network** (`fetchStatus: 'paused'`,
  `isPaused`) and is asked again when the network returns. A screen treats a
  paused query as offline, not as loading (see
  [Offline states](#offline-states-srcliboffline-statets)).
- **A read that must settle either way** asks with `networkMode: 'always'` or
  through `fetchFailFast`
  ([Capability-gated reads](#capability-gated-reads-player-redesign-phase-1a)).
  That is any read with a copy on this device to fall back to. `useBookProgress`
  falls back to the mirror, and a held read would never reach the mirror.
- **A framework-free `queryClient.fetchQuery` waits too**, unless it asks with
  `networkMode: 'always'`. Keep-ahead's item and chapters reads are held this way
  (see [Offline](offline.md#the-controller)).
- **Writes are never held in the app.** The query client's `mutations` default
  there is `networkMode: 'always'`. A bookmark, note, rating, queue, collection or
  progress edit made with no network fails at once, unsent (see below), and shows
  its screen's own error with the form still open. A held mutation lives only in
  memory, so Save would spin, and the write would be lost if the app closed
  before the network returned. Three writes are not mutations and keep their own
  queues:
  - the listening place, in
    [Progress sync](#progress-sync-srcplaybackprogress-syncts) or, on a
    `listening_sync` server, in
    [the outbox](offline.md#listening-sync-the-outbox);
  - the reading place, in its own queue
    ([The ebook reader](reader.md#the-reading-place));
  - a bookmark pressed in the car, under `audiosilo.carBookmarks`
    ([Native integrations](native-integrations.md#what-the-controller-answers)).
- **The web keeps TanStack's default for writes.** A write waits for the browser
  to come back online. A write that must work offline on the web too says so
  itself (`useMarkFinished`).
- **In the app the API client refuses a request with no network.** While
  `isDeviceOnline()` reads false, `ApiClient.send` throws the `NetworkError` of no
  answer before any fetch. Sent, a request could wait out its whole timeout first
  (iOS in airplane mode): a bookmark's error came 20-30 s after the tap, and a
  downloaded book's resume lookup held its start. Every request path gets it:
  queries, writes, `fetchFailFast`, the save loops and the car's kept bookmarks,
  which keep a `NetworkError` like any request with no answer. Unknown counts as
  online, so a server on the same Wi-Fi is always asked. The web leaves it to the
  browser, whose fetch fails at once offline.
- **`isDeviceOnline()`** reads the same signal once, outside React. In the app it
  is what the system said last (the query wiring always watches it there); on the
  web it is `navigator.onLine`. A reconnect's reachability check
  (`deviceNetworkChanged`) runs a microtask later, once every listener has heard
  the new state, so the client does not refuse it on the old "no network".

A held request neither fails nor marks its server down. So a surface that says
"offline" asks this signal too, and not reachability alone (Search's results,
`usePlayableHere`). Whether one server answers is a different question, which
[Reachability](#reachability-srcapireachabilityts) answers.

The tests are `src/lib/device-online.test.ts` and `src/api/online-wiring.test.ts`.
A test that mocks this module spreads `jest.requireActual`, because the provider
imports `watchDeviceOnline`.

### Offline states (`src/lib/offline-state.ts`)

One rule says what a read with nothing to show is:
`offlineState({ waiting, failed, deviceOnline })`.

| Answer | When | What the screen shows |
|---|---|---|
| `'offline'` | The read waits for the network (`isPaused`), or it failed with no network on the device. On a reload with no network the request is sent, and fails, before the query library hears there is none. | The offline state, with no Retry. The read is asked again by itself. |
| `'failed'` | The read failed with a network on the device, so the trouble is the server's. | The server's error, with Retry. |
| `null` | The read is loading, or loaded. | The screen's own states. |

A signed-out refusal is decided before the rule and is never "offline".

**Who asks the rule directly.** Home's hero (over `useAllProgressAll().offline`),
the Library's server state
([Library selection](#library-selection-srcstoreslibrary-selectionts)), Folders
(per server, over `LibrariesOfServer.paused`), Books mode (over
`useAllLibraryBooks().offline`) and the read-along map (`useBookReadalong`).

**A page or a list over one query** asks `useUnreadQuery(query)` with the query's
`{ data, isPaused, error }`:

- It answers `null` once the query holds data, so a kept answer always shows.
- It answers `'failed'` for an `ApiError`, which is the server's own answer. So
  the screen's sign-in or not-in-library state stands, whatever the network did
  since.
- The screen checks it **before its skeleton**. A held query stays `isPending`,
  and `useAllLibraryBooks().isLoading` counts it. A skeleton drawn for a held
  query never ends.

A page over the whole-library list asks `useUnreadBooks(list)`. There, a list read
to its end with no book in it counts as read, so its empty state shows. The
Journal's tabs ask `unreadSources` (`merge-model.ts`). A source held for the
network is `waiting`, and so is one whose `/server` flag is held.

These screens ask it:

- the Library's Series, Authors, Narrators, Collections and Shows modes;
- the series, author, narrator, book, episode, collection, show and folder
  pages;
- a book's bookmarks, notes and history sections;
- Signed-in devices (`DevicesSection`) and Your household (`HouseholdMembers`);
- Your listening (`StatsSection`), for both of its reads and for its server's
  `/server` answer. Any of the three held with nothing kept is the offline
  state. Until the `user_stats` flag is known neither read is asked, so neither
  is ever held;
- Year in listening, through `useYearStory`'s `offline` status, in the section
  and in the full-screen story. A streak or a goal held for the network is left
  out, like one that failed, so stats that are kept still tell their story;
- Favourites and Home's See all. With no row to show, each hands
  `useUnreadQuery` its fan-out's `offline` (`useFavouritesAll`, `useRecentAll`,
  `useAllProgressAll`), which says a server's list is held with nothing kept. So
  one server's empty answer is not "none" while another's is held. Nor is one
  server's progress with no finished book "none finished".

Where a screen has a sign-in state, the order is signed out, then offline, then
the error.

A page whose failure is `LoadFailedNote` (book, episode, folder) hands it the hint
as `offline`, so the sign-in state still comes first. A new screen with a skeleton
does the same.

**The surface** is `<OfflineState hint>`
(`src/components/layout/offline-state.tsx`): the offline icon, the title
`common.offlineTitle` and the caller's hint.

- `useOfflineHint` adds `common.offlineDownloads` to the hint only where downloads
  exist (`useDownloads.supported`). A web player on a plain-http address has no
  Downloads tab to send the listener to.
- Write a hint without the Downloads sentence, and never a second "You're
  offline" title. `common.offlinePage` and `common.offlineList` are the hints of
  a page and a list with nothing more to say.
- With no `hint` it shows the title alone. That is for a section of a page that
  is on screen, such as a downloaded book's bookmarks, where nothing sends the
  listener to Downloads.

The rule's tests are in `src/lib/offline-state.test.ts`.

### Connections that need signing in again

When a screen's load fails for a connection that needs signing in again, the
screen shows one `SignInAgainState` in place of its load error, its Retry and its
empty state. Those connections come from `useSignedOutConnections`: the
connections of the person listening that have `needsReconnect`. The state reads
"Sign in again to &lt;server&gt;" and offers the banner's Reconnect flow
(`reconnectConnection`). Its components are in
`src/components/layout/sign-in-again.tsx`. These screens show it:

- Home's Now card. Recently added hides its error.
- The Library: `refusedConnection` over the server the Library is on
  (`useSelectedLibrary().server`) while that server's list is not in, and in
  Folders mode and Books mode.
- Up next, as a compact row.
- You > Stats and Year (`useSignedOutConnection(cid)` when their reads fail).
- The book page, the episode page and folder browse, through `LoadFailedNote`. It
  shows the sign-in state for the page's `cid`, or else the `ErrorNote` with its
  Retry.

Folders mode lists one group per server that has libraries or failed to list
them, each under its server's name when there are several. A failed group that
is not signed out shows "Couldn't load libraries from &lt;server&gt;."
(`library.list.loadServerLibrariesError`) with a Retry that refetches only that
server's list (`useLibrariesAll().retryServer(connectionId)`). A group whose list
waits for the network, or failed with none on the device, keeps its row with
"You're offline" and `library.list.serverOffline`. With no library to list, no
failed server and no sign-in state, offline is the page's own state.

### The startup cache (web)

`src/api/startup-cache.ts` keeps the answers the first screens paint from. A
reload of the web player paints from them at once and asks again behind them (a
"stale while revalidate" start). Without the cache, a reload waited for
`/server`, the libraries and the first page of books before it drew a single
cover. A start with nothing kept (a first visit, a private window) asks for the
same first answers as the gate opens instead (see
[the web start](web-build.md#the-web-start-a-split-build)).

- **What is kept** (`isStartupQuery`): `/server`, the libraries, favourites, the
  queue, collections, the listening goal, the household, the author, narrator and
  series lists, and Home's shelves and cards (Recently added, Continue listening,
  the Now card's and This week's ranges). Of the whole-library list
  (`useWholeLibrary`, the one the Library grid paints from), only the first page
  is kept. It never keeps a book's detail or anything per book. A new
  first-screen query joins the list only if it is small.
- **Restore.** `provider.tsx` calls `restore(queryClient, { dropOnError })` at
  module load, before anything renders. Each kept answer goes into the query
  cache invalidated, so it shows until the new answer lands. A query already in
  the cache is left alone. The first observer of each query asks again, even one
  with `refetchOnMount: false` (a tile's saved progress, Up next), which would
  otherwise keep the last visit's answer as the truth. When that ask fails with a
  refused token (`isSignedOutError`, a 401), the kept answer is cleared, so the
  screen shows the sign-in state rather than the last visit's.
- **Save.** `startSaving` writes the document `SAVE_DELAY_MS` (2 s) after a kept
  query's answer (debounced) and when the page is hidden or left. It saves only
  the signed-in connections. Each entry is written while the document stays
  under `MAX_CHARS` (500,000 characters, about 100 KB for a 1,000-book library).
  localStorage's small per-origin quota is shared with the session, the progress
  queue and the downloads registry, whose writes fail quietly once it is full.
- **Scope.** The cache lives under `STARTUP_CACHE_KEY` (`audiosilo.startupCache`),
  one of the scoped keys, so a storage reset wipes it. Signing out or removing a
  connection drops its entries (`forget`). Every key carries its connection id,
  so the cache never reads another connection's entry or a signed-out one's. A
  document written by another app version is ignored, since the answers' shapes
  may have changed.
- **Native keeps none.** Its query cache lives as long as the app, a cold start
  is not a browser reload, and AsyncStorage can't be read before the first
  render.

### The kept `/server` answer (`src/api/server-snapshots.ts`)

Every capability gate reads `qk.server(cid)`. On a cold start with no network
that query is never answered, so without a kept copy every gate would wait on a
flag that never comes. So each connection's last `/server` answer is kept on the
device. It is the one copy of a server's facts for a launch that cannot reach it.

- **Where.** One document by connection id under `OFFLINE_SERVERS_KEY`
  (`audiosilo.offlineServers`), each entry `{ info, savedAt }`. It is one of the
  `SCOPED_STORAGE_KEYS`, so either storage reset wipes it. The identity migration
  re-keys it, and `onConnectionRemoved` forgets a removed connection's entry.
- **Kept on every answer** a request to `/server` gets (`watchServerAnswers`, a
  query-cache subscription). A `setQueryData` seed is `manual`, so it is never
  written back. An answer that says what the kept one says is not rewritten, and
  an older answer never replaces a newer one. Writes run under `tabLock`.
- **Kept on a read outside the cache** too (`keepServerAnswer`). The listening
  outbox's rollback check uses it
  ([Offline](offline.md#listening-sync-the-outbox)).
- **Seeded at launch.** `restoreServerSnapshots` runs in `bootstrapPlayback` with
  the stores' hydration, before any screen or the car's lists read a flag.
  `seedServerSnapshot` puts each kept answer into `qk.server(cid)`:
  - dated `savedAt`, so the first observer still asks the server again and the
    first answer replaces it;
  - with `gcTime: Infinity`;
  - never over an answer the cache already holds that is no older. On the web
    the startup cache may have restored one first.

So `useCapability`, `cachedCapability` and `fetchCapabilities` hold, offline, the
flags they held when the app was last online. Never keep another copy of a flag
beside the kept answer. A flag nobody has read stays unknown, and its reader decides what
unknown means. Listening sync counts it as on (`usesListeningSync`).

The tests are in `src/api/server-snapshots.test.ts`.

### Capability-gated reads {/* #capability-gated-reads-player-redesign-phase-1a */}

The methods and hooks in this section are tested in `client.test.ts` and
`hooks-capability.test.tsx`. The browse screens consume them (see
[Who reads what](#who-reads-what-phase-2)).

**`useCapability(flag, connectionId?)`** (exported from `hooks.ts`) is tri-state:

- `undefined` while the connection's `/server` info is unknown (still loading, or
  unreachable with no
  [kept answer](#the-kept-server-answer-srcapiserver-snapshotsts));
- then `true` or `false`. A server that predates the flag reads `false`.

A screen picks its fallback, or hides the feature, on `false`. On `undefined` it
waits or decides for itself.

Outside React, two functions read the flags:

- `cachedCapability(cid, flag)` reads the cached flag without asking.
- `fetchCapabilities(cid, client)` reads the flags through `fetchFailFast`, and
  falls back to the cached flags when the server can't be read. `fetchFailFast`
  is `fetchQuery` with `networkMode: 'always'` and no retry. It first cancels a
  paused fetch that a mounted hook holds for the same key. So a framework-free
  reader (the play path, the end of a book, keep-ahead) always settles, instead
  of waiting for [the online flag](#the-online-flag-srclibdevice-onlinets) or a
  hidden tab's focus.

`useServerInfo(connectionId?)` takes the same optional connection id as
`useCapability`. It keeps its answer (`gcTime: Infinity`), so a gated hook
mounted later starts from the known flags.

Each gated hook asks only a server whose flag is `true`. Until then its query has
**no function at all** (`skipToken`). Not even a manual `refetch` reaches an
older server (React Query rejects it instead), and the query stays pending.

| Client method | Hook | Capability | Endpoint |
|---|---|---|---|
| `listBooks(lib, { author, series, narrator, sort, limit, cursor })` | `useLibraryBooks(lib, query?, connectionId?)` | `browse_people`, only when `query.narrator` is set | `GET /libraries/{id}/books` (keyset pages of 100, `BookPage`; key `qk.libraryBooks`) |
| `authors(lib)` / `narrators(lib)` | `useAuthors` / `useNarrators(lib, connectionId?)` | `browse_people` | `GET /libraries/{id}/authors`, `/narrators` |
| `seriesList(lib)` | `useSeriesList(lib, connectionId?)` | `browse_people` | `GET /libraries/{id}/series` (`SeriesCount[]`) |
| `seriesBooks(lib, names, { limit })` / `seriesBooksPage(lib, name, { limit })` | `useLibraryBooks(..., { batch: true })` (the Series cards, through `useSeriesBooks`) | `series_books` picks this endpoint for the first page. Without it the hook still asks `listBooks`. | `GET /libraries/{id}/series/books?name=...` (`SeriesBooks`, one `SeriesBooksEntry` per distinct name) |
| `nextBook(lib, path)` | `useNextBook(lib, path, enabled?, connectionId?)` | `next_book` | `GET /libraries/{id}/next` (`NextBook`) |
| `bookMeta(lib, path, signal, { includePrevious, hideSpoilers })` | `useBookMeta(lib, path, enabled, opts?)` | `meta_bundle` (the caller checks it; the hook gates only on `enabled`) | `GET /libraries/{id}/meta?include=previous&spoilers=hide` |
| `coverUrl(lib, path, { size, version })` | - | `cover_sizes` for `size` | `GET /libraries/{id}/cover?size=&v=` |
| `communityCoverUrl(lib, path, coverUrl, { size })` | `useCommunityCover(cid, lib, path)` (a resolver, not a query) | `meta_covers` | `GET /libraries/{id}/meta/cover?path=&url=&size=` (see [Community covers](#community-covers-clientcommunitycoverurl)) |
| `readalong(lib, path)` | `useReadalong(lib, path, { enabled, generatedAt }, connectionId?)`, behind `useBookReadalong` | `readalong` | `GET /libraries/{id}/readalong` (the map, checked span by span into a `CheckedReadalongMap`; see [Read-along](#read-along-usereadalong-and-usebookreadalong)) |
| `readalongEstimate(lib, path)` | `useReadalongEstimate(lib, path, connectionId?)` | `bridge` | `GET /admin/bridge/estimate?kind=readalong.align` (`ReadalongEstimate`, admin only) |
| `librivoxSearch(q)` / `librivoxWork(id)` | `useLibrivoxSearch` / `useLibrivoxWork` | `metadata` (the page checks the whole gate; see [Find on LibriVox](library-and-browse.md#find-on-librivox-admin)) | `GET /admin/librivox/search`, `/admin/librivox/work` (admin only) |
| `librivoxFetch(lib, id)` / `bridgeJob(id)` | `useAddLibrivox` / `useLibrivoxJob` | `metadata` / `bridge` | `POST /admin/librivox/fetch`, `GET /admin/bridge/jobs/{id}` (admin only) |

- **People lists are normalised.** The server answers `{ authors, unknown }` and
  `{ narrators, unknown }`. The client returns both as one shape,
  `PeopleList { people: PersonCount[], unknown: number }`, defaulting a `null`
  array to `[]` and a missing count to `0`. `seriesList` unwraps `{ series }` to
  `SeriesCount[]`, and `listBooks` defaults `books` to `[]`. The three browse
  lists are whole-library aggregates, so they keep a **5-minute** `staleTime`.
- **`useLibraryBooks`** pages on the server's cursor (`BookListQuery`: an exact
  `author`, `series` or `narrator`, and `sort`). `author` and `series` work on
  every server. A `narrator` filter needs `browse_people`, because an older
  server ignores it and would answer with the whole library.
- **Series cards share one request.** Only the Series cards pass the `batch`
  option, through `useSeriesBooks(..., { batch: true })`. With it, and with
  `series_books` on the server, a plain series list fetches its **first page**
  through `client.seriesBooksPage`. A plain series list (`isPlainSeriesQuery`) is
  `series` with `memberships` (which `series_memberships` adds) and no other key,
  so no other filter and the default sort. Without `series_books` each card asks
  `/books` on its own.
  - `seriesBooksPage` is a `createBatchLoader` per library and page size
    (`src/lib/batch-loader.ts`). Every series asked for within 10 ms goes out as
    one `GET /libraries/{id}/series/books` per 50 names
    (`SERIES_BOOKS_MAX_NAMES`), or fewer names when long ones would pass 4000
    bytes of query (`SERIES_BATCH_MAX_QUERY_BYTES`).
  - The page lands under the same `qk.libraryBooks` key as an ordinary
    `listBooks` answer. So the series page, which asks plainly, reuses the cards'
    cache, and later pages stay on `/books`.
  - The batched fetch never reads react-query's `signal`. React-query cancels and
    throws away a fetch whose signal was read once its last observer leaves.
    Because the signal is never read, a card scrolled off before its page arrives
    still caches the page from the shared request. No caller can cancel that
    request; it has the client's normal timeout.
- **`bookMeta` options are part of the key.** `qk.bookMeta(cid, lib, path, opts)`
  adds a variant segment only when an option is set, under the plain key as a
  prefix, so invalidating the plain key reaches every variant. A `hideSpoilers`
  envelope is cut at the caller's saved progress when it is fetched, so it keeps
  the default 30 s `staleTime` instead of an hour.
- **Longer timeouts for upstream waits.** `nextBook`, and `bookMeta` with
  `includePrevious`, use a 30 s request timeout (the server's own request budget)
  instead of the client's 15 s. The server can spend its whole community-metadata
  budget before it answers.
- **`useNextBook`** takes an optional `connectionId` like `useBook`, so the
  player (outside any route scope) can ask the playing book's own server. Its
  `enabled` flag makes it fetch only when the answer is needed. A community
  `next` can be in another of the caller's libraries; open it by its own
  `library_id`. The end-of-book flow asks it through `resolveUpNext` after the Up
  next queue, and keeps the device-side folder sibling as the fallback for a
  server without `next_book` (see
  [The end of a book](end-of-book.md#what-plays-next-up-next-resolverts)).
- **New wire fields.** All are optional and absent on older servers.
  - `Book.published`, `description` (`/item` only), `cover_color`
    (`CoverColor { bg, accent?, on_accent? }`, read by the cover wash) and
    `cover_version` (the cover cache buster).
  - `BookMetaWork.community_description` and `attribution`
    (`BookMetaAttribution`). The server writes the CC BY-SA credit. A screen that
    shows community content must render it beside that content and never compose
    it; the series page and Search's character group do. `community_description`
    feeds the book page's About card (`aboutContent`).
  - `BookMetaRecording.chapter_count`, which has no reader yet.
  - `BookMetaRecording.librivox` (`BookMetaLibrivox { id, url?, zip_url? }`), only
    on a LibriVox recording. The About card links `url`
    ([The aside](book-page.md#the-aside)); nothing reads `id` or `zip_url` yet.
  - `local` (`BookRef`) on rail entries. It is how the series page and Next in
    your series tell an owned book from a ghost.
  - `previous` on a matched `BookMeta`. The
    [offline companion](offline.md#the-offline-companion-offline-metats) keeps and
    seeds it.

### Who reads what {/* #who-reads-what-phase-2 */}

Every screen reads a capability with `useCapability(flag, connectionId)` for the
connection it is about, and treats the three states the same way:

- `undefined` (the `/server` answer isn't in) hides the feature or waits. It
  never shows the feature and then takes it away.
- `false` hides it, or picks the old behaviour.
- `true` shows it.

Cross-server screens ask per connection (`useCapabilitiesAll` and
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
| `progress_edit` | the book menu's Mark as not finished, and Mark as finished with Undo (see [Mark as finished and Undo](#mark-as-finished-and-undo)) |
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
| `cast` | the Cast button and `prepareCast`. With no flag, or flags not known yet, there is no button and a cast is refused. See [Chromecast](chromecast.md) |

#### Mark as finished and Undo

With `progress_edit`, the book menu offers Mark as not finished, and Mark as
finished with Undo. Without it, Mark as finished is `useMarkFinished`, with no
Undo. With `progress_edit` and `listening_sync` both, the finish is
`useMarkFinished`'s event.

The Undo goes through `undoFinish`, which first takes back a `finish` event that
is still waiting. After that:

- a finish that cannot be on the server is undone on the device, with no edit;
- a finish the server has or may have (a request carried it and got no answer)
  takes the edit. After the edit, the device's own record also goes back to the
  place before.

See [Taking a finish back](offline.md#taking-a-finish-back).

#### Writes from screens

Writes from screens follow the
[write rules for the listener's own state](#the-listeners-own-state-player-redesign-phase-1b):
positioned adds and exact-path removes. Up next's drag and keys, and a
collection's Move up and Move down, send `position` as the visible index
(`moveIndex` in `collections-model.ts`, `moveItem` in `up-next-model.ts`). An
Undo re-adds at the old index. `useSetQueue` and `useSetCollectionItems` have no
caller.

### Read-along (`useReadalong` and `useBookReadalong`)

`Book.readalong` (`BookReadalong`) rides only on `GET /libraries/{id}/item`, never
on a list row. Its `state` is either `ready`, with `coverage` and `generated_at`,
or `stale`, with a `reason` of `ebook_changed` or `audio_changed`. It is absent on
older servers and for a book with no ebook or no valid map.

The map itself (`ReadalongMap`) comes from `client.readalong` and is checked span
by span, as [The ebook reader](reader.md#the-map) describes. `ReadalongMap` is
hand-mirrored from the Bridge's `internal/readalong` mapfile. `ReadalongSpan` is
`{cfi, start, end}` in whole-book seconds.

- **`useReadalong`** is keyed by the map's `generated_at`
  (`qk.readalong(cid, lib, path, generatedAt)`), with `staleTime: Infinity` and
  **no retry**. A 404 `no_readalong` or a 409 `readalong_stale` is final.
  - A map is one `generated_at`, so no copy is ever fetched twice. A map made
    again comes under its new key once the item names it.
  - A done `readalong.align` job reads the book's item again
    (`refreshAfterFinish`, the same as a generate or detect job).
    `useBridgeJobs` polls the book's jobs while a read-along job is open on a
    surface on screen.
- **`useBookReadalong`** (`src/reader/use-book-readalong.ts`) is what the
  surfaces call. It picks the download's copy or the server's map. Its contract
  is on [The ebook reader](reader.md#the-map).
- **`useReadalongEstimate`** sits under the book's `qk.bridgeEstimate` prefix
  (`qk.readalongEstimate`), so a refused queue reads it again with the other
  estimates. It gets `bridgeEstimate`'s longer budget, since the server may hash
  the ebook first. `ReadalongEstimate` carries `asr_hours`, `figures`,
  `writable`, the book's `ebook` (null when the job would be refused with 409
  `no_ebook`), its current `readalong`, and the `open_job` that a new job would
  be or wait for.
- **The job** is `readalong.align`, queued with `useQueueBridgeJob` and params
  `{}`. Its result on `done` is `ReadalongAlignResult`: the file written,
  `coverage`, `sections`, `spans`, `audio_gaps`, `heal_windows`, `transcribed`
  and `ebook_sha256`.

### Player modules (`src/modules/`)

A server's [managed modules](../server/modules.md) ship off, and an admin turns
one on in the console. A module's capability flag is named after the module. It
reads `true` only while the module is on **and** its Bridge requirement is met.

The player's side is its own registry, `PLAYER_MODULES` in
`src/modules/registry.ts`. This is not the repo-root `modules/`, which holds the
native Expo modules. The registry is **empty**. The slots are open and only tests
exercise them, so the player renders exactly as it would without them. The
Contributions module's actions are the console's; the player never contributes.

- **A module** is a `PlayerModule`: `{id, homeRails?, youSections?, bookActions?}`,
  with each slot optional.
  - `homeRails` renders once on Home, after Next in your series (`ModuleRails`).
  - `youSections` (`{key, label, render}`, a `YouModuleSection`) are sections of
    the You hub. They come after Account on a phone and after Journal in the wide
    sub-nav. `label` is a function of `t`, so it follows the language. `render`
    returns a column that the hub scrolls.
  - `bookActions` adds items to the book page's menu (`HeroActions`, after
    Regenerate) for a book whose server has the flag. Each item is keyed
    `<id>:<key>`, so it never meets the menu's own keys or another module's.
  - Hooks: a slot returns elements, so its hooks live in the components it
    returns. The slots call `homeRails` and `render` inside a component of their
    own, so a hook stays with its module as the active list changes.
    `bookActions` is a plain function, never a hook.
- **The You hub's keys.** `youModuleSections(active)` maps the active modules'
  sections by key, in registry order. The first section with a key wins. A blank
  key, or one of the hub's own (`CoreYouSection`), is ignored.
  `parseYouSection(raw, moduleKeys)` opens an active module's key, and opens
  Stats for a link to a module that is off. A link (`youHref`, `openYou`) takes
  only the hub's own sections.
- **Which are on.** `useActiveModules(list)` keeps the modules that some server of
  the person listening has on (`anyCapability` over `useCapabilitiesAll`).
  `useModulesOn(cid, list)` keeps one server's, since a book's actions go to its
  own server. Each slot reads them through `WithActiveModules`
  (`active-modules.tsx`), which asks nothing with an empty list. Slots take an
  optional `modules` prop (default: the registry), which the tests fill with a
  fake.
- **Module flags are mirrored.** A module's `id` is a `ModuleFlag`
  (`registry.ts`). It is a flag added to `Capabilities` in `types.ts` like any
  other, and named in `ModuleFlag` too. It is never a core flag such as `queue`,
  because the server refuses a module named after one. The capability hooks keep
  their closed key (`keyof Capabilities`), so a typo in a flag name stays a type
  error. `Capabilities.contributions` is typed already and read by nothing yet.
  `ServerInfo.bridge.features` may hold `contribute`.
- The book page's tabs (`BookTab`), the book menu's own keys (`BookActionKey`)
  and Settings' sections (`SettingsSection`) stay closed until a module needs
  them.

### The listener's own state {/* #the-listeners-own-state-player-redesign-phase-1b */}

The listener's own state joins the data layer in the same way: typed mirrors in
`types.ts`, methods in `client.ts` and hooks in `hooks.ts`, each gated on its
capability. Its readers:

- the screens in [Who reads what](#who-reads-what-phase-2) read `queue`,
  `collections`, `progress_edit` and `user_stats`;
- the end credits read `ratings` (`useRating` and `useMyRatings`, `useSetRating`)
  and the year's stats;
- the You hub reads `user_stats` and `my_devices` (Your listening, Year in
  listening, the Account page's devices).

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

- **Queries** are gated like the
  [capability-gated reads](#capability-gated-reads-player-redesign-phase-1a):
  `useCapability` plus `skipToken`, so a server without the flag is never asked.
- **Mutations go through `useCapabilityMutation`**, which checks the flag when
  the mutation runs. When the flag is false, or `/server` hasn't answered yet, it
  rejects with the exported **`CapabilityError`** and sends nothing. So an older
  server never answers a write with a bare `404`. `.capability` names the flag.
  `.unknown` is true, with its own message, when `/server` hasn't answered yet.
  It is not an `ApiError`, so it never raises the reconnect banner.
- **One connection, one write at a time.** Writes of one capability on one
  connection run one after another, in the order they were made (a React Query
  `scope`). The server applies them, and the cache takes their answers, in that
  order. Each mutation's `mutationKey` names its connection, so a hook switched to
  another connection never sends a queued write there.
- **The cache write is part of the mutation.** It runs inside the mutation
  function, against the connection the request went to, before the mutation
  resolves.
  - Answers land through `storeAnswer`. It cancels an in-flight read of the same
    key (which may have been answered before the write), keeps a pending refresh,
    and refetches when it can't place the answer.
  - Every list write answers with the stored list. A whole-list `PUT` silently
    skips entries that aren't an indexed book the caller can open. So the cache
    holds the server's answer, never what was sent, and nothing is optimistic.
  - A list entry carries `book` only while its path is indexed. Otherwise render
    it by its path leaf.
- **Bodies carry only the contract's fields**, because the server decodes
  strictly (an unknown key is a `400`). `setQueue` and `setCollectionItems` send
  only `{ library_id, path }` per item, so cached entries (with `added_at` and
  `book`) can be passed straight back. `createCollection`, `updateCollection` and
  `editProgress` send only their own fields.
- **Reorder with positioned adds, not a whole-list replace.** A replace deletes
  the caller's hidden entries (books under a share since taken away). So moving
  one book is `useAddToQueue` or `useAddCollectionItem` with a `position`, an
  index in the list as the caller sees it. Removes and deletes (queue, collection
  items, rating) are exact-path: pass the stored `path`. Adds and rating `PUT`s
  resolve a part path to its book.
- **Viewers can't edit.** A collection with `owned: false` is shared with the
  caller read-only. Writes to it answer `403` with `code: "not_owner"`, and
  `useDeleteCollection` on it means leave it. A deleted collection's detail is
  marked stale rather than removed.
- **`useSetRating` replaces the whole rating.** Leaving the note out clears a
  saved one.
- **Progress changes refresh what depends on them.** `useEditProgress` and the
  existing `useMarkFinished` refresh the listening stats, the goal and the book's
  `spoilers=hide` metadata variant. `useEditProgress` is server-side only. It
  does **not** touch the player's local progress mirror or the offline queue, so
  a device with the book loaded overrides the edit on its next save, as
  last-write-wins intends. Creating or revoking an API key refreshes My devices.
- **Never revoke the current device.** The row with `current: true` is the device
  the app is on. Sign out of that connection the normal way (`useSignOut`), which
  stops playback, saves the final position and flushes the queued progress before
  the token goes. Revoking it with `useRevokeMyDevice` would kill the token first,
  so those saves would be refused and lost. If it is revoked anyway, the answer is
  `{ current: true }` and the hook refetches nothing, because a refetch would only
  401 and raise the reconnect banner. The app must then sign out locally.
- **Streaks are computed on the device** from `useMyListening`'s `days` (server
  time).

### Household members

The capability is `household_members`. The wire format is in
[Household members](../server/api/reference.md#household-members), and the screens
are in [Household page and members](household.md).

**Types** in `types.ts`:

- `MemberKind`, `MemberAccess`, `HouseholdMember` (and its
  `HouseholdMemberCollection`), `HouseholdMembers`
  (`{ allowed, reason?, max, members }`, with `HouseholdMembersReason`),
  `AddMemberBody`, `AddMemberResult` (`{ member, session? }`) and
  `UpdateMemberBody`.
- `User` gains three optional fields. `managed_by` is a `UserRef`. `member_kind`
  is null for a non-member and absent on an older server. `display_name` is a
  member's name as the owner typed it, absent for everyone else; `personName`
  names a new profile after it.
- `MyDevice` gains `member_sign_ins`, and the revoke's answer is
  `MyDeviceRevoked` (`{ current, members_signed_out? }`).
- `Capabilities` gains `household_members`.

**Client methods** in `client.ts`: `members`, `addMember`, `memberSession`,
`memberPairing`, `memberDevices`, `revokeMemberDevice`, `updateMember`,
`deleteMember`, and `revokeMyDevice(id, { alsoMembers })`. `revokeMyDevice` adds
`?also_members=1` only when asked, and the old one-argument call is unchanged.

**Hooks** in `hooks.ts`:

- The queries `useHouseholdMembers` and `useMemberDevices(id)` are gated on
  `useCapability('household_members')` with `skipToken`.
- The mutations are `useAddMember`, `useMemberSession`, `useMemberPairing`,
  `useRevokeMemberDevice`, `useUpdateMember` and `useDeleteMember`. Each rejects
  with `CapabilityError` while the flag is off or unknown, sending nothing, so it
  is never a network failure for reachability.
- `useRevokeMyDevice` takes `{ id, alsoMembers? }` (`RevokeMyDeviceVars`), and
  sends `alsoMembers` only to a server with the flag.

What the mutations read again:

- the members list and that member's devices;
- the caller's own devices, when a sign-in on this device appears or goes, since
  those rows carry `member_sign_ins` (`invalidateHousehold`);
- the list after a refused write (a 404 means the member is gone);
- the collections after a member change that touches sharing (`collection_ids`,
  a delete), since each collection lists the people it is shared with.

When a connection is removed from the device (`removeConnection`, by any path),
the other connections to that server read their household again
(`onConnectionRemoved` in `hooks.ts`).

- **Refusals are read by kind** (see [Error mapping](#error-mapping)).
- **The members list never refuses an ordinary session.** A demo or member caller
  gets `allowed: false` with a `reason`. "At the cap" is the client's own check,
  `members.length >= max` (`addBlock` in
  `src/components/household/household-model.ts`).
- **A session the owner mints for this device** (the add's `session`,
  `useMemberSession`) **is placed with `addMemberHere`** (`renewMemberHere` for a
  member already here), never `finishConnect` (see
  [Signing a member in here](household.md#signing-a-member-in-here)). The owner
  stays the person listening, and the default connection doesn't move. A member
  who pairs their own device from the owner's code goes through `finishConnect`
  like anyone else.
- **What a member may open is the server's answer.** The player reads
  `member_kind` and `managed_by` only to shape its own screens, never to filter.
  - `member_kind` (`isKidAccount`) starts kids mode by default, and lets a kid's
    own profile be in kids mode with no grown-up (`mayTurnOnKids`). It leaves out
    what a kid's account can't do: the password button, Pair another device, API
    keys and house sharing.
  - `managed_by` picks the kids shelf's collections ([Kids mode](kids-mode.md)),
    names the owner (`managerName`), and finds the owner's sign-in that can renew
    the member's session (`memberOwnerHere`).

### Bookmarks, notes and the Journal

The server's `annotations` capability is mirrored like
[the listener's own state](#the-listeners-own-state-player-redesign-phase-1b).
Every hook takes an optional trailing `connectionId` and gates on the flag.

| Capability | Queries | Mutation hooks | Types |
|---|---|---|---|
| `annotations` | `myBookmarksQuery`, `myNotesQuery` | `useUpdateBookmark`, `useUpdateNote` (`useCapabilityMutation`); `useAddBookmark` / `addBookmark` send a `label` only with the flag | `BookmarkLabel`, `BookmarkPatch`, `NotePatch`, `MyBookmark`, `MyNote`, `Page<T>`, `PageQuery`; `label?` on `Bookmark` |
| none | `myHistoryQuery` (every server has `GET /me/history`) | - | `HistoryEntry` |

- **The lists across books are infinite query options**, not hooks, because the
  Journal reads every server's lists at once
  ([`useInfiniteQueries`](journal.md#sources-one-infinite-query-per-server)).
  - Each one is a `pagedList`: pages of 100 on the server's opaque
    `next_cursor`. The client normalises them to `Page<T> = { items, next_cursor? }`,
    and `flattenPages` joins them.
  - They stay fresh for five minutes, since this device's own writes refresh
    them.
  - A gated one has no query function (`skipToken`) until the flag is known to be
    `true`.
  - `keepFirstPage` trims a list that nothing reads any more to its first page,
    so a later visit doesn't refetch twenty pages one after another.
- **A label goes only to a server with the flag.** Bodies are decoded strictly
  ([Capability flags](../server/api/index.md#capability-flags---gate-your-features)).
  `ApiClient.addBookmark` sends `label` only when given. `useAddBookmark` and the
  framework-free `addBookmark` give it only when the flag is `true`
  (`useCapability` or `cachedCapability`). `updateBookmark` and `updateNote` send
  only the patch's own fields, so a spread `Bookmark` never reaches the wire.
- **Cache writes.** An edit stores its answer in the book's own list
  (`storeAnswer`) and patches the across-books pages in place (`replaceInPages`)
  before invalidating them. A delete removes the row from the pages
  (`removeFromPages`). An add invalidates the across-books key.

The screens are [Bookmarks and notes](annotations.md) and
[The Journal](journal.md). The wire format is in the
[API reference](../server/api/reference.md#patch-apiv1bookmarksid).

### Enriched book metadata

`src/components/library/book-meta.tsx` renders the meta-driven tabs:
`BookMetaRecapsTab`, `BookMetaCharactersTab` and `BookMetaSeriesTab` (one
horizontal rail per series family). The About card is the book page's own
`BookAbout` (see [The book page](book-page.md#the-aside)).

Each field is read through one of two readers, never both:

- `matchedMeta(meta, enabled)` narrows the envelope once for the screen to the
  matched half only. The rails, the AudioSilo Meta links, the end credits and
  About's recording facts need a real community match.
- `bookMetaWork(meta, enabled)` serves About's work text and every work-level
  field, the Characters and Recaps tabs, their counts and the companion. It gives
  the matched work, or an unmatched book's
  [generated work](../server/api/reference.md#generated-content) (`matched: false`
  with a `work`). So an unmatched book's generated description reaches About too.

Two gates in `meta-gating.ts` decide whether a screen asks `/meta`:

- `bookPageMetaEnabled`: the `metadata` capability and a loaded book that is not
  an episode, identifiers or not. Only the book page uses it. A newer server
  answers a book with no ASIN or ISBN from its console match (a LibriVox
  download), and an older one answers `matched: false` without asking upstream,
  so the one request is cheap either way.
- `metaEnabledFor`: that gate and an ASIN, an ISBN **or** `generated: true`. The
  companion and reveal toast, Home's Now card and Previously on, the end credits
  and the offline copy (`canMatch` in `offline-meta.ts`) use it, because they ask
  for a book in passing or for every download.

The series page's anchor (`metadataAnchor`, an ASIN or ISBN) and Search's
characters (`characterBooksToLoad`, the started books, identifiers or not) pick
their books by their own rules.

An answer that is only generated content goes stale after 2 minutes
(`META_GENERATED_ONLY_STALE_MS`), rather than the hour a community answer keeps.

`work.generated` drives the "Generated on this server" chip (`GeneratedChip`).
`GeneratedMark` heads a Characters panel and the Previously On card's recap, and
About wears the chip for `generated.description`. `communityCredit` drops the
CC BY-SA credit from a generated dimension.

The Recaps tab and Story so far mark their two parts apart (`recapMarks`). The
recap list goes by `generated.recaps`. The whole-book summary goes by
`generated.recap_summary`, falling back to `generated.recaps` when an older
server leaves it out. So a community summary kept beside a generated list keeps
its credit.

- When every part shown was generated, one chip heads the panel.
- When the parts differ, the generated one wears its own chip. The list's chip
  sits under its Story so far heading, and appears again in Story so far over the
  recaps that **Show anyway** reveals.
- The credit ends the panel whenever a community part shows.

`seriesRails(series, currentWorkId, picks)` builds one rail per family, showing
the picked reading order, and drops the current work from it. It drops a rail
only when **every** one of its orders is empty once the current work is removed,
so switching order can never make the tab vanish.

#### Reading-order families

The server collapses a primary series and its variant reading orders into one
rail (see [Reading-order families](../server/api/reference.md#reading-order-families)).
`BookMetaSeries` is the family's main view plus the additive `ordering`,
`ordering_of` and `orderings[]` (`BookMetaSeriesOrdering`). An older server sends
none of them, so every series is its own family with a single view, which is the
old behaviour, unchanged. The pure rules live in `src/lib/series-orderings.ts`
(unit-tested):

- `familyKey(series)` is `ordering_of || id`, the family's primary id.
- `seriesViews(series)` normalizes the main view and every alternate into one
  `SeriesView` shape. It sorts them into family order (primary first, then
  variants by id), so the toggle reads the same on every book of a family, even
  when the main view is a variant.
- `selectedView(series, picks)` returns the remembered pick for the family when
  it names one of its views, else the main view. An unknown or stale pick falls
  back.
- `viewHoldsWork(view, workId)` says whether the current book is part of that
  order. A view without it still lists its order, with a short "This book isn't
  part of this reading order." note.
- `orderingLabelKey(ordering)` labels the toggle segments **Publication**,
  **Chronological** or **Recommended** (`book.meta.ordering.*`). It falls back to
  the series' own name for an unset or unknown ordering. `familyName` keeps the
  rail heading on the primary's name, whichever order is shown.

A family with more than one view gets a compact scrollable `SegmentedControl`
above its rail (`src/components/ui/toggle-group.tsx`, a single-choice toggle group
labelled *Reading order*). The `useSeriesOrderings` store holds the pick (see
[Series orderings](#series-orderings-srcstoresseries-orderingsts)).
`BookMetaSeriesTab` reports it through `onSelectView(family, viewId)`, so the
screen owns the pick, not the tab.

Characters and recaps are the community expressive layer (`work.characters`,
`work.recaps` and `work.recap_summary`; the types `BookMetaCharacter`,
`BookMetaRecap` and `BookMetaRecapSummary`).

- Each character card shows name, role, aliases and "from chapter N" up front. A
  per-card accordion holds the own-words description. There is no blur; a tap
  reveals it.
- Each recap likewise opens only when tapped.
- The current book's `recap_summary` is a spoiler in both fields. `in_short` is
  the whole book in one paragraph, ending included. Once the book is finished,
  it renders as an **In short** intro above the story-so-far recaps, followed by
  the `ending` ("How it ends") accordion. Before that, `in_short` sits behind a
  collapsed, spoiler-chipped "Whole-book summary" row, and the `ending` is not
  offered at all.

All of these are absent from the envelope when the upstream has none, so a work
without them shows no such tab. The pure label helpers (`roleLabelKey`,
`revealFromStart`, `recapDescriptor`, `sortRecaps`, `summaryIsVisible`) are
unit-tested, and the strings live under `book.meta.*` in all locale catalogs.

#### Spoiler gating (`src/components/library/meta-gating.ts`)

Character and recap visibility is derived from **where the listener actually
is**, in a framework-free module of pure functions:

- `listeningProgressFor(input)` maps one whole-book position onto the chapter
  list (through `chapterNumberAt` over the cumulative chapter starts). The
  position is the live one while this book is loaded, else the saved one.
  `NO_PROGRESS` is the not-started value, and a finished book short-circuits
  everything to visible.
- `characterIsVisible(c, p)` hides a character whose `reveal.chapter` is past the
  listener.
- `recapIsVisible(r, p)` hides a recap whose `through.chapter` has not been
  *finished*, which means strictly less than the current chapter. A
  `chapter: 0` recap is always safe.
- `splitCharacters` and `splitRecaps` partition into `{ visible, hidden }`. The
  tabs render the hidden part as a footer row, "*N* hidden to avoid spoilers",
  with a **Show anyway** toggle. Each entry revealed anyway carries a small
  spoiler chip.

The saved-progress side comes from `useBookProgress(libraryId, path, cid?)`. It
reuses the existing `qk.progress(cid, lib, path)` key rather than introducing a
second progress cache. Its answer is the place Resume plays, which can be this
device's own newer record (see
[The place Resume plays](#the-place-resume-plays)).

A work's positions are numbered on its own scale. When the book splits finer than
the work's scale, `/meta` answers them
[on this book's chapters](../server/api/reference.md#positions-on-this-books-chapters).
The gate then compares like with like and has nothing to convert, and a label
such as "Up to chapter 9" names this book's chapter. Offline, a download keeps
the numbers the server sent.

Three cases get the work's own numbers: a book no finer than the scale, a work
stating no scale, and an older server. Those numbers only approximate a given
recording's edition, which is why the escape hatches are deliberate: the toggle,
and a finished book showing everything.

Two edge cases:

- A `reveal` past the book's last chapter is one no place reaches. It stays
  hidden until the book is finished. Once shown, it reads "Near the end" rather
  than naming a chapter the book lacks (`revealIsPastEnd`).
- `chapterNumberAt` reads starts that say nothing about a place (every chapter at
  offset 0) as chapter 0, not started, and never as the last chapter. It reads a
  run of identical starts at the end as the run's first chapter.

The **live** side is `src/components/player/use-listening-position.ts`:

- `useListeningPosition` serves the book page, at `LIVE_POSITION_BUCKET_S`
  (15 s), and the series page's Resume chapter, per minute.
- `useListeningChapter` serves the player's companion. It is the same rule at
  15 s, selected as a chapter number.
- `useLivePosition` serves Search's characters, floored by the saved place in
  Search's own model.

Each reads the player's position while the book is loaded, never below the saved
one, in buckets rounded down. Each reads it only once the book is **placed**
(`selectPlacedBookKey`). Right after `playBook` swaps a book in, the snapshot
still holds the previous book's place until the engine load lands (the store's
`loadingBook`). Reading that place as the new book's would reveal its cast by a
position the listener never reached. Previously on reads the saved place only.

`useBookCommunity` (`src/components/library/use-book-community.ts`) is the chain
that feeds the player-side gates: the `metadata` flag, the book, `/meta`, the
chapters and the corrected starts.

#### Catching up on previous books (`client.metaWork`)

Both the Recaps and Characters tabs end with a **Previous books** block: one
closed accordion row per earlier book of the series, most recent first.

`previousWorks(rails)` builds that list from the same rails that `seriesRails`
built. It takes every entry of each rail's **shown** order whose position sorts
before this work's position in that order, dedupes them by work id and sorts them
descending. It sits on top of `seriesPositionValue`, a `parseFloat` of the
position string, so "1-3.5" reads as 1 and an unparsable position is excluded.

The screen computes both in one memo, so the rail and the catch-up can never
follow different orders. Each family contributes from the order the reader picked
(else the main view), never the union of its orders. An order the current book is
not part of contributes nothing. That is the spoiler guard. In publication order,
The Lion, the Witch and the Wardrobe is book 1, and the chronological order must
not offer The Magician's Nephew as a "previous book" to a reader going in
publication order. A regression test pins this case. Different families still
union.

Opening a row fetches that work **lazily**:

- `client.metaWork(workId, signal)` calls `GET /meta/work?id=…` and unwraps
  `{ work }` to a `BookMetaWork`.
- `useMetaWork(workId, enabled)` keys on `qk.metaWork(cid, workId)` with the same
  1 h `staleTime` and `retry: false` tuning as `useBookMeta`. `enabled` stays
  false until the row is opened, so a series rail never fires N requests up
  front.
- The route is not library-scoped, because a work id addresses the metadata
  database, not this server's content. So no path rides with it.

What each row shows:

- Under Recaps, that book's `recap_summary.in_short`, plus a separately tapped,
  spoiler-chipped **How it ends** accordion. It falls back to
  `lastBookRecap(recaps)` (the furthest book-scope recap), and then to a quiet
  note plus an external metadata-site link.
- Under Characters, that book's character cards.

Any failure, such as an older server with no such route or a metadata service
that is down, renders the same quiet "couldn't load" plus the external link. So
the block degrades exactly like the rest of the section.

Three details make all of this safe to add to a screen everyone sees:

- **Capability-gated.** The metadata query fires only when the server advertises
  the `metadata` capability (`!!server.capabilities.metadata`). The flag is
  optional in `types.ts`, so an older server reads as absent, which is false. On
  a server without the feature nothing is fetched.
- **Progressive enhancement.** The meta-driven tabs contribute **nothing** while
  loading, on error, or on `{ matched: false }`. Because `bookTabs()` derives the
  row from the data it has, they don't appear in the tab row. The page is never
  worse for having them, and their absence is indistinguishable from a book the
  metadata service doesn't know. `chapters`, `bookmarks`, `history` and `notes`
  never depend on any of this.
- **Fetch tuned for a best-effort extra.** `useBookMeta` keys on
  `qk.bookMeta(cid, lib, path)` with a **1 h `staleTime`**. The server caches the
  composed envelope too, so re-fetching sooner buys nothing. It sets
  **`retry: false`**, so a 502 from a down metadata service resolves once and
  stops. It must not spin or block the rest of the screen.

`client.bookMeta(libraryId, path, signal, opts?)` calls `GET /libraries/{id}/meta`.
The optional `{ includePrevious, hideSpoilers }` add the `meta_bundle` params,
and `useBookMeta(..., opts)` passes them through. The book screen sends neither,
so it still gates spoilers on the device.

The `BookMeta` discriminated union (`{ matched: false } | { matched: true; work;
recording?; series?; web_url }`) in `types.ts` is hand-mirrored from the server's
envelope. `client.metaWork` reuses the same `BookMetaWork` type rather than
declaring a second one. The [mirroring rule](#typests---the-mirroring-rule)
applies, so a change to either shape is a two-repo change with tests on both
sides.

Every series-rail entry carries its own `web_url`. Tapping a series work or the
footer link opens the metadata site **externally**, in a real new tab on web or
an in-app browser tab on native. The client never constructs a metadata URL. UI
strings live under `book.meta.*` in the locale catalogs.

#### Community covers (`client.communityCoverUrl`)

The envelope's covers point at third-party hosts, which the web player's CSP
refuses (`img-src` takes only the server). Those covers are each series rail
entry's `cover_url` (the Series tab's tiles) and the Previous books rows.

A server with `meta_covers` serves them itself.
`client.communityCoverUrl(libraryId, path, coverUrl, { size })` builds
`GET /libraries/{id}/meta/cover?path=&url=&size=`, with `?token=` like every media
URL. The server serves only a `cover_url` that the envelope of that book hands
out, so the call takes the same `libraryId` and `path` that `useBookMeta` was
asked for.

`BookTabPanel` builds one resolver per book with
`useCommunityCover(useScopedCid(), libraryId, path)` and passes it to the Series,
Recaps and Characters tabs as `coverFor`. Every community cover is asked for at
one size, 320 (`COMMUNITY_COVER_SIZE` in `book-meta.tsx`). So the same cover is
fetched and cached once, on the server and on the device, whichever tab shows it
first. A tab without `coverFor` (`noCommunityCover`) shows placeholders: the
title on a rail tile, and the title's monogram on a previous book's row.

The rule is the pure `communityCoverSource` (`community-cover.ts`), unit-tested:

- **`meta_covers` on:** the proxied URL.
- **`meta_covers` off** (an older server, or metadata off): native loads the
  direct `cover_url`, as it always has, and the web player shows the
  placeholder.
- **`/server` unreachable:** counts as no flag, since a server that can't answer
  `/server` can't serve a cover either. Native loads a kept envelope's covers
  directly, and the web player shows placeholders.
- **`/server` not answered yet:** nothing loads, so a cover is never fetched
  twice (directly, then proxied).

### Home

Home (`src/components/home/`) aggregates every connection and keeps its rules
pure.

- The podcast "New episodes" rail (`use-new-episodes.ts` and
  `new-episodes-model.ts`) is in [Podcasts](podcasts.md#homes-new-episodes).
- `bookRowTest` keeps episodes off the book shelves below, by library kind. It
  also says which rows wait on a server's libraries, so Home holds a shelf's place
  with a skeleton meanwhile.

The models:

- `home-model.ts`:
  - `pickNowBook` returns the loaded book, else the most recently played book in
    progress.
  - `syncPill` shows "Saved on this device, will sync" for a save still in the
    offline queue, or when the server holding the newest progress is marked down.
    Otherwise it shows the newest `updated_at` any server holds. Another server
    being down says nothing about the place. The greeting's servers pill names
    that server, on a phone too, where the pill gets a row of its own under the
    date.
  - The progress list is read through `useWithLocalPlaces`
    (`src/playback/use-local-places.ts`, over `withLocalPlaces`), read again as the
    outbox changes, so a book this device played on since shows its newer place
    ([The place Resume plays](#the-place-resume-plays)). The Now card reads a loaded
    book on the player's own queue (its chapters and total, never its synthetic
    slices), so Home's percent is the player's after an offline run and after a
    server reorder.
  - `nextCandidates` is the Now book, other books in progress, then recently
    finished books, at most `NEXT_CANDIDATES` (6). Each takes one `/next` on the
    candidate's own server.
  - `nextInSeriesItems` gives an owned next book, else the community rail's next
    work as a ghost. Books already on Home are skipped, and a book that two
    candidates lead to shows once.
  - `smartShelves` builds Finish what you started; Short listens, which is
    recently added books in the Library's `len=short` bucket (`lengthBucket`,
    under five hours); the top narrator's shelf; and Added this week. Fewer than
    two shelves gives none.
  - Its links into the Library's Books mode are `libraryBooksHref` from
    `books-view.ts`.
- `listening.ts` computes the streak, the seven day bars and the pace behind the
  finish date, all in **server time**. A stats response's days are dates in the
  server's zone, and "today" is its `to` moved by `utc_offset`, never the device
  clock. There is no pace from fewer than three listening days or under an hour
  in all.
- `now-card-model.ts` computes the whole-book scale (one tick per chapter, merged
  past 120 chapters), bookmark pins, chapter place and percent heard (100 only
  once finished). The time left comes from `src/playback/time-left.ts`, at the
  book's own speed (see [Player UI](player-ui.md#time-left-time-leftts)). Chapter
  starts come from the file durations (`chapterStartsOf`), as on the book page.

### Search and the spoiler model

`useSearch(query, { limit, refetchProgress })`
(`src/components/search/use-search.ts`) is shared by the Search screen and the
palette. Each group carries its own `GroupState` (`supported`, `isLoading`,
`isError`, `retry`), so a failing group never hides the others.

- **Books**: `useSearchAll` across the connections of the person listening,
  de-duplicated (`src/lib/dedup.ts`), with "Also on" for the other servers.
- **Series and people** (`usePeopleSources`): every library's `seriesList`,
  `authors` and `narrators` lists on every `browse_people` server. They share the
  Library's `qk.*` cache and its 5-minute `staleTime`. `matchNamed` in
  `search-model.ts` matches them **on the device**. Names are folded (case and
  accents) and ranked starts-with first, then word-start, then contains. One hit
  per folded name opens the first copy in connection order, and the rest are kept
  as `also`.
- **Characters** (`useCharacterSources`): the community characters of the
  listener's started books. Those are books in progress or finished, newest
  first, on `metadata` servers, at most `MAX_CHARACTER_BOOKS` (8)
  (`characterBooksToLoad`).
  - The plain `/meta` envelope is fetched and gated **on the device**. Chapters
    are fetched only for unfinished books that have characters.
  - `listeningIn` places the listener with the book page's rule
    (`meta-gating`'s `listeningProgressFor` over `chapterStartsOf`). It uses the
    saved position, or the live one when the book is loaded and further on. The
    live one is sampled every 15 s, so a reveal is only ever late.
  - Until the chapters arrive, the listener is placed "from the start". A late
    chapter list can reveal more, never less.

`matchCharacters` is where spoiler safety lives.

- A character matches by name or alias.
- A character the listener hasn't reached (`characterIsVisible` false) goes into
  an `unmet` set and is **only counted**, never named, also not through an alias.
- An alias-only match ranks after every name match.
- A name met in any book shows once (the entry of the most recently played book).
  It is not counted again for another book that hasn't reached it.

The counted remainder is the `hidden` number behind "2 more matches after your
place in the book". The result carries the CC BY-SA `attributions` of the books
its hits come from, rendered beside the group.

### Podcasts

Podcast reads (`usePodcastShows`, `usePodcastEpisodes`, `myPodcastsQuery`,
`latestEpisodesQuery`) are core, and are asked only for a library whose `kind` is
`podcasts`. Follow and Unfollow are `useCapabilityMutation('podcasts', ...)`.
`usePodcastFetchStatus` is a `podcast_fetch` capability query. The episode-fetch
controller seeds it and is the only one to poll it. Keys and shapes are in
[Bridge podcasts](../bridge/podcasts.md#player-phase-2d-1); the screens and the
controller are in [Podcasts](podcasts.md).

### Upcoming releases

Upcoming releases are the listener's preorders, recent releases and missing
volumes in the series they hold, merged across their servers. The wire format is
the server's: [`GET /me/upcoming`](../server/api/reference.md#upcoming-releases),
[the calendar feed](../server/api/reference.md#the-calendar-feed) and
[`/me/upcoming/cover`](../server/api/reference.md#get-apiv1meupcomingcover). User
guide: [Upcoming releases](/users/listening/upcoming).

- **Wire and reads.** `types.ts` mirrors the envelope as `UpcomingResponse {status,
  generated_at?, window_days, items}` (`UpcomingItem`, `UpcomingKind`; `items` is
  never null). It adds `upcoming?: boolean` to `Capabilities` and the additive
  `release_date?` to `BookMetaSeriesWork`. `client.upcoming()` is
  `GET /me/upcoming`, keyed `qk.upcoming(cid)` with a 15-minute `staleTime`,
  since the server's job runs daily.
- **`useUpcomingAll()`** (`hooks.ts`) is `useApis()` with `useQueries` and
  `combine`: one query per connection, in `useApis()` order. A connection is
  asked only when its server advertises `upcoming` **and** its user is not a kid
  (`isKidAccount`; the route answers a kid with `403 kid_account`). Every other
  connection gets `skipToken`, so it is never asked, not even by a manual
  `refetch`. The hook returns:
  - `items`;
  - `available`: true once a server offers it, false once none can, and
    `undefined` while a server's flags load. `useUpcomingAvailable` reads only
    this;
  - `isLoading`;
  - `statuses`: each answered server's `ok`, `pending` or `stale`;
  - `failed`: the servers that didn't answer, including one whose `/server` flags
    couldn't be read, so a cold link settles instead of loading forever;
  - `retry`: refetches each errored server and reads the unreadable servers'
    flags again. A request paused for the network is not asked again; it resumes
    when the network returns.
- **The pure rules** (`src/lib/upcoming.ts`, tested apart):
  - `upcomingEligibility` decides who may be asked, and `available`.
  - `mergeUpcoming` tags each item with its connection and keeps the **first**
    connection's row of a `work.id`. Then `compareUpcoming` orders the items: the
    server's order across servers, preorders soonest first, releases newest
    first, then missing by series name and numeric position.
  - `upcomingSectionOf`, and `isNewUpcoming` for the "New" badge: `kind` is
    `preorder` or `released`, and `first_seen_at` is within seven days. `missing`
    never qualifies.
- **Dates.** A date's own rules are `parseReleaseDate` and `releaseIsFuture` in
  `src/lib/release-date.ts`. A date is compared at its own precision against the
  UTC day, so "2026" or "2026-10" is ahead only while the whole period is.
  - `formatReleaseDate` (`src/lib/format.ts`) prints "2027", "Nov 2026" or
    "Nov 12, 2026". It reads the date in UTC and writes it in the app's UI
    language (`getLocale()`, a bare code such as `en`), so English always reads
    "Nov 12, 2026" and German "12. Nov. 2026". Other text is shown as it came.
  - `upcomingDateLabel` labels the date by kind: "Out", "Released" or "First
    released" (the metadata's one date is a work's **first** release). There is
    no line without a date.
- **Surfaces** (`src/components/upcoming/`):
  - `UpcomingRail` sits on Home, after Next in your series (`HomeSection` and
    `ShelfRow`, at most `UPCOMING_RAIL_LIMIT` (12), with See all opening
    `upcomingHref()`). It renders nothing while loading, while empty, or where no
    server offers it, so Home never holds a skeleton for a rail that may never
    show.
  - `UpcomingContent` (`upcoming-screen.tsx`) is the body of the `/upcoming` page
    and of the You hub's Upcoming section. Its sections are Coming soon, Just
    released and Missing from your series; an empty section is hidden. Under the
    list, while `available`, comes the [calendar card](#the-upcoming-calendar).
  - Its states: rows stand in while loading; "First full check pending" while
    every answering server is `pending` and there are no items; "Nothing coming
    up"; "No upcoming releases here" where no server offers it; and "Couldn't
    load" with Retry when no server answered. A failure never shows "Nothing
    coming up".
  - A failed server beside answering ones, a `stale` one or a `pending` one is a
    note over the list. A `pending` status means the first full check has not
    completed. Light-pass rows can already be present, and they stay visible
    under that note.
  - Each item's source reads "Not on &lt;server&gt;", using the supplied server
    label or its `connectionName`. This means absence on the source server; there
    is no cross-server ownership check. A tap opens
    `seriesHref(connectionId, local.library_id, { name: local.series, work: work.id })`.
- **Covers** (`upcoming-cover.tsx`). Every item is an `UpcomingCover`: a
  `GhostCover` with the work's real cover drawn over it. The cover is drawn only
  when the item's **own** connection (the one whose row won the merge) advertises
  `upcoming_covers === true` (never while unknown) and the item has a
  `cover_url`.
  - The image is `client.upcomingCoverUrl(work.id, { size, version })`, which is
    `GET /me/upcoming/cover?work=&size=&v=` with the media token. It is never the
    `cover_url` itself. The device never contacts the cover's host, and the web
    player's CSP refuses another host.
  - `size` is `coverSizeFor` the tile. `v` is `fnv1a(cover_url)`, purely a cache
    buster. The server caches the image for a day, and its job can change a
    work's `cover_url` in place.
  - The ghost stays underneath. It shows while the image loads, and alone without
    the flag or once the image fails. `failed` is keyed by the URI, so a recycled
    tile starts afresh.
- **Series pages.** `railEntries` (`series-model.ts`) gives a ghost its
  `release_date`. While the date is still ahead, it is an `outDate`, and the
  list's `entryLine` and the face-out note show "Out Nov 12, 2026" in place of
  "Not in your library". Otherwise the ghost shows its year.
- **Kids and demo.** A kid gets no rail, You section, cover or calendar row, and
  the route shows the "not here" state. A demo account reads the list like anyone
  else. Its calendar row explains that it can't subscribe, and asks nothing.

#### The upcoming calendar

The card is `UpcomingCalendarCard` (`src/components/upcoming/upcoming-calendar.tsx`).
The pure rules and the device copy are in `src/lib/upcoming-calendar.ts`. User
guide: [Add to your calendar](/users/listening/upcoming#add-to-your-calendar).

- **Wire.** `types.ts` mirrors `UpcomingCalendarStatus {active, created_at?}` and
  `UpcomingCalendarLink {path, created_at}`, and adds `upcoming_calendar?` and
  `upcoming_covers?` to `Capabilities`.
  - `client.upcomingCalendar()` is `GET /me/upcoming/calendar`.
  - `mintUpcomingCalendar()` is the `POST` (201). It replaces the previous link.
    It is refused with `403 kid_account` or `demo_account`, and to an API key.
  - `deleteUpcomingCalendar()` is the `DELETE` (204).
- **The full URL.** `path` is server-relative. `calendarFeedUrl(path, addresses,
  baseUrl)` puts it on the server's away address when it has one, since a
  calendar app may fetch from anywhere. Otherwise it uses the address in use.
- **The device's copy is a credential.** The server answers the secret once. This
  device keeps `{url, created_at}` per connection in the **secure store**
  (`calendarLinkKey`: the keychain or keystore, localStorage on the web, like the
  session token). It never goes in AsyncStorage or the startup query cache. Its
  query (`qk.upcomingCalendarLink`) reads the secure store and is not a startup
  query. It is `meta.local`, so its success says nothing about the server. It
  clears no reconnect flag and asks for no reachability check. The copy is:
  - forgotten with the connection, by `removeConnection`, a retired stale
    identity, and the auth reset in `src/stores/session.ts`. So it goes on
    sign-out even if Upcoming never mounted. A mint that lands after its
    connection signed out is forgotten, not kept;
  - moved by the identity migration (`moveCalendarLink`);
  - forgotten on Turn off;
  - replaced on Reset. The mutation stores it before it resolves.
- **Rows and states.** `calendarConnections` gives one row per connection that has
  the flag on and is not a kid's. A kid is never asked. A demo account's row
  explains and asks nothing. Rows are named by server when there are several.
  `calendarRowState` gives:
  - `loading`;
  - `error`, with Retry;
  - `none`, with Get calendar link;
  - `shown`: the URL, Copy link everywhere, and Subscribe where
    `canSubscribeWebcal` (the iOS app, and a browser on an Apple device, which
    `openWebcal` hands a `webcal://` URL). Reset link and Turn off each sit behind
    a `ConfirmDialog`;
  - `elsewhere`: a link is active, but this device has no copy ("Reset it to see
    it here").
- **Staleness.** A copy whose `created_at` is not the server's (compared as
  instants), or a copy of an inactive link, is stale and forgotten. This never
  happens while the row's own mint or delete is pending.
  - A write sets the copy and the status in one step, after cancelling any read
    of either that is in flight. Otherwise an answer sent before the write would
    land over it, and the row would forget the new copy.
  - A write that got no answer (the network, not a refusal) reads the status
    again, since it may have landed.
  - A failed change shows the player's own words by `code` (`kid_account`,
    `demo_account`, else "refused" or "couldn't reach"), never the server's
    English.

## Zustand stores

### Session (`src/stores/session.ts`)

The session store holds several connections. A `Connection` is
`{ id, serverId?, serverUrl, name, token, user, needsReconnect?, addresses? }`:
**one user signed in to one server**.

- `id` is the connection id, `<server_id>.<user_id>` (see
  [Connection identity](#connection-identity-server_iduser_id)). It keys every
  per-connection store.
- `serverId` is the server's `server_id`, read through `serverIdOf(conn)`.
- `serverUrl` is the address the listener paired with or typed. It is never
  rewritten.
- `addresses` holds the server's home and away addresses (capability
  `addresses`). Which one requests go to right now is an in-memory pick, never
  stored (see
  [Connect and home/away addresses](connect-and-addresses.md#home-and-away-addresses)).

#### Persistence and hydrate

Connection **metadata** persists to AsyncStorage (`audiosilo.connections` and
`audiosilo.activeConnection`, the default connection's id under its legacy name).
Each connection's **token** lives in secure-store under `audiosilo.token.<id>`.
Tokens are stripped before the metadata is persisted.

`hydrate()` restores the connections whose token is still there, and fills
`serverId` on a connection persisted before that field existed. It runs after
[the launch reset](#the-launch-reset), so it never reads wrongly-keyed records.

#### Proxy headers

A connection to a server behind a sign-in proxy (Cloudflare Access, Authentik,
Authelia) can carry custom headers, `Connection.proxyHeaders` (`{ origin,
headers }`). The rules are in `src/lib/proxy-headers.ts` and the storage in
`src/lib/proxy-headers-store.ts`. They are credentials, kept like the token:

- **Storage.** They live in memory and in secure-store under
  `audiosilo.proxy-headers.<id>` (see [Storage layers](#storage-layers)). `persist`
  strips them and keeps only the non-secret `hasProxyHeaders` marker, and
  `hydrate` reads them beside the token for a marked connection only. They never
  reach AsyncStorage, the query cache, a URL or a log line.
- **Lifetime.** They go wherever the token goes: sign-out, a retired identity,
  the auth reset, a connection `hydrate` drops. The identity migration copies them
  in its token step (`copyProxyHeaders`). `removeConnection` deletes the token
  first, so a failed delete stops the removal with the headers still kept. A new
  connection to a server another connection here reaches with headers takes a
  copy of that set under its own id.
- **One https origin.** A set names the origin (scheme, host and port) it was
  entered for. `proxyHeaderRecord` is the one rule: a request to that origin
  carries the set, and any other URL gets none: a plain-http URL, another port,
  or the home address unless the set was entered for it (an https home address
  is one of the Account card's choices). A set for an http origin is refused at entry and dropped
  at load (`cleanProxyHeaders`). Reserved names (`Authorization`, `Cookie`,
  `Host`, `Range`, `Content-Type`, `Content-Length`, `Connection`,
  `Transfer-Encoding`, `X-AudioSilo-Client`) and values with control characters
  are refused the same way.
- **Web.** Only a request same-origin with the page carries them. The server's
  CORS lists a fixed set of request headers, so a custom one cross-origin would
  fail its preflight. `<img>` and `<audio>` can't carry them and rely on the
  proxy's browser sign-in.
- **Redirects** are the platform HTTP stack's to follow. On Android (checked
  2026-11-14 on a Pixel 6a, a GET 302 from https to another https host) every
  stack (okhttp fetch and downloads, expo-image, Media3) sends the custom headers
  on to the new origin and drops `Authorization`; iOS is unchecked. The origin rule
  covers only the first request (follow-up fe#295). The UI says "sent with requests
  to &lt;origin&gt;" and never claims more (`src/i18n/locales.test.ts` refuses
  "nowhere else", "go only" and "https only" in every locale).
- **Not carried:** Chromecast (`castBlockReason` `proxy`), the watch apps (the
  pair message is unchanged) and calendar apps (the `releases.ics` link).

The connect flow and the Account card that edit them are in
[Connect and home/away addresses](connect-and-addresses.md#proxy-headers-on-the-connect-screen)
and [You and settings](you-and-settings.md#account-srccomponentsaccount).

#### Signing in: `setSession`

`setSession({ serverId, user, ... })` refuses an empty `server_id`. Then it adds
or updates **by server and user**.

- The prior connection is the one with `serverIdOf(c) === serverId` and the same
  `user.id`. A legacy connection saved without a usable user id counts as this
  user, since it was the server's one connection.
- So re-pairing the same account at another URL updates its connection instead of
  adding one, while **another user on the same server is another connection**.
- A prior connection keeps its id. A legacy id stays until the key migration
  moves it, so its downloads and saves stay reachable. A new connection gets
  `connectionIdOf(serverId, user.id)`. `setSession` returns the id it used.

`setSession` also:

- merges the addresses it is given with what the device knew (`mergeAddresses`):
  the prior connection's, else another user's connection to the same server, else
  the remembered server's;
- makes the connection the default, unless the caller passes
  `{ makeDefault: false }`, as `addMemberHere` does for a household member signed
  in beside the owner. The connection still becomes the default when there is
  none, or when the current default is no longer signed in;
- remembers the server durably, without its token (`src/lib/known-servers.ts`,
  the connect screen's Reconnect rows, keyed by `server_id` with no user).

**Stale identities.** A connection at the same URL **whose `server_id` differs**
(`staleIdentities`) is a dead identity, because a rebuilt server mints a new
`server_id` at the same address. Only the stale identities named in `retire` go,
with their token and scoped state.

- `finishConnect` names the **re-pairing person's own** (`staleToRetire`). Those
  are the stale identities of the profile holding the reconnect banner's
  connection, else of the person listening. For **Add someone** it names nobody's.
- The new connection takes the retired one's place in that person's profile
  (`onConnectionReplaced`).
- Every other stale identity is another person's. It stays, flagged
  `needsReconnect: 'server-reset'`, for them to sign in again. Dropping it would
  delete their profile, PIN and kids settings.
- A different user is never a reason to drop one.

`learnAddresses` merges a `GET /addresses` answer into a connection's addresses
(`mergeAddresses`, so a known `home` survives). The address runner calls it.

#### Removing a connection

`removeConnection`, and `logout`, which removes the active one, delete the
connection's token **and purge its scoped state**: downloads, the progress mirror
and offline queue, cached queries, and scroll memory. They do this by running an
`onConnectionRemoved` cleanup registry that those owners subscribe to. The owners
can't be imported directly here, because they import the session store and a
direct import would cycle. A failing cleanup is logged and never blocks removal.

`status` is `loading | unauthenticated | authenticated`, and the `(app)` layout
guard redirects on it. `user` mirrors the user of the default connection
(`defaultConnectionId`), for ergonomic selectors.

#### When hydrate can't read the tokens

**A hydrate that can't read the tokens** leaves `sessionHydrateFailed()` true.
The persisted connections are not in memory, so nothing may act on the empty list
as if it were real:

- `sessionReady()` stays false, so the offline queue's replay keeps every save
  instead of dropping them as unroutable.
- Car bookmarks waiting to be sent are kept.
- The car snapshot isn't rewritten as signed out.
- A sign-in hydrates first, so it keeps the stored servers. Only when that read
  fails again does it write a list holding just its own server and stop
  retrying.

How the store retries depends on the failure:

- **A locked keychain on iOS.** A failure that is only the locked keychain
  (`isLockedKeychainError`, "interaction is not allowed") keeps `status` on
  `loading`, so screens wait on their spinner, never the connect screen. The store
  retries every `LOCKED_RETRY_MS` (5 s) and when the app comes to the front. This
  happens on a CarPlay launch with the phone locked, before the token moved to its
  after-first-unlock item (see
  [Native integrations](native-integrations.md#tokens-on-a-locked-phone-srclibsecure-storets)).
- **Any other failure** is surfaced as `unauthenticated`, never stuck on
  `loading`, and retried on the next foreground.

### Connection identity: `<server_id>.<user_id>`

A connection is one user on one server, so its id is
`connectionIdOf(serverId, userId)` = `<server_id>.<user_id>`
(`src/lib/connection-id.ts`). Two people signed in to the same server on one
device are two connections, each with its own token, downloads, progress and
query cache.

The server's `server_id` is base64url (`[A-Za-z0-9_-]`, never `.`) and `user.id`
is a positive integer, so the `.` is an unambiguous separator. The id stays inside
expo-secure-store's key alphabet (`audiosilo.token.<id>`, `[\w.-]`), and is also a
valid file name and URL path segment. It never holds `:`, `/`, `%`, `#` or `?`.
`contentKey` joins on `:` and is unchanged:
`${connectionId}:${libraryId}:${path}`.

Older app versions used the bare `server_id` as the id. That is a **legacy** id
(`isLegacyConnectionId`). A legacy connection keeps working everywhere, forever.
One that the migration can't move (no usable `user.id`), or hasn't moved yet (a
locked keychain), keeps its id. So:

- **Compare servers only through `serverIdOf(conn)`** (its `serverId`, else what
  the id says), never `conn.id`. This applies to the server-reset check (a
  `/server` answer whose `server_id` differs, `serverResetCid`), the home-address
  probe and pick, the connect flow's repair and Reconnect rows, and
  `learnAddresses` (which remembers addresses under the server's id).
- `parseConnectionId(id)` gives `{ serverId, userId? }`, and `usableUserId(user)`
  gives the user id an id can carry. Never split an id by hand.

#### The key migration

**The one-time key migration** (`migrateConnectionIdentity`,
`src/lib/identity-migration.ts`) moves every legacy connection to its new id
without signing anyone out. `migrateStorage()` runs it after `resetStaleStorage`,
and before any store hydrates or any lazy reader runs.

- Until the plan is stored, a crash, a locked keychain or a failed write leaves
  the legacy data usable, and the run waits for the next launch.
- Once the plan is stored, the run only goes **forward**. `migrateStorage()` runs
  it up to `RECOVERY_ATTEMPTS` (5) times in all, a second apart, with every reader
  held, so no store ever sees half-moved documents.
- When it still fails, it gives up for this launch and sets
  `identityMovePending()`. The downloads store and the offline queue's replay then
  keep what names an id that no connection has yet, instead of pruning it as
  gone. A later launch finishes the plan.

The steps:

1. **Read and plan** `{ legacyId: newId }` for each legacy connection with a
   usable `user.id` whose new id no other connection already has. The plan that a
   run cut short left (`audiosilo.identityPlan`) is added. Nothing moves while the
   Android playback service holds a book of a connection being moved, since its
   tracks are files under the old download folder. When the service doesn't
   answer within 3 s, the run waits for a later launch.
2. **Tokens first.** Copy each `audiosilo.token.<old>` to `audiosilo.token.<new>`
   and read it back. Any failure, a locked keychain included (a CarPlay launch
   with the phone locked), aborts with nothing else changed. Old tokens are never
   deleted here, and a copy is never undone.
3. **Record the plan, then move the files.** Native moves `downloads/<old>` to
   `downloads/<new>` (`engine.native`'s `moveConnection`). Moves are idempotent
   and **never reversed**, because a retry can't tell which moves an earlier
   process made, and the documents may already name the new ids. A failure keeps
   the plan, and the next try goes on from there. The web moves **no** files.
   `engine.web` has no `moveConnection` and keeps a moved connection's Cache API
   entries under the legacy id (`/_offline/<legacyId>/`). The registry's new ids
   reach them through the aliases (`legacyIdOf`).
4. **Rewrite every document naming a connection id in one `setMany`.** These are
   the connections (new `id`, `serverId` added), the default connection, the
   downloads registry (keys and each `connectionId`), the progress mirror (keys
   and values) and queue, `offlineServers`, the car bookmarks waiting to be sent,
   the library selection, Smart speed's time saved, the drift-offs, the aliases
   and the first profiles document. A failed write (iOS and the web write key by
   key) keeps the plan, and the next try finishes it.
   `audiosilo.carSnapshotWritten` is removed, so the next car snapshot is built
   fresh, even offline.
5. **Mark it done**: `audiosilo.identityVersion` = `2`.
6. **Delete the old tokens, then the plan**, best effort. A plan still stored (the
   app was killed first, or its removal failed) is replayed by a later launch,
   which deletes the old tokens again. A token delete that fails while the plan's
   removal succeeds is not retried, so that old copy stays in the secure store.

Every rewrite maps ids through the stored plan, so it is idempotent. A run cut
short mid-write (`setMany` is not atomic on iOS or the web) is finished by the
next one with the same plan. A legacy list written back after the mark (a web tab
still running the old code) is moved by the next launch the same way. A new
document keyed by a connection id must be added to `ID_DOCUMENTS`, or it is left
behind. In-memory state (scroll memory, the React Query cache) needs no
migration.

The same `setMany` writes the **first profiles document** (`audiosilo.profiles`).
[Profiles](profiles.md#the-store-srcstoresprofilests) describes how it groups the
connections.

**Aliases.** The migration records `{ [old]: new }` under
`audiosilo.connectionAliases`. Every launch loads them into memory with the
migration's own first read (`migrateConnectionIdentity`, together with the landed
moves of a run cut short). `bootstrapPlayback` reads them itself
(`loadConnectionAliases`) only when that read failed.

`resolveConnectionId(id)` maps an old id to its new one (else returns it) at
every entry point that JS can't rewrite first:

- a route's `?connection=` (`connectionParam`: web history, widget and Live
  Activity deep links);
- a car item id from an old snapshot (`parseCarItemId`);
- the book the Android service loaded (`getLoadedBook`, `adoptLoaded`);
- bookmarks the service queued (`onRemoteBookmark`, `consumePendingBookmarks`);
- the iOS widget's last props;
- `resolveClient`, as a safety net.

**Why `AUTH_STORAGE_VERSION` is never bumped for it.** Bumping the auth axis
wipes every connection and token, which signs everyone out (see
[the launch reset](#the-launch-reset)). That was right for v2, when the old ids
could not be re-keyed. The bare `server_id` ids can be re-keyed, so the migration
re-keys them instead and nobody re-pairs. Bump the auth axis only for an identity
change that genuinely can't be migrated.

### Settings (`src/stores/settings.ts`)

Playback tunables persist as one JSON blob (`audiosilo.settings`), with these
defaults: `skipForward` (30), `skipBackward` (15), `defaultRate` (1),
`autoRewindMax` (5 s), `virtualChapterInterval` (30 min), and the audio effects
`smartSpeed` and `voiceBoost` (off; see
[Smart speed and Voice boost](audio-effects.md#the-settings-and-the-ui)). The
playback layer subscribes and re-`configure`s the engine whenever these change.

The same document holds the end-of-book and download behaviour, and the auto
sleep timer's settings:

- `autoPlayNext` (off).
- `autoDownloadNext` (`never | wifi | always`). `defaultAutoDownload()` is `wifi`
  on native and `never` on web (see
  [Auto-download on play](end-of-book.md#auto-download-on-play)).
- `keepAhead` (`0 | 1 | 2 | 3`, default `0`, which is off). `toKeepAhead` reads a
  stored value that isn't one of these as off (see
  [Offline](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts)).
- `autoDeleteFinished` (on).

The stored document carries a schema `version` (`SETTINGS_VERSION`). A document
without one is version 0. Every save writes the version, and hydrate drops it
from the store state. `migrateSettings` runs in the document's parse step and
brings an older document up to date. Today its one rule is version 1's: on web
only, a stored `'wifi'` `autoDownloadNext` becomes `'never'` unless
`toKeepAhead(keepAhead)` is above 0. It re-runs on each load, with the same
answer, until the next save writes the current version. A new settings change
that must move stored values bumps `SETTINGS_VERSION` and adds its rule there.

### Series orderings (`src/stores/series-orderings.ts`)

`useSeriesOrderings` holds `picks`, which map a family key to the id of the
reading order the reader chose. It persists as one JSON document
(`audiosilo.seriesOrderings`, validated by `parsePicks`). `bootstrapPlayback`
hydrates it once at boot (`src/lib/bootstrap.ts`, which the root layout and the
car's headless task run).

It is a **device** preference, not per-server state. Family keys are
community-metadata series ids, the same on every server. So it is deliberately
not one of the session's scoped storage keys, and neither storage-reset axis
wipes it.

### Persisted documents (`persistedDocument`)

Settings and series orderings share one hydration rule, `persistedDocument(key,
parse)` in `src/lib/storage.ts`. A change made before hydration finishes (a fast
tap on a cold start) is remembered and laid over the stored values when they
load, so it wins as the newer statement of what the user wants. It never clobbers
the stored values it did not touch, because nothing is written until hydration
has merged them. `parse` validates whatever is stored, so a corrupt or foreign
value never reaches the store.

### Search (`src/stores/search.ts`)

The search screen's `query` string is held in a store, so it survives the screen
remounting. The store also holds a `focusRequest` counter. On a native tablet, the
top bar's search field calls `requestFocus()` and jumps to the Search tab. The
screen keys its input on the counter, so a fresh mount with `autoFocus` takes the
focus even when the tab was already open. On web that field opens the command
palette instead. The palette's open state and query are `usePalette` in
`src/components/shell/palette-store.ts` (see
[the shell](shell.md#command-palette-web)).

The shell (`useShellEffects`) clears the query when you leave the Search tab.
Within the tab it is kept, so opening a result and coming back shows the same
results. The query is not persisted.

The same module holds **`useRecentSearches`**: ONE recent list for the Search
screen and the palette. It is newest first, at most `MAX_RECENT` (5), and
de-duplicated ignoring case by `addRecent`. It persists per device, not per
server, because the searches are the listener's words. The key is
`audiosilo.paletteRecent` (it predates the sharing). `hydrate()` is lazy
(whichever opens first), and replays searches remembered before the read finished
on top of the stored list.

### Library selection (`src/stores/library-selection.ts`)

`useLibrarySelection` is the library that the Library tab's single-library modes
show: `{ connectionId, libraryId }`, or null. It is a `persistedDocument` under
`audiosilo.librarySelection`, hydrated at boot by `bootstrapPlayback`. An
`onConnectionRemoved` handler drops a removed connection's pick. It is not a
scoped storage key, because a stale pick is harmless.

Read it through `useSelectedLibrary()`
(`src/components/library/use-selected-library.ts`). It runs the pure
`resolveLibrary(stored, groups, shown)` against every connection's library list
(sharing `qk.libraries`). The Library never shows another server's library in
place of the one it should show, so the answer is `{ selection, waitingOn }`,
picked in this order:

1. the stored pick, while its server's list still has it, or while that list is
   unread. Loading, failed, offline and signed out all keep it;
2. else the library the modes last showed (`shown`, in memory only), while it
   stands. A list that loads late then moves nothing under the listener;
3. else, when the pick is gone from a server that answered, that server's first
   library;
4. else the first connection, in the listener's order, skipping only a server
   that answered with no libraries. When that connection's list is in, its first
   library is the selection. While its list is loading or failed, there is no
   selection and `waitingOn` names the connection.

`useSelectedLibrary().server` is the group of the selected library's server, or
of the `waitingOn` server. The Library screen shows that server's state
(`library-screen.tsx`):

- the mode body once a library is shown. A stored pick whose list is only
  loading mounts its mode at once;
- a skeleton while the list loads;
- `SignInAgainState` for a signed-out refusal;
- the offline state, or `LoadError` with Retry (`retryServer`), by
  [`offlineState`](#offline-states-srcliboffline-statets). Each names the server
  when there are several.

`LibraryPicker` offers every server's libraries whatever is shown, which is the
way out of a server that does not answer. With several servers, each label names
its server ("Books · Home"). With nothing else to choose it is a plain label
(`library-picker-label`), so the shelf still says whose it is. It is hidden with
one library on one server.

**The car** has no picker and no state to show for a server, so it never waits on
one (`resolveCarLibrary`). Where `resolveLibrary` would wait (no pick, or a pick
whose server answered that it shares nothing), the car lists the first server
whose list is read and has a library. The car remembers nothing, so it goes back
to the first server once that server answers. Like the Library, the car never
replaces a pick whose server has not answered, or still has a library, with
another server's library.

### Other device preferences

These `persistedDocument` stores are deliberately not per server:

- `useBooksLayout` (`audiosilo.booksLayout`): grid or list for book lists,
  hydrated on first use.
- `useUpNext` (`audiosilo.upNext`): the desktop drawer's open state and width.

The keep-ahead count is not one of these. It is `keepAhead` in the
[settings](#settings-srcstoressettingsts).

### Player and downloads stores

`usePlayer` (`src/playback/store.ts`) exposes `nowPlaying` (the book's identity
and the built queue), the engine `snapshot`, `rate`, the actions (`playBook`,
`toggle`, `pause`, `retry`, `seekBook`, `seekInTrack`, `goToTrack`,
`skipSeconds`, `setRate`, `stop`) and selectors (`selectBookPosition`,
`selectCurrentChapter`, `selectIsPlaying`). [Playback](playback.md) documents
everything behind that surface: the timeline math, the stall watchdog and resume
protection. [Offline](offline.md) covers `useDownloads` (`src/downloads/store.ts`).
Both follow the same shape: a Zustand store for reactive state, and module-level
variables for orchestration that must not trigger renders.

### Off screen, a tick is not redrawn

The player store's snapshot moves about once a second while a book plays. A
mounted screen stays mounted with the phone locked or the tab hidden, so a full
player left open redrew its seek bar, times and chapter list every second for
nobody.

So the hooks `usePlayer(selector)` and `useSleepTimer(selector)` read what is
**shown**, not the live state (`quietOffScreen` in `src/lib/visible-store.ts`):

- **In front**, the two are the same object.
- **Off screen**, a change that is only a tick is not shown: no listener runs, no
  selector runs, nothing renders. Off screen is `isOffScreen` in
  `src/lib/app-activity.ts`: `AppState` is `background`, which on the web is a
  hidden tab.
- **iOS's `inactive` is not off screen.** The app is still seen behind the app
  switcher, Control Centre or a system alert.
- **Coming back** shows the live state at once.

A tick is one field moving and nothing else:

| Store | The ticking field | A tick is |
|---|---|---|
| `usePlayer` | `snapshot` | the same `state`, `trackIndex` and `rate`: the place and the file's length moved, a seek included |
| `useSleepTimer` | `remaining` | any change of it |

Every other change is shown at once and whole, the held field with it: a play, a
pause, the end, the next file, another speed, another book, a load, an error, the
timer's phase. So a component can still act in the background on what the hook
gives it. `BookEndedListener` starts the next book, `useShakeToExtend` arms from
the timer's phase, and a hidden tab's title follows play and pause.

`getState()`, `setState()` and `subscribe()` on both stores are live as ever:

- The store's own logic reads them: the saves, the spans, the tab rules.
- So do the car, the widgets, the Live Activity, Cast, the reader's narration, the
  reveal toast and the sleep timer's tickers.
- The lock screen, Now Playing, the web Media Session, Android Auto's session and
  the watch are fed by the native engine or `service.web.ts`, never by a render.

**The rule this leaves.** Nothing that must happen in the background may depend on
a component re-rendering for the place, the current chapter or the countdown's
seconds. Read `getState()` or subscribe. A selector that derives from the place
(`selectBookPosition`, `selectCurrentChapter`, `selectLivePosition`) is for
drawing.

A new store that ticks while a book plays gets its hook from `quietOffScreen` too,
naming its ticking field. In a test, `driveAppState()` (`src/testing/app-state.ts`)
sets the app's state. React Native's jest `AppState` is otherwise never
`background`, so every other suite sees the hook show everything.

**Known limit.** Android reports `background` while the activity is paused but
still visible, behind a permission dialog or a share sheet. The seek bar holds
still behind it until the app is in front again.


## Progress sync (`src/playback/progress-sync.ts`)

The offline-safe write path for listening progress:

- **Last-write-wins.** Every save carries `version: 0`, a per-install
  `device_id` (generated once, cached under `audiosilo.deviceId`), and an
  `updated_at` captured **at save time**. So replays that land late still
  reconcile correctly by timestamp. The server's `SaveProgress` applies the same
  newest-`updated_at`-wins rule (see the
  [server data model](../server/data-model.md)).
- **Connection-scoped.** Every `ProgressSave` carries a `connectionId`, and both
  the mirror and the queue key on `(connectionId, libraryId, path)`. This stops
  the queue from replaying one server's positions against another.
- **Durable mirror first.** `saveProgress` always upserts the local mirror
  (`audiosilo.progressMirror`, keep-newest per `(connectionId, libraryId, path)`)
  before touching the network. The mirror is never pruned on sync; it is the
  resume fallback when the server can't be reached. While a book plays, the
  mirror is written every 15 s, even when the save itself runs every 60 s. A span
  that a kill left open brings it forward at the next launch (`mirrorSpanEnd`).
  See [The periodic save's pace](playback.md#the-periodic-saves-pace).
- **Offline replay queue.** If the server is known to be unreachable, the save is
  queued locally (`audiosilo.progressQueue`, the latest save per
  `(connectionId, libraryId, path)`) without firing a doomed request. A network
  failure en route also queues. 4xx responses are treated as unrecoverable and
  dropped, since retrying forever can't help an auth or forbidden error.
  Read-modify-write access to both the queue and the mirror is serialized through
  in-module promise locks, so a flush and a concurrent save can't clobber each
  other.
- **Flush routes per connection.** `flushQueue` runs on reconnect (registered
  through `onReconnect` at module load), after any successful direct save, and
  when a book starts playing.
  - It groups the queue **by connection** and replays each save through **its
    own** connection's client (`resolveClient`, keyed on the save's
    `connectionId`), never against whichever server happens to be active.
  - Groups replay concurrently, with order preserved within each connection, so
    one slow or dead server can't stall another server's replay.
  - A save whose connection was removed is unroutable and dropped. A connection
    drop mid-flush keeps the remaining items.
  - Only the active connection's success or failure moves the reachability
    banner.
  - It waits for the session to hydrate (`sessionReady`), so a flush racing
    startup can't null-route the whole queue.
- **`loadInitialProgress(api, connectionId, libraryId, path)`** reconciles the
  server, the mirror and the queue into the `ResumeLookup` (`progress`, `empty`
  or `failed`) that drives resume. The semantics live in
  [Playback](playback.md#resume-protection).
- **Launch reset and purge.** The mirror and the queue need no migration of their
  own. See [The launch reset](#the-launch-reset).
- **Sync v2 fields on the mirror.** A mirror record also keeps:
  - the playing file and the seconds into it (`file`, `file_pos`), for the resume
    by file;
  - on a `listening_sync` server, the version of the book's server row that this
    device has acknowledged (`ack_version`, never lowered; `ackVersion`), and the
    offers it has answered (`answered`, with `device_id|updated_at` keys;
    `answerOffer`).

  `ack_version` and `answered` are kept across captures, and a `PUT` never sends
  them. `ack_version` is what a listening span sends as its `base_version`. It is
  set when a sync answer kept this device's event, when a resume or an explicit
  start takes a server row, when the place reconcile moves to one, and when an
  offer is answered ([the outbox](offline.md#listening-sync-the-outbox)).
- **On a `listening_sync` server** the capture writes only the mirror. The place
  reaches the server as listening events
  ([Playback](playback.md#listening-spans-sync-v2)), and the legacy queue only
  drains what it already held. `pendingSaves` counts both the queue's saves and
  the outbox's listens.
- **Downloaded books keep the progress list's places.** Home's progress list
  (`allProgressQuery`) puts the rows of the books downloaded here into the mirror
  in one write (`writeMirrors`, keep-newest), as `fetchBookProgress` does for one
  book. A record identical to the stored one writes nothing. An offline resume
  then knows a place another device reached, even when the book's page was never
  opened online. A failed mirror write never fails the list.

### The place Resume plays

The book's page, Home and every other reader of a book's saved place show the place
Resume would play from, never only the server's row. So a page never shows another
device's older row while Resume starts at this device's newer place, and Home's
percent after an offline run is the player's.

- **`bookPlace(server, cid, lib, path)`** (`progress-sync.ts`) is the resume lookup's
  pick of the server's row and this device's own records (the mirror and the offline
  queue), with the file place a resume plays. `fetchBookProgress` answers with it, so
  the `qk.progress` cache holds it. Offline (no server answer) it is this device's
  records alone.
- **This device's record keeps the server's row beside it.** A local record reads as
  version 0 and carries none of the row's fields, so when it is the pick, the row goes
  with it (`PlacedProgress.server`, read through `serverRowOf`). The book's dates,
  another device's place to offer (`ListeningOfferLine`) and the version an explicit
  start acknowledges (`knownProgress`) come from that row.
- **A sync answer** stores `bookPlace` of each row in the same cache (`applyAnswer`),
  never the row alone.
- **`useBookProgress` reads the place on the shown file order.** Its `select` turns
  the record's file place into whole-book seconds on the chapters the cache holds
  (`positionOn`, never fetching them; the cached entry keeps the record's own
  seconds). After a server reorder with a download in the old order, the book and
  episode pages, the end credits, the companion, the reveal listener and `usePlaceIn`
  then all show the place Resume plays. Read its `.position`, never the raw record's.
- **Home's progress list** is read the same way, row by row (`withLocalPlaces`).

:::note[No realtime sync]
Progress sync is REST-only. The server advertises a `websocket` capability flag
for a future realtime channel, but no WebSocket client exists in the frontend.
Don't document or rely on one.
:::

### The launch reset

The launch-time `migrateStorage()` (`src/lib/storage-migration.ts`) is one
memoised run that `bootstrapPlayback` awaits before any store hydrates. It runs
`resetStaleStorage` (`src/stores/session.ts`), which reconciles storage along two
independent version axes:

| Axis | Stored version | What a bump wipes | Bump it for |
|---|---|---|---|
| **auth** | `audiosilo.storageVersion`, now `2` | the connections, their tokens, the pre-multi-server single-session keys and, with them, the scoped cache. It signs everyone out. | only a connection identity change that can't be migrated. One that can be re-keyed gets a key migration instead, as the move to `<server_id>.<user_id>` did ([Connection identity](#connection-identity-server_iduser_id)). |
| **cache** | `audiosilo.cacheVersion` | only the scoped cache. Every login is kept. | any change to how that cache is keyed. A pre-split install adopts the version without a wipe. |

The scoped cache is `audiosilo.downloads`, `audiosilo.progressMirror`,
`audiosilo.progressQueue`, the reader's `audiosilo.readingMirror` and
`audiosilo.readingQueue`, the listening outbox's `audiosilo.listeningOutbox`,
`audiosilo.listeningOpenSpan` and `audiosilo.listeningSync`, and
`audiosilo.offlineServers`.

Either reset makes `bootstrapPlayback` wipe the on-disk downloads too. After both
axes, the same `migrateStorage()` run moves legacy connection ids to
`<server_id>.<user_id>` ([Connection identity](#connection-identity-server_iduser_id)),
keeping every login. An `onConnectionRemoved` handler drops a removed
connection's mirror records and queued saves.

### The replay guard

On the `PUT` path (a server without `listening_sync`, or a Sync v2 rollback), a
save is last-write-wins. A session that began where this device could not check
its server would move another device's further place back when it reconnects. In
one reported case a place went from 3570 s to 4.78 s. The guard holds such saves
instead:

- **Which sessions.** `loadInitialProgress` marks its `ResumeLookup` `unchecked`
  when the server was not reached, or when this device's newer record resumes
  more than 30 s behind the server's unfinished row. A downloaded book's `failed`
  start counts too. So does a book adopted from the engine (`adoptLoadedBook`),
  whose place is the engine's and was never looked up. The store keeps a guard per
  session (`placeGuard`, with a random id). It puts `guard` and the session's
  `guard_session` on its saves, but never on an explicit place or a finish.
  Neither field is sent or kept in the mirror.
- **Until one is `PUT`.** A guarded save that is `PUT`, live or replayed from the
  queue later, settles its session (`guardSettled`), and the store's next save
  drops the guard. A save of an earlier session landing late never lifts a later
  session's guard.
- **The check.** Before a guarded save is `PUT`, `guardPasses` reads the server's
  row. `guardHolds` (pure) holds the save when the row is another device's
  unfinished place more than `GUARD_SLACK_S` (30 s) further on, and the listener
  has not answered that place (the mirror's `answered` keys, built by
  `placeKey`). A finished save (a rollback's finish) is never held. A held save is
  not sent and leaves the queue, and the mirror keeps this device's place.
- **The offer.** `onHeldSave` tells the place reconcile, which offers the place
  that held the save, for the loaded book, with the usual Jump and Stay toast
  ([Playback](playback.md#offering-another-devices-place-sync-v2)). Stay lifts the
  session's guard and saves this device's place at once (`saveLoadedPlace`), so
  that save and the later ones are not checked again. The other device may have
  saved since the offer, and its new row would otherwise hold them with no further
  offer. An ignored toast records no answer and lifts nothing. Each listener runs
  on its own, so one that throws never turns a held save into a queued one.

The guard and the offer share `GUARD_SLACK_S` and `placeKey`. Sync v2 needs none
of this, because the server resolves each span on its `base_version`.

## Reachability (`src/api/reachability.ts`)

A small Zustand store (`useReachability { online }`) plus module functions track
whether the **active server** is reachable, so the sync layer stops hammering a
dead endpoint.

- It starts optimistic (`online: true`).
- **`noteFailure(cid, e)`** is how every request path reports a failure: the
  query cache, `loadInitialProgress`, `fetchBookProgress`'s mirror fallback, the
  progress saves (`saveProgress` and `flushGroup`, which keep the save queued)
  and the listening span (`endHistory`).
  - It only asks for a check (`checkReachability`).
  - It asks only for no answer, on a connection not already marked down. No
    answer is `isUnreachableError`: a `TimeoutError`, or a `TypeError` (the
    client's `NetworkError`, or a browser's "Failed to fetch").
  - A capability gate or a cancel says nothing.

  So one slow or broken read never marks a healthy server down, and a read
  answered from a local copy never marks a dead one up. Apart from the web
  `offline` event (below), nothing marks a server down without a check.
- **`noteSuccess(cid)`** marks a connection up: a save that got through,
  `loadInitialProgress` reading an `ApiError` (the server answered), or the
  `/server` query succeeding for a connection marked down (the query cache).
- **`noteAnswer(cid)`** counts an answer without changing the state. Every
  connection's `ApiClient` gets it as its `onAnswer` callback, called whenever a
  fetch resolves, whatever the status. That covers the provider's clients and the
  ones `resolveClient` builds for the save loop, the car and the downloads. So a
  check that timed out on a slow but healthy server sees that another request was
  answered meanwhile, and leaves the server up.
- **`checkReachability(cid)`** asks `GET /server`, one check per connection at a
  time. Any answer, an `ApiError` included, is reachable; no answer is
  unreachable.
  - It records nothing once stale: when the connection was removed or moved to
    another address while it waited, or (for no answer) when another request was
    answered meanwhile.
  - `recheckReachability` runs it once more after a check already in flight, so a
    Retry that got through is not lost to a stale check. The probe loop uses it
    too.
  - A check whose connection moved to another address while it waited (the
    address runner left home as the network went) asks the new address at once.
- **The probe loop.** While offline, a 20 s probe loop runs `checkReachability`
  on each offline connection until it answers. It reaches them through the client
  map that `ApiProvider` registers with `setReachabilityClients`.
- **`firstOffline(connections, online)`** names the first connection that is not
  answering. The top bar's server line and Home's servers pill show
  "&lt;server&gt; isn't answering" for it (`shell.notAnswering`) rather than a
  green count.
- **On web only**, the browser's `online` and `offline` events short-circuit the
  loop. An `online` event triggers an immediate probe, because the network
  interface being up doesn't prove the *server* is.
- **On native**, `deviceNetworkChanged` follows the system's network state
  (`expo-network`). It acts only on a change of connected, type or
  internet-reachable, since Android repeats capability changes in bursts.
  - Losing the network checks every connection still marked up at once. Each is
    marked down now, and the playing span is kept on the device rather than cut
    into sends that can't leave it.
  - Getting the network back asks every connection marked down at once, and again
    `REJOIN_RETRY_MS` (4 s) later. So the outbox and the progress queue
    (`onReconnect`) go as soon as the server answers, even with the app idle in
    the foreground.
- **`onReconnect(cb)`** is the hook everything else builds on. The progress queue
  flush and the global query invalidation both register here. The offline banner
  (`src/components/layout/offline-banner.tsx`) reads the store reactively.

Callers in the write paths (`progress-sync`, the history recorder in the player
store) consult `isReachable()` before firing, and report a failure with
`noteFailure`. The progress saves also call `noteSuccess` when one gets through.
This keeps the classification current without a dedicated heartbeat while the
server is healthy.

## Storage layers

There are two deliberate tiers. Know which one you are writing to.

| Layer | Module | Backing | Used for |
|---|---|---|---|
| Plain | `src/lib/storage.ts` (`getItem`/`setItem`/`removeItem`, JSON-serialized) | AsyncStorage on native; localStorage on web, through AsyncStorage's web shim | connection metadata, settings, language pref, downloads registry, progress mirror and queue, the listening outbox, open span and sync state, device id |
| Secret | `src/lib/secure-store.ts` (`getSecure`/`setSecure`/`deleteSecure`) | **expo-secure-store** (iOS Keychain, Android Keystore) on native. On iOS it uses the `audiosilo.tokens.afu` keychain service, readable after first unlock (see [Native integrations](native-integrations.md#tokens-on-a-locked-phone-srclibsecure-storets)). localStorage on web, where SecureStore doesn't exist. | **session tokens** (`audiosilo.token.<connectionId>`), plus profile PIN hashes (`audiosilo.profilePin.<profileId>`), the device's copy of an upcoming calendar link (`audiosilo.upcoming-calendar.<connectionId>`) and a connection's [proxy headers](#proxy-headers) (`audiosilo.proxy-headers.<connectionId>`) |

The split exists because these values are secrets. Hardware-backed storage on
native is worth the extra API for them, while everything else is non-sensitive
state that benefits from the simpler JSON layer. On web both tiers degrade to
localStorage, since same-origin script access is the trust boundary there
regardless.

`storage.ts` swallows storage errors (best-effort semantics), so its callers never
need try/catch for a full disk or a blocked localStorage. `secure-store.ts` does
so only on the web. On native a token read can reject (on iOS, a locked keychain,
"interaction is not allowed"), and the session's hydrate relies on that (see
[Session](#session-srcstoressessionts)).
