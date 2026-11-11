---
title: Invariants
description: "The rules every AudioSilo change must preserve (path is identity, the filesystem is the truth, stream the file, a hand-mirrored wire format, secure by default) and why each one holds."
---

These are the cross-cutting rules that shape the server and player. Each exists
because violating it broke something real, or predictably would. Each rule gives
what it is, why it holds, what breaks if you violate it, and where it's enforced.

:::tip
When a proposed change conflicts with one of these rules, the rule wins. Changing
a rule is a workspace-level design decision, so update
`~/dev/audiosilo/CROSS-REPO.md` first, not just the code.
:::

## 1. Path is the identity

**The rule.** All content is addressed by `(library_id, rel_path)`. The path is
passed as a `?path=` query param. It is a query param, not a URL path segment, to
avoid encoded-slash issues. `books.id` is an internal, rebuildable index artifact.
It must **never** appear in the API contract or in durable user state.

Durable user state is keyed on `(user_id, library_id, rel_path)`, or on
`(library_id, path)` for per-library config, with **no foreign key to the `books`
index**. That state is progress, bookmarks, notes, listening history, folder
overrides, book enrichment, admin metadata edits and custom covers.

A cheap content fingerprint exists **only** to detect moves. It is the sha256 of the
size and the first and last 64 KB, stored in `books.content_hash`. It is not an
identity.

**Why.** Audiobook metadata is unreliable. Tags are wrong or missing, or they change
when a user re-tags files. The one thing a self-hosted library reliably has is its
directory structure. Making the path the identity means:

- the index can be dropped and rebuilt at any time without losing anyone's
  progress (no FK means nothing cascades from a rebuild);
- re-tagging a book keeps its listening state (the path didn't change);
- *moving* a book keeps its state too, via the fingerprint: when a path vanishes
  and a new path with a matching fingerprint appears, `Scanner.detectMoves`
  moves durable state from the old path to the new one (`catalog.MoveDurableState`).

**What breaks if violated.** Put `books.id` on the wire or in durable state and
every rescan, library rebuild, or re-detection silently orphans user progress,
bookmarks, and shares. Key durable state to the index with an FK and a temporarily
unmounted network share (see the unavailable-root guard, `ErrLibraryUnavailable`)
could cascade-delete a user's entire listening history.

**Where it's enforced.**

- Server:
  - `catalog.GetBookByPath`. Content routes resolve `(library, path)` to a book,
    indexing it on demand through `Scanner.IndexPath`.
  - The migrations in `internal/store/migrations/`. Durable tables have no FK to
    `books`.
  - `Scanner.detectMoves` and `catalog.MoveDurableState` for moves.
- Frontend: every content call in `src/api/client.ts` passes `?path=`. Client
  state persists keyed by `(library_id, path)`. The helpers are in
  `src/lib/paths.ts`.

## 2. The filesystem is the truth; the database is a rebuildable index

**The rule.** Content lives on disk. The SQLite database is an index and cache
that can be deleted and rebuilt from the filesystem at any time. Never put content,
or anything the user would miss, *only* in the DB. Durable user state is the one
exception. It lives in the DB, but it is path-keyed and has no link to the index
(rule 1), so it survives a rebuild.

**Why.** Portability and trust. A self-hosted user's library must outlive the
server install. The user can move the folder to a new machine, point a fresh server
at it, and everything works. It also makes the scanner safe to be aggressive. It
can re-derive everything (books, chapters, codecs, covers), because nothing
canonical lives in its output. And it enables the no-wait first connection. The
`/fs` view (`internal/library/fsview.go`) browses the real filesystem directly, so a
brand-new server is usable before the first scan finishes.

**What breaks if violated.** Content stored only in the DB is lost on rebuild, and
pointing a fresh server at the folder no longer restores everything. It also
creates two sources of truth that drift apart.

**Where it's enforced.**

- `internal/library/scanner.go`. The scanner builds and rebuilds the index. It
  detects books and folders automatically (`booksInDir`), with durable,
  path-keyed `folder_overrides` for the exceptions.
- The unavailable-root guard. The scanner aborts with `ErrLibraryUnavailable` and
  does **not** prune when a library root is missing, unreadable or suspiciously
  empty. This protects the index, and everything users associate with it, when an
  SMB or NFS mount drops.

## 3. Stream the file, never the book

**The rule.** A track URL handed to any playback engine must be a **real audio
file path**: a chapter's `file_path` or a `BookFile.rel_path`. It is never a folder
or book path. So playback starts only after the chapters and files have loaded,
because until then the client may only know the book's folder path.

**Why.** `GET /libraries/{id}/stream?path=` serves one file with Range support
(`internal/media/media.go`). A folder path isn't a streamable resource. The
failure is not a clean 4xx in the UI. On iOS, a folder path given to AVPlayer
produced the opaque MediaToolbox error `-12864` on multi-file books, and the
chapter info was lost.

The sibling bug class is Content-Type. iOS AVPlayer rejects audio served as
`application/octet-stream` under `nosniff` with `-12847`. That is why
`media.ServeFile` **byte-sniffs** magic bytes instead of trusting extensions:
`ftyp` gives `audio/mp4`, ID3 or MPEG sync gives `audio/mpeg`, ADTS gives
`audio/aac`, and FLAC, Ogg and WAV get their own types.

**What breaks if violated.** Multi-file books fail with `-12864`-class errors.
They reproduce only on a device, and the error does not mention the path. Chapter
overlays disappear. Single-file books may appear to work, which hides the bug.

**Where it's enforced.**

- Frontend: `src/playback/book-queue.ts` builds tracks from `files`. Without them it
  derives distinct files from the chapters' `file_path`, and without those it uses
  the single-file book path. It never uses a folder. The player gates the start of
  playback on `useChapters` settling.
- Server: `metadata.Chapter` carries `file_path` precisely so clients always have
  a streamable path per chapter; `media.ServeFile` does the byte-sniffing.

## 4. The wire format is hand-mirrored, so a wire change is a multi-repo change {/* #4-the-wire-format-is-hand-mirrored---a-wire-change-is-a-multi-repo-change */}

**The rule.** There is **no codegen**. The Go handlers
(`internal/api/handlers_*.go`) define the JSON. The frontend re-declares the same
shapes in `src/api/types.ts` and unwraps them in `src/api/client.ts`. Any change to
the wire format (a field rename, a new envelope, changed semantics) is made in
**all affected repos in one logical change**, with tests on each side.

**Why.** Codegen was deliberately rejected. The surface is small, and hand-written
types stay idiomatic on each side (Go structs on one, TypeScript unions on the
other). The cost is that nothing *mechanical* catches drift. A renamed Go JSON tag
compiles fine in both repos and fails only at runtime, as an `undefined` field. So
the discipline is procedural: paired changes, paired tests, and the seam catalog in
the workspace `CROSS-REPO.md`.

**What breaks if violated.** The app breaks at runtime, and no build or test
reports it. TypeScript trusts `types.ts`, `types.ts` no longer matches the wire,
and the symptom shows up far from the cause: an empty screen, a `NaN` duration, a
book that "has no chapters".

**Where it's enforced.**

- By convention and review: the
  [wire-change checklist](../contributing/cross-repo-changes.md#the-wire-change-checklist)
  and the workspace `CODE-HEALTH.md` Definition of Done.
- By tests: `internal/api/*_test.go` on the server and `src/api/client.test.ts` on
  the frontend. A shape change without a matching test update fails the
  corresponding CI.

## 5. Secure by default

**The rule.** The server must be safe for an inexperienced user to expose to the
internet. Concretely: **no default credentials**; **secrets are stored only
hashed**; **codes and setup tokens ride URL fragments**, never query strings or
logs; **all user-derived filesystem access goes through one safe join**; and the
served HTML runs under a **strict, scoped CSP**.

**Why.** It's design priority #1, above performance and convenience. The target
user will port-forward the server and forget about it, and every default has to
assume that.

**What breaks if violated.** The threat model of the whole product. A default
password, a loggable invite code or one un-sandboxed path join lets a remote
attacker read files on the user's NAS.

**Where it's enforced.**

- **No default creds**: first run prints admin credentials and an auth code
  **once**. The banner is the only place plaintext secrets ever appear. With
  `--setup`, first run instead enables a one-time-token setup page at `/setup`
  (`internal/api/handlers_setup.go`), which closes itself the moment an admin
  exists.
- **Hashed secrets**: tokens and auth codes are stored only as SHA-256 hashes;
  passwords use argon2id (`internal/auth/hash.go`). `auth.ResolveRequest` resolves
  opaque bearer tokens against the hashes.
- **Fragment-carried codes**: invite links are `<base>/connect#code=…`, and the
  setup page is `/setup#token=…`. Fragments never reach the server or its access
  logs. The setup POST verifies its token in constant time.
- **Path safety**: `library.SafeJoin` rejects traversal outside the library root;
  every filesystem access derived from user input goes through it. Share scoping
  (`Scope.Allows`, `Scope.VisibleInBrowse`, `pathFilterSQL`) authorizes every
  content path against the caller's grants (`authorizedPath` in the handlers). A
  household member's grants derive from their owner's by the
  [member rule](../server/auth-and-security.md#household-members).
- **Scoped CSP**: the admin console and the connect page keep a strict
  same-origin CSP with no inline script or style at all. The web player at `/web`
  gets a per-document CSP whose `script-src` carries a sha256 hash of that
  document's inline scripts (`web.htmlCSP` in `internal/web/web.go`).
- **Confined token-in-URL**: the server accepts the `?token=` media-auth fallback
  **only** on these routes. Every other route is header-only, so session tokens
  can't leak into logs or Referer headers elsewhere.
  - The cover, stream and community cover GETs: a book's `/meta/cover` and an
    upcoming release's `/me/upcoming/cover` (`bearerToken(r, true)` through
    `requireBookMediaAuth` or `requireMediaAuth` in `internal/api/middleware.go`).
  - The calendar feed, `GET /me/upcoming/releases.ics`, which takes a `feed` token
    and no other kind (`requireFeedAuth`).
- **Tested both ways**: security-critical code (`SafeJoin`, scope checks, rate
  limiters, `ResolveRequest` and `lookupToken`, `htmlCSP`) requires both an
  *allowed* and a *denied* regression test. See
  [Gates and CI](../contributing/gates-and-ci.md).

## Quick self-check before you ship

- Did anything new address content by a DB id? (Rule 1. If so, stop.)
- Would this survive deleting the database? (Rule 2.)
- Can any code path hand a folder path to a playback engine? (Rule 3.)
- Did the JSON change? Then did `types.ts` and `client.ts` change too, with tests
  on each side? (Rule 4.)
- Did a secret touch a log, a query string, or plaintext storage? Does new
  user-derived path handling go through `SafeJoin`? (Rule 5.)
