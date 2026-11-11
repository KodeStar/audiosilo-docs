---
title: The app shell
description: "The chrome around the player's pages (src/components/shell/): the three form factors, the player in the shell, the web command palette, the sub-nav's sections and actions, the Up next drawer and sheet, the profile menu, and where toasts sit."
---

The chrome around the pages lives in `src/components/shell/`. There is **one
route tree on every platform**. Only the navigator that drives the five tabs, and
the chrome around it, differ. The routes, the `(app)` layouts and the routing
rules are in [Routes and navigation](routes.md).

## Three form factors

`useLayout()` (`src/lib/layout.ts`) is the one form-factor switch. The pure,
tested `layoutFor()` computes it from the window width. It is a
`useSyncExternalStore` over `Dimensions` that yields the class, so a consumer
re-renders only when the window crosses a threshold, not on every resize. The
page column width is `CONTENT_WIDTH` from the same module.

| Layout | Width | Chrome |
|---|---|---|
| `phone` | < 640 (`TABLET_MIN_WIDTH`) | A bottom tab bar and the mini player, with `PhoneHeader` on each page. See [Phone](#phone). |
| `tablet` | 640-1023 | `TopBar`, `SubNav`, the banners, the page, and `DockedPlayer` while a book is loaded. See [Tablet](#tablet). |
| `desktop` | >= 1024 (`DESKTOP_MIN_WIDTH`) | The tablet chrome with labelled destinations, plus the [Up next](#up-next-drawer-and-sheet) drawer. See [Desktop](#desktop). |

Every screen reads this one value. Never compare a width against a local
constant. The docked player bar is the tablet and desktop transport. Dialogs
follow the same split: on a phone they rise from the bottom like a sheet.

### Phone

- A bottom tab bar (native on iOS and Android, `PhoneTabBar` on the web) and
  the mini player.
- Each page's Stack header is `PhoneHeader`. On a tab root it shows a large
  display title. On a pushed page it shows an inline back button: named after
  the page it returns to on iOS, a bare arrow on Android and the web.
- The reconnect and offline banners sit under the header.

### Tablet

- **`TopBar`** is 64 high. It holds:
  - the mark with a server line;
  - the Home, Library, Downloads and You destinations as icons;
  - the omnisearch field, or a search icon button that does the same when the
    bar's middle measures under `OMNISEARCH_MIN` (180), as at 640-760;
  - the `UpNextButton`;
  - the Settings gear (`openSettings`);
  - the `ProfileMenu`.

  "You" is the Me tab's destination, through its `wideLabelKey` and `wideIcon`.
  The phone's tab bar shows "Me" with a person; the top bar shows "You" with a
  chart.
- **`SubNav`** is 50 high. On a tab root it shows the page title followed by
  whatever the root publishes (see
  [Sub-nav sections and actions](#sub-nav-sections-and-actions)). On a pushed page
  it shows a Back button. Home has no sub-nav.
- The banners sit under the sub-nav.
- The page is capped at 1480 wide (`CONTENT_WIDTH`).
- **`DockedPlayer`** (84 high) shows whenever a book is loaded.
- Up next opens as a bottom sheet.

### Desktop

Desktop has the tablet chrome with these additions:

- the destinations are labelled;
- the profile button shows the user's name;
- on the web, the omnisearch shows a ⌘K or Ctrl K hint;
- the `DrawerSlot` beside the page holds the
  [Up next](#up-next-drawer-and-sheet) drawer.

## The player in the shell

The mini player, the iOS 26 accessory, the docked bar, the full player and the
player's sheets and overlays are described in [Player UI](player-ui.md). Both
`(app)` layouts mount `ShellPlayerOverlays` at the shell's root
([Player UI](player-ui.md#player-sheets-and-overlays)).

## Command palette (web)

`CommandPalette` (`src/components/shell/command-palette.tsx`) is a web-only
search-and-command box on the `Dialog` primitive, mounted once by the web shell.
It opens from the top bar's omnisearch field (web tablet and desktop), from ⌘K or
Ctrl+K, or from a bare `/`. `usePaletteShortcut` ignores the keys while focus is
in an editable field or another modal dialog is open. It listens only while a
tab page is showing, never over the player modal. A **native** tablet's
omnisearch still jumps to the Search tab instead.

### State

The palette's state is `usePalette` (`palette-store.ts`): whether it is open, and
the query, which every open clears. The **recent searches** are the Search
screen's list, `useRecentSearches` (see
[State & data](state-and-data.md#search-srcstoressearchts)), hydrated on the
first open. The palette remembers a search when it leads somewhere, that is,
when the listener runs an item with a non-empty query.

### What shows

The pure, tested `palette-model.ts` decides what shows. `buildPaletteGroups`
returns these groups, in order, and drops the empty ones:

1. **Actions**, matched on their title, or also on their subtitle once there is
   a query (see [Actions](#actions)).
2. With a query, **Books**: up to 8 results from the Search screen's `useSearch`,
   debounced with `useDebouncedValue`. `useSourceLabeller` labels each with its
   source, as on the Search screen.

   With an empty query, **Continue listening** takes this place instead: up to 4
   books that pass `isInProgress`, the same rule as Home. They come from the
   cached `useAllProgressAll` with `refetchOnMount: false`, which is disabled
   while a query is typed.
3. With a query, **Series**, **Authors**, **Narrators** and **Characters**, three
   each (`MAX_NAMED`), from the same `useSearch` call with
   `refetchProgress: false`. The characters not met yet are a `GroupNote` row
   that is not an option, so the arrow keys skip it.
4. **Go to** (`buildGoToItems`): `TOP_BAR_TABS`, already filtered to what this
   browser can do. You is the exception: it goes by its sections instead, Your
   listening and Year in listening (`openYou`) and the Journal (`openJournal`).
   Then come Settings (`openSettings`) and Household (`openHousehold`).

A series opens `openSeries` with its local name, a person opens their page, and
a character opens the book it is from.

The module also owns the arrow-key clamp (`moveSelection`, with no wrap), the
recent list (`addRecent`), the shortcut test (`isPaletteShortcut`) and the key
hint (`shortcutHint`: ⌘K on Apple platforms, Ctrl K elsewhere).

### Actions

The palette offers only actions that exist today. The pure `buildActionItems` in
`palette-model.ts` decides which show:

- with a book loaded:
  - pause, or "Resume &lt;chapter&gt;";
  - *Sleep in 30 minutes*;
  - *Sleep at end of chapter*, only when the book has real chapters. Without
    them the end-of-chapter timer falls back to a duration, which the label would
    misdescribe;
  - *Open the full player*;
- *Open Up next*, with the queued count, when the queue's server has `queue`
  (`openUpNext()`);
- always, the light and dark switch.

Settings is a place, so it is under Go to. The two sleep actions confirm with a
`toast`.

### Shortcut guards

Up next's Q and the player's keyboard shortcuts share the guards in
`src/lib/keyboard.ts`: `isEditable`, `isModalOpen`, and `ownsSpace` and
`ownsArrows` for the player's Space and arrows. No global shortcut fires while
typing or over a modal dialog, and the palette's keys and Q run on tab pages
only. The player's own keys are in
[Player UI](player-ui.md#keyboard-shortcuts-web).

### Accessibility

The input is a combobox with `aria-activedescendant` over a grouped listbox. The
matched text is bold in `brand-ink`, and the footer shows key hints and the
result count. A book opens with a plain push, so it lands in the current tab.

## Sub-nav sections and actions

The Stacks sub-nav row is "Title [segmented control of sections] [contextual
actions]". A **tab root** fills it from its own tree with two components in
`src/components/shell/tab-root-nav.tsx`:

- `SubNavSections({ tab, options, value, onChange, accessibilityLabel })` is ONE
  scrollable `SegmentedControl` (options may carry a `count`). On tablet and
  desktop it publishes itself into the sub-nav and renders nothing in place. A
  tablet drops the page title when there are sections, to give them the room. On
  a phone it renders right where it is, so put it under the large title.
- `SubNavActions({ tab, id, order, children })` holds contextual actions, such
  as the Library's picker, sort and grid or list switch, or the Downloads summary
  line. Several components can each publish their own, keyed by `id` and sorted
  by `order` (lower first) at the row's right end. On a phone the `children`
  render in place.

Both write through `usePublish` into the `useSubNav` store (`sub-nav-store.ts`),
keyed by tab. NativeTabs keeps every visited tab mounted, so each root publishes
under its own tab, and `SubNav` reads the active one's with `useSubNavSlot`. A
publication is refreshed after every render of its publisher and withdrawn on
unmount.

**Published nodes render in the sub-nav's tree**, not the screen's. So they must
not need the screen's context (`ContentScope`, local providers). Tab roots carry
none.

## Up next: drawer and sheet

Up next lives in `src/components/upnext/` and needs the capability `queue`.
Nothing renders while `/server` is unknown, so nothing flashes. One
`UpNextPanel` sits in two containers:

- **Desktop:** `UpNextDrawer` in the shell's `DrawerSlot`, between the top
  chrome and the docked player. It is open by default and collapsible. Dragging
  its left edge sizes it from 300 to 480 wide (`DRAWER_MIN` and `DRAWER_MAX`,
  default 360); on the web the edge is a keyboard-steppable handle. `useUpNext`
  (`up-next-store.ts`) remembers the width and the collapsed state per device,
  as a `persistedDocument` under `audiosilo.upNext`, hydrated when the drawer
  first mounts.
- **Tablet and phone:** `UpNextSheet`, a player sheet (`usePlayerSheets`'
  `upnext`) rendered by the active `PlayerSheetHost`. So it opens over the full
  player as well as over the shell
  ([Player sheets](player-ui.md#player-sheets-and-overlays)). Its open state is
  never persisted, so a sheet can't open itself at launch. A row or a suggestion
  opens its page through `useOpen`, which from over the full player lands in the
  shell underneath (`pushInShell`).

`openUpNext()`, `closeUpNext()` and `toggleUpNext()` pick the drawer or the sheet
by the window's form factor at call time. The entry points are:

- `UpNextButton`, the queue glyph with a count badge: in the top bar
  (`variant="bar"`), in the phone header on tab roots (`"header"`), in the docked
  player (`"dock"`, with no count) and as the full player's pill (phone and
  tablet);
- the palette's *Open Up next*;
- **Q** on the web (`useUpNextShortcut`). It never fires while typing, with a
  modifier, or over another modal. The sheet it opened carries `UP_NEXT_LAYER`,
  which doesn't count as another modal, so Q closes it again.

### One connection's queue

The panel shows **one connection's queue**. `queueConnectionId` picks the loaded
book's server, else the default, else the first; a removed connection falls
through. `useUpNextData(cid)` holds everything the panel shows and does.

Its writes keep the rows the listener can't see, by the
[write rules for the listener's own state](state-and-data.md#the-listeners-own-state-player-redesign-phase-1b).
A reorder is `useAddToQueue` with `position`, and a removal is an exact-path
delete. So **Clear** is one exact-path delete per visible entry, followed by one
Undo toast that adds them back in order.

Reordering works three ways:

- a gesture-handler drag on the grip (`dragTarget` and `dragShift` are
  worklets);
- ArrowUp or ArrowDown on the focused grip, or Alt+arrows anywhere in the row
  (`keyMove`);
- the screen reader's Move up and Move down actions.

### Drag and drop, suggestions and auto-play

On the web desktop, `CoverTile` covers are HTML5 drag sources
(`drag-source.web.ts`, payload type `application/x-audiosilo-book`). The drawer's
`DropZone` (`drop-zone.web.tsx`) accepts only a book from the queue's own server
(`canDrop`). Native gets no-op twins.

"Continue the series and more" is `pickSuggestions`. It offers, at most four, in
this order:

1. the loaded book's `/next` answer;
2. books in progress on that server;
3. the community rail's next work, as a ghost, when the server couldn't place
   it.

It never offers the loaded book or one already queued.

The footer switch is the `autoPlayNext` setting, labelled "Play the next book
automatically", with a hint that says what it does: Up next first, then the
series.

### Leaving the queue

When a book ends, the queue's head plays first (see
[what plays next](end-of-book.md#what-plays-next-up-next-resolverts)). The book
that starts from it and the finished book leave the queue through
`dropFromQueue` (`src/components/player/queue-drop.ts`). Any other start leaves
it too, through `dropStartedBook`, once the started book is the book loaded: a
queued book started from its page, a browse row, the car or Play now.

With an episode loaded, the suggestion's label is "Next episode", and the footer
switch is worded for Up next only, because after an episode only Up next's head
plays.

## Profile menu

`ProfileMenu` (`src/components/shell/profile-menu.tsx`) is the top bar's profile
button and a `DropdownMenu`. The button shows the person listening's initial,
plus their name on desktop. The menu holds:

- "Listening as" the active [profile](profiles.md);
- an item per other person on the device, with their name and "Switch to
  &lt;name&gt;" as its accessibility label. It switches through
  `useChooseProfile`, PIN included;
- **Who's listening?** (`openProfiles()`);
- every server of the person listening with its state, each opening that
  server's account screen. The state comes from the pure `serverStatus()`
  (`src/api/reachability.ts`): "needs signing in again" (the reconnect flag)
  wins over "offline", else "Signed in as &lt;user&gt;";
- **Add a server** (`/connect?add=1`). As in Settings' accounts pane, it is
  hidden when the served web player is signed in only to its own server
  (`onlyOwnServer(servedOrigin(), ...)`);
- **Journal** (`openJournal()`);
- **Household** (`openHousehold()`);
- **Settings** (`openSettings()`);
- **Account on &lt;default server&gt;**;
- a light and dark appearance switch (`useTheme().toggleScheme()`, which the
  palette's action uses too).

A phone keeps all of this in the Me tab's You hub.

The same `serverStatus()` drives the top bar's server line (`serverLine`). It
shows the default server's name, or for that server "Offline · downloads play"
or "Needs signing in again". Else it shows "&lt;server&gt; isn't answering" for
another server that `firstOffline` finds, else the name with "+ N more".

The docked bar's sync line is `usePlaceSync`. In order of precedence it shows
sign in again, then saved on this device, then synced or synced just now (see
[Player UI](player-ui.md#mini-player-accessory-player-docked-player)).

## Toasts

The root layout mounts `ShellToastHost` (`shell-toast-host.tsx`), the app's one
`<ToastHost>`. It lifts toasts clear of whatever chrome is at the bottom:

- on a phone, the tab bar plus the mini player (or the iOS 26 accessory);
- on tablet and desktop, the docked player bar;
- at any width, the sleep timer's floating grace card while it shows (the
  `grace` piece, which sits above the rest, so toasts lift over it).

### Measuring the bottom chrome

Each piece of bottom chrome (`bar`, `mini`, `accessory`, `dock`, `grace`)
publishes its **measured top edge**, its distance from the window's bottom, into
`useShellMetrics` (`shell-metrics.ts`) with `useChromeEdge` (`setChromeEdge`
underneath).

The native tab bar can't be measured directly, so each tab stack derives the
`bar` edge with `nativeBarEdge()`. That is the gap between the page's bottom and
the shell frame's own measured bottom (`setFrameBottom`), both read with
`measureInWindow`, but never less than the page's bottom safe-area inset. iOS
lays the page out under its bar, so there the inset is the bar. Comparing
against the window height instead made the Android bar a status bar too tall,
because under edge-to-edge Android's `measureInWindow` is offset by the status
bar. Each stack publishes only once it has measured.

`bottomChromeTop()` takes the highest piece. The pure `toastBottomOffset()`
(`toast-offset.ts`) turns it (`chromeTop`) into the toast's offset, with one
fallback before the first layout. With no bottom chrome (tablet or desktop with
nothing loaded), or over a root modal such as the full player, toasts sit just
above the home indicator.
