---
title: The Journal
description: "The Journal (src/components/journal/): one paged list per server merged newest first, history spans joined into sessions and days, the 24 hour bar, matching drift-offs to sessions, the Bookmarks and Notes tabs, and the Markdown and CSV export."
---

The Journal is `/journal?tab=diary|bookmarks|notes` (`journalHref`, `parseJournalTab`
in `journal-model.ts`; anything unknown is the Diary). The route file under
`(home,library,search,offline,me)` only exports `JournalScreen`. It covers **every
signed-in server**: each list is read per server, through that server's own connection
and capability, and merged. The user-facing page is [The Journal](/users/listening/journal).

**Entry points:** `JournalEntryRow` (`journal-entry.tsx`) at the top of the Settings
screen (the phone's Me tab), a **Journal** item in the top bar's profile menu, a
**Journal** item in the palette's Go to group (`buildGoToItems`, `palette-model.ts`),
`JournalLink` on a book's Bookmarks and Notes tabs, and a Diary row's cover opening a
book on its History tab.

## Module map

| File | What it is |
|---|---|
| `journal-screen.tsx` | `JournalScreen`: header (title, export, the segmented tabs, the search box), `DiaryTab` |
| `journal-model.ts` | Pure: `JournalTab`, `parseJournalTab`, `journalHref`, `matchesQuery` |
| `use-journal-sources.tsx` | `useJournalSources`: the per-server feeders and their `Source` snapshots |
| `merge-model.ts` | Pure: `mergeNewestFirst`, `overallStatus`, `Sourced<T>` |
| `diary-model.ts` | Pure: spans, sessions, days, the day bar, chapter ranges, `matchDrifts`, `driftStrip` |
| `diary.tsx` | `DiaryDayCard`, the session rows, the day bar, the drift strip, `DiarySkeleton` |
| `annotations-tab.tsx` | `AnnotationsTab` (Bookmarks or Notes), `filterBookmarks`, `filterNotes`, `LABEL_FILTERS` |
| `server-notes.tsx` | The quiet per-server lines above a list (unreachable, or can't list) |
| `use-drift-records.ts` | `useDriftRecords`: this device's drift records, read once |
| `export-*.ts(x)`, `use-journal-export.ts` | The export (below) |
| `journal-format.ts`, `journal-list.tsx` | Date formatting; the shared `FlatList` props and paging spinner |

## Sources: one infinite query per server

The three lists are infinite queries in `hooks.ts` (`useAllHistory`, `useMyBookmarks`,
`useMyNotes`, keys `qk.myHistory(cid)`, `qk.myBookmarks(cid)`, `qk.myNotes(cid)`; pages
of 100 on the server's opaque `next_cursor`, normalised by the client to
`Page<T> = { items, next_cursor? }`). TanStack has no "many infinite queries" hook, so
`useJournalSources` renders one tiny **feeder** component per (list, server) that runs
the hook and reports a `Source` up (status, rows, `hasNextPage`, `fetchNextPage`,
`refetch`); the screen renders `sources.feeders` once. A server's query never waits on
another's, and a removed server's feeder unmounts and takes its rows with it.

- **History** has no gate: every server has `GET /me/history`. One without
  `annotations` ignores the cursor, sends no `next_cursor` (so its answer is one page,
  the newest `limit`) and no `book` per row; a session row then reads the item itself
  (`useBook`, cached per book).
- **Bookmarks and notes** need `annotations`. A server reading `false` is
  `unsupported` (its list never runs); one whose `/server` failed is an `error`, never
  an endless load, and its Retry asks `/server` again too.

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

`diary-model.ts` is pure, and also feeds the book page's History tab, so the two agree.
A history row never carries a speed or a device, so neither is ever shown.

1. **Spans** (`toSpan`): a row with its server, parsed wall-clock `start`/`end` and the
   whole-book `from`/`to`; a row whose times don't parse is dropped.
2. **Sessions** (`groupSessions`): the server writes a span per pause, so spans are
   walked in time order across every book and server, and a span joins the session
   before it when it `continues` the very span before it: same book and server, a
   pause under `SESSION_GAP_MS` (10 min), picking up within
   `SESSION_POSITION_SLACK_S` (120 s) of where it stopped. Another book in between
   ends the session. A session carries the whole stretch's fields, `listened` (the
   spans' sum, without the pauses) and its parts.
3. **Days** (`groupByDay`): by the device's local day the session started on (a
   session past midnight stays on its start day), newest first, with the day's total;
   `dayName` gives Today, Yesterday, a weekday within the last week, else the date.
4. **The day bar** (`dayBars`): every span of the day placed by wall clock as a
   fraction of the day (cut at midnight, at least `MIN_BAR_WIDTH` wide), in the book's
   `cover_color` accent; hairlines at 06, 12 and 18. It is one image to a screen
   reader, with a summary of the sessions' times.
5. **Rows**: "title · 21:12, 21 min", the chapter range (`spanRange` through
   `useChapterNamer`, else positions), the server flag when there's more than one
   server, the drift strip, and "Finished the book" when a span ended within
   `FINISH_SLACK_S` (30 s) of the book's end (only knowable with the book's length).

### Drift-offs (`matchDrifts` and `driftStrip`)

`matchDrifts(sessions, driftBookmarks)` pairs each "Fell asleep" bookmark
(`isDriftBookmark`, from the bookmarks loaded so far) with the session it ended: the
same book, made between 2 minutes before and 15 minutes after the session's end, and
within 5 minutes (content) of its end position. The closest in time wins; each session
gets at most one.

`driftStrip(bookmark, records, now)` decides what the strip offers. When this device
still holds the drift record for that book (`useDriftRecords`, the sleep timer's
`audiosilo.driftOffs`, kept 36 h and spent the next time the book plays) and it is
the same stop (within 60 s), `driftOffer` gives **Jump back N minutes** to the last
touch; the press spends the record with `takeDrift` first, so the player doesn't ask
again. Otherwise the strip offers **Play from where you drifted off**, at the
bookmark. Both jump through `useJumpTo`. See
[Fell asleep](sleep-timer.md#fell-asleep-drift-controllerts) for how the record is
made.

## Bookmarks and Notes

`AnnotationsTab` merges the servers' lists by `created_at`, then filters:
`filterBookmarks(rows, label, query)` keeps one label (`fell_asleep` by
`isDriftBookmark`, so an older server's markers match too) and the search;
`filterNotes` the search alone. `matchesQuery` wants every word of the query somewhere
in the book's title, its author and the note or body, case-insensitively. Rows are the
shared [`BookmarkRow` / `NoteRow`](annotations.md#rows) with `book` (the cover leads)
and the server flag. The empty states tell apart unsupported (pointing to the
Library), loading, error, "No bookmarks match" and truly empty.

## Export

`useJournalExport(sources)` writes every bookmark and note (not the Diary) of every
server whose list works (`ready` or `error`, never an unsupported one):

1. **Collect** (`collectPages`, pure apart from the injected fetch): the pages the
   Journal already loaded, then the rest a page of 500 at a time, until the list ends
   or `MAX_EXPORT_ROWS` (10,000 per list per server). A repeated cursor or a page with
   nothing new stops it. `preparing` counts the rows gathered for the header's caption.
2. **Rows** (`exportRows`): newest first, each with its server, book, author, position,
   the chapter from chapters **already cached** (`cachedChapterAt`: an export never
   fetches chapters) and the label's name.
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
   `export-save.web.ts` downloads a Blob through a temporary link. On the web, **Copy
   as Markdown** goes through `copyText` and toasts only on a real copy.

`ExportActions` / `exportChoices`: the web gets Copy as Markdown plus a Download menu
(Markdown, CSV); native gets one Export menu (Share as Markdown, Share as CSV); a
narrow header (under 520 px measured) folds everything into the one menu. The actions
are hidden when no server can list annotations and disabled until the lists are ready.
A failed server is named in a toast and left out; a truncated list says so.
