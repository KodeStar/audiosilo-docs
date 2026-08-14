---
title: State & data
description: "The typed API client and its hand-mirrored types, React Query conventions, the Zustand stores, offline-safe progress sync, reachability tracking, and the two storage layers."
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
  start). Note: nothing *automatically* requests the transcode yet - the
  `direct_playable` negotiation on web is a known open follow-up.

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
`qk.bookMeta(cid, lib, path)`, `qk.metaWork(cid, workId)`, `qk.server(cid)` - so mutations can invalidate
precisely and one server's cache never shadows another's. Content keys are `(connectionId, libraryId, path)` tuples,
extending the path-is-identity rule across connections.

Patterns to copy when adding an endpoint:

- Plain reads: `useQuery` + a `qk` key + `enabled: path.length > 0` guards.
- Paged reads: `useBrowseInfinite` uses `useInfiniteQuery` against the server's
  `next_offset` cursor (500-entry pages); the browse screen drains all pages so
  the A–Z rail and filter operate on the complete folder.
- Mutations invalidate their exact key on success (`useAddBookmark`,
  `useAddNote`, …). `useToggleFavourite` shows the full optimistic pattern:
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

### The book screen's tabs

The book screen (`src/app/(app)/book/[libraryId].tsx`) is an **overview plus a
tab row**, not one long scroll. The overview keeps everything that identifies and
starts the book - breadcrumbs, the version picker, the cover hero, the stats
strip, the Listen/download actions, and the community-metadata **About** block
(`BookMetaAbout`). Everything else lives behind a horizontally scrollable pill
tab row (`TabBar`, `src/components/ui/tab-bar.tsx` - a thin wrapper over
`SegmentedControl`'s `scrollable` + `role="tab"` mode; its equal-width,
non-scrolling default cannot hold seven tabs):

| Tab | Shown when |
|---|---|
| `chapters` (labelled *Chapters* or *Files*) | the book has chapters or files |
| `recaps` | the work has recaps, a *visible* whole-book summary, **or** earlier books in its series |
| `characters` | the work has characters, **or** earlier books in its series |
| `bookmarks`, `history`, `notes` | always |
| `series` | at least one non-empty series rail |

The list itself is a pure function - `bookTabs(input): BookTab[]` in
`src/components/library/book-tabs.ts`, unit-tested - and the screen holds the
selected tab in `useState` with `tabs.includes(tab) ? tab : tabs[0]`, so a tab
that disappears when data settles falls back instead of rendering blank. Labels
come from `TAB_LABEL_KEY` in the same module, which reuses the existing section
strings (`library.{bookmarks,history,notes}.title`, `book.meta.characters`); only
`book.tabs.recaps` and `book.tabs.series` are tab-only keys.

A summary counts as *visible* only when it will actually render: an `in_short`, or
an `ending` on a finished book (the ending is a full spoiler and is withheld until
then). The screen computes that once and passes it to both `bookTabs` and
`BookMetaRecapsTab`, so the tab and its panel can never disagree.

The point of the restructure: a long chapter list used to bury bookmarks, notes,
history and the whole metadata section below it.

### Enriched book metadata

The meta-driven tabs are rendered from `src/components/library/book-meta.tsx`:
`BookMetaAbout` (description collapsed past ~300 characters with a show-more
toggle, production details - publisher, release date, first published, an
"abridged" badge - and a quiet **View on AudioSilo Meta** link),
`BookMetaRecapsTab`, `BookMetaCharactersTab`, and `BookMetaSeriesTab` (one
horizontal rail per series). `matchedMeta(meta, enabled)` narrows the envelope
once for the screen; `seriesRails(series, currentWorkId)` drops the current work
and any rail left empty.

Characters and recaps are the community expressive layer (`work.characters` /
`work.recaps` / `work.recap_summary`, the `BookMetaCharacter` / `BookMetaRecap` /
`BookMetaRecapSummary` types). Each character card shows name/role/aliases and
"from chapter N" up front with a per-card accordion for the own-words description
(no blur - a tap reveals it); each recap likewise opens only when tapped. The
current book's `recap_summary.in_short` renders as an **In short** intro above the
story-so-far recaps, and its `ending` ("How it ends") only once the book is
finished. All of these are absent from the envelope when the upstream has none,
so a work without them simply shows no such tab. Pure label helpers
(`roleLabelKey`, `revealDescriptor`, `recapDescriptor`, `sortRecaps`,
`hasRecapSummary`) are unit-tested, and the strings live under `book.meta.*` in
all locale catalogs.

#### Spoiler gating (`src/components/library/meta-gating.ts`)

Character and recap visibility is derived from **where the listener actually is**,
in a framework-free module of pure functions:

- `listeningProgressFor(input)` resolves the position, preferring the live player
  chapter when this book is the one loaded (via `chapterOrdinal`) and otherwise
  mapping the saved server progress onto the chapter list (via `chapterNumberAt`
  over the cumulative chapter starts). `NO_PROGRESS` is the not-started value, and
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

#### Catching up on previous books (`client.metaWork`)

Both the Recaps and Characters tabs end with a **Previous books** block: one closed
accordion row per earlier book of the series, most recent first.
`previousWorks(series, currentWorkId)` builds that list - every series rail entry
whose position sorts before this work's, deduped by work id, sorted descending -
on top of `seriesPositionValue` (a `parseFloat` of the position string, so "1-3.5"
reads as 1 and an unparsable position is excluded).

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

`client.bookMeta(libraryId, path, signal)` calls `GET /libraries/{id}/meta`; the
`BookMeta` discriminated union (`{ matched: false } | { matched: true; work;
recording?; series?; web_url }`) in `types.ts` is hand-mirrored from the server's
envelope, and `client.metaWork` reuses the very same `BookMetaWork` type rather
than declaring a second one (the mirroring rule above applies - a change to
either shape is a two-repo change with tests on both sides). Every series-rail entry
carries its own `web_url`, so tapping a series work or the footer link opens the
metadata site **externally** (a real new tab on web, an in-app browser tab on
native) - the client never constructs a metadata URL. UI strings live under
`book.meta.*` in the locale catalogs.

## Zustand stores

### Session (`src/stores/session.ts`)

Multi-connection: a `Connection` is `{ id, serverUrl, name, token, user }`.
Connection **metadata** persists to AsyncStorage (`audiosilo.connections` +
`audiosilo.activeConnection`); each connection's **token** lives in
secure-store under `audiosilo.token.<id>` - tokens are stripped before the
metadata is persisted. `hydrate()` restores everything on launch (and migrates
the pre-multi-connection single-session keys once); `setSession` adds or
updates by server URL and makes it active; `removeConnection` (and `logout`,
which removes the active one) deletes its token **and purges the connection's
scoped state** - downloads, the progress mirror + offline queue, cached queries,
and scroll memory. It does this by running an `onConnectionRemoved` cleanup
registry that those owners subscribe to (they can't be imported directly here -
they import the session store, so a direct import would cycle); a failing cleanup
is logged, never blocks removal. `status` is
`loading | unauthenticated | authenticated`, and the `(app)` layout guard
redirects on it. Mirror fields (`user`, `activeServerUrl`,
`activeConnectionId`) are derived for ergonomic selectors.

### Settings (`src/stores/settings.ts`)

Playback tunables persisted as one JSON blob (`audiosilo.settings`):
`skipForward` (30), `skipBackward` (15), `defaultRate` (1), `autoRewindMax`
(5 s), `virtualChapterInterval` (30 min). The playback layer subscribes and
re-`configure`s the engine whenever these change.

### Search (`src/stores/search.ts`)

A single shared `query` string, so the desktop top bar and the search screen
are one input rather than two competing search bars. Not persisted.

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
- **One-time migration + purge.** `ensureMigrated` (memoized, run before any
  read-modify-write) adopts pre-multi-server records into `adoptionTarget()`
  (or drops them when no connection exists), re-keying and re-deduping mirror
  and queue. It waits on `whenSessionReady()` only when a legacy record actually
  exists. An `onConnectionRemoved` handler drops a removed connection's mirror
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
- While offline, a 20 s probe loop calls `serverInfo()` on the client that
  `ApiProvider` registered via `setReachabilityApi` until it answers.
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
| Secret | `src/lib/secure-store.ts` (`getSecure`/`setSecure`/`deleteSecure`) | **expo-secure-store** (iOS Keychain / Android Keystore) on native; localStorage on web, where SecureStore doesn't exist | **session tokens only** (`audiosilo.token.<connectionId>`) |

The split exists because tokens are the only true secret the app holds:
hardware-backed storage on native is worth the extra API, while everything else
is non-sensitive state that benefits from the simpler JSON layer. On web both
tiers degrade to localStorage - same-origin script access is the trust boundary
there regardless. Both modules swallow storage errors (best-effort semantics),
so callers never need try/catch for a full disk or a blocked localStorage.
