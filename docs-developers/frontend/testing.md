---
title: Testing the player
description: "The jest-expo harness, the checks npm test runs before jest, the global mocks in jest.setup.ts (including FlashList's measurements), the conventions that keep logic testable, rendering covers and grids, the overlay and route-tree harnesses, and the patterns for mocking fetch, reachability, and Platform.OS."
---

Every piece of new logic in the frontend ships with a unit test. The harness is
deliberately boring; the interesting part is the set of conventions that keep
the code *testable* in the first place.

## The harness

- **jest-expo** preset (Jest 29 runtime) - resolves and transforms React
  Native / Expo modules. Config lives in `jest.config.js`:
  - `moduleNameMapper` maps the `@/` alias to `src/` (and `@/assets/` to
    `assets/`);
  - `transformIgnorePatterns` re-includes the ESM packages the app imports
    (expo, react-native-\*, uniwind, `@rn-primitives/*`, `@tanstack/*`,
    zustand, …) so they are
    transpiled instead of failing on `import`;
  - `testMatch` picks up `**/*.test.ts` and `**/*.test.tsx`;
  - `collectCoverageFrom` covers `src/**/*.{ts,tsx}` but **excludes
    `src/app/**`** - screens are intentionally out of coverage scope (see
    conventions below).
- **@testing-library/react-native 14** for component and hook tests. Its
  matchers are **built in** - there is no `@testing-library/jest-native`
  dependency; don't add one.

Run with `npm test`; coverage with `npm test -- --coverage`. `npm test` first runs
three fast Node checks before jest:

1. `node scripts/gen-tokens.mjs --check` fails if the generated colour tokens
   (the generated region of `src/global.css`, and `src/theme/tokens.ts`) drifted
   from `src/theme/tokens.json`.
2. `node --test scripts/gen-tokens.test.mjs` unit-tests the generator itself
   (Node's built-in test runner, not jest): colour parsing and normalising, the
   camelCase names, the fixed palette (`parsePalette`: plain colours only, no
   shade families or aliases), that both themes carry the same keys with valid
   colours and no clash with the palette, and the CSS and TS it emits.
3. `node scripts/check-styles.cjs` compiles `src/global.css` through Uniwind's
   real compiler, with the same options Metro uses (both read the root
   `uniwind.config.js`), and asserts styling guarantees no unit test can see: a `dark:`
   utility still has a rule outside every `@scope` (dark mode in browsers without
   CSS `@scope`); native keeps the px letter-spacing scale (`tracking-wider` is
   0.5 on iOS); and the themed Stacks tokens resolve per theme on iOS (also
   through an opacity modifier such as `bg-brand/10`) and switch under `.dark` on
   web. If a Uniwind upgrade renames the compiler internals it reads, it fails
   loudly - update the hook, don't delete the guard.

## Global setup (`jest.setup.ts`)

Loaded via `setupFilesAfterEnv`, it does six things:

1. **Imports `@/i18n`** so i18next is initialised with the English catalog -
   components using `useTranslation` and the locale-aware formatters resolve
   real strings under the fallback.
2. Sets **`IS_REACT_ACT_ENVIRONMENT = true`** - React 19 gates `act(...)`
   support behind this flag, and `render`/`renderHook` need it to flush state
   updates. Pure-logic suites are unaffected.
3. Mocks **`@react-native-async-storage/async-storage`** with an in-memory
   `Map` (`getItem`/`setItem`/`removeItem`/`clear` as jest fns).
4. Mocks **`expo-secure-store`** the same way
   (`getItemAsync`/`setItemAsync`/`deleteItemAsync`).
5. Mocks **`react-native-reanimated`** with a small self-contained stand-in (the
   real module initialises its native Worklets module and throws under Node):
   animations resolve synchronously (timing callbacks fire with
   `finished: true`), `Animated.*` map to plain RN components, shared values
   carry the `get`/`set` accessors as well as `.value`, the
   layout-animation builders (`FadeIn`, `SlideInDown`, `LinearTransition`, …)
   are chainable no-op stubs, and `useReducedMotion` is a `jest.fn` returning
   `false` that a test can flip.
6. Mocks **FlashList v2's measurements**
   (`@shopify/flash-list/dist/recyclerview/utils/measureLayout`). FlashList
   measures its parent and items natively, which yields nothing under Node, so
   a list would render no items at all; the mock answers with a fixed 400x900
   viewport and 100x100 items (the values of the package's own `jestSetup.js`,
   whose FlashList-to-RecyclerView swap no longer matches its exports). Any
   `ShelfRow` or `CoverGrid` renders its first items in a test because of it.

Together these let the storage, session, sync, settings and downloads layers
run unchanged without a device or browser. Nothing else is mocked globally -
`fetch`, reachability, `expo-localization` etc. are mocked per test file as
needed.

## Conventions

- **Logic stays out of `src/app/**` screens.** Screens compose hooks and
  components; behavior lives in `src/lib`, `src/api`, `src/playback`,
  `src/downloads`, `src/stores`, `src/i18n` - pure or framework-light modules
  that get **co-located `*.test.ts(x)` files**. This is why the coverage
  config can exclude screens outright.
- **Test the seam you changed.** A wire-format change needs a test on the
  frontend *and* the server side - see
  [cross-repo changes](../contributing/cross-repo-changes.md).
- Prefer direct function tests for pure modules. For hooks, note that
  `renderHook` is incompatible with this jest-expo + React 19 setup - the hook
  tests (e.g. `src/components/account/use-sign-out.test.tsx`) instead **mount a
  tiny probe component** with `render(...)` that calls the hook and exposes its
  result.

### The shared player-store double (`src/testing/player-store-mock.ts`)

The player store is the hardest dependency to bring into a test: it owns the
native engine, the API layer and the download store. Three suites need it
without any of that - `src/playback/sleep-timer.test.ts`,
`src/playback/auto-sleep-controller.test.ts` and
`src/components/player/sleep-timer-button.test.tsx` - and they share **one**
double rather than three near-copies, so its fidelity is decided in one place.

Use it as the whole mocked module, and pull the same instance back out with
`playerStoreMock()` to drive it:

```ts
jest.mock('@/playback/store', () =>
  // `require` (not an import) because a jest.mock factory is hoisted above every import.
  require('@/testing/player-store-mock').createPlayerStoreMock(),
);
const player = playerStoreMock();
```

What it models **faithfully** - the parts a test may lean on:

- it is a **real zustand store**, so `subscribe((state, prev) => …)`,
  notification order and equality behave exactly as in production (the sleep
  timer freezes its countdown off a store notification, and the auto sleep
  controller detects the play edge by comparing `state`/`prev` - both would be
  testing a fake otherwise);
- the store's **real selectors** over the stand-in state: `selectBookKey`
  (`connectionId:libraryId:path`), `selectIsPlaying` (strictly `playing`),
  `selectIsTransportLive` (`playing` or `loading`), `selectBookPosition`;
- `pause()` records the call **and then** writes the paused snapshot, in that
  order, so a listener reacting to the write is ordered after the pause as it is
  in production;
- `setOutputVolume` drops a write that would not change the gain, exactly as the
  real store does - so the timer's many defensive volume restores do not show up
  as writes production never makes.

Its deliberate **divergences**, which a test must not read as production
behaviour:

- **`toggle()` is a pure spy.** It does not synthesise a `playing` snapshot; a
  test that needs a resume to land writes the snapshot itself (`setPlayState`).
  The real `toggle` goes through the engine, and faking the outcome would test
  the double.
- **`bookPosition` is a plain field**, set by the test. The real
  `selectBookPosition` derives the whole-book position from the queue's chapter
  offsets and the engine's per-track position.
- **`MockNowPlaying` is a subset** of the real `NowPlaying`: `connectionId`,
  `libraryId`, `path` and `queue` (`chapters` + `total`), which is all the
  selectors and the chapter scan read.
- **`subscribe` is wrapped** so the double can report `subscriberCount()` and
  `dropSubscribers()`. Production has no such hook; they exist for the suites
  that attach and detach a subscription rather than holding one for the process
  lifetime.
- **`patch()` writes without notifying** - fixture setup, and the shape of a
  change that happened while nothing was subscribed. Use `setPlayState()` when
  the notification is the point.
- Nothing loads a book: there is no engine, no API and no persistence, so
  `nowPlaying`, `bookPosition` and the play state are whatever the test sets.

`createPlayerStoreMock()` runs once per module registry, so a suite that calls
`jest.resetModules()` must re-require both the mocked module and anything under
test (`playerStoreMock()` throws rather than hand back a stale instance).

### `render` and `fireEvent` are async (RNTL 14)

In `@testing-library/react-native` 14 **both `render` and `fireEvent` return
promises** and both must be awaited. The failure mode is nastier than a flake:
a test that fires two un-awaited presses leaves **every later `render` in that
file** mounting into a detached tree, so unrelated cases further down the file
fail with queries that find nothing - which reads as "the component stopped
mounting" rather than as a missing `await` several tests earlier.

```ts
await render(<TimeStepper value="22:00" onChange={onChange} label="From" />);
await fireEvent.press(screen.getByLabelText(LATER));
```

Note that the common `await act(async () => { render(ui) })` helper does **not**
await `render` - the `act` callback returns before the render promise settles.
Prefer awaiting `render` directly; where a mount helper wraps it in `act`, the
`render` inside still needs its own `await`.

### Rendering overlays (`src/testing/render-overlay.tsx`)

The portal-based primitives (Dialog, AlertDialog, Select, Popover, DropdownMenu,
Tooltip) render nothing on native without the root `<PortalHost />`. Mount them
with `mountWithPortal(ui)`, which renders `ui` inside a `SafeAreaProvider` and the
`RootInsetsProvider` the overlays read their insets from, with a `PortalHost`
after it, the way the app's root layout does. The positioned
overlays also only appear once they have measured their trigger, and React
Native's jest preset stubs `measure` with a no-op, so the helper answers it with
a fixed box. Await it, and every `fireEvent` after it (see above).

### Rendering covers, shelves and grids

A component that draws a `BookCover` (every `CoverTile`, shelf and grid) reaches
into several app-wide modules, so a render test mocks them at the top of the file,
as `src/components/library/cover-pieces.test.tsx` and
`src/components/series/browse-pieces.test.tsx` do:

- `@/api/provider` - `useOptionalApi` (and `useCid` where the screen reads it), for
  the cover URL; `@/api/hooks` - `useServerInfo` (the `cover_sizes` flag; while it
  is unknown the cover deliberately fetches nothing);
- `@/downloads/store` - `useDownloadEntry` (the downloaded-copy source and the
  downloaded flag);
- `@/theme/theme-provider` - `useTheme` (`CoverFrame`'s iOS shadow reads the
  scheme, and the real provider imports `global.css`);
- `@/lib/layout` - a fixed `useLayout()` (tile and grid sizes depend on it), and
  `@/components/player/mini-player` - `useMiniPlayerInset` for a grid's bottom
  padding.

`book-cover.test.tsx` replaces `expo-image` with a host `View` so it can read the
chosen source and fire its `onError` (the thumbnail-to-full-art fallback). Screens
that publish into the sub-nav mock `@/components/shell/tab-root-nav` (or render on a
phone layout, where the sections render in place).

### Route-tree tests

`src/components/shell/route-tree.test.tsx`, `route-tree-cold.test.tsx` and
`route-tree-connect.test.tsx` are the regression net for the
[shell's routing rules](overview.md#the-shell-tabs-and-navigation). They drive
expo-router's `renderRouter` over **the real `src/app` file list**:
`realRouteTree()` (`src/testing/route-tree.tsx`) walks `src/app`, stubs every
screen with its route key as text, and swaps each layout for a plain JS navigator
of the same shape (`Stack` for the root and the tab stacks, `Tabs` for the
`(app)` NativeTabs / headless web Tabs). The pieces that decide behaviour are kept
real: the root's `anchor`, the tab stacks' `TAB_STACK_SETTINGS` and their
`tabStackListeners`. Moving or renaming a route file therefore changes the tree
under test rather than a hand-copied list. Between them they cover: each tab root
at its unchanged URL; a book pushed from a tab staying in that tab (and back
returning there); folder drilling inside the Library stack; `JUMP_TO` keeping each
tab's stack; the account screen opening in the tab that pushed it; the player as
a root modal over the tabs; a cold book link owned by Home with Home underneath
and no link params left on `/` after back; and onboarding leaving exactly one
`(app)` under the stack, both through `leaveOnboarding()` (`dismissTo`, not
`replace`) and through `<LeaveOnboarding />` at render time.

Two harness notes, both forced by RNTL 14:

- **Read the router store, not `renderRouter`'s helpers.** RNTL 14 broke the
  helpers `renderRouter` returns, so the suites read where the router is through
  `routeInfo()` (expo-router's router store) and drive the global `router` inside
  `nav(fn)`, an awaited `act` so each navigation commits before the assertion.
  `renderRouter` itself returns the async render's promise; await it.
- **A cold start gets its own file.** The router store's previous segments leak
  between renders in one file, which would make a cold deep link look warm - so
  the cold-link case and the cold-on-`/connect` case each live in a file of their
  own.

The chrome itself (the web tab bar, the top bar, the docked and accessory
players) is covered by `src/components/shell/shell-chrome.test.tsx`, the web
command palette and the profile menu by their own suites.

### Mocking `fetch`

`src/api/client.test.ts` installs a fake global fetch driven by a per-test
implementation:

```ts
function installFetch(impl: (url: string, init: RequestInit) => FetchResult): jest.Mock {
  const mock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const { status, body } = impl(String(input), init ?? {});
    // …build a minimal Response with ok/status/text()…
  });
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}
```

Assertions then inspect `mock.mock.calls` for URLs, headers and bodies.

### Mocking reachability

Modules that gate on connectivity (`progress-sync`, the downloads/player
stores) import `@/api/reachability`; tests replace it wholesale. From
`src/playback/progress-sync.test.ts`:

```ts
// babel-jest hoists jest.mock above the imports, so the module under test sees
// the mock at import time (it calls onReconnect() and gates saves on isReachable()).
jest.mock('@/api/reachability', () => ({
  isReachable: jest.fn(() => true),
  noteError: jest.fn(),
  noteSuccess: jest.fn(),
  onReconnect: jest.fn(() => () => {}),
  getReachabilityApi: jest.fn(() => null),
}));
```

Flipping `isReachable` per test is how the offline-queue branches are covered.

### Flipping `Platform.OS`

jest-expo defaults `Platform.OS` to `ios`. Modules that branch on it **at call
time** (not at import time) can be covered for both platforms by mutating it -
the pattern from `src/lib/secure-store.test.ts`:

```ts
import { Platform } from 'react-native';

// secure-store.ts branches on Platform.OS at call time, so we flip it per suite.
function setPlatform(os: string) {
  (Platform as { OS: string }).OS = os;
}

describe('secure-store (web)', () => {
  beforeEach(() => setPlatform('web'));
  afterEach(() => setPlatform('ios')); // always restore
  // …
});
```

The same trick covers the web-vs-native branches in `book-queue` (auth headers
on tracks) and reachability (browser online/offline listeners).

## What's covered today

Co-located suites exist for:

| Area | Tested modules |
|---|---|
| API layer | `src/api/client.test.ts`, `connection-clients.test.ts`, `hooks.test.ts`, `reachability.test.ts` |
| Playback | `src/playback/book-queue.test.ts`, `progress-sync.test.ts`, `store.test.ts`, `service.web.test.ts`, `sleep-timer.test.ts`, `auto-sleep.test.ts`, `auto-sleep-controller.test.ts`, `rate.test.ts`, `next-book.test.ts`, `prettify-title.test.ts`, `types.test.ts` |
| Downloads | `src/downloads/store.test.ts`, `keep-ahead.test.ts`, `keep-ahead-controller.test.ts`, `failure.test.ts`, `downloads-view.test.ts`; `src/components/downloads/downloads-screen.test.tsx` |
| Stores | `src/stores/session.test.ts`, `settings.test.ts`, `series-orderings.test.ts`, `library-selection.test.ts`, `search.test.ts` |
| Home | `src/components/home/home-model.test.ts`, `listening.test.ts`, `now-card-model.test.ts`, `now-card.test.tsx`, `home-screen.test.tsx`, `progress-menu-sheet.test.tsx` |
| Search | `src/components/search/search-model.test.ts` (the spoiler rules), `use-search-sources.test.tsx`, `search-screen.test.tsx` |
| Series and people | `src/components/series/series-model.test.ts`, `spine-fit.test.ts`, `people-model.test.ts`, `series-page.test.tsx`, `browse-pieces.test.tsx` |
| Up next | `src/components/upnext/up-next-model.test.ts`, `up-next-store.test.ts`, `use-up-next.test.tsx`, `queue-list.test.tsx`, `up-next-panel.test.tsx`, `up-next-button.test.tsx` |
| Theme | `src/theme/scheme-pref.test.ts` (the default-theme rule), `theme-provider.test.tsx`, `use-theme-colors.test.tsx` |
| i18n | `src/i18n/language.test.ts`, `language-provider.test.tsx` |
| Shell | `src/components/shell/destinations.test.ts`, `shell-chrome.test.tsx`, `command-palette.test.tsx`, `palette-model.test.ts`, `palette-store.test.ts`, `profile-menu.test.tsx`, `shell-metrics.test.ts`, `tab-root-nav.test.tsx`, `use-shell-effects.test.ts`, `toast-offset.test.ts`, and the three route-tree suites (above); `src/components/layout/offline-banner.test.tsx` |
| Account flows | `src/components/account/use-api-keys-manager.test.tsx`, `use-sign-out.test.tsx` |
| Player UI | `src/components/player/sleep-timer-button.test.tsx`, `end-credits-logic.test.ts`, `book-progress.test.tsx`, `transport.test.ts` (the shared previous/next and chapter-segment math of the full player and the docked bar) |
| Library UI | `src/components/library/book-meta.test.ts`, `book-meta.render.test.tsx`, `book-tabs.test.ts`, `cover-frame.test.tsx`, `meta-gating.test.ts`, `entry-row.test.tsx`, `history-section.test.tsx`, `book-cover.test.tsx`, `cover-pieces.test.tsx`, `cover-layout.test.ts`, `cover-wash.test.tsx`, `library-modes.test.ts`, `library-screen.test.tsx`, `use-queue-actions.test.tsx`, and under `books/` (`books-view`, `book-actions`, `use-whole-library`), `collections/` (`collections-model`, `collection-dialogs`) and `modes/books-mode`; `src/components/player/use-play-book.test.tsx`; `src/components/layout/content-scope.test.tsx` |
| UI primitives | `src/components/ui/` - `animated-pressable`, `badge`, `button`, `confirm-dialog`, `cover`, `dialog`, `empty-state`, `icon-data` (validates every vendored SVG glyph), `input`, `overlay` (root insets, `withFlatStyle`), `overlay-host`, `popover`, `row-surface`, `section-header`, `select`, `sheet`, `skeleton`, `slider`, `switch`, `tabs`, `text`, `time-stepper`, `toast`, `toggle-group` |
| `src/lib` helpers | `account`, `alpha-sections`, `app-resume`, `auth-failure`, `base-url`, `chapter-label`, `client-id`, `clipboard`, `content-key`, `cover-tint`, `dedup`, `format`, `hhmm`, `keyboard`, `known-servers`, `layout`, `monogram`, `network`, `pairing`, `paths`, `register-sw.web`, `progress-view`, `rnw-button-fix`, `scroll-memory`, `secure-store`, `series-orderings`, `share`, `storage-migration`, `support`, `ticker`, `use-debounced-value`, `use-dom-id`, `utils` |
| Generators (Node, not jest) | `scripts/gen-tokens.test.mjs` |

The shared test helpers live outside that list, in `src/testing/`: the
player-store double (`player-store-mock.ts`), `mountWithPortal`
(`render-overlay.tsx`) and the route-tree harness (`route-tree.tsx`). For the
player-store double see
[the section above](#the-shared-player-store-double-srctestingplayer-store-mockts).

Not covered by unit tests, by design or necessity: `src/app/**` screens (kept
logic-free), and the **native module** (`modules/audiosilo-player`) - Swift and
Kotlin can only be validated by a device rebuild, which is why its invariants
are documented so heavily in [Playback](playback.md).

## The full gate and CI

Before calling any change done:

```sh
npx tsc --noEmit && npm run lint && npm run format && npm test
```

CI (`.github/workflows/ci.yml`) gates all four on every PR/push - typecheck,
ESLint, **prettier `--check`** (the `format` script; use
`npx prettier --write .` to fix locally), and the Jest suite. CI reads the Node
version from `.nvmrc` (`24.16.0`) via `node-version-file`, and installs with a
frozen `npm ci` - keep `package-lock.json` committed in sync after dependency
changes. See [Gates and CI](../contributing/gates-and-ci.md) for the
workspace-wide picture.

:::caution Green gates ≠ verified
The gates run on Node with full `Intl` and no device: they cannot see
Hermes-runtime crashes (see [the Intl caveat](i18n.md#the-hermes-intl-caveat)),
native-module behavior, CSS/layout regressions, or live-API integration. For
anything touching those seams, verify on the real surface (device build, web
export, running server) before claiming it works.
:::
