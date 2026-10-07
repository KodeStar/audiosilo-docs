---
title: Bookmarks and notes
description: "The shared annotation modules (src/components/annotations/): the rows, the label chips, the editor requests and what Save sends, the Fell asleep marker, jumping, delete with Undo, and the annotations capability gates."
---

`src/components/annotations/` holds everything a bookmark or a note looks like and
does, shared by the book page's tabs, the player's companion and the
[Journal](journal.md). The pure modules (`labels`, `drift-marker`, `editor-model`)
have no React; the rest are components and hooks. `index.ts` exports only what outside
callers use. The user-facing page is [Bookmarks and notes](/users/listening/bookmarks-and-notes).

## Module map

| File | What it is |
|---|---|
| `editor-model.ts` | Pure: `initialBookmarkDraft`, `bookmarkSave`, `noteSave`, `BOOKMARK_NOTE_MAX`, `NOTE_BODY_MAX` (the [server's bounds](../server/api/reference.md#get-apiv1librariesidbookmarks--post-apiv1librariesidbookmarks), which the inputs enforce with `maxLength`) |
| `annotation-editor.tsx` | `AnnotationEditorSheet` (the `PlayerSheet` the host renders) and `AnnotationEditor`: the bookmark and note forms in one `EditorFrame`, saved through one `runPlan` |
| `labels.ts` | Pure: `labelText` (a key's name through `t()`), `toggleLabel` |
| `drift-marker.ts` | Pure: `isDriftBookmark`, `isFellAsleepNote`, `shownNote` |
| `chips.tsx` | `TimeChip` (the jump), `LabelChip` (the kicker, a moon for a drift marker), `LabelPicker` (single-select chips) |
| `annotation-row.tsx` | `AnnotationRow`: the one row of a bookmark or a note (`kind`), its chip or cover, meta line, Edit and Delete |
| `bookmark-row.tsx`, `note-row.tsx` | `BookmarkRow`, `NoteRow`: `AnnotationRow` with the label kicker and the note, or the markdown body |
| `row-parts.tsx` | `AnnotationRowFrame`, `RowAction`, `RowCover`, `ServerFlag`, `RowMeta` |
| `annotation-section.tsx` | `AnnotationSection`: one book's bookmarks or notes (`kind`), the add action, the journal link and the states |
| `section-actions.tsx` | `AddBookmarkAction`, `AddNoteAction`, `JournalLink` |
| `use-annotation-actions.ts` | `useJumpTo`, `useDeleteWithUndo` |
| `use-book-place.ts` | `chapterNamer` / `useChapterNamer`, `usePlaceIn` |

Outside the folder: the editor's request types (`AnnotationTarget`, `EditorRequest`,
`editBookmarkRequest`, `editNoteRequest`, `AnnotationKind`) live in
`src/lib/annotation-request.ts`, so the player's sheet store and these components can
both use them without importing each other; `byPosition` (book order, ties by id) is
`src/lib/by-position.ts`; the touch targets are `src/components/ui/touch-target.ts`
(`touchTarget`, `slopTo44`); `BookmarksSection` and `NotesSection`
(`src/components/library/`) are `AnnotationSection` with its `kind`.

The label keys themselves live in `src/api/bookmark-labels.ts`
(`PICKABLE_BOOKMARK_LABELS`, `FELL_ASLEEP_LABEL`, `isBookmarkLabel`), so the sleep
timer can import them without the UI.

## Labels

A label is a **machine key** on the wire, never display text: `quote`, `favourite`,
`relisten`, `funny`, `question` (the five a listener picks, in picker order) and
`fell_asleep` (the sleep timer's, never offered). The server checks only the
[shape](../server/api/reference.md#get-apiv1librariesidbookmarks--post-apiv1librariesidbookmarks),
so a newer client may store a key this player
doesn't know: `isBookmarkLabel` guards every read, `labelText` names a known key and
returns null for anything else (no chip), and an unknown key in an edit draft is kept
as it is so an untouched label is never sent back. `toggleLabel(current, picked)`
makes the picker one label or none: tapping the chosen one clears it, and picking any
label replaces whatever was there (`fell_asleep` included).

## The editors

An **`EditorRequest`** says what the sheet opens on, and carries its own book, so it
works for a book that isn't playing, on any connection:

```ts
type AnnotationTarget = { connectionId: string; libraryId: number; path: string };
type EditorRequest =
  | { kind: 'bookmark'; target: AnnotationTarget; position: number; bookmark?: Bookmark }
  | { kind: 'note'; target: AnnotationTarget; position: number; note?: Note };
```

Callers open one with `usePlayerSheets.getState().openEditor(request)` (see
[Player sheets](player-ui.md#player-sheets-and-overlays)); the active
`PlayerSheetHost` renders `AnnotationEditorSheet`, a bottom sheet on a phone, a
floating sheet on a tablet and a dialog on a desktop. The form is keyed per request
(`requestKey`), so a new request starts a fresh draft. Without a client for the
target's connection it shows the companion's "server isn't connected" state. The sheet (and a
phone dialog) lifts itself above the software keyboard (`useKeyboardAvoidance`,
`src/lib/keyboard-lift.ts`), capping its height so the title stays on screen and the
body scrolls. The lift is the keyboard's overlap measured from its top edge in screen
coordinates against the window, on both platforms: iOS lays the keyboard over the
window, and so does Android under edge-to-edge (the window no longer resizes), while a
window that does resize reads an overlap of 0, so nothing lifts twice. (A
`KeyboardAvoidingView` inside an overlay in a portal measures nothing useful.)

**What Save sends** is decided by the pure planners, given the connection's
`annotations` flag:

| Planner | Result | When |
|---|---|---|
| `bookmarkSave` | `add` (`useAddBookmark`) | a new bookmark, on every server: `{ position, note }` and the label picked (only a known one); `useAddBookmark` alone decides whether the label reaches the server (only one with `annotations`) |
| | `update` (`useUpdateBookmark`) | an edit on an `annotations` server, sending only what changed: the trimmed `note`, and `label` (`''` clears it) |
| | `unchanged` / `unsupported` | an edit that changes nothing (just close) / an edit without `annotations` (toast `annotations.editUnsupported`) |
| `noteSave` | `add` (`useAddNote`) | a new note at the request's position, on every server (the API always took one) |
| | `update` (`useUpdateNote`) | an edit on an `annotations` server: the body only, so the note keeps its place |
| | `empty` / `unchanged` / `unsupported` | nothing written (Save is disabled; Delete removes a note) / same body / no `annotations` |

Without `annotations` the label picker is hidden and an edit is read-only, its Save
disabled (`EditorFrame`). `runPlan` carries out the table for both editors, and an
update rejected with `CapabilityError`
([gated writes](state-and-data.md#the-listeners-own-state-player-redesign-phase-1b))
counts as unsupported.

## Adding

- **One tap** (`addBookmarkHere`, `src/components/player/player-shortcuts.ts`): the
  player's bookmark pill, the docked bar and the **B** key. It adds at the live place
  and toasts *"Bookmark added"* with an **Add note** action (only with `annotations`,
  read with `cachedCapability`) that opens the editor on the new bookmark.
- **`AddBookmarkAction`** ("Bookmark 17:26:50", the top of a Bookmarks tab): one tap
  through `addBookmarkHere` once its book is the loaded one and the engine has placed
  it (`selectPlacedBookKey`, as its label reads it); otherwise (another book, or the
  loaded one still being placed) it opens the editor at `usePlaceIn(target)`, so the
  listener sees where it lands first.
- **`AddNoteAction`** ("Note at 17:26:50"): always opens the note editor at
  `usePlaceIn(target)`: the live place once the engine has placed the loaded book
  (`selectPlacedBookKey`), else the saved place, else 0. It re-renders every second
  while the book plays, so it lives in its own small leaf.

## Rows

`AnnotationRow` is the one row, for a bookmark or a note (`kind`; `BookmarkRow` and
`NoteRow` fill in the body). It is self-contained: it acts on its own book through its
`connectionId`, so the same row works on a book's page, in the companion and in the
Journal's list across servers. It uses `AnnotationRowFrame` (a hairline above every row
but the first):

- **Lead:** the `TimeChip` (a note's in the `note` tone), or, when `book` is passed (a
  list across books), the book's cover (`RowCover`) opening its page on that tab, with
  the chip moved into the body beside the kicker.
- **Body:** the kicker (a bookmark's `LabelChip`), the note (a Quote in quotation marks
  and italics; a drift marker per `shownNote`) or the note's markdown (one
  `useMarkdown` per note), then `RowMeta`: the title (across books), the chapter
  (`useChapterNamer`) and the age, and the server's name (`ServerFlag`) when a list
  spans servers.
- **Actions:** Edit (`pen`, only with `annotations`) and Delete (`trash`), both quiet
  muted glyphs reaching 44 pt (`touchTarget`: a 44 pt frame on native, a hit slop on
  the web): delete offers Undo rather than
  a confirmation, so a list never turns into a column of red.

**Jumping** (`useJumpTo`) passes `{ at: { position } }` to the app's one play path,
`usePlayBook` ([where it goes](book-page.md#the-primary-action-and-the-action-row));
on a phone that opens the full player even for the playing book. The companion passes
its own `onJump`, which seeks the playing book in place.

**Deleting** is immediate (`useDeleteWithUndo(kind, ...)`), so other devices and the
pins agree at once and nothing waits on a timer an app suspend could stop. The toast's
Undo re-creates the row (the same place, note or body and label, on the same book
through its own connection, through `addBookmark` / `addNote`); the server gives it a
new id and date.

**Chapters** (`chapterNamer`): the book's chapters at offsets recomputed from the file
durations (`chapterStartsOf`, as the book page does), named as the player names them;
a book without chapters names nothing. The placed chapter list is computed once per
chapter list (a `WeakMap`), so every row of one book shares it. `useChapterNamer` reads
the cached `useChapters` on the target's own connection.

## The Fell asleep marker

The sleep timer's bookmark (`drift-controller.ts`; see
[Fell asleep](sleep-timer.md#fell-asleep-drift-controllerts)) is labelled `fell_asleep`
on an `annotations` server; on an older one it can only be told by its note, which
was translated when it was made and stored as text. `isDriftBookmark` therefore
accepts the label, or no label at all with the automatic note in **any** of the six
languages (`isFellAsleepNote`, every supported locale's
`player.sleepTimer.fellAsleepNote` from the i18n resources). A bookmark with another label is the listener's
own, whatever its note says. `shownNote` hides the automatic note, so the row says
"You drifted off around here" in today's language; a note the listener wrote on it
shows instead. The Journal's Fell asleep filter and its Diary strips use the same
predicate.

## Where the capability matters

| Without `annotations` | With it |
|---|---|
| bookmarks and notes add, without a label ([why](state-and-data.md#bookmarks-notes-and-the-journal)) | labels sent and shown |
| no Edit action; an edit's form is read-only | `PATCH /bookmarks/{id}`, `PATCH /notes/{id}` |
| no Add note on the one-tap toast | Add note opens the editor |
| no "See all in your journal" link; the Journal's lists say the server can't list them | `GET /me/bookmarks`, `GET /me/notes` |

The wire side is in the [API reference](../server/api/reference.md#patch-apiv1bookmarksid)
and [State & data](state-and-data.md#bookmarks-notes-and-the-journal).
