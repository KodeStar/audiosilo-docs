// The single source of truth for documentation screenshots.
//
// Every entry corresponds to a file under static/img/screenshots/ and every
// doc page embeds images ONLY from this list. capture.mjs generates the real
// captures; placeholders.mjs generates a styled placeholder for anything the
// automated pipeline can't reach (so the docs build never breaks). Add an
// entry here first, then reference it from a page, then run the pipeline.
//
// `capture` says which script produces it:
//   'web'     - capture-web.mjs (web player via a warmed demo session)
//   'admin'   - capture-admin.mjs (admin console + public pages)
//   'meta'    - capture-meta.mjs (the meta.audiosilo.app site via a local metaserve)
//   'manager' - capture-manager.mjs (Wails dev server; falls back to placeholder)

export const SHOTS = [
  // ── Web player (desktop 1440x900, dark) ────────────────────────────────
  {file: 'web-player/home.png', capture: 'web', title: 'Web player - Home', hint: 'Home (Up next drawer hidden): greeting + sync pill, the Now card with its chapter scale, This week (if the server has user_stats), Continue listening and the shelves, docked player bar'},
  {file: 'web-player/library.png', capture: 'web', title: 'Web player - Library', hint: 'Library > Books (the default section): Books / Authors / Series / Narrators / Collections / Folders in the sub-nav with sort + grid/list, the filter chips and the cover grid with progress bars'},
  {file: 'web-player/library-series.png', capture: 'web', title: 'Web player - Library series', hint: 'Library > Series (/library?mode=series): series cards with their mini shelves (the seeded Sherlock Holmes series shows its gaps)'},
  {file: 'web-player/series.png', capture: 'web', title: 'Web player - Series page', hint: 'the Sherlock Holmes series page: hero with the progress track, the bookcase with the book in progress face-out and dashed gaps, the list below'},
  {file: 'web-player/author.png', capture: 'web', title: 'Web player - Author page', hint: "Lewis Carroll's author page: stat tiles, the Alice series shelf, other books"},
  {file: 'web-player/collection.png', capture: 'web', title: 'Web player - Collection', hint: 'the provisioned "Victorian evenings" collection page: name, description, count and length, Edit / Delete (Share hidden on a demo account), its books'},
  {file: 'web-player/up-next.png', capture: 'web', title: 'Web player - Up next', hint: 'the desktop Up next drawer open beside Library > Books: Now playing, three queued books, Continue the series and more'},
  {file: 'web-player/book-detail.png', capture: 'web', title: 'Web player - Book page', hint: 'the book page of the book in progress (provisioned half way, with bookmarks and a note): the cover-tinted hero with its place, Resume and the action row, the Chapters tab with the whole-book timeline and its pins, the aside (About, Your listening)'},
  {file: 'web-player/book-bookmarks.png', capture: 'web', title: 'Web player - Book bookmarks', hint: "the same book's Bookmarks tab (book paused in the docked bar), scrolled to the tabs: Bookmark <time>, See all in your journal, the Quote, Re-listen and Question rows"},
  {file: 'web-player/bookmark-editor.png', capture: 'web', title: 'Web player - Bookmark editor', hint: "the Edit bookmark dialog on the Quote bookmark: the time chip and chapter, the note, the label chips with Quote chosen (closed with Cancel, unchanged)"},
  {file: 'web-player/book-details.png', capture: 'web', title: 'Web player - Book details tab', hint: 'the Details tab of the playing book (downloaded automatically as it plays, so Plays from this device): the notice, the files table (codec, about N kbps, length), the path on the server'},
  {file: 'web-player/book-finished.png', capture: 'web', title: 'Web player - Finished book', hint: 'the page of the provisioned finished book: the Finished <date> badge, the four stars, Listen again'},
  {file: 'web-player/journal.png', capture: 'web', title: 'Web player - Journal', hint: "the Journal's Diary from the profile menu: Today with its 24 hour bar and sessions, the drift-off strip under the provisioned sleep-timer session, earlier days below"},
  {file: 'web-player/journal-bookmarks.png', capture: 'web', title: 'Web player - Journal bookmarks', hint: "the Journal's Bookmarks tab: the export actions, search, the label filter chips and every bookmark across books, newest first"},
  {file: 'web-player/player.png', capture: 'web', title: 'Web player - Now playing', hint: 'the full player on a desktop, opened from the docked bar with the book paused: cover, status line, seek bar and timeline, transport, actions, and the companion column'},
  {file: 'web-player/dock-undo.png', capture: 'web', title: 'Web player - Docked bar with Undo', hint: 'the docked player bar (a strip along the window bottom) just after a next-chapter jump: the Back to <time> chip leading the actions'},
  {file: 'web-player/end-credits.png', capture: 'web', title: 'Web player - End credits', hint: 'the end credits, opened early from the full player menu (book paused): shelf or cover, stats, Up next card'},
  {file: 'web-player/palette.png', capture: 'web', title: 'Web player - Quick search', hint: 'the command palette (top bar search / ⌘K) with "holmes" typed: Books and Series groups'},
  {file: 'web-player/profile-menu.png', capture: 'web', title: 'Web player - Profile menu', hint: "the top bar's profile menu: servers, Add a server, Journal, account, appearance"},
  {file: 'web-player/search.png', capture: 'web', title: 'Web player - Search', hint: 'the Search page with "holmes": grouped Books, and Series as the series card with its mini shelf'},
  {file: 'web-player/settings.png', capture: 'web', title: 'Web player - Settings', hint: 'settings screen (the Journal row, servers, appearance, language, playback)'},
  {file: 'web-player/downloads.png', capture: 'web', title: 'Web player - Downloads', hint: 'the Downloads page with a book downloaded by hand (and the playing one, downloaded automatically): storage by server, Automatic downloads (incl. Keep the next books ready), the browser notice, Ready offline'},
  {file: 'web-player/connect.png', capture: 'web', title: 'Web player - Connect', hint: 'connect/pairing screen with code field'},
  {file: 'web-player/demo.png', capture: 'web', title: 'Web player - Demo mode', hint: 'the /web/demo landing screen'},

  // ── Web player (tablet 834x1112 portrait, dark)
  {file: 'web-player/tablet-home.png', capture: 'web', title: 'Tablet - Home', hint: 'tablet-width Home: top bar with icon destinations and the Up next button, the Now card, docked player bar'},

  // ── Web player (phone 430x932 portrait, dark) - stands in for the mobile app UI
  {file: 'web-player/phone-home.png', capture: 'web', title: 'Phone - Home', hint: 'phone-width Home: large title with the Up next button, the Now card, the tab bar and mini player'},
  {file: 'web-player/phone-up-next.png', capture: 'web', title: 'Phone - Up next', hint: 'phone-width Up next sheet opened from the header button: Now playing and the queue'},
  {file: 'web-player/phone-book-detail.png', capture: 'web', title: 'Phone - Book page', hint: 'phone-width book page: the cover over the title, the place, Resume across the page and the action row'},
  {file: 'web-player/phone-player.png', capture: 'web', title: 'Phone - Now playing', hint: 'phone-width full player, paused: the companion chips under the actions'},
  {file: 'web-player/phone-speed-sheet.png', capture: 'web', title: 'Phone - Speed sheet', hint: 'the speed sheet over the phone player: readout, slider with -/+, presets with time left'},
  {file: 'web-player/phone-sleep-sheet.png', capture: 'web', title: 'Phone - Sleep sheet', hint: 'the sleep timer sheet over the phone player: minute tiles, End of chapter, Or stop after, the sleep settings'},

  // ── Admin console (admin-ui, desktop 1440x900 dark unless noted) + public server pages
  {file: 'admin/login.png', capture: 'admin', title: 'Admin - Sign in', hint: 'the console sign-in page, signed out'},
  {file: 'admin/overview.png', capture: 'admin', title: 'Admin - Overview', hint: 'home: listening now (live sessions), totals, recent listening, books per library, server card'},
  {file: 'admin/palette.png', capture: 'admin', title: 'Admin - Command palette', hint: 'the ⌘K palette open over the overview'},
  {file: 'admin/overview-phone.png', capture: 'admin', title: 'Admin - Phone', hint: 'overview at phone width (400x860) with the bottom tab bar (light)'},
  {file: 'admin/libraries.png', capture: 'admin', title: 'Admin - Libraries', hint: 'Library > Libraries: library cards with covers, status, folder, book count'},
  {file: 'admin/library-add.png', capture: 'admin', title: 'Admin - Add library', hint: 'the Add library dialog with the server folder picker open (Browse)'},
  {file: 'admin/detection.png', capture: 'admin', title: 'Admin - Folder detection', hint: 'a library\'s Folder detection dialog (Automatic / Always one book / Separate books)'},
  {file: 'admin/books.png', capture: 'admin', title: 'Admin - Books', hint: 'Library > Books: Recently added + Continue curating shelves over the cover grid'},
  {file: 'admin/books-table.png', capture: 'admin', title: 'Admin - Books table', hint: 'Library > Books in the Table view (?view=table)'},
  {file: 'admin/book.png', capture: 'admin', title: 'Admin - Book page', hint: 'a book\'s page: hero, Details card with provenance markers (one Edited field)'},
  {file: 'admin/book-match.png', capture: 'admin', title: 'Admin - Match with community metadata', hint: 'the match dialog open on a book page with its possible matches'},
  {file: 'admin/authors.png', capture: 'admin', title: 'Admin - Authors', hint: 'Library > Authors: author tiles with book counts'},
  {file: 'admin/series.png', capture: 'admin', title: 'Admin - Series', hint: 'Library > Series: one card per series with its spines'},
  {file: 'admin/folders.png', capture: 'admin', title: 'Admin - Folders', hint: 'Library > Folders: the folder tree and the selected folder\'s detection choice'},
  {file: 'admin/palette-search.png', capture: 'admin', title: 'Admin - Palette search', hint: 'the ⌘K palette searching books, authors and series for "alice"'},
  {file: 'admin/people.png', capture: 'admin', title: 'Admin - People', hint: 'People > People: person cards with what each is listening to and their devices'},
  {file: 'admin/person.png', capture: 'admin', title: 'Admin - Person', hint: 'sam\'s page, Access tab (?tab=access)'},
  {file: 'admin/person-listening.png', capture: 'admin', title: 'Admin - Person listening', hint: 'maya\'s page, Listening tab: her listening year, In progress, Finished, Recent sessions (1440x1100)'},
  {file: 'admin/devices.png', capture: 'admin', title: 'Admin - Devices', hint: 'People > Devices: every signed-in device with its app, last seen and address, and Sign out'},
  {file: 'admin/invite.png', capture: 'admin', title: 'Admin - Invite ready', hint: 'the invite card dialog after Invite someone: QR code, link, code'},
  {file: 'admin/invites.png', capture: 'admin', title: 'Admin - Invites', hint: 'People > Invites: the invite table'},
  {file: 'admin/shares.png', capture: 'admin', title: 'Admin - Shares', hint: 'People > Shares: list + the selected share\'s folders and people'},
  {file: 'admin/settings.png', capture: 'admin', title: 'Admin - Settings', hint: 'Server > Settings > General: the topic list, This server (a named server) and the Updates card'},
  {file: 'admin/settings-network.png', capture: 'admin', title: 'Admin - Network & HTTPS', hint: 'Server > Settings ?topic=network: the HTTPS mode cards, certificate status and the Network card (1440x1100)'},
  {file: 'admin/system.png', capture: 'admin', title: 'Admin - System', hint: 'Health > System: tools, community metadata, certificate, database, backups, each library\'s disk, web player, version (1440x1100)'},
  {file: 'admin/about.png', capture: 'admin', title: 'Admin - About', hint: 'Server > About: the update card (a real GitHub answer) and the server facts'},
  {file: 'admin/logs.png', capture: 'admin', title: 'Admin - Logs', hint: 'Server > Logs: level filter, search, live tail and the log panel'},
  {file: 'admin/settings-backups.png', capture: 'admin', title: 'Admin - Backups', hint: 'Server > Settings ?topic=backups: what a backup holds, the Schedule card, and the list with a scheduled and a manual backup (1440x1240)'},
  {file: 'admin/backup-restore.png', capture: 'admin', title: 'Admin - Restore a backup', hint: 'the Restore this backup? dialog with the word typed, never confirmed (1440x1240)'},
  {file: 'admin/settings-notifications.png', capture: 'admin', title: 'Admin - Notifications', hint: 'Server > Settings ?topic=notifications: a webhook (last sent) and an ntfy topic (last attempt failed), and the What to send matrix (1440x1240)'},
  {file: 'admin/bell.png', capture: 'admin', title: 'Admin - Notifications bell', hint: 'the top bar bell open over the overview: new books and sign-ins'},
  {file: 'admin/audit.png', capture: 'admin', title: 'Admin - Audit log', hint: 'Server > Audit log: the filters and the provisioning\'s admin changes, newest first'},
  {file: 'admin/health-issues.png', capture: 'admin', title: 'Admin - Library health', hint: 'Health > Issues: category cards over the "Files that couldn\'t be read" list (a provisioned Inbox library supplies the issues)'},
  {file: 'admin/health-duplicates.png', capture: 'admin', title: 'Admin - Likely duplicates', hint: 'Health > Issues ?issue=duplicate: a group\'s two copies side by side'},
  {file: 'admin/health-jobs.png', capture: 'admin', title: 'Admin - Jobs', hint: 'Health > Jobs: running now, schedules, and the history with the newest scan\'s log open (1440x980)'},
  {file: 'admin/library-edit.png', capture: 'admin', title: 'Admin - Edit library', hint: 'the Edit library dialog: folder, Scan automatically (daily) + Time, Skip these files and folders'},
  {file: 'admin/activity.png', capture: 'admin', title: 'Admin - Activity', hint: 'Activity > Overview (30 days): stat tiles, listening hours per day, the year and hour x weekday heatmaps (1440x1240)'},
  {file: 'admin/activity-live.png', capture: 'admin', title: 'Admin - Live now', hint: 'Activity > Live now: two devices playing (one transcoding) and one paused'},
  {file: 'admin/activity-sessions.png', capture: 'admin', title: 'Admin - Sessions', hint: 'Activity > Sessions: the session table, newest first'},
  {file: 'admin/activity-year.png', capture: 'admin', title: 'Admin - Year in listening', hint: 'Activity > Year in listening: this year\'s story and calendar (1440x1100)'},
  {file: 'server/connect-page.png', capture: 'admin', title: 'Connect page', hint: 'public connect page (auth-code box / QR)'},
  {file: 'server/setup-wizard.png', capture: 'admin', title: 'Setup wizard', hint: 'first-run --setup wizard page'},

  // ── AudioSilo Meta site (meta.audiosilo.app; desktop 1440x900, dark) ────
  {file: 'meta/home.png', capture: 'meta', title: 'Meta - Home', hint: 'search hero, live stats band, latest additions grid'},
  {file: 'meta/search.png', capture: 'meta', title: 'Meta - Search', hint: 'search dropdown with grouped work/person/series results'},
  {file: 'meta/work.png', capture: 'meta', title: 'Meta - Work detail', hint: 'a work page with its cover, metadata and multiple recordings'},
  {file: 'meta/characters.png', capture: 'meta', title: 'Meta - Characters', hint: 'the community characters section, one card opened'},
  {file: 'meta/series.png', capture: 'meta', title: 'Meta - Series', hint: 'a series page listing its ordered volumes'},
  {file: 'meta/series-watching.png', capture: 'meta', title: 'Meta - Series (watched)', hint: 'a watched series page: the Watching toggle, "I have this" marks, release dates'},
  {file: 'meta/watching.png', capture: 'meta', title: 'Meta - Watching', hint: 'the /watching page: available + preorder entries with New badges'},
  {file: 'meta/contribute.png', capture: 'meta', title: 'Meta - Contribute', hint: 'the coverage browser (what still needs characters/recaps)'},
  {file: 'meta/import.png', capture: 'meta', title: 'Meta - Import', hint: 'the in-browser library-export diff results'},
  {file: 'meta/languages.png', capture: 'meta', title: 'Meta - Languages', hint: 'the header Languages selector open: every catalogue language with its book count'},
  {file: 'meta/language-prompt.png', capture: 'meta', title: 'Meta - Language suggestion', hint: 'a German browser with nothing stored: "Show only Deutsch audiobooks?" under the header'},
  {file: 'meta/language-search.png', capture: 'meta', title: 'Meta - Search (language filter)', hint: 'the search panel with "Only Deutsch" chosen: the filter line and Search all languages'},

  // ── Desktop manager (Wails) ─────────────────────────────────────────────
  {file: 'manager/servers.png', capture: 'manager', title: 'Manager - Servers', hint: 'server list home'},
  {file: 'manager/server-detail.png', capture: 'manager', title: 'Manager - Server detail', hint: 'a connected server with its libraries'},
  {file: 'manager/add-server.png', capture: 'manager', title: 'Manager - Add server', hint: 'add/connect server form'},
  {file: 'manager/local-server.png', capture: 'manager', title: 'Manager - Local server', hint: 'create/run a local server panel'},
  {file: 'manager/library.png', capture: 'manager', title: 'Manager - Library browser', hint: 'library file browser'},
  {file: 'manager/import.png', capture: 'manager', title: 'Manager - Import', hint: 'import/organize books view'},
  {file: 'manager/transfers.png', capture: 'manager', title: 'Manager - Transfers', hint: 'transfer queue/settings'},
  {file: 'manager/audible.png', capture: 'manager', title: 'Manager - Audible backup', hint: 'Audible library backup view'},
  {file: 'manager/settings.png', capture: 'manager', title: 'Manager - Settings', hint: 'manager settings form'},
];
