---
title: The book page
description: "The book page module map (src/components/book/): the measured layout, the hero and its primary action, the action row, the tabs (Chapters with the whole-book timeline, Details, the community tabs), the aside, and how a chapter row or a pin starts the book."
---

The book page is `/book/[libraryId]?connection=&path=&tab=`. The route file
(`src/app/(app)/(home,library,search,offline,me)/book/[libraryId].tsx`) only names
`BookScreen`; everything lives in `src/components/book/`, with its rules in two pure,
tested modules (`book-page-model.ts`, `book-details-model.ts`) so the components only
draw. The user-facing tour is [A book's page](/users/listening/book-page).

## Module map

| File | What it is |
|---|---|
| `book-page.tsx` | `BookScreen` (wraps the page in `ContentScope`, so it reads the route's own `?connection=`) and `BookPage`: the data (`useBook`, `useChapters`, `useBookMeta`, `useBookProgress`, `useBookAnnotations`, the history query), the tab switch, and the layout |
| `book-page-model.ts` | Pure: `bookPageLayout`, `titleScale`, `primaryAction` / `primaryLabel`, `chapterList`, `currentRow`, `rowsHolding`, `timelineStarts`, `placeLine`, `heroEyebrow`, `bookFacts`, `listenedSeconds`, `startedAt`, `formatRecordDate` |
| `book-hero.tsx` | `BookHero`: the `CoverWash`, crumbs slot, eyebrow, title, byline, facts, the place (or the finished badge and the stars), then the actions and footer slots |
| `hero-actions.tsx` | `HeroActions`: the primary button, `DownloadControl`, the Up next menu, favourite, Add to collection, and `BookActionsMenu` with `omit` |
| `book-crumbs.tsx` | `BookCrumbs`: the library, each folder above the book (links), the book's own folder or file name |
| `book-chapters-tab.tsx` | `BookChaptersTab`: "The whole book" (`BookTimeline` + legend + axis) and the rows |
| `book-details-tab.tsx` + `book-details-model.ts` | `BookDetailsTab`: the playback notice, the files table, the path; `fileRows`, `averageKbps`, `visibleFiles`, `playbackMode` |
| `book-aside.tsx` | `BookAside`: About (`BookMetaAbout`), Other versions (`BookVersions`), Your listening |
| `book-notice.tsx` | `BookNotice`: the icon + title + body notice (the parts notice, the Details notice) |
| `book-skeleton.tsx` | The loading layout |
| `use-play-at.ts` | `usePlayAt`: `play()` for the primary, `playAt(jump)` for rows, timeline taps and pins |
| `use-book-rating.ts` | `useBookRating`: the hero's stars (capability `ratings`) |

The tabs' list stays in `src/components/library/book-tabs.ts`, and the per-tab
sections it hosts stay where they were: `BookmarksSection`, `NotesSection` and
`HistorySection` in `src/components/library/` (built from the shared rows in
[`src/components/annotations/`](annotations.md)), and the community blocks in
`book-meta.tsx`.

## Layout by the measured width

`bookPageLayout(useLayout(), width)` reads the page's **measured** width (the root
`ScrollView`'s `onLayout`), because the desktop Up next drawer takes 300-480 px and can
leave a desktop page phone-narrow. Before the first measure it trusts the window class.

| Measured width | Hero | Body |
|---|---|---|
| phone class, or under 600 (`HERO_SIDE_MIN`) | cover above the text (`min(230, 64%)`), title `sm` | one column: aside, then tabs |
| 600 and up | cover beside the text, 220 (300 from 1100), title `md` (`lg` from 1100) | one column under 900 |
| 900 and up (`BODY_COLUMNS_MIN`) | as above | tabs, with the aside as a right-hand column (300, or 340 from 1200) |

`roomy` (600 and up) adds the chapter rows' start time and the files table's columns.
`titleScale` steps the title down once past 48 characters. The tab panel renders inside
the page's own `ScrollView`, never a nested vertical scroller.

## The hero

- **Wash:** `CoverWash` from the book's `cover_color` (a neutral wash from
  `mutedForeground` without one); text never sits on raw cover colour.
- **Eyebrow** (`heroEyebrow`): "Series · Book N" (a link through `useOpen().openSeries`),
  else "library · server".
- **Byline:** author and narrator as links (`openAuthor` / `openNarrator`); the narrator
  is plain text where `browse_people` is `false`.
- **Facts** (`bookFacts`): length, chapters or "N parts of M min", the audio (codec,
  "N FORMAT files" or the format, size), the published year and the community's
  publisher, and "server › library". A fact the book doesn't have is left out.
- **The place** of a book loaded or in progress: `percentHeard`, `placeLine` ("Chapter
  23 of 81" / "Part 3 of 12"; nothing for files), `useBookTimeLeft` and the progress
  bar, the page's one pink thing. A finished book (and not loaded) gets the
  `finished_at` badge instead and, with `ratings`, `RatingStars` through
  `useBookRating`, which waits (`ready: false`) until the saved rating is known and
  sends its note back with the new value, since a `PUT` replaces the whole rating.

## The primary action and the action row

`primaryAction({ status, loaded, live, chapter })`: **Pause** while this book is loaded
and its transport live; **Resume chapter N** (or **Resume**) when it is loaded or in
progress, N being the real chapter the place is in (only for a `chapters` list of more
than one); **Listen again** once finished; **Start listening** for a new book; plain
**Listen** while the saved progress is still unknown (`progressQuery.isPending`).

`usePlayAt` gives the page its two ways to play:

- `play()` is THE play path, `usePlayBook` with `{ toggle: true }`: a loaded book
  toggles in place (it never restarts), a phone opens the full player, a tablet or
  desktop plays under the docked bar.
- `playAt(jump)` (a chapter row, a timeline tap, a step key): on a phone it pushes
  `/player` with `position` or `track` (the route applies the jump once, also to the
  loaded book); on a tablet or desktop it seeks the loaded book (`seekBook`, or
  `goToTrack` for a file of unknown length, then plays) or starts this one there
  (`playBook(..., position, track)`). A `Jump` is `{ position?, track? }`.

Both reject when the book can't start, and the page toasts
`library.bookActions.playFailed`.

`HeroActions` lays the row out: the primary, then `DownloadControl` (its full hero
form: an outline button per state, "N% · Cancel" with a `ProgressRing`, **Downloaded**
as a menu with the size and Remove download, Retry download), the Up next menu
(capability `queue`: Play next adds at position 0 with an Undo that puts it back where
it was; Add to the end / Remove from Up next through `useQueueActions`), favourite
(ink, never pink), Add to collection (`collections`), and `BookActionsMenu` with
`omit={['play', 'queue', 'collect', 'download']}` (left: Mark as finished / not
finished, More in this series), shown only when it has an item. On a phone
(`stacked`) the primary takes its own row and the menu opens as a sheet. The footer
holds `DownloadProgress` and `TranscodeNote`.

## The tabs

`bookTabs(input)` (`src/components/library/book-tabs.ts`, pure and tested) decides
which tabs exist, in this order:

| Tab | Shown when |
|---|---|
| `chapters` (labelled *Chapters*, *Parts* or *Files*) | the list has rows, or the chapters are still loading |
| `recaps` | the work has recaps, a *visible* whole-book summary, **or** earlier books in its series |
| `characters` | the work has characters, **or** earlier books in its series |
| `bookmarks`, `history`, `notes` | always (user-creatable, so reachable from empty) |
| `series` | at least one non-empty series rail |
| `details` | always |

The selected tab is held as an **intent** (`useState`, seeded by `parseBookTab(?tab=)`),
and render falls back to the first existing tab (`tabs.includes(tab) ? tab : tabs[0]`),
so a tab that disappears when data settles never renders blank. Labels come from
`TAB_LABEL_KEY`, which reuses the section strings
(`library.{bookmarks,history,notes}.title`, `book.meta.characters`,
`book.details.title`). Counts show where the data is already in hand, never fetched
for a count: the list's rows, `useBookAnnotations`' bookmarks and notes
(`ANNOTATIONS_STALE_MS`, 60 s, since every write invalidates them anyway), and the
characters met (`splitCharacters(...).visible`).

A summary counts as *visible* only when it will actually render (`summaryIsVisible`:
an `in_short`, or an `ending` on a finished book); the page computes it once and passes
it to both `bookTabs` and `BookMetaRecapsTab`, so the tab and its panel can't disagree.
The spoiler reveal (`showSpoilers`) is held by the page, shared by Recaps and
Characters; the gate is `listeningProgressFor` over the corrected chapter starts and
`useListeningPosition` (see
[Spoiler gating](state-and-data.md#spoiler-gating-srccomponentslibrarymeta-gatingts)).

### The Chapters tab

`chapterList` builds the rows in the units the player navigates (`book-queue`):

- the real chapters at their **corrected** whole-book starts (`chapterStartsOf`,
  recomputed from the file durations, because the server's `book_offset` is unreliable
  for some books);
- for one long file with no real chapters (none, or a lone whole-book one), the
  player's own parts (`synthesizeChapters` at the listener's `virtualChapterInterval`),
  with a `BookNotice` saying why;
- else the files, each jumping by `track` (a file after one of unknown length has a
  `NaN` start, and `timelineStarts` then gives the timeline nothing).

"The whole book" is the player's `BookTimeline` for **any** book, with pins from
`useBookAnnotations` (`pinsOf`). While the book is loaded its place follows the player
(`timelinePosition(selectBookPosition)`) and a tap or drag `seekBook`s; otherwise it
draws the saved place and a tap goes through `playAt`. `scrubTarget` keeps a tap from
landing in the last 30 s. A row is memoised on its few values (state, bookmark glyph
from `rowsHolding`), so a moving place redraws only the rows that change.

### The Details tab

- `playbackMode({ downloaded, transcoded })`: `local` for a download on this device,
  `converted` when `useNeedsWebTranscode` says the web player converts it (the same
  rule playback uses; web only), else `direct`.
- `fileRows(book, chapterData)`: the chapters response's files, else the item's, else
  the book as one file; the codec is the book's (one probe per book); "about N kbps"
  is `averageKbps(size, duration)` = size × 8 / duration, rounded, or nothing when
  either is unknown. `visibleFiles` folds past `FILES_SHOWN` (6).
- The path: "library/" + `rel_path`, `selectable`, with the note that progress is keyed
  on it.

## The aside

`BookAside` stacks three cards (a right-hand column from 900 px, else between the hero
and the tabs):

- **About** - `BookMetaAbout` (`book-meta.tsx`). `aboutText(meta, description)` picks
  the community's `community_description` (CC BY-SA, so the server's `attribution` is
  rendered beside it with **Improve this**, opening `attribution.source_url` or the
  work's `web_url`), else the server's `description` (from `/item` only), else the
  work's core description; with none, the page's `fallback` sentence naming the author
  and narrator. The detail rows are the recording's publisher and release date (else the
  book's `published`), the work's first publication, and abridged yes/no when the
  recording says. A matched book without community text keeps "View on AudioSilo Meta".
- **Other versions** - `BookVersions`: every other copy (`useBookCopies`) with where it
  lives and its quality, each opening that copy's page; nothing when there is none.
- **Your listening** - the figures the records hold, never estimated: listened time
  summed from this book's history spans (`listenedSeconds`, shown from a minute), the
  book's speed (`useBookSpeed`), started (`progress.started_at`, else the earliest
  span: `startedAt`) and finished (`finished_at`). Only for a started or finished book;
  the history is only fetched then.
