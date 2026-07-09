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
| Routing | **Expo Router** (file-based, routes live in `src/app/`) |
| Styling | **NativeWind v4** (Tailwind v3.4 engine) - `className` on core RN components |
| Server state | **TanStack Query** (`src/api/hooks.ts`, provider in `src/api/provider.tsx`) |
| Client state | **Zustand** (`src/stores/`, plus the playback and downloads stores) |
| Audio | A **custom native Expo module**, `modules/audiosilo-player`: `AVQueuePlayer` on iOS, `Media3/ExoPlayer` on Android; **HTML5 Audio + Media Session** on web. There is no react-native-track-player dependency - older docs that mention it are stale. |
| Icons | FontAwesome Pro 7 glyphs **vendored as raw SVG path data** in `src/components/ui/icon-data.ts`, drawn with `react-native-svg`. No `@fortawesome/*` dependency, so no private npm token is needed to build. |
| Secrets | **expo-secure-store** (Keychain/Keystore) for session tokens; **AsyncStorage** for everything else (`src/lib/secure-store.ts` / `src/lib/storage.ts`) |
| i18n | **i18next + react-i18next + expo-localization** (`src/i18n/`) - see [Internationalisation](i18n.md) |

## Source layout

```
src/app/            Expo Router routes: (app) authenticated shell, connect/ onboarding,
                    player modal, demo landing, +html.tsx web shell
src/api/            client.ts (typed fetch wrapper), types.ts (wire mirrors),
                    hooks.ts (React Query), provider.tsx (multi-connection registry),
                    reachability.ts (online/offline tracking)
src/playback/       PlaybackService interface + per-platform engines, the player store,
                    book-queue (timeline math), progress-sync (offline-safe saves),
                    sleep-timer, rate helpers
src/downloads/      offline downloads: native/web engines + registry store (a sibling
                    of playback, not inside it)
src/components/     ui/ (design-system primitives - Text, Icon, Button, Card, Sheet,
                    SegmentedControl, Stepper, Skeleton, EmptyState, SectionHeader,
                    AnimatedPressable, OverlayHost), layout/ (shell/header/nav),
                    player/, library/, account/, brand/
src/stores/         Zustand: session (connections + tokens), settings, search
src/i18n/           i18next init, LanguageProvider, locale catalogs (locales/*.json)
src/theme/          ThemeProvider + raw color tokens (tokens.ts)
src/lib/            storage, secure-store, paths, format, pairing, recovery, device,
                    base-url, layout (the one phone->desktop breakpoint),
                    register-sw, and other pure helpers
modules/audiosilo-player/  the local Expo module (Swift + Kotlin + TS bridge)
public/             sw.js (service worker) + manifest.json (PWA), copied verbatim
                    into the web export
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
groups are the authenticated shell `(app)`, the `connect/` onboarding flow, and a
handful of standalone screens.

| Route | File | Purpose |
|---|---|---|
| - (root layout) | `src/app/_layout.tsx` | Mounts the provider tree (`GestureHandlerRootView` → `SafeAreaProvider` → `LanguageProvider` → `ThemeProvider` → `ApiProvider`), hydrates the session/settings/downloads stores, imports `@/lib/register-sw` for its side effect, mounts the headless `BookEndedListener` (drives the end-of-book flow, see [Playback](playback.md#ending-a-book-end-credits-and-up-next)), and runs `useAppResume` (foreground refresh + the Android swipe-from-recents reset). Declares the `(app)` stack and the `player`/`finished` screens as `fullScreenModal`s. |
| - (web HTML shell) | `src/app/+html.tsx` | The static HTML wrapper for every exported web route: PWA manifest/favicon links (base-prefixed) and a dark backdrop painted before React mounts so there is no white flash. |
| `(app)` guard | `src/app/(app)/_layout.tsx` | The auth gate: `loading` → spinner, `unauthenticated` → `<Redirect href="/connect" />`, otherwise wraps children in `AppShell` (header + nav). Also backfills `has_password`/`has_recovery` on sessions persisted before those flags existed. |
| `/` | `(app)/index.tsx` | Home: continue-listening cards, recently-added shelf, favourites - aggregated **across every connected server** via the `use*All` hooks. |
| `/browse?type=recent\|finished` | `(app)/browse.tsx` | The "see all" grid behind a home shelf. |
| `/search` | `(app)/search.tsx` | Search across all connections, de-duplicated; shares its query text with the desktop top bar via `useSearchStore`. |
| `/library` | `(app)/library/index.tsx` | All libraries from all connections, plus a Favourites shelf row. |
| `/library/favourites` | `(app)/library/favourites.tsx` | The favourites list (un-heart in place). |
| `/library/[libraryId]` | `(app)/library/[libraryId]/index.tsx` | Library root browse - a two-line re-export of `src/components/library/browse-screen.tsx`. |
| `/library/[libraryId]/[...path]` | `(app)/library/[libraryId]/[...path].tsx` | Nested folder browse - same `BrowseScreen`, the catch-all segments become the folder `path` (helpers in `src/lib/paths.ts`). |
| `/book/[libraryId]/[...path]` | `(app)/book/[libraryId]/[...path].tsx` | Book detail: play/resume, download control, chapters, bookmarks, notes, listening history, other versions of the same book. |
| `/downloads` | `(app)/downloads.tsx` | Downloaded books + storage used ([Offline](offline.md)). |
| `/settings` | `(app)/settings.tsx` | Playback tunables, language, theme, connections, self-service password/recovery, per-server API keys (capability-gated), sign-out. |
| `/player` | `src/app/player.tsx` | The full player, presented as a full-screen modal above the shell. Accepts `libraryId`/`path` (+ optional `position`/`track`) params and gates playback start on the chapters query settling. |
| `/finished` | `src/app/finished.tsx` | The end-credits screen shown when a book finishes (or from the player's menu). A root modal sibling of the player; renders `EndCredits` with an "up next" suggestion. See [Playback](playback.md#ending-a-book-end-credits-and-up-next). |
| `/connect` layout | `src/app/connect/_layout.tsx` | Onboarding stack. An **authenticated** user is bounced home unless they are adding another server (`?add=1`, a pairing `?token=`, or a sign-in mid-flow via `pendingServerUrl`) - the app supports multiple simultaneous server connections. |
| `/connect` | `connect/index.tsx` | Enter a server URL (or auto-redeem a pairing token arriving via deep link / QR `web_url`). |
| `/connect/scan` | `connect/scan.tsx` | Camera QR scanner (`expo-camera`) for the pairing QR. |
| `/connect/sign-in` | `connect/sign-in.tsx` | Auth-code **or** username/password sign-in against the pending server. The code field accepts both invites and recovery codes - they redeem through the same path. |
| `/demo` | `src/app/demo.tsx` | Public demo landing: mints a throwaway session on a demo-mode server and shows the pairing QR so the same demo user opens on a phone. |

## Styling conventions

- **`className` everywhere.** NativeWind v4 styles core RN components directly;
  design tokens live in `tailwind.config.js` and the directives in
  `src/global.css`.
- **Tokens**: primary pink `#db2777`; custom dark grays `gray-750` (`#2c3340`),
  `gray-840` (`#1a2331`), `gray-860` (`#161f2c`); Roboto weights as
  `font-roboto-{light,medium,semibold,bold}` (plain `font-sans` is Roboto
  regular). The app is dark-mode-first.
- **Raw color values** for places that need a string instead of a class (status
  bar, `ActivityIndicator`, SVG fills, navigation theme) come from
  `src/theme/tokens.ts`, which mirrors the Tailwind theme.
- **Never import an icon library.** Use `<Icon name=… />` from
  `src/components/ui/icon.tsx`; the glyphs are vendored SVG paths in
  `icon-data.ts`. To add or change an icon, edit `scripts/glyphs/manifest.mjs`
  and regenerate via the isolated generator in `scripts/glyphs/` (the only place
  a FontAwesome Pro token is ever needed).
- **Text goes through `<Text variant=… />`** (`src/components/ui/text.tsx`) -
  variants `body`, `muted`, `heading`, `title`, `subtitle`, `label`, `caption`
  encode the type scale; add a `className` for overrides.
- **Compose the shared UI primitives** in `src/components/ui/` rather than
  restyling raw RN components ad hoc. Beyond `Icon` and `Text` the design system
  provides `Button`, `Card`, `Sheet` (the bottom sheet behind the speed and
  sleep-timer controls), `SegmentedControl`, `Stepper`, `Skeleton` (loading
  placeholders), `EmptyState` (the "nothing here yet" screens), `SectionHeader`,
  and `AnimatedPressable` - a `className`-aware `Pressable` that adds a press-in
  scale/opacity via reanimated (and honours reduce-motion), used for tappable
  rows and buttons. `OverlayHost` mounts sheets and dialogs above the app tree.
- **One layout breakpoint.** `src/lib/layout.ts` `WIDE_BREAKPOINT` (1024px) is the
  single phone->desktop switch every screen flips at (bottom nav + full-screen
  modal player below it; sidebar rail + docked player at or above) - never
  re-declare a local width constant.
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
