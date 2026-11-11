---
title: Player UI
description: "The player's screens and pieces: the mini player, the iOS 26 accessory, the docked bar and the full player, the player's sheets and overlays, jump undo, time left, the companion and its Text tab (read-along, with the admin's Make read-along), the controls and the web keyboard shortcuts."
---

Where the player lives in the shell, and the pieces it is built from. The
engines and the store are [Playback](playback.md); the end of a book and the sleep
timer have their own pages ([End of a book](end-of-book.md),
[Sleep timer](sleep-timer.md)).

## Mini player, accessory player, docked player

Which bar shows depends on the platform and the window:

| Where | Component |
|---|---|
| iOS 26 phone | `AccessoryPlayer` |
| Android, iOS before 26, and phone web | `MiniPlayer` |
| Tablet and desktop (web and native) | `DockedPlayer` |

Under the full player, the dock, the mini player and the accessory all render
nothing (`usePlayerOnTop`).

### The accessory (iOS 26 phone)

`AccessoryPlayer` sits in the native tab bar's `BottomAccessory` (the Liquid Glass
pill). iOS renders the accessory twice: `regular` above the bar and `inline` beside
the minimised bar. So the component is stateless, and everything comes from the
player and sleep-timer stores and its placement.

`ACCESSORY_SUPPORTED` (`accessory-support.ts`) gates it. It renders nothing while
nothing is loaded, and nothing on a tablet or desktop, where iOS mounts both
placements behind the hidden bar. The `regular` pill publishes its top edge
(`accessory`) with `measureInWindow`. It ignores a reading outside the window's
bottom half, which is a copy iOS isn't showing.

### The mini player

`MiniPlayer` (`src/components/player/mini-player.tsx`) is a card floating just above
the tab bar. Its sizes and gap are constants in that file.

On native it is **one** `FloatingMiniPlayer`, rendered once by the native shell
(`NativeAppShell`, `src/components/shell/native-shell.tsx`, which
`src/app/(app)/_layout.tsx` re-exports) as the shell frame's `phoneBottom` over
NativeTabs. It is never one per tab stack: NativeTabs keeps visited tabs alive, and
a card per stack ticked up to five times. The card sits on the native bar's measured
`bar` edge (see [Toasts](shell.md#toasts)). It renders nothing until that edge is
known, so it never flashes over the bar. On web it rides on the web tab bar.

Once its own top edge is known, the card **publishes it** as the `mini` piece, and
the toasts and the floating grace card clear it.

Content scrolls behind the card, so scroll screens reserve room with
`useMiniPlayerInset()`:

- Once the floating stack (an episode's fetch strip and the card) has laid out, the
  inset is the base padding plus the measured distance between the `mini` and `bar`
  edges. A strip that wraps at a large font scale or zoom still clears.
- Before that first layout, the inset is the base padding plus the constants
  (`MINI_PLAYER_HEIGHT` + `MINI_PLAYER_GAP`, `FETCH_STRIP_HEIGHT`).

### The docked player (tablet and desktop)

`DockedPlayer` (`src/components/shell/docked-player.tsx`) has the whole-book
progress line across the top, and three columns:

- **Left:** the cover, chapter, book and sync state. A tap opens the full player.
- **Middle:** `TransportControls size="sm"` over the dock's `ChapterScrubber`. The
  scrubber takes the playing book's `bookmarks` and draws their ticks in the
  segment (`usePlayingSegment`).
- **Right:** speed, sleep, bookmark, output (only when `canRoutePick`), Cast
  (`CastButton`, only when the bar has room for all its actions; see
  [Chromecast](chromecast.md#the-cast-button)), Up next and expand.

**The heading lines.** Under a chapter heading, the second line is the title and
author. The heading is already the title when `useMiniHeading`'s `isChapter` is
false. That is the case with no chapter label, or for an item with at most one
chapter whose label is its title (trimmed and case-insensitive, `namesTheItem` in
`src/lib/chapter-label.ts`). Then the second line is the author or show alone, or
nothing when there is none. A lone chapter named otherwise, and every chapter of a
multi-chapter item, keeps the chapter heading. Two other places use the same rule:

- the mini card (`MiniPlayerSubtitle`'s `showTitle`, which then shows only the time
  left);
- the Up next panel's now-playing line, which drops a chapter name that `sameTitle`
  matches.

**Three columns.** The book and the actions are equal side columns (`flex-1
basis-0`, the same padding on both sides) and the transport sits between them. So
the transport is centred on the bar whatever the title, the actions or the sleep
countdown. The one exception is a bar from 640 to 731 px wide, where equal side
columns would be narrower than the actions need (`dockLayout`'s `centred` is
false). There the actions column is sized to its content, the book column takes the
squeeze and the transport sits off centre, so a running sleep timer never covers the
next-chapter button. The side widths are estimates at the default text size; with
much larger text the actions can still reach the transport.

**What fits.** `dockLayout` works from the bar's **measured** width, not the window
class. It decides the middle column's width (`centre`, 300-560 with the scrubber)
and what fits:

- every action from 1144, with both side columns sized for them and the sleep pill
  at its widest (a running "10:05:00" or "Keep going");
- the tablet set (sleep, Up next, expand) below that;
- no scrubber below 800.

Everything the dock drops is in the full player.

**The undo chip.** The `UndoChip` **floats above the bar**, centred on the bar. That
puts it over the transport, except on a 640 to 731 px bar, where the transport sits
off centre. Nothing in the bar lays out around the chip, so a jump never moves or
resizes the scrubber under the pointer that made it.

Speed and sleep open through `usePlayerSheets`. The dock mounts **no sheets** and
no grace card; `ShellPlayerOverlays` does ([below](#player-sheets-and-overlays)).
The dock publishes its height as the `dock` edge, plus the chip's band
(`UNDO_CHIP_HEIGHT` and a gap) while the chip shows, so toasts clear it.

### The sync line

The sync line, in the dock and in the full player's status line, is `usePlaceSync`
(`place-sync.ts`). It shows the first of these that applies:

1. sign in again;
2. saved on this device (the server is offline, or this server's saves are queued);
3. synced, or synced just now.

It counts only the queued saves for the playing book's server. It polls while
playing; a 5xx save queues with the server still online.

## The full player

`src/app/player.tsx` is thin. The view is `src/components/player/player-view.tsx`,
its pieces are in `player-parts.tsx` and its rules in `player-view-model.ts`. The
player is a root modal, but a desktop browser can be any size, so it lays itself out
by its **measured** width (`playerLayout`).

**Everywhere**, from the top:

- `CoverWash` from the item's `cover_color`. Without one, `playerWash` uses a
  neutral, never a made-up cover colour.
- The cover, settling to 94% while paused. Under reduced motion it stays full size
  and motionless.
- `PlayerHeader`: minimise, "Playing from" and the server name, the series line,
  and the overflow `DropdownMenu`.
- The chapter title. A tap asks for `chapters`, and the sheet host decides the form
  ([below](#player-sheets-and-overlays)).
- `PlayerStatusLine`. It **becomes the `UndoChip`** while a jump can be undone. It
  gives its slot to `GraceCard inline`, which sits in the flow and never over the
  controls. It fades while a scrubber's tip floats into it.
- `PlayerSeekBar` over `PlayerBookTimeline` with its pins. The seek bar's `SeekTimes`
  row is hidden through `timesHidden` while the timeline's tip floats into it.
- `TransportControls`.
- `PlayerErrorLine`.
- `PlayerActions`. On tablet and desktop it adds the Smart speed / Voice boost state
  pill (`useEffectsPill`) while either is on; see
  [Smart speed and Voice boost](audio-effects.md#the-settings-and-the-ui).

**By layout:**

- **Phone:** a flex column whose cover slot takes what the rest leaves, so the
  player fits without scrolling. `CompanionChips` open the companion sheet on a tab
  (`openCompanion(tab)`). The chips are Who's who and Story so far (with community
  metadata), Text (while the book has a Text tab) and Chapters.
- **Tablet:** the companion sits inline under the controls (`variant="inline"`), and
  the page scrolls.
- **Desktop:** the companion is a fixed-width column (`variant="column"`). There is
  no Up next pill, since the drawer is the desktop's.

The full player mounts its own `PlayerSheetHost scope="player"` with its measured
layout. The companion is described in
[The companion](#the-companion-companion).

## Player sheets and overlays

`usePlayerSheets` (`player-sheets.ts`) is the one "which player sheet is open"
store. A request says **what**, never where. The `PlayerSheet` union lists them;
`bookmark` and `output` are actions, and `shortcuts` is the web shell's
`ShortcutsDialog`. A book's request is dropped when the book unloads
(`dropsWithBook`), so the next book never opens it by itself.

**The annotation editor** is one sheet value too. `openEditor(request)` sets `open`
to `'editor'` together with its `EditorRequest` (`editor`, typed in
`src/lib/annotation-request.ts`), and the host renders `AnnotationEditorSheet` for
it (see [Bookmarks and notes](annotations.md#the-editors)). The editor carries its
own book, so:

- `shownSheet` shows it whether or not a book is loaded;
- `dropsWithBook` keeps it when the playing book unloads, since closing it would
  throw away what the listener is typing.

`openSheet` clears `editor`. The store keeps `editor` after `close()`, so the sheet
slides away with its content. The `bookmark` action is the one-tap bookmark
([Adding](annotations.md#adding)).

### The sheet host

`PlayerSheetHost` (`player-sheet-host.tsx`) renders the open sheet. It decides the
**form** from its layout: the full player's measured layout, or the window's in the
shell.

- **Chapters** become the companion's Chapters tab where the full player shows the
  companion as a column (desktop) or a sheet (phone). Otherwise they open the
  chapter sheet.
- **A companion request** opens the phone's sheet. On wider layouts it only selects
  the tab.
- **`upnext`** opens `UpNextSheet`.

Everything presents through the one `PlayerSheet`.

The host is mounted **twice**: once inside the full player (`scope="player"`) and
once in the shell (`scope="shell"`). **Exactly one is active**
(`hostIsActive(scope, playerOnTop)`): the full player's while it is on top, the
shell's otherwise. On native the player is a root `fullScreenModal`, so the shell's
overlays sit under it, invisible but live. Two active hosts would open a sheet
behind the player too. The player's host closes its sheet when the player
unmounts.

`ShellPlayerOverlays`, mounted by both `(app)` layouts at the shell's root, holds
the shell host and the floating sleep timer `GraceCard`. The grace card shows while
the full player isn't on top, and publishes its own `grace` edge so toasts lift above
it. On the web a hosted `Sheet` is `role="dialog"` + `aria-modal`, so the player's
keys stand back while one is open and its `OverlayHost` owns Escape.

### One app shell

Only the top `(app)` shell (`useIsTopShell`, `src/components/shell/top-shell.ts`)
mounts these overlays, the palette, the shortcuts overlay and the keys. The app
never stacks a second shell.

A shell page opened from a root route (the full player, the credits) goes through
`pushInShell` (`src/lib/open.ts`; `useOpen` does it). It dismisses the root routes
and pushes into the shell's active tab. A `router.push` or `replace` from there
would put a second `(app)` over the first.

Code that must know where the player is at the moment of a press reads
`topRootRoute(currentNavState())` (`src/lib/root-stack.ts`) instead of subscribing
with `usePlayerOnTop`. `usePlayBook` starts a book in place while the full player is
already on top.

### Never navigate from the background

`/player` and `/finished` are root `fullScreenModal`s, and iOS can't present one
from the background. So playback-driven code starts books in place
(`startBookInPlace`) and defers any screen with `whenActive` / `navigateWhenActive`
(`src/lib/when-active.ts`). See [The end of a book](end-of-book.md#ending-a-book).

## Undo a jump (`jump-undo.ts`)

After **any** jump of more than a minute of book position, the app remembers where
the listener was for a few seconds. The `UndoChip` (`undo-chip.tsx`) can take them
back: `undoJumpWithToast` seeks back and confirms. The chip replaces the full
player's `PlayerStatusLine` and floats above the docked bar over its transport. The
thresholds and windows are constants at the top of `jump-undo.ts`.

While the sleep timer's grace card is open, the chip gives way everywhere
(`useUndoVisible` is false, from `useGraceCardOpen`). So the card never moves when
the chip expires.

### How a jump is detected

"Any jump" includes the ones that never pass through our UI, such as a lock-screen
or headphone seek or a CarPlay scrub. So the seek actions do **not** record jumps.
Instead, `startJumpUndo()` **detects them from the player's snapshot stream**. It
is started once with the root's services (`startRootServices`). It compares
consecutive settled samples of the whole-book position with how far playback could
have carried the listener in the wall-clock time between them.

`isJump` is the pure rule:

- while the previous sample was playing, anything up to `elapsed × rate` is
  natural;
- while it was paused, no movement is natural;
- a move forward beyond that by more than the threshold, or backward by more than
  the threshold, is a jump.

One rule covers every source, which is why the store isn't touched. A recording site
in `seekBook` would miss every jump the engine makes on the OS's behalf.

What must **not** read as a jump, and why it doesn't:

- **Loading or resuming a book**, and a book change: the baseline drops when
  `selectBookKey` changes, and the snapshot current at that moment (the old engine
  state) is skipped. For a short settle window after the first fresh sample, the
  samples only move the baseline.
- **Retry, reloads and buffering**: only `playing` and `paused` are sampled.
- **The downloads hot-swap**: same book, same position.
- **The app coming back after iOS suspended JS**: a heartbeat runs only while the
  app is not active and a book is loaded. A stalled heartbeat marks the return
  `unobserved`. Forward movement up to the allowance is then accepted even from a
  paused sample (a lock-screen play while suspended). Only the first sample just
  after the return gets this, not one an hour later. Backward movement is never
  natural.
- **The undo itself**: `undoJump` marks its landing, which is then not recorded.

Two jumps close together are one gesture, since a multi-file seek can land in two
steps. The chip keeps the first "from". A book without a whole-book timeline is not
watched.

Known limits, on purpose:

- a seek right after a book starts makes no chip;
- a jump made while JS is suspended that lands inside the playback allowance can't
  be told from listening.

## Time left (`time-left.ts`)

Every screen says the time left in a book by one rule: **wall-clock** time at
**that book's** speed. The speed is saved per book, so the time left uses it too.
`bookSpeed` picks the speed:

1. the loaded book's `rate`;
2. else its saved `playback_speed`;
3. else the listener's default speed: `useListenerDefaultRate()`, which is the
   `defaultRate` setting, or 1× while a kids profile listens.

The label names the speed except at 1× ("22h 27m left at 1.25×", "22h 27m left").
`timeLeft`, `formatTimeLeft` and `timeLeftLabel` are the pure pieces.

The React side is `src/components/player/use-time-left.ts`:

- `usePlayingTimeLeft()` for the playing book;
- `useBookSpeed` and `useBookTimeLeft` for any book (Home, the Library's Books
  list). They use the live place and speed while it's the loaded book, else the
  saved ones.

The hooks read the player as numbers (`displaySeconds` and the speed, through
`useShallow`) and make the words in render. So a caller re-renders when the words
change, not on every engine tick. The speed sheet's per-preset times use the same
`timeLeft`.

## The companion (`companion/`)

`src/components/player/companion/` is the full player's companion (Who's who, Story
so far, Text, Chapters, Bookmarks, Notes, History) in one `Companion` with three
variants: `column` on desktop, `inline` on a tablet, `sheet` on a phone.

### `companion-model.ts`

Pure. It holds:

- which tabs a book gets (`companionTabs`): the two community tabs only with
  `metadata`, and Text only where `textTab` says, after Story so far;
- the tab shown (`activeCompanionTab`): the one asked for when it exists, else the
  first that isn't Text;
- Who's who order;
- Story so far (recaps split by the book page's `splitRecaps`);
- the chapter rows (through `timeLeft`);
- the reveal rules ([The reveal toast](#the-reveal-toast)).

### `use-companion-data.ts`

It gives the playing book's community data and the listener's place. It gates them
**exactly** as the book page does (`meta-gating.ts`, through `useListeningChapter`,
the same rule as the book page's `useListeningPosition`; see
[State & data](state-and-data.md#spoiler-gating-srccomponentslibrarymeta-gatingts)).
It never forks those rules.

The chain itself is `useBookCommunity`
(`src/components/library/use-book-community.ts`): the `metadata` flag, the book,
`/meta`, the chapters and the corrected starts. The reveal listener and Previously on
share it. Its `status` keeps the panels from flashing everyone hidden while the
chapters load. An **unknown** `metadata` counts as off, as it does for the phone's
chips. The loaded book's identity comes from `usePlayingTarget`
(`playing-target.ts`), which returns the same object until another book loads.

### `companion-store.ts`

`useCompanion` keeps, in memory only:

- the tab;
- **one shared reveal** per book. **Show anyway** in Who's who also reveals Story so
  far, as on the book page;
- the "Just met" ids of the last crossing.

It sits outside any view, so the column, the inline companion, the phone's sheet and
the toast's Show agree.

### Panels

- **`WhoPanel`** uses the book page's own `CharacterCard`, Search's `HiddenStrip`
  and its own empty state. A description stays behind a per-card tap, since it is
  written for the whole book.
- **`StoryPanel`**.
- **`ChaptersPanel`** is virtualised and opens on the current chapter in the column
  and the sheet. Inline it is a plain list.
- **The book page's `BookmarksSection`, `NotesSection` and `HistorySection`.** All
  three take an `onJump` that seeks the playing book in place, so the undo chip
  follows. The shared rows and the top actions are
  [`src/components/annotations/`](annotations.md). Without a client, all three say
  "This book's server isn't connected" rather than throw.

**Credits.** `Attribution` (`companion-pieces.tsx`) puts the server's `attribution`
under every community block. The credit is the server's and is never composed here.
A dimension generated on this server gets the "Generated on this server" mark
instead (`communityCredit`, `GeneratedMark`). Story so far places its chips by
`recapMarks` (see [Enriched book metadata](state-and-data.md#enriched-book-metadata)):

- one at its head when every part shown was generated;
- else one on the generated part alone;
- a generated list's chip under the "Story so far" heading, and again over recaps
  revealed with **Show anyway**.

The companion never shows the Generate covered line. For an admin, the empty Who's
who and Story so far end with `GenerateOffer`
([Generating characters and recaps](book-page.md#the-primary-action-and-the-action-row)).

### The Text tab (read-along)

The Text tab shows the playing book's ebook following its narration, through a
[read-along map](reader.md#read-along-following-the-narration). `use-text-tab.ts`
(`useTextTab`) gathers what the tab needs for the playing book, inside its
`ConnectionScope`:

- the book;
- whether it reads (`canRead`, the server's EPUB or the download's);
- its map (`useBookReadalong`);
- whether this person may make one (`mayMakeReadalong`, for a book that reads).

`textTab` decides whether the tab shows:

| Who | The tab shows |
|---|---|
| a listener | once the map is in with a sentence to follow. Never while the map is on its way (no tab that vanishes a moment later), and never for a stale or absent map |
| an admin who may make one | always: a spinner while the map is on its way, and the Make offer where there is none to follow |
| anyone | when the map's read failed (`failure`, [The ebook reader](reader.md#the-map)): a notice by its reason, listed under [What `TextPanel` renders](#what-textpanel-renders). Never the Make offer, since a map may well be there and making it again takes hours |
| nobody, an admin included | while the server's map waits for the network, or its read failed with no network, and the device holds no copy (`offline`). Nothing can be said or made meanwhile |

The Text tab starts a reader, so the companion never lands on it unasked
(`activeCompanionTab` falls back to the first tab that isn't Text). The tab picked
last still wins while the book has it.

On a phone, `CompanionChips` shows a **Text** chip while `useTextTab` shows the tab
for the playing book. The chip has testID `player-chip-text` and sits between Story
so far and Chapters, in the companion's tab order. It opens the sheet straight on
Text.

#### What `TextPanel` renders

`TextPanel` (`text-panel.tsx`) renders outside the tab's scroller, since the reader
pages itself. Inline on a tablet it is 520 px tall.

**`ReadAlong`.** There is one per book, keyed by it, so the playing book changing
under an open tab gets its own reader. It is the reader host with
`followNarration`:

- It opens at the sentence being read when the tab opened (`cfiAt` on the
  narration's place).
- `useNarration` tells it of every play, pause, seek and speed change.
- A spinner shows until the reader has opened the book and said `readalong ok`.
- Then come the page edges (narrow, by the column's measured width). Once the
  listener turns a page away while the book is placed, a **Back to narration** pill
  (`FollowPill`) shows.
- A tapped sentence moves the narration to its start.
- **It never saves the reading place.** The tab follows the narration; the
  full-screen reader is where a reading place is made.

**Room for the pill.** While Back to narration shows, the page ends 48 px above the
foot (`followPillRoom`), so the pill never covers the last line.

**Notices.** Each is an `EmptyState`:

| Cause | Notice |
|---|---|
| the reader said `none` (the map names nothing in this ebook) | "The text can't follow this narration", with Make again for an admin |
| a part of the book didn't load, the reader didn't start, or the EPUB fetch failed | "Couldn't load the text" with Try again (a new host) |
| no client for the book's server | "This book's server isn't connected" |

**The map's failures** (`MapFailure`), by `failure`:

| `failure` | Notice |
|---|---|
| `retry` | "Couldn't load the text" with "The read-along didn't load" and Try again |
| a connection that needs signing in again | the sign-in state: "Sign in again to *server*" with Reconnect (`SignInAgainState`) |
| any other 401 | "Sign in to this server again to load the read-along" |
| `denied` | "This read-along isn't yours to open" |
| `missing` | "This book isn't on the server any more" |
| `ebookChanged` | "The read-along is for a newer ebook" (remove the download and download the book again) |

**The admin's empty state**, when there is no map to follow:

- "No read-along for this book yet" and what a read-along is;
- or, for a stale map, "The read-along is out of date" with why (`textStaleEbook`,
  `textStaleAudio`, by the server's `reason`);
- then `MakeReadalongOffer` ("Make read-along", or "Make the read-along again").

#### Make read-along

**Make read-along** follows Generate's pattern. It lives in `src/components/bridge/`:
`use-make-readalong.ts`, `make-readalong.tsx`, and the rules in
`readalong-model.ts` (pure and tested).

- **Offered** (`readalongOffer`) once the book's jobs are known and none shows its
  status. `readalongStatusJob` picks the newest `readalong.align` while it is open or
  once it failed. The shared `BridgeJobStatus` in `generate-status.tsx` shows it; the
  stage `readalong_aligning` reads "Lining the text up with the narration".
- **The confirmation** reads the estimate (`useReadalongEstimate`; fields in
  [State & data](state-and-data.md#read-along-usereadalong-and-usebookreadalong)).
  It shows the source (the ebook's file name and the audio), "Up to" the
  transcription (no estimate when the server has no `figures`), no AI agent, and
  that results appear on this server. The job queues `{}`.
- **Held back** (`readalongBlockKey`) on `no_ebook`, on `library_not_writable`, on
  an open generate or detect job, or on the book's own open read-along job
  (`readalong_open`). A refused queue reads in the app's words
  (`readalongRefusalKey`). In turn, Generate is held back while a read-along job is
  open (`readalong_open`, "This book's read-along is being made").
- **Lifetime:** an open confirmation belongs to the book (`useBridgeJobSurface`), so
  it closes when the playing book changes. The job's finish reads the book's item
  again (`refreshAfterFinish`), and the map follows under its new `generated_at`.

The console's own [Read-along card](/users/admin/making-read-along) covers the same
job.

### The reveal toast

The reveal toast is `CompanionRevealListener` (`reveal-listener.tsx`). It is mounted
once in the root layout, so it fires wherever the listener is. It subscribes to
`usePlayer` and feeds each sample to `watchReveal`. A sample is the position, whether
it is playing, and the chapter, read exactly as Who's who's gate reads it, so the
toast and the panel agree.

`watchReveal` is a small pure state machine:

- The first playing sample is where the book is: a load or resume, never a
  crossing.
- A sample that isn't playing (a pause, a buffer, the moment between two files) is
  passed over. So a chapter that starts with a new file still crosses from the last
  playing sample.
- A sample a natural step from the last (`isNaturalStep`) is taken. It is a crossing
  when the chapter went up.
- Anything else is **held** until the next sample says what it was. Either it was a
  seek (taken, never a crossing), or it was one write of a file change that the
  native engine reports in two (dropped).

`revealOnCrossing` names only the people the new chapter reveals beyond the furthest
chapter reached this session, and nobody for a finished book. A hit marks them
`justMet` and toasts with **Show** (`showWhoIsWho`, which reads whether the player
is on top when pressed).

### Previously on

**Previously on** (Home, `src/components/home/previously-on.tsx`, rules in
`previously-on-model.ts`) reuses the same gate on the **saved** place. It shows
above the Now card for a book that is:

- unfinished and left long enough ago (`PREVIOUSLY_ON_GAP_DAYS`);
- not loaded;
- on a server with `metadata`.

It shows the furthest recap the saved place is past.

"Resume, with 30 seconds of overlap" (`resumeWithOverlap`) starts before the
**newest** saved place. A start at an explicit position skips the store's own resume
reconciliation. So it first runs `loadInitialProgress` (server, mirror, offline
queue) against Home's row, then calls `startBookInPlace` with that place's speed.
The card is dark in both themes through `ScopedThemeColors`.

## The player controls

The building blocks shared by the full player and the docked bar.

### One chrome for the controls

`pillClass(look)` and `ControlPill` (`control-pill.tsx`) give every player control
the same press, hover and focus states.

**Touch targets.** A rem is 14 pt on native but 16 px on the web. Both helpers are in
`src/components/ui/touch-target.ts`:

- A rem-sized control takes `hitSlop={slopTo44(rem)}`, which adds only what it
  lacks of 44: zero for `h-11` on the web, 4 px a side for the dock's `h-9` pills.
- A small control that must report 44 pt itself on native (a row's action, a label
  chip) takes `touchTarget(height, width?)`. That is a 44 pt frame on native and the
  slop on the web.

Tests assert them with `expectNativeTarget` (`src/testing/touch-target.ts`).

### Speed and sleep sheets

The readouts only call `usePlayerSheets.openSheet`. The active `PlayerSheetHost`
([above](#player-sheets-and-overlays)) renders the sheets through `PlayerSheet`
(`player-sheet.tsx`). `body="scroll"` is for plain content and `body="fill"` for
content with its own scroller. Children mount only while the sheet is open.

- **Speed** is `speed-model.ts`: the grid, the presets, stepping and the sheet's own
  range (`SPEED_MIN`/`SPEED_MAX`). The range is the same 0.5-2 that `clampRate` in
  `rate.ts` enforces in the store.
- **Sleep** is `sleep-sheet-model.ts`: the presets, the "Or stop after" rows and the
  notice. The End of chapter tile's target comes from `chapterTimerTarget`
  (`src/playback/sleep-timer.ts`), the rule the timer itself arms.

Picking a timer records a touch (`noteInteraction`) and closes the sheet. The sleep
readouts (`useSleepPill`, `useSleepCountdown`) read the phase, the countdown and the
timer's label.

### The scrubbers

The scrubbers share their parts (`scrub-parts.tsx`): the web hover, the `Playhead`
and the `ScrubTip`. The tip reports itself through `onTip`, so the caller clears
what sits above it.

They also share **one segment hook**, `usePlayingSegment`
(`use-playing-segment.ts`). It gives:

- the playing segment and its `kind`: `chapter`; `book` for a chapterless book with
  a whole-book timeline; `file` without a timeline;
- the live seconds into it;
- the commit;
- the bookmarks inside it.

With `hold`, it keeps the segment a drag started in.

The commit goes through `scrubTarget` (`transport.ts`). It holds any scrub short of
the book's end by `scrubGuard`, **`min(30 s, max(10% of the book, 6 s))`**. Landing
on the end would finish the book and take the undo chip with it. The guard scales
with short books because a flat 30 s would leave half of a one-minute book's bar
dead. A `file` segment has no whole-book length, so it seeks within the file
unguarded.

Both scrubbers:

- ignore gesture-handler's keyboard pointer, the press it invents for Space and
  Enter on the web;
- scrub only on a sideways drag;
- never commit a cancelled drag.

### The seek bar

The seek bar (`seek-bar.tsx`) draws stylised bars, and they are **deliberately
decorative**. `seek-texture.ts` seeds a speech-like envelope from the book and
chapter, so a chapter always looks the same without pretending to show the sound.
A `peaks` prop takes real peaks if the server ever computes them.

The bars are drawn once per width, and a UI-thread clip reveals the played layer. So
a tick moves transforms, not colours. Gesture and accessibility come from
`useSliderControl`, shared with `Slider`. `SeekTimes` is the row under the bar.

### The whole-book timeline

The whole-book timeline is `book-timeline.tsx` with the pure
`book-timeline-model.ts`.

- **Runs.** Chapters are merged into runs like the Now card's `scaleRuns`. Each run
  is placed by time with `runBox`, the one mapping that the playhead, taps and pins
  use.
- **Pins.** Bookmark and note pins come from `usePlayingPins`, the playing book's
  case of `useBookAnnotations`. That hook reads ANY book's bookmarks and notes, and
  their `pins`, through its own connection. It never throws when the connection is
  gone, and it uses a 10 minute `staleTime` unless the caller passes its own.
  `pinsOf` gives a note a pin only when its position is past 0, so legacy notes, all
  stored at 0, don't stack on the start.
- **Taps.** A tap on a pin lands on it. A tap or drag elsewhere seeks through
  `scrubTarget`.
- **The playhead.** `timelinePosition` never places the playhead before the start of
  the chapter the place is in, so a jump to a chapter's start names that chapter.

The book page draws the same `BookTimeline` for any book
([The book page](book-page.md#the-chapters-tab)).

### Rings, the transport and titles

- **Rings** (`src/components/ui/progress-ring.tsx`): `ProgressRing` (a fraction the
  caller ticks) and `CountdownRing` (empties by itself, on the UI thread). Both are
  transform-only.
- **The transport cluster** (`transport-controls.tsx`) comes in three sizes.
  Previous and next read the live position at press time through `stepSegment`
  (`transport.ts`), which steps by chapters, else by files.
- **`prettify-title.ts` cleans filename-shaped labels for display.** Audiobook
  "chapter" labels are often just the audio *filename* (`01_the_hobbit_ch1.mp3`).
  `prettifyChapterTitle` strips a recognised extension, turns underscores into
  spaces and drops a trailing bitrate tag. It does this only for labels that already
  look like filenames. It is **display-only** and applies wherever a chapter or
  track label surfaces:
  - a chapter goes through one helper, `chapterLabel()`
    (`src/lib/chapter-label.ts`), which falls back to "Chapter N" for an untitled
    chapter;
  - a file or track label, and the sleep timer's label, call
    `prettifyChapterTitle` directly.

## Keyboard shortcuts (web)

`player-shortcuts.ts` holds the pure key map (`playerShortcutFor`) and the actions.
`use-player-shortcuts.ts` attaches it to the document once, from the top web shell
(`(app)/_layout.web.tsx`). It works on every page **and over the full player**.

Two shortcuts are separate handlers that run on tab pages only, not over the full
player or the credits:

- Q for Up next (`useUpNextShortcut`);
- ⌘K or `/` for the palette (`usePaletteShortcut`).

The gating rules:

- Never while typing (`isEditable`) or over another open layer (`isModalOpen`). An
  open layer is an `aria-modal` `Sheet`, or a Radix Dialog, AlertDialog, menu or
  select, which say so with `data-state="open"`. Up next's sheet carries
  `UP_NEXT_LAYER`, so Q still closes the sheet it opened.
- Never with Ctrl or Meta. Alt only for `[` and `]` typed through AltGr or Option.
- Every key but `?` and Esc needs a book loaded.
- Space stands aside for a focused control that Space activates (`ownsSpace`), and
  the arrows for one they move (`ownsArrows`). So Space still plays over a focused
  scrubber.
