---
title: The end of a book
description: "Finishing a book: finishBook, BookEndedListener and the end credits, advanceTo and dropFromQueue, the up-next resolver (the queue, then the server's next book, then the folder), sibling resolution, and the automatic download of the book you start."
---

## Ending a book

When the last track finishes, the engine reports `ended`. The store
**deliberately keeps `nowPlaying` populated** rather than tearing down: the
`ended` snapshot is a signal that a UI-layer listener acts on. `selectIsEnded`
(`snapshot.state === 'ended'`) exposes it. The final `haltAndPersist` on that
transition records `finished: true`.

The exception is the end of a download that lacks the book's last file, played with
no server to stream it from: that `ended` is a pause, never a finish, and the end
credits' Play never finishes it (`selectEndsPartial`). See
[A download that ends early](offline.md#a-download-that-ends-early).

Five pieces then take over:

| Piece | Role |
|---|---|
| [`finishBook()`](#finishbook) (`store.ts`) | The one "this book is done" action. |
| [`BookEndedListener`](#bookendedlistener) | Notices the end, finishes the book, and either opens the credits or starts the next book. |
| [`end-of-book.ts`](#moving-on-end-of-bookts) | Moving on: `advanceTo`, `dropFromQueue` and `useAutoPlayHold`. |
| [`/finished`](#the-end-credits-finished) | The end-credits screen, with its countdown and Play now. |
| [`resolveUpNext`](#what-plays-next-up-next-resolverts) | Decides which book plays next. |

### Podcast episodes

A podcast episode (`FinishedBook.episode`) never opens the end credits.
`BookEndedListener`'s `endEpisode` drops it from Up next. Then, with auto-play on
and the sleep timer not running, it starts Up next's head only
(`resolveUpNext(..., {queueOnly: true})`). Otherwise playback stops, and a full
player left open on the episode closes once the app is active. See
[Podcasts](podcasts.md#what-episodes-never-do).

### `finishBook()`

`finishBook()` (`store.ts`) is the single "this book is done" action. Both the
natural end and the player's *Mark as Finished* menu item use it. It:

1. captures a `FinishedBook` identity: the book's connection, library, path,
   title, author and cover;
2. clears playback intent and stops the save loop;
3. does one forced `persist({ forceFinished: true })`. This is the last write,
   and the server is last-write-wins;
4. invalidates the connection's `allProgress` query;
5. **nulls `nowPlaying`**, which hides the mini player, and resets the snapshot.

Then, best-effort and async, it tears the engine down. **Only if
`autoDeleteFinished` is on and the book's download `status === 'downloaded'`**,
it also removes the local files through the downloads store.

### `BookEndedListener`

`BookEndedListener` (`src/components/player/book-ended-listener.tsx`) is a
headless component mounted once at the root (`RootListeners`,
`root-services-impl.tsx`). On the web it mounts once the first screen has
painted. Because it sits at the root, it covers the phone modal and the desktop
docked player alike.

It watches `selectIsEnded` with **transition-edge detection**: a `wasEnded` ref
makes it fire once per ended book. On the edge from not ended to ended, it
records whether a sleep timer was running for the book (`useAutoPlayHold`, see
[Moving on](#moving-on-end-of-bookts)), then calls `finishBook()`. What it does
next depends on where the app is:

- **The credits are already open** (`/finished`, opened early from the menu).
  The listener only drops the finished book from Up next. The credits' own
  countdown and Play now take over, in the background too.
- **In the foreground**, the listener navigates to `finishedHref(…, true)`
  (`/finished?…&auto=1`). It uses `router.replace` when the app is on `/player`,
  so the credits take the player's place, and `router.push` otherwise.
- **In the background, it never navigates.** `/player` and `/finished` are root
  `fullScreenModal`s, and iOS cannot present one from the background; a book
  that ended while the phone was locked came back to a black screen. Instead the
  listener drops the finished book from Up next at once. Then:
  - with `autoPlayNext` on and no sleep-timer hold, it resolves the next book
    (`resolveUpNext`) and starts it **in place** (`advanceTo`), so the mini
    player or the dock shows it on return;
  - otherwise the credits open once the app is active (`whenActive`,
    `src/lib/when-active.ts`), unless another book is loaded by then.

### Moving on (`end-of-book.ts`)

`end-of-book.ts` holds the moving-on logic. It is framework-free, because the
end of a book can run with no screen mounted. It has three parts.

**`advanceTo(next)`** starts the next book through `startBookInPlace`, then takes
the book's queue entry off Up next.

- `startBookInPlace` (`start-book.ts`) loads the item and chapters through the
  query cache, then calls `playBook`. For a downloaded book it asks the server
  first, for up to `FRESH_SOURCE_WAIT_MS` (3 s), and otherwise uses the
  download's own copy. So the book starts offline and from the car. With nothing
  to ask (no network on the device, `isDeviceOnline`, or its server marked
  unreachable, `isReachable`) it uses that copy at once, with no wait.
- `startBookInPlace` is the one way a book starts outside the player route. The
  `/player` route only *shows* a book started that way.
- An episode its server still has to fetch is the exception to the queue drop.
  `advanceTo` hands it to the fetch (`useEpisodeFetch`'s `pending`), and it stays
  at the head of Up next until the fetch's own start drops it. A failed or
  cancelled fetch leaves it there.

**`dropFromQueue(connectionId, books)`** removes books from one connection's
queue (see [Leaving the queue](#leaving-the-queue)).

**`useAutoPlayHold`** holds the `contentKey` of a book that ended while a sleep
timer was running for it. The listener asked the timer to end the night there.
So the background start is skipped, and the credits hold their countdown. Play
now still plays.

### The end credits (`/finished`)

`/finished` (`src/app/finished.tsx`) is a root modal, a sibling of the player
modal. It sits outside any route scope, so it carries `connection`, `libraryId`
and `path` params. It renders `EndCredits`.

**Ended or still playing.** `auto=1` (the natural end, or *Mark as Finished*)
becomes `ended`: the book is finished. Whether the book is **still playing**
(the credits opened early from the menu) comes from the live player store, not
the URL. The book counts as still playing when it is loaded and not in `ended`.
That covers a paused or errored book too, so a lock-screen pause can't read as
"over" and auto-advance mid-listen.

**Play now and the countdown** share one `playNext`:

1. A book that has really ended is finished first, and leaves Up next. It has
   really ended when the credits opened with `ended`, when it is in the `ended`
   state, or when it is within `FINISHED_TOLERANCE` of its end.
2. A book still mid-way is only `stop()`ped. Its place is saved, and it stays
   unfinished, in Up next, with its download.
3. Then `playNext` calls `advanceTo(next)`.
   - On success, the player replaces the credits once the app is active
     (`navigateWhenActive`). It does not navigate at all if the credits were
     closed meanwhile.
   - On failure, the countdown stops and a toast says "Couldn't start
     Oathbringer. Try again." (`playFailedToast`, see
     [the player store](playback.md#the-player-store-storets)).

Play now shows busy while the book starts. The countdown counts only the time
its ticks saw, so a suspended app doesn't wake to a countdown that already ran
out. The still-playing countdown runs at the playing speed. View details opens
the book in the shell underneath (`pushInShell`).

**`end-credits-logic.ts`** is the pure part:

- `endCreditsDecision`: with `autoPlayNext` on and a next book resolved, it
  counts down `GRACE_SECONDS` (15) after a real end, or the remaining audio while
  the book still plays. It reports `fireNext` only after a genuine end.
- `listeningSummary`: wall-clock time listened and local days, from
  `client.history(…, HISTORY_LIMIT)`. The limit is 500, the most the server
  returns, and the summary is `partial` when that many came back.
- `yearShelf`: this year's other finished books from `/me/stats?range=year`,
  and which book of the year this one is. The stats may not count it yet.
- `nextAvailability`: downloaded, downloading or stream.
- `upNextReason`: the card's eyebrow.
- `spinesThatFit`.

**`end-credits.tsx` and `end-credits-parts.tsx`** render the credits:

- the year shelf, or else the cover;
- the title and byline;
- the stat tiles;
- a `RatingStars` radio group (capability `ratings`). Its PUT carries the saved
  note, so rating doesn't clear the note;
- the `UpNextCard`: Play now, Not now and the countdown ring;
- `EndOfSeries`: an unplaced community work as a `GhostCover`, never played;
- the `CreditsDialog`. The community credit is the server's and is never composed
  here. `/meta` is fetched only once the dialog opens.

Every hook runs against the book's own server (`ConnectionScope`).

## What plays next (`up-next-resolver.ts`)

`resolveUpNext(sources, finished)` is the **one** answer to "what plays after this
book". The credits' Play now and countdown use it, and so does the background
auto-play in `BookEndedListener`.

It is framework-free and must not import the playback store. The server reads are
injected as `UpNextSources`. `up-next-sources.ts` builds the real ones over the
shared query cache, and reads the queue fresh, since another device may have
changed it. So every rule is tested without a server.

It tries these in order:

1. **The head of the finished book's server's Up next queue** (capability
   `queue`). `pickQueueHead` skips:
   - the finished book itself (`entryHolds`: an entry may be the book folder
     above a part path);
   - entries the server could not index (no `book`);
   - books already finished (from `allProgress`).
2. **Else the server's answer**, `GET /libraries/{id}/next` (capability
   `next_book`). The server follows community order, then series, then folder,
   across every series the book is in (its main series first, then its other
   series). Its "nothing follows" stands. A community work it could not place
   (`work` without `local`) is never played. The resolver only reports it as
   `unplaced`, so the credits can show it as a ghost.
3. **Else the folder's next sibling** (`resolveNextBook`, see
   [Sibling resolution](#sibling-resolution-next-bookts)). This applies on a
   server without `next_book`, or when asking it failed.

It never rejects: a source that fails is skipped. It resolves an `UpNextAnswer`,
`{ next, unplaced? }`:

- `next` is an `UpNextBook`, or `null` when nothing follows. It carries its
  `source` (`queue | series | folder`) and its own `libraryId`, because a
  community answer can be in another library. For a queue head it also carries
  the `queueEntry` by its stored path.
- `unplaced` is the community work the server could not place.

**Keep-ahead plans in nearly the same order**: the queue, then the `next_book`
chain, else the folder. So the book kept ready is usually the book that plays.
Keep-ahead differs in two ways: it skips finished series books too, and it plans
nothing when `/next` fails (see
[Offline](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts)).

### Leaving the queue

**`dropFromQueue(connectionId, books)`** (`queue-drop.ts`, framework-free) takes
books off Up next. It acts only on a server the cache knows has `queue`.

- It looks the books up in that connection's queue and removes each by the
  stored entry's own path.
- It takes a removed entry out of the cached queue at once. So a second call for
  the same book sends nothing. That happens, for example, when the credits open
  on return after the end of the book already dropped it.
- It sends one remove even when two callers drop the same entry at once, such as
  a start in place and the end of a book.
- It is quiet. Housekeeping never toasts and never reaches the reachability
  tracker.
- A queue read within the last `QUEUE_DROP_FRESH_MS` (five minutes) answers as it
  is, and is kept that long even with Up next closed. So starts in a row read
  `/queue` at most once a window. An older read is read again, so a book queued
  on another device meanwhile still leaves.

**The finished book always leaves Up next where it is finished**, whether or not
the next one starts. That is when the credits open with `ended`, on a Play now
within the end tolerance, and in `BookEndedListener` in the background or with
the credits already open. The queue entry that plays leaves inside `advanceTo`,
only once it has started.

**Any start leaves Up next too.** `startBookInPlace` (a book's page, a browse
row, the car), the `/player` route's auto-start and Up next's Play now all call
`dropStartedBook` (`drop-started.ts`).

- It drops the book only once it is the book loaded and not in error. So a start
  that failed, or that another start took over, keeps its place in the queue.
- It also drops the path the start was asked for when that differs from the
  loaded book's `rel_path`. That is a queue entry the server now resolves to the
  book folder above it. So the entry doesn't stay queued after it started.

### Fail-fast reads

The resolver's reads go through `fetchFailFast` (`api/hooks.ts`): the
capability read, the queue, the finished set and `/next` (all in
`up-next-sources.ts`). TanStack holds a default fetch while
[the online flag](state-and-data.md#the-online-flag-srclibdevice-onlinets) says the
device has no network, and waits to retry until a hidden tab is focused. So a
background tab's end-of-book chain used to wait silently.

The start reads the same way: `startBookInPlace`'s item and chapters come through
`fetchBookSource` (`src/playback/book-source.ts`). Only `dropFromQueue`'s queue
read is still an ordinary `fetchQuery`.

`fetchFailFast` asks with `networkMode: 'always'` and never retries. It first
cancels a paused fetch that a mounted hook holds for the same key.
`fetchCapabilities` reads the `/server` flags the same way, with the cached flags
as the fallback.

## Sibling resolution (`next-book.ts`)

Sibling resolution is the folder fallback. `resolveNextBook` browses the parent
folder through `client.browse`, paging to exhaustion (`PAGE_LIMIT` 200).
`findNextSibling` takes the books and folders whose names sort strictly after the
current leaf (with `naturalCompare`), and returns the first **book** among them.
A book is either:

- one the index holds (`is_book`); or
- a folder no scan has reached that the server would read as a book
  (`pending_book`). The book screen and the player read it on demand.

Any other bare folder (`is_dir: true, is_book: false`) is offered only when
nothing in the folder, the current book included, is a book either way.
Otherwise the answer is `null`. Loose files that are not books are never offered.

```ts
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
```

The sort is **client-side and numeric-aware**, so `Book 2` precedes `Book 10`. An
older server lists `/fs` by lowercased name, character by character; a newer one
lists in natural order already. The sort never throws, and any failure resolves
to `null`.

The server's
[`GET /libraries/{id}/next`](../server/api/reference.md#get-apiv1librariesidnext)
ends in the same rule. `library.NextSibling` is a port of `findNextSibling` that
compares names as this `localeCompare` does. So a book that neither the community
order nor its series numbering places gets the same folder answer with or without
`next_book`.

## Auto-download on play

`maybeAutoDownloadCurrent(connectionId, libraryId, book, chapterData?)` in
`store.ts` downloads **the book the user just started listening to**. `playBook`
fires it at the end of its start path, after `svc.play()`, and never awaits it.
So it can neither delay nor break starting the book.

The store hot-swaps playback onto the local files the moment a download completes
(`switchCurrentBookToLocal`, see [Offline](offline.md)). So downloading on start
also covers a series: the next book downloads as soon as it starts.

### The guards

The guards run in this order:

1. A podcast episode skips unless `autoDownloadEpisodes` is on ("Download podcast
   episodes when you start them", default off). An episode its server doesn't have
   yet waits for the server to fetch it
   ([Offline](offline.md#an-episode-not-on-its-server-yet)).
2. `autoDownloadNext === 'never'` skips.
3. An existing download entry whose `status` isn't `error` skips: the book is
   already downloaded, queued or downloading. Only an errored entry is retried,
   which matches the downloads store's own guard.
4. The network policy `canAutoDownload(mode)` must allow it.
5. Then it asks `download(..., 'auto')`.

The automatic rules it must agree on with
[keep-ahead](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts)
live in **one choke point**, the downloads store's `download()`. It applies them
to the `auto` and `keep-ahead` origins and resolves a `DownloadOutcome` (see
[Offline](offline.md)). The rules are:

- skip a book the listener cancelled or removed this session (`isDeclined`);
- never eat into the reserve (`roomLeft`).

Asking as `auto` matters. The default `listener` origin would lift the declined
mark, as if the listener had asked. `download()` also refuses an engine that
can't store offline and a book that streams transcoded on the web, so no extra
guard is needed here.

### The network policy

The policy gate is `canAutoDownload(mode)` in `src/lib/network.ts`, backed by
**`expo-network`**:

- `never` returns false;
- `always` returns true;
- `wifi` allows the web (the browser can't report the connection type) and
  native `WIFI` or `ETHERNET`. It **fails open** on an `UNKNOWN` or undefined
  type or a probe error, so it skips only a connection positively known to be
  metered.

### The settings

The three settings live in `src/stores/settings.ts`:

| Setting | Default |
|---|---|
| `autoPlayNext` | `false` |
| `autoDownloadNext` | `defaultAutoDownload()` |
| `autoDeleteFinished` | `true` |

The persisted `autoDownloadNext` key name predates the download-on-start
behaviour and is kept for hydration compatibility.

`defaultAutoDownload()` is `'wifi'` on native and `'never'` on the web. The
browser can't report the connection type, so `wifi` there behaved like `always`
and downloaded every book started in a browser. A web document saved before that
change (settings version 0) whose `autoDownloadNext` is `'wifi'` is read as
`'never'`, unless its `keepAhead` is above 0. A `keepAhead` above 0 is an opt-in
to automatic downloads that `'never'` would silently stop. See
[Settings](state-and-data.md#settings-srcstoressettingsts) for the version and
`migrateSettings`.
