---
title: Add from LibriVox
description: "How an admin adds a LibriVox recording to a books library: the three admin routes, the librivox.fetch job (params, progress, result, failure codes), the book's identity recorded by the server's fold, the archive.org-only fetch, placement and names, staging, resume and the 7-day sweep, and .audiosilo/librivox.json."
---

An admin searches the community metadata database's LibriVox works, picks a
recording and a books library, and the Bridge downloads the recording into that
library. The server then records the placed book as that LibriVox recording, so
[`/meta`](../server/api/reference.md#get-apiv1librariesidmeta) answers it with no
console match.

| Side | Role | Code |
|---|---|---|
| The server | the admin routes, the recording's identity at queue time, the job kind and its fold | `api/handlers_librivox.go`, `bridge/librivox.go`, `catalog/librivox.go`, `meta/librivox.go` |
| The Bridge | reads the manifest, downloads from archive.org, places the folder, rescans | `internal/librivoxjob`, `internal/metaops/librivox.go`, netguard's per-request `Allow` |
| The console | [Library > LibriVox](../server/web-ui.md#library--librivox) | `admin-ui/src/features/librivox/` |
| The player | [Find on LibriVox](../frontend/library-and-browse.md#find-on-librivox-admin), an admin page off a books library's menu | `src/components/librivox/` |

The User Guide's [Add free books from LibriVox](/users/admin/librivox) is the
admin's view of it.

## The gate

There is no managed module, no toggle and no `/server` flag of its own. A client
offers the feature when all of these hold:

- the caller is an admin;
- the `metadata` capability is on;
- the Bridge's features list `librivox`, the family of `librivox.fetch`.

The server lists a feature only for kinds it knows
(see [`GET /server`](../server/api/reference.md#get-apiv1server-the-bridge-capability-and-block)),
so an older server never shows it, and an older Bridge never advertises the kind.

The console reads the features from `GET /admin/bridge`, which keeps them while
the Bridge is offline, so it still queues a job that waits for the Bridge. The
player reads them from `GET /server`, whose `bridge` block is present only while
the Bridge is online, so the player offers nothing while it is offline.

## The routes

All three are admin only (`requireAdmin`) and answer `404 metadata_off` while
community metadata is off. The [reference](../server/api/reference.md#add-from-librivox)
has the shapes and every status.

- `GET /admin/librivox/search?q=&lang=&limit=` asks metaserve's
  `works/search?source=librivox`. The server checks `lang` and `limit` itself, so
  a metaserve `400` never reads as an outage.
- `GET /admin/librivox/work?id=` answers the work and its LibriVox recordings only
  (those with a `librivox_id`). Each recording carries `in_library`, where it
  already is on this server, and `job`, the newest open fetch of the project in
  any library.
- `POST /admin/librivox/fetch {library_id, librivox_id}` resolves the project's
  work and recording and queues `librivox.fetch`.

## The job: `librivox.fetch`

| | |
|---|---|
| Kind | `librivox.fetch` (`bridge.KindLibrivoxFetch`; the Bridge's `librivoxjob.Kind`), feature `librivox` |
| Server spec | needs a library, no book path, **writes**, a books library only, internal (`POST /admin/bridge/jobs` refuses it with `400`), no module |
| Dedupe | per library and project (suffix `\|<librivox_id>`): a repeat answers the open job |
| Notifications | not quiet. Done is "Added from LibriVox", named by the book its result names, and says how the book is matched ([The notification](#the-notification)). Failed, and a lasting park, are notified as for other kinds, named by the params' `title` when no book was placed |
| Bridge lane | `download` (1 slot, shared with `audible.import` and an ordinary `podcast.fetch`), so one book downloads at a time. A parked fetch gives the slot back while it waits ([Parked fetches](#parked-fetches)) |
| Bridge state | `<data>/librivox/<library_id>-<librivox_id>.json` |

### Params

The server builds them and checks them strictly. The Bridge reads them leniently
and ignores unknown fields.

```json
{ "librivox_id": 192, "work_id": "johnny-crows-garden", "recording_id": "…", "library_id": 3, "title": "Johnny Crow's Garden" }
```

`work_id` and `recording_id` are what the server resolved at queue time
([The book's identity](#the-books-identity)). Both must have the community's id
shape (`metaID`: a letter or digit, then up to 199 letters, digits, `.`, `_` or
`-`), the same rule the Bridge checks, so a bad id is refused at queue time.

`title` is the work's title from the same lookup, cut to one line of at most 300
bytes (`bridge.CleanText`). It is optional and additive: the server names a
fetch that placed no book by it, in its notification and in the console's job
list. The Bridge ignores it.

### Progress

`progress.step` is one of these, in order:

| Step | What the Bridge does |
|---|---|
| `manifest` | reads the project's manifest and work from its metadata service |
| `download` | downloads the sections; `done` and `total` count sections |
| `cover` | downloads `cover.jpg`, best effort |
| `place` | writes `.audiosilo/librivox.json` and moves the folder into place |
| `rescan` | asks the server to index the book (`POST /bridge/rescan`, three tries) |

The job waits while its library has no mapping check yet. A new job whose library
is checked but not mapped and writable fails `not_writable`. A resumed job, or one
already downloading, **parks** instead (`needs_attention`, park code
`not_writable`), and it carries on once a mapping check reports the library
writable again.

#### Parked fetches

A parked fetch gives its `download` lane slot back while it waits
(`jobs.Reporter.Yield`), so an Audible import or a podcast download can run in the
meantime. A yielded run counts as neither running nor waiting. Once the mapping
is back it takes a slot again (`Reclaim`, first in line), then checks the mapping
once more before it writes anything, since the wait for the slot can be long.
Downloads stay one at a time, and a fetch's sections stay serial.

### Result

```json
{ "library_id": 3, "path": "L. Leslie Brooke/Johnny Crow's Garden", "librivox_id": 192, "files": 9, "bytes": 53477376, "adopted": false }
```

`path` is the book path the Bridge's rescan answered. `files` and `bytes` count
everything the folder holds from the job: the sections and the cover.

`adopted` is `false` only when this run itself renamed the staging folder into
place, so the folder was vacant until now. Any run that finds the book already
placed reports `true`: a retry after a failed rescan, a placement the state
never recorded, or a folder that already holds this project's
`librivox.json`. The Bridge always sends it. The server reads it as optional, so
a result from an older Bridge without it still folds
([The book's identity](#the-books-identity)).

### Failure codes

A failed job's result is `{code, message}`, and its error is the message. The
message never holds a URL.

| Code | Means |
|---|---|
| `not_writable` | the library is not a checked, writable books mapping, or its mapping moved to another mount while the job ran |
| `exists` | the title's folder and its fallback are both taken, or the author folder is a listed book or holds audio |
| `disk_full` | the library has less than 1.1 times the rest of a file free |
| `not_found` | the Bridge's metadata service has no such project, it lists no files, or the work's recording now names another project |
| (no code) | the metadata service stayed down, or refused the read with a permanent `4xx` ([Fetching from archive.org only](#fetching-from-archiveorg-only)) |
| `archive_unavailable` | a section is not on archive.org, or archive.org kept failing |
| `metadata_off` | the Bridge has no metadata service set (`metadata.base_url`) |

The console words each code (`FETCH_CODES` and `fetchReason` in
`librivox-model.ts`), and so does the player (`librivox.fetch.code.*`). An
unknown failure keeps the Bridge's own message in the console's job list.

## The book's identity

The server, not the Bridge, decides which recording a fetched book is:

1. `POST /admin/librivox/fetch` asks metaserve's `lookup?librivox_id=` for the
   project alone (`meta.Service.LibrivoxRecordingOf`). An answer with no
   recording is `404 not_found`. The server never falls back to a work's first
   recording.
2. The work and recording travel in the job's params.
3. When the job ends `done`, `catalog.FoldLibrivoxFetch` (from the jobs'
   `OnEnded` hook) writes the book's `book_matches` row with them: `how`
   `accepted`, `set_by` the admin who asked, no run and no offered identifiers.
   It wakes the `OnBookChange` listeners, since the rescan woke them before the
   match was there.

The fold writes only when the result names the job's own library and project and
a book indexed there, in a books library. Otherwise it records nothing and logs
`ErrFetchNotIndexed`. It never touches another path's rows. What it does at the
book's path depends on the result's `adopted`:

| `adopted` | The folder | The fold |
|---|---|---|
| `false` | was vacant until this run placed it | replaces the path's `book_matches` row, and drops the path's ASIN and ISBN `book_overrides` (whoever set them) and its `book_enrichment` row, then rebuilds the book's effective metadata. Those rows are a deleted book's leftovers, and `/meta` would ask them before the match. |
| `true` | is an earlier fetch's book | inserts the match only when the path has none, so an admin's rematch stays, and touches nothing else |
| absent (an older Bridge) | not known | replaces the match and touches nothing else |

#### The notification

After the fold, the server reads how the book is matched now
(`catalog.LibrivoxFetchMatch`) and puts it in the `bridge_job_finished` event's
`librivox_match`:

- `matched`: matched to the job's recording;
- `kept`: an adopted book already matched to something else, which the fold kept;
- `unmatched`: neither, or a result the fold refused (another library or
  project than the job's, or no book indexed at its path).

The message claims the recording only when it is `matched`, and an `unmatched`
one goes out as a warning. The wording is in
[Bridge messages](../server/backups-and-notifications.md#bridge-messages).

"Where is this recording" is read from those stored rows alone
(`catalog.WorkRecordingBooks`): indexed books whose `book_matches` row names that
exact, non-empty `recording_id` of the work. A work-level match, or `/meta`'s
answer for a work's first recording, never counts. The work route's `in_library`
and the fetch route's `409 in_library` (any library) both read it.

Two things drop the identity, because the server does not read
`.audiosilo/librivox.json`:

- a fold lost between the job's commit and the fold, such as a crash;
- [Clear community matches](../server/api/reference.md#delete-apiv1admincommunity-matches).

Adding the recording again repairs either while the path holds no match. When
the folder the Bridge plans now, or its fallback, is the one it placed (it holds
the project's `librivox.json`), the Bridge only rescans it and reports
`adopted: true`, and the fold records the match. A match recorded at the path
since then, such as a bulk run's, stays, and the notification says `kept`.

## Fetching from archive.org only

The Bridge reads the manifest from **its own** metadata service
(`metadata.base_url`, `meta.audiosilo.app` by default), not the server's copy:

- `GET /api/v1/librivox/audiobooks?id=<librivox_id>&extended=1&coverart=1`, the
  LibriVox-shaped feed, for the sections, their titles and URLs, the cover and the
  archive.org identifier;
- `GET /api/v1/works/{work_id}` for the title, the authors and how many LibriVox
  recordings the work has. A `404` there is no failure, and the project's own
  title names the folder then.

A metadata service that is down never ends the job. Each read is tried 4 times
(5, 10 and 20 seconds apart), then the run fails with no code and keeps its
staging folder and state for the next attempt. A definite `404` for the project
ends it as `not_found`. Any other permanent `4xx` (all but `404`, `408`, `425` and
`429`: `metaops.ErrRefused`) is a refusal, not an outage. The run reads once,
fails at once with no code, and removes its staging folder and state.

Every section and cover URL must be `https` on `archive.org` or a subdomain of it
(`AllowedURL`). The Bridge checks every section's URL before anything is fetched
or written (one elsewhere fails the job `archive_unavailable`), the cover's before
the cover is fetched (one elsewhere is skipped), and each again on every redirect,
through netguard's per-request `Allow`. It never fetches from librivox.org. The client is the Bridge's own netguard client
(public addresses only, not the podcasts' `allow_networks`). A URL with padding
around it is refused as it stands, so the check and the request see one spelling.

Only audio is kept:

- a `Content-Type` other than none, `audio/*`, `application/octet-stream`,
  `binary/octet-stream` or `application/ogg` is never written;
- a whole file whose first bytes (past any zero padding in its first 4 KB) are no
  ID3 or APE tag, MPEG frame sync, RIFF `WAVE`, `OggS`, `fLaC` or MP4 `ftyp` is
  removed;
- an empty body never counts as a finished section.

Each is tried again like a dropped connection. Three attempts in a row that add
nothing to a section fail the job `archive_unavailable`, and the run keeps its
staging folder and state as it does through a metadata outage, so the next
attempt resumes. A `4xx` other than `408`, `416` and `429` also fails it
`archive_unavailable`, and removes them.

## Placement and names

The folder is `<Author>/<Title>/`, from `placement.Suggest` as a standalone book:

- **Author**: the first credit. Over three authors, `Various`. An author folder
  already in the library (`importjob.AuthorFolders`) is reused as it is spelled.
  With no author the book goes at the library root.
- **Title**: the work's title, or the project's own title when the work has more
  than one LibriVox recording, so "(version 2)" and "Vol. 001" keep two projects
  apart. That is why it is not `importjob.Planner.Plan`, whose `match.CleanTitle`
  drops them. A title with nothing left is `LibriVox <id>`.
- **Taken**: when the title's folder exists, the Bridge tries
  `<Title> (LibriVox <id>)` once, then fails `exists`.

Names lose control characters and runs of spaces, go through `placement.Sanitize`
(which also drops leading dots) and are cut to 180 bytes on a rune boundary.

Sections are `NN - <section title>.<ext>`:

- `NN` is the section's 1-based position, at least two digits and as wide as the
  count. It is never LibriVox's `section_number`.
- A title that opens with its own number and a separator (`1 - `, `1. `, `1: `,
  `1) `) loses it, so "1 - Chapter 01" is `01 - Chapter 01`. A title such as
  "1984" stays.
- An untitled section, or one that was only its number, is `Section N`.
- `<ext>` is the URL's audio extension, else `.mp3`.

Each section is one file and one chapter: the job writes no `chapters.json`, and
the scanner titles the chapters from the tags or the file names.

## Staging, resume and cleanup

The Bridge stages the book in `<parent>/.audiosilo-librivox-<id>/`, beside where
it goes. It is a dot folder, so the scanner skips it. Every write goes through
the mount's `os.Root`:

1. Each section downloads to `<name>.part`. Its strong `ETag` and size are saved
   in the state before the body.
2. A resumed section asks with `Range` and `If-Range`, and only a proven `206`
   continues it. Anything unproven starts the file again.
3. A section is renamed to its name only at its stated size.
4. The cover (`cover.jpg`, only a sniffed JPEG from archive.org) and
   `.audiosilo/librivox.json` follow.
5. The staging folder is swept to the manifest's files, then moved into place by
   one `fsutil.RenameNoReplace`. A folder that raced in takes the fallback once.
   Nothing is ever replaced.
6. The Bridge rescans the book.

The mapping is checked again before each section, before the cover and marker,
and before the rename.

The state file records the library, the paired server's id, the parent, the
destination, the partials' validators and, once placed, the count and bytes. So:

- a stop, or a lost claim, keeps the staging folder and the state, and the next
  attempt follows them instead of planning again;
- once placed, the state is the placement marker: a failed rescan keeps the book,
  and the retry goes on from the rescan;
- a placement the state never recorded (a kill between the rename and the state's
  write) is adopted when the folder or its fallback holds this project's
  `librivox.json`, and is never fetched again;
- a cancel, a failure, or the runner abandoning the job removes the staging
  folder, an author folder it made that is empty, and the state. When the staging
  folder can't be removed now (the mount is away, or the library isn't listed
  yet), the state stays, so the sweep or a re-add finds it;
- a state of another server is dropped when it is read, so a run plans afresh,
  and Abandon and the sweep never act on another server's same-numbered library.
  A state with no server id counts as this server's.

A second run of the same library and project, claimed while the first is still
ending (a re-add right after a cancel of a parked run), waits up to about two
minutes for it, then fails. Abandon leaves a running fetch alone.

### The 7-day sweep

Like `audible.import`'s, a sweep (`librivoxjob.Sweep`) clears states unused for 7
days (`StagingMaxAge`). A run touches its state when it loads it and when it ends.
The app runs the sweep after each mapping check, not at start-up, because the
staging folders are inside the libraries, which are known only after a heartbeat
and the check. The sweep:

- skips a fetch that is running here, and one whose job row the runner still
  holds (`store.OpenServerJobs`), such as a recovered job waiting for its lane. If
  it can't read those rows, it sweeps nothing;
- keeps a state whose library isn't a checked writable mapping now, or whose
  staging folder can't be removed;
- otherwise removes the state, its staging folder and the author folder it made.
  For a placed book or another server's state it drops only the state file;
- removes other old regular files in the state folder, never a folder.

A staging folder whose state is gone is out of its reach: it stays, hidden and
unindexed.

## `.audiosilo/librivox.json`

The Bridge writes it into the book's folder:

```json
{ "version": 1, "librivox_id": 192, "work_id": "johnny-crows-garden", "recording_id": "…", "archive_id": "…" }
```

The server does not read it yet: its scanner skips the name (no scan error), and
it is not one of the [attachments](attachments.md) the server serves.
