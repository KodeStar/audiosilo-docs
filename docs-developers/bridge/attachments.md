---
title: The .audiosilo folder
description: "The Bridge's generated files in a book's hidden .audiosilo folder: where they go (and the single-file stem prefix), their formats, how the Bridge writes them, how the server finds, checks and stores them (signatures, the attachments refresh), the hidden-path rule, and how /meta serves them."
---

A `sidecars.generate` job leaves its results **with the book**, in a hidden
folder the server reads: the filesystem stays the source of truth, and the
server's copy is a rebuildable index of it like everything else. The Bridge
writes the files (`internal/generate/attach.go`); the server never writes into a
library and only reads them (`metadata/attachments.go`,
`library/attachments.go`, `catalog/attachments.go`).

## Where they go

| Book | Folder | Names |
|---|---|---|
| a folder book (a folder that holds its audio), a joined disc set included | `<book folder>/.audiosilo/` (for a disc set, the joined book's folder, the one holding the discs) | `characters.json`, `recaps.json`, `bridge.json` |
| a single-file book (a loose file at the library root, or a book in a `collection` folder) | `<the file's folder>/.audiosilo/` | `<stem>.characters.json`, `<stem>.recaps.json`, `<stem>.bridge.json`, the stem being the file name without its last extension (`Book.m4b` -> `Book.characters.json`) |

The prefix keeps the books of one folder apart, since a collection folder's books
share one `.audiosilo/`. Only these JSON names are ever written there or read
from there, and never any audio.

## The formats

- **`characters.json`** is audiosilo-meta's `model.Characters` and
  **`recaps.json`** its `model.Recaps` (with `in_short` and `ending`): exactly what
  the pipeline's `sidecars/` folder holds after its own validation. Their `work`
  field is the resolved community work's slug, or the pipeline's placeholder.
- **`bridge.json`** is the provenance:

```json
{
  "generator": "audiosilo-bridge",
  "version": "0.2.0",
  "kind": "sidecars.generate",
  "job_id": 12,
  "generated_at": "2026-10-16T09:12:44Z",
  "source": "audio",
  "work_id": "",
  "inputs": [
    { "path": "Author/Book/01.mp3", "size": 123456789, "mod_time": 1700000000 }
  ]
}
```

`inputs` are what the run read, library-relative: the book's audio files with the
sizes and modification times the server gave (Unix seconds), or the one `.epub`.
The server reads every field but `inputs`.

## How the Bridge writes them

1. **Through the checked mapping only**: the book is located with
   `mapping.SafeJoin` under the mount of a library whose last check found it
   mapped and writable at that mount; the write waits (parked
   `library_not_writable`) while it isn't.
2. **Into the book's own folder**, which took a write probe at the start of the
   job; a write that fails parks `book_not_writable` and is tried again every
   minute (or on **Retry**), the results waiting in the engine's work folder.
3. `.audiosilo/` is made `0755` when missing (chmod'ed after the umask, so the
   server's user can list it), and refused when it is a link or not a folder.
4. Each file is written to a temporary file inside `.audiosilo/` and renamed
   into place, `0644`, so the server never reads half a file. `characters.json`
   and `recaps.json` are written when the engine left them, `bridge.json` always.
   A file over 4 MiB fails the write (the server wouldn't read it).
5. Then `POST /bridge/rescan {library_id, path, mode: "attachments"}`.

The same content is never written twice in a run (a content hash), and a book
the server moved since the job began is written where it is now.
**Regenerate** writes over the files.

## How the server finds them

The discovery walk already skips hidden folders. When it meets a folder named
exactly `.audiosilo` (a real folder, never a link, not covered by the library's
ignore rules), it **lists it once, without going in**: it records the known
regular files (a known name, alone or after a stem) with their sizes and
modification times, by the folder holding it. A book's **signature** is its own
part of that listing, `name:size:mtime_ns` for each of its known names present,
in the order `characters.json`, `recaps.json`, `bridge.json`, joined by commas
(`""` for none), its stem taken off. It is stored on the book row
(`attachments_sig`) with the `indexed_at` it was read for
(`attachments_indexed_at`).

The Bridge writes these files without touching the audio, so the book's own
signature can't tell. The scan treats them the way it treats an Audiobookshelf
`metadata.json` (see [the scanner](../server/scanner.md#the-bridges-attachments)):

- **An unchanged book** whose attachment signature differs from the stored one,
  or whose files were never read for this index of the row (`attachments_indexed_at`
  `NULL` after the migration, or another index's), has them read and recorded
  **without** re-reading its audio (the attachments backfill, flushed in batches
  with the path and ABS backfills). It is recorded only while the row still holds
  what the scan read when it began, so a scan never lays an older reading over a
  newer one the Bridge's refresh recorded meanwhile.
- **A re-indexed book** reads them in `enrich`; an on-demand index, which has no
  walk, looks up only the book's own names (`attachmentsSigAt`).
- **A folder that can't be listed** right now (a permission, a flaky share), or a
  file that can't be read right now, keeps what is stored and leaves the row
  unchecked, so the next scan reads them again rather than taking a book's
  generated content away.

### The attachments refresh

`POST /bridge/rescan` with `mode: "attachments"` (`Scanner.RefreshAttachments`)
re-reads only the `.audiosilo/` files of the **indexed** book at the path (or the
book holding the path: a part, a disc folder) and records them, never its audio:
the Bridge's call after writing, which a full re-index (ffprobe, tags, cover and
fingerprint of every part) must not cost. It answers what is now indexed:

```json
{ "path": "Author/Book", "attachments": { "characters": true, "recaps": true, "bridge": true } }
```

`404 not_indexable` when no indexed book is there. The route is in
[the reference](../server/api/reference.md#post-apiv1bridgerescan).

## How the server checks them

Each file is read the way the ABS `metadata.json` is (`readRegularFile`): a
**regular file only, never through a link** (an `Lstat`, then `os.SameFile` on the
opened file, so a link swapped in between is refused too), **at most 4 MiB**,
decoded leniently (a leading byte order mark skipped, unknown fields allowed, so a
newer pipeline may add some) into the meta model types, then checked:

| File | Checks |
|---|---|
| `characters.json` | every character has an `id` and a `name` and a `reveal.chapter` of 0 or more; at most 2000 characters, 100 aliases each |
| `recaps.json` | every recap has `text` and a `through.chapter` of 0 or more; at most 2000 recaps |
| both | every string at most 20,000 bytes; `work` and `license` at most 200 bytes; at most 100 `sources` |
| `bridge.json` | only a file that isn't a JSON object of the format fails; each value is trimmed and dropped (not the file) when it is over 200 bytes or holds a control character; `generated_at` is kept only as RFC 3339 (rewritten in UTC); a negative `job_id` is `0` |

One entry failing fails the whole file: the pipeline validates its own output,
so a failure means the file isn't the pipeline's. A file that fails is logged and
left out (never served), and its signature is recorded, so it isn't read again
until it changes. A characters file with no characters, or a recaps file with no
recaps and a blank summary, counts as none.

## Storage

Migration `0048`:

- `books.attachments_sig` (`TEXT NOT NULL DEFAULT ''`) and
  `books.attachments_indexed_at` (`TEXT`, `NULL` until read): the signature and
  the index it was read for.
- `book_attachments` (`book_id` primary key, `REFERENCES books(id) ON DELETE
  CASCADE`; `characters`, `recaps`, `provenance` as checked JSON, `''` for a file
  that isn't there or can't be used; `updated_at`): one row per book with any.

Both are derived from the files, so they are **rebuildable**: not durable state,
never carried by a move (a moved book's folder takes its `.audiosilo/` along, and
the scan reads it at the new path). See
[the data model](../server/data-model.md#the-rebuildable-index).

**`Book.generated`** (`generated: true` on the wire, omitted otherwise) says a
book's signature names a characters or recaps file. It is read from the narrow
column, so a list never joins `book_attachments`, and every book object carries
it (lists, search, `item`, recent, the next book's `book`): the player uses it to
ask `/meta` for a book with no ASIN or ISBN.

## The hidden-path rule

No route reaches content through a hidden segment by name. One function states
the rule, `library.ContentPath` (any segment beginning with a dot), and
`ContentJoin` is `SafeJoin` with it first:

- the scan never walks into a hidden folder, and `/fs` never lists one
  (`listDir`);
- nothing indexes a path through one (`IndexPathWithin`), so a request for
  `Book/.audiosilo/x.json` can't make a phantom book;
- every path-taking content route (`scopedPathIn`: stream, cover, item,
  chapters, meta and the rest) answers a hidden path `404`, after the scope check,
  so the answer says no more than a missing file's would; `library.ErrHidden` is
  both `fs.ErrNotExist` and `ErrNotIndexable`;
- `findCover` never takes a hidden file (an AppleDouble `._Cover.jpg`) as a cover.

So `.audiosilo/` is never a book, a disc folder, a browse entry or a streamable
file.

## How the players get them

`/meta` lays the generated content into its answer per request, after the shared
cache, never into it: community content wins per dimension, generated content
fills what the community work lacks (or is the whole work of a book with no
match), and it never carries the community's CC BY-SA `attribution`.
`work.generated` names what came from the files. The shapes, the spoiler gates
and what older players do with them are in
[the reference](../server/api/reference.md#generated-content).
