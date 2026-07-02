# audiosilo-docs

The documentation site for [AudioSilo](https://audiosilo.app) - the
self-hosted audiobook server, player app, and desktop manager. Built with
[Docusaurus](https://docusaurus.io).

Two doc sets, one site:

- **User Guide** (`/users`) - install the server, organize a library, invite
  users, listen on web/iOS/Android, use the desktop manager. No programming
  assumed.
- **Developer Docs** (`/developers`) - architecture, the cross-repo contract,
  the HTTP API reference, playback internals, contributing and releasing.

## Develop

```sh
npm install
npm start          # live dev server
npm run build      # strict build: broken links/anchors/images fail
```

Node 24 (same as the sibling repos).

## Screenshots

All screenshots are generated, not hand-taken: `screenshots/run.sh` seeds a
public-domain library, runs a local demo-mode server, and captures the real UI
with Playwright. See [screenshots/README.md](screenshots/README.md).

## Deploy

Pushes to `main` publish to GitHub Pages via `.github/workflows/deploy.yml`.

## Keeping docs honest

This repo is part of the AudioSilo workspace (`~/dev/audiosilo`) alongside
`audiosilo-server`, `audiosilo-frontend`, and `audiosilo-manager`. Their
Definition of Done includes updating these docs - the change→page mapping
lives in [Maintaining these docs](docs-developers/contributing/documentation.md).
