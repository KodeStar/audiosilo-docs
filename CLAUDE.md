# CLAUDE.md - AudioSilo Docs

The documentation site for the AudioSilo product (Docusaurus 3, TypeScript
config). Two independent docs instances: `docs-users/` (User Guide, `/users`,
audience = non-programmer self-hoster) and `docs-developers/` (Developer Docs,
`/developers`, audience = contributor). Landing page in `src/pages/index.tsx`;
theme (pink `#db2777`, dark-first, matching the product) in `src/css/custom.css`.

## The gate

```sh
npm run build     # MUST pass before a change is done
```

The build **fails on** broken internal links, broken anchors, and missing
embedded images (`onBrokenLinks/onBrokenAnchors: 'throw'`) - that's the
mechanical consistency check. `npm start` for the live dev loop.
Node 24 (workspace convention; `.nvmrc` in the sibling repos).

## Rules

- **Sidebars are hand-written** (`sidebars-users.ts` / `sidebars-developers.ts`)
  and double as the canonical page list. New page = file + sidebar entry, same
  change.
- **Frontmatter**: every page has `title:` + `description:`; body starts at
  `##` (no H1). Relative `.md` links between pages of the same instance;
  absolute paths (`/developers/...`, `/users/...`) only across instances.
- **Screenshots**: pages may embed only files listed in
  `screenshots/manifest.mjs` (as `/img/screenshots/<area>/<name>.png`).
  Add the manifest entry first; regenerate with `screenshots/run.sh` (see
  `screenshots/README.md`). Never hand-edit a captured PNG - fix the capture
  script/seed state and re-run. Placeholders backfill anything uncapturable so
  the build never breaks.
- **Accuracy over completeness**: verify behaviour in the sibling repos'
  source before documenting it; never document a route/flag/UI element you
  didn't find in code. Features that are designed-but-unshipped (web transcode
  auto-negotiation, WebSocket sync, `POST /uploads`, manager installers) are
  explicitly marked "planned" - when one ships, search the whole tree for it.
- **Audience separation**: no Go/TS symbols or source paths in the User Guide;
  the Developer Docs reference symbols/paths as inline code (not links).
- **Hyphens, not em dashes**: use `-` or restructure the sentence; do not use the
  em dash character (em dashes read as an AI tell and produce messy heading
  anchors). The sole exception is a code block that reproduces literal program
  output. Full note in `docs-developers/contributing/documentation.md`.
- The change→page mapping table lives in
  `docs-developers/contributing/documentation.md` - it is the single copy;
  don't duplicate it here.

## The docs are part of every change

The sibling repos' CLAUDE.md files and the workspace CODE-HEALTH.md Definition
of Done require that a behaviour/UI/config/wire change updates the affected
pages here **in the same logical change**. When you finish a code change in
`audiosilo-server`/`audiosilo-frontend`/`audiosilo-manager`, grep this repo for
the symbols, flags, routes, and UI labels you touched.

## Layout

```
docs-users/            User Guide pages (getting-started, admin, listening, manager, …)
docs-developers/       Developer pages (architecture, server{,/api}, frontend, manager, contributing)
sidebars-*.ts          canonical page lists (hand-ordered)
screenshots/           capture pipeline: manifest.mjs (source of truth), run.sh,
                       capture-web.mjs, capture-admin.mjs, placeholders.mjs, .cache/ (gitignored)
static/img/screenshots/  generated images (committed)
src/pages/index.tsx    landing page; src/css/custom.css theme
.github/workflows/     ci.yml (build gate), deploy.yml (GitHub Pages on main)
```
