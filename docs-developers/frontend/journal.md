---
title: The Journal
description: "The Journal (src/components/journal/): one paged list per server merged newest first, history spans joined into sessions and days, the 24 hour bar, matching drift-offs to sessions, the Bookmarks and Notes tabs, and the Markdown and CSV export."
---

The Journal is the You hub's Journal section, `/you?section=journal&tab=diary|bookmarks|notes`
(`journalHref` beside the other hrefs in `src/lib/paths.ts`, `openJournal` in
`src/lib/open.ts` and on `useOpen`; `parseJournalTab` in `journal-model.ts`: anything
unknown is the Diary). The hub renders `JournalScreen`, with `embedded` on a phone, where
the hub's large title already says "Journal" (the export and the tabs stay); see
[You, Settings and Account](you-and-settings.md#the-hub-and-its-routes). The older
`/journal?tab=` route (`journal.tsx` under `(home,library,search,offline,me)`) still
renders `JournalScreen` for links made before the hub. It covers **every signed-in
server**: each list is read per server, through that server's own connection and
capability, and merged. The user-facing page is [The Journal](/users/listening/journal).

**Entry points:** the hub's Journal segment (the phone's Me tab, You in the top bar), a
**Journal** item in the top bar's profile menu, **Journal** in the palette's Go to group
(`buildGoToItems`), `JournalLink` on a book's Bookmarks and Notes tabs (through
`pushInShell`, so from over the full player it lands in the shell), Your listening's
"See them in your Journal", and a Diary row's cover opening a book on its History tab.

## Module map

| File | What it is |
|---|---|
| `journal-screen.tsx` | `JournalScreen`: header (title, export, the segmented tabs, the search box), `DiaryTab` |
| `journal-model.ts` | Pure: `parseJournalTab`, the search (`searchWords`, `matchesWords`, `annotationHaystack`) |
| `use-journal-sources.ts` | `useJournalSources`: every server's three lists as `Source` snapshots |
| `merge-model.ts` | Pure: `mergeNewestFirst`, `overallStatus`, `Sourced<T>` |
| `diary-model.ts` | Pure: days, the day bar and its colours, chapter ranges, `matchDrifts`, `driftStrip` |
| `diary.tsx` | `DiaryDayCard`, the session rows, the day bar, the drift strip, `DiarySkeleton` |
| `annotations-tab.tsx` | `AnnotationsTab`: the Bookmarks or Notes list, its label chips and search |
| `server-notes.tsx` | The quiet per-server lines above a list (unreachable, or can't list) |
| `use-drift-records.ts` | `useDriftRecords`: this device's drift records, read once |
| `export-*.ts(x)`, `use-journal-export.ts` | The export (below) |
| `journal-list.tsx` | The shared `FlatList` props, `fetchMoreOf` and the paging spinner |

Shared with the book page, outside the folder: `src/lib/listening-sessions.ts` (spans,
sessions, local days, `dayName`), `src/lib/use-day-label.ts` (`useToday`, which moves on
once a day and when the app comes back to the foreground, and `useDayLabel`),
`src/lib/use-infinite-queries.ts` and the date formatters in `src/lib/format.ts`.

## Sources: one infinite query per server

The three lists are the infinite query options of
[State & data](state-and-data.md#bookmarks-notes-and-the-journal) (`myHistoryQuery`,
`myBookmarksQuery`, `myNotesQuery`). TanStack has `useQueries` but nothing for many
infinite queries, so `useInfiniteQueries` (`src/lib/use-infinite-queries.ts`) gives each
entry its own `InfiniteQueryObserver`, kept by query hash while the list of servers
changes, read through `useSyncExternalStore`. `useJournalSources` runs it once per list
over every signed-in server and turns each result into a `Source` (status, rows,
`supported`, `hasNextPage`, `fetchNextPage`, `refetch`). A server's query never waits on
another's, and a removed server's queries go with it; a released list is trimmed by
`keepFirstPage`.

- **History** has no gate: every server has
  [`GET /me/history`](../server/api/reference.md#get-apiv1mehistory). Without
  `annotations` its rows carry no `book`, so a session row reads the item itself
  (`useBook`, cached per book).
- **Bookmarks and notes** need `annotations`, read from each server's `/server`
  (`serverInfoQuery`): until it is known to be on, the query has no function at all
  (`skipToken`). A server reading `false` is `unsupported`; one whose `/server` failed
  is an `error`, never an endless load, and its Retry asks `/server` again too.
- **Notes wait for their tab.** The Diary shows none, so `useJournalSources({ notes })`
  holds them back (`enabled: false`: the cache is read, nothing is fetched) until the
  Notes tab is first opened; until then its count shows only what an earlier visit
  left in the cache. The export asks for them on its own.

### Merging (`mergeNewestFirst`)

Each server's rows arrive newest first, a page at a time. The merge sorts them
together by time (ties: connection order, then the server's own order) and **cuts the
list at the boundary**: a server with more pages has only spoken for rows down to its
oldest loaded one, so anything older, from any server, could still have a newer
neighbour on that server's next page. The cut is the newest such frontier; the servers
sitting on it are `fetchFrom`, the ones asked for their next page when the list's end
is reached (`fetchMoreOf`). A server still loading, failed or unable to list is left
out of the boundary, so one slow or broken server never holds the others back.
`overallStatus` gives the page one state: `loading` while nothing has answered,
`error` when every able server failed, `unsupported` when none can list, else `ready`.
The tab counts (`completeCount`) show only once every able server's list is complete.

## The Diary

The sessions are `src/lib/listening-sessions.ts`, pure and shared with the book page's
History tab, so the two agree. A history row never carries a speed or a device, so
neither is ever shown.

1. **Spans** (`toSpan`): a row with its server, parsed wall-clock `start`/`end` and the
   whole-book `from`/`to`; a row whose times don't parse is dropped.
2. **Sessions** (`groupSessions`): the server writes a span per pause, so spans are
   walked in time order across every book and server, and a span joins the session
   before it when it continues the very span before it: same book and server, a pause
   under `SESSION_GAP_MS` (10 min), picking up within 120 s (content) of where it
   stopped. Another book in between ends the session. A session carries the whole
   stretch's fields, `listened` (the spans' sum, without the pauses) and its parts.
3. **Days** (`groupByDay`, `diary-model.ts`): by the device's local day the session
   started on (a session past midnight stays on its start day), newest first, with the
   day's total; `useDayLabel` names them Today, Yesterday, a weekday within the last
   week, else the date, as of `useToday`.
4. **The day bar** (`dayBars`): every span of the day placed by wall clock as a
   fraction of the day (cut at midnight, at least `MIN_BAR_WIDTH` wide), coloured by
   `barColor`: the book's cover accent or dominant colour, whichever stands off the
   theme's track best, and a theme token when neither reaches 3:1 (or the book has no
   cover colours); hairlines at 06, 12 and 18. It is one image to a screen reader, with
   a summary of the sessions' times.
5. **Rows**: the book's `RowCover` (opening its History tab), "title · 21:12, 21 min",
   the chapter range (`spanRange` through `useChapterNamer`, else positions),
   `ServerFlag` when there's more than one server, the drift strip, and "Finished the
   book" when a span ended within 30 s (content) of the book's end (only knowable with
   the book's length).

### Drift-offs (`matchDrifts` and `driftStrip`)

`matchDrifts(sessions, driftBookmarks)` pairs each "Fell asleep" bookmark
(`isDriftBookmark`, from the bookmarks loaded so far) with the session it ended: the
same book, made between 2 minutes before and 15 minutes after the session's end, and
within 5 minutes (content) of its end position. The closest in time wins; each session
gets at most one.

`driftStrip(bookmark, records, now)` decides what the strip offers. When this device
still holds the sleep timer's [drift record](sleep-timer.md#fell-asleep-drift-controllerts)
for that book (`useDriftRecords`, read once) and it is the same stop (within 60 s),
`driftOffer` gives **Jump back N minutes** to the last
touch; the press spends the record with `takeDrift` first, so the player doesn't ask
again; the strip then forgets the records it was handed, so a second press offers the
bookmark instead of rewinding the listener again. Otherwise the strip offers **Play
from where you drifted off**, at the bookmark. Both jump through `useJumpTo`.

## Bookmarks and Notes

`AnnotationsTab` reads only the active list, merges the servers' lists by `created_at`
(`mergeNewestFirst`), then filters: on Bookmarks the label chips (`labelKeeps`: one
label, `fell_asleep` by `isDriftBookmark` so an older server's markers match too), and
the search on both. The search follows the typing deferred (`useDeferredValue`) and
wants every word of the query somewhere in the book's title, its author and the note or
body, ignoring case and accents (`searchWords`, `annotationHaystack`: folded once per
row). Rows are the shared [`BookmarkRow` / `NoteRow`](annotations.md#rows) with `book`
(the cover leads) and the server flag, in one card whose foot is the list's footer. The
empty states tell apart unsupported (pointing to the Library), loading, error, "No
bookmarks match" and truly empty.

## Export

`useJournalExport(sources)` writes every bookmark and note (not the Diary) of every
server known to list them (`supported === true`; an older server is never asked for a
route it lacks), every server and both lists at once:

1. **Collect** (`collectPages`, pure apart from the injected fetch): the pages the
   Journal already loaded, then the rest a page of 500 at a time, until the list ends
   or `MAX_EXPORT_ROWS` (10,000 per list per server). A repeated cursor or a page with
   nothing new stops it. `preparing` counts the rows gathered for the header's caption.
2. **Rows** (`exportRows`): newest first, each with its server, book, author, position,
   the chapter from chapters **already cached** (`cachedChapterAt`, one namer per book
   for the run: an export never fetches chapters) and the label's name.
3. **Format** (`export-format.ts`, pure; every word comes in translated as
   `ExportWords`): `toMarkdown` groups by book (books in order of their newest row,
   entries by position), each entry `**12:41:07** · Bookmark · Quote · chapter ·
   2026-10-05 21:12` with the text indented under it; `toCsv` writes a UTF-8 BOM,
   a header and CRLF lines, quoting per RFC 4180 and prefixing a field that starts
   with `=`, `+`, `-`, `@`, tab or CR with an apostrophe (CSV injection). The Server
   column, and the server under a Markdown heading, appear only when the rows span
   more than one server. `localStamp` writes the device's time as `YYYY-MM-DD HH:MM`.
4. **Hand over**: `exportFileName` (`journal-YYYY-MM-DD.md` / `.csv`), then
   `saveExport`, split by platform: `export-save.ts` (native) writes the file to the
   cache directory and opens the share sheet (`expo-sharing`, with the MIME type and
   UTI), falling back to sharing the text where files can't be shared;
   `export-save.web.ts` downloads a Blob through a temporary link (`downloadBlob`, `src/lib/download-blob.ts`, shared with the Year in listening share). On the web, **Copy
   as Markdown** goes through `copyText` and toasts only on a real copy.

`ExportActions` / `exportChoices`: the web gets Copy as Markdown plus a Download menu
(Markdown, CSV); native gets one Export menu (Share as Markdown, Share as CSV); a
narrow header (under 520 px measured) folds everything into the one menu. While an
export gathers, the trigger spins and a caption counts the rows; it ends once the rows
are in, before the share sheet comes up, and a second export waits until the first is
over. The actions
are hidden when no server can list annotations and disabled until the lists are ready.
A failed server is named in a toast and left out; a truncated list says so.
