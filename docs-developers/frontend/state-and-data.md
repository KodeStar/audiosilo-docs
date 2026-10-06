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
  start). Note: nothing *automatically* requests the transcode yet - the
  `direct_playable` negotiation on web is a known open follow-up.
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
`qk.libraryBooks(cid, lib, query)`, `qk.nextBook(cid, lib, path)`, `qk.server(cid)` - so mutations can invalidate
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

### Capability-gated reads (player redesign Phase 1a)

The player redesign's data layer landed ahead of its screens: these methods and
hooks exist, are tested (`client.test.ts`, `hooks-capability.test.tsx`), and are
**not consumed by any screen yet** (Phase 2 onwards uses them).

**`useCapability(flag, connectionId?)`** (exported from `hooks.ts`) is tri-state:
`undefined` while the connection's `/server` info is unknown (still loading, or
unreachable), then `true` or `false` (a server that predates the flag reads
`false`). A screen picks its fallback, or hides the feature, on `false`, and on
`undefined` waits or decides for itself. `useServerInfo(connectionId?)` takes the
same optional connection id and keeps its answer (`gcTime: Infinity`), so a gated
hook mounted later starts from the known flags.

Each gated hook asks only a server whose flag is `true`. Until then its query has
**no function at all** (`skipToken`), so not even a manual `refetch` reaches an
older server (React Query rejects it instead) and the query stays pending.

| Client method | Hook | Capability | Endpoint |
|---|---|---|---|
| `listBooks(lib, { author, series, narrator, sort, limit, cursor })` | `useLibraryBooks(lib, query?, connectionId?)` | `browse_people`, only when `query.narrator` is set | `GET /libraries/{id}/books` (keyset pages of 100, `BookPage`; key `qk.libraryBooks`) |
| `authors(lib)` / `narrators(lib)` | `useAuthors` / `useNarrators(lib, connectionId?)` | `browse_people` | `GET /libraries/{id}/authors`, `/narrators` |
| `seriesList(lib)` | `useSeriesList(lib, connectionId?)` | `browse_people` | `GET /libraries/{id}/series` (`SeriesCount[]`) |
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
  The shipped end-of-book flow still resolves the folder sibling on the device
  ([Playback](playback.md)) until a later phase switches to it.
- **New wire fields, typed but unused so far:** `Book.published`, `description`
  (`/item` only), `cover_color` (`CoverColor { bg, accent?, on_accent? }`) and
  `cover_version`; `BookMetaWork.community_description` and `attribution`
  (`BookMetaAttribution`: the server writes the CC BY-SA credit, and a screen that
  shows community content must render it beside that content, never compose it);
  `BookMetaRecording.chapter_count`; `local` (`BookRef`) on rail entries; and
  `previous` on a matched `BookMeta`. All optional, absent on older servers.

### The book screen's tabs

The book screen (`src/app/(app)/(home,library,search,offline,me)/book/[libraryId].tsx`)
is an **overview plus a tab row**, not one long scroll. The overview keeps
everything that identifies and starts the book - breadcrumbs, the version picker,
the cover hero, the stats strip, the Listen/download actions, and the
community-metadata **About** block (`BookMetaAbout`). Everything else lives behind
the Stacks underline tabs (`Tabs` / `TabsList scrollable` / `TabsContent`,
`src/components/ui/tabs.tsx`): `scrollable` puts the triggers in a horizontal
scroller so up to seven tabs (and labels that grow in translation) stay
reachable, and the parts carry the tablist / tab / tabpanel accessibility roles.
The active panel renders inside the page's existing ScrollView, never in a nested
vertical scroller. Phone and tablet/desktop share the same tab section (the wider
layouts only add the right-hand cover panel). The tabs:

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

A summary counts as *visible* only when it will actually render: an `in_short`
(inline on a finished book, otherwise as a collapsed, spoiler-chipped
"Whole-book summary" row), or an `ending` on a finished book (the ending is a
full spoiler and is withheld until then). The screen computes that once and passes it to both `bookTabs` and
`BookMetaRecapsTab`, so the tab and its panel can never disagree.

The point of the restructure: a long chapter list used to bury bookmarks, notes,
history and the whole metadata section below it.

### Enriched book metadata

The meta-driven tabs are rendered from `src/components/library/book-meta.tsx`:
`BookMetaAbout` (description collapsed past ~300 characters with a show-more
toggle, production details - publisher, release date, first published, an
"abridged" badge - and a quiet **View on AudioSilo Meta** link),
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
(`roleLabelKey`, `revealDescriptor`, `recapDescriptor`, `sortRecaps`,
`summaryIsVisible`) are unit-tested, and the strings live under `book.meta.*` in
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

### Series orderings (`src/stores/series-orderings.ts`)

`useSeriesOrderings` holds `picks` - family key -> the id of the reading order the
reader chose - persisted as one JSON document (`audiosilo.seriesOrderings`, validated
by `parsePicks`) and hydrated once at boot from `_layout.tsx`. It is a **device**
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
own state - including the recent searches it keeps per device - is `usePalette`
in `src/components/shell/palette-store.ts`; see
[the shell](overview.md#command-palette-web).) The shell (`useShellEffects`) clears the query when you
leave the Search tab; within the tab it is kept, so opening a result and coming
back shows the same results. Not persisted.

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
