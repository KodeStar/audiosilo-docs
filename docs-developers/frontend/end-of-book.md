---
title: The end of a book
description: "Finishing a book: BookEndedListener and the end credits, advanceTo and dropFromQueue, the up-next resolver (the queue, then the server's next book, then the folder), sibling resolution, and the automatic download of the book you start."
---

## Ending a book

When the last track finishes the engine reports `ended`, and the store
**deliberately keeps `nowPlaying` populated** rather than tearing down - the
`ended` snapshot is a signal a UI-layer listener acts on. `selectIsEnded`
(`snapshot.state === 'ended'`) exposes it; the final `haltAndPersist` on that
transition records `finished: true`.

- **`finishBook()` (`store.ts`)** is the single "this book is done" action, used
  both by the natural end and the player's *Mark as Finished* menu item. It
  captures a `FinishedBook` identity (connection/library/path/title/author/cover),
  clears playback intent, stops the save loop, does one forced
  `persist({ forceFinished: true })` (the last write; the server is
  last-write-wins), invalidates the connection's `allProgress` query, then
  **nulls `nowPlaying`** (which hides the mini-player) and resets the snapshot.
  Best-effort and async, it tears the engine down and - **only if
  `autoDeleteFinished` is on and the book's download `status === 'downloaded'`** -
  removes the local files via the downloads store.
- **`BookEndedListener` (`src/components/player/book-ended-listener.tsx`)** is a
  headless component mounted once in `src/app/_layout.tsx`, so it covers the phone
  modal and the desktop docked player alike. It watches `selectIsEnded` with
  **transition-edge detection** (a `wasEnded` ref, fires once per ended book) and
  on the false→true edge records whether a sleep timer was running for the book
  (`useAutoPlayHold`, below), calls `finishBook()` and, in the foreground, navigates
  to `finishedHref(…, true)` (`/finished?…&auto=1`): `router.replace` when currently
  on `/player` (credits take the player's place), else `router.push`. In the
  **background it never navigates**: `/player` and `/finished` are root
  `fullScreenModal`s and iOS cannot present one from the background (a book that
  ended locked came back to a black screen). It drops the finished book from Up next
  at once and, with `autoPlayNext` on and no sleep-timer hold, resolves the next
  book (`resolveUpNext`) and starts it **in place** (`advanceTo`), so the mini player
  or dock shows it on return; otherwise the credits open once the app is active
  (`whenActive`, `src/lib/when-active.ts`), unless something else is playing by
  then.
- **`end-of-book.ts`** holds the moving-on, framework-free (the end of a book can
  run with no screen mounted): `advanceTo(next)` starts the next book through
  `startBookInPlace` (`start-book.ts`: item and chapters through the query cache,
  then `playBook` - the one way a book starts outside the player route; the
  `/player` route only *shows* a book started that way) and then takes its queue
  entry off Up next; `dropFromQueue(connectionId, books)` removes books from one
  connection's queue (below); `useAutoPlayHold` holds the `contentKey` of a book
  that ended while a sleep timer was running for it - the listener asked the timer
  to end the night there, so the background start is skipped and the credits hold
  their countdown (Play now still plays).
- **`/finished` (`src/app/finished.tsx`)** is a root modal, a sibling of the
  player modal, that carries `connection`/`libraryId`/`path` params (it sits
  outside any route scope) and renders `EndCredits`. `auto=1` (the natural end, or
  *Mark as Finished*) becomes `ended`: the book is finished. Whether the book is
  **still playing** (the credits opened early from the menu) is derived from the
  live player store, not the URL: loaded and not in `ended`, which covers a paused
  or errored book too, so a lock-screen pause can't read as "over" and auto-advance
  mid-listen. Play now and the countdown share one `playNext`: an early-opened book
  is finished first (and leaves Up next), then `advanceTo(next)`; on success the
  player replaces the credits once the app is active (`navigateWhenActive`, and not
  at all if the credits were closed meanwhile), on failure the countdown stops and a
  toast says "Couldn't start Oathbringer. Try again." Play now shows busy while the book
  starts. The countdown counts only the time its ticks saw, so a suspended app
  doesn't wake to a countdown that already ran out, and the still-playing countdown
  runs at the playing speed. View details opens the book in the shell underneath
  (`pushInShell`).
- **`end-credits-logic.ts`** is the pure part: `endCreditsDecision` - with
  `autoPlayNext` on and a next book resolved, count down `GRACE_SECONDS` (15) after
  a real end, or the remaining audio while the book still plays, and only report
  `fireNext` after a genuine end; `listeningSummary` (wall-clock time listened and
  local days, from `client.history(…, HISTORY_LIMIT)`, 500, the server's cap, with
  `partial` when that many came back); `yearShelf` (this year's other finished books
  from `/me/stats?range=year`, and which book of the year this one is - the stats
  may not count it yet); `nextAvailability` (downloaded / downloading / stream);
  `upNextReason` (the card's eyebrow); `spinesThatFit`.
- **`end-credits.tsx` + `end-credits-parts.tsx`** render it: the year shelf (else the
  cover), title and byline, the stat tiles, a `RatingStars` radio group (capability
  `ratings`; a PUT carries the saved note so rating doesn't clear it), the
  `UpNextCard` (Play now, Not now, the countdown ring), `EndOfSeries` (an unplaced
  community work as a `GhostCover`, never played) and the `CreditsDialog` (the
  community credit is the server's, never composed here; `/meta` is fetched only
  once the dialog opens). Every hook runs against the book's own server
  (`ConnectionScope`).

### What plays next (`up-next-resolver.ts`)

`resolveUpNext(sources, finished)` is the **one** answer to "what plays after this
book", shared by the credits' Play now and countdown and by the background
auto-play in `BookEndedListener`. It is framework-free and must not import the
playback store; the server reads are injected as `UpNextSources`
(`up-next-sources.ts` builds the real ones over the shared query cache, reading the
queue fresh since another device may have changed it), so every rule is tested
without a server. In order:

1. **The head of the finished book's server's Up next queue** (capability `queue`):
   `pickQueueHead` skips the finished book itself (`entryHolds`: an entry may be the
   book folder above a part path), entries the server could not index (no `book`)
   and books already finished (from `allProgress`).
2. **Else the server's answer**, `GET /libraries/{id}/next` (capability
   `next_book`): community order, then series, then folder. Its "nothing follows"
   stands. A community work it could not place (`work` without `local`) is never
   played, only reported as `unplaced` so the credits can show it as a ghost.
3. **Else the folder's next sibling** (`resolveNextBook`, below) - on a server
   without `next_book`, or when asking it failed.

It never rejects: a source that fails is skipped. The result is an `UpNextBook`
with its `source` (`queue | series | folder`), its own `libraryId` (a community
answer can be in another library), and, for a queue head, the `queueEntry` by its
stored path. **Keep-ahead plans in the same order** (queue, then the `next_book`
chain, else the folder), so the book kept ready is the book that plays.

**Leaving the queue** is `dropFromQueue(connectionId, books)` (`end-of-book.ts`,
framework-free): on a server the cache knows has `queue`, it looks the books up in
that connection's queue (the cached one, else one read), removes each by the stored
entry's own path and takes it out of the cached queue at once (so a second call for
the same book, the credits opened on return after the end already dropped it, sends
nothing), and is quiet - housekeeping never toasts or reaches the reachability
tracker. **The finished book always leaves Up next where it is finished**, whether
or not the next one starts (the credits opened with `ended`, an early Play now,
`BookEndedListener` in the background or with the credits already open); the queue
entry that plays leaves it inside `advanceTo`, only once it has started.

The framework-free reads this flow waits on (`up-next-sources.ts`, the capability
read, the queue) go through `fetchFailFast` (`api/hooks.ts`): TanStack holds a
default fetch while the browser says it's offline and waits to retry until a hidden
tab is focused, so a background tab's end-of-book chain waited silently.
`fetchFailFast` asks with `networkMode: 'always'`, never retries, and first cancels
a paused fetch a mounted hook holds for the same key; `fetchCapabilities` reads the
`/server` flags that way with the cached flags as the fallback.

### Sibling resolution (`next-book.ts`)

The folder fallback. `resolveNextBook` browses the parent folder via
`client.browse` (paging to exhaustion, `PAGE_LIMIT` 200); `findNextSibling` keeps
entries that are `is_book || is_dir` (an unindexed sibling book folder comes back
`is_dir: true, is_book: false` and must still count, while loose non-audio files
are ignored), sorts them with `naturalCompare`, and returns the first whose name
sorts strictly after the current leaf:

```ts
export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
```

The sort is **client-side and numeric-aware** so `Book 2` precedes `Book 10`
(the server's `/fs` listing is a plain string order). It never throws - any
failure resolves to `null`. The server's
[`GET /libraries/{id}/next`](../server/api/reference.md#get-apiv1librariesidnext)
ends in the same rule (`library.NextSibling`, a port of `findNextSibling` that
compares names as this `localeCompare` does), so the answer doesn't change when a
server gains `next_book`.

### Auto-download on play

`maybeAutoDownloadCurrent(connectionId, libraryId, book, chapterData?)` in
`store.ts` downloads **the book the user just started listening to**. It is
fired fire-and-forget at the end of `playBook`'s start path, after `svc.play()` -
never awaited, so it can neither delay nor break starting the book. Because the
store hot-swaps playback onto the local files the moment a download completes
(`switchCurrentBookToLocal` - see [Offline](offline.md)), downloading on start
also covers a series: the next book downloads as soon as it starts.
(An earlier design prefetched the next sibling at 90% of the current book; that
is gone.)

Guards, in order: `autoDownloadNext === 'never'` skips; an existing download
entry whose `status` isn't `error` skips (already downloaded, queued, or
downloading - only an errored entry is retried, matching the downloads store's own
guard); the network policy `canAutoDownload(mode)`; then it asks
`download(..., 'auto')`. The automatic rules it must agree with
[keep-ahead](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts)
on - skip a book the listener cancelled or removed this session (`isDeclined`), and
never eat into the reserve (`roomLeft`) - live in **one choke point**, the downloads
store's `download()`, which applies them to the `auto` and `keep-ahead` origins and
resolves a `DownloadOutcome` ([Offline](offline.md)). Asking as `auto` matters: the
default `listener` origin would lift the declined mark, as if the listener had
asked. `download()` also refuses an engine that can't store offline and a book that
streams transcoded on web, so no extra guard is needed here.

The policy gate is `canAutoDownload(mode)` in `src/lib/network.ts`, backed by
**`expo-network`**: `never` → false, `always` → true, and `wifi` allows web (the
browser can't report the connection type) plus native `WIFI`/`ETHERNET`, and
**fails open** on an `UNKNOWN`/undefined type or a probe error, so only a
positively-known metered connection is skipped. The three settings
(`autoPlayNext`, `autoDownloadNext`, `autoDeleteFinished`) live in
`src/stores/settings.ts` with defaults `false` / `'wifi'` / `true` - the
persisted `autoDownloadNext` key name predates the download-on-start behavior
and is kept for hydration compatibility.
