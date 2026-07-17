---
title: Maintaining these docs
description: "How the documentation site works, when a code change requires a docs change, and how to regenerate screenshots."
---

Documentation is part of the Definition of Done for AudioSilo: a change that
alters behaviour, UI, configuration, or the wire contract isn't finished until
the affected pages here say the new truth. This page is the operating manual
for the docs themselves.

## Where things live

The docs are their own repo, `audiosilo-docs`, a sibling of the three code
repos inside the `~/dev/audiosilo` workspace:

```
audiosilo-docs/
  docs-users/          the User Guide        (served at /users)
  docs-developers/     the Developer Docs    (served at /developers)
  sidebars-users.ts    hand-written sidebar + canonical page list
  sidebars-developers.ts
  screenshots/         the capture pipeline (manifest.mjs, run.sh, capture-*.mjs)
  static/img/screenshots/   the generated images the pages embed
  src/                 landing page + theme (pink #db2777, dark-first)
```

It's a standard [Docusaurus](https://docusaurus.io) site with **two docs
instances** - one per audience. The User Guide assumes a self-hoster who is
not a programmer; the Developer Docs assume a contributor. Keep material in
the right instance and cross-link sparingly.

## Local workflow

```sh
cd audiosilo-docs
npm install        # first time
npm start          # live-reloading dev server
npm run build      # the docs gate - MUST pass before a change is done
```

`npm run build` is deliberately strict: broken internal links, broken anchors,
and missing embedded images all **fail the build**. That is the mechanical
check that pages and screenshots stay consistent - treat it exactly like the
code repos' gates.

## When a code change needs a docs change

Grep these docs for the symbol, flag, route, or UI label you changed -
`onBrokenLinks` can't catch a stale *claim*, only a stale link. The common
mappings:

| You changed… | Update |
|---|---|
| An API route, envelope, or field | [server/api/reference.md](../server/api/reference.md) (+ [conventions](../server/api/index.md)), [cross-repo contract](../architecture/cross-repo-contract.md) - after updating the workspace `CROSS-REPO.md` itself |
| Config keys, env vars, CLI flags | [server/configuration.md](../server/configuration.md) + the User Guide pages that mention them (`/users/getting-started/remote-access`, quickstarts) |
| Admin console UI | `/users/admin/*` pages + the `admin/` screenshots |
| Player screens or strings | `/users/listening/*` pages + the `web-player/` screenshots |
| Playback engines / native module | [frontend/playback.md](../frontend/playback.md) |
| Downloads / PWA | [frontend/offline.md](../frontend/offline.md) + `/users/listening/offline-downloads` |
| Scanner, detection, metadata | [server/scanner.md](../server/scanner.md) + `/users/getting-started/organizing-your-library` |
| Auth, invites, shares | [server/auth-and-security.md](../server/auth-and-security.md) + `/users/admin/users-and-invites`, `/users/admin/sharing` |
| Manager features | `/users/manager/*` + [manager developer pages](../manager/overview.md) + `manager/` screenshots |
| Meta schemas, `metaserve` API, or intake tooling | [meta developer pages](../meta/overview.md) (data model, API, contributing) - and the [cross-repo contract](../architecture/cross-repo-contract.md) when the server's `/meta` envelope is affected |
| Build / release / distribution | [release-pipeline.md](../architecture/release-pipeline.md) + [releasing.md](./releasing.md) |
| A capability flag | [server/api/index.md](../server/api/index.md) + the feature's user page |

:::tip
When you flip something from "planned" to "shipped" (transcode negotiation,
WebSocket sync, uploads, manager installers…), search the whole docs tree for
the feature name - several pages deliberately mark these as not-yet-shipped.
:::

## Screenshots

Every embedded image is listed in `screenshots/manifest.mjs` and lives under
`static/img/screenshots/`. The pipeline (`screenshots/run.sh`) rebuilds the
server, seeds a small public-domain LibriVox library, runs a demo-mode server,
and captures the web player, admin console, connect page, and setup wizard
with Playwright. Anything it can't reach (the desktop manager on a headless
machine) gets a labelled placeholder so the build never breaks.

Rules that keep this maintainable:

1. **Pages embed only manifest-listed images.** Add the manifest entry first.
2. **Never hand-edit a generated screenshot** - fix the capture script or the
   seeded state, then re-run; otherwise the next regeneration loses your edit.
3. **UI changed? Re-run `screenshots/run.sh`** and commit the refreshed images
   alongside the docs change.
4. Manager screenshots are captured semi-manually - see
   `screenshots/README.md` for the exact procedure and framing rules.

## Adding a page

1. Create the `.md` file under `docs-users/` or `docs-developers/` with
   `title:` and `description:` frontmatter (body starts at `##`).
2. Add its id to the matching `sidebars-*.ts` - sidebars are hand-written so
   reading order stays deliberate; the build fails if the ids drift.
3. Link related pages with relative `.md` links (validated at build time).
4. `npm run build`.

## Writing style

- **Hyphens, not em dashes.** Use a spaced hyphen (`-`) or restructure the
  sentence; do not use the em dash character. A spaced hyphen reads fine
  mid-sentence, and em dashes also produce messy heading anchors. The one
  exception: a code block that reproduces literal program output verbatim must
  match the source, em dashes included (no current output contains one).
- Cross-referenced headings should use a colon or rephrase rather than a dash,
  so the auto-generated anchor stays clean and stable.

## Deployment

Pushes to `main` build and publish the site via GitHub Actions
(`.github/workflows/deploy.yml`) to GitHub Pages. The site serves at its custom
domain `docs.audiosilo.app`: `docusaurus.config.ts` sets `url`/`baseUrl` and a
`static/CNAME` file is committed.
