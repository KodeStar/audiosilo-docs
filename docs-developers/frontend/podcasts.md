---
title: Podcasts
description: "The player's podcast views: who sees them, the Shows library mode, the show and episode pages, Follow, Home's New episodes, the episode-fetch controller that plays an episode not on the server yet, finding shows (directory search, a feed address, OPML import and export, Check for new episodes), and what episodes never do."
---

## Scope

The player shows a server's podcast libraries, and lets a listener
[find shows](#finding-shows) to add to them.

The server lists a podcast library (`Library.kind === 'podcasts'`) only to a client
that passes its [podcast gate](../server/auth-and-security.md#podcast-visibility):

- the player from **2.2.0** (`auth.PodcastPlayerMinVersion`). The server checks it
  against `app.json` `expo.version`, which `src/lib/client-id.ts` sends as
  `X-AudioSilo-Client: AudioSilo/<version> (<os>)`;
- the admin console;
- `AudioSilo/dev`.

2.1.x and older builds see no podcasts. The first released player with these views
is 2.4.0.

The served `/web` export sends the same header same-origin. The cross-origin dev
loop (`npm run web` on `:8081`) sends no header, so it shows no podcasts. A
development build can opt in with `EXPO_PUBLIC_IDENTIFY_CROSS_ORIGIN=1`
(`identifiesCrossOrigin` in `client-id.ts`, never true in a production build).

The wire mirror (types, client methods, `PodcastFetchPendingError`, hooks and query
keys) is documented once, with the server protocol it follows, in
[Bridge podcasts: Player](../bridge/podcasts.md#player-phase-2d-1) and
[Player: discovery and OPML](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2).
This page covers the screens and the controllers. The code is in:

- `src/components/podcasts/`
- `src/playback/episode-fetch.ts`
- `src/components/home/{new-episodes-model,use-new-episodes,new-episodes-rail}.ts*`
- `src/lib/library-kind.ts`
- `src/lib/podcast-requests.ts`

## Telling an episode from a book

An episode is an ordinary item. It lives at `/book`, plays through the normal start,
and keeps progress, bookmarks and Up next entries like a book.

Only `GET /item` sends `Book.episode` (`PodcastEpisodeInfo`). The list shapes (Up
next, Continue listening, history) leave it out. So a framework-free reader tells an
episode by its library instead:

- `isPodcastLibrary(l)` (`library-kind.ts`). An absent or unknown `kind` is books.
- `cachedPodcastLibrary(cid, libraryId)`, over the cached library list.
- `podcastLibraryIds(libraries)`, a set of ids for a whole list.
- the `useIsPodcastLibrary` hook.

`episodeAsBook(ep, show)` (`podcast-model.ts`) turns an episode row into the `Book`
that a start, the action menu and the fetch take.

## Reads are core, writes are the module's

- **Reads.** Shows, episodes and `/me/podcasts` are core reads, never gated on a
  capability flag. The player asks for them only for a library of the podcasts kind
  (`usePodcastShows(..., {enabled})`), so a books library never asks.
- **Follow and Unfollow** are `useCapabilityMutation('podcasts', ...)`. The
  module's flag is true only with the toggle on **and** its Bridge online.
  - `FollowButton` (`follow-button.tsx`) is interactive only then, and only for a
    listener who may follow (not `isKidAccount(user)`, not `user.is_demo`).
    Otherwise a followed show shows a read-only **Following** badge, and other
    shows show nothing.
  - Unfollowing a private show opens a `ConfirmDialog` first, since the show leaves
    the listener's lists.
  - Errors become toasts by `apiErrorKind`, never the server's text. The kinds are
    `module_off`, `kid_account`, `demo_account` and `show_not_found`, which also
    refetches the shows.
- **The fetch status** is `podcast_fetch`'s (`usePodcastFetchStatus`).
- **Finding shows**, follow by address and Check for new episodes are the module's
  too (`podcasts`). Search is `podcast_discovery`'s, and OPML is `podcast_opml`'s.
  See [Finding shows](#finding-shows).

## Surfaces

### The Shows library mode

`library-modes.ts` adds the mode `shows`:

- A podcast library offers `['shows', 'folders']` only
  (`availableLibraryModes(caps, podcasts)`). A books library never offers Shows.
- `resolveLibraryMode` maps any book mode to `shows` on a podcast library, so a
  `?mode=authors` link lands on Shows. It maps `shows` to `books` on a books
  library.
- `library-screen.tsx` reads the selected library's kind. On a podcast library it
  passes no connection to `useModeCounts`'s author, narrator and series hooks, so
  those book-only routes are never asked. The count is the number of shows.
- `library-picker.tsx` puts a `microphone` icon beside a podcast library.

`PodcastShowsMode` (`shows-mode.tsx`) shows, from the top:

1. its [actions](#entry-points): Add shows, the More show actions menu, and a line
   while shows are being added;
2. an All / Following chip row with counts;
3. a cover grid of `ShowTile`s.

A `ShowTile` (`show-tile.tsx`) is a `BookCover` on the show's path with
`cover_version`, then the title, then a second line and a "Private feed" badge. The
second line is `New episode {{when}}` when `latest_published` is in the last 14
days, else the author. It is not `CoverTile`, since a show has no book actions or
progress. Pressing a tile pushes `podcastShowHref`.

### The show page

The route is `src/app/(app)/(home,library,search,offline,me)/podcast.tsx`, and the
URL is `/podcast?connection=&library=&show=<path>[&order=newest|oldest]`
(`podcastShowHref`, `parsePodcastParams` in `src/lib/paths.ts`). `/podcast` is in
`BROWSE_PATHS`. `PodcastShowScreen` (`podcast-show-screen.tsx`) names the browser
tab and renders:

- **The hero:** cover, title, author, a collapsible description, the episode count,
  the Private feed badge, `FollowButton` and
  [`CheckEpisodesButton`](#check-for-new-episodes). It adds "Last check failed"
  when `status.error` is set, with no codes for listeners.
- **The order control:** `defaultEpisodeOrder(show)` is `oldest` for a `serial`
  show and `newest` otherwise. The segmented control writes `?order=`. The client
  never re-sorts. The server (from 2.4.0) orders by published date, then season and
  episode number, then path, so an undated serial lists as its feed numbers it.
- **`EpisodeList`**, a FlashList over `usePodcastEpisodes` pages.
  - A show link to a library that isn't a podcast library, or isn't there or
    shared (`409`, `404`, `403` on the show list), says the link points nowhere
    (`library.detail.badLink`). It has no Retry, which could not mend the link.
  - `visibleEpisodes` drops `removed && !downloaded`. A removed episode whose file
    is kept stays, marked "No longer in the feed".

#### The episode row

`EpisodeRow` (`episode-row.tsx`) shows:

- the title;
- a meta line (`episodeMetaLine`): the date, the duration when
  `duration_source !== 'none'`, and `episodeLabel`'s `S2 E5` / `E5`;
- Trailer / Bonus / Explicit marks;
- progress, or Finished;
- the state line, from `episodeRowState(ep, pending, canFetch)`: Ready on your
  server, Plays on demand, Getting it (with a percentage when the size is known),
  Couldn't get it, or Not available now.

The two stopped states carry the server's `code`. `rowStateReasonKey(state)` turns
it into the reason line under them (`fetchReasonKey`), on a finished episode too. A
server without `podcast_fetch` reads as `bridge_unavailable`, "Your server can't
download episodes right now.". The player's own fetch of that episode (`pending`)
wins over the list's batched `fetch`.

The row has one button:

- **Play** (Resume once started), through `usePlayBook`;
- or **Try again** (`requestEpisodeFetch(..., {retry: true})`) where
  `canRetryFetch` says so. That is after a failure, or when the episode is not
  available for a reason this build has no sentence for (no code, or an unknown
  one).

A known reason (the module off, no Bridge online, the library not writable) needs a
person first. So Play stays disabled with the reason beside it.

The row's menu is `BookActionsButton` with Add to Up next and Mark as finished,
never Download. Tapping the row opens `bookHref`.

### The episode page

`book-page.tsx` renders `EpisodePage` (`episode-page.tsx`) for an item with
`book.episode`. Before the item arrives, it renders it for any item of a podcast
library. The page has:

- a hero with cover, title, a link to the show, date, duration and marks;
- the primary Resume / Play / Try again (`canRetryFetch`, as on a row). A stopped
  state's reason (`rowStateReasonKey`) sits beside the disabled primary button;
- the description;
- the chapters, through `BookChaptersTab` with `episode`. Its card reads "The whole
  episode", its parts notice speaks of the episode, and its `id3_chap` caption reads
  "Chapters from the episode file";
- `usePodcastFetchStatus` while the episode is not downloaded.

When `timeline_changed === true` and the listener has a position, a Notice says the
audio changed and the place is kept. Nothing is rescaled.

There is no Generate, community metadata, rating, series or Download. The player's
companion chips and tabs are off for an episode (`useCompanionData` reads
`book.episode` as `off`). The player never asks for community metadata for an
episode: `metaEnabledFor` in `meta-gating.ts` is false for `book.episode`, because
a feed's tags can carry an ISBN-like value.

### Wording in the player and on Home

For an episode:

- The full player's progress reads `player.full.percentOfEpisode`
  (`{{percent}}% of the episode`).
- The Now card reads `home.now.throughEpisode` ("through the episode"), with
  `scaleLabelEpisode` for its scale.
- For an episode with no chapters, the Now card skips the "Chapter 1 of 1" line and
  resumes without a chapter in its label. It tells an episode by its library
  (`useIsPodcastLibrary`) before its item loads.
- Up next's Now playing card leaves out a chapter label that only repeats the
  title.

### Home's New episodes

`use-new-episodes.ts` reads `myPodcastsQuery` on each connection that lists a
podcast library. It takes the followed shows that published in the last 14 days
(`recentShows`: at most `NEW_SHOWS` = 8, newest first). It asks each for its newest
`NEW_EPISODES_PER_SHOW` = 5 episodes (`latestEpisodesQuery`, five minutes fresh).

`newEpisodes` (`new-episodes-model.ts`) then:

- keeps those published in the last `NEW_EPISODE_DAYS` = 14 days;
- drops removed episodes, trailers, and any started or finished (`skip`, Home's
  `skipNext`). Continue listening has the started ones;
- sorts newest first, then by key, and caps the shelf.

`NewEpisodesRail` sits after "Next in your series". It has the title "New episodes",
the sub "From shows you follow", and the action "All shows", which selects that
server's podcast library and opens `/library?mode=shows`. Its tiles are `CoverTile`s
captioned `{{show}} · {{when}}`. It renders nothing when empty. Podcasts stay off
the book shelves (a server rule).

## The episode-fetch controller

`src/playback/episode-fetch.ts` is a framework-free zustand store plus functions.
The store (`useEpisodeFetch`) holds one `pending` fetch: key, target, title, show,
start options, `phase`, `status` and `code`. The player's internals never see a
fetch; they get an ordinary start at the end.

### One choke point

`startBookInPlace` (`start-book.ts`) and the player route's auto-start
(`src/app/player.tsx`) hand an episode that needs a fetch to `requestEpisodeFetch`,
never to `playBook`. An episode needs a fetch (`needsEpisodeFetch(book,
podcastFetch)`) when it is not `downloaded` and its server's `podcast_fetch` is
true. A local (downloaded) source never does.

- Any other start ends a fetch in flight first (`cancelEpisodeFetchUnless`), so the
  last tap wins.
- A start that plays the episode itself ends a fetch of it still on its way
  (`cancelEpisodeFetchOf`).
- A start overtaken while it looked its episode up hands nothing on
  (`isLatestStart`).
- Tapping the same episode again joins the fetch, taking the newer start options.

### Phases

The phases are `probing` (the stream is being asked), `waiting` (queued or on its
way), `failed`, `unavailable`, `refused` (`409 fetch_limit`) and `starting`.

The wire rules are in [Bridge podcasts](../bridge/podcasts.md#player-phase-2d-1):
probe once, and poll every `max(2, Retry-After)` seconds. On a network error, `429`
or `5xx` back off with `blipDelay`, 2 seconds doubling to 60. Pause in the
background, never POST by itself, abort without a server cancel, and refresh at
ready.

Try again is `retryEpisodeFetch()` from the panel and strip, or
`requestEpisodeFetch(target, book, {}, {retry: true})` from a row or the episode
page. Both POST once, then follow the same handling.

### At ready

At ready the controller reads the item and chapters again and marks the show's
episode lists stale. Then it calls `startBookInPlace(target, opts, {fetched: true})`.

- A `fetched` start never goes back to the controller.
- It plays only while the fetch is still `starting` (`isEpisodeFetchStarting`), so a
  Cancel or another start since then wins.
- A start that fails stops as `failed`.

An episode that `advanceTo` hands to a fetch stays at the head of Up next. The
fetched start drops it once it plays (`dropStartedBook`). A failed or cancelled fetch
leaves it queued (see [End of book](end-of-book.md)).

### The fetch UI

**`EpisodeFetchPanel`** takes the full player's place while `pending.key` is the
route's episode. The route never calls `playBook` then. The panel shows:

- the cover, title and show;
- the heading "Getting this episode", or once stopped, "Couldn't get this episode"
  or "This episode can't be fetched now";
- one line under the heading, with a bar:
  - the body while probing;
  - "Waiting for its turn" while queued;
  - the progress while fetching, `{{received}} of {{total}}` or
    `{{received}} so far` with `formatBytes`;
  - the reason once stopped. Reasons read through `fetchReasonKey(code)`, with a
    generic fallback;
- Cancel, and Try again only when stopped.

**`EpisodeFetchStrip`** is the compact form, in `DockedPlayer` (wide) and
`MiniPlayer` (phone, player closed). While another book plays, the strip sits above
that book's controls. That book keeps playing until the episode replaces it at ready
(decision 6.4).

**The iOS 26 `AccessoryPlayer`** has no room for the strip:

- with nothing playing, the bottom accessory is the fetch itself
  (`AccessoryEpisodeFetch`, with its Try again and Cancel);
- with a book playing meanwhile, the regular accessory's second line says how the
  fetch is going (`useEpisodeFetchLine`).

A browser's autoplay rule may refuse a start long after the tap. That takes the
existing "refusal is a pause" path, and the episode loads paused.

## Finding shows

A listener can add shows to a podcast library from the player:

- search a podcast directory;
- follow a feed by its address;
- import an OPML list from another app;
- export the shows they follow;
- ask a followed show to check for new episodes.

The wire rules (search on submit, artwork through the proxy, the import waves,
export with the `Authorization` header) are in
[Bridge podcasts](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2). This
section covers the screens.

### The page

The route is `src/app/(app)/(library)/find-shows.tsx`. It is the Library tab's own
page, so a cold link lands in the Library and Back returns there. The URL is
`/find-shows?connection=&library=[&section=search|address|import]`
(`findShowsHref`, `parseFindShowsParams` in `src/lib/paths.ts`, `openFindShows` in
`src/lib/open.ts`). `/find-shows` is in `BROWSE_PATHS`.

`FindShowsScreen` (`find-shows-screen.tsx`) runs in `ContentScope`, so it is scoped
to its own `?connection=` like the show page. Its title, on the page and the browser
tab, is **Add shows**.

**Access** is `useAddShowsAccess(cid)` (`shows-actions.tsx`):

- `kid` for a kid's account;
- `demo` for the demo;
- `unknown` while `/server` isn't known;
- then `allowed` only with `podcasts === true` (the module on and its Bridge
  online);
- else `unavailable`.

Anything but `allowed` is a sentence instead of the page: "Ask a grown-up to add
shows.", "The demo can't add shows.", "Adding shows isn't available right now".

**Sections** come from the flags (`availableSections` in `find-shows-model.ts`, in
`FIND_SHOWS_SECTIONS` order):

- Search, with `podcast_discovery`;
- Feed address, always;
- Import a list, with `podcast_opml`.

`resolveSection` takes the link's `section` when it is offered, else the first. A
`SegmentedControl`, shown when more than one is offered, writes `?section=`.

The import (`useOpmlImport`) is held at page level. So it carries on while another
section shows, and ends with the page or with a switch to another connection or
library.

### The sections

#### Search

**Search** (`directory-search.tsx`) is one `FlatList` holding the page head, the
form, the results and, as its footer, the follow requests. The form has a provider
`SegmentedControl` (only when Podcast Index is available), the field and Search.

- Too short a search shows "Type at least 2 characters." and sends nothing.
- The caption `Results from {{provider}}` credits the directory.
- A refusal reads through `searchErrorCopy`, with the `Retry-After` seconds when
  known, above **Search again**.
- On search, a `no_library_access` means the server shows this client no podcasts
  (an older or unidentified player). It reads "This app can't use podcasts on this
  server. Update the app, then try again."

`DiscoveryResultRow` (`discovery-result-row.tsx`) shows:

- the artwork (`DiscoveryArtwork`, `discovery-artwork.tsx`, with the retry schedule
  in `artwork-retry.ts`);
- the title, author and episode count;
- `View on {{provider}}` (`provider_url`, opened outside the app);
- **Follow**. It becomes **Adding** on a `202` (a request), or **Following** with
  **Open show** on a `200`.

An Adding result reads its request live (`useFollowRequests`, `requestEnd` in
`find-shows-model.ts`):

- ended `done` with a show, it turns Following with Open show;
- ended `cancelled`, it shows **Cancelled** beside Follow again;
- ended otherwise, it shows **Couldn't add** beside Follow again;
- once a read list no longer holds the request (`requestEnd` answers `unknown`;
  the server lists a week's requests), the result offers Follow again alone.

The country is `deviceCountry()` (`discovery-country.ts`).

#### Feed address

**Feed address** (`follow-by-url.tsx`) has the address field with a hint, a
**Private feed** switch ("For a feed made just for you, like a paid or member
feed..."), and **Follow**.

- `feedAddressProblem` refuses an empty, non http(s) or over-2,048-byte address
  locally.
- A refusal from the server reads through `followByUrlErrorKey`.
- A `200` says `You follow {{title}}.` with Open show. When it was asked as private
  but the library already has the show as a public feed, it says `followingPublic`
  instead ("It was already in this library as a public feed, so it isn't
  private.").
- A `202` says the show appears in Shows once it's ready.

#### Follow requests

**Follow requests** (`follow-requests.tsx`) sit under Search and Feed address, as
"Shows being added". They list every open request, then the ten newest ended ones.
Each has:

- its redacted feed label;
- its state (`requestStateKey`): Waiting for its turn, Adding, Added, Couldn't add,
  or Cancelled;
- the Private feed badge;
- the reason for a failed one (`requestReasonKey`);
- Open show once done.

It polls through `useFollowRequests` only while one is open and the page is
focused.

#### Import a list

**Import a list** (`opml-import-panel.tsx`) starts with an intro and **Choose a
file**. `pickOpml` picks the file:

- `opml-pick.web.ts` is a hidden file input accepting
  `.opml,.xml,text/x-opml,text/xml,application/xml`. It resolves null on its
  `cancel` event.
- `opml-pick.ts` is expo-file-system's `File.pickFileAsync()` with no type filter,
  since OPML has no system type on iOS. It sends `file.bytes()`.

A file over 1 MiB, or one that can't be read, is a line of its own, and nothing is
sent.

Once a file is picked, the panel shows:

- the file name;
- the summary, `{{settled}} of {{total}} shows followed or being added`
  (`importProgress`). Duplicate and invalid rows don't count;
- the status line: a countdown to the next batch, ticking with `useNow` while the
  import runs. A `429` wait reads "Imports can run about once every 30 seconds.",
  and a `503` one "Your server is busy.";
- **Stop** while it runs;
- **Try again** once it stopped, stalled or failed, or ended `done` with
  `unavailable` rows (`canRetryImport`);
- one row per subscription, by `outline_index`.

**The rows.** Each row reads `Entry {{index}}` and a state (`importRowKey`):
Following, Already following, Being added, In the list twice, No usable feed
address, Waiting for the next batch, Can't be added right now, Couldn't add, or
Cancelled.

- The rows are read live against the follow requests (`liveImportRows`). A queued
  row whose request ended `done` reads Following, one that ended `cancelled` reads
  Cancelled, and otherwise it reads Couldn't add with the request's error.
- A Couldn't add row carries its reason (`importRowReasonKey`). That is the failed
  request's words when the requests list it, else the row's code. `recently_failed`
  reads "It couldn't be added a short while ago."
- A row that is Couldn't add or Cancelled, and whose address the file holds
  (`outlineFeeds`, `rowFeedUrl` in `opml-feeds.ts`), has its own **Try again**
  (`canRetryRow`, `retryRow`). That is a single follow by that address, which the
  server always tries again. Its answer stands over the waves' row
  (`withRetries`).
- A row's Private feed badge shows only when it has a usable feed (not `invalid` or
  `duplicate`, and `feed` set).
- A row with no label shows only its entry and status.

**A `done` import's line** is the first of these that applies:

1. "The last shows are still being added." while a row is still queued
   (`stillAdding`);
2. `{{count}} shows can't be added right now. Try again later, or ask the person who runs your server.`
   when `unavailable` rows remain (`unavailableRows`);
3. `doneFailed` ("Done. 3 shows couldn't be added. You can try each one again
   below.") when Couldn't add rows remain (`failedRows`);
4. "All done.".

### Entry points

**Shows mode** (`shows-mode.tsx`) puts `ShowsActions` (`shows-actions.tsx`) at the
end of the sub-nav row on tablet and desktop (`SubNavActions`, id `shows-actions`),
and above the grid on a phone. The actions are:

- **Add shows**, when access is `allowed`;
- the **More show actions** menu with **Export my shows** (`podcast_opml === true`,
  not the demo). Export works with the module off, so it isn't on the Find shows
  page.

`FollowRequestsNotice` beside them reads "Adding 2 shows" while this library's
requests are open, and opens the page.

A library with no shows gets an **Add shows** action in its empty state ("Search a
directory, paste a feed address or import a list from another app.") when access is
`allowed`.

**Export** (`opml-export.ts`, `useExportShows`) saves
`audiosilo-subscriptions.opml` through the Journal's `saveExport` (mime
`text/x-opml`, UTI `public.xml`). It then toasts `exportToast`'s counts: "Exported 3
shows", "1 private show left out. Private feeds are never exported.", and the shows
without a public address left out. A refusal is a toast by `exportErrorKey`.

### Check for new episodes

`CheckEpisodesButton` (`check-episodes-button.tsx`) sits in the show page's hero
beside Follow. It shows only for a followed show, and only when `useAddShowsAccess`
is `allowed`.

A `202` toasts "Checking for new episodes". 15 seconds later (`CHECK_REFRESH_MS`,
with the timer cleared on unmount) it invalidates the show list and the show's
episodes once. Refusals read through `checkErrorKey`, such as "Checked less than a
minute ago. Try again shortly." for `checked_recently`.

All copy for these screens is under `podcasts.find.*`, `podcasts.import.*`,
`podcasts.export.*`, `podcasts.check.*` and `podcasts.requests.*` in all six
locales. None of it says "Bridge" or shows the server's English.

## What episodes never do

- **Download** (decision 6.1). The downloads store refuses `book.episode` as
  `unsupported`. `DownloadControl` and the tile menu leave it out.
  `maybeAutoDownloadCurrent` and keep-ahead skip it. Keep-ahead tells a queued
  episode by its library, since the queue's list shape has no `episode`. See
  [Offline](offline.md).
- **Cast.** `NowPlaying.episode` hides the Cast button (`castButtonModel`), except
  while a session is already connected, so it can be stopped. Cast tokens never
  cover podcasts. An episode started while a book is cast is refused before a token
  is asked (`CastBlockedError` `episode`, toast `cast.blocked.titleEpisode`), and a
  server's `403 not_a_book` reads the same. See [Chromecast](chromecast.md).
- **Open the end credits.** `BookEndedListener` drops the episode from Up next.
  With auto-play on and not under the sleep timer, it starts Up next's head only
  (`resolveUpNext(..., {queueOnly: true})`), never a series or folder next.
  Otherwise playback stops, and a full player left open on it closes once the app is
  in the foreground. See [End of book](end-of-book.md).
- **Kids mode.** `kidsLibraries` drops podcast libraries from kids mode and its
  library picker. `kidsCollectionSections` leaves out any item of a podcast library
  (or with `episode`) in a shared collection (decision 6.2). A collection's items
  carry no `episode`, so collections mode waits for the library list. When the list
  can't be read, it falls back as an unreadable shelf does (downloads, else the
  error), on the kids screen and in the car.
- **Join Home's book shelves.** `bookRowTest(groups)` (`home-model.ts`) tells a
  progress row's kind by its library. Next in your series (and the `/next`
  questions behind it), the smart shelves and Recently finished hold books only. A
  server whose list is still loading counts as no books yet; one whose list failed
  counts as books.
  - It returns `{ isBook, pending }`. While a row's server is `pending`, the shelf
    it could fill keeps its place with a `ShelfSkeleton` instead of vanishing and
    coming back. For Next in your series that is only for a row whose server has
    `next_book`; for the smart shelves, only when the held rows could make one.
  - Episodes still never appear once the list is in.
  - The Now card, Continue listening and Favourites show episodes like books. New
    episodes is their own rail.

Listener copy never says "Bridge" and never shows the server's English. Refusals
read through `fetchReasonKey` and the follow error keys, in all six locales
(`locales.test.ts` checks every `podcasts.fetch.reason.*` key).

## Tests

`src/testing/podcast-fixtures/wire-2b.json` is the server's
`internal/podcast/testdata/phase2c2/wire-2b.json`, byte-identical.
`src/testing/podcast-fixtures.ts` holds show and episode fixtures.

- **`client.test.ts`** covers each method's request and the 503 decoding: header
  and body `Retry-After`, an HTML 503, and `fetch_limit`.
- **`episode-fetch.test.ts`** drives the controller on fake timers: ready, polling,
  failed with no POST, one POST on Try again, background pause, abort, profile
  switch and connection removal, `fetch_limit`, and `identity_changed`.
- **`start-book.test.ts`** and **`player-route.test.tsx`** cover the choke point.
- **`podcast-model.test.ts`**, **`library-modes.test.ts`** and
  **`new-episodes-model.test.ts`** cover the rules.
- Component tests cover the show page, rows, the panel and strip, the Library and
  Home.

### Finding shows tests

The server's goldens are copied byte-identical into
`src/testing/podcast-fixtures/phase2c3/` and read through
`src/testing/podcast-fixtures-2c3.ts`. The list and the SHA-256 check are in
[Player: discovery and OPML](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2).

- **`client.test.ts`** covers each new method's exact URL, body and headers, and
  the refusal codes through `apiErrorKind` (with `retryAfterSeconds` read and
  absent).
- **`hooks-podcasts.test.tsx`** covers the search and provider queries, the follow
  and check mutations' cache writes, and `useFollowRequests`' polling: only while
  open, stopping once all ended, and the show list read again at `done`.
- **`opml-waves.test.ts`** drives the wave controller on fake timers: the queue-cap
  shape to `done`, `Retry-After` honoured, stalled, `unavailable` with no loop, a
  failed private request queued again by the next wave, stop and dispose sending
  nothing more, polling stopping, and the background pause.
- **`use-opml-import.test.tsx`** covers its hook.
- **`find-shows-model.test.ts`**, **`podcast-requests.test.ts`** and
  **`paths.test.ts`** cover the rules.
- Component tests cover the page and its gating, the search and result rows, the
  artwork retry, the feed address, the follow requests, the import panel, the web
  picker, export, the Shows mode's actions and the check button.
