---
title: Podcasts
description: "The player's podcast views (Bridge Phase 2d-1): who sees them, the Shows library mode, the show and episode pages, Follow, Home's New episodes, the episode-fetch controller that plays an episode not on the server yet, and what episodes never do."
---

## Scope

Bridge Phase 2d-1 shows a server's podcast libraries in the player. The server
lists a podcast library (`Library.kind === 'podcasts'`) only to a client that
passes its [podcast gate](../server/auth-and-security.md#podcast-visibility):
the player from **2.2.0** (`app.json` `expo.version`, sent as
`X-AudioSilo-Client: AudioSilo/2.2.0 (<os>)` by `src/lib/client-id.ts`), the
admin console and `AudioSilo/dev`. 2.1.x and older builds see no podcasts.

The served `/web` export sends the same header same-origin. The cross-origin
dev loop (`npm run web` on `:8081`) sends no header, so it shows no podcasts
unless a development build opts in with `EXPO_PUBLIC_IDENTIFY_CROSS_ORIGIN=1`
(`identifiesCrossOrigin` in `client-id.ts`, never true in a production build).

The wire mirror (types, client methods, `PodcastFetchPendingError`, hooks and
query keys) is documented once, with the server protocol it follows, in
[Bridge podcasts: Player (Phase 2d-1)](../bridge/podcasts.md#player-phase-2d-1).
This page covers the screens and the controller. The code is in
`src/components/podcasts/`, `src/playback/episode-fetch.ts`,
`src/components/home/{new-episodes-model,use-new-episodes,new-episodes-rail}.ts*`
and `src/lib/library-kind.ts`. Discovery, follow by URL and OPML are
[Phase 2d-2](../bridge/podcasts.md#player-handoff-discovery-and-opml-phase-2d-2-not-implemented)
and not in the player.

## Telling an episode from a book

An episode is an ordinary item: it lives at `/book`, plays through the normal
start, and keeps progress, bookmarks and Up next entries like a book. Only
`GET /item` sends `Book.episode` (`PodcastEpisodeInfo`); the list shapes (Up
next, Continue listening, history) leave it out. A framework-free reader tells
an episode by its library instead: `isPodcastLibrary(l)` (`library-kind.ts`;
an absent or unknown `kind` is books), `cachedPodcastLibrary(cid, libraryId)`
over the cached library list, `podcastLibraryIds(libraries)` (a set of ids
for a whole list), and the `useIsPodcastLibrary` hook.
`episodeAsBook(ep, show)` (`podcast-model.ts`) turns an episode row into the
`Book` a start, the action menu and the fetch take.

## Reads are core, writes are the module's

- Shows, episodes and `/me/podcasts` are core reads, never gated on a
  capability flag. They are asked only for a library of the podcasts kind
  (`usePodcastShows(..., {enabled})`), so a books library never asks.
- Follow and Unfollow are `useCapabilityMutation('podcasts', ...)`: the
  module's flag, true only with the toggle on **and** its Bridge online.
  `FollowButton` (`follow-button.tsx`) is interactive only then, and only for
  a listener who may follow (not `isKidAccount(user)`, not `user.is_demo`).
  Otherwise a followed show shows a read-only **Following** badge and others
  show nothing. Unfollowing a private show opens a `ConfirmDialog` first,
  since the show leaves the listener's lists. Errors become toasts by
  `apiErrorKind` (`module_off`, `kid_account`, `demo_account`,
  `show_not_found`, which also refetches the shows), never the server's text.
- The fetch status is `podcast_fetch`'s (`usePodcastFetchStatus`).

## Surfaces

### The Shows library mode

`library-modes.ts` adds the mode `shows`. A podcast library offers
`['shows', 'folders']` only (`availableLibraryModes(caps, podcasts)`); a books
library never offers Shows. `resolveLibraryMode` maps any book mode to `shows`
on a podcast library (so a `?mode=authors` link lands on Shows) and `shows` to
`books` on a books library. `library-screen.tsx` reads the selected library's
kind and passes no connection to `useModeCounts`'s author, narrator and series
hooks there, so those book-only routes are never asked; the count is the
number of shows. `library-picker.tsx` puts a `microphone` icon beside a
podcast library.

`PodcastShowsMode` (`shows-mode.tsx`) is an All / Following chip row with
counts over a cover grid of `ShowTile`s (`show-tile.tsx`: `BookCover` on the
show's path with `cover_version`, the title, then `New episode {{when}}` when
`latest_published` is in the last 14 days, else the author, and a "Private
feed" badge). It is not `CoverTile`: a show has no book actions or progress.
Pressing a tile pushes `podcastShowHref`.

### The show page

Route `src/app/(app)/(home,library,search,offline,me)/podcast.tsx`, URL
`/podcast?connection=&library=&show=<path>[&order=newest|oldest]`
(`podcastShowHref`, `parsePodcastParams` in `src/lib/paths.ts`; `/podcast` is
in `BROWSE_PATHS`). `PodcastShowScreen` (`podcast-show-screen.tsx`) names the
browser tab and renders:

- the hero: cover, title, author, a collapsible description, the episode
  count, the Private feed badge, `FollowButton`, and "Last check failed" when
  `status.error` is set (no codes for listeners);
- the order control: `defaultEpisodeOrder(show)` is `oldest` for a `serial`
  show and `newest` otherwise; the segmented control writes `?order=`. The
  client never re-sorts: the server orders by published, then path;
- `EpisodeList`, a FlashList over `usePodcastEpisodes` pages.
  `visibleEpisodes` drops `removed && !downloaded` (a removed episode whose
  file is kept stays, marked "No longer in the feed").

`EpisodeRow` (`episode-row.tsx`) shows the title, a meta line
(`episodeMetaLine`: date, duration when `duration_source !== 'none'`,
`episodeLabel`'s `S2 E5` / `E5`), Trailer / Bonus / Explicit marks, progress or
Finished, and the state line from `episodeRowState(ep, pending, canFetch)`:
Ready on your server, Plays on demand, Getting it (with a percentage when the
size is known), Couldn't get it, Not available now. The two stopped states
carry the server's `code`, and `rowStateReasonKey(state)` turns it into the
reason line under them (`fetchReasonKey`; a server without `podcast_fetch`
reads as `bridge_unavailable`, "Your server can't download episodes right
now."). The player's own fetch of that episode (`pending`) wins over the
list's batched `fetch`. The one button
is Play (Resume once started) through `usePlayBook`, or Try again after a
failure (`requestEpisodeFetch(..., {retry: true})`). Its menu is
`BookActionsButton` with Add to Up next and Mark as finished, never Download.
Tapping the row opens `bookHref`.

### The episode page

`book-page.tsx` renders `EpisodePage` (`episode-page.tsx`) for an item with
`book.episode` (or, before the item arrives, any item of a podcast library).
It has a hero with cover, title, a link to the show, date, duration and marks;
the primary Resume / Play / Try again; the description; the chapters through
`BookChaptersTab` (whose `id3_chap` caption reads "Chapters from the episode
file"); and `usePodcastFetchStatus` while the episode is not downloaded. A
stopped state's reason (`rowStateReasonKey`) sits beside the disabled primary
button. When
`timeline_changed === true` and the listener has a position, a Notice says the
audio changed and the place is kept: nothing is rescaled. There is no Generate,
community metadata, rating, series or Download, and the player's companion
chips and tabs are off for an episode (`useCompanionData` reads `book.episode`
as `off`).

### Wording in the player and on Home

The full player's progress reads `player.full.percentOfEpisode`
(`{{percent}}% of the episode`) for an episode, and the Now card `home.now.throughEpisode`
("through the episode", with `scaleLabelEpisode` for its scale). The Now card
skips the "Chapter 1 of 1" line for an episode with no chapters.

### Home's New episodes

`use-new-episodes.ts` reads `myPodcastsQuery` on each connection that lists a
podcast library, takes the followed shows that published in the last 14 days
(`recentShows`: at most `NEW_SHOWS` = 8, newest first), and asks each for its
newest `NEW_EPISODES_PER_SHOW` = 5 episodes (`latestEpisodesQuery`, five
minutes fresh). `newEpisodes` (`new-episodes-model.ts`) keeps those published
in the last `NEW_EPISODE_DAYS` = 14 days, drops removed episodes, trailers and
any started or finished (`skip`, Home's `skipNext`: Continue listening has the
started ones), sorts newest first then by
key and caps the shelf. `NewEpisodesRail` sits after "Next in your series":
title "New episodes", sub "From shows you follow", action "All shows" (selects
that server's podcast library, then opens `/library?mode=shows`), and
`CoverTile`s captioned `{{show}} · {{when}}`. It renders nothing when empty.
Podcasts stay off the book shelves (a server rule).

## The episode-fetch controller

`src/playback/episode-fetch.ts` is a framework-free zustand store
(`useEpisodeFetch`, one `pending` fetch: key, target, title, show, start
options, `phase`, `status`, `code`) plus functions. The player's internals
never see a fetch: they get an ordinary start at the end.

**One choke point.** `startBookInPlace` (`start-book.ts`) and the player
route's auto-start (`src/app/player.tsx`) hand an episode that needs a fetch
(`needsEpisodeFetch(book, podcastFetch)`: an episode that is not
`downloaded`, on a server whose `podcast_fetch` is true) to
`requestEpisodeFetch`, never to `playBook`. A local (downloaded) source never
does. Any other start ends a fetch in flight first
(`cancelEpisodeFetchUnless`: the last tap wins), and a start that plays the
episode itself ends a fetch of it still on its way (`cancelEpisodeFetchOf`).
A start overtaken while it looked its episode up hands nothing on
(`isLatestStart`). Tapping the same episode again joins the fetch, taking the
newer start options.

**Phases.** `probing` (the stream is being asked), `waiting` (queued or on its
way), `failed`, `unavailable`, `refused` (`409 fetch_limit`) and `starting`.
The wire rules (probe once, poll every `max(2, Retry-After)` seconds, pause in
the background, never POST by itself, abort without a server cancel, refresh
at ready) are in [Bridge podcasts](../bridge/podcasts.md#player-phase-2d-1).
Try again is `retryEpisodeFetch()` (the panel and strip) or
`requestEpisodeFetch(target, book, {}, {retry: true})` (a row, the episode
page): both POST once, then follow the same handling.

**At ready** the controller reads the item and chapters again, marks the
show's episode lists stale, then calls
`startBookInPlace(target, opts, {fetched: true})`. A `fetched` start never goes back to the controller, and it
plays only while the fetch is still `starting` (`isEpisodeFetchStarting`), so a
Cancel or another start since then wins. A start that fails stops as `failed`.

**UI.**

- `EpisodeFetchPanel` takes the full player's place while `pending.key` is
  the route's episode (the route never calls `playBook` then): cover, title,
  show, the heading "Getting this episode" (once stopped, "Couldn't get this
  episode" or "This episode can't be fetched now"), one line under it (the
  body while probing, "Waiting for its turn" while queued, the progress
  `{{received}} of {{total}}` or `{{received}} so far` with `formatBytes`
  while fetching, the reason once stopped) with a bar, Cancel, and Try again
  only when stopped. Reasons read through `fetchReasonKey(code)` with a
  generic fallback.
- `EpisodeFetchStrip` is the compact form, in `DockedPlayer` (wide) and
  `MiniPlayer` (phone, player closed). While another book plays it sits above
  that book's controls, which keep playing until the episode replaces it at
  ready (decision 6.4). The iOS 26 `AccessoryPlayer` has no strip yet.
- A start long after the tap may be refused by a browser's autoplay rule:
  that is the existing "refusal is a pause" path, and the episode loads
  paused.

## What episodes never do

- **Download** (decision 6.1). The downloads store refuses `book.episode` as
  `unsupported`; `DownloadControl` and the tile menu leave it out;
  `maybeAutoDownloadCurrent` and keep-ahead skip it (keep-ahead tells a queued
  episode by its library, since the queue's list shape has no `episode`). See
  [Offline](offline.md).
- **Cast.** `NowPlaying.episode` hides the Cast button
  (`castButtonModel`), except while a session is already connected, so it can
  be stopped. Cast tokens never cover podcasts. See
  [Chromecast](chromecast.md).
- **Open the end credits.** `BookEndedListener` drops the episode from Up
  next and, with auto-play on and not under the sleep timer, starts Up next's
  head only (`resolveUpNext(..., {queueOnly: true})`), never a series or
  folder next; otherwise playback stops and a full player left open on it
  closes once the app is in the foreground. See [End of book](end-of-book.md).
- **Kids mode.** `kidsLibraries` drops podcast libraries from kids mode and
  its library picker, and `kidsCollectionSections` leaves out any item of a
  podcast library (or with `episode`) in a shared collection (decision 6.2).
  Since a collection's items carry no `episode`, collections mode waits for
  the library list and, when it can't be read, falls back as an unreadable
  shelf does (downloads, else the error), on the kids screen and in the car.
- **Join Home's book shelves.** `bookRowTest(groups)` (`home-model.ts`) tells
  a progress row's kind by its library: Next in your series (and the `/next`
  questions behind it), the smart shelves and Recently finished hold books
  only, and a server whose list is still loading counts as no books yet (one
  whose list failed counts as books). The Now card, Continue listening and
  Favourites show episodes like books; New episodes is their own rail.

Listener copy never says "Bridge" and never shows the server's English:
refusals read through `fetchReasonKey` and the follow error keys, in all six
locales (`locales.test.ts` checks every `podcasts.fetch.reason.*` key).

## Tests

`src/testing/podcast-fixtures/wire-2b.json` is the server's
`internal/podcast/testdata/phase2c2/wire-2b.json`, byte-identical;
`src/testing/podcast-fixtures.ts` holds show and episode fixtures.
`client.test.ts` covers each method's request and the 503 decoding (header and
body `Retry-After`, an HTML 503, `fetch_limit`); `episode-fetch.test.ts`
drives the controller on fake timers (ready, polling, failed with no POST, one
POST on Try again, background pause, abort, profile switch and connection
removal, `fetch_limit`, `identity_changed`); `start-book.test.ts` and
`player-route.test.tsx` cover the choke point; `podcast-model.test.ts`,
`library-modes.test.ts` and `new-episodes-model.test.ts` the rules; component
tests cover the show page, rows, the panel and strip, the Library and Home.
