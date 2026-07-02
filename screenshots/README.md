# Documentation screenshots

Every image the docs embed lives in `../static/img/screenshots/` and is listed
in [`manifest.mjs`](manifest.mjs) — that file is the single source of truth.
Doc pages may only reference images that appear in the manifest, and the
pipeline guarantees every manifest entry exists (a real capture, or a styled
placeholder so the site build never breaks).

## Regenerate everything

```sh
cd screenshots
npm install && npx playwright install chromium   # first time only
./run.sh
```

`run.sh` builds the sibling `audiosilo-server`, seeds a small public-domain
LibriVox library (cached in `.cache/library`; `MAX_FILES=3` chapter files per
book keeps it ~100 MB), starts a demo-mode server on `:8790` serving the
frontend's web export (plus a `--setup` instance on `:8791` for the wizard
shot), then runs the Playwright captures and backfills placeholders.

Every capture is optimized in place with **pngquant** (`brew install pngquant`)
— a lossy-palette pass that shrinks the retina PNGs ~60% with no perceptible
loss, so the committed image is the optimized one. It's optional: if pngquant
isn't on `PATH` the shots are just left raw (with a one-time warning).

Prereqs: Go 1.25+, Node 24, ffmpeg/ffprobe, pngquant (optional; for image
optimization), and a web export at `../../audiosilo-frontend/dist`
(`audiosilo-server/scripts/build-web.sh` builds one; `run.sh` triggers it
automatically when missing).

## Adding a screenshot

1. Add an entry to `manifest.mjs` (file path, title, hint, capture group).
2. Teach the matching `capture-*.mjs` script to take it (or leave it to the
   placeholder generator if it can't be automated yet).
3. Reference it from the doc page as `![alt](/img/screenshots/<file>)`.
4. Run `./run.sh` (or at minimum `node placeholders.mjs`) so the file exists —
   the Docusaurus build fails on missing images by design.

## Desktop manager captures

The Wails manager can't be captured headlessly in CI, and its screens need a
signed-in Audible account and configured servers to look real. Capture it
semi-manually instead:

1. `cd ../../audiosilo-manager && wails dev` (or run a built app).
2. Arrange each screen listed under `manager/` in `manifest.mjs`
   (a dev/dummy server is fine; avoid real credentials/emails in frame).
3. Screenshot the window (macOS: `⌘⇧4` + space, or
   `screencapture -l <windowid>`) at ~1440×900, dark mode.
4. Save over the placeholder in `../static/img/screenshots/manager/` using the
   exact manifest filename.

Anything not replaced stays a labelled placeholder — visible in the docs as
"regenerate me", never a broken image.

## The store/marketing pipeline is separate

`~/dev/audiosilo/store/tools` + `SCREENSHOTS.md` produce the app-store and
marketing-site assets (device frames, captions, icons). The two pipelines share
the same technique (demo-mode server + Playwright + the `Audio` constructor
hook for warming progress) but different outputs — a UI change usually means
running both.
