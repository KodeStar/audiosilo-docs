---
title: Player app overview
description: "The audiosilo-frontend codebase: one Expo / React Native project shipping to web PWA, iOS and Android - stack, source layout, route map, styling conventions, and the environment gotchas that bite first."
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
                    sleep-timer (+ auto-sleep, use-shake-to-extend), rate helpers
src/downloads/      offline downloads: native/web engines + registry store (a sibling
                    of playback, not inside it)
src/components/     ui/ (the Stacks primitives - Text, Icon, Button, Card, Input,
                    Dialog, Select, Tabs, Toast, Sheet... see Styling), shell/ (tab
                    destinations, auth gate, phone header + tab bar, top bar, sub-nav,
                    docked player, accessory player), layout/ (reconnect + offline
                    banners, ContentScope), player/, library/, account/, brand/
src/stores/         Zustand: session (connections + tokens), settings, search,
                    series-orderings
src/i18n/           i18next init, LanguageProvider, locale catalogs (locales/*.json)
src/theme/          tokens.json (the colour source) -> generated tokens.ts,
                    ThemeProvider (fonts + theme), scheme-pref (the default-theme
                    rule), useThemeColors
src/lib/            storage, secure-store, paths, format, hhmm (wall-clock "HH:MM"),
                    ticker (one start/stop interval), pairing, known-servers, device,
                    base-url, layout (the three form factors), utils (cn),
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
  [Testing](testing.md)).
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
| - (root layout) | `src/app/_layout.tsx` | Mounts the provider tree (`GestureHandlerRootView` → `SafeAreaProvider` → `LanguageProvider` → `ThemeProvider` → `ApiProvider`), hydrates the session/settings/downloads/series-orderings stores, imports `@/lib/register-sw` for its side effect, mounts the headless `BookEndedListener` (drives the end-of-book flow, see [Playback](playback.md#ending-a-book-end-credits-and-up-next)) and `ShakeToExtendListener`, starts the framework-free `startAutoSleep()` controller (arms the nightly sleep timer, see [Playback](playback.md#auto-sleep-timer-auto-sleepts--auto-sleep-controllerts)), and runs `useAppResume` (foreground refresh + the Android swipe-from-recents reset). Declares the `(app)` stack (the root stack's `anchor`, so it always sits at the bottom) and the `player`/`finished` screens as `fullScreenModal`s. Mounts `<PortalHost />` and `<ToastHost />` **last**, inside the providers, so portaled overlays and toasts stack above every screen. |
| - (web HTML shell) | `src/app/+html.tsx` | The static HTML wrapper for every exported web route: PWA manifest/favicon links (base-prefixed), the CSS cascade-layer order, and a backdrop in the OS colour scheme's background (light, or dark under `prefers-color-scheme: dark`) painted before React mounts so there is no flash. |
| `(app)` layout, native | `src/app/(app)/_layout.tsx` | `AuthGate` (`src/components/shell/auth-gate.tsx`: `loading` → spinner, `unauthenticated` → `<Redirect href="/connect" />`; also backfills `has_password`/`has_recovery` on sessions persisted before those flags existed), then **`NativeTabs`** with one trigger per destination (SF Symbols on iOS, Material Symbols on Android) and, on iOS 26, the mini player as the tab bar's `BottomAccessory`. On tablet/desktop the native tab bar is `hidden` and the shell's own top bar, sub-nav and docked player take over. |
| `(app)` layout, web | `src/app/(app)/_layout.web.tsx` | `AuthGate`, then **headless `expo-router/ui` `Tabs`** over the same route groups: a hidden `TabList` registers the five tab routes, one `<TabSlot />` renders the page, and our chrome surrounds it (phone: `MiniPlayer` + `PhoneTabBar`; tablet/desktop: top bar, sub-nav, banners, `DockedPlayer`). |
| tab stacks | `(app)/(home,library,search,offline,me)/_layout.tsx` | ONE layout file that becomes each tab's `Stack`. Its group-keyed `unstable_settings` (`TAB_STACK_SETTINGS`) give each stack its root route; `screenListeners` is `tabStackListeners`. On a phone each page's Stack `header` is `PhoneHeader`; tablet/desktop hide it. On a native phone without the iOS 26 accessory (Android, older iOS) it also floats the `MiniPlayer` card above the native tab bar. |
| `/` | `(app)/(home)/index.tsx` | Home: continue-listening cards, recently-added shelf, favourites - aggregated **across every connected server** via the `use*All` hooks. |
| `/browse?type=recent\|finished` | `(app)/(home,library,search,offline,me)/browse.tsx` | The "see all" grid behind a home shelf. |
| `/search` | `(app)/(search)/search.tsx` | Search across all connections, de-duplicated. The query lives in `useSearchStore`, so it survives the screen remounting; the tablet/desktop top bar's search field jumps here and bumps the store's `focusRequest`, which re-keys the input so it takes focus. Leaving the Search tab clears the query (`useShellEffects`). |
| `/library` | `(app)/(library)/library/index.tsx` | All libraries from all connections, plus a Favourites shelf row. |
| `/library/favourites` | `(app)/(home,library,search,offline,me)/library/favourites.tsx` | The favourites list (un-heart in place). |
| `/library/[libraryId]?connection=…&path=…` | `(app)/(home,library,search,offline,me)/library/[libraryId].tsx` | Library browse, root and nested folders alike - a two-line re-export of `src/components/library/browse-screen.tsx`. Content routes are **flat**: the connection id and the library-relative folder `path` ride as query params, never as nested route segments (an in-app `router.push` cannot resolve a route nested under a dynamic layout segment - it lands on the group's first child; rationale and helpers in `src/lib/paths.ts`). Each content screen scopes itself to its own `?connection=` with `<ContentScope>`, and the content hooks read that scope via `useScopedCid()`. |
| `/book/[libraryId]?connection=…&path=…` | `(app)/(home,library,search,offline,me)/book/[libraryId].tsx` | Book detail: an overview (breadcrumbs, versions, cover hero, stats, play/resume + download control, and the capability-gated community-metadata **About** block) above a horizontally scrollable underline **tab row** (`Tabs`) - Chapters/Files, Recaps, Characters, Bookmarks, History, Notes, Series - whose meta-driven tabs appear only when the data exists ([State & data](state-and-data.md#the-book-screens-tabs)). On tablet/desktop a right-hand cover panel (300 wide, 380 on desktop) carries the Listen button, which plays inline because the docked player bar is the transport there; while this book is playing the button becomes **Open the player**. Same flat query-param addressing as the library routes. |
| `/downloads` | `(app)/(offline)/downloads.tsx` | Downloaded books + storage used ([Offline](offline.md)). The group is `(offline)`, not `(downloads)`, on purpose - see [cold deep links](#the-shell-tabs-and-navigation). |
| `/settings` | `(app)/(me)/settings.tsx` | The root of the **Me** tab (a fuller Me hub is a later redesign phase). App-level preferences only: playback tunables, the auto sleep timer's window and type, up-next/download behaviour, language, theme, plus the Servers list that opens each connection's account screen. |
| `/account?connection=…` | `(app)/(home,library,search,offline,me)/account.tsx` | Per-connection account screen, reached from the Settings screen's Servers list: set/change the self-service password (the sign-out guard nudges a password-less user here via `sign-out-confirm.tsx`), pairing another device, personal API keys (capability-gated, demo-hidden), and sign-out. |
| `/player` | `src/app/player.tsx` | The full player, presented as a full-screen modal above the tabs on every form factor (opened from the mini player, the iOS accessory player, the docked player bar, or a phone's Listen button). Accepts `libraryId`/`path` (+ optional `position`/`track`) params and gates playback start on the chapters query settling. |
| `/finished` | `src/app/finished.tsx` | The end-credits screen shown when a book finishes (or from the player's menu). A root modal sibling of the player; renders `EndCredits` with an "up next" suggestion. See [Playback](playback.md#ending-a-book-end-credits-and-up-next). |
| `/connect` layout | `src/app/connect/_layout.tsx` | Onboarding stack (a spinner while the session hydrates). It deliberately does not decide redirects: on a link arriving while the app runs, the child's params only reach the layout after the child mounts. |
| `/connect` | `connect/index.tsx` | Enter a server URL (or auto-redeem a pairing token arriving via deep link / QR `web_url`). An **authenticated** user is bounced home from here, from this route's own params, unless they are adding another server (`?add=1`, a pairing `?token=`, or a sign-in mid-flow via `pendingServerUrl`) - the app supports multiple simultaneous server connections. When signed out of everything, also lists previously-connected servers as one-tap **Reconnect** shortcuts (`src/lib/known-servers.ts`), each pre-filling the address so the user only re-enters a code or password. Onboarding returns to the app with `router.dismissTo('/')`, not `replace`: `(app)` already sits under `/connect` as the root stack's anchor, so a replace stacked a second `(app)`. |
| `/connect/scan` | `connect/scan.tsx` | Camera QR scanner (`expo-camera`) for the pairing QR. |
| `/connect/sign-in` | `connect/sign-in.tsx` | Auth-code **or** username/password sign-in against the pending server. Reached fresh, from a **Reconnect** shortcut, or from the dead-token `ReconnectBanner` (`src/components/layout/reconnect-banner.tsx`), all with the address pre-filled via `pendingServerUrl`. The code field redeems invite codes (legacy recovery codes still redeem server-side, but the app no longer mints them). |
| `/demo` | `src/app/demo.tsx` | Public demo landing: mints a throwaway session on a demo-mode server and shows the pairing QR so the same demo user opens on a phone. |

## The shell: tabs and navigation

The chrome around the pages lives in `src/components/shell/`. There is **one
route tree on every platform**; only the navigator that drives the five tabs and
the chrome around it differ.

### Three form factors

`useLayout()` (`src/lib/layout.ts`) is the one form-factor switch, computed from
the window width by the pure, tested `layoutFor()`:

| Layout | Width | Chrome |
|---|---|---|
| `phone` | < 640 (`TABLET_MIN_WIDTH`) | A bottom tab bar (native on iOS/Android, `PhoneTabBar` on web) and the mini player; each page's Stack header is `PhoneHeader` (a large display title on a tab root; on a pushed page an inline back button, named after the page it returns to on iOS, a bare arrow on Android and web); the reconnect and offline banners sit under the header. |
| `tablet` | 640-1023 | `TopBar` (64 high: the mark with a server line, the Home / Library / Downloads destinations as icons, a search field, settings, and a profile button), `SubNav` (50 high: the page title on a tab root, a Back button on a pushed page; Home has none), the banners, the page capped at 1480 wide, and `DockedPlayer` (84 high) whenever a book is loaded. |
| `desktop` | >= 1024 (`DESKTOP_MIN_WIDTH`) | The tablet chrome with labelled destinations, plus a `DrawerSlot` beside the page (a closed, zero-width placeholder; Up next fills it in a later phase). |

Every screen reads this one value - never compare a width against a local
constant. (This replaced the single 1024px `WIDE_BREAKPOINT`; the old right-hand
player panel is gone, and the docked player bar is the tablet/desktop
transport.) Dialogs follow the same split: on a phone they rise from the bottom
like a sheet.

### Mini player, accessory player, docked player

- **iOS 26 phone:** the mini player is `AccessoryPlayer` in the native tab bar's
  `BottomAccessory` (the Liquid Glass pill). iOS renders the accessory twice
  (`regular` above the bar, `inline` beside the minimised bar), so the component
  is stateless: everything comes from the player store and its placement.
  `ACCESSORY_SUPPORTED` (`accessory-support.ts`) gates it; the accessory is
  hidden while nothing is loaded and on tablet/desktop.
- **Android, iOS before 26, and phone web:** `MiniPlayer`
  (`src/components/player/mini-player.tsx`), a card floating just above the tab
  bar. Content scrolls behind it, so scroll screens reserve room with
  `useMiniPlayerInset()`.
- **Tablet and desktop (web and native):** `DockedPlayer`, a bar along the
  bottom with a whole-book progress line, the cover and chapter (tap for the full
  player), previous chapter / skip back / play / skip forward / next chapter over
  a chapter scrubber, and speed, sleep and expand buttons. It renders its speed
  and sleep sheets as its own siblings, so mount it as a direct child of the
  shell's root column and the sheets cover the whole app.

### Routing rules

The destinations (labels, our icons, SF Symbol / Material names, tab roots) are
one table, `TABS` in `src/components/shell/destinations.ts`, read by the native
tab bar, the web tab bar and the top bar alike. On web, Downloads is filtered out
of the bars where the browser can't store downloads (`engine.supported`).

- **The pushing tab owns a detail page.** The shared detail routes (book,
  folder, account, favourites, browse) live once in the array group, and
  expo-router resolves a push against the current segments, so a book pushed
  from Search stays in Search and back returns there.
- **Cold deep link owner = Home.** A cold `/book/...` link, which every tab
  could own, is given to the alphabetically **first** tab group - which is why
  Downloads is `(offline)` and not `(downloads)`. `TAB_STACK_SETTINGS` (the
  group-keyed `unstable_settings` of the array-group layout) inserts each tab's
  root underneath so back works, and `tabStackListeners` strips the link params
  React Navigation copies onto that root and its ancestors (otherwise back
  landed on `/?libraryId=1`).
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
  Search tab, forgetting browse scroll positions when leaving the library) live
  in `useShellEffects`, run by both `(app)` layouts.

The regression net for all of this is the route-tree suite, which drives
expo-router over the real `src/app` file list - see
[Testing](testing.md#route-tree-tests).

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
  (`@/theme/use-theme-colors`), which returns the resolved theme's
  `colors.light` or `colors.dark`; don't branch on `scheme === 'dark'`
  yourself.
- **Fonts: Figtree (body), Bricolage Grotesque (display), JetBrains Mono.**
  `ThemeProvider` loads them from `@expo-google-fonts/*` (only the weights a
  token uses) and holds the splash screen until they are ready. React Native has
  no font fallback or synthetic weights, so there is **one family per token**:
  `font-sans` (Figtree 400), `font-sans-medium`, `font-sans-semibold`,
  `font-sans-bold`, `font-display` (Bricolage 700), `font-display-semibold`,
  `font-display-extrabold`, `font-mono` (JetBrains Mono 500). Never pair a font
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
  `AlertDialog` (+ the `confirm-dialog` helper), `Select`, `Tabs` (`underline` or
  `segmented`, optionally `scrollable`), `ToggleGroup` (+ the typed
  `SegmentedControl`), `Popover`, `DropdownMenu`, `Switch`, `Separator`, `Badge`,
  `Tooltip` and `Skeleton`. Hand-built on primitives: `Slider` (the seek bar),
  `Toast` (an imperative `toast({ title, description, action })` rendered by the
  root `<ToastHost />`) and `RowSurface` / `PressableRow` (the quiet list row).
  Also there: `Sheet`, `Stepper`, `TimeStepper`, `EmptyState`, `SectionHeader`
  and `AnimatedPressable` (a `className`-aware `Pressable` with a reduce-motion
  aware press-in scale). To add another reusables component, generate it into a
  scratch directory with the reusables CLI and port it (the CLI would overwrite
  our same-named files) - the steps are in the frontend `CLAUDE.md`.
- **Overlays portal.** Dialog, AlertDialog, Select, Popover, DropdownMenu and
  Tooltip portal into the root `<PortalHost />` on native (and into
  `document.body` on web), wrapped in `FullWindowOverlay` on iOS
  (`overlay.tsx`), so they can open from inside a card, a list row or a
  ScrollView. On a phone a dialog rises from the bottom edge like a sheet. The bottom **sheets** (speed, sleep timer) are still hand-rolled
  (`sheet.tsx` on `OverlayHost`), which renders in place and so must be mounted
  at screen level, never inside a clipped container. On web, pass the Radix-backed
  parts a flat style object (`StyleSheet.flatten`), never a style array.
- **Theme switching** goes through `ThemeProvider`, which calls
  `Uniwind.setTheme('light' | 'dark' | 'system')` and reads the resolved scheme
  back from `useUniwind()`; on web Uniwind puts the theme class on `<html>`, so
  it also reaches content portaled to `<body>`. **The default** is decided once
  at launch by the pure `initialSchemePref` (`src/theme/scheme-pref.ts`): a
  stored pick is kept; a **new** install with nothing stored follows the OS
  (`system`); an **existing** install that never chose a theme gets `dark` (the
  app used to be dark-first, so nobody's app turns light after the update);
  either default is written to `audiosilo.theme` once. "Existing" is
  `hasExistingInstall()` in `src/stores/session.ts`: a persisted connection, a
  known server, or a legacy session. An unknown stored value falls back to
  `dark` without being written.
- **Web `role="button"` workaround.** `src/lib/rnw-button-fix.web.ts` patches
  react-native-web so `role="button"` renders a `<div role="button">` instead of
  a real `<button>` (which nests illegally and trips an older-Safari flex bug);
  the native `rnw-button-fix.ts` is a no-op.

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
