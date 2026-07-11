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
`qk.bookMeta(cid, lib, path)`, `qk.server(cid)` - so mutations can invalidate
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

### Enriched book metadata

The book screen (`src/app/(app)/book/[libraryId].tsx`) draws a
`BookMetaSection` (`src/components/library/book-meta.tsx`) beneath the
file/chapter list, in both the wide and phone branches, following the
section-per-concern pattern (the same shape as the bookmarks/notes sections). It
shows a description (collapsed past ~300 characters with a show-more toggle),
compact production details (publisher, release date, first published, an
"abridged" badge), a horizontal **more in this series** rail, and a quiet **View
on AudioSilo Meta** link.

Three details make it safe to add to a screen everyone sees:

- **Capability-gated.** The section mounts only when the server advertises the
  `metadata` capability (`!!server.capabilities.metadata`, optional in
  `types.ts` so an older server reads as absent → false). On a server without
  the feature the query never fires.
- **Progressive enhancement.** The component renders **nothing** while loading,
  on error, or on `{ matched: false }` - the page is never worse for having the
  section, and its absence is indistinguishable from a book the metadata service
  doesn't know.
- **Fetch tuned for a best-effort side dish.** `useBookMeta` keys on
  `qk.bookMeta(cid, lib, path)` with a **1 h `staleTime`** (the server caches the
  composed envelope too, so re-fetching sooner buys nothing) and **`retry: false`**
  so a 502 from a down metadata service resolves once and stops - it must not
  spin or block the rest of the screen.

`client.bookMeta(libraryId, path, signal)` calls `GET /libraries/{id}/meta`; the
`BookMeta` discriminated union (`{ matched: false } | { matched: true; work;
recording?; series?; web_url }`) in `types.ts` is hand-mirrored from the server's
envelope (the mirroring rule above applies - a change to the shape is a two-repo
change with tests on both sides). Every series-rail entry
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
