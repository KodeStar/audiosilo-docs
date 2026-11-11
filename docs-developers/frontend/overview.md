---
title: Player app overview
description: "The audiosilo-frontend codebase in a few minutes: one Expo / React Native project shipping to the web PWA, iOS and Android. The stack, the source layout, the two layout conventions, where each topic is documented, and what to set up before you run it."
---

The player (`audiosilo-frontend`) is the **read side** of AudioSilo. One codebase
ships to a **web PWA, iOS and Android**. It consumes the server's JSON API through
hand-mirrored types with no codegen (see the
[cross-repo contract](../architecture/cross-repo-contract.md)), and it addresses
all content by `(library_id, rel_path)`. Most of its complexity is in
[playback](playback.md): the whole-book timeline and the three engines.

## Stack

| Concern | Choice |
|---|---|
| Framework | **Expo SDK 58**, **React Native 0.88** (new architecture), **React 19.3** |
| Routing | **Expo Router** (file-based, routes live in `src/app/`). iOS and Android use `NativeTabs`; the web uses headless `expo-router/ui` Tabs. See [Routes and navigation](routes.md) and [The app shell](shell.md). |
| Styling | **Uniwind** (Tailwind v4): `className` on core RN components, on every platform. The web player needs Safari 16.4, Chrome 111 or Firefox 128 at least, because of Tailwind v4's CSS. |
| Design system | **Stacks** (`STYLEGUIDE.md`, authoritative): semantic light and dark tokens, Figtree, Bricolage Grotesque and JetBrains Mono, and **react-native-reusables** primitives (shadcn/ui for React Native on `@rn-primitives`) restyled to it. See [Styling and the design system](styling.md). |
| Server state | **TanStack Query** (`src/api/hooks.ts`, provider in `src/api/provider.tsx`) |
| Client state | **Zustand** (`src/stores/`, plus the playback and downloads stores) |
| Lists | **FlashList v2** (`@shopify/flash-list`) for the cover shelves and grids (`ShelfRow`, `CoverGrid`) |
| Audio | A **custom native Expo module**, `modules/audiosilo-player`: `AVQueuePlayer` on iOS and `Media3/ExoPlayer` on Android. The web uses **HTML5 Audio and Media Session**. There is no react-native-track-player dependency, and older docs that mention it are stale. |
| Icons | FontAwesome Pro 7 glyphs **vendored as raw SVG path data** in `src/components/ui/icon-data.ts`, drawn with `react-native-svg`. There is no `@fortawesome/*` dependency, so a build needs no private npm token. |
| Secrets | **expo-secure-store** (Keychain and Keystore) holds session tokens (`src/lib/secure-store.ts`). On iOS they are readable after first unlock, for CarPlay (see [Native integrations](native-integrations.md#tokens-on-a-locked-phone-srclibsecure-storets)). **AsyncStorage** holds everything else (`src/lib/storage.ts`). |
| Apple Watch | A standalone **SwiftUI** watchOS app (`targets/watch/`, added by `@bacons/apple-targets`), with a WatchConnectivity module on the phone (`modules/audiosilo-watch`). See [Apple Watch](apple-watch.md). |
| Car and widgets | **CarPlay** (our own `CPTemplateApplicationScene` code) and **Android Auto** (a Media3 `MediaLibraryService`) live in the native module. iOS widgets and the sleep timer Live Activity use **expo-widgets**. See [Native integrations](native-integrations.md). |
| i18n | **i18next + react-i18next + expo-localization** (`src/i18n/`). See [Internationalisation](i18n.md). |

## Source layout

```
src/app/            Expo Router routes: (app) with its five tab groups, connect/
                    onboarding, the player + finished modals, demo landing,
                    +html.tsx web shell, +native-intent.tsx (app links as paths),
                    +not-found.tsx (any unknown path)
src/api/            client.ts (typed fetch wrapper), types.ts (wire mirrors),
                    hooks.ts (React Query), provider.tsx (multi-connection registry),
                    reachability.ts (online/offline tracking), server-snapshots.ts
                    (each server's last /server answer, kept for an offline launch),
                    address-route.ts + address-runner.ts + server-id-probe.ts (home
                    and away addresses)
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
                    (reconnect + offline banners, ContentScope, the At home and away
                    card), player/,
                    library/ (covers, shelves, grids, the Library modes, the
                    collection/person/series route screens), series/ (bookcase,
                    person pages), book/ (the book page), annotations/
                    (bookmark and note rows, editors, labels), journal/ (the
                    Journal and its export), you/ (the You hub; stats/, year/),
                    settings/ (the Settings panes), account/ (a server's Account
                    page), connect/ (onboarding), home/, search/, upnext/, downloads/
                    (the Downloads tab), house/ (Listening in the house), profiles/
                    (Who's listening?, the PIN dialog, the kids library picker,
                    removing a person), household/ (the Household page: On this
                    device, members, the add sheet, member cards), kids/
                    (kids mode), brand/
src/car/            CarPlay + Android Auto, the JS side: the car snapshot (car-model),
                    car covers, the car controller, the AudiosiloCar headless task
src/cast/           Chromecast: the route switch (routed-service), the cast engine
                    (cast-service), cast tokens, the native and web drivers, the
                    Cast button (see Chromecast)
src/reader/         the ebook reader: the screen, the web host (iframe) and the apps'
                    host (WebView, the book in chunks, the EPUB cache), the message
                    protocol, the reading-place queue (see The ebook reader)
src/widgets/        iOS widget + sleep timer Live Activity ('widget' functions) and
                    their sync (widget-model, widget-sync.ios)
src/watch/          the phone's side of the Apple Watch: the message model, the link
                    (a no-op off iOS), the store, Send to watch (see Apple Watch)
src/stores/         Zustand: session (connections + tokens), profiles (people on this
                    device), settings, search
                    (+ recent searches), series-orderings, library-selection
src/i18n/           i18next init, LanguageProvider, locale catalogs (locales/*.json)
src/theme/          tokens.json (the colour source) -> generated tokens.ts,
                    ThemeProvider (fonts + theme), scheme-pref (the default-theme
                    rule), useThemeColors (a context ThemeProvider fills)
src/lib/            storage, secure-store, paths, format, hhmm (wall-clock "HH:MM"),
                    ticker (one start/stop interval), pairing, known-servers, device,
                    base-url, layout (the three form factors), utils (cn),
                    storage-migration (the one launch-time storage migration),
                    connection-id + identity-migration (connection ids,
                    <server_id>.<user_id>, and their one-time key migration),
                    bootstrap (the launch steps, shared with the car task),
                    register-sw, and other pure helpers
modules/audiosilo-player/  the local Expo module (Swift + Kotlin + TS bridge)
modules/audiosilo-watch/   the phone's WatchConnectivity link (apple only)
targets/watch/      the Apple Watch app (Swift, not bundled by Metro): Core/ (Foundation
                    only), Net/, Storage/, Phone/, Playback/, UI/
watch-core/         SwiftPM package over targets/watch/Core, for its tests on the host
plugins/            config plugins (CarPlay scenes, Cast, the watch scheme, the Xcode 26
                    fix); withCarPlay, withCast and withWatchScheme have jest tests,
                    widgets-entitlements.test.ts checks that no target asks for push
                    and build-properties.test.ts pins the expo-build-properties options
index.ts            the app entry (package.json main): registers the car's headless
                    task, then expo-router/entry
public/             sw.js (service worker) + manifest.json (PWA), copied verbatim
                    into the web export
STYLEGUIDE.md       Stacks, the player's design system (authoritative for its look)
```

Two conventions keep this layout healthy:

- **Logic stays out of `src/app/**` screens.** Screens compose components and
  hooks. Anything with behaviour worth testing lives in `src/lib`, `src/api`,
  `src/playback`, `src/downloads` or `src/stores`, where it gets a co-located
  unit test. The coverage config excludes `src/app/**` entirely (see
  [Testing](testing.md)).

  The redesigned screens go one step further. Their route file is a one-line
  re-export (`export default HomeScreen`), and the screen lives with its
  components under `src/components/<feature>/`. Each feature keeps its rules in
  a pure, tested `*-model.ts`: `home-model.ts`, `series-model.ts`,
  `search-model.ts`, `up-next-model.ts`, `books-view.ts`, `downloads-view.ts`,
  `keep-ahead.ts`, `book-page-model.ts`, `diary-model.ts`, `editor-model.ts`,
  `you-model.ts`, `stats-model.ts`, `year-model.ts`, `settings-model.ts`,
  `account-model.ts` and `connect-model.ts`.
- **Path is identity, scoped by connection.** Every content call passes
  `?path=<rel_path>`, never a database id. The app can be signed in to several
  servers at once, and two of them can share a library id. So durable and cached
  client state keys on `(connectionId, library_id, path)` (see
  [State & data](state-and-data.md)).

## Where each topic lives

| Topic | Page |
|---|---|
| Every route, its file and its screen; the root layout; the rules for tabs, pushes and deep links | [Routes and navigation](routes.md) |
| The chrome around the pages: form factors, the command palette, the sub-nav, the Up next drawer and sheet, the profile menu, toasts | [The app shell](shell.md) |
| `className`, tokens, fonts, `<Text>`, icons, the `src/components/ui/` primitives, overlays, theme switching | [Styling and the design system](styling.md) |
| How the web build starts fast, and the `/web` base path | [The web build](web-build.md) |
| The Library tab's modes, the covers and shelves, the series and person pages | [The Library and browse screens](library-and-browse.md) |
| The engines, the timeline math, the player store | [Playback](playback.md), [Smart speed and Voice boost](audio-effects.md) |
| The mini player, the docked bar, the full player, its sheets | [Player UI](player-ui.md) |
| What happens when a book finishes, and what plays next | [The end of a book](end-of-book.md) |
| The sleep timer | [The sleep timer](sleep-timer.md) |
| The book page, the reader, podcasts | [The book page](book-page.md), [The ebook reader](reader.md), [Podcasts](podcasts.md) |
| Bookmarks, notes and the Journal | [Bookmarks and notes](annotations.md), [The Journal](journal.md) |
| The You hub, Settings and Account | [You, Settings and Account](you-and-settings.md) |
| People on the device and in the household | [Profiles](profiles.md), [Household page and members](household.md), [Kids mode](kids-mode.md), [Listening in the house](listening-in-the-house.md) |
| Connecting to a server, home and away addresses | [Connect and home/away addresses](connect-and-addresses.md) |
| The API client, React Query, the stores, progress sync | [State & data](state-and-data.md) |
| Downloads and the PWA | [Offline & PWA](offline.md) |
| CarPlay, Android Auto, widgets, the watch, Cast | [Native integrations](native-integrations.md), [Apple Watch](apple-watch.md), [Chromecast](chromecast.md) |
| Languages | [Internationalisation](i18n.md) |
| Tests and native checks | [Testing the player](testing.md) |

## Environment gotchas

:::warning[Read this before running anything]
These are the four failure modes that cost the most time on a fresh checkout.
The workspace guide's [Environment gotchas](../contributing/workspace.md#environment-gotchas)
covers each one in full.
:::

1. **Node 24 is required.** `.nvmrc` pins `24.16.0`; run `nvm use` first. An
   older system Node crashes the Expo CLI as soon as a `.env` file exists (see the
   [toolchain matrix](../contributing/workspace.md#toolchain-matrix)).
2. **Native runs need a dev build, not Expo Go.** The `audiosilo-player` module,
   `react-native-svg` and `expo-secure-store` are native code, which Expo Go
   can't load. Run `npx expo prebuild`, then
   `npx expo run:ios` or `run:android`. The web (`npm run web`) needs no native
   build.
3. **An edit under `modules/audiosilo-player/{ios,android}` needs a full
   rebuild** (`run:ios` or `run:android`). A Metro or JS reload does not pick it
   up. This is the most common reason a native fix seems to do nothing.
4. **Web development needs CORS.** The Metro dev server runs at
   `http://localhost:8081`. Set the server's `cors_origins` to that origin, or
   serve same-origin through the baked export (see the
   [Configuration reference](../server/configuration.md)).

Run tool commands from the **repo root**. A stray `cd` into `node_modules`
breaks Expo's config resolution. Before calling any change done, run the full
gate (`npx tsc --noEmit && npm run lint && npm run format && npm test`). CI
enforces it, plus the dependency checks (see
[Gates and CI](../contributing/gates-and-ci.md)).
