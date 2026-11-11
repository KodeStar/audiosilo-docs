---
title: The Journal
description: "The Journal (src/components/journal/): one paged list per server merged newest first, history spans joined into sessions and days, the 24 hour bar, matching drift-offs to sessions, the Bookmarks and Notes tabs, and the Markdown and CSV export."
---

The Journal is the You hub's Journal section,
`/you?section=journal&tab=diary|bookmarks|notes`. It covers **every signed-in server**.
Each list is read per server, through that server's own connection and capability, and
the lists are merged. The user-facing page is [The Journal](/users/listening/journal).

- `openJournal(tab?)` in `src/lib/open.ts` opens it. It is also on `useOpen`, which
  builds `youHref('journal', tab)` from `src/lib/paths.ts`.
- `parseJournalTab` in `journal-model.ts` reads the tab. Anything unknown is the Diary.
- The hub renders `JournalScreen`. On a phone it passes `embedded`, because the hub's
  large title already says "Journal"; the export and the tabs stay. See
  [You, Settings and Account](you-and-settings.md#the-hub-and-its-routes).
- The older `/journal?tab=` route (`journal.tsx` under
  `(home,library,search,offline,me)`) still renders `JournalScreen` for links made
  before the hub.

**Entry points:**

- the hub's Journal segment (the phone's Me tab, You in the top bar);
- a **Journal** item in the top bar's profile menu;
- **Journal** in the palette's Go to group (`buildGoToItems`);
- `JournalLink` on a book's Bookmarks and Notes tabs. It goes through `openJournal`, so
  from over the full player it lands in the shell;
- Your listening's "See them in your Journal";
- a Diary row's cover, which opens a book on its History tab.

## Module map

| File | What it is |
|---|---|
| `journal-screen.tsx` | `JournalScreen`: header (title, export, the segmented tabs, the search box), `DiaryTab` |
| `journal-model.ts` | Pure: `parseJournalTab`, the search (`searchWords`, `matchesWords`, `annotationHaystack`) |
| `use-journal-sources.ts` | `useJournalSources`: every server's three lists as `Source` snapshots |
| `merge-model.ts` | Pure: `mergeNewestFirst`, `overallStatus`, `unreadSources`, `Sourced<T>` |
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
infinite queries. `useInfiniteQueries` (`src/lib/use-infinite-queries.ts`) fills the gap.
It gives each entry its own `InfiniteQueryObserver`, kept by query hash while the list of
servers changes, and read through `useSyncExternalStore`.

`useJournalSources` runs it once per list over every signed-in server. It turns each
result into a `Source` (status, rows, `supported`, `hasNextPage`, `fetchNextPage`,
`refetch`). A server's query never waits on another's, and a removed server's queries go
with it. `keepFirstPage` trims a released list.

- **History** has no gate: every server has
  [`GET /me/history`](../server/api/reference.md#get-apiv1mehistory). Without
  `annotations` its rows carry no `book`, so a session row reads the item itself
  (`useBook`, cached per book).
- **Bookmarks and notes** need `annotations`, read from each server's `/server`
  (`serverInfoQuery`). Until the flag is known to be on, the query has no function at
  all (`skipToken`).
  - A server reading `false` is `unsupported`.
  - A server whose `/server` failed is an `error`, never an endless load. Its Retry asks
    `/server` again too.
  - A server whose `/server` is held for the network with no answer kept is still
    `loading`, and its source is `waiting`.
- **Notes wait for their tab.** The Diary shows none, so `useJournalSources({ notes })`
  holds them back until the Notes tab is first opened. Held back means `enabled: false`:
  the cache is read and nothing is fetched. Until then the tab's count shows only what
  an earlier visit left in the cache. The export asks for notes on its own.

### Merging (`mergeNewestFirst`)

Each server's rows arrive newest first, a page at a time. The merge sorts them
together by time. Ties go by connection order, then by the server's own order.

The merge then **cuts the list at the boundary**. A server with more pages has only
spoken for rows down to its oldest loaded one. Anything older, from any server, could
still have a newer neighbour on that server's next page. The cut is the newest such
frontier. The servers sitting on it are `fetchFrom`: the ones asked for their next page
when the list's end is reached (`fetchMoreOf`). A server still loading, failed or unable
to list is left out of the boundary, so one slow or broken server never holds the others
back.

`overallStatus` gives the page one state:

| State | When |
|---|---|
| `loading` | nothing has answered |
| `error` | every able server failed |
| `unsupported` | no server can list |
| `ready` | otherwise |

`unreadSources` says when the page shows the offline state in place of its skeleton or
its error. It gives `overallStatus` and each loading source's `waiting` to
[`offlineState`](state-and-data.md#offline-states-srcliboffline-statets). The Diary
and both list tabs check it before their skeleton.

The tab counts (`completeCount`) show only once every able server's list is complete.

## The Diary

The sessions are `src/lib/listening-sessions.ts`, pure and shared with the book page's
History tab, so the two agree. A history row never carries a speed or a device, so
neither is ever shown.

1. **Spans** (`toSpan`): a row with its server, parsed wall-clock `start`/`end` and the
   whole-book `from`/`to`; a row whose times don't parse is dropped.
2. **Sessions** (`groupSessions`): the server writes a span per pause. The spans are
   walked in time order across every book and server. A span joins the session before
   it when it continues the very span before it: the same book and server, a pause under
   `SESSION_GAP_MS` (10 min), and picking up within 120 s (content) of where it stopped.
   Another book in between ends the session. A session carries the whole stretch's
   fields, `listened` (the spans' sum, without the pauses) and its parts.
3. **Waiting listens** (`waitingSessions`, `diary-model.ts`): this device's listen
   events still in the [outbox](offline.md#listening-sync-the-outbox), from every
   connection (`useWaitingListens` in `src/playback/use-listening-sync.ts`, kept
   current as the outbox changes), become sessions of their own with `waiting` set.
   Only the servers the Diary lists take part. They are grouped among themselves,
   never into a server's session, since a session is one server's record. One the
   server's rows already hold (the same book, `from` and `to` within 2 s, started
   within 5 minutes, since the server corrects the device's clock) is left out, so a
   listen whose answer is on the way never shows twice. The server's sessions are
   grouped only when its rows change; an outbox change regroups only the waiting ones.
4. **Days** (`groupByDay`, `diary-model.ts`): sessions are grouped by the device's local
   day they started on, newest first, with the day's total. A session past midnight
   stays on its start day. `useDayLabel` names the days as of `useToday`: Today,
   Yesterday, a weekday within the last week, else the date.
5. **The day bar** (`dayBars`): every span of the day is placed by wall clock as a
   fraction of the day, cut at midnight and at least `MIN_BAR_WIDTH` wide. Hairlines
   mark 06, 12 and 18. `barColor` colours each span with the book's cover accent or
   dominant colour, whichever stands off the theme's track best. When neither reaches
   3:1, or the book has no cover colours, it uses a theme token. The bar is one image to
   a screen reader, with a summary of the sessions' times.
6. **Rows** show:
   - the book's `RowCover`, which opens its History tab;
   - "title · 21:12, 21 min", followed by "· Waiting to sync" for a waiting session;
   - the chapter range (`spanRange` through `useChapterNamer`, else positions);
   - `ServerFlag` when there's more than one server;
   - the drift strip;
   - "Finished the book" when a span ended within 30 s (content) of the book's end. This
     is only knowable with the book's length.

### Drift-offs (`matchDrifts` and `driftStrip`)

`matchDrifts(sessions, driftBookmarks)` pairs each "Fell asleep" bookmark
(`isDriftBookmark`, from the bookmarks loaded so far) with the session it ended: the
same book, made between 2 minutes before and 15 minutes after the session's end, and
within 5 minutes (content) of its end position. The closest in time wins; each session
gets at most one.

`driftStrip(bookmark, records, now)` decides what the strip offers. Both offers jump
through `useJumpTo`.

- **Jump back N minutes**, to the last touch. `driftOffer` gives it when this device
  still holds the sleep timer's
  [drift record](sleep-timer.md#fell-asleep-drift-controllerts) for that book
  (`useDriftRecords`, read once) and it is the same stop (within 60 s). The press spends
  the record with `takeDrift` first, so the player doesn't ask again. The strip then
  forgets the records it was handed, so a second press offers the bookmark instead of
  rewinding the listener again.
- **Play from where you drifted off**, at the bookmark, in every other case.

## Bookmarks and Notes

`AnnotationsTab` reads only the active list. It merges the servers' lists by
`created_at` (`mergeNewestFirst`), then filters:

- **Label chips**, on Bookmarks only (`labelKeeps`). A chip keeps one label.
  `fell_asleep` matches by `isDriftBookmark`, so an older server's markers match too.
- **Search**, on both tabs. It follows the typing deferred (`useDeferredValue`). It
  wants every word of the query somewhere in the book's title, its author and the note
  or body, ignoring case and accents (`searchWords`, and `annotationHaystack`, which is
  folded once per row).

Rows are the shared [`BookmarkRow` / `NoteRow`](annotations.md#rows) with `book` (the
cover leads) and the server flag, in one card whose foot is the list's footer. The empty
states tell apart unsupported (pointing to the Library), offline, loading, error, "No bookmarks
match" and truly empty.

## Export

`useJournalExport(sources)` writes every bookmark and note, but not the Diary. It covers
both lists of every server known to list them, at once. A server must read
`supported === true`, so an older server is never asked for a route it lacks.

1. **Collect** (`collectPages`, pure apart from the injected fetch): first the pages the
   Journal already loaded, then the rest a page of 500 at a time. It stops when the list
   ends, at `MAX_EXPORT_ROWS` (10,000 per list per server), or on a repeated cursor or a
   page with nothing new. `preparing` counts the rows gathered for the header's caption.
2. **Rows** (`exportRows`): newest first. Each row has its server, book, author,
   position, chapter and the label's name. The chapter comes from chapters **already
   cached** (`cachedChapterAt`, one namer per book for the run), because an export never
   fetches chapters.
3. **Format** (`export-format.ts`, pure). Every word comes in translated, as
   `ExportWords`.
   - `toMarkdown` groups by book. Books are in order of their newest row, and entries
     by position. Each entry is `**12:41:07** · Bookmark · Quote · chapter ·
     2026-10-05 21:12`, with the text indented under it.
   - `toCsv` writes a UTF-8 BOM, a header and CRLF lines, quoting per RFC 4180. Against
     CSV injection, it prefixes with an apostrophe any field that starts with `=`, `+`,
     `-`, `@`, tab or CR.
   - The Server column, and the server under a Markdown heading, appear only when the
     rows span more than one server.
   - `localStamp` writes the device's time as `YYYY-MM-DD HH:MM`.
4. **Hand over**: `exportFileName` names the file (`journal-YYYY-MM-DD.md` or `.csv`),
   then `saveExport` saves it. `saveExport` is split by platform:
   - `export-save.ts` (native) writes the file to the cache directory and opens the
     share sheet (`expo-sharing`, with the MIME type and UTI). Where files can't be
     shared, it falls back to sharing the text.
   - `export-save.web.ts` downloads a Blob through a temporary link (`downloadBlob`,
     `src/lib/download-blob.ts`, shared with the Year in listening share).
   - On the web, **Copy as Markdown** goes through `copyText` and toasts only on a real
     copy.

`ExportActions` and `exportChoices` lay out the actions:

- The web gets Copy as Markdown plus a Download menu (Markdown, CSV).
- Native gets one Export menu (Share as Markdown, Share as CSV).
- A narrow header (under 520 px measured) folds everything into the one menu.

While an export gathers, the trigger spins and a caption counts the rows. The gathering
ends once the rows are in, before the share sheet comes up. A second export waits until
the first is over. The actions are hidden when no server can list annotations, and
disabled until the lists are ready. A failed server is named in a toast and left out. A
truncated list says so.
