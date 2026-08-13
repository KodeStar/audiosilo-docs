---
title: Testing the player
description: "The jest-expo harness, the global mocks in jest.setup.ts, the conventions that keep logic testable, and the patterns for mocking fetch, reachability, and Platform.OS."
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
    (expo, react-native-\*, nativewind, `@tanstack/*`, zustand, …) so they are
    transpiled instead of failing on `import`;
  - `testMatch` picks up `**/*.test.ts` and `**/*.test.tsx`;
  - `collectCoverageFrom` covers `src/**/*.{ts,tsx}` but **excludes
    `src/app/**`** - screens are intentionally out of coverage scope (see
    conventions below).
- **@testing-library/react-native 14** for component and hook tests. Its
  matchers are **built in** - there is no `@testing-library/jest-native`
  dependency; don't add one.

Run with `npm test`; coverage with `npm test -- --coverage`.

## Global setup (`jest.setup.ts`)

Loaded via `setupFilesAfterEnv`, it does four things:

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
| API layer | `src/api/client.test.ts`, `connection-clients.test.ts`, `reachability.test.ts` |
| Playback | `src/playback/book-queue.test.ts`, `progress-sync.test.ts`, `store.test.ts`, `service.web.test.ts`, `sleep-timer.test.ts`, `auto-sleep.test.ts`, `auto-sleep-controller.test.ts`, `rate.test.ts`, `next-book.test.ts`, `prettify-title.test.ts`, `types.test.ts` |
| Downloads | `src/downloads/store.test.ts` |
| Stores | `src/stores/session.test.ts`, `settings.test.ts` |
| i18n | `src/i18n/language.test.ts`, `language-provider.test.tsx` |
| Account flows | `src/components/account/use-api-keys-manager.test.tsx`, `use-sign-out.test.tsx` |
| Player UI | `src/components/player/sleep-timer-button.test.tsx`, `end-credits-logic.test.ts` |
| Library UI | `src/components/library/book-meta.test.ts`, `book-meta.render.test.tsx`, `entry-row.test.tsx`, `progress-card.test.tsx`, `skeletons.test.tsx`; `src/components/layout/content-scope.test.tsx` |
| UI primitives | `src/components/ui/` - `animated-pressable`, `empty-state`, `icon-data` (validates every vendored SVG glyph), `overlay-host`, `section-header`, `segmented-control`, `select-row`, `sheet`, `skeleton`, `time-stepper` |
| `src/lib` helpers | `account`, `alpha-sections`, `app-resume`, `auth-failure`, `base-url`, `clipboard`, `content-key`, `dedup`, `format`, `hhmm`, `known-servers`, `nav`, `network`, `pairing`, `paths`, `progress-view`, `rnw-button-fix`, `scroll-memory`, `secure-store`, `share`, `support`, `ticker` |

The shared test double for the player store lives outside that list, in
`src/testing/player-store-mock.ts` - see
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
