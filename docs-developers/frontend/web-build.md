---
title: The web build
description: "How the web player starts: async routes split per page, deferred loading after the first paint, the startup cache and startup queries, start scripts compiled off the main thread, first-screen covers, language chunks and the offline precache; and the baseUrl /web coupling with the server."
---

The web build of the player is a static export that the server serves at
`/web`. This page covers how that export starts fast, and how the `/web` base
path runs through the build. Native ships one bundle and is not split.

## The web start (a split build)

The web player paints its first screen from the last visit's answers, then asks
the server again behind it, and loads only what that screen needs. The rules
live in the repo's `CONVENTIONS.md`, under "Web start (the split build)",
"Startup cache (web)", "Startup queries (web)" and "Web start scripts compiled
off the main thread".

### Async routes

`app.json` sets Expo Router's `asyncRoutes: { web: "production", default: false }`.
The web export splits each page into its own chunk, loaded when the page is first
opened, and each page's static HTML names only its own chunks. Native and the
dev server (`npm run web`) stay one bundle.

Expo Router still evaluates every `_layout` file of a group, the plain one as
well as the platform one. That is why `(app)/_layout.tsx` only re-exports
`NativeAppShell` (see [The `(app)` layouts](routes.md#the-app-layouts)).

### After the first paint

What the first screen never shows loads once it has painted.
`deferred(load)` (`src/lib/deferred.tsx`) renders nothing until its module (a
dynamic `import()`) is in. It starts the load with `afterPaint`
(`src/lib/after-paint.web.ts`): the next frame, then an idle moment, and at most
`AFTER_PAINT_MAX_MS` (300 ms), by a plain timer so a hidden tab still gets there.
While mounted, a failed load tries again `DEFERRED_RETRY_MS` (10 s) later.

The web shell's overlays and the root's services and listeners load this way. A
service that starts late must take in what happened before it:

- the [chapter refresh](offline.md#lifecycle) reads the answers already cached;
- the [drift watch](sleep-timer.md#fell-asleep-drift-controllerts) starts
  `late`, so a play that began first is still offered on.

A new module for the first screen keeps a static import. A module for an overlay
or a listener goes behind `deferred` in a web file, never a shared one, so
native never changes.

### The last visit's answers

The [startup cache](state-and-data.md#the-startup-cache-web) puts the first
screens' queries back into the query cache before anything renders, so a reload
paints at once and then refreshes.

### The first screen's answers, asked as the gate opens

Some starts can't be filled by the startup cache, such as a first visit or a
private window. On those, `AuthGate` asks for the page's answers the moment it
opens (`useStartupQueries` in `use-startup-queries.web.ts`). The list is
`startupQueries` (`src/components/shell/startup-queries.ts`):

- every server's `/server` and libraries;
- on Home or the Library grid, their progress too;
- plus Home's Recently added and favourites, or the selected library's first
  page of books.

`AuthGate` holds its spinner until the answers are in, for at most
`STARTUP_WAIT_MS` (200 ms). So the screen renders once, with the answers, rather
than first as a skeleton whose queries only then ask and again with the answers.
It asks once per page load and only for what the cache lacks, so a reload the
startup cache filled waits for nothing.

Each entry is built from the screen's own query spec (`serverInfoQuery`,
`recentQuery`, `favouritesQuery`, `wholeLibraryQuery`...), so the screen finds
it fresh. A new first-screen read joins through its spec, never through a
hand-built key. Native never waits (`use-startup-queries.ts` returns true).

### Start scripts compiled off the main thread

`scripts/web-start-chunks.cjs`, wrapped around Expo's serializer in
`metro.config.js`, changes the web export only. It never changes the dev server,
native, or an export with source maps.

- **The compile hint.** Every web script starts with V8's compile hint
  `//# allFunctionsCalledOnLoad`. So Chrome compiles it whole on a background
  thread as it streams in, rather than function by function on the main thread as
  it runs.
- **Parts.** A start script (`isAsync: false`) over `PART_CHARS` (about 450 KB)
  is cut at module boundaries into parts named `<name>-<n>-<hash>.js`. The `hash`
  is of the part itself, since the build's files are cached as immutable. The
  parts are chained by `requires`, so the HTML names them in order, and several
  parts compile on several threads at once. A cut is kept only when every part
  compiles on its own (`vm.Script`). An async chunk is never cut, because the
  runtime loads it by its name.

This matters where no service worker keeps compiled code
([one worker per deploy](offline.md#publicswjs)): a page on plain http (a LAN
address is not a secure context) or a private window. Measured on a real host
over the LAN, with the startup queries above, the first cover went from
294-311 ms cold and 259-280 ms warm to about 180-205 ms in both (medians; one
grid set under heavy load came to 225 ms). `npx expo export -p web` produces it
directly, so CI and the server's web build need no change.

### First-screen covers

A grid's first three rows, a shelf's first tiles and Home's Now card set
`FirstScreenCovers` (`src/components/library/first-screen-covers.ts`). Those
covers load at once, ahead of the page's other images. On the web, any cover
that loads within `FADE_AFTER_MS` (120 ms) of being drawn shows without the fade
(`cover-image.web.tsx`), so these usually do; a late one still fades.

The Library grid asks for its second page once the first has painted
(`useAllLibraryBooks`, through `afterPaint`), so the rest of the library never
holds the first page's covers back.

### Languages

Only English is bundled. Another language's catalog is its own chunk, loaded
before the app switches to it (see
[Internationalisation](i18n.md#setup-srci18nindexts)).

### Offline

A page's chunk loads when the page is first opened, so the service worker
precaches the whole build. A page never opened online still boots offline (see
[The PWA layer](offline.md#publicswjs)).

## The `baseUrl: "/web"` coupling

The server serves the web build of this app at `/web`; the build has no host of
its own. That subpath runs through the build:

- `app.json` sets `experiments.baseUrl: "/web"`, so the static export
  (`npx expo export -p web`) emits asset URLs that resolve under `/web/…`.
- At runtime, `src/lib/base-url.ts` exposes `BASE_URL`. In a production export it
  is `EXPO_BASE_URL`. It is **empty in development**, because the Metro dev
  server serves everything at the root and ignores `baseUrl`, so links like
  `/web/manifest.json` would 404 in dev. Anything that builds absolute paths goes
  through `BASE_URL`: the service-worker registration, the PWA manifest link in
  `+html.tsx`, and the synthetic offline media URLs.
- The server side of the seam is `internal/web/web.go`, which serves `web_dir`
  with a per-document CSP (see [Built-in web UI](../server/web-ui.md)). Releases
  bake a pinned web image into the server's Docker image, web image first (see
  the [release pipeline](../architecture/release-pipeline.md)).

The export copies `public/` verbatim, which is how `sw.js` and `manifest.json`
end up at `<base>/sw.js` and `<base>/manifest.json`. The service worker's scope
is therefore `<base>/`. Details are in [Offline & PWA](offline.md).
