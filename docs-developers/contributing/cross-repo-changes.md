---
title: Landing a cross-repo change
description: "The wire-change checklist, a worked example (listening history), the capability-flag pattern, and the drift pitfalls to avoid."
---

The server defines the HTTP/JSON contract; the frontend - and the manager's
`internal/serverapi` - mirror it **by hand**. There is no codegen, so a wire
change is never a one-repo change: both repos' CI can be green while the seam is
broken. This page is the procedure for landing such a change safely. The full map
of every seam is the [cross-repo contract](../architecture/cross-repo-contract.md)
(normatively: the workspace `CROSS-REPO.md`).

## First: does your change cross the seam?

Decide which repo(s) a task belongs to before starting:

- *Won't play, wrong `Content-Type`, scope leak, scanner behavior* → **server**.
- *Looks wrong, navigation, timeline math, offline* → **frontend**.
- *Pairing, media auth, a new wire field, transcode, capabilities, path
  semantics* → **both** - read the contract first.
- If the JSON shape you're changing is one the manager reads (pairing, `GET
  /server`, libraries, `fs`, books/search, item, progress, scan, enrichment) →
  **the manager too** (`internal/serverapi` hand-mirrors those shapes under the
  same rule).

## The wire-change checklist

Do these together, in order. Same rule everywhere: a field rename is a
multi-repo edit.

1. **Server - handler.** Add or modify the handler in
   `internal/api/handlers_*.go`. Keep the handler transport-only: business logic
   goes in `auth` / `catalog` / `library` / `media`.
2. **Server - route wiring.** Register the route in `internal/api/api.go` with
   the right middleware (`requireAuth` / `requireAdmin` / `requireMediaAuth`).
3. **Server - test.** Add a Go test (`internal/api/*_test.go`, using the
   `newTestEnv` harness) asserting the emitted shape. Security-critical paths
   need an allowed **and** a denied case.
4. **Frontend - types.** Mirror the shape in `src/api/types.ts`. Mirror **every
   field**, including ones the client doesn't read yet - that's the no-codegen
   convention's safety net.
5. **Frontend - client.** Add/extend the method in `src/api/client.ts`
   (unwrapping the envelope: lists are wrapped like `{ books }`, `{ history }`;
   errors are `{ error }` thrown as `ApiError`).
6. **Frontend - hook.** Expose a React Query hook in `src/api/hooks.ts` (query
   key + invalidation).
7. **Frontend - screen.** Consume the hook in a screen/component under
   `src/app/**` or `src/components/**` - keep the logic in the testable modules,
   not the screen.
8. **Frontend - test.** Add a `src/api/client.test.ts` case (and unit tests for
   any new pure logic).
9. **Manager (when applicable).** Mirror the shape in `internal/serverapi` and
   test it there too.
10. **Update `CROSS-REPO.md`** (workspace root) if the seam's behavior changed -
    it is the normative contract and is updated first.
11. **Update the docs** - this site's API and seam pages follow the contract; see
    [writing the docs](documentation.md).
12. **Run every touched repo's full gate** ([gates and CI](gates-and-ci.md)),
    then ship.

## Worked example: listening history

Listening history (a frontend milestone feature that *drove* a server change) is
the canonical shape of a cross-repo change. What actually landed, file by file:

**Server**

- Routes in `internal/api/api.go`:

  ```go
  mux.Handle("GET /api/v1/me/history", a.requireAuth(http.HandlerFunc(a.handleListAllHistory)))
  mux.Handle("GET /api/v1/libraries/{id}/history", a.requireAuth(http.HandlerFunc(a.handleListHistory)))
  mux.Handle("POST /api/v1/libraries/{id}/history", a.requireAuth(http.HandlerFunc(a.handleAddHistory)))
  ```

- Handlers `handleListAllHistory` / `handleListHistory` / `handleAddHistory` in
  `internal/api/handlers_me.go` - thin transport over the data layer.
- Data layer in `internal/catalog/listening.go` (`AddHistory`, `ListHistory`,
  `ListAllHistory`), backed by the durable, **path-keyed** `listening_history`
  table (`(user_id, library_id, rel_path)` - no FK to the rebuildable book
  index, per the [invariants](../architecture/invariants.md)). The cross-library
  listing is scope-filtered so users only see history for paths they can access.
- Tests in `internal/api/handlers_me_test.go`.

**Frontend**

- `History` type in `src/api/types.ts` - the `{ history }` envelope mirrored
  field-for-field.
- `history()` and `addHistory()` methods in `src/api/client.ts`, unwrapping
  `{ history: History[] | null }` and tolerating a `null` array.
- `useHistory` hook in `src/api/hooks.ts` (query key `qk.history(lib, path)`).
- UI in `src/components/library/history-section.tsx`, consumed from the book
  detail screen and the player view.
- The client's envelope/unwrap conventions are covered in
  `src/api/client.test.ts`.

That is the shape of essentially every cross-repo change: **server endpoint +
data layer + Go test**, then **type + client method + hook + screen + test**,
each side gated by its own CI.

## The capability-flag pattern (new features)

Any shipped app build must be able to talk to any server version, so features
are negotiated, never assumed. `GET /api/v1/server` advertises capability flags -
`admin_ui`, `web_player`, `upload`, `transcode`, `websocket` - plus the server
version.

Adding a feature that isn't universally available is a two-repo pattern:

- **Server:** add (or flip) the capability flag when the feature lands, and make
  it reflect reality - e.g. `transcode` reflects whether ffmpeg is configured,
  `web_player` reflects whether `web_dir` is populated.
- **Frontend:** mirror the flag in the `ServerInfo` type and **gate the new UI on
  it**. Never assume a capability is present; a client may be talking to an
  older server or one with the feature disabled - degrade gracefully.

## Pitfalls - the recurring failure modes

These come straight from the workspace `CODE-HEALTH.md` (distilled from a full
health review, where each was a *pattern*, not a one-off):

- **Wire-contract drift.** The server emits a field the frontend's `types.ts`
  omits or mistypes (this happened with `direct_playable`, `codec`,
  `web_player`), or the frontend carries a phantom field the server never sends
  (a removed `layout` knob lingered for months). Root cause: hand-mirroring with
  no parity test - both repos' gates pass independently. Countermeasure: mirror
  every field, test the emitted shape on both sides, in the same logical change.
- **Dead code left behind.** A superseded hook or client method survives because
  TypeScript doesn't error on unused *exports* and Go only catches unused
  *unexported* symbols. When your change replaces something, **delete the old
  thing in the same change** - search for it first.
- **Stale docs.** Nothing checks a prose claim against the code it describes.
  Grep the symbol/flag/route you changed across `*.md` (workspace docs, repo
  CLAUDE.mds, and this site) and fix what you contradicted, in the same commit.

## Branch and PR conventions

- **Branch in the right repo.** All repos push to GitHub under `KodeStar/…`. The
  server works on `main`; the frontend often carries in-flight feature branches -
  check `git branch` before assuming `main`.
- **One PR per repo, and mention the pair.** A cross-repo change ships as one PR
  in each affected repo; cross-reference them in the PR descriptions so a
  reviewer (and future archaeologist) can find the other half.
- **Run each touched repo's gate** - the CIs are independent; there is no
  workspace-level CI that checks the seam for you.
- **Releases pin the pair.** The deployable server image bakes in a pinned web
  build, so a wire change reaches users as a known-compatible pair - but only if
  you release in the right order. See [releasing](releasing.md) and the
  [release pipeline](../architecture/release-pipeline.md).
