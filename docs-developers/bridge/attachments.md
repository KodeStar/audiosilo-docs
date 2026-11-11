---
title: The .audiosilo folder
description: "The Bridge's generated files in a book's hidden .audiosilo folder: where they go (and the single-file stem prefix), their formats (characters, recaps, the own-words description, the chapters found in the narration, the read-along map and the provenance), how the Bridge writes them, how the server finds, checks and stores them (signatures, the attachments refresh), the hidden-path rule, and how /meta serves them."
---

A `sidecars.generate` job leaves its results **with the book**, in a hidden folder
the server reads. So do a `sidecars.describe` job, a `chapters.detect` job and a
`readalong.align` job. The filesystem stays the source of truth, and the server's
copy is a rebuildable index of it like everything else.

| Side | Role | Code |
|---|---|---|
| The Bridge | writes the files | `internal/generate/attach.go`, `describejob.go`, `chapters.go`, `readalongjob.go` |
| The server | only reads them, and never writes into a library | `metadata/attachments.go`, `library/attachments.go`, `catalog/attachments.go`; `metadata/chapterlist.go` for the chapters; `metadata/readalong.go` and `library/readalong.go` for the read-along map |

## Where they go

| Book | Folder | Names |
|---|---|---|
| a folder book (a folder that holds its audio), a joined disc set included | `<book folder>/.audiosilo/` (for a disc set, the joined book's folder, the one holding the discs) | `characters.json`, `recaps.json`, `description.json`, `chapters.json`, `bridge.json`, `readalong.json` |
| a single-file book (a loose file at the library root, or a book in a `collection` folder) | `<the file's folder>/.audiosilo/` | `<stem>.characters.json`, `<stem>.recaps.json`, `<stem>.description.json`, `<stem>.chapters.json`, `<stem>.bridge.json`, `<stem>.readalong.json`. The stem is the file name without its last extension: `Book.m4b` gives `Book.characters.json` |

The prefix keeps the books of one folder apart, since a collection folder's books
share one `.audiosilo/`. These are the book attachment names; podcast-specific
files are described below. Audio is never stored in `.audiosilo/`.

### Podcast CHAP attachments

`podcast.fetch` writes `<show>/.audiosilo/<stem>.chapters.json`, stripping only
the episode file name's last extension. It uses the version-1
[chapter-list shape](#chaptersjson) with:

- `from:"id3_chap"`, `generator:"audiosilo-bridge"` and
  `generated_at:Fetch.fetched_at`;
- exactly one `files` entry: the audio's base name, the Fetch's bytes and the
  probed `duration_ms`;
- chapters as `{title,start_ms,length_ms}` on the episode's timeline.

No ASR, agent, `bridge.json` or `Book.generated` flag is involved.

The Bridge reads the episode's ID3 CHAP frames. An invalid list, or zero or one
chapter, produces no sidecar, and valid audio still installs. The
[Spike 6 decisions](podcasts.md#spike-results-extensions-and-mp3-chapters) give the
ordering, title, timing and size rules. How the server checks and consumes the
file is in [the scanner](../server/scanner.md#podcast-libraries).

`<stem>.publish.json` is a transient install and delete journal, at most 4 MiB.
While it exists, the server neither indexes nor serves the episode.

- Podcast publication commits the audio, the chapters and the Fetch before
  removing the journal. Then it asks for a targeted `POST /bridge/rescan`, without
  `mode:"attachments"` or `from`.
- A generation without CHAP removes its old sidecar.
- Retention moves the owned audio and CHAP files to trash on the same filesystem,
  and keeps the Fetch as a tombstone.

See [publication](podcasts.md#publication-generations-and-serving).

## The formats

- **`characters.json`** is audiosilo-meta's `model.Characters`, and
  **`recaps.json`** its `model.Recaps` (with `in_short` and `ending`). They are
  exactly what the pipeline's `sidecars/` folder holds after its own validation.
  Their `work` field is the resolved community work's slug, or the pipeline's
  placeholder.
- **`description.json`** is audiosilo-meta's `model.Description`: the book's
  spoiler-free description in the agent's own words. It carries the run's `work`
  and `sources` (taken from its `characters.json`) and the share-alike licence. The
  Bridge checks it against meta's `description.schema.json` before keeping it. How
  it is written is in [the description step](generating.md#the-description-step).

```json
{
  "work": "the-call-of-the-wild",
  "text": "Buck, a large and comfortable dog on a Santa Clara Valley estate, ...",
  "license": "CC-BY-SA-4.0",
  "sources": [{ "type": "community" }]
}
```

- **`chapters.json`** is the chapters the Bridge found in the
  narration of a book with no chapter markers ([below](#chaptersjson)).
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

`inputs` are what the run read, library-relative. They are the book's audio files,
with the sizes and modification times the server gave (Unix seconds), or the one
`.epub`. The server reads every field but `inputs`.

Beside a `description.json`, `bridge.json` carries an optional **`description`**
object saying how that file was made:

```json
"description": {
  "job_id": 14,
  "generated_at": "2026-10-16T09:31:02Z",
  "from": "opening_notes",
  "chapters": 3,
  "checked_against": "transcripts"
}
```

- `job_id` is the job that wrote it.
- `from` is always `opening_notes`, the only source a description is written from.
- `chapters` is how many opening chapters' notes the agent saw.
- `checked_against` is what the no-verbatim check measured against: `transcripts`,
  `book text` (an ebook's) or `none` (the source text was gone).

Of this object the server reads only `generated_at`
(`AttachmentProvenance.DescriptionAt`, the console's "written" time). An object of
another shape costs that time, never the file.

A `sidecars.describe` job adds or replaces just this object in the book's existing
`bridge.json`. It keeps every other field, including the characters' run and its
`generated_at`. When there is no `bridge.json`, or it is not a regular file holding
a JSON object, the job writes a fresh one of its own `kind`.

### `chapters.json`

These are the chapters a Bridge found in the narration of a book with no chapter
markers ([Chapterless books](chapters.md) says how). They are on the **whole-book
timeline**, in the shape of a community recording's chapter list:

```json
{
  "version": 1,
  "generator": "audiosilo-bridge",
  "generated_at": "2026-10-17T10:02:11Z",
  "from": "narration",
  "files": [{ "path": "A Long Lecture.mp3", "size": 9001234, "duration_ms": 9000032 }],
  "chapters": [
    { "title": "Introduction", "start_ms": 0, "length_ms": 412500 },
    { "title": "Part One", "start_ms": 412500, "length_ms": 2105330 }
  ]
}
```

- `version` is `1`, the one version the server reads.
- `generator`, `generated_at` (RFC 3339) and `from` say what made the file. `from`
  is `narration` for book detection and `id3_chap` for podcasts. The shared parser
  cleans them like a provenance value, and never refuses the file over them.
- `files` are the audio files the chapters were found on, in play order. Each
  `path` is **relative to the book's folder**:
  - a single-file book's is its file name, the folder being the one its
    `.audiosilo` folder is in;
  - a folder book's is its path inside its own folder.

  `size` is in bytes. `duration_ms` is the file's length, which the Bridge fills
  for a one-file book. The server uses the list only while the book's files are
  these (count, order, path and size), so a list found on other audio never stands
  in.
- `chapters` are the entries in order. `title` is as spoken, or "Chapter N" when
  none was heard. `start_ms` and `length_ms` are on the whole book: the first
  starts at 0, each starts where the one before ends, and the last ends at the
  book's end.
- **Entry k is logical chapter position k.** Front matter is folded into the first
  story chapter, and an unnumbered interior section into the chapter whose number
  it takes. This matters because the server and the players gate spoilers by
  ordinal; see [the list](chapters.md#the-list-chapters_detectedjson).
- A file holds 2 to 2000 chapters, so a book of one chapter gets no file.

Beside it, `bridge.json` carries an optional **`chapters`** object saying which
job wrote it:

```json
"chapters": { "job_id": 21, "generated_at": "2026-10-17T10:02:11Z", "from": "narration", "chapters": 24 }
```

A `chapters.detect` job adds or replaces just this object in the book's existing
`bridge.json`, keeping every other field, as a `sidecars.describe` job does with
its `description` object. A generate run keeps it too.

Its presence is how the Bridge knows a book's characters and recaps were positioned
on chapters found in the narration. The Bridge never writes `chapters.json` beside
characters and recaps made without those chapters, since their spoiler positions
would move. The server doesn't read the object.

### `readalong.json`

This is the book's **read-along map**: where each sentence of its ebook is spoken
in its audio. A `readalong.align` job writes it. How it is made, and the whole
format, are in [Read-along](readalong.md#the-map-audiosilo-readalongv1).

- Its head names the ebook it was made from (`ebook.file`, `ebook.sha256`), the
  audio (`audio.files`: book-relative paths with the server's lengths), the
  generator, `generated_at` and the `coverage`.
- Its `sections` carry one span per sentence: an EPUB CFI with whole-book `start`
  and `end` seconds.

The server stores the head only, and streams the file at
[`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong).
The job doesn't touch `bridge.json`, since the map carries its own `generator`.

## How the Bridge writes them

1. **Through the checked mapping only.** The Bridge locates the book with
   `mapping.SafeJoin` under the mount of a library whose last check found it
   mapped and writable at that mount. While it isn't, the write waits, parked
   `library_not_writable`.
2. **Into the book's own folder**, which took a write probe at the start of the
   job. A write that fails parks `book_not_writable` and is tried again every
   minute, or on **Retry**. The results wait in the engine's work folder.
3. `.audiosilo/` is made `0755` when missing, chmod'ed after the umask so the
   server's user can list it. It is refused when it is a link or not a folder.
4. Each file is written to a temporary file inside `.audiosilo/` and renamed into
   place, `0644`, so the server never reads half a file. A file over 4 MiB fails
   the write, since the server wouldn't read it.
   - `characters.json` and `recaps.json` are written when the engine left them,
     and `bridge.json` always.
   - `description.json` follows in a **second save** once the description step has
     run, and only when the step produced one. The characters and recaps never
     wait for it.
   - `chapters.json` is saved **first**, as soon as the engine has found the
     chapters of a book with no markers, before the characters and recaps exist.
     It is saved again with them at the finish.
   - `readalong.json` is written only by a `readalong.align` job, at its end, and
     only when at least half of the ebook's text lined up. Its own bound is
     16 MiB.
5. Then `POST /bridge/rescan {library_id, path, mode: "attachments"}`.

The same content is never written twice in a run (a content hash). A book the
server moved since the job began is written where it is now.

**Regenerate** writes over book attachments. Book generation does not delete old
content. So a regenerate whose own description step got none leaves the earlier
`description.json` in place. Its new `bridge.json` carries the existing
`description` object over, only beside a `description.json` that is a regular file,
so the kept file stays vouched for.

The other jobs write only their own files:

| Job | Writes |
|---|---|
| `sidecars.describe` | `description.json` and `bridge.json` |
| `chapters.detect` | `chapters.json` and `bridge.json` |
| `readalong.align` | `readalong.json` |

They write through the same rules (the mapping re-checked, `book_not_writable`
parks, the book's current path), then ask for the same attachments rescan.

## How the server finds them

The discovery walk already skips hidden folders. It may meet a folder named exactly
`.audiosilo`: a real folder, never a link, not covered by the library's ignore
rules. Then it **lists it once, without going in**. It records the known regular
files (a known name, alone or after a stem) with their sizes and modification
times, by the folder holding it.

**The signature.** A book's signature is its own part of that listing:
`name:size:mtime_ns` for each of its known names present, with its stem taken off,
joined by commas (`""` for none). The names come in this order:
`characters.json`, `recaps.json`, `description.json`, `chapters.json`,
`bridge.json`, `readalong.json`.

Adding `description.json`, `chapters.json` and `readalong.json` (last) kept the
others in their order. So a book without them keeps the signature it had, byte for
byte. A book that has one was read before the name was known, so its signature
changes and the next scan reads it again.

The signature is stored on the book row (`attachments_sig`) with the `indexed_at`
it was read for (`attachments_indexed_at`).

**The scan.** The Bridge writes these files without touching the audio, so the
book's own signature can't tell. The scan treats them the way it treats an
Audiobookshelf `metadata.json` (see
[the scanner](../server/scanner.md#the-bridges-attachments)):

- **An unchanged book** has its files read and recorded **without** re-reading its
  audio when either holds:
  - its attachment signature differs from the stored one;
  - its files were never read for this index of the row: `attachments_indexed_at`
    is `NULL` after the migration, or another index's.

  This is the attachments backfill, flushed in batches with the path and ABS
  backfills. It is recorded only while the row still holds what the scan read when
  it began. So a scan never lays an older reading over a newer one that the
  Bridge's refresh recorded in the meantime.
- **A re-indexed book** reads them in `enrich`. An on-demand index, which has no
  walk, looks up only the book's own names (`attachmentsSigAt`).
- **A folder that can't be listed** right now (a permission, a flaky share), or a
  file that can't be read right now, keeps what is stored and leaves the row
  unchecked. So the next scan reads them again, rather than taking a book's
  generated content away.

### The attachments refresh

`POST /bridge/rescan` with `mode: "attachments"` (`Scanner.RefreshAttachments`)
re-reads and records only the `.audiosilo/` files of the **indexed** book at the
path, never its audio. The book may also be the one holding the path: a part, or a
disc folder. This is the Bridge's call after writing, which must not cost a full
re-index (ffprobe, tags, cover and fingerprint of every part). It answers what is
now indexed:

```json
{ "path": "Author/Book", "attachments": { "characters": true, "recaps": true, "description": true, "chapters": false, "bridge": true, "readalong": false } }
```

An older Bridge ignores `readalong`. Like a scan, the refresh also hashes the ebook
of a book whose map it reads, when the stored digest isn't for the file there now
(see [the scanner](../server/scanner.md#a-books-ebook)).

Unlike the other files, `chapters.json` changes what the effective row holds: the
book's chapters. So recording the attachments (`SetAttachments`), from this refresh
or from a scan's backfill, re-resolves the book (`refreshEffective`) and fires the
scan's change listener. It does that only when:

- the book's stored `chapters` changed; or
- its stored reading wasn't made for this index. That happens when an older
  server re-indexed the book and rebuilt its chapter rows without the list.

`404 not_indexable` when no indexed book is there. The route is in
[the reference](../server/api/reference.md#post-apiv1bridgerescan).

## How the server checks them

Each file is read the way the ABS `metadata.json` is (`readRegularFile`):

- a **regular file only, never through a link**. An `Lstat`, then `os.SameFile` on
  the opened file, refuses a link swapped in between too;
- **at most 4 MiB**;
- decoded leniently into the meta model types. A leading byte order mark is
  skipped, and unknown fields are allowed, so a newer pipeline may add some;
- then checked.

`readalong.json` has its own bound, **16 MiB** (`metadata.MaxReadalongFile`), and
is read the same way. A map holds one span per sentence, about 1.2 MB for a
23.5-hour book.

| File | Checks |
|---|---|
| `characters.json` | every character has an `id` and a `name` and a `reveal.chapter` of 0 or more; at most 2000 characters, 100 aliases each |
| `recaps.json` | every recap has `text` and a `through.chapter` of 0 or more; at most 2000 recaps |
| `description.json` | the `text`, trimmed (and stored trimmed), is 200 to 1500 code points. Those are meta's `description.schema.json` bounds, which `TestDescriptionBoundsMatchTheSchema` reads from audiosilo-meta's embedded schemas. It holds no control character but a newline, since the player shows it as it is (`metadata.ParseDescription`) |
| all three | every string at most 20,000 bytes; `work` and `license` at most 200 bytes; at most 100 `sources` |
| `chapters.json` | `version` 1. 2 to 2000 chapters: each title 1 to 200 bytes once trimmed (stored trimmed) with no control character; the first starting at 0; each after the one before and within a second of its end; every length above 0. 1 to 2000 files: each path relative (no backslash, no empty segment, none starting with a dot, so no `..` and no hidden name) and at most 4096 bytes; size and length 0 or more (`metadata.ParseChapterList`) |
| `readalong.json` | only the head is checked and stored (`metadata.ParseReadalongHead`). `format` is exactly `audiosilo-readalong/v1`. `ebook.sha256` is 64 hex (stored lowercase). There are 1 to 5000 `audio.files`, each with a path of 1 to 1024 bytes and a duration above 0. `coverage.text` and `coverage.audio` are present and in [0, 1]. `sections` is an array. The generator values and `generated_at` are cleaned like `bridge.json`'s: a value is lost, never the file |
| `bridge.json` | only a file that isn't a JSON object of the format fails. Each value is trimmed, and dropped (not the file) when it is over 200 bytes or holds a control character. `generated_at`, and the `description` object's `generated_at`, is kept only as RFC 3339, rewritten in UTC. A negative `job_id` is `0` |

One entry failing fails the whole file. The pipeline validates its own output, so
a failure means the file isn't the pipeline's. A file that fails is logged and left
out, never served. Its signature is recorded, so it isn't read again until it
changes.

These count as none: a characters file with no characters, a recaps file with no
recaps and a blank summary, and a description with a blank text.

## Storage

Migrations `0048`, `0050`, `0051` and `0058`:

- `books.attachments_sig` (`TEXT NOT NULL DEFAULT ''`) and
  `books.attachments_indexed_at` (`TEXT`, `NULL` until read): the signature and
  the index it was read for.
- `book_attachments`, one row per book with any attachment: `book_id` primary key
  (`REFERENCES books(id) ON DELETE CASCADE`); `characters`, `recaps` and
  `provenance` as checked JSON, `''` for a file that isn't there or can't be used;
  `updated_at`.
- `book_attachments.description` (`0050`, `TEXT NOT NULL DEFAULT ''`): the checked
  `description.json`, the same way.
- `book_attachments.chapters` (`0051`, `TEXT NOT NULL DEFAULT ''`): the checked
  `chapters.json`, the same way. It is a chapter source, not content `/meta`
  serves: see [Generated chapters](../server/community-chapters.md#generated-chapters).
- `book_attachments.readalong` (`0058`, `TEXT NOT NULL DEFAULT ''`): the checked
  head of `readalong.json` (never its sections, which are streamed from the file).
  Beside it on `books`, `ebook_sha256` and `ebook_hashed_sig` hold the digest of
  the ebook of a book with a map, and the ebook signature it was computed for (see
  [Read-along](readalong.md#on-the-server)).

Both are derived from the files, so they are **rebuildable**. They are not
durable state, and a move never carries them: a moved book's folder takes its
`.audiosilo/` along, and the scan reads it at the new path. See
[the data model](../server/data-model.md#the-rebuildable-index).

**`Book.generated`** (`generated: true` on the wire, omitted otherwise) says a
book's signature names a characters, recaps or description file.

- `sigParts` is an allow-list. `bridge.json`, `chapters.json` or `readalong.json`
  alone, or a name a later server adds, is none. Found chapters are the book's
  chapters, and a map is how its text lines up; neither is generated content.
- It is read from the narrow column, so a list never joins `book_attachments`.
- Every book object carries it: lists, search, `item`, recent, and the next book's
  `book`. The player uses it to ask `/meta` for a book with no ASIN or ISBN.

Off the wire, `Book.GeneratedParts` says which parts the signature names. So
`/meta` and the console's book page read only the columns a book has.
`catalog.BookAttachments` takes a parts mask. The estimate's
`catalog.BookAttachmentParts` reads which columns are non-empty without decoding
them.

## The hidden-path rule

No route reaches content through a hidden segment by name. One function states
the rule, `library.ContentPath` (any segment beginning with a dot), and
`ContentJoin` is `SafeJoin` with it first:

- the scan never walks into a hidden folder, and `/fs` never lists one
  (`listDir`);
- nothing indexes a path through one (`IndexPathWithin`), so a request for
  `Book/.audiosilo/x.json` can't make a phantom book;
- every path-taking content route (`scopedPathIn`: stream, cover, item,
  chapters, meta and the rest) answers a hidden path `404`, after the scope check.
  So the answer says no more than a missing file's would. `library.ErrHidden` is
  both `fs.ErrNotExist` and `ErrNotIndexable`;
- `findCover` never takes a hidden file (an AppleDouble `._Cover.jpg`) as a cover.

So `.audiosilo/` is never a book, a disc folder, a browse entry or a streamable
file.

## How the players get them

`/meta` lays the generated content into its answer per request, after the shared
cache, never into it.

- Community content wins per dimension.
- Generated content fills what the community work lacks, or is the whole work of a
  book with no match. It never carries the community's CC BY-SA `attribution`.
- `work.generated` names what came from the files.
- A description rides in its own field, `work.generated_description`, never in
  `community_description`, and only for a work with no community description.

The shapes, the spoiler gates and what older players do with them are in
[the reference](../server/api/reference.md#generated-content).
