---
title: The .audiosilo folder
description: "The Bridge's generated files in a book's hidden .audiosilo folder: where they go (and the single-file stem prefix), their formats (characters, recaps, the own-words description, the chapters found in the narration and the provenance), how the Bridge writes them, how the server finds, checks and stores them (signatures, the attachments refresh), the hidden-path rule, and how /meta serves them."
---

A `sidecars.generate` job (and a `sidecars.describe` job, Phase 1c, and a `chapters.detect` job, Phase 1d) leaves its results **with the book**, in a hidden
folder the server reads: the filesystem stays the source of truth, and the
server's copy is a rebuildable index of it like everything else. The Bridge
writes the files (`internal/generate/attach.go`, `describejob.go`, `chapters.go`); the server never writes into a
library and only reads them (`metadata/attachments.go`,
`library/attachments.go`, `catalog/attachments.go`; `metadata/chapterlist.go` for the chapters).

## Where they go

| Book | Folder | Names |
|---|---|---|
| a folder book (a folder that holds its audio), a joined disc set included | `<book folder>/.audiosilo/` (for a disc set, the joined book's folder, the one holding the discs) | `characters.json`, `recaps.json`, `description.json`, `chapters.json`, `bridge.json` |
| a single-file book (a loose file at the library root, or a book in a `collection` folder) | `<the file's folder>/.audiosilo/` | `<stem>.characters.json`, `<stem>.recaps.json`, `<stem>.description.json`, `<stem>.chapters.json`, `<stem>.bridge.json`, the stem being the file name without its last extension (`Book.m4b` -> `Book.characters.json`) |

The prefix keeps the books of one folder apart, since a collection folder's books
share one `.audiosilo/`. These are the book attachment names; podcast-specific
files are described below. Audio is never stored in `.audiosilo/`.

### Podcast CHAP attachments

`podcast.fetch` writes `<show>/.audiosilo/<stem>.chapters.json`, stripping only
the episode filename's last extension. It uses the version-1
[chapter-list shape](#chaptersjson) with `from:"id3_chap"`,
`generator:"audiosilo-bridge"`, `generated_at:Fetch.fetched_at` and exactly one
`files` entry: audio basename, Fetch bytes and probed `duration_ms`. Chapters
are `{title,start_ms,length_ms}` on the episode timeline. No ASR, agent,
`bridge.json` or `Book.generated` flag is involved.

The Bridge reads bounded ID3v2.3/v2.4 CHAP, sorts chronologically, uses
`Chapter N` for missing titles, skips APIC images and ignores CTOC ordering.
Invalid lists, zero or one chapter produce no sidecar while valid audio still
installs. The [Spike 6 decisions](podcasts.md#spike-results-extensions-and-mp3-chapters)
give timing, text and size limits.

The podcast scanner uses `metadata.ParseChapterList`, then requires
`from:id3_chap`, matching basename/size/duration and the current Fetch timestamp.
It consumes times directly, bypassing book generated-chapter filling and
alignment. The chapters/files response uses optional
`chapters_source:"id3_chap"`. Present audio without a usable list gets a
whole-file chapter; absent audio gets empty chapters/files.

`<stem>.publish.json` is a transient install/delete journal and a server
indexing/media barrier, at most 4 MiB. Podcast publication commits
audio/chapters/Fetch before removing it, then uses targeted `POST /bridge/rescan`
without `mode:"attachments"` or `from`. A generation without CHAP removes its
old sidecar. Retention moves owned audio/CHAP to same-filesystem trash and
keeps Fetch as a tombstone. See [publication](podcasts.md#publication-generations-and-serving).

## The formats

- **`characters.json`** is audiosilo-meta's `model.Characters` and
  **`recaps.json`** its `model.Recaps` (with `in_short` and `ending`): exactly what
  the pipeline's `sidecars/` folder holds after its own validation. Their `work`
  field is the resolved community work's slug, or the pipeline's placeholder.
- **`description.json`** (Phase 1c) is audiosilo-meta's `model.Description`: the
  book's spoiler-free description in the agent's own words, with the run's `work`
  and `sources` (taken from its `characters.json`) and the share-alike licence,
  checked against meta's `description.schema.json` before it is kept (how it is
  written: [the description step](generating.md#the-description-step)):

```json
{
  "work": "the-call-of-the-wild",
  "text": "Buck, a large and comfortable dog on a Santa Clara Valley estate, ...",
  "license": "CC-BY-SA-4.0",
  "sources": [{ "type": "community" }]
}
```

- **`chapters.json`** (Phase 1d) is the chapters the Bridge found in the
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

`inputs` are what the run read, library-relative: the book's audio files with the
sizes and modification times the server gave (Unix seconds), or the one `.epub`.
The server reads every field but `inputs`.

Beside a `description.json`, `bridge.json` carries an optional **`description`**
object (Phase 1c) saying how that file was made:

```json
"description": {
  "job_id": 14,
  "generated_at": "2026-10-16T09:31:02Z",
  "from": "opening_notes",
  "chapters": 3,
  "checked_against": "transcripts"
}
```

`job_id` is the job that wrote it, `from` always `opening_notes` (the only source a
description is written from), `chapters` how many opening chapters' notes the
agent saw, and `checked_against` what the no-verbatim check measured against:
`transcripts`, `book text` (an ebook's) or `none` (the source text was gone). Of
this object the server reads only `generated_at` (`AttachmentProvenance.DescriptionAt`,
the console's "written" time); an object of another shape costs that time, never
the file. A `sidecars.describe` job adds or replaces just this object in the
book's existing `bridge.json`, keeping every other field (the characters' run, its
`generated_at` included); with no `bridge.json` there (or not a regular file
holding a JSON object) it writes a fresh one of its own `kind`.

### `chapters.json`

Phase 1d: the chapters a Bridge found in the narration of a book with no chapter
markers (how: [Chapterless books](chapters.md)), on the **whole-book timeline**,
the shape of a community recording's chapter list:

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

- `version` is `1`, the one version the server reads. `generator`, `generated_at`
  (RFC 3339) and `from` (`narration` for book detection, `id3_chap` for podcasts) say what made it; the shared parser cleans
  them like a provenance value and never refuses the file over them.
- `files` are the audio files the chapters were found on, in play order, each
  with its `path` **relative to the book's folder**: a single-file book's is its
  file name (the folder being the one its `.audiosilo` folder is in), a folder
  book's its path inside its own folder. `size` is in bytes; `duration_ms` is the
  file's length (the Bridge fills it for a one-file book). The server uses the list
  only while the book's files are these (count, order, path and size), so a list
  found on other audio never stands in.
- `chapters` are the entries in order, `title` as spoken (or "Chapter N" when
  none was heard), `start_ms` and `length_ms` on the whole book: the first starts
  at 0, each where the one before ends, the last ends at the book's end. **Entry k
  is logical chapter position k** (front matter folded into the first story
  chapter, an unnumbered interior section into the chapter whose number it takes),
  because the server and the players gate spoilers by ordinal: see
  [the list](chapters.md#the-list-chapters_detectedjson).
- 2 to 2000 chapters: a book of one chapter gets no file.

Beside it, `bridge.json` carries an optional **`chapters`** object saying which
job wrote it:

```json
"chapters": { "job_id": 21, "generated_at": "2026-10-17T10:02:11Z", "from": "narration", "chapters": 24 }
```

A `chapters.detect` job adds or replaces just this object in the book's existing
`bridge.json`, keeping every other field, as a `sidecars.describe` job does with
its `description` object. A generate run keeps it too, and its presence is how
the Bridge knows a book's characters and recaps were positioned on chapters found
in the narration: it never writes `chapters.json` beside characters and recaps made
without them (their spoiler positions would move). The server doesn't read the
object.

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
   `description.json` follows in a **second save** once the description step has
   run (the characters and recaps never wait for it), only when the step got one.
   `chapters.json` (Phase 1d) is saved **first**, as soon as the engine has found
   the chapters of a book with no markers, before the characters and recaps exist,
   then again with them at the finish.
5. Then `POST /bridge/rescan {library_id, path, mode: "attachments"}`.

The same content is never written twice in a run (a content hash), and a book
the server moved since the job began is written where it is now.
**Regenerate** writes over book attachments. Book generation does not delete old content, so a
regenerate whose own description step got none leaves the earlier
`description.json` in place, and its new `bridge.json` carries the existing
`description` object over (only beside a `description.json` that is a regular
file), so the kept file stays vouched for. A `sidecars.describe` job writes only
`description.json` and `bridge.json`, and a `chapters.detect` job only
`chapters.json` and `bridge.json`, through the same write rules (mapping
re-checked, `book_not_writable` parks, the book's current path), then asks for the
same attachments rescan.

## How the server finds them

The discovery walk already skips hidden folders. When it meets a folder named
exactly `.audiosilo` (a real folder, never a link, not covered by the library's
ignore rules), it **lists it once, without going in**: it records the known
regular files (a known name, alone or after a stem) with their sizes and
modification times, by the folder holding it. A book's **signature** is its own
part of that listing, `name:size:mtime_ns` for each of its known names present,
in the order `characters.json`, `recaps.json`, `description.json`,
`chapters.json`, `bridge.json`, joined by commas (`""` for none), its stem taken
off. Adding `description.json` (Phase 1c) and `chapters.json` (Phase 1d) kept the
others in their order, so a book without them keeps the signature it had byte for
byte; a book that has one was read before the name was known, so its signature
changes and the next scan reads it again. It is stored on the book row
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
{ "path": "Author/Book", "attachments": { "characters": true, "recaps": true, "description": true, "chapters": false, "bridge": true } }
```

Unlike the other files, `chapters.json` changes what the effective row holds (the
book's chapters), so recording the attachments, from this refresh or a scan's
backfill (`SetAttachments`), re-resolves the book (`refreshEffective`) and fires the
scan's change listener when its stored `chapters` changed, or when its stored
reading wasn't made for this index (an older server re-indexed the book, rebuilding
its chapter rows without the list), and only then.

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
| `description.json` | the `text`, trimmed (and stored trimmed), is 200 to 1500 code points (meta's `description.schema.json` bounds, which `TestDescriptionBoundsMatchTheSchema` reads from audiosilo-meta's embedded schemas) and holds no control character but a newline: the player shows it as it is (`metadata.ParseDescription`) |
| all three | every string at most 20,000 bytes; `work` and `license` at most 200 bytes; at most 100 `sources` |
| `chapters.json` | `version` 1; 2 to 2000 chapters, each title 1 to 200 bytes once trimmed (stored trimmed) with no control character, the first starting at 0, each after the one before and within a second of its end, every length above 0; 1 to 2000 files, each path relative (no backslash, no empty segment, none starting with a dot: no `..`, no hidden name), at most 4096 bytes, size and length 0 or more (`metadata.ParseChapterList`) |
| `bridge.json` | only a file that isn't a JSON object of the format fails; each value is trimmed and dropped (not the file) when it is over 200 bytes or holds a control character; `generated_at` (and the `description` object's `generated_at`) is kept only as RFC 3339 (rewritten in UTC); a negative `job_id` is `0` |

One entry failing fails the whole file: the pipeline validates its own output,
so a failure means the file isn't the pipeline's. A file that fails is logged and
left out (never served), and its signature is recorded, so it isn't read again
until it changes. A characters file with no characters, a recaps file with no
recaps and a blank summary, or a description with a blank text, counts as none.

## Storage

Migrations `0048`, `0050` and `0051`:

- `books.attachments_sig` (`TEXT NOT NULL DEFAULT ''`) and
  `books.attachments_indexed_at` (`TEXT`, `NULL` until read): the signature and
  the index it was read for.
- `book_attachments` (`book_id` primary key, `REFERENCES books(id) ON DELETE
  CASCADE`; `characters`, `recaps`, `provenance` as checked JSON, `''` for a file
  that isn't there or can't be used; `updated_at`): one row per book with any.
- `book_attachments.description` (`0050`, `TEXT NOT NULL DEFAULT ''`): the checked
  `description.json`, the same way.
- `book_attachments.chapters` (`0051`, `TEXT NOT NULL DEFAULT ''`): the checked
  `chapters.json`, the same way. It is a chapter source, not content `/meta`
  serves: see [Generated chapters](../server/community-chapters.md#generated-chapters).

Both are derived from the files, so they are **rebuildable**: not durable state,
never carried by a move (a moved book's folder takes its `.audiosilo/` along, and
the scan reads it at the new path). See
[the data model](../server/data-model.md#the-rebuildable-index).

**`Book.generated`** (`generated: true` on the wire, omitted otherwise) says a
book's signature names a characters, recaps or description file (`sigParts`, an
allow-list: `bridge.json` or `chapters.json` alone, or a name a later server adds,
is none: found chapters are the book's chapters, not generated content). It is
read from the narrow column, so a list never joins `book_attachments`, and every
book object carries it (lists, search, `item`, recent, the next book's `book`):
the player uses it to ask `/meta` for a book with no ASIN or ISBN. Off the wire,
`Book.GeneratedParts` says which parts the signature names, so `/meta` and the
console's book page read only the columns a book has (`catalog.BookAttachments`
takes a parts mask; the estimate's `catalog.BookAttachmentParts` reads which
columns are non-empty without decoding them).

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
`work.generated` names what came from the files. A description rides in its own
field, `work.generated_description`, never in `community_description`, and only
for a work with no community description. The shapes, the spoiler gates
and what older players do with them are in
[the reference](../server/api/reference.md#generated-content).
