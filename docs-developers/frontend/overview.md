---
title: Player app overview
description: "The audiosilo-frontend codebase: one Expo / React Native project shipping to web PWA, iOS and Android - stack, source layout, route map, the shell (sub-nav, Up next, palette), the Library modes, the browse building blocks, styling conventions, and the environment gotchas that bite first."
---

The player (`audiosilo-frontend`) is the **read side** of AudioSilo: one codebase
that ships to a **web PWA, iOS, and Android**. It consumes the server's JSON API
(hand-mirrored types, no codegen - see the
[cross-repo contract](../architecture/cross-repo-contract.md)), addresses all
content by `(library_id, rel_path)`, and owns exactly one hard problem:
[playback](playback.md).

## Stack

| Concern | Choice |
|---|---|
| Framework | **Expo SDK 56**, **React Native 0.85** (new architecture), **React 19** |
| Routing | **Expo Router** (file-based, routes live in `src/app/`): `NativeTabs` on iOS/Android, headless `expo-router/ui` Tabs on web - see [The shell](#the-shell-tabs-and-navigation) |
| Styling | **Uniwind** (Tailwind v4) - `className` on core RN components, on every platform. Web player floor: Safari 16.4, Chrome 111, Firefox 128 (Tailwind v4's CSS) |
| Design system | **Stacks** (`STYLEGUIDE.md`, authoritative): semantic light/dark tokens, Figtree / Bricolage Grotesque / JetBrains Mono, and **react-native-reusables** primitives (shadcn/ui for React Native on `@rn-primitives`) restyled to it - see [Styling conventions](#styling-conventions) |
| Server state | **TanStack Query** (`src/api/hooks.ts`, provider in `src/api/provider.tsx`) |
| Client state | **Zustand** (`src/stores/`, plus the playback and downloads stores) |
| Lists | **FlashList v2** (`@shopify/flash-list`) for the cover shelves and grids (`ShelfRow`, `CoverGrid`) |
| Audio | A **custom native Expo module**, `modules/audiosilo-player`: `AVQueuePlayer` on iOS, `Media3/ExoPlayer` on Android; **HTML5 Audio + Media Session** on web. There is no react-native-track-player dependency - older docs that mention it are stale. |
| Icons | FontAwesome Pro 7 glyphs **vendored as raw SVG path data** in `src/components/ui/icon-data.ts`, drawn with `react-native-svg`. No `@fortawesome/*` dependency, so no private npm token is needed to build. |
| Secrets | **expo-secure-store** (Keychain/Keystore) for session tokens; **AsyncStorage** for everything else (`src/lib/secure-store.ts` / `src/lib/storage.ts`) |
| i18n | **i18next + react-i18next + expo-localization** (`src/i18n/`) - see [Internationalisation](i18n.md) |

## Source layout

```
src/app/            Expo Router routes: (app) with its five tab groups, connect/
                    onboarding, the player + finished modals, demo landing,
                    +html.tsx web shell
src/api/            client.ts (typed fetch wrapper), types.ts (wire mirrors),
                    hooks.ts (React Query), provider.tsx (multi-connection registry),
                    reachability.ts (online/offline tracking)
src/playback/       PlaybackService interface + per-platform engines, the player store,
                    book-queue (timeline math), progress-sync (offline-safe saves),
                    sleep-timer (+ auto-sleep, use-shake-to-extend, drift, last-
                    interaction), transcode (web negotiation), up-next-resolver
                    (what plays next), jump-undo, time-left, rate helpers
src/downloads/      offline downloads: native/web engines, registry store, the
                    keep-ahead planner + controller, failure classification, the
                    offline companion (offline-meta: community metadata kept with a
                    download) and the Downloads page's pure view model (a sibling of
                    playback, not inside it)
src/components/     ui/ (the Stacks primitives - Text, Icon, Button, Card, Input,
                    Dialog, Select, Tabs, Toast, Sheet... see Styling), shell/ (tab
                    destinations, auth gate, phone header + tab bar, top bar, sub-nav,
                    docked player, accessory player, sub-nav slot), layout/
                    (reconnect + offline banners, ContentScope), player/,
                    library/ (covers, shelves, grids, the Library modes, the
                    collection/person/series route screens), series/ (bookcase,
                    person pages), book/ (the book page), annotations/
                    (bookmark and note rows, editors, labels), journal/ (the
                    Journal and its export), home/, search/, upnext/, downloads/
                    (the Downloads tab), account/, brand/
src/stores/         Zustand: session (connections + tokens), settings, search
                    (+ recent searches), series-orderings, library-selection
src/i18n/           i18next init, LanguageProvider, locale catalogs (locales/*.json)
src/theme/          tokens.json (the colour source) -> generated tokens.ts,
                    ThemeProvider (fonts + theme), scheme-pref (the default-theme
                    rule), useThemeColors (a context ThemeProvider fills)
src/lib/            storage, secure-store, paths, format, hhmm (wall-clock "HH:MM"),
                    ticker (one start/stop interval), pairing, known-servers, device,
                    base-url, layout (the three form factors), utils (cn),
                    storage-migration (the one launch-time storage migration),
                    register-sw, and other pure helpers
modules/audiosilo-player/  the local Expo module (Swift + Kotlin + TS bridge)
public/             sw.js (service worker) + manifest.json (PWA), copied verbatim
                    into the web export
STYLEGUIDE.md       Stacks, the player's design system (authoritative for its look)
```

Two conventions keep this layout healthy:

- **Logic stays out of `src/app/**` screens.** Screens compose components and
  hooks; anything with behavior worth testing lives in `src/lib`, `src/api`,
  `src/playback`, `src/downloads` or `src/stores`, where it gets a co-located
  unit test (the coverage config excludes `src/app/**` entirely - see
  [Testing](testing.md)). The redesigned screens take this one step further:
  their route file is a one-line re-export (`export default HomeScreen`), the
  screen lives with its components under `src/components/<feature>/`, and each
  feature keeps its rules in a pure, tested `*-model.ts` (`home-model.ts`,
  `series-model.ts`, `search-model.ts`, `up-next-model.ts`, `books-view.ts`,
  `downloads-view.ts`, `keep-ahead.ts`, `book-page-model.ts`, `diary-model.ts`,
  `editor-model.ts`).
- **Path is identity, scoped by connection.** Every content call passes
  `?path=<rel_path>`, never a database id. Because the app can be signed in to
  several servers at once (and two can share a library id), durable and cached
  client state keys on `(connectionId, library_id, path)` - see
  [State & data](state-and-data.md).

## Route map

Expo Router derives routes from the files under `src/app/`. The three top-level
groups are the authenticated app `(app)`, the `connect/` onboarding flow, and a
handful of standalone screens. Inside `(app)`, every screen sits in one of five
**tab groups** - `(home)`, `(library)`, `(search)`, `(offline)`, `(me)` - or in
the shared array group `(home,library,search,offline,me)`, which expands into all
five (see [The shell](#the-shell-tabs-and-navigation)). Groups are invisible in
URLs, so every URL below is the same as before the groups existed.

| Route | File | Purpose |
|---|---|---|
| - (root layout) | `src/app/_layout.tsx` | Mounts the provider tree (`GestureHandlerRootView` → `SafeAreaProvider` → `RootInsetsProvider` → `LanguageProvider` → `ThemeProvider` → `ApiProvider`), awaits the memoised launch migration `migrateStorage()` (`src/lib/storage-migration.ts`: the theme default, then `resetStaleStorage`) before it hydrates the session/settings/downloads/series-orderings/library-selection stores, imports `@/lib/register-sw` for its side effect, mounts the headless `BookEndedListener` (drives the end-of-book flow, see [The end of a book](end-of-book.md#ending-a-book)), `CompanionRevealListener` (the "New in Who's who" toast, see [Player UI](player-ui.md#the-companion-companion)) and `ShakeToExtendListener`, starts the framework-free `startAutoSleep()` controller (arms the nightly sleep timer, see [The sleep timer](sleep-timer.md#auto-sleep-timer-auto-sleepts--auto-sleep-controllerts)), `startDriftWatch()` (the Fell asleep bookmark and the jump back, see [The sleep timer](sleep-timer.md#fell-asleep-drift-controllerts)), `startJumpUndo()` (see [Player UI](player-ui.md#undo-a-jump-jump-undots)) and `startKeepAhead()` (downloads the next books when the listener opted in, see [Offline](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts)), and runs `useAppResume` (foreground refresh + the Android swipe-from-recents reset). Declares the `(app)` stack (the root stack's `anchor`, so it always sits at the bottom) and the `player`/`finished` screens as `fullScreenModal`s. Mounts `<PortalHost />` and `<ShellToastHost />` **last**, inside the providers, so portaled overlays and toasts stack above every screen (see [toasts](#toasts)). |
| - (web HTML shell) | `src/app/+html.tsx` | The static HTML wrapper for every exported web route: PWA manifest/favicon links (base-prefixed), the CSS cascade-layer order, and a backdrop in the OS colour scheme's background (light, or dark under `prefers-color-scheme: dark`) painted before React mounts so there is no flash. |
| `(app)` layout, native | `src/app/(app)/_layout.tsx` | `AuthGate` (`src/components/shell/auth-gate.tsx`: `loading` → spinner, `unauthenticated` → `<Redirect href="/connect" />`; also backfills `has_password`/`has_recovery` on sessions persisted before those flags existed), then **`NativeTabs`** with one trigger per destination (SF Symbols on iOS, Material Symbols on Android) and, on iOS 26, the mini player as the tab bar's `BottomAccessory`. On tablet/desktop the native tab bar is `hidden` and the shell's own top bar, sub-nav and docked player take over; `ShellFrame` (`shell-frame.tsx`) draws that chrome around the navigator in both `(app)` layouts. On a phone without the iOS 26 accessory it also renders the one `FloatingMiniPlayer` as the frame's `phoneBottom`, over NativeTabs. |
| `(app)` layout, web | `src/app/(app)/_layout.web.tsx` | `AuthGate`, then **headless `expo-router/ui` `Tabs`** over the same route groups: a hidden `TabList` registers the five tab routes, one `<TabSlot />` renders the page, and `ShellFrame` surrounds it with our chrome (phone: `MiniPlayer`, sitting on the tab bar through a `100%` bottom offset, + `PhoneTabBar`; tablet/desktop: top bar, sub-nav, banners, `DockedPlayer`). Also mounts the web-only `CommandPalette` and its keyboard shortcut (`usePaletteShortcut`). |
| tab stacks | `(app)/(home,library,search,offline,me)/_layout.tsx` | ONE layout file that becomes each tab's `Stack`. Its group-keyed `unstable_settings` (`TAB_STACK_SETTINGS`) give each stack its root route; `screenListeners` is `tabStackListeners`. On a phone each page's Stack `header` is `PhoneHeader`; tablet/desktop hide it. |
| `/` | `(app)/(home)/index.tsx` → `src/components/home/home-screen.tsx` | Home, aggregated **across every connected server**: the greeting and sync pill, the Now card, This week (`user_stats`), Continue listening, Next in your series (`next_book`), smart shelves, Recently added, Favourites, Recently finished. The rules are `home-model.ts` (which book leads, the shelves, the `/next` candidates) and `listening.ts` (streak, bars and pace in **server** time); see [Home](state-and-data.md#home). |
| `/browse?type=recent\|finished` | `(app)/(home,library,search,offline,me)/browse.tsx` → `src/components/library/books/see-all-screen.tsx` | The "See all" cover grid behind Home's Recently finished shelf (Recently added's See all opens the Library's Books mode with `sort=recent` instead). |
| `/search` | `(app)/(search)/search.tsx` → `src/components/search/search-screen.tsx` | Search across all connections: books (de-duplicated), series, people and met characters, in groups with their own loading/error states (`useSearch`, shared with the palette; see [Search](state-and-data.md#search-and-the-spoiler-model)). Empty, it shows the recent searches and Browse cards. The query lives in `useSearchStore`, so it survives the screen remounting. On a **native tablet** the top bar's search field jumps here and bumps the store's `focusRequest`, which re-keys the input so it takes focus; on web the same field opens the [command palette](#command-palette-web) instead. Leaving the Search tab clears the query (`useShellEffects`). |
| `/library?mode=…` | `(app)/(library)/library/index.tsx` → `src/components/library/library-screen.tsx` | The Library tab root: the browse modes `books` (absent = books), `authors`, `series`, `narrators`, `collections`, `folders` - see [The Library modes](#the-library-modes). Books mode also reads `sort` (`recent\|title\|author\|length`), `status` (`new\|progress\|finished`), `dl=1` and `len` (`short\|mid\|long`), which Home's links set. |
| `/series?connection=…&library=…&name=…&work=…` | `(app)/(home,library,search,offline,me)/series.tsx` → `src/components/library/series-screen.tsx` | The series bookcase. `name` is a **local** series (the exact `Book.series` value, the `series=` filter of `GET /books`); `work` is a community work id whose rails to show (how a series the listener owns nothing of is reached). At least one; with both, `name` lists the owned books and `work` supplies the reading orders and ghosts. |
| `/author?connection=…&library=…&name=…`, `/narrator?…` | `author.tsx` / `narrator.tsx` (same group) → `src/components/library/person-screen.tsx` | A person page: the books whose `Book.author` / `Book.narrator` is **exactly** `name` (a joint credit is one name, as the server lists it), series shelves, other books, Read by / Books by chips. A narrator filter needs `browse_people`; an older server shows a "can't list books by narrator yet" state. |
| `/collection?connection=…&id=…` | `collection.tsx` (same group) → `src/components/library/collection-screen.tsx` | A collection (per server, not per library: its items can span libraries). Owner: Edit, Share, Delete, Move up / Move down / Remove in the list view; viewer (`owned: false`): Leave. A `404` reads as deleted or no longer shared. |
| `/library/favourites` | `(app)/(home,library,search,offline,me)/library/favourites.tsx` → `src/components/library/collections/favourites-screen.tsx` | The hearted books (cover grid) and folders of every server. |
| `/library/[libraryId]?connection=…&path=…` | `(app)/(home,library,search,offline,me)/library/[libraryId].tsx` | Library browse, root and nested folders alike - a two-line re-export of `src/components/library/browse-screen.tsx`. Content routes are **flat**: the connection id and the library-relative folder `path` ride as query params, never as nested route segments (an in-app `router.push` cannot resolve a route nested under a dynamic layout segment - it lands on the group's first child; rationale and helpers in `src/lib/paths.ts`). Each content screen scopes itself to its own `?connection=` with `<ContentScope>`, and the content hooks read that scope via `useScopedCid()`. |
| `/book/[libraryId]?connection=…&path=…&tab=…` | `(app)/(home,library,search,offline,me)/book/[libraryId].tsx` → `src/components/book/book-page.tsx` | The book page: a cover-tinted hero (crumbs, eyebrow, title, byline, facts, the listener's place or the finished badge and stars), the action row (Resume chapter N / Start listening / Listen again / Pause, the download control, Up next, favourite, collection, the book menu), the tabs (Chapters/Parts/Files, Recaps, Characters, Bookmarks, History, Notes, Series, Details) and the aside (About, Other versions, Your listening), laid out by the page's **measured** width. An optional `tab` (`parseBookTab`) opens it on that tab when the tab exists (Home's Who's who and Story so far use `characters` / `recaps`, the Journal's rows `bookmarks` / `notes` / `history`). See [The book page](book-page.md). Same flat query-param addressing as the library routes. |
| `/downloads` | `(app)/(offline)/downloads.tsx` → `src/components/downloads/downloads-screen.tsx` | The Downloads page: storage per server, the automatic-download rules (including keep-ahead), in-progress and failed downloads, and the books ready offline by server ([Offline](offline.md#the-downloads-page)). The group is `(offline)`, not `(downloads)`, on purpose - see [cold deep links](#the-shell-tabs-and-navigation). |
| `/settings` | `(app)/(me)/settings.tsx` | The root of the **Me** tab (a fuller Me hub is a later redesign phase). A Journal row (`JournalEntryRow`) on top, then app-level preferences: playback tunables, the auto sleep timer's window and type, shake to extend and its sensitivity (native; the row says so on web), up-next/download behaviour, language, theme, plus the Servers list that opens each connection's account screen. |
| `/journal?tab=diary\|bookmarks\|notes` | `(app)/(home,library,search,offline,me)/journal.tsx` → `src/components/journal/journal-screen.tsx` | The Journal: the Diary of listening sessions by day, and the listener's bookmarks and notes, on every signed-in server (`journalHref`, `parseJournalTab`; an unknown tab is the Diary). Reached from the Settings screen's Journal row, the profile menu, the palette's Go to and a book's Bookmarks / Notes tabs. See [The Journal](journal.md). |
| `/account?connection=…` | `(app)/(home,library,search,offline,me)/account.tsx` | Per-connection account screen, reached from the Settings screen's Servers list: set/change the self-service password (the sign-out guard nudges a password-less user here via `sign-out-confirm.tsx`), pairing another device, personal API keys (capability-gated, demo-hidden), and sign-out. |
| `/player` | `src/app/player.tsx` | The full player ([Player UI](player-ui.md#the-full-player)), presented as a full-screen modal above the tabs on every form factor (opened from the mini player, the iOS accessory player, the docked player bar, or a phone's Listen button). Accepts `libraryId`/`path` (+ optional `position`/`track`) params and gates playback start on the chapters query settling. |
| `/finished` | `src/app/finished.tsx` | The end-credits screen shown when a book finishes (or from the player's menu). A root modal sibling of the player; `connection`/`libraryId`/`path` params, plus `auto=1` when the book ended (or was marked finished) rather than being opened early. Renders `EndCredits`: the year shelf, listening stats, a rating, and the book `resolveUpNext` says plays next. See [The end of a book](end-of-book.md#ending-a-book). |
| `/connect` layout | `src/app/connect/_layout.tsx` | Onboarding stack (a spinner while the session hydrates). It deliberately does not decide redirects: on a link arriving while the app runs, the child's params only reach the layout after the child mounts. |
| `/connect` | `connect/index.tsx` | Enter a server URL (or auto-redeem a pairing token arriving via deep link / QR `web_url`). An **authenticated** user is bounced home from here, from this route's own params, unless they are adding another server (`?add=1`, a pairing `?token=`, or a sign-in mid-flow via `pendingServerUrl`) - the app supports multiple simultaneous server connections. When signed out of everything, also lists previously-connected servers as one-tap **Reconnect** shortcuts (`src/lib/known-servers.ts`), each pre-filling the address so the user only re-enters a code or password. Onboarding returns to the app through `leaveOnboarding()` (`src/components/shell/leave-onboarding.tsx`, which calls `router.dismissTo('/')`; `<LeaveOnboarding />` when the decision is made at render time), never `replace` or `<Redirect href="/">` (also a replace): `(app)` already sits under `/connect` as the root stack's anchor, so a replace stacked a second `(app)`. |
| `/connect/scan` | `connect/scan.tsx` | Camera QR scanner (`expo-camera`) for the pairing QR. |
| `/connect/sign-in` | `connect/sign-in.tsx` | Auth-code **or** username/password sign-in against the pending server. Reached fresh, from a **Reconnect** shortcut, or from the dead-token `ReconnectBanner` (`src/components/layout/reconnect-banner.tsx`), all with the address pre-filled via `pendingServerUrl`. The code field redeems invite codes (legacy recovery codes still redeem server-side, but the app no longer mints them). |
| `/demo` | `src/app/demo.tsx` | Public demo landing: mints a throwaway session on a demo-mode server and shows the pairing QR so the same demo user opens on a phone. |

## The shell: tabs and navigation

The chrome around the pages lives in `src/components/shell/`. There is **one
route tree on every platform**; only the navigator that drives the five tabs and
the chrome around it differ.

### Three form factors

`useLayout()` (`src/lib/layout.ts`) is the one form-factor switch, computed from
the window width by the pure, tested `layoutFor()`. It is a `useSyncExternalStore`
over `Dimensions` that yields the class, so a consumer re-renders only when the
window crosses a threshold, not on every resize. The page column width is
`CONTENT_WIDTH` from the same module.

| Layout | Width | Chrome |
|---|---|---|
| `phone` | < 640 (`TABLET_MIN_WIDTH`) | A bottom tab bar (native on iOS/Android, `PhoneTabBar` on web) and the mini player; each page's Stack header is `PhoneHeader` (a large display title on a tab root; on a pushed page an inline back button, named after the page it returns to on iOS, a bare arrow on Android and web); the reconnect and offline banners sit under the header. |
| `tablet` | 640-1023 | `TopBar` (64 high: the mark with a server line, the Home / Library / Downloads destinations as icons, the omnisearch field - a search icon button doing the same when the bar's middle measures under `OMNISEARCH_MIN` (180), as at 640-760 - the `UpNextButton`, settings, and the `ProfileMenu`), `SubNav` (50 high: the page title on a tab root followed by whatever the root publishes - see [Sub-nav sections and actions](#sub-nav-sections-and-actions) - and a Back button on a pushed page; Home has none), the banners, the page capped at 1480 wide (`CONTENT_WIDTH`), and `DockedPlayer` (84 high) whenever a book is loaded. Up next opens as a bottom sheet. |
| `desktop` | >= 1024 (`DESKTOP_MIN_WIDTH`) | The tablet chrome with labelled destinations, the user's name on the profile button and (web) a ⌘K / Ctrl K hint in the omnisearch, plus the `DrawerSlot` beside the page, which holds the [Up next](#up-next-drawer-and-sheet) drawer. |

Every screen reads this one value - never compare a width against a local
constant. (This replaced the single 1024px `WIDE_BREAKPOINT`; the old right-hand
player panel is gone, and the docked player bar is the tablet/desktop
transport.) Dialogs follow the same split: on a phone they rise from the bottom
like a sheet.

### The player in the shell

The mini player, the iOS 26 accessory, the docked bar, the full player and the
player's sheets and overlays are described in [Player UI](player-ui.md). Both
`(app)` layouts mount `ShellPlayerOverlays` at the shell's root
([Player UI](player-ui.md#player-sheets-and-overlays)).

### Command palette (web)

`CommandPalette` (`src/components/shell/command-palette.tsx`) is a web-only
search-and-command box on the `Dialog` primitive, mounted once by the web shell.
It opens from the top bar's omnisearch field (web tablet/desktop), from ⌘K /
Ctrl+K, or from a bare `/`. `usePaletteShortcut` ignores the keys while focus is in
an editable field or another modal dialog is open, and only listens while a tab
page is showing (never over the player modal). A **native** tablet's omnisearch
still jumps to the Search tab instead.

- **State** is `usePalette` (`palette-store.ts`): open and the query (cleared on
  every open). The **recent searches** are the Search screen's list,
  `useRecentSearches` (see [State & data](state-and-data.md#search-srcstoressearchts)),
  hydrated on the first open. A search is remembered when it leads somewhere (an
  item is run with a non-empty query).
- **What shows** is the pure, tested `palette-model.ts`: `buildPaletteGroups`
  returns, in order, **Actions** (filtered by title, or by subtitle once there is
  a query), then **Books** (up to 8 results from the Search screen's `useSearch`,
  debounced with `useDebouncedValue`, each labelled with its source by
  `useSourceLabeller` like the Search screen) - or, with an empty query,
  **Continue listening** (up to 4 books that pass `isInProgress`, the same rule
  as Home, from the cached `useAllProgressAll` with `refetchOnMount: false`,
  disabled while a query is typed) - then, with a query, **Series**,
  **Authors**, **Narrators** and **Characters** (`MAX_NAMED`, three each, from
  the same `useSearch` call with `refetchProgress: false`; the characters not
  met yet are a `GroupNote` row that is not an option, so the arrow keys skip
  it), then **Go to** (`TOP_BAR_TABS`, already filtered to what this browser
  can do, then the Journal, `openJournal`). Empty groups are dropped. A series opens `openSeries` with its
  local name, a person their page, a character the book it is from. The module also owns the arrow-key clamp (`moveSelection`, no
  wrap), the recent list (`addRecent`), the shortcut test (`isPaletteShortcut`)
  and the key hint (`shortcutHint`: ⌘K on Apple platforms, Ctrl K elsewhere).
- **Actions are only what exists today** (the pure `buildActionItems` in
  `palette-model.ts` decides which show): with a book loaded, pause or "Resume
  &lt;chapter&gt;", *Sleep in 30 minutes*, *Sleep at end of chapter* (only when the
  book has real chapters - without them the end-of-chapter timer falls back to a
  duration, which the label would misdescribe) and *Open the full player*; *Open
  Up next* with the queued count when the queue's server has `queue`
  (`openUpNext()`); always, *Go to settings* and the light/dark switch. The two sleep actions confirm with a
  `toast`.
- **Shortcut guards** are shared with Up next's Q and the player's keyboard
  shortcuts in `src/lib/keyboard.ts` (`isEditable`, `isModalOpen`, and `ownsSpace` /
  `ownsArrows` for the player's Space and arrows): no global shortcut fires while
  typing or over a modal dialog, and the palette's and Q run on tab pages only. The
  player's own keys are in [Player UI](player-ui.md#keyboard-shortcuts-web).
- **Accessibility**: a combobox input with `aria-activedescendant` over a grouped
  listbox, the matched text bolded in `brand-ink`, and key hints plus the result
  count in the footer. A book opens with a plain push, so it lands in the
  current tab.

### Sub-nav sections and actions

The Stacks sub-nav row is "Title [segmented control of sections] [contextual
actions]". A **tab root** fills it from its own tree with two components in
`src/components/shell/tab-root-nav.tsx`:

- `SubNavSections({ tab, options, value, onChange, accessibilityLabel })` - ONE
  scrollable `SegmentedControl` (options may carry a `count`). On tablet/desktop it
  publishes itself into the sub-nav and renders nothing in place (a tablet drops the
  page title when there are sections, to give them the room); on a phone it renders
  right where it is, so put it under the large title.
- `SubNavActions({ tab, id, order, children })` - contextual actions (the Library's
  picker, sort, grid/list; the Downloads summary line). Several components can
  each publish their own, keyed by `id` and sorted by `order` (lower first) at the
  row's right end; on a phone `children` render in place.

Both write through `usePublish` into the `useSubNav` store
(`sub-nav-store.ts`), keyed by tab - NativeTabs keeps every visited tab mounted,
so each root publishes under its own tab and `SubNav` reads the active one's with
`useSubNavSlot`. A publication is refreshed after every render of its publisher
and withdrawn on unmount. **Published nodes render in the sub-nav's tree**, not the
screen's, so they must not need the screen's context (`ContentScope`, local
providers); tab roots carry none.

### Up next: drawer and sheet

`src/components/upnext/`, capability `queue` (nothing renders while `/server` is
unknown, so nothing flashes). One `UpNextPanel` in two containers:

- **Desktop:** `UpNextDrawer` in the shell's `DrawerSlot`, between the top chrome
  and the docked player. Open by default, 300-480 wide (`DRAWER_MIN`/`DRAWER_MAX`,
  default 360) by dragging its left edge (a keyboard-steppable handle on web), and
  collapsible; both are remembered per device by `useUpNext`
  (`up-next-store.ts`, `persistedDocument` under `audiosilo.upNext`, hydrated when
  the drawer first mounts).
- **Tablet/phone:** `UpNextSheet`, a player sheet (`usePlayerSheets`' `upnext`)
  rendered by the active `PlayerSheetHost`, so it opens over the full player as well
  as over the shell ([Player sheets](player-ui.md#player-sheets-and-overlays)). Its open state is
  never persisted, so a sheet can't open itself at launch. A row or a suggestion
  opens its page through `useOpen`, which from over the full player lands in the
  shell underneath (`pushInShell`).

`openUpNext()` / `closeUpNext()` / `toggleUpNext()` pick the drawer or the sheet
by the window's form factor at call time. Entry points: `UpNextButton` (the queue
glyph with a count badge) in the top bar (`variant="bar"`), the phone header on tab
roots (`"header"`), the docked player (`"dock"`, no count) and the full player's
pill (phone and tablet); the palette's *Open Up next*; and **Q** on the web
(`useUpNextShortcut`: never while typing, with a modifier, or over another modal -
the sheet it opened carries `UP_NEXT_LAYER`, which doesn't count, so Q closes it
again).

It shows **one connection's queue**: `queueConnectionId` picks the loaded book's
server, else the default, else the first (a removed connection falls through).
`useUpNextData(cid)` holds everything the panel shows and does. Its writes keep the
rows the listener can't see, by the
[1b write rules](state-and-data.md#the-listeners-own-state-player-redesign-phase-1b)
(a reorder is `useAddToQueue` with `position`, a removal an exact-path delete), so
**Clear** is one exact-path delete per visible entry followed by one Undo toast that
adds them back in order. Reordering: a gesture-handler drag on the grip
(`dragTarget` / `dragShift` are worklets), ArrowUp/ArrowDown on the focused grip or
Alt+arrows anywhere in the row (`keyMove`), and screen-reader Move up / Move down
actions.

On the web desktop, `CoverTile` covers are HTML5 drag sources
(`drag-source.web.ts`, payload type `application/x-audiosilo-book`) and the
drawer's `DropZone` (`drop-zone.web.tsx`) accepts only a book from the queue's own
server (`canDrop`); native gets no-op twins. "Continue the series and more" is
`pickSuggestions`: the loaded book's `/next` answer, then books in progress on that
server, then the community rail's next work as a ghost when the server couldn't
place it - never the loaded book or one already queued, at most four. The footer
switch is the `autoPlayNext` setting, labelled "Play the next book automatically"
with a hint that says what it does (Up next first, then the series).

When a book ends, the queue's head plays first ([what plays next](end-of-book.md#what-plays-next-up-next-resolverts));
the book that starts from it and the finished book leave it through `dropFromQueue`
(`src/components/player/end-of-book.ts`).

### Profile menu

`ProfileMenu` (`src/components/shell/profile-menu.tsx`) is the top bar's profile
button (the user's initial, plus the name on desktop) and a `DropdownMenu`: every
connected server with its state - the pure `serverStatus()`
(`src/api/reachability.ts`), where "needs signing in again" (the reconnect flag)
wins over "offline", else "Signed in as &lt;user&gt;" - each opening that server's account screen; **Add a server**
(`/connect?add=1`); **Journal** (`journalHref()` in `src/lib/paths.ts`, until the You destination of a
later phase); **Account on &lt;default server&gt;**; and a light/dark
appearance switch (`useTheme().toggleScheme()`, which the palette's action uses
too). A phone keeps all of this in the Me tab. The same `serverStatus()` drives
the top bar's server line (the default server's name, or "Offline" / "Needs
signing in again"); the docked bar's sync line is `usePlaceSync` (sign in again >
saved on this device > synced / synced just now, see
[Player UI](player-ui.md#mini-player-accessory-player-docked-player)).

### Toasts

The root layout mounts `ShellToastHost` (`shell-toast-host.tsx`), the app's one
`<ToastHost>`, lifted clear of whatever chrome is at the bottom: on a phone, the
tab bar plus the mini player (or the iOS 26 accessory); on tablet/desktop, the
docked player bar; and, at any width, the sleep timer's floating grace card while
it shows (the `grace` piece, which sits above the rest so toasts lift over it).
Each piece of bottom chrome (`bar`, `mini`, `accessory`, `dock`, `grace`) publishes its **measured top edge** - its distance from the window's
bottom - into `useShellMetrics` (`shell-metrics.ts`) with `useChromeEdge`
(`setChromeEdge` underneath). The native tab bar can't be measured directly, so
each tab stack derives the `bar` edge with `nativeBarEdge()`: the gap between the
page's bottom and the shell frame's own measured bottom (`setFrameBottom`), both
read with `measureInWindow`, but never less than the page's bottom safe-area
inset (iOS lays the page out under its bar, so there the inset is the bar). Comparing against the window height instead made the Android
bar a status bar too tall, because under edge-to-edge Android's `measureInWindow`
is offset by the status bar. Each stack publishes only once it has measured.
`bottomChromeTop()` takes the highest piece, and
the pure `toastBottomOffset()` (`toast-offset.ts`) turns it (`chromeTop`) into
the toast's offset, with one fallback before the first layout. With no bottom
chrome (tablet/desktop with nothing loaded) or over a root modal such as the full
player, toasts sit just above the home indicator.

### Routing rules

The destinations (labels, our icons, SF Symbol / Material names, tab roots) are
one table, `TABS` in `src/components/shell/destinations.ts`, read by the native
tab bar, the web tab bar and the top bar alike. `PHONE_TABS` and `TOP_BAR_TABS`
drop Downloads where the platform can't store downloads (`engine.supported`; on
web, a secure context with the Cache API).

- **The pushing tab owns a detail page.** The shared detail routes (book,
  folder, account, favourites, browse, series, author, narrator, collection)
  live once in the array group, and
  expo-router resolves a push against the current segments, so a book pushed
  from Search stays in Search and back returns there.
- **Cold deep link owner = Home.** A cold `/book/...` link, which every tab
  could own, is given to the alphabetically **first** tab group - which is why
  Downloads is `(offline)` and not `(downloads)`. `TAB_STACK_SETTINGS` (the
  group-keyed `unstable_settings` of the array-group layout) inserts each tab's
  root underneath so back works, and `tabStackListeners` strips the link params
  React Navigation copies onto that root and its ancestors (otherwise back
  landed on `/?libraryId=1`). A root keeps only its own `rootParams`
  (`Destination.rootParams` in `destinations.ts`: Library's `mode`, `sort`,
  `status`, `dl`, `len`); every other param on a root, and every param on its
  ancestors, is replaced with none.
- **Tab presses from our chrome dispatch `JUMP_TO`** (`useTabPress`). For
  another tab:
  `navigationRef.dispatch({ type: 'JUMP_TO', payload: { name: '(library)' } })`,
  which restores that tab's stack - an href can't, because
  `router.navigate('/(home)')` resolves to `/` and pops Home. Pressing the
  active tab again navigates to its root, popping to the top.
- **Web: `<TabSlot />` stays at a fixed ancestor path at every width**; only
  the sibling chrome toggles. Moving it between wrappers remounts every screen on
  a resize and jumps the URL to another tab.
- **Native: never add or remove tabs at runtime.** `NativeTabs` can't; tablet
  and desktop set `hidden` on the whole bar instead, so every tab's stack
  survives an iPad rotation or split view crossing 640.
- **Route-driven side effects** (clearing the search query when leaving the
  Search tab, forgetting browse scroll positions when leaving the browse
  section - the Library root and folders plus the book, series, author,
  narrator and collection pages, `BROWSE_PATHS` in `src/lib/paths.ts`) live in `useShellEffects`,
  run by both `(app)` layouts.

The regression net for all of this is the route-tree suite, which drives
expo-router over the real `src/app` file list - see
[Testing](testing.md#route-tree-tests).

## The Library modes

`LibraryScreen` (`src/components/library/library-screen.tsx`) is the Library tab
root. Its sections are the modes of `library-modes.ts`: `books`, `authors`,
`series`, `narrators`, `collections`, `folders`, read from `?mode=` by
`parseLibraryMode` (unknown or absent = `books`) and written with
`router.setParams` (the default carries no param, so the plain link stays
`/library`).

- **Capability-aware.** `authors` / `series` / `narrators` need `browse_people`,
  `collections` needs `collections` (both read with `useCapability` for the
  selected library's connection). `availableLibraryModes` offers only modes whose
  flag is known to be on (a mode waiting on its flag is left out rather than shown
  and taken away); `resolveLibraryMode` keeps a deep-linked mode while its flag is
  still unknown and falls back to Books once it is known to be off. Segment counts
  come from the gated `useAuthors` / `useNarrators` / `useSeriesList` /
  `useCollections` (Books and Folders have none).
- **One selected library.** Every mode but Folders shows one library:
  `useSelectedLibrary()` reconciles the device-local `useLibrarySelection` pick
  (see [State & data](state-and-data.md#library-selection-srcstoreslibrary-selectionts))
  with every connection's library list. `LibraryPicker` (published with
  `SubNavActions`, order -100) chooses it, grouped by server, and hides itself with
  one library; in Collections mode it is `by="server"` (a collection belongs to a
  server). Each mode body is keyed on `connection:library`, so switching remounts
  it cleanly.
- **Mode bodies** live in `src/components/library/modes/`: `BooksMode` (below),
  `AuthorsMode` / `NarratorsMode` (on the shared `PeopleMode` in
  `src/components/series/people-mode.tsx`: portrait cards, letter heads, the
  "no author listed" count), `SeriesMode` (series cards with a mini shelf of owned
  spines and dashed gaps), `CollectionsMode` (Favourites, own and shared
  collections, New collection) and `FoldersMode` (the old libraries-then-folders
  flow and its Favourites row, unchanged).

**Books mode** is the one place that loads a whole library:
`useWholeLibrary(connectionId, libraryId)` (over `useAllLibraryBooks`) pages
`GET /libraries/{id}/books` 200 at a time, always newest first, until
`next_cursor` runs out (its own key under the `libraryBooks` prefix, so its pages
never mix with `useLibraryBooks`' 100-book ones). There is one cache entry per
library whatever the screen's sort, because every sort happens on the device; pages
so far are usable at once, and a failed page keeps what loaded, with Retry carrying
on. The view is
`books-view.ts`, pure: `parseBooksView` / `booksViewParams` (the URL contract:
`sort`, `status`, `dl=1`, `len`; defaults are omitted), on-device `filterBooks`,
`statusCounts` (each chip's count among the books the *other* filters keep),
`sortBooks` (title order folds accents and skips a leading article; an untitled book sorts, and shows, by its folder name through `bookTitle`), `letterGrid`
for the title sort's letter heads and A-Z rail, and `lengthBucket` (the `len`
chips, which Home's Short listens shelf reuses). The
grid/list choice is `useBooksLayout` (`audiosilo.booksLayout`, also used by a
collection and Favourites). The **book menu** is `useBookActions` presented by
`BookActionsMenu` (`books/book-actions.tsx`): the list view's `BookActionsButton`
opens it, and so does every `CoverTile` (below). Its items: Play/Resume, Up next (`queue`), Add to
collection (`collections`), download, Mark as finished (on a server without
`progress_edit`, through the offline-aware `useMarkFinished`, without Undo) or not
finished (`progress_edit` only), More in this series. A capability still unknown
hides its item. Remove download asks first through the shared
`RemoveDownloadConfirm` (see [Offline](offline.md#lifecycle)).

## Browse building blocks

The covers and shelves every browse screen is made of (STYLEGUIDE section 8) live
in `src/components/library/`:

| Piece | What it is |
|---|---|
| `BookCover` | A book's art. Sources, best first (`coverCandidates`): the downloaded copy, the smallest server thumbnail that covers the drawn pixels (`coverSizeFor`: 160/320/640, only when the server advertises `cover_sizes`), then the full art, which is also the fallback for a thumbnail that fails. `cover_version` rides along as the cache buster. While the server's flags are unknown it shows an empty frame rather than fetching the full art first. |
| `CoverTile` | A cover as one button: progress bar while in progress, flags for a friend's (non-default) server, downloaded and finished, title and one caption line. It owns the book menu (`TileActions`, `tile-actions.tsx`): a long-press, a right-click, the Menu key or Shift+F10 (`useContextMenuRequest` in `src/lib/context-menu{,.web}.ts`; on macOS/Linux a right-click opens it on the button's release, so the release can't pick an item) or the screen reader's *More actions* opens `BookActionsMenu` - a sheet on a phone, a dropdown anchored to the tile's corner on tablet/desktop - using the screen's `book` row when it passes one, else one item fetch on first use. On the web desktop it is also the Up next drag source. A small cover with no art shows a two-letter monogram (`src/lib/monogram.ts`). |
| `GhostCover` | A book the listener doesn't have: hatched, dashed, with the real title and position from the community data and "Not in your library" (or `info`-tinted "On &lt;server&gt;" when another connected server has it); below 100 wide it draws the title's initials instead, with the full title kept in its accessible name. Never fake art, and no book menu. |
| `ShelfRow` | A horizontal, snap-scrolling row of tiles on a FlashList, standing on a decorative `Ledge`; bleeds to the window edge past the page gutter. |
| `CoverGrid`, `CoverGridSkeleton`, `CoverListRow` | The page's grid on FlashList (it *is* the scroller; full-width rows such as letter heads span every column through `overrideItemLayout`), its same-size skeleton, and the list variant of a book. |
| `cover-layout.ts` | `pageGutter`, `shelfMetrics` (164 tiles, 132 on a phone), `gridMetrics` (columns of at least 158, two on a phone; `cardGrid` for card grids). |
| `CoverWash` (`cover-wash{,.web}.tsx`) + `src/lib/cover-tint.ts` | The cover-colour wash behind the Now card and the series hero: `coverTint(book.cover_color)` (null - no wash at all - when the server sent none), at `WASH_STRENGTH` (the `--wash` token), drawn as SVG radial gradients on native and CSS on web. |
| `FilterChip` / `ChipRow` (`src/components/ui/filter-chip.tsx`) | The filter chips. |
| `useQueueActions` / `QueueButton` | "Queue it" for one connection's server: `isQueued`, `queue(lib, path, position?)` and `unqueue` with Undo toasts; hidden until `queue` is known to be on; a `CapabilityError` is swallowed, a `409` says the queue is full. `QueueButton` ("Queue it" / "Queued") is the series page's action for an unread owned book. |

Every surface outside the player (Home, the Library, the series page, Up next, the
book page, the bookmark, note and history rows, the Journal) starts a book, or jumps
into one, through **`usePlayBook`** (`src/components/player/use-play-book.ts`), routed
by the pure `playRoute` (`play-route.ts`): a phone opens the full player (at the
place, `at`, when there is one, also for the loaded book), unless it is already on
top; a tablet or desktop plays in place under the docked bar once the chapters are
in, through the book's own connection; a book already loaded plays on (from `at`), or
pauses and plays with `toggle`. It rejects when the book couldn't be fetched, so the
caller can say so.

`src/components/series/` holds the series and person pages: `series-model.ts`
(entries, gaps, reading orders, progress track, the one action per entry),
`spine-fit.ts` (spine titles always fit: tighten, shrink, wrap, then ellipsize),
`bookcase.tsx` / `spine.tsx`, `person-page.tsx`, and `use-series-data.ts`
(the page's reads beyond the shared `src/api` hooks `useAllLibraryBooks` and
`useProgressLookup`: `useElsewhereBooks`, one search per other server for copies of
the series elsewhere, and `usePlacedBooks`, an `/item` for each book a rail places
in another library). The series page reads community rails only on
a `metadata` server, and shares reading-order picks with the book page
(`useSeriesOrderings`). Under its list, `KeepAheadCard` (`keep-ahead-card.tsx`)
binds the device-wide `keepAhead` setting through the Downloads page's exports,
only once the downloads store knows the device can download. Search's series
results reuse the Library's `SeriesCard`, each asking for its series' books only
once it shows.

## Styling conventions

`STYLEGUIDE.md` at the root of the frontend repo is **authoritative for the player's look**: Stacks, the
player redesign's design system (tokens, type, components, platform behaviour and
voice). Its section 17 maps the design onto the code; the points below are the
ones a contributor trips over first.

- **`className` everywhere.** Uniwind styles React Native's own components
  directly (Metro wires it in via `withUniwindConfig` in `metro.config.js`; there
  is no babel preset and no `tailwind.config.js`). The theme is CSS in `@theme`
  blocks in `src/global.css`. A third-party component needs a one-time
  `withUniwind` wrapper before it accepts `className` - for example `SafeAreaView`
  from `@/components/ui/safe-area-view`; without it the classes are silently
  dropped on native.
- **Merge caller classes with `cn()`** (`@/lib/utils`, clsx + tailwind-merge).
  Uniwind doesn't de-duplicate conflicting classes: web resolves by stylesheet
  order, native by className order, so a component that accepts a `className`
  override must merge with `cn()` for the caller to win everywhere. `cn()` knows
  the Stacks radius names (`rounded-control`, `rounded-menu`, `rounded-card`,
  `rounded-dialog`, `rounded-sheet`).
- **rem is 14px on native** (Uniwind's rem polyfill, NativeWind's old value) and
  the browser's 16px on web, so layouts keep their size.
- **Colour tokens are the Stacks semantic tokens, with one source,
  `src/theme/tokens.json`** - a `themes.light` and a `themes.dark` set with the
  same names, plus a fixed `palette` (`white`, `black`). `npm run gen:tokens`
  (`scripts/gen-tokens.mjs`) writes the generated region of `src/global.css`
  (each theme token as a Uniwind theme variable, `--color-<name>` under
  `@variant light` / `@variant dark`) and `src/theme/tokens.ts`
  (`colors.light.<camelName>`, `colors.dark.<camelName>`, `colors.white`,
  `colors.black`). Never hand-edit either output: `npm test` starts with
  `node scripts/gen-tokens.mjs --check`, which fails when either is out of date.
- **Use the semantic classes; they follow the theme with no `dark:` pair.** Page
  `bg-background`, surfaces `bg-card` (sheets and dialogs `bg-popover`), quiet
  fills `bg-muted`, text `text-foreground` / `text-muted-foreground` /
  `text-subtle-foreground`, hairlines `border-border`, pressed/hover `bg-accent`,
  status `text-destructive` / `success` / `warning` / `info`. Opacity modifiers
  work (`bg-brand/10`).
- **`primary` is ink, the pink is `brand`.** As in shadcn, `primary` is the
  primary-button colour, a deep ink. The pink is `bg-brand` (+
  `text-brand-foreground` on it), pink text is `text-brand-ink` (AA contrast in
  both themes), tinted fills are `bg-brand/10` or `bg-brand-soft` - and the rule
  is **one pink thing per view**.
- **Tailwind's default palette is switched off** (`--color-*: initial` in the
  generated region), so `bg-gray-200` or `text-red-500` compiles to nothing. Add
  a token to `tokens.json`, in both themes, instead.
- **Native props that need a colour string** (status bar, `ActivityIndicator`,
  SVG fills, the navigation theme) read `useThemeColors()`
  (`src/theme/use-theme-colors.tsx`), which returns the resolved theme's
  `colors.light` or `colors.dark` from a context that `ThemeColorsProvider`
  fills inside `ThemeProvider` (one theme subscription, not one per icon); don't
  branch on `scheme === 'dark'` yourself.
- **Fonts: Figtree (body), Bricolage Grotesque (display), JetBrains Mono.**
  `ThemeProvider` loads them from `@expo-google-fonts/*` (only the weights a
  token uses). The Figtree and Bricolage weights hold the splash screen until they
  are ready; JetBrains Mono loads alongside without delaying first paint (the
  system monospace font shows until then). React Native has
  no font fallback or synthetic weights, so there is **one family per token**:
  `font-sans` (Figtree 400), `font-sans-medium`, `font-sans-semibold`,
  `font-sans-bold`, `font-display` (Bricolage 700), `font-display-semibold`,
  `font-mono` (JetBrains Mono 500). Never pair a font
  token with `font-medium` / `font-bold`.
- **Text goes through `<Text variant=… />`** (`src/components/ui/text.tsx`),
  whose variants are the Stacks type roles: `display-xl`, `display`, `heading`,
  `title`, `body` (default), `muted`, `label` (Figtree semibold, list-row
  titles), `caption`, `eyebrow` (uppercase kicker), `mono` and `stat` (both with
  tabular figures). Variants use themed tokens, so
  `<Text variant="caption" className="text-brand-ink">` recolours both themes.
- **Never import an icon library.** Use `<Icon name=… />` from
  `src/components/ui/icon.tsx`; the glyphs are vendored SVG paths in
  `icon-data.ts`. To add or change an icon, edit `scripts/glyphs/manifest.mjs`
  and regenerate via the isolated generator in `scripts/glyphs/` (the only place
  a FontAwesome Pro token is ever needed).
- **Compose the primitives in `src/components/ui/`** rather than restyling raw
  RN components ad hoc. They are **react-native-reusables** (shadcn/ui for React
  Native, on `@rn-primitives`; `components.json` selects the Uniwind styling),
  restyled to Stacks with every string translated: `Button` (variants `default`
  ink, `brand`, `outline`, `secondary`, `ghost`, `destructive`,
  `destructive-outline`, `link`), `Card`, `Input` / `Textarea`, `Dialog`,
  `AlertDialog` (+ the `confirm-dialog` helper; Dialog and AlertDialog share one
  `DialogFrame`), `Select`, `Tabs` (the underline tabs, optionally `scrollable`),
  `ToggleGroup` (+ the typed `SegmentedControl`, which is the segmented look),
  `Popover`, `DropdownMenu`, `Switch`, `Separator`, `Badge`,
  `Tooltip`, `Skeleton` (on web a CSS keyframe shimmer, the `skeleton-shimmer`
  utility; on native one shared animation clock for every skeleton) and `Kbd` (a
  key hint). Hand-built on primitives: `Slider`
  (the dock's chapter scrubber and the speed sheet; the full player's seek bar
  shares its `useSliderControl`), `Toast` (an imperative `toast({ title, description, action })`
  rendered by the root `ShellToastHost`) and `RowSurface` / `PressableRow` (the
  quiet hairline list row; the book page's chapter rows use it too). A primitive
  that renders its own text node reuses `EYEBROW_CLASS` for the eyebrow style.
  Also there: `Sheet`, `Stepper`, `TimeStepper`, `EmptyState`, `SectionHeader`
  and `AnimatedPressable` (a `className`-aware `Pressable` with a reduce-motion
  aware press-in scale). To add another reusables component, generate it into a
  scratch directory with the reusables CLI and port it (the CLI would overwrite
  our same-named files) - the steps are in the frontend `CLAUDE.md`.
- **Overlays portal.** Dialog, AlertDialog, Select, Popover, DropdownMenu and
  Tooltip portal into the root `<PortalHost />` on native (and into
  `document.body` on web), wrapped in `FullWindowOverlay` on iOS
  (`overlay.tsx`), so they can open from inside a card, a list row or a
  ScrollView. On a phone (`useLayout()`) a dialog or alert dialog rises from the
  bottom edge like a sheet. Overlays read the **window's** safe-area insets:
  `RootInsetsProvider` (`overlay.tsx`, mounted once directly inside the root
  `SafeAreaProvider`) captures them, and `useRootInsets` / `useRootFrame` /
  `useOverlayInsets` / `useDialogFrame` read them wherever the overlay is opened
  from. (A tab page's own safe-area context counts the native tab bar in
  `insets.bottom`, which made phone sheets about 100pt too tall and pushed menus
  up on iOS.) The bottom **sheets** are still hand-rolled (`sheet.tsx` on
  `OverlayHost`), which renders in place and so must be mounted at screen level,
  never inside a clipped container. Every sheet the app shows today is a player
  sheet (speed, sleep, chapters, the companion and Up next): requested through
  `usePlayerSheets` and rendered by the active `PlayerSheetHost` through
  `PlayerSheet` (a `Sheet` on phone and tablet, a centred `Dialog` on desktop; see
  [Player UI](player-ui.md#player-sheets-and-overlays)). On web, rn-primitives hands
  Content's props to Radix DOM nodes through a Slot that merges `style` by object
  spread, and a style array crashed react-native-web's style setter; every Content
  part is wrapped once in `withFlatStyle` (`overlay.tsx`), so a style array is
  fine at the call site.
- **Theme switching** goes through `ThemeProvider`, which calls
  `Uniwind.setTheme('light' | 'dark' | 'system')` and reads the resolved scheme
  back from `useUniwind()`; on web Uniwind puts the theme class on `<html>`, so
  it also reaches content portaled to `<body>`. `useTheme().toggleScheme()` flips
  between light and dark. **The default** is written by the launch migration
  `migrateStorage()` (`src/lib/storage-migration.ts`), one memoised run that both
  the root layout and `ThemeProvider` await, so no effect-order contract is
  involved. Only when nothing is stored under `THEME_STORAGE_KEY`
  (`audiosilo.theme`), it reads `hasExistingInstall()` (`src/stores/session.ts`:
  a persisted connection, a known server, or a legacy session) **before**
  `resetStaleStorage` can rewrite the session keys, and writes
  `defaultSchemePref()` (`src/theme/scheme-pref.ts`): `system` for a **new**
  install, `dark` for an **existing** one (the app used to be dark-first, so
  nobody's app turns light after the update). `ThemeProvider` then only reads the
  stored value through `restoredSchemePref()`: a stored pick is kept, and an
  unknown value reads as `dark` without being written.
- **Web react-native-web seam.** `src/lib/rnw-button-fix.web.ts` (imported first
  by the root layout) patches react-native-web twice: `role="button"` renders a
  `<div role="button">` instead of a real `<button>` (which nests illegally and
  trips an older-Safari flex bug), and its press responder lets **Space** press
  any role-bearing pressable (`tab`, `radio`, `switch`, `checkbox`, `option`, menu
  items - react-native-web only did `button`), while a `role="button"` pressable
  with no `onPress` leaves Space to its own handlers (so Radix opens a Select). No
  per-primitive Space shims. The native `rnw-button-fix.ts` is a no-op.
- **One set of Uniwind options.** `metro.config.js` and
  `scripts/check-styles.cjs` both read the root `uniwind.config.js`, so the style
  guard compiles exactly what Metro does.

## Environment gotchas

:::warning Read this before running anything
These are the four failure modes that cost the most time on a fresh checkout.
:::

1. **Node 24 is required** (`.nvmrc` pins `24.16.0`). RN 0.85 needs ≥ 20.19.4,
   and the Expo CLI's env-file loader uses `util.parseEnv` (Node ≥ 20.12) - an
   older system Node crashes as soon as a `.env` file exists. Run `nvm use`
   first.
2. **Native runs need a dev build, not Expo Go.** The `audiosilo-player` module,
   `react-native-svg` and `expo-secure-store` are native code:
   `npx expo prebuild` then `npx expo run:ios` / `run:android`. Web
   (`npm run web`) needs no native build.
3. **Editing native code under `modules/audiosilo-player/{ios,android}` requires
   a full rebuild** (`run:ios` / `run:android`). A Metro/JS reload will not pick
   it up - this is the single most common "my fix didn't do anything" trap.
4. **Web dev needs CORS.** The Metro dev server runs at `http://localhost:8081`;
   set the server's `cors_origins` to that origin (or serve same-origin via the
   baked export). See the [server configuration](../server/configuration.md)
   page.

Also: run tool commands from the **repo root** - a stray `cd` into
`node_modules` breaks Expo's config resolution. And before calling any change
done, run the full gate (`npx tsc --noEmit && npm run lint && npm run format &&
npm test`) - CI enforces all four; see
[Gates and CI](../contributing/gates-and-ci.md).

## The `baseUrl: "/web"` coupling

The web build of this app is served **by the server** at `/web`, not from its
own host. That subpath ripples through the build:

- `app.json` sets `experiments.baseUrl: "/web"`, so the static export
  (`npx expo export -p web`) emits asset URLs that resolve under `/web/…`.
- At runtime, `src/lib/base-url.ts` exposes `BASE_URL`: `EXPO_BASE_URL` in a
  production export, but **empty in development** - the Metro dev server serves
  everything at the root and ignores `baseUrl`, so links like
  `/web/manifest.json` would 404 in dev. Anything that builds absolute paths
  (the service-worker registration, the PWA manifest link in `+html.tsx`, the
  synthetic offline media URLs) goes through `BASE_URL`.
- The server side of the seam is `internal/web/web.go` (serving `web_dir` with a
  per-document CSP) - see [the web UI page](../server/web-ui.md). Releases bake
  a pinned web image into the server's Docker image, web image first:
  [release pipeline](../architecture/release-pipeline.md).

`public/` is copied verbatim into the export, which is how `sw.js` and
`manifest.json` end up at `<base>/sw.js` and `<base>/manifest.json` - the
service worker's scope is therefore `<base>/`. Details in [Offline &
PWA](offline.md).
