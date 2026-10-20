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
| `book-page.tsx` | `BookScreen` (wraps the page in `ContentScope`, so it reads the route's own `?connection=`) and `BookPage`: the data (`useBook`, `useChapters`, `useBookMeta`, `useBookProgress`, `useBookAnnotations`, the history query), the tab row, the play calls, and the layout |
| `book-page-model.ts` | Pure: `bookPageLayout`, `titleScale`, `heroSubtitle`, `primaryAction` / `primaryLabel`, `chapterList`, `rowAt`, `timelineStarts`, `placeLine`, `heroEyebrow`, `bookFacts`, `startedAt`, `listeningFigures` |
| `book-tab-panel.tsx` | `BookTabPanel`: the active tab's panel (the tab row is the page's) |
| `book-hero.tsx` | `BookHero`: the `CoverWash`, crumbs slot, eyebrow, title, subtitle, byline, facts, the place (or the finished badge and the stars), then the actions and footer slots |
| `hero-actions.tsx` | `HeroActions`: the primary button, `DownloadControl`, the Up next menu, favourite, Add to collection, and `BookActionsMenu` with `omit` |
| `book-crumbs.tsx` | `BookCrumbs`: the library, each folder above the book (links), the book's own folder or file name |
| `book-chapters-tab.tsx` | `BookChaptersTab`: "The whole book" (`BookTimeline` + legend + axis) and the rows |
| `book-details-tab.tsx` + `book-details-model.ts` | `BookDetailsTab`: the playback notice, the files table, the path; `fileRows`, `visibleFiles`, `playbackMode`, and the About card's `aboutContent`, `labelGroups` and `languageName` |
| `book-about.tsx` | `BookAbout`: the About card, its genre and tag chips, and `openLabelBooks` |
| `book-aside.tsx` | `BookAside`: `BookAbout`, Other versions (`BookVersions`), Your listening |
| `book-skeleton.tsx` | The loading layout |

Shared pieces it uses from elsewhere: `Notice` (`src/components/ui/notice.tsx`, the icon,
title and body notice with an `info` / `success` / `warning` tone, also the Downloads
page's), `useBookRating` (`src/components/player/use-book-rating.ts`, the hero's stars
and the end credits'), and `usePlayBook` (the one play path, below).

The tabs' list is `src/components/library/book-tabs.ts`, and the per-tab sections
are `BookmarksSection`, `NotesSection` and
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
| 600 and up | cover beside the text: 220 level with the text's top (`heroAlign: 'start'`), title `md`; from 1100, 300 with the text resting on its foot (`'end'`), title `lg` | one column under 828 |
| 828 and up (`BODY_COLUMNS_MIN`) | as above | tabs, with the aside as a right-hand column (300, or 340 from 1200) |

`BODY_COLUMNS_MIN` is computed, not picked: the body's padding on both sides (24 each),
the narrowest tab column worth having (440, a chapter row with its start time and
length), the column gap (40) and the narrowest aside (300). An 834 portrait tablet takes
the two columns.

`roomy` (600 and up) adds the chapter rows' start time and the files table's columns.
`titleScale` steps the title down once past 48 characters. The tab panel renders inside
the page's own `ScrollView`, never a nested vertical scroller.

## The hero

- **Wash:** `CoverWash` from the book's `cover_color` (a neutral wash from
  `mutedForeground` without one); text never sits on raw cover colour.
- **Eyebrow** (`heroEyebrow`): "Series · Book N" (a link through `useOpen().openSeries`),
  else "library · server".
- **Subtitle** (`heroSubtitle`): the server's `subtitle` under the title, unless the
  title already holds it (case aside, "Dune: The Desert Planet" over "The Desert
  Planet"); nothing on an older server.
- **Byline:** author and narrator as links (`openAuthor` / `openNarrator`); the narrator
  is plain text where `browse_people` is `false`.
- **Facts** (`bookFacts`): length, chapters or "N parts of M min", the audio (codec,
  "N FORMAT files" or the format, size), the published year and the publisher (the
  server's `publisher`, else the community recording's), and "server › library". A fact the book doesn't have is left out.
- **The place** of a book loaded or in progress: `percentHeard`, `placeLine` ("Chapter
  23 of 81" / "Part 3 of 12"; nothing for files) on the row `rowAt` finds,
  `useBookTimeLeft` and the progress bar, the page's one pink thing. A finished book (and
  not loaded) gets the finish badge instead (the date from `listeningFigures`) and, with
  `ratings`, `RatingStars` through `useBookRating`, which waits (`ready: false`) until
  the saved rating is known and sends its note back with the new value, since a `PUT`
  replaces the whole rating.

## The primary action and the action row

`primaryAction({ status, loaded, live, chapter })`: **Pause** while this book is loaded
and its transport live; **Resume chapter N** (or **Resume**) when it is loaded or in
progress, N being the real chapter the place is in (only for a `chapters` list of more
than one); **Listen again** once finished; **Start listening** for a new book; plain
**Listen** while the saved progress is still unknown (`progressQuery.isPending`).

Both ways to play go through the app's one play path, `usePlayBook`
(`src/components/player/use-play-book.ts`), whose route is the pure `playRoute`
(`play-route.ts`):

- the primary calls it with `{ toggle: true }`: a loaded book pauses or plays in place
  on every layout (it never restarts);
- a chapter row, a timeline tap or a step key calls it with `{ at: jump }` (a `Jump` is
  a `BookPlace`, `{ position?, track? }`, a track for a file of unknown length): a phone
  opens the full player there (the route applies it once, also to the loaded book),
  unless the player is already on top; a tablet or desktop jumps the loaded book there
  (`seekBook`, or `goToTrack`) and plays on, or starts this book there in place
  (`startBookInPlace`).

It rejects when the book can't start, and the page toasts
`library.bookActions.playFailed`.

`HeroActions` lays the row out after the primary:

| Control | Gate | Notes |
|---|---|---|
| `DownloadControl` | - | an outline button per state: Download for offline, "N% · Cancel" with a `ProgressRing`, **Downloaded** (a menu with the size and Remove download), Retry download; disabled where this device can't keep the book |
| Up next menu | `queue` | Play next (at position 0, with an Undo that puts it back where it was); Add to the end / Remove from Up next (`useQueueActions`) |
| Favourite | - | ink, never pink |
| Add to collection | `collections` | the book menu's dialog |
| `BookActionsMenu` | its items' own | `omit={['play', 'queue', 'collect', 'download']}` leaves Mark as finished / not finished and More in this series; renders nothing when that leaves no item. For an admin whose book has generated characters or recaps it adds **Regenerate characters and recaps** (`extra`), then each active [player module's](state-and-data.md#player-modules-srcmodules) `bookActions` (none yet) |
| Generate characters and recaps | `useGenerate`'s `offer === 'generate'` | an outline button after the others (its own row when stacked), for an admin a Bridge can generate for (below) |

**Generating characters and recaps** (Bridge Phase 1a, `src/components/bridge/`)
is the player's first admin-only UI. `mayGenerate(user, server)`
(`bridge-model.ts`, pure and tested) allows it for an admin who isn't a demo
account, a household member or a kid, on a server whose `capabilities.bridge` and
`capabilities.metadata` are on and whose `bridge.features` holds `sidecars`.
`useGenerate` reads `generateOffer`, the offer rule the console shares (Bridge
Phase 1e; [the table](../bridge/generating.md#who-sees-the-action);
`communityCoverage` says what the community has), and gives the page `offer`
(`generate` or `regenerate`) or, when the community has both, `covered` (a boolean;
`offer` is then `null`). `covered` mounts `GenerateCovered` in the
hero's footer: "The community already has characters and recaps for this book"
with **See characters**, which selects the Characters tab and scrolls the page to
the tabs (`openCharacters`, not animated under reduced motion). `generateOffer`
never gives `covered` without `mayGenerate`, so a listener never sees the line.
No offer shows until the book's `/meta` and its jobs are known (`metaAnswered`: a
failed lookup is no answer), nor while a job shows its status. `GenerateDialog`
reads [`GET /admin/bridge/estimate`](../server/api/reference.md#get-apiv1adminbridgeestimate)
and shows what the run reads, the transcription and the agent cost (for every book
it queues), "On this server" and the earlier books of the series (ticked, queued
first); it blocks the submit when the library isn't writable or, Bridge Phase 1d,
the estimate's `open_job` is a `chapters.detect` job (the book's chapters are still
being found, which the server refuses with `409 detect_open`;
`bridge.generate.detectOpen`) or, Bridge Phase 2b, a `sidecars.contribute` job (the
console's "Share with the community" is filing the book's characters and recaps,
`409 contribute_open`; `bridge.generate.contributeOpen`, kind `SIDECARS_CONTRIBUTE`
in `src/lib/bridge-jobs.ts`), and warns when the agent isn't ready
(`blockedReason`). The console hides its action while either job is open; the
player keeps the button and says why in the dialog, and a `409 detect_open` or
`409 contribute_open` from the queue (a job queued after the estimate) toasts the
same words (`bridgeRefusalKey`). An older server sends neither. It always queues `{source: "auto", contribute: "local"}`
(`GENERATE_PARAMS`): the player never contributes. `GenerateStatus` sits under the
actions while a job is open or failed: the stage (`bridge.stage.*`; Bridge Phase
1d adds `chapter_detecting`, "Finding the chapters in the narration"; the early
chapters save's `writing`/`rescanning` steps, sent with an engine stage before
`ready`, read as that stage, `stageOf`), "12 of 40",
the time left and Cancel; while parked, the park in the player's own words
(`bridge.park.*`, by `parkReason`; `chapters_not_detected` is "The Bridge
couldn't find the chapters in the narration.") and when it tries again by itself, "It carries on by itself" for
a book waiting for an ASR worker (`parkEndsByItself`), else "Open the console to
fix it"; once failed, the error and Try again. `useBridgeJobs` polls the book's jobs
every 10 seconds while one is claimed or running and every minute while one is
parked, only while the surface is focused and the app in the foreground; the
answer that sees a job that wrote the book's files reach `done` (`latestDone`:
`sidecars.generate`, `sidecars.describe` or `chapters.detect`) reads the book's
`/meta`, item and chapters again (`refreshAfterFinish`), so the tabs and any
chapters found in the narration appear. The companion's empty Who's who and
Story so far mount `GenerateOffer`, the same button and status.

When the hero is stacked (under 600 measured), the primary takes its own row and the
rest stay on **one** row: the download control gets `short` ("Download", just "Cancel"
while it runs, its words ending in "..." rather than wrapping), and the menu opens as a
sheet. The footer holds `DownloadProgress`, `GenerateStatus`, `GenerateCovered` (only while
`covered`) and `TranscodeNote`.

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

`BookTabPanel` renders the active tab: `BookChaptersTab` (or five skeleton rows while
the list is empty), the community tabs with their `Attribution` (`communityCredit`:
none for a dimension generated on this server) and a `GeneratedMark` ("Generated on
this server") at the head of a tab whose content came from the server's own files
(the Recaps tab places its chips and credit by `recapMarks`, see
[Enriched book metadata](state-and-data.md#enriched-book-metadata)), `BookmarksSection` /
`NotesSection` (both `AnnotationSection`, see [Bookmarks and notes](annotations.md)),
`HistorySection`, `BookMetaSeriesTab` and `BookDetailsTab`. It also builds the
community cover resolver (`useCommunityCover`) and hands it to the Series, Recaps and
Characters tabs as `coverFor` (see
[Community covers](state-and-data.md#community-covers-clientcommunitycoverurl)).

### The Chapters tab

`chapterList` builds the rows in the units the player navigates (`book-queue`):

- the real chapters at their **corrected** whole-book starts (`chapterStartsOf`,
  recomputed from the file durations, because the server's `book_offset` is unreliable
  for some books);
- for one long file with no real chapters (none, or a lone whole-book one), the
  player's own parts (`synthesizeChapters` at the listener's `virtualChapterInterval`),
  with a `Notice` saying why;
- else the files, each jumping by `track` (a file after one of unknown length has a
  `NaN` start, and `timelineStarts` then gives the timeline nothing).

When the chapters answer says `chapters_source: "community"` (the server fitted a
community recording's chapter list onto the audio; see
[Community chapters](../server/community-chapters.md)) and the rows are real
chapters, the list ends with a quiet caption, a globe icon and "Chapters from the
AudioSilo community database" (`book.chapters.community`, `testID`
`book-chapters-community`). For `chapters_source: "generated"` (Bridge Phase 1d:
a Bridge found them in the narration of a book with no chapters of its own; see
[Generated chapters](../server/community-chapters.md#generated-chapters)) the
same rule gives "Chapters found in the narration on this server" with the
server glyph in the caption's colour (`book.chapters.generated`, `testID`
`book-chapters-generated`; both captions are `SOURCE_CAPTION` entries drawn by `SourceLine`). `BookChaptersTab` takes the
answer's `source` only while the rows are chapters (`list.kind === 'chapters'`).
Nothing else changes: the chapters have the same shape either way.

"The whole book" is the player's `BookTimeline` for **any** book, with pins from
`useBookAnnotations` (`pinsOf`). While the book is loaded its place follows the player
(`timelinePosition(selectBookPosition)`) and a tap or drag `seekBook`s; otherwise it
draws the saved place and a tap jumps through `usePlayBook`; a step key goes to the
next chapter start or back to the start of the current one (`nextSegmentStart`,
`previousSegmentStart`, the transport's own rules). `scrubTarget` keeps a tap from
landing in the last 30 s. The current row is `rowAt(rows, position)` (the page passes
it in; every row counts as heard once the book is finished). A row is memoised on its
few values (its state, and the bookmark glyph: a bookmark inside the book marks the row
`rowAt` puts it in), so a moving place redraws only the rows that change.

### The Details tab

- `playbackMode({ downloaded, transcoded })`: `local` for a download on this device,
  `converted` when `useNeedsWebTranscode` says the web player converts it (the same
  rule playback uses; web only), else `direct`.
- `fileRows(book, chapterData)`: the chapters response's files, else the item's, else
  the book as one file; the codec is the book's (one probe per book); "about N kbps"
  is `bitrateKbps(size, duration)` (`src/lib/format.ts`) = size × 8 / duration / 1000, rounded, or nothing when
  either is unknown. `visibleFiles` folds past `FILES_SHOWN` (6).
- The path: "library/" + `rel_path`, `selectable`, with the note that progress is keyed
  on it.

## The aside

`BookAside` stacks up to four cards (a right-hand column from `BODY_COLUMNS_MIN`, see
[Layout](#layout-by-the-measured-width), else between the hero
and the tabs):

- **About** - `BookAbout` (`book-about.tsx`), drawing the pure `aboutContent(book,
  work, recording, t)`. `work` is the `bookMetaWork` value (the matched work, or an
  unmatched book's generated one) and the one source of every work-level field, the
  credit included; `BookAbout` takes it as a required prop, and `recording` (the
  match's, from `matchedMeta`) gives the recording facts. The text is picked once,
  in this order, into `source` (`AboutSource`): the community's
  `community_description` (`'community'`: CC BY-SA, so the server's `attribution`
  is rendered beside it with **Improve this**, opening `attribution.source_url` or
  the work's `web_url`), else the server's `description` (from `/item` only) or the
  work's core description (`'own'`), else the description a Bridge generated on this
  server (`'generated'`, Bridge Phase 1c: `work.generated_description`, read only
  when `work.generated.description` is set), which wears the "Generated on this
  server" chip (`GeneratedChip`, `testID` `about-generated-mark`) under the eyebrow
  and never the credit or **Improve this**; with none (`'fallback'`), a sentence
  naming the author and narrator. The detail rows are the publisher (the server's
  `publisher`, else the recording's) and release date (the recording's, else the
  book's `published`), the work's first publication, the server's `language` (a code
  named through `Intl.DisplayNames` in the app's language where the platform has it,
  `languageName`; else as sent), and abridged yes/no (the server's `abridged`, else
  the recording's; absent is unknown, so no row). Then `labelGroups`: the book's
  `genres`, then its `tags`, each once by `labelKey`, as chips under their names; a
  chip calls `openLabelBooks`, which selects the book's library in
  `useLibrarySelection` and opens the Library tab's root (`openLibraryRoot`) on
  `libraryBooksHref({ genre | tag })`. A matched book without community text keeps "View on
  AudioSilo Meta". Long text folds past six lines with Show more.
- **Other versions** - `BookVersions`: every other copy (`useBookCopies`) with where it
  lives and its quality, each opening that copy's page; nothing when there is none.
- **Your listening** - `listeningFigures`, the figures the records hold, never
  estimated: listened time from this book's history spans (`listeningSummary`, the end
  credits' rule; shown from a minute), the book's speed (`useBookSpeed`), started
  (`progress.started_at`, else the earliest span: `startedAt`) and finished
  (`finished_at`), dates through `formatRecordDate` (`src/lib/format.ts`), and
  `smartSpeedSaved`, what Smart speed saved on this book on this device
  (`useBookTimeSaved`, shown from a whole second; see
  [time saved](audio-effects.md#time-saved-srcplaybacktime-savedts)). Null for a
  book neither started nor finished; the history is only fetched then, and kept fresh
  for ten minutes (`HISTORY_STALE_MS`: a span this device records refreshes it).
- **In the house** - `InTheHouseCard` (`src/components/house/`), last, only while the
  listener shares and someone who shares is on this book; see
  [Listening in the house](listening-in-the-house.md).
