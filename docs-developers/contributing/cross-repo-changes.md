---
title: Landing a cross-repo change
description: "The wire-change checklist, a worked example (listening history), the capability-flag pattern, and the drift pitfalls to avoid."
---

The server defines the HTTP and JSON contract. The frontend mirrors it **by
hand**, and so does the Bridge's `internal/link` for the `/bridge/*` routes. There
is no codegen, so a wire change is never a one-repo change. Each repo's CI checks
only its own side: the player's and the docs' check against a pinned copy of the
server's (see
[The order for a wire change](#the-order-for-a-wire-change)). This page is the procedure for landing such a
change safely. The full map of every seam is the
[Cross-repo contract](../architecture/cross-repo-contract.md), and the normative
version is the workspace `CROSS-REPO.md`.

## First: does your change cross the seam?

Decide which repos a task belongs to before starting:

| The task is about | Change |
|---|---|
| *Won't play, wrong `Content-Type`, scope leak, scanner behavior* | the **server** |
| *Looks wrong, navigation, timeline math, offline* | the **frontend** |
| *Pairing, media auth, a new wire field, transcode, capabilities, path semantics* | **both**. Read the contract first. |
| A JSON shape the Bridge reads (the `/bridge/*` routes: heartbeat, job claims and results) | **the Bridge too**. Its `internal/link` hand-mirrors those shapes under the same rule. |

## The wire-change checklist

Do these together, in order, as one logical change. The rule is the same
everywhere: a field rename is a multi-repo edit.

1. **Update `CROSS-REPO.md` first.** Before you change code, update the workspace
   root's `CROSS-REPO.md` if the seam's behavior changes. It is the normative
   contract.
2. **Server: handler.** Add or modify the handler in
   `internal/api/handlers_*.go`. Keep the handler transport-only. Business logic
   goes in `auth`, `catalog`, `library` or `media`.
3. **Server: route wiring.** Register the route in `internal/api/api.go` with
   the right middleware (`requireAuth`, `requireAdmin` or `requireMediaAuth`).
4. **Server: test.** Add a Go test (`internal/api/*_test.go`, using the
   `newTestEnv` harness) that asserts the emitted shape. Security-critical paths
   need an allowed **and** a denied case. When the envelope has a wire golden,
   rewrite it (`go test ./internal/api -run TestWireGolden -update`) and review
   its diff; a new envelope the player reads gets a golden case.
5. **Frontend: types.** After the server change merges, run `npm run wire:sync`
   to copy its goldens, then mirror the shape in `src/api/types.ts`. Mirror
   **every field**, including ones the client doesn't read yet: the wire parity
   test fails on a field the server sends that `types.ts` does not know.
6. **Frontend: client.** Add or extend the method in `src/api/client.ts`. It
   unwraps the envelope: lists are wrapped like `{ books }` and `{ history }`, and
   errors are `{ error }`, thrown as `ApiError`.
7. **Frontend: hook.** Expose a React Query hook in `src/api/hooks.ts`, with its
   query key and invalidation.
8. **Frontend: screen.** Consume the hook in a screen or component under
   `src/app/**` or `src/components/**`. Keep the logic in the testable modules,
   not the screen.
9. **Frontend: test.** Add a `src/api/client.test.ts` case, and unit tests for
   any new pure logic.
10. **The Bridge, when applicable.** Mirror the shape in its `internal/link` and
    test it there too.
11. **Update the docs.** This site's API and seam pages follow the contract. Run
    `npm run names:sync` to re-pin the server names snapshot, and
    `npm run anchors:sync` when a repo's link to a User Guide heading changed.
    See [Documentation](documentation.md).
12. **Run every touched repo's full gate** ([Gates and CI](gates-and-ci.md)),
    then ship.

## The order for a wire change

The server is the source of the goldens, so it lands first, and each client
re-pins to its merge commit:

1. **The server change.** Change the handler, then rewrite the goldens it moves
   with `go test ./internal/api -run TestWireGolden -update` and read their
   diff: it is the wire change as the player will see it. The server's gate
   fails until the golden matches.
2. **Merge the server pull request.**
3. **The player.** Run `npm run wire:sync` (it reads `../audiosilo-server` at
   `origin/main`; `-- --server <dir> --ref <rev>` for another checkout or
   commit). It copies the goldens into `src/api/__wire__/` and pins the merge
   commit in `source.json`. Then change `types.ts` until the parity test
   passes: a new field as an optional one (older servers don't send it), a
   field the player deliberately skips in the test's `UNMIRRORED` list with the
   reason. CI's `npm run wire:check` fails while the copy and the pinned
   commit's goldens differ.
4. **The docs.** Run `npm run names:sync` at the same server commit, which
   re-pins `scripts/server-names.json`, and fix any page the stale-name check
   now reports.

The player and docs pull requests can open before the server one merges, but
their sync must be re-run at the merge commit before they merge. See
[The cross-repo checks](gates-and-ci.md#the-cross-repo-checks) for what each
check covers.

## Worked example: listening history

Listening history is the canonical shape of a cross-repo change. It was a
frontend milestone feature that *drove* a server change. This is what landed, file
by file.

**Server**

- Routes in `internal/api/api.go`:

  ```go
  mux.Handle("GET /api/v1/me/history", a.requireAuth(http.HandlerFunc(a.handleListAllHistory)))
  mux.Handle("GET /api/v1/libraries/{id}/history", a.requireAuth(http.HandlerFunc(a.handleListHistory)))
  mux.Handle("POST /api/v1/libraries/{id}/history", a.requireAuth(http.HandlerFunc(a.handleAddHistory)))
  ```

- Handlers `handleListHistory` / `handleAddHistory` in
  `internal/api/handlers_me.go` and `handleListAllHistory` in
  `internal/api/handlers_annotations.go`. They are thin transport over the data
  layer.
- Data layer in `internal/catalog/listening.go` (`AddHistory`, `ListHistory`) and
  `internal/catalog/annotations.go` (`ListAllHistory`). It is backed by the
  durable, **path-keyed** `listening_history` table (`(user_id, library_id, rel_path)`),
  with no FK to the rebuildable book index, as the
  [Invariants](../architecture/invariants.md) require. The cross-library listing
  is scope-filtered, so users only see history for paths they can access.
- Tests in `internal/api/handlers_me_test.go`.

**Frontend**

- `History` type in `src/api/types.ts`, which mirrors the `{ history }` envelope
  field for field.
- `history()` and `addHistory()` methods in `src/api/client.ts`, unwrapping
  `{ history: History[] | null }` and tolerating a `null` array.
- `useHistory` hook in `src/api/hooks.ts` (query key `qk.history(lib, path)`).
- UI in `src/components/library/history-section.tsx`, consumed from the book
  detail screen and the player view.
- `src/api/client.test.ts` covers the client's envelope and unwrap conventions.

Almost every cross-repo change has this shape. The server gets an **endpoint, a
data layer and a Go test**. The frontend then gets a **type, a client method, a
hook, a screen and a test**. Each side is gated by its own CI.

## The capability-flag pattern (new features)

Any shipped app build must be able to talk to any server version, so features
are negotiated, never assumed. `GET /api/v1/server` advertises the server version
and its capability flags, such as `admin_ui`, `web_player`, `transcode` and
`api_keys`. That is a partial list. The full table, with what each flag gates, is
in [API conventions](../server/api/index.md#capability-flags---gate-your-features),
and the source is the server's `handleServerInfo`.

Adding a feature that isn't universally available is a two-repo pattern:

- **Server:** add (or flip) the capability flag when the feature lands, and make
  it reflect reality. For example, `transcode` reflects whether ffmpeg is
  configured, and `web_player` reflects whether `web_dir` is populated.
- **Frontend:** mirror the flag in the `ServerInfo` type and **gate the new UI on
  it**. Never assume a capability is present. A client may be talking to an older
  server, or to one with the feature disabled, so the UI must still work without
  it.

## Pitfalls: the recurring failure modes {/* #pitfalls---the-recurring-failure-modes */}

These come from the workspace `CODE-HEALTH.md`, which distilled them from a full
health review. Each one was a *pattern* there, not a one-off.

- **Wire-contract drift.** The server emits a field the frontend's `types.ts`
  omits or mistypes (this happened with `direct_playable`, `codec`,
  `web_player`), or the frontend carries a phantom field the server never sends
  (a removed `layout` knob lingered for months). The root cause was hand-mirroring
  with no parity test, so both repos' gates passed independently. The wire
  goldens and the player's parity test now catch it for the envelopes they
  cover. Everywhere else (the Bridge's `internal/link`, the admin console, an
  envelope with no golden) the countermeasure is still to mirror every field
  and test the emitted shape on both sides, in the same logical change.
- **Dead code left behind.** A superseded hook or client method survives because
  TypeScript doesn't error on unused *exports* and Go only catches unused
  *unexported* symbols. When your change replaces something, **delete the old
  thing in the same change**. Search for it first.
- **Stale docs.** The stale-name check catches a capability, route, config key
  or variable the server dropped, but nothing checks a prose claim against the
  code it describes. Grep the symbol, flag or route you changed across `*.md` (the workspace docs, the
  repo CLAUDE.mds and this site), and fix what you contradicted in the same commit.

## Branch and PR conventions

- **Branch in the right repo.** All repos push to GitHub under `KodeStar/…`. The
  server works on `main`. The frontend often carries in-flight feature branches,
  so check `git branch` before assuming `main`.
- **One PR per repo, and mention the pair.** A cross-repo change ships as one PR
  in each affected repo. Cross-reference them in the PR descriptions, so a
  reviewer, or anyone reading the history later, can find the other PR.
- **Run each touched repo's gate.** The CIs are independent, and no
  workspace-level CI checks the seam for you: the wire goldens and the stale-name
  check compare against a pinned server commit, so they see a server change only
  once you re-sync.
- **Releases pin the pair.** The deployable server image bakes in a pinned web
  build, so a wire change reaches users as a known-compatible pair. That holds only
  if you release in the right order. See [Releasing](releasing.md) and the
  [Release pipeline](../architecture/release-pipeline.md).
