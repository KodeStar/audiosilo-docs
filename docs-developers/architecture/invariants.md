---
title: Invariants
description: "The golden rules every AudioSilo change must preserve — path is identity, filesystem is truth, stream the file, hand-mirrored wire format, secure by default — and why each one holds."
---

These are the cross-cutting rules that shape all three repos. Each exists because
violating it broke something real (or would, predictably). For every rule: what it
is, why it holds, what breaks if you violate it, and where it's enforced.

:::tip
When a proposed change fights one of these rules, the rule wins. If you genuinely
need to change a rule, that's a workspace-level design decision — update
`~/dev/audiosilo/CROSS-REPO.md` first, not just the code.
:::

## 1. Path is the identity

**The rule.** All content is addressed by `(library_id, rel_path)`. The path is
passed as a `?path=` query param (a query param, not a URL path segment, to dodge
encoded-slash issues). `books.id` is an internal, rebuildable index artifact — it
must **never** appear in the API contract or in durable user state. Durable user
state (progress, bookmarks, notes, listening history, folder overrides, book
enrichment) is keyed on `(user_id, library_id, rel_path)` with **no foreign key to
the `books` index**. A cheap content fingerprint (sha256 of size + first/last
64 KB, stored in `books.content_hash`) exists **only** to detect moves — it is not
an identity.

**Why.** Audiobook metadata is unreliable — tags are wrong, missing, or change
when a user re-tags files. The one thing a self-hosted library reliably has is its
directory structure. Making the path the identity means:

- the index can be dropped and rebuilt at any time without losing anyone's
  progress (no FK means nothing cascades from a rebuild);
- re-tagging a book keeps its listening state (the path didn't change);
- *moving* a book keeps its state too, via the fingerprint: when a path vanishes
  and a new path with a matching fingerprint appears, `Scanner.detectMoves`
  migrates durable state old→new (`catalog.MoveDurableState`).

**What breaks if violated.** Put `books.id` on the wire or in durable state and
every rescan, library rebuild, or re-detection silently orphans user progress,
bookmarks, and shares. Key durable state to the index with an FK and a temporarily
unmounted network share (see the unavailable-root guard, `ErrLibraryUnavailable`)
could cascade-delete a user's entire listening history.

**Where it's enforced.**

- Server: `catalog.GetBookByPath` (content routes resolve `(library, path)` →
  book, indexing on demand via `Scanner.IndexPath`); the migrations in
  `internal/store/migrations/` (durable tables have no FK to `books`);
  `Scanner.detectMoves` + `catalog.MoveDurableState` for moves.
- Frontend: every content call in `src/api/client.ts` passes `?path=`; client
  state persists keyed by `(library_id, path)`; helpers in `src/lib/paths.ts`.
- Manager: `internal/serverapi` addresses content the same way; its enrichment
  write (`book_enrichment`) is path-keyed and FK-free for the same reason.

## 2. The filesystem is the truth; the database is a rebuildable index

**The rule.** Content lives on disk. The SQLite database is an index/cache that
can be deleted and rebuilt from the filesystem at any time. Never put content —
or anything the user would miss — *only* in the DB. Durable user state is the
exception that proves the rule: it lives in the DB but is path-keyed and decoupled
from the index (rule 1), so it survives a rebuild.

**Why.** Portability and trust. A self-hosted user's library must outlive the
server install: they can move the folder to a new machine, point a fresh server at
it, and everything works. It also makes the scanner safe to be aggressive — it can
re-derive everything (books, chapters, codecs, covers) because nothing canonical
lives in its output. And it enables the no-wait first connection: the `/fs` view
(`internal/library/fsview.go`) browses the real filesystem directly, so a brand-new
server is usable before the first scan finishes.

**What breaks if violated.** Content stored only in the DB is lost on rebuild, and
the "point a fresh server at the folder" story dies. It also creates split-brain:
two sources of truth that drift.

**Where it's enforced.**

- `internal/library/scanner.go` — the scanner (re)builds the index; book/folder
  detection is automatic (`booksInDir`), with durable path-keyed
  `folder_overrides` for the exceptions.
- The unavailable-root guard: the scanner aborts with `ErrLibraryUnavailable` and
  does **not** prune when a library root is missing/unreadable or suspiciously
  empty — protecting the index (and everything users associate with it) when an
  SMB/NFS mount drops.
- The manager respects it from the other side: it writes **files**, then triggers
  `POST /admin/libraries/{id}/scan` (a non-destructive reindex) rather than
  writing catalog rows.

## 3. Stream the file, never the book

**The rule.** A track URL handed to any playback engine must be a **real audio
file path** — a chapter's `file_path` or a `BookFile.rel_path` — never a
folder/book path. Corollary: playback starts only after chapters/files have
loaded, because until then the client may only know the book's (folder) path.

**Why.** `GET /libraries/{id}/stream?path=` serves one file with Range support
(`internal/media/media.go`). A folder path isn't a streamable resource. The
failure mode is not a clean 4xx in the UI: on iOS, feeding AVPlayer a folder path
produced the opaque MediaToolbox error `-12864` on multi-file books, plus lost
chapter info. The sibling bug class is Content-Type: iOS AVPlayer rejects audio
served as `application/octet-stream` under `nosniff` with `-12847`, which is why
`media.ServeFile` **byte-sniffs** magic bytes (`ftyp` → `audio/mp4`, ID3/MPEG-sync
→ `audio/mpeg`, ADTS → `audio/aac`, FLAC/Ogg/WAV) instead of trusting extensions.

**What breaks if violated.** Multi-file books fail with `-12864`-class errors that
are miserable to diagnose (they only reproduce on device, and the error says
nothing about paths); chapter overlays disappear; single-file books may appear to
work, hiding the bug.

**Where it's enforced.**

- Frontend: `src/playback/book-queue.ts` builds tracks from `files`, else derives
  distinct files from the chapters' `file_path`, else the single-file book path —
  never a folder. The player gates playback start on `useChapters` settling.
- Server: `metadata.Chapter` carries `file_path` precisely so clients always have
  a streamable path per chapter; `media.ServeFile` does the byte-sniffing.

## 4. The wire format is hand-mirrored — a wire change is a multi-repo change

**The rule.** There is **no codegen**. The Go handlers
(`internal/api/handlers_*.go`) define the JSON; the frontend re-declares the same
shapes in `src/api/types.ts` and unwraps them in `src/api/client.ts`; the manager
hand-mirrors the subset it reads in `internal/serverapi`. Any change to the wire
format — a field rename, a new envelope, changed semantics — is made in **all
affected repos in one logical change**, with tests on each side.

**Why.** Codegen was deliberately rejected: the surface is small, and hand-written
types stay idiomatic on each side (Go structs vs. TypeScript unions vs. the
manager's narrow client). The cost is that nothing *mechanical* catches drift — a
renamed Go JSON tag compiles fine in both repos and fails only at runtime as an
`undefined` field. So the discipline is procedural: paired changes, paired tests,
and the seam catalog in the workspace `CROSS-REPO.md`.

**What breaks if violated.** Silent runtime breakage — the worst kind. TypeScript
trusts `types.ts`, `types.ts` no longer matches the wire, and the symptom shows up
far from the cause (an empty screen, a `NaN` duration, a book that "has no
chapters").

**Where it's enforced.**

- By convention and review: the checklist in
  [Cross-repo contract](cross-repo-contract.md#the-wire-change-checklist) and the
  workspace `CODE-HEALTH.md` Definition of Done.
- By tests: `internal/api/*_test.go` on the server, `src/api/client.test.ts` on
  the frontend, and the manager's `serverapi` tests — a shape change without a
  matching test update fails the corresponding CI.

## 5. Secure by default

**The rule.** The server must be safe for an inexperienced user to expose to the
internet. Concretely: **no default credentials**; **secrets are stored only
hashed**; **codes and setup tokens ride URL fragments**, never query strings or
logs; **all user-derived filesystem access goes through one safe join**; and the
served HTML runs under a **strict, scoped CSP**.

**Why.** It's design priority #1, above performance and convenience. The target
user will port-forward the server and forget about it; every default has to
assume that.

**What breaks if violated.** The threat model of the whole product. A default
password, a loggable invite code, or one un-sandboxed path join turns "self-hosted
audiobooks" into "remote file read on your NAS".

**Where it's enforced.**

- **No default creds**: first run either prints admin credentials + an auth code
  **once** (the banner is the only place plaintext secrets ever appear) or, with
  `--setup`, enables a one-time-token setup wizard at `/setup`
  (`internal/api/handlers_setup.go`) that self-closes the moment an admin exists.
- **Hashed secrets**: tokens and auth codes are stored only as SHA-256 hashes;
  passwords use argon2id (`internal/auth/hash.go`). `auth.ResolveToken` resolves
  opaque bearer tokens against the hashes.
- **Fragment-carried codes**: invite links are `<base>/connect#code=…` and the
  setup wizard is `/setup#token=…` — fragments never reach the server or its
  access logs. The setup POST verifies its token in constant time.
- **Path safety**: `library.SafeJoin` rejects traversal outside the library root;
  every filesystem access derived from user input goes through it. Share scoping
  (`Scope.Allows`, `Scope.VisibleInBrowse`, `pathFilterSQL`) authorizes every
  content path against the caller's grants (`authorizedPath` in the handlers).
- **Scoped CSP**: the admin/connect pages keep a strict same-origin CSP with no
  inline script/style at all; the web player at `/web` gets a per-document CSP
  whose `script-src` carries a sha256 hash of that document's inline scripts
  (`web.htmlCSP` in `internal/web/web.go`).
- **Confined token-in-URL**: the `?token=` media-auth fallback is accepted **only**
  on cover/stream GETs (`bearerToken(r, true)` via `requireMediaAuth` in
  `internal/api/middleware.go`); every other route is header-only, so session
  tokens can't leak into logs or Referer headers elsewhere.
- **Tested both ways**: security-critical code (`SafeJoin`, scope checks, rate
  limiters, `ResolveToken`, `htmlCSP`) requires both an *allowed* and a *denied*
  regression test — see [gates and CI](../contributing/gates-and-ci.md).

## Quick self-check before you ship

- Did anything new address content by a DB id? (Rule 1 — stop.)
- Would this survive deleting the database? (Rule 2.)
- Can any code path hand a folder path to a playback engine? (Rule 3.)
- Did the JSON change? Then did `types.ts`/`client.ts` (and `serverapi`, if it
  reads that shape) change too, with tests on each side? (Rule 4.)
- Did a secret touch a log, a query string, or plaintext storage? Does new
  user-derived path handling go through `SafeJoin`? (Rule 5.)
