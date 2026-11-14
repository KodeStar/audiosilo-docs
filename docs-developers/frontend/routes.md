---
title: Routes and navigation
description: "The player's routes (src/app/): the route map with each route's file and screen, the root layout and its lifetime services, the (app) layouts and tab stacks, the web HTML shell, the browser tab title, and the routing rules for tabs, pushes and cold deep links."
---

Expo Router derives the player's routes from the files under `src/app/`. There
is **one route tree on every platform**. Only the navigator that drives the five
tabs, and the chrome around it, differ (see [The app shell](shell.md)).

## Route map

The three top-level groups are the authenticated app `(app)`, the `connect/`
onboarding flow, and a handful of standalone screens. Inside `(app)`, every
screen sits in one of five **tab groups**: `(home)`, `(library)`, `(search)`,
`(offline)` and `(me)`. A screen can also sit in the shared array group
`(home,library,search,offline,me)`, which expands into all five (see
[Routing rules](#routing-rules)). Groups are invisible in URLs, so every URL
below is the same as before the groups existed.

The layouts and the files that are not pages are in
[Layouts and special files](#layouts-and-special-files).

### Tab pages

| Route | File | Purpose |
|---|---|---|
| `/` | `(app)/(home)/index.tsx` → `src/components/home/home-screen.tsx` | Home, across the person listening's servers. See [Home](#home). |
| `/browse?type=recent\|finished` | `(app)/(home,library,search,offline,me)/browse.tsx` → `src/components/library/books/see-all-screen.tsx` | The "See all" cover grid behind Home's Recently finished shelf. Recently added's See all opens the Library's Books mode with `sort=recent` instead. |
| `/upcoming` | `(app)/(home,library,search,offline,me)/upcoming.tsx` → `src/components/upcoming/upcoming-screen.tsx` | The listener's upcoming releases on every server (`UpcomingContent`: Coming soon, Just released, Missing from your series). Home's Coming up in your series > See all pushes it on the current tab (`upcomingHref`), and a cold link opens it in Home. The You hub's Upcoming section renders the same body. See [Upcoming releases](state-and-data.md#upcoming-releases). |
| `/search` | `(app)/(search)/search.tsx` → `src/components/search/search-screen.tsx` | Search across the person listening's connections. See [Search](#search). |
| `/library?mode=…` | `(app)/(library)/library/index.tsx` → `src/components/library/library-screen.tsx` | The Library tab root, with the browse modes `books` (the mode when `mode` is absent), `authors`, `series`, `narrators`, `collections` and `folders` (see [The Library modes](library-and-browse.md#the-library-modes)). Books mode also reads `sort` (`recent\|title\|author\|length`), `status` (`new\|progress\|finished`), `dl=1` and `len` (`short\|mid\|long`), which Home's links set. |
| `/find-shows?connection=…&library=…&section=…` | `(app)/(library)/find-shows.tsx` → `src/components/podcasts/find-shows-screen.tsx` | Add shows to a podcast library with a search, a feed address or an OPML import (see [Podcasts](podcasts.md#finding-shows)). It is the Library tab's own page, so a cold link (a reload, a pasted URL) lands in the Library and Back returns there. |
| `/find-librivox?connection=…&library=…` | `(app)/(library)/find-librivox.tsx` → `src/components/librivox/find-librivox-screen.tsx` | Find on LibriVox, an admin's page that adds a LibriVox recording to a books library through the Bridge (see [Find on LibriVox](library-and-browse.md#find-on-librivox-admin)). Like Add shows, it is the Library tab's own page, and a link without `connection` is the default connection's. |
| `/series?connection=…&library=…&name=…&work=…` | `(app)/(home,library,search,offline,me)/series.tsx` → `src/components/library/series-screen.tsx` | The series bookcase. `name` is a **local** series: the exact `Book.series` value, the `series=` filter of `GET /books`. `work` is a community work id whose rails to show, which is how the listener reaches a series they own nothing of. The route needs at least one of them. With both, `name` lists the owned books and `work` supplies the reading orders and ghosts. |
| `/author?connection=…&library=…&name=…`, `/narrator?…` | `author.tsx` / `narrator.tsx` (same group) → `src/components/library/person-screen.tsx` | A person page: the books whose `Book.author` or `Book.narrator` is **exactly** `name` (a joint credit is one name, as the server lists it), series shelves, other books, and Read by / Books by chips. A narrator filter needs `browse_people`. An older server shows a "can't list books by narrator yet" state. |
| `/collection?connection=…&id=…` | `collection.tsx` (same group) → `src/components/library/collection-screen.tsx` | A collection. It belongs to a server, not a library, so its items can span libraries. The owner has Edit, Share, Delete, and Move up, Move down and Remove in the list view. A viewer (`owned: false`) has Leave. A `404` reads as deleted or no longer shared. |
| `/library/favourites` | `(app)/(home,library,search,offline,me)/library/favourites.tsx` → `src/components/library/collections/favourites-screen.tsx` | The hearted books (cover grid) and folders of every server of the person listening. |
| `/library/[libraryId]?connection=…&path=…` | `(app)/(home,library,search,offline,me)/library/[libraryId].tsx` | Library browse, root and nested folders alike: a two-line re-export of `src/components/library/browse-screen.tsx`. See [Library browse](#library-browse). |
| `/book/[libraryId]?connection=…&path=…&tab=…` | `(app)/(home,library,search,offline,me)/book/[libraryId].tsx` → `src/components/book/book-page.tsx` | The book page, opened on `tab` when that tab exists (`parseBookTab`). See [The book page](book-page.md). |
| `/downloads` | `(app)/(offline)/downloads.tsx` → `src/components/downloads/downloads-screen.tsx` | The Downloads page: storage per server, the automatic-download rules (including keep-ahead), in-progress and failed downloads, and the books ready offline by server (see [Offline](offline.md#the-downloads-page)). The group is `(offline)`, not `(downloads)`, on purpose (see [cold deep links](#routing-rules)). |
| `/you?section=stats\|year\|journal\|settings\|household\|account\|upcoming` | `(app)/(me)/you.tsx` → `src/components/you/you-hub.tsx` | The **You** hub, the root of the **Me** tab. See [The You hub](#the-you-hub). |
| `/settings?section=…` | `(app)/(home,library,search,offline,me)/settings.tsx` → `src/components/settings/settings-content.tsx` | Every app setting, each in one pane (in the Listening, App and Servers groups). The gear, the profile menu and the palette push it on the current tab (`openSettings`). The phone hub's Settings section renders the same `SettingsContent`. See [Settings](you-and-settings.md#settings-srccomponentssettings). |
| `/household` | `(app)/(home,library,search,offline,me)/household.tsx` → `src/components/household/household-page.tsx` | The Household page (`HouseholdPage`): the people on this device, the household members the person listening manages, and Listening in the house. `openHousehold` pushes it on the current tab, and the phone hub's Household segment renders the same page. See [Household page and members](household.md#the-page). |
| `/journal?tab=diary\|bookmarks\|notes` | `(app)/(home,library,search,offline,me)/journal.tsx` → `src/components/journal/journal-screen.tsx` | The Journal, on every server of the person listening. The route serves links made before the hub; entry points open the hub's Journal section (`openJournal`). See [The Journal](journal.md). |
| `/account?connection=…` | `(app)/(home,library,search,offline,me)/account.tsx` → `src/components/account/account-section.tsx` | One server's account. See [A server's account](#a-servers-account). |

### Root modals and standalone screens

| Route | File | Purpose |
|---|---|---|
| `/player` | `src/app/player.tsx` | The full player (see [Player UI](player-ui.md#the-full-player)), a full-screen modal above the tabs on every form factor. The mini player, the iOS accessory player, the docked player bar and a phone's Listen button open it. It accepts `libraryId` and `path` params (plus optional `position` and `track`) and starts playback only once the chapters query has settled. |
| `/read?connection=…&libraryId=…&path=…` | `src/app/read.tsx` → `src/reader/reader-screen.tsx` | The ebook reader, on the web and in the apps: a root full-screen modal like the player (`readerHref`). The route is `/read`, never `/reader`, because the static export would write that route over `reader.html`, the reader document. See [The ebook reader](reader.md). |
| `/finished` | `src/app/finished.tsx` | The end-credits screen, shown when a book finishes or opened from the player's menu. See [The end credits route](#the-end-credits-route). |
| `/year?year=…&connection=…&card=…` | `src/app/year.tsx` → `src/components/you/year/year-story-screen.tsx` | The phone's full-screen Year in listening story, a root modal like the player (`yearHref`). It closes with the close button, a pull down, or Escape on the web. See [Year in listening](you-and-settings.md#year-in-listening-srccomponentsyouyear). |
| `/profiles` | `src/app/profiles.tsx` → `src/components/profiles/profiles-screen.tsx` | Who's listening?: a root full-screen modal with no swipe-back (`ProfilesScreen`). See [Profiles](profiles.md#whos-listening-profiles). |
| `/kids` | `src/app/kids.tsx` → `src/components/kids/kids-screen.tsx` | Kids mode, a root route outside the tabs with no swipe-back (`KidsScreen`). `KidsRouteGuard` keeps a kids profile here. See [Kids mode](kids-mode.md). |
| `/demo` | `src/app/demo.tsx` | The public demo landing. It mints a throwaway session on a demo-mode server and shows the pairing QR, so the same demo user opens on a phone. |

### Onboarding

| Route | File | Purpose |
|---|---|---|
| `/connect` layout | `src/app/connect/_layout.tsx` | The onboarding stack, and the one gate between the flow and kids mode. See [The connect layout](#the-connect-layout). |
| `/connect` | `connect/index.tsx` → `src/components/connect/connect-start.tsx` | The first onboarding step. See [The first step](#the-first-step-connect). |
| `/connect/scan` | `connect/scan.tsx` | Camera QR scanner (`expo-camera`) for the pairing QR. |
| `/connect/sign-in` | `connect/sign-in.tsx` → `src/components/connect/sign-in-step.tsx` | An invite code **or** a username and password against the pending server. See [Sign-in](#sign-in-connectsign-in). |
| `/connect/ready?connection=…` | `connect/ready.tsx` → `src/components/connect/ready-screen.tsx` | "Your library is ready.", shown after the device's **first** connection only, with no swipe back to the spent sign-in. |

The full flow is in
[Connect and home/away addresses](connect-and-addresses.md#connect-and-onboarding).

## Route details

### Home

Home aggregates the servers of **the person listening** (`useProfileConnections`).
The `use*All` hooks read `useApis()`, the active profile's connections (see
[Profiles](profiles.md#visible-and-background-connections)). Home shows:

- the greeting and sync pill;
- the Now card;
- This week (`user_stats`);
- Continue listening;
- Next in your series (`next_book`);
- Coming up in your series (`upcoming`, `UpcomingRail`; see
  [Upcoming releases](state-and-data.md#upcoming-releases));
- Listening in the house (`HouseRow`, see
  [Listening in the house](listening-in-the-house.md));
- smart shelves, Recently added, Favourites and Recently finished.

The rules are in `home-model.ts` (which book leads, the shelves, the `/next`
candidates) and `listening.ts` (streak, bars and pace in **server** time). See
[Home](state-and-data.md#home).

### Search

Search covers the person listening's connections. It shows books
(de-duplicated), series, people and met characters, in groups with their own
loading and error states (`useSearch`, shared with the palette; see
[Search](state-and-data.md#search-and-the-spoiler-model)). With an empty query it
shows the recent searches and Browse cards. The query lives in
`useSearchStore`, so it survives the screen remounting.

On a **native tablet**, the top bar's search field jumps here and bumps the
store's `focusRequest`, which re-keys the input so it takes focus. On the web the
same field opens the [command palette](shell.md#command-palette-web) instead.
Leaving the Search tab clears the query (`useShellEffects`).

### Library browse

Content routes are **flat**. The connection id and the library-relative folder
`path` ride as query params, never as nested route segments. An in-app
`router.push` cannot resolve a route nested under a dynamic layout segment: it
lands on the group's first child. The rationale and the helpers are in
`src/lib/paths.ts`.

Each content screen scopes itself to its own `?connection=` with
`<ContentScope>`, and the content hooks read that scope through `useScopedCid()`.

The browse rows are `EntryRow` (`src/components/library/entry-row.tsx`). A plain
folder drills in. An audio file or a book folder opens the book route. A book
folder is one with `is_book`, or with `pending_book` (captioned "Not scanned
yet"); for a pending one, `/item` indexes it on demand.

### The You hub

`/you` is the root of the **Me** tab, the **You** hub.

- **On a phone** it holds Your listening, Year in listening, the Journal,
  Settings, Household and Account, in a scrolling segmented control.
- **On tablet and desktop** the sub-nav holds Stats, Year in listening, Journal
  and Household. Settings is the gear, and Account is the profile menu.
- **On both**, Upcoming follows while a server offers it
  (`useUpcomingAvailable`).

`section` and the Journal's `tab` are the hub's `rootParams`. See
[You, Settings and Account](you-and-settings.md#the-hub-and-its-routes).

### A server's account

`AccountSection` shows one server's account: password, pairing another device,
the At home and away card, signed-in devices, personal API keys and sign-out.
Each part is gated on its capability. A breadcrumb leads back to Settings or to
the You section the page was opened from (`accountParentKey`). Opened from
anywhere else, the page uses the chrome's own Back.

Settings' Accounts and devices pane and the profile menu open it. The phone
hub's Account section renders the same body for the default server. See
[Account](you-and-settings.md#account-srccomponentsaccount).

### The end credits route

`/finished` is a root modal, a sibling of the player. It takes `connection`,
`libraryId` and `path` params, plus `auto=1` when the book ended (or was marked
finished) rather than being opened early. It renders `EndCredits`: the year
shelf, listening stats, a rating, and the book `resolveUpNext` says plays next.
See [The end of a book](end-of-book.md#ending-a-book).

### The connect layout

`src/app/connect/_layout.tsx` shows a spinner until both the session and the
profiles are read. While a kids profile listens, it runs none of the flow and
`dismissTo`s `/kids`, unless `kidsConnectAllowed()` (see
[Kids mode](kids-mode.md#the-route-and-its-guard)).

The layout does not decide the signed-in bounce. When a link arrives while the
app runs, the child's params only reach the layout after the child mounts, so
`connect/index.tsx` decides it.

### The first step (`/connect`)

The first onboarding step offers:

- the server address with its probe ("Found &lt;name&gt;", Sign in, Try the
  demo);
- Scan a QR code (native) or a pasted pairing link (web);
- a pairing `token` arriving by deep link or QR `web_url`, exchanged at once;
- one-tap **Reconnect** rows for remembered servers the person listening isn't
  signed in to (`knownToOffer` over `useProfileConnections`, `src/lib/known-servers.ts`).
  For Add someone (`?profile=new`), every remembered server gets a row.

The route bounces an **authenticated** user home, from its own params, unless
they are adding another server (`?add=1`, a pairing `?token=`, or a sign-in
mid-flow through `pendingServerUrl`). It decides when it opens and again when it
is back on top.

Onboarding returns to the app through `leaveOnboarding()`
(`src/components/shell/leave-onboarding.tsx`, which calls
`router.dismissTo('/')`). When the decision is made at render time, it uses
`<LeaveOnboarding />`. It never uses `replace` or `<Redirect href="/">`, which is
also a replace. `(app)` already sits under `/connect` as the root stack's anchor,
so a replace stacked a second `(app)`. See
[Connect and home/away addresses](connect-and-addresses.md#connect-and-onboarding).

### Sign-in (`/connect/sign-in`)

The sign-in step takes an invite code **or** a username and password against the
pending server (`pendingServerUrl`, read once). The first step, a **Reconnect**
row, or the dead-token `ReconnectBanner` lead here. The banner
(`src/components/layout/reconnect-banner.tsx`) passes `reconnect=<cid>` and the
address in use now.

The code field redeems invite codes. The server still redeems legacy recovery
codes, but the app no longer mints them. Every sign-in ends in `finishConnect`.

## Layouts and special files

### The root layout

`src/app/_layout.tsx` sets up everything that lives for the app's whole run.

- **Providers.** It mounts the provider tree, outermost first:
  `GestureHandlerRootView`, `SafeAreaProvider`, `RootInsetsProvider`,
  `LanguageProvider`, `ThemeProvider`, `ApiProvider`.
- **Launch steps.** It runs them through `bootstrapPlayback()`
  (`src/lib/bootstrap.ts`), one memoised run shared with the car's headless task
  (see [Native integrations](native-integrations.md#booting-js-without-an-activity)).
  The steps are:
  1. the memoised launch migration `migrateStorage()`
     (`src/lib/storage-migration.ts`): the theme default, `resetStaleStorage`,
     then the connection identity migration (see
     [State and data](state-and-data.md#connection-identity-server_iduser_id));
  2. the downloads wipe after a reset;
  3. hydrating the session, settings, downloads, series-orderings,
     library-selection and profiles stores.
- **Service worker.** It imports `@/lib/register-sw` for its side effect.
- **Fonts.** It renders `StaticFonts`, which on the web puts the fonts in the
  static HTML (see [The web HTML shell](#the-web-html-shell)).
- **Lifetime services.** It starts the app's services and listeners through
  `src/components/shell/root-services{,.web}.tsx`, over
  `root-services-impl.tsx`. On native, `useRootServices()` starts them with the
  first commit. On the web, `RootListeners` is loaded and started once the first
  screen has painted. The list is in [Lifetime services](#lifetime-services).
- **Kids guard.** It mounts `KidsRouteGuard`, which keeps a kids profile on
  `/kids` (see [Kids mode](kids-mode.md#the-route-and-its-guard)).
- **Resume.** It runs `useAppResume`: the foreground refresh and the Android
  swipe-from-recents reset.
- **The root stack.** It declares the `(app)` stack as the root stack's
  `anchor`, so `(app)` always sits at the bottom. The `player`, `finished` and
  `year` screens are `fullScreenModal`s, and `profiles` is one with
  `gestureEnabled: false`.
- **Overlay hosts.** It mounts `<PortalHost />` and `<ShellToastHost />`
  **last**, inside the providers, so portaled overlays and toasts stack above
  every screen (see [Toasts](shell.md#toasts)).

#### Lifetime services

The headless listeners come first, then the framework-free controllers:

| Service | What it does | Details |
|---|---|---|
| `BookEndedListener` | Drives the end-of-book flow. | [The end of a book](end-of-book.md#ending-a-book) |
| `CompanionRevealListener` | Shows the "New in Who's who" toast. | [Player UI](player-ui.md#the-companion-companion) |
| `ShakeToExtendListener` | Shake to extend. | [The sleep timer](sleep-timer.md) |
| `startAutoSleep()` | A framework-free controller that arms the nightly sleep timer. | [The sleep timer](sleep-timer.md#auto-sleep-timer-auto-sleepts--auto-sleep-controllerts) |
| `startDriftWatch()` | The Fell asleep bookmark and the jump back. | [The sleep timer](sleep-timer.md#fell-asleep-drift-controllerts) |
| `startJumpUndo()` | Undo a jump. | [Player UI](player-ui.md#undo-a-jump-jump-undots) |
| `startKeepAhead()` | Downloads the next books when the listener opted in. | [Offline](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts) |
| `startAddressRouting()` | Native only. Picks each server's home or away address. | [Connect and home/away addresses](connect-and-addresses.md#the-runner-srcapiaddress-runnerts) |
| `startPlaceReconcile()` | A loaded book picks up a newer place from another device. | [Playback](playback.md#picking-up-another-devices-place-place-reconcilets) |
| `startChapterRefresh()` | A downloaded book takes its server's changed chapters. | [Offline](offline.md#lifecycle) |
| `startWidgetSync()` | iOS only. The widget and the sleep timer Live Activity. | [Native integrations](native-integrations.md#widgets-and-the-live-activity-ios) |
| `startCarSync()` | CarPlay and Android Auto. Never stopped. | [Native integrations](native-integrations.md#the-car-snapshot-srccar) |
| `startCastSync()` | Cast sessions switch the player's route. | [Chromecast](chromecast.md) |

### The `(app)` layouts

**Native, `src/app/(app)/_layout.tsx`.** The file only re-exports
`NativeAppShell` (`src/components/shell/native-shell.tsx`). The shell's web file
is an empty stand-in; [The web build](web-build.md#the-web-start-a-split-build)
explains why. `NativeAppShell` renders:

- `AuthGate` (`src/components/shell/auth-gate.tsx`), which shows a spinner while
  `loading` and renders `<Redirect href="/connect" />` while `unauthenticated`.
  It also backfills `has_password` and `has_recovery` on sessions persisted
  before those flags existed.
- **`NativeTabs`**, with one trigger per destination (SF Symbols on iOS,
  Material Symbols on Android). On iOS 26 the mini player is the tab bar's
  `BottomAccessory`.

On tablet and desktop the native tab bar is `hidden`, and the shell's own top
bar, sub-nav and docked player take over. `ShellFrame` (`shell-frame.tsx`) draws
that chrome around the navigator in both `(app)` layouts. On a phone without the
iOS 26 accessory, `NativeAppShell` also renders the one `FloatingMiniPlayer` as
the frame's `phoneBottom`, over NativeTabs.

**Web, `src/app/(app)/_layout.web.tsx`.** The web layout renders `AuthGate`, then
**headless `expo-router/ui` `Tabs`** over the same route groups. A hidden
`TabList` registers the five tab routes, one `<TabSlot />` renders the page, and
`ShellFrame` surrounds it with our chrome:

- on a phone, `MiniPlayer` (sitting on the tab bar through a `100%` bottom
  offset) and `PhoneTabBar`;
- on tablet and desktop, the top bar, sub-nav, banners and `DockedPlayer`.

The web layout also mounts three things through `deferred`, once the page has
painted: the web-only `CommandPalette` with its keyboard shortcut
(`usePaletteShortcut`, in `palette-store.ts`), the keyboard shortcuts overlay, and
the player's sheets (`ShellPlayerOverlays`). Their keys and open states live in
the shell, so a key pressed earlier still opens one.

### The tab stacks

`(app)/(home,library,search,offline,me)/_layout.tsx` is ONE layout file that
becomes each tab's `Stack`. Its group-keyed `unstable_settings`
(`TAB_STACK_SETTINGS`) give each stack its root route, and its `screenListeners`
is `tabStackListeners`. On a phone each page's Stack `header` is `PhoneHeader`;
tablet and desktop hide it.

### Incoming app links (native)

`src/app/+native-intent.tsx` is Expo Router's `redirectSystemPath`. It turns an
`audiosilo://` link (the pairing link, the iOS widget and Live Activity) into a
plain path before routing, so its query keeps its encoding (`appLinkPath`,
`src/lib/native-intent.ts`; see
[Native integrations](native-integrations.md#widgets-and-the-live-activity-ios)).

### The web HTML shell

`src/app/+html.tsx` is the static HTML wrapper for every exported web route. It
holds:

- the PWA manifest and favicon links (base-prefixed);
- the CSS cascade-layer order;
- the Stacks fonts' `@font-face` rules and preload links, written by
  `StaticFonts` through expo-font's static extraction;
- a backdrop in the OS colour scheme's background (light, or dark under
  `prefers-color-scheme: dark`), painted before React mounts so there is no
  flash.

### The browser tab title (web)

The files are `src/components/shell/document-title{,.web}.tsx`,
`src/lib/use-page-title{,.web}.ts` and `src/lib/document-title.ts`. Expo Router
turns React Navigation's document-title sync off, so the app names the tab
itself.

- A pushed page or root modal calls `usePageTitle(title)`. It is a no-op on
  native, and the title is `undefined` while the page's data loads. The hook
  claims the title while the screen is **focused**, so Back names the page under
  it again.
- `DocumentTitle`, mounted once in the root layout, is the only writer of
  `document.title`. While a book plays the title is `▶ <book> · AudioSilo`;
  otherwise it is `<page> · AudioSilo`, or else the active tab's name.
- The exported HTML gets `AudioSilo` from a `<title>` in `+html.tsx`, because
  router 58 leaves `Head` tags out of the static HTML.

A new page calls `usePageTitle` too.

### Unknown paths

`src/app/+not-found.tsx` matches any other path. It shows the app's own themed
"Page not found" with a way Home, in place of Expo Router's unbranded Unmatched
Route.

On the web, the server answers an unknown `/web/...` path with the player's
`index.html`. So while the page hydrates, the screen renders the same empty view
and shows its content right after (`useHydrated`). This keeps React's hydration
error #418 away. The `expo-router` plugin's `sitemap: false` in `app.json` turns
the `_sitemap` route off.

## Routing rules

The destinations (labels, our icons, SF Symbol and Material names, tab roots)
are one table, `TABS` in `src/components/shell/destinations.ts`. The native tab
bar, the web tab bar and the top bar all read it. `PHONE_TABS` and
`TOP_BAR_TABS` drop Downloads where the platform can't store downloads
(`engine.supported`; on the web, that needs a secure context with the Cache API).

- **The pushing tab owns a detail page.** The shared detail routes (book,
  folder, account, settings, household, journal, favourites, browse, series,
  author, narrator, collection) live once in the array group. Expo Router
  resolves a push against the current segments, so a book pushed from Search
  stays in Search and Back returns there.
- **Home owns a cold deep link.** Every tab could own a cold `/book/...` link,
  so Expo Router gives it to the alphabetically **first** tab group. That is why
  Downloads is `(offline)` and not `(downloads)`.

  `TAB_STACK_SETTINGS` (the group-keyed `unstable_settings` of the array-group
  layout, which sets each tab's `anchor`) inserts each tab's root underneath, so
  Back works. React Navigation copies the link's params onto that root and its
  ancestors, and `tabStackListeners` strips them; without it, Back landed on
  `/?libraryId=1`. A root keeps only its own `rootParams`
  (`Destination.rootParams` in `destinations.ts`: the Library's `mode`, `sort`,
  `status`, `dl` and `len`; the You hub's `section` and the Journal's `tab`).
  Every other param on a root, and every param on its ancestors, is replaced
  with none.
- **Tab presses from our chrome dispatch `JUMP_TO`** (`useTabPress`). For
  another tab the press runs
  `navigationRef.dispatch({ type: 'JUMP_TO', payload: { name: '(library)' } })`,
  which restores that tab's stack. An href can't do this, because
  `router.navigate('/(home)')` resolves to `/` and pops Home.

  Pressing the active tab again pops its stack to the root (`popTabToRoot(tab)`
  in `src/lib/root-stack.ts`, a `POP_TO_TOP` on that tab stack's key), which
  keeps the root's own params. A navigate to the root's href would push a second
  copy of the root, since a navigate is a push in this router.
- **The navigation container is read through `src/lib/router-ref.ts`.**
  expo-router 58 removed its global store, and its only public read is a hook. A
  press handler, a startup path or a test that reads the state at call time
  imports `navigationRef` from `@/lib/router-ref`. That is the one module that
  names the deep `expo-router/build/global-state/navigationRef` path, and an
  expo-router upgrade checks that path first.
- **Navigation at mount uses `useRouter()`.** Since expo-router 58 the
  module-level `router` throws until the router has rendered once. So an effect
  or guard that navigates on mount (`kids-route-guard.tsx`, the connect layout)
  takes the hook's router. The module-level one is fine in press handlers.
- **A tab root opened from elsewhere is popped to, not pushed.** `openYou` and
  `openJournal` close a root modal, pop the Me stack to its root
  (`popTabToRoot`) and then navigate. They never use `pushInShell`, which would
  push a second hub. Settings and Household are pages of the array group, so
  `openSettings` and `openHousehold` push them on the current tab instead. See
  [You, Settings and Account](you-and-settings.md#the-hub-and-its-routes).
- **Web: `<TabSlot />` stays at a fixed ancestor path at every width.** Only
  the sibling chrome toggles. Moving the slot between wrappers remounts every
  screen on a resize and jumps the URL to another tab.
- **Native: never add or remove tabs at runtime.** `NativeTabs`
  (`expo-router/native-tabs`) can't. Tablet and desktop set `hidden` on the
  whole bar instead, so every tab's stack survives an iPad rotation or a split
  view crossing 640.
- **Route-driven side effects live in `useShellEffects`**, which both `(app)`
  layouts run. Leaving the Search tab clears the search query. Leaving the browse
  section forgets the browse scroll positions; the browse section is the Library
  root and folders plus the book, series, author, narrator and collection pages
  (`BROWSE_PATHS` in `src/lib/paths.ts`).

The regression net for these rules is the route-tree suite, which drives
expo-router over the real `src/app` file list (see
[Testing](testing.md#route-tree-tests)).
