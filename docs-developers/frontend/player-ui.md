---
title: Player UI
description: "The player's screens and pieces: the mini player, the iOS 26 accessory, the docked bar and the full player, the player's sheets and overlays, jump undo, time left, the companion, the controls and the web keyboard shortcuts."
---

Where the player lives in the shell, and the pieces it is built from. The
engines and the store are [Playback](playback.md); the end of a book and the sleep
timer have their own pages ([End of a book](end-of-book.md),
[Sleep timer](sleep-timer.md)).

## Mini player, accessory player, docked player

- **iOS 26 phone:** `AccessoryPlayer` in the native tab bar's `BottomAccessory`
  (the Liquid Glass pill). iOS renders the accessory twice (`regular` above the
  bar, `inline` beside the minimised bar), so the component is stateless:
  everything comes from the player and sleep-timer stores and its placement.
  `ACCESSORY_SUPPORTED` (`accessory-support.ts`) gates it; it renders nothing while
  nothing is loaded and on tablet/desktop (iOS mounts both placements behind the
  hidden bar). The `regular` pill publishes its top edge (`accessory`) with
  `measureInWindow`, ignoring a reading outside the window's bottom half (a copy
  iOS isn't showing).
- **Android, iOS before 26, and phone web:** `MiniPlayer`
  (`src/components/player/mini-player.tsx`), a card floating just above the tab
  bar (sizes and gap are constants in that file). On native it is **one**
  `FloatingMiniPlayer`, rendered once by `src/app/(app)/_layout.tsx` as the shell
  frame's `phoneBottom` over NativeTabs - never one per tab stack, since NativeTabs
  keeps visited tabs alive and a card per stack ticked up to five times. It sits on
  the native bar's measured `bar` edge (see
  [Toasts](overview.md#toasts)) and renders nothing until that edge is known, so it
  never flashes over the bar; on web it rides on the web tab bar. It **publishes its
  own top edge** as the `mini` piece once known, which the toasts and the floating
  grace card clear. Content scrolls behind it, so scroll screens reserve room with
  `useMiniPlayerInset()`.
- **Tablet and desktop (web and native):** `DockedPlayer`
  (`src/components/shell/docked-player.tsx`): the whole-book progress line; the
  cover, chapter, book and sync state on the left (a tap for the full player);
  `TransportControls size="sm"` over the dock's `ChapterScrubber`, which takes the
  playing book's `bookmarks` and draws their ticks in the segment
  (`usePlayingSegment`); and on the right the `UndoChip`, speed, sleep, bookmark,
  output (only when `canRoutePick`), Up next and expand. What fits is decided by
  the bar's **measured** width (`dockLayout`), not the window class; everything it
  drops is in the full player. While the Undo chip shows (`useUndoVisible`), its
  measured width comes off first and the right cluster stops growing, so the book
  keeps its title. Speed and sleep open through `usePlayerSheets`; the dock mounts
  **no sheets** and no grace card (`ShellPlayerOverlays` does, below). It publishes
  its height as the `dock` edge.
- **The sync line** (dock and the full player's status line) is `usePlaceSync`
  (`place-sync.ts`): sign in again > saved on this device (the server offline, or
  this server's saves queued) > synced / synced just now. It counts only the playing
  book's server's queued saves and polls while playing (a 5xx save queues with the
  server still online).
- **Under the full player** the dock, the mini player and the accessory render
  nothing (`usePlayerOnTop`).

## The full player

`src/app/player.tsx` is thin; the view is `src/components/player/player-view.tsx`,
its pieces in `player-parts.tsx` and its rules in `player-view-model.ts`. It lays
itself out by its **measured** width (`playerLayout`), since the player is a root
modal but a desktop browser can be any size.

- **Everywhere:** `CoverWash` from the item's `cover_color` (`playerWash`: else a
  neutral, never a made-up cover colour); the cover breathing smaller while paused
  (still under reduced motion); `PlayerHeader` (minimise, "Playing from" and the
  server name, the series line, the overflow `DropdownMenu`); the chapter title,
  whose tap asks for `chapters` (the sheet host decides the form, below);
  `PlayerStatusLine`, which **becomes the `UndoChip`** while a jump can be undone,
  gives its slot to `GraceCard inline` (in the flow, never over the controls), and
  fades while a scrubber's tip floats into it; `PlayerSeekBar times` over
  `PlayerBookTimeline variant="compact"` with its pins; `TransportControls`;
  `PlayerErrorLine`; `PlayerActions`.
- **Phone:** a flex column whose cover slot takes what the rest leaves, so the
  player fits without scrolling; `CompanionChips` open the companion sheet on a
  tab (`openCompanion(tab)`).
- **Tablet:** the companion inline under the controls (`variant="inline"`, the page
  scrolls).
- **Desktop:** the companion as a fixed-width column (`variant="column"`), and no
  Up next pill (the drawer is the desktop's).

It mounts its own `PlayerSheetHost scope="player"` with its measured layout. The
companion is [below](#the-companion-companion).

## Player sheets and overlays

`usePlayerSheets` (`player-sheets.ts`) is the one "which player sheet is open"
store. A request says **what**, never where (the `PlayerSheet` union lists them;
`bookmark` and `output` are actions, `shortcuts` is the web shell's
`ShortcutsDialog`). A book's request is dropped when the book unloads, so the next
book never opens it by itself.

`PlayerSheetHost` (`player-sheet-host.tsx`) renders it and decides the **form** from
its layout - the full player's measured one, the window's in the shell: chapters
become the companion's Chapters tab where the full player shows the companion as a
column (desktop) or a sheet (phone), the chapter sheet otherwise; a companion
request opens the phone's sheet and just selects the tab wider; `upnext` opens
`UpNextSheet`. Everything presents through the one `PlayerSheet`. The host is
mounted **twice**, inside the full player (`scope="player"`) and once in the shell
(`scope="shell"`), and **exactly one is active** (`hostIsActive(scope,
playerOnTop)`): the full player's while it is on top, the shell's otherwise. On
native the player is a root `fullScreenModal`, so the shell's overlays sit under
it, invisible but live - two active hosts would open a sheet behind the player too.
The player's host closes its sheet when the player unmounts.

`ShellPlayerOverlays`, mounted by both `(app)` layouts at the shell's root, is the
shell host plus the floating sleep timer `GraceCard` (while the full player isn't
on top), which publishes its own `grace` edge so toasts lift above it. A hosted
`Sheet` is `role="dialog"` + `aria-modal` on the web, so the player's keys stand
back while one is open and its `OverlayHost` owns Escape.

**One app shell.** Only the top `(app)` shell (`useIsTopShell`,
`src/components/shell/top-shell.ts`) mounts these overlays, the palette, the
shortcuts overlay and the keys, and the app never stacks a second one: a shell page
opened from a root route (the full player, the credits) goes through `pushInShell`
(`src/lib/open.ts`; `useOpen` does it), which dismisses the root routes and pushes
into the shell's active tab - a `router.push` or `replace` from there would put a
second `(app)` over the first. Code that must know where the player is at a press
reads `topRootRoute(currentNavState())` (`src/lib/root-stack.ts`) instead of
subscribing with `usePlayerOnTop`; `usePlayBook` starts a book in place while the
full player is already on top.

**Never navigate from the background.** `/player` and `/finished` are root
`fullScreenModal`s and iOS can't present one from the background, so playback-driven
code starts books in place (`startBookInPlace`) and defers any screen with
`whenActive` / `navigateWhenActive` (`src/lib/when-active.ts`) - see
[The end of a book](end-of-book.md#ending-a-book).

## Undo a jump (`jump-undo.ts`)

After **any** jump of more than a minute of book position, the app remembers where
the listener was for a few seconds so the `UndoChip` (`undo-chip.tsx`) can take
them back; the chip replaces the full player's `PlayerStatusLine` and leads the
docked bar's actions, and `undoJumpWithToast` seeks back and confirms. The
thresholds and windows are constants at the top of `jump-undo.ts`.

"Any jump" includes the ones that never pass through our UI - a lock-screen or
headphone seek, a CarPlay scrub - so jumps are **not** recorded by the seek actions.
They are **detected from the player's snapshot stream**: `startJumpUndo()` (started
once from `src/app/_layout.tsx`) compares consecutive settled samples of the
whole-book position with how far playback could have carried the listener in the
wall-clock time between them. `isJump` is the pure rule: while the previous sample
was playing, anything up to `elapsed × rate` is natural; while it was paused,
nothing is; a move beyond that by more than the threshold, or backward by more than
it, is a jump. One rule covers every source, which is why the store isn't touched:
a recording site in `seekBook` would miss every jump the engine makes on the OS's
behalf.

What must **not** read as a jump, and why it doesn't:

- **Loading or resuming a book** and a book change: the baseline drops when
  `selectBookKey` changes, the snapshot current at that moment (the old engine
  state) is skipped, and for a short settle window after the first fresh sample
  the samples only move the baseline.
- **Retry, reloads and buffering**: only `playing` and `paused` are sampled.
- **The downloads hot-swap**: same book, same position.
- **The app coming back after iOS suspended JS**: a heartbeat runs only while the
  app is not active and a book is loaded; a stalled heartbeat marks the return
  `unobserved`, and forward movement up to the allowance is then accepted even from
  a paused sample (a lock-screen play while suspended) - but only by the first
  sample just after the return, not one an hour later. Backward movement is never
  natural.
- **The undo itself**: `undoJump` marks its landing, which is then not recorded.

Two jumps close together are one gesture (a multi-file seek can land in two steps),
so the chip keeps the first "from". A book without a whole-book timeline is not
watched. Known limits, on purpose: a seek right after a book starts makes no chip,
and a jump made while JS is suspended that lands inside the playback allowance can't
be told from listening.

## Time left (`time-left.ts`)

One rule for how every screen says the time left in a book (frontend#50: the speed
is saved per book, so the time left must use it too): **wall-clock** time at **that
book's** speed - the loaded book's `rate`, else its saved `playback_speed`, else the
`defaultRate` setting (`bookSpeed`) - naming the speed except at 1× ("22h 27m left
at 1.25×", "22h 27m left"). `timeLeft`, `formatTimeLeft` and `timeLeftLabel` are
the pure pieces.

The React side is `src/components/player/use-time-left.ts`: `usePlayingTimeLeft()`
for the playing book, `useBookSpeed` and `useBookTimeLeft` for any book (Home, the
Library's Books list) - the live place and speed while it's the loaded one, else
the saved ones. Each selector returns the text itself, so a caller re-renders when
the words change, not on every engine tick. The speed sheet's per-preset times use
the same `timeLeft`.

## The companion (`companion/`)

`src/components/player/companion/` is the full player's companion (Who's who, Story
so far, Chapters, Bookmarks, Notes, History) in one `Companion` with three
variants: `column` on desktop, `inline` on a tablet, `sheet` on a phone.

- **`companion-model.ts`** (pure): which tabs a server gets (the two community tabs
  only with `metadata`), Who's who order, Story so far (recaps split by the book
  page's `splitRecaps`), the chapter rows (through `timeLeft`), and the reveal rules
  below.
- **`use-companion-data.ts`**: the playing book's community data and the listener's
  place, gated **exactly** as the book page gates it (`meta-gating.ts`, through
  `useListeningPosition`; see
  [State & data](state-and-data.md#spoiler-gating-srccomponentslibrarymeta-gatingts)) -
  never a fork of those rules. The chain itself (the `metadata` flag, the book, `/meta`,
  the chapters, the corrected starts) is `useBookCommunity`
  (`src/components/library/use-book-community.ts`), shared with the reveal listener
  and Previously on. Its `status` keeps the panels from flashing everyone hidden while
  the chapters load; an **unknown** `metadata` counts as off, as for the phone's
  chips. The loaded book's identity comes from `usePlayingTarget`
  (`playing-target.ts`: the same object until another book loads).
- **`companion-store.ts`** (`useCompanion`, memory only): the tab, **one shared
  reveal** per book (Show anyway in Who's who also reveals Story so far, as on the
  book page), and the "Just met" ids of the last crossing. It sits outside any view
  so the column, the inline companion, the phone's sheet and the toast's Show agree.
- **Panels:** `WhoPanel` (the book page's own `CharacterCard`, `HiddenStrip` and
  empty state; a description stays behind a per-card tap since it is written for the
  whole book), `StoryPanel`, `ChaptersPanel` (virtualised, opened on the current
  chapter), and the book page's `BookmarksSection` / `NotesSection` /
  `HistorySection` with an `onJump` that seeks the playing book in place (so the undo
  chip follows); those three say "This book's server isn't connected" without a
  client rather than throw. `Attribution` (`companion-pieces.tsx`) puts the server's
  `attribution` under every community block; the credit is the server's, never
  composed here.

**The reveal toast** is `CompanionRevealListener` (`reveal-listener.tsx`), mounted
once in the root layout so it fires wherever the listener is. It subscribes to
`usePlayer` and feeds each sample (position, playing, and the chapter read exactly
as Who's who's gate reads it, so the toast and the panel agree) to `watchReveal`, a
small pure state machine: the first playing sample is where the book is (a load or
resume, never a crossing); a sample that isn't playing (a pause, a buffer, the
moment between two files) is passed over, so a chapter that starts with a new file
still crosses from the last playing sample; a sample a natural step from the last
(`isNaturalStep`) is taken, and is a crossing when the chapter went up; anything
else is **held** until the next sample says what it was - a seek (taken, never a
crossing) or one write of a file change the native engine reports in two (dropped).
`revealOnCrossing` names only the people the new chapter reveals beyond the furthest
chapter reached this session, and nobody for a finished book. A hit marks them
`justMet` and toasts with **Show** (`showWhoIsWho`, which reads whether the player
is on top when pressed).

**Previously on** (Home, `src/components/home/previously-on.tsx`, rules in
`previously-on-model.ts`) reuses the same gate on the **saved** place: above the
Now card for an unfinished book left long enough ago (`PREVIOUSLY_ON_GAP_DAYS`), not
loaded, on a server with `metadata`, showing the furthest recap the saved place is
past. "Resume, with 30 seconds of overlap" (`resumeWithOverlap`) starts before the
**newest** saved place: a start at an explicit position skips the store's own resume
reconciliation, so it runs `loadInitialProgress` (server, mirror, offline queue)
against Home's row first, then `startBookInPlace` with that place's speed. The card
is dark in both themes through `ScopedThemeColors`.

## The player controls

The building blocks shared by the full player and the docked bar:

- **One chrome for the controls** (`control-pill.tsx`): `pillClass(look)` /
  `ControlPill` give every player control the same press, hover and focus states.
  **Touch targets:** a rem is 14 pt on native but 16 px on the web, so a rem-sized
  control takes `hitSlop={slopTo44(rem)}` (zero on the web); tests assert it with
  `expectNativeTarget` (`src/testing/touch-target.ts`).
- **Speed and sleep sheets.** The readouts only call `usePlayerSheets.openSheet`;
  the sheets are rendered by the active `PlayerSheetHost`
  ([above](#player-sheets-and-overlays)) through `PlayerSheet` (`player-sheet.tsx`:
  `body="scroll"` for plain content, `body="fill"` for content with its own
  scroller; children mount only while open). Speed is `speed-model.ts` (the grid,
  presets and stepping; `clampRate` in `rate.ts` holds the range); sleep is
  `sleep-sheet-model.ts` (the presets, the End of chapter tile through
  `chapterTimerTarget`, the "Or stop after" rows, the notice). Picking a timer
  records a touch (`noteInteraction`) and closes the sheet; the sleep readouts read
  only the phase (`useSleepPill`, `useSleepCountdown`).
- **The scrubbers share their parts** (`scrub-parts.tsx`: the web hover, the
  `Playhead`, the `ScrubTip`, which reports itself through `onTip` so the caller
  clears what sits above) and **one segment hook** (`use-playing-segment.ts`):
  `usePlayingSegment` gives the playing segment and its `kind` (`chapter`; `book`
  for a chapterless book with a whole-book timeline; `file` without a timeline), the
  live seconds into it, the commit and the bookmarks inside it; with `hold` it keeps
  the segment a drag started in. The commit goes through `scrubTarget`
  (`transport.ts`), which holds any scrub **30 s short of the book's end**: landing
  on the end would finish the book and take the undo chip with it. Both scrubbers
  ignore gesture-handler's keyboard pointer (the press it invents for Space and
  Enter on the web), scrub only on a sideways drag, and never commit a cancelled
  drag.
- **The seek bar** (`seek-bar.tsx`) draws stylised bars - **deliberately
  decorative**: `seek-texture.ts` seeds a speech-like envelope from the book and
  chapter, so a chapter always looks the same without pretending to show the sound
  (a `peaks` prop takes real peaks if the server ever computes them). The bars are
  drawn once per width and the played layer is revealed by a UI-thread clip, so a
  tick moves transforms, not colours. Gesture and accessibility come from
  `useSliderControl`, shared with `Slider`. `SeekTimes` is the row under it.
- **The whole-book timeline** (`book-timeline.tsx` + the pure
  `book-timeline-model.ts`): chapters merged into runs like the Now card's
  `scaleRuns`, each placed by time (`runBox`, the one mapping the playhead, taps and
  pins use); bookmark and note pins (`usePlayingPins`, through the playing book's
  connection, never throwing when it's gone) on the compact timeline too, where a
  tap on a pin lands on it; a tap or drag seeks through `scrubTarget`.
  `timelinePosition` never places the playhead before the start of the chapter the
  place is in, so a jump to a chapter's start names that chapter.
- **Rings** (`src/components/ui/progress-ring.tsx`): `ProgressRing` (a fraction the
  caller ticks) and `CountdownRing` (empties by itself, on the UI thread), both
  transform-only.
- **The transport cluster** (`transport-controls.tsx`) at three sizes; previous/next
  read the live position at press time through `stepSegment` (`transport.ts`:
  chapters, else files).
- **`prettify-title.ts` cleans filename-shaped labels for display.** Audiobook
  "chapter" labels are often just the audio *filename* (`01_the_hobbit_ch1.mp3`);
  `prettifyChapterTitle` strips a recognised extension, turns underscores into
  spaces and drops a trailing bitrate tag - but only for labels that already look
  like filenames. It is **display-only** and applied wherever a chapter or track
  label surfaces, through one helper, `chapterLabel()` (`src/lib/chapter-label.ts`),
  which falls back to "Chapter N" for an untitled chapter.

## Keyboard shortcuts (web)

`player-shortcuts.ts` holds the pure key map (`playerShortcutFor`) and the actions;
`use-player-shortcuts.ts` attaches it to the document, once, from the top web shell
(`(app)/_layout.web.tsx`), on every page **and over the full player**. Q (Up next,
`useUpNextShortcut`) and ⌘K / `/` (the palette, `usePaletteShortcut`) are separate
handlers that run on tab pages only, not over the full player or the credits. The
gating rules:

- never while typing (`isEditable`) or over another open layer (`isModalOpen`: an
  `aria-modal` `Sheet`, or a Radix Dialog, AlertDialog, menu or select, which say so
  with `data-state="open"`); Up next's sheet carries `UP_NEXT_LAYER`, so Q still
  closes the sheet it opened;
- never with Ctrl or Meta; Alt only for `[` and `]` typed through AltGr or Option;
- every key but `?` and Esc needs a book loaded;
- Space stands aside for a focused control Space activates (`ownsSpace`) and the
  arrows for one they move (`ownsArrows`), so Space still plays over a focused
  scrubber.
