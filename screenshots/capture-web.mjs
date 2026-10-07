// Captures the web-player documentation screenshots against a locally-running
// AudioSilo server in demo mode (run.sh starts it). Three passes:
//   0. tag two seeded series through the admin API (the LibriVox files carry no
//      series tags, so the Library's Series section and a series page would be
//      empty) - needs ADMIN_PASSWORD, which run.sh passes,
//   1. warm a demo session (seek several books to varied positions so Home looks
//      lived-in - same technique as store/tools/login.mjs in the workspace), then
//      give the demo user an Up next queue, a collection, a finished and rated
//      book, labelled bookmarks, pinned notes, a few days of listening history
//      and a sleep-timer drift-off through the API,
//   2. capture desktop, tablet and phone profiles into static/img/screenshots/web-player/.
import {chromium} from 'playwright';
import path from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {CACHE, apiClient, sleep, shoot, step, wanted} from './lib.mjs';

const BASE = process.env.AS_BASE || 'http://127.0.0.1:8790/web/';
const api = apiClient(new URL(BASE).origin);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH = path.join(CACHE, 'auth.json');
// What pass 1 provisioned that pass 2 looks for (the finished book's title).
const FIXTURES = path.join(CACHE, 'web-fixtures.json');

// Series overrides for the seeded books (admin metadata edits: path-keyed, no file
// is touched). Sherlock Holmes takes its canon numbers, so the series page shows the
// gaps (books 1, 2 and 4) the seed doesn't have; Alice is a complete pair.
const SERIES = [
  {author: 'Sir Arthur Conan Doyle', title: 'Adventures of Sherlock Holmes', series: 'Sherlock Holmes', index: '3'},
  {author: 'Sir Arthur Conan Doyle', title: 'Hound of the Baskervilles', series: 'Sherlock Holmes', index: '5'},
  {author: 'Lewis Carroll', title: "Alice's Adventures", series: 'Alice', index: '1'},
  {author: 'Lewis Carroll', title: 'Looking-Glass', series: 'Alice', index: '2'},
];

// The demo user's Up next queue and one collection (title substrings of seeded books).
const QUEUE = ['Christmas Carol', 'Adventures of Sherlock Holmes', 'Art of War'];
const COLLECTION = {
  name: 'Victorian evenings',
  description: 'Fog, firelight and something odd at the door.',
  books: ['Christmas Carol', 'Hound of the Baskervilles', 'Adventures of Sherlock Holmes', 'Looking-Glass'],
};

// The desktop Up next drawer starts closed in every capture context, so the shots
// that aren't about it keep the page's full width; the Up next shot opens it.
const drawerClosed = () => {
  try {
    localStorage.setItem('audiosilo.upNext', JSON.stringify({drawerOpen: false}));
  } catch {
    /* storage blocked: the drawer opens, the shots are just narrower */
  }
};

// Book-title substrings (must exist in the seeded library) + the fraction of
// the book to seek to, so progress bars vary.
const WARM = [
  {q: 'Scarlet Plague', frac: 0.82},
  {q: 'Call of the Wild', frac: 0.18},
  {q: 'Looking-Glass', frac: 0.55},
  {q: 'Baskervilles', frac: 0.4},
  {q: 'Alice', frac: 0.07},
];

// The book page's primary button while the book isn't playing: Start listening (a
// new book), Resume / Resume chapter N (in progress), Listen again (finished); plain
// Listen while the saved progress is still unknown.
const PRIMARY_PLAY = /^(start listening|resume( chapter \d+)?|listen again|listen)$/i;

// The sleep timer's automatic bookmark note (en.json player.sleepTimer.fellAsleepNote).
const FELL_ASLEEP_NOTE = 'Fell asleep';

// The player creates a detached `new Audio()` (not in the DOM); hook the
// constructor so warm-up can find and seek the element.
const audioHook = () => {
  window.__audios = [];
  const OA = window.Audio;
  window.Audio = function (...a) {
    const el = new OA(...a);
    window.__audios.push(el);
    return el;
  };
  window.Audio.prototype = OA.prototype;
  const oce = document.createElement.bind(document);
  document.createElement = function (tag, ...rest) {
    const el = oce(tag, ...rest);
    if (String(tag).toLowerCase() === 'audio') window.__audios.push(el);
    return el;
  };
};

const browser = await chromium.launch();
await mkdir(CACHE, {recursive: true});

// ── Pass 0: series tags ─────────────────────────────────────────────────────
console.log('== provision series ==');
await step('series tags', async () => {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: the series shots will show no series');
  const {token} = await api(null, 'POST', '/auth/login', {username: 'admin', password: ADMIN_PASSWORD});
  try {
    for (const s of SERIES) {
      const list = await api(token, 'GET', `/admin/books?author=${encodeURIComponent(s.author)}&limit=50`);
      const b = (list?.books ?? []).find((x) => `${x.title} ${x.path}`.includes(s.title));
      if (!b) throw new Error(`no seeded book matching "${s.title}"`);
      await api(token, 'PATCH', `/admin/libraries/${b.library_id}/book?path=${encodeURIComponent(b.path)}`, {
        set: {series: s.series, series_index: s.index},
      });
    }
  } finally {
    // Sign this session out again, so it never shows in the admin Devices shot.
    await api(token, 'POST', '/auth/logout').catch(() => {});
  }
  console.log(`  ✓ series: ${SERIES.map((s) => `${s.series} ${s.index}`).join(', ')}`);
});

// ── Pass 1: warm a demo session ─────────────────────────────────────────────
console.log('== warm demo session ==');
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  await ctx.addInitScript(audioHook);
  const page = await ctx.newPage();
  await page.goto(BASE + 'demo', {waitUntil: 'networkidle', timeout: 60000});
  for (let i = 0; i < 30; i++) {
    if ((await page.locator('[role="button"]:has(img)').count().catch(() => 0)) > 0) break;
    await sleep(1000);
  }
  await sleep(1500);

  for (const {q, frac} of WARM) {
    await step(`warm ${q}`, async () => {
      await page.goto(BASE, {waitUntil: 'networkidle'});
      await sleep(1500);
      const card = page.getByText(q, {exact: false}).first();
      if (!(await card.count())) throw new Error('not found');
      await card.click({timeout: 8000});
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(2500);
      const listen = page.getByRole('button', {name: PRIMARY_PLAY}).filter({visible: true}).first();
      if (await listen.count()) await listen.click({timeout: 8000}).catch(() => {});
      await sleep(3500);
      await page.evaluate((f) => {
        const list = window.__audios || [];
        const playing = list.find((a) => !a.paused);
        const longest = list
          .filter((a) => isFinite(a.duration) && a.duration > 0)
          .sort((x, y) => y.duration - x.duration)[0];
        const el = playing || longest || list[list.length - 1];
        if (!el) return;
        const d = isFinite(el.duration) && el.duration > 0 ? el.duration : 3600;
        el.currentTime = Math.max(5, d * f);
      }, frac);
      await sleep(16000); // progress autosaves every 15s while playing
    });
  }
  // Up next and a collection for the demo user, through the API with its own token
  // (the web player keeps it in localStorage under audiosilo.token.<connection id>).
  await step('queue + collection', async () => {
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('audiosilo.token.'));
      return key ? localStorage.getItem(key) : null;
    });
    if (!token) throw new Error('no demo token in localStorage');
    const [lib] = (await api(token, 'GET', '/libraries')).libraries;
    const {books} = await api(token, 'GET', `/libraries/${lib.id}/books?limit=200`);
    const find = (t) => books.find((b) => `${b.title} ${b.rel_path}`.includes(t));
    const ref = (b) => ({library_id: lib.id, path: b.rel_path});
    const queued = QUEUE.map(find).filter(Boolean);
    for (const b of queued) await api(token, 'POST', '/me/queue', ref(b)); // in order
    const {name, description} = COLLECTION;
    const made = await api(token, 'POST', '/me/collections', {name, description});
    const items = COLLECTION.books.map(find).filter(Boolean).map(ref);
    await api(token, 'PUT', `/me/collections/${made.collection.id}/items`, {items});
    console.log(`  ✓ queued ${queued.length}, collection of ${items.length}`);
  });

  // The listener's records for the book page, the Journal and the bookmark editor
  // (capability `annotations`): the most recently played book (the one the shots
  // open first) moved on to 62% with three labelled bookmarks and a pinned note;
  // the warmed book furthest in finished two days ago and rated; a few days of
  // listening history; and a sleep-timer drift-off that ended two minutes ago, so
  // the Diary shows its strip (`matchDrifts`: a fell_asleep bookmark made within 15
  // minutes of a span's end, near its end position).
  await step('annotations + history', async () => {
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('audiosilo.token.'));
      return key ? localStorage.getItem(key) : null;
    });
    if (!token) throw new Error('no demo token in localStorage');
    const info = await api(token, 'GET', '/server');
    if (!info?.capabilities?.annotations) throw new Error('the server has no annotations capability');
    const {progress} = await api(token, 'GET', '/me/progress');
    const started = (progress ?? [])
      .filter((p) => p.duration > 0 && !p.finished)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    if (started.length < 3) throw new Error(`only ${started.length} books in progress`);
    const pathOf = (p) => p.path ?? p.rel_path;
    const q = (p) => `/libraries/${p.library_id}`;
    const at = (p) => `?path=${encodeURIComponent(pathOf(p))}`;
    const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
    const MIN = 60_000;
    const DAY = 24 * 60 * MIN;
    const span = (p, from, to, endedAgo) =>
      api(token, 'POST', `${q(p)}/history${at(p)}`, {
        from_pos: from,
        to_pos: to,
        started_at: iso(endedAgo + (to - from) * 1000),
        ended_at: iso(endedAgo),
      });
    const bookmark = (p, position, note, label) =>
      api(token, 'POST', `${q(p)}/bookmarks${at(p)}`, {position: Math.round(position), note, label});
    const note = (p, position, body) =>
      api(token, 'POST', `${q(p)}/notes${at(p)}`, {body, position: Math.round(position)});

    const [first, drift] = started;
    const finished = started.slice(1).sort((a, b) => b.position / b.duration - a.position / a.duration)[0];
    const d = first.duration;
    // Yesterday evening and this book's last listen, then its place at half way
    // (not in its last chapter: the docked bar's next-chapter jump needs one after).
    await span(first, d * 0.2, d * 0.35, DAY + 2 * 60 * MIN);
    await span(first, d * 0.35, d * 0.5, 50 * MIN);
    await api(token, 'PATCH', `${q(first)}/progress${at(first)}`, {
      position: Math.round(d * 0.5),
      started_at: iso(DAY + 3 * 60 * MIN),
    });
    await bookmark(first, d * 0.1, 'Curiouser and curiouser!', 'quote');
    await bookmark(first, d * 0.22, '', 'relisten');
    await bookmark(first, d * 0.41, 'Who is telling this part?', 'question');
    await note(first, d * 0.3, '**Theory:** none of this is really happening.\n\n- check the last chapter');

    // Finished two days ago, its last stretch in the history, and rated.
    const fd = finished.duration;
    if (finished.position < fd * 0.7) await span(finished, finished.position, fd * 0.7, 2 * DAY + 3 * 60 * MIN);
    await span(finished, fd * 0.7, fd, 2 * DAY + 2 * 60 * MIN);
    // The start goes back too: the server stamped it at the warm-up, and a finish
    // can't come before it.
    await api(token, 'PATCH', `${q(finished)}/progress${at(finished)}`, {
      finished: true,
      started_at: iso(9 * DAY),
      finished_at: iso(2 * DAY + 2 * 60 * MIN),
    });
    await api(token, 'PUT', `${q(finished)}/rating${at(finished)}`, {rating: 4});
    await bookmark(finished, fd * 0.6, 'The best chapter in the book.', 'favourite');
    await note(finished, fd * 0.95, 'Loved the ending.');

    // The drift-off: twenty minutes of listening that ended two minutes ago, where
    // the sleep timer left its Fell asleep bookmark.
    const end = Math.round(drift.position);
    await span(drift, Math.max(0, end - 20 * 60), end, 2 * MIN);
    await bookmark(drift, end, FELL_ASLEEP_NOTE, 'fell_asleep');
    const item = await api(token, 'GET', `${q(finished)}/item${at(finished)}`);
    await writeFile(FIXTURES, JSON.stringify({finishedTitle: item?.title ?? item?.book?.title ?? ''}));
    console.log('  ✓ 5 bookmarks, 2 notes, history, a finished book and a drift-off');
  });

  await ctx.storageState({path: AUTH});
  await ctx.close();
  console.log('  ✓ demo session warmed');
}

// ── Pass 2: captures ────────────────────────────────────────────────────────
// The player shell (redesign 0b): a phone (< 640) has a bottom tab bar, a mini
// player above it and the book page's primary button opens the full-screen player; a tablet (640-1023)
// or desktop (>= 1024) has a top bar and it plays in place, with the docked
// player bar along the bottom (its expand button opens the full player). Moving
// around with the chrome (not page.goto) keeps the book loaded, so the shots
// after it show the mini player / docked bar.
//
// Every visited tab page (and every page further down a stack) stays mounted but
// hidden, so a test id or a button name can match several elements: always act on
// the visible one.
const firstVisible = (locator) => locator.filter({visible: true}).first();
const tid = (page, id) => firstVisible(page.getByTestId(id));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function newProfile(name, viewport, dsf) {
  console.log(`== ${name} (${viewport.width}x${viewport.height}) ==`);
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    storageState: AUTH,
  });
  await ctx.addInitScript(drawerClosed);
  return {ctx, page: await ctx.newPage()};
}

// A Library section in the sub-nav (tablet/desktop), e.g. 'Series'; its radio's name
// carries the count ("Series, 2").
async function librarySection(page, label) {
  await tid(page, 'top-bar-(library)').click({timeout: 8000});
  await sleep(1500);
  await tid(page, 'shell-sub-nav')
    .getByRole('radio', {name: new RegExp(`^${label}\\b`)})
    .click({timeout: 8000});
  await sleep(2500);
}

// A card or tile whose accessible name starts with `name`.
async function openNamed(page, name) {
  await firstVisible(page.getByRole('button', {name: new RegExp(`^${escapeRe(name)}`)})).click({timeout: 8000});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(3000);
}

// Home, open the first Continue listening card's book, and (optionally) shoot it.
async function openFirstBook(page, shot) {
  await page.goto(BASE, {waitUntil: 'networkidle', timeout: 45000});
  await sleep(3000);
  const card = page.locator('[role="button"]:has(img)').first();
  await card.waitFor({state: 'visible', timeout: 20000});
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({timeout: 12000});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(2500);
  if (shot) await shoot(page, shot);
}

// Press the book page's primary button (Resume, Start listening...) and give the book a
// moment to start; returns when it was pressed.
async function listen(page) {
  await firstVisible(page.getByRole('button', {name: PRIMARY_PLAY})).click({timeout: 8000});
  const at = Date.now();
  await sleep(4500);
  return at;
}

// Scroll the page so `locator` (a book page's tab, say) sits near the top of the
// window, with the panel under it in view.
async function scrollToTop(locator) {
  await locator.evaluate((el) => el.scrollIntoView({block: 'start'}));
  await sleep(400);
}

// A short pause for an entrance animation to finish after the state it waits on.
const SETTLE_MS = 600;

// The frontend's jump-undo ignores every jump for its SETTLE_MS (3 s) after a book
// first plays (src/playback/jump-undo.ts); this leaves the load a few seconds on top.
const JUMP_UNDO_READY_MS = 8000;

// Stage a paused, healthy player for the shots: a still frame (no moving playhead,
// no buffering spinner) that reads the same on every run. The play button is named
// Pause while playing, Play once paused (and while still loading, with a spinner,
// before it starts by itself) and Retry after a failure: wait for a settled button.
async function pausePlayback(page) {
  await firstVisible(page.getByRole('button', {name: /^(pause|retry)$/i})).waitFor({timeout: 20000});
  const pause = firstVisible(page.getByRole('button', {name: /^pause$/i}));
  if (await pause.count()) await pause.click({timeout: 8000});
  await firstVisible(page.getByRole('button', {name: /^play$/i})).waitFor({timeout: 8000});
}

// The full player, from the docked bar's expand button (tablet/desktop).
async function expandPlayer(page) {
  await tid(page, 'dock-expand').click({timeout: 8000});
  await tid(page, 'player-menu').waitFor({timeout: 8000});
  await sleep(SETTLE_MS);
}

// The full player's minimise button (top left); done once the shell is back.
async function minimisePlayer(page) {
  await firstVisible(page.getByRole('button', {name: 'Minimise player'})).click({timeout: 8000});
  await tid(page, 'player-menu').waitFor({state: 'hidden', timeout: 8000});
  await sleep(SETTLE_MS);
}

// Back to the shell from whatever a step left on top: a sheet or the end credits
// (their Close), then the full player (Minimise). Steps that open one run this in a
// `finally`, so a step that fails half-way can't leave a root modal over (and the
// shell hidden under it for) every later step.
async function backToShell(page) {
  const close = firstVisible(page.getByRole('button', {name: 'Close', exact: true}));
  if (await close.count()) {
    await close.click({timeout: 8000});
    await close.waitFor({state: 'hidden', timeout: 8000});
  }
  if (await tid(page, 'player-menu').count()) await minimisePlayer(page);
}

// A player sheet from one of the full player's action pills (`player-speed`,
// `player-sleep`), shot and closed again with Escape.
async function sheetShot(page, testId, shot) {
  await tid(page, testId).click({timeout: 8000});
  const sheet = firstVisible(page.getByRole('dialog'));
  await sheet.waitFor({timeout: 8000});
  await sleep(SETTLE_MS);
  await shoot(page, shot);
  await page.keyboard.press('Escape');
  await sheet.waitFor({state: 'hidden', timeout: 8000});
}

// Tablet/desktop: one browsing session with a book playing in the docked bar.
async function captureWide(name, viewport, shots) {
  const {ctx, page} = await newProfile(name, viewport, 2);

  let listenedAt = 0;
  await step('book', async () => {
    await openFirstBook(page, shots.book);
    listenedAt = await listen(page);
  });

  // Home and the pause run whatever SHOTS_ONLY selects, so a partial run stages every
  // later shot as a full run does: the palette and profile menu over Home, the docked
  // bar paused (a still frame). home.png itself is taken while the book plays.
  await step('home', async () => {
    await tid(page, 'top-bar-(home)').click({timeout: 8000});
    await sleep(3000);
    await shoot(page, shots.home);
  });
  await step('pause', () => pausePlayback(page));

  if (wanted(shots.bookBookmarks, shots.bookmarkEditor, shots.bookDetails)) {
    // The playing book's page again (the docked bar's View book details, so the book
    // stays loaded and paused): its Bookmarks tab, the bookmark editor on the Quote
    // (Edit opens it as a dialog on a desktop; Cancel leaves it unchanged), Details.
    await step('book tabs', async () => {
      await expandPlayer(page);
      await tid(page, 'player-menu').click({timeout: 8000});
      await firstVisible(page.getByRole('menuitem', {name: 'View book details'})).click({timeout: 8000});
      await tid(page, 'player-menu').waitFor({state: 'hidden', timeout: 8000});
      await tid(page, 'book-page').waitFor({timeout: 8000});
      await sleep(2000);
      await tid(page, 'book-tab-bookmarks').click({timeout: 8000});
      await firstVisible(page.getByTestId('bookmark-quote')).waitFor({timeout: 8000});
      await sleep(SETTLE_MS);
      await scrollToTop(tid(page, 'book-tab-bookmarks'));
      await page.mouse.move(0, 0);
      await shoot(page, shots.bookBookmarks);
      if (wanted(shots.bookmarkEditor)) {
        const quote = firstVisible(page.locator('[data-testid^="bookmark-row-"]').filter({has: page.getByTestId('bookmark-quote')}));
        await quote.getByTestId('bookmark-edit').click({timeout: 8000});
        const dialog = firstVisible(page.getByRole('dialog'));
        await dialog.waitFor({timeout: 8000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.bookmarkEditor);
        await firstVisible(dialog.getByRole('button', {name: 'Cancel', exact: true})).click({timeout: 8000});
        await dialog.waitFor({state: 'hidden', timeout: 8000});
      }
      if (wanted(shots.bookDetails)) {
        await tid(page, 'book-tab-details').click({timeout: 8000});
        await sleep(1500);
        await scrollToTop(tid(page, 'book-tab-details'));
        await shoot(page, shots.bookDetails);
      }
    });
  }

  if (wanted(shots.bookFinished)) {
    // The finished, rated book's page (Library > Books, by its title).
    await step('finished book', async () => {
      const {finishedTitle} = JSON.parse(await readFile(FIXTURES, 'utf8'));
      if (!finishedTitle) throw new Error('no finished book provisioned');
      await librarySection(page, 'Books');
      await openNamed(page, finishedTitle);
      await firstVisible(page.getByText(/^Finished /)).waitFor({timeout: 8000});
      await sleep(1500);
      await page.mouse.move(0, 0);
      await shoot(page, shots.bookFinished);
    });
  }

  if (wanted(shots.journal, shots.journalBookmarks)) {
    // The Journal from the profile menu: the Diary (today's drift-off strip), then
    // the Bookmarks tab with its label filter.
    await step('journal', async () => {
      await tid(page, 'top-bar-profile').click({timeout: 8000});
      await firstVisible(page.getByRole('menuitem', {name: 'Journal'})).click({timeout: 8000});
      await firstVisible(page.getByTestId('journal-list')).waitFor({timeout: 8000});
      await firstVisible(page.getByText(/^The sleep timer stopped this at /)).waitFor({timeout: 15000});
      await sleep(1500);
      await shoot(page, shots.journal);
      if (wanted(shots.journalBookmarks)) {
        await firstVisible(page.getByRole('radio', {name: /^Bookmarks/})).click({timeout: 8000});
        await firstVisible(page.getByTestId('bookmark-quote')).waitFor({timeout: 15000});
        await sleep(1500);
        await shoot(page, shots.journalBookmarks);
      }
    });
  }

  if (wanted(shots.player)) {
    await step('player', async () => {
      await expandPlayer(page);
      try {
        // The seeded books have no community notes, so the companion column shows its
        // Chapters tab (Who's who would only say there are none).
        await tid(page, 'companion-tab-chapters').click({timeout: 8000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.player);
      } finally {
        await backToShell(page);
      }
    });
  }

  if (wanted(shots.dockUndo)) {
    // A jump of more than a minute (the next chapter, from the docked bar) brings up
    // the Undo chip for ten seconds; the shot is the bar itself.
    await step('dock undo chip', async () => {
      // Only once jump-undo is watching (a partial run gets here sooner than a full one).
      const wait = listenedAt + JUMP_UNDO_READY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const undo = tid(page, 'dock-actions').getByRole('button', {name: /^Back to /});
      await tid(page, 'shell-docked-player')
        .getByRole('button', {name: 'Next chapter', exact: true})
        .click({timeout: 8000});
      await undo.waitFor({timeout: 8000});
      // The chip moves the transport under the pointer: park it off the bar, or the shot
      // shows whichever button slid beneath it hovered.
      await page.mouse.move(0, 0);
      await sleep(SETTLE_MS);
      const box = await tid(page, 'shell-docked-player').boundingBox();
      if (!box) throw new Error('no docked bar');
      await shoot(page, shots.dockUndo, {clip: box});
      // Undo it, so the book is back where the warm-up left it.
      await undo.click({timeout: 5000});
      await undo.waitFor({state: 'hidden', timeout: 8000});
      // Its "Back where you were" toast must not ride into the next shot.
      await firstVisible(page.getByText('Back where you were')).waitFor({state: 'hidden', timeout: 15000});
    });
  }

  if (wanted(shots.credits)) {
    // The end credits, opened early from the full player's menu (the book is paused,
    // so nothing counts down): the year shelf or cover, the stats, Up next.
    await step('end credits', async () => {
      await expandPlayer(page);
      try {
        await tid(page, 'player-menu').click({timeout: 8000});
        await firstVisible(page.getByRole('menuitem', {name: 'View end credits'})).click({timeout: 8000});
        await firstVisible(page.getByRole('button', {name: /^Play .* now$/})).waitFor({timeout: 15000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.credits);
      } finally {
        // Close the credits (or the player, if they never opened) whatever happened.
        await backToShell(page);
      }
    });
  }

  if (wanted(shots.palette)) {
    await step('palette', async () => {
      await tid(page, 'top-bar-search').click({timeout: 8000});
      await sleep(1200);
      await page.keyboard.type('holmes', {delay: 60});
      await sleep(3000);
      await shoot(page, shots.palette);
      await page.keyboard.press('Escape');
      await sleep(1000);
    });
  }

  if (wanted(shots.profile)) {
    await step('profile menu', async () => {
      await tid(page, 'top-bar-profile').click({timeout: 8000});
      await sleep(1500);
      await shoot(page, shots.profile);
      await page.keyboard.press('Escape');
      await sleep(1000);
    });
  }

  if (wanted(shots.library)) {
    // Library > Books, the default section.
    await step('library', async () => {
      await tid(page, 'top-bar-(library)').click({timeout: 8000});
      await sleep(3000);
      await shoot(page, shots.library);
    });
  }

  if (wanted(shots.upNext)) {
    // The drawer beside Library > Books, opened from the top bar (and closed again).
    await step('up next', async () => {
      await tid(page, 'top-bar-(library)').click({timeout: 8000});
      await sleep(1500);
      await tid(page, 'upnext-button-bar').click({timeout: 8000});
      await sleep(3000);
      await shoot(page, shots.upNext);
      await tid(page, 'upnext-button-bar').click({timeout: 8000});
      await sleep(1000);
    });
  }

  if (wanted(shots.librarySeries, shots.series)) {
    await step('series', async () => {
      await librarySection(page, 'Series');
      await shoot(page, shots.librarySeries);
      if (wanted(shots.series)) {
        await openNamed(page, 'Sherlock Holmes');
        await shoot(page, shots.series);
      }
    });
  }

  if (wanted(shots.author)) {
    await step('author', async () => {
      await librarySection(page, 'Authors');
      await openNamed(page, 'Lewis Carroll');
      await shoot(page, shots.author);
    });
  }

  if (wanted(shots.collection)) {
    await step('collection', async () => {
      await librarySection(page, 'Collections');
      await openNamed(page, COLLECTION.name);
      await shoot(page, shots.collection);
    });
  }

  if (wanted(shots.downloads)) {
    // Download one short book first, so the Downloads page has a book ready offline.
    await step('download a book', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, 'The Art of War');
      await firstVisible(page.getByRole('button', {name: /^download( for offline)?$/i})).click({timeout: 8000});
      // Done once the book page's control says Downloaded (its menu holds Remove).
      await firstVisible(page.getByRole('button', {name: /^downloaded$/i})).waitFor({timeout: 120000});
      await sleep(1500);
    });
  }

  for (const [key, testId] of [
    ['settings', 'top-bar-settings'],
    ['downloads', 'top-bar-(offline)'],
  ]) {
    if (!wanted(shots[key])) continue;
    await step(key, async () => {
      await tid(page, testId).click({timeout: 8000});
      await sleep(2500);
      await shoot(page, shots[key]);
    });
  }

  if (wanted(shots.search)) {
    await step('search', async () => {
      await page.goto(BASE + 'search', {waitUntil: 'networkidle', timeout: 45000});
      await sleep(1500);
      const box = page.locator('input').first();
      if (await box.count()) {
        await box.click();
        await box.fill('holmes');
        await sleep(2500);
      }
      await shoot(page, shots.search);
    });
  }

  await ctx.close();
}

// Phone: the primary button opens the full player; closing it leaves the mini player above
// the tab bar, which the Home shot shows.
async function capturePhone(name, viewport, shots) {
  const {ctx, page} = await newProfile(name, viewport, 2);

  await step('book + player', async () => {
    await openFirstBook(page, shots.book);
    await listen(page);
    try {
      await pausePlayback(page);
      await shoot(page, shots.player);
      if (wanted(shots.speedSheet)) await sheetShot(page, 'player-speed', shots.speedSheet);
      if (wanted(shots.sleepSheet)) await sheetShot(page, 'player-sleep', shots.sleepSheet);
    } finally {
      await backToShell(page);
    }
  });

  await step('home', async () => {
    await tid(page, 'tab-bar-(home)').click({timeout: 8000});
    await sleep(3000);
    await shoot(page, shots.home);
  });

  if (wanted(shots.upNext)) {
    // The sheet, from the Up next button beside Home's large title.
    await step('up next sheet', async () => {
      await tid(page, 'upnext-button-header').click({timeout: 8000});
      await sleep(2500);
      await shoot(page, shots.upNext);
    });
  }

  await ctx.close();
}

await captureWide('desktop', {width: 1440, height: 900}, {
  home: 'web-player/home.png',
  book: 'web-player/book-detail.png',
  bookBookmarks: 'web-player/book-bookmarks.png',
  bookmarkEditor: 'web-player/bookmark-editor.png',
  bookDetails: 'web-player/book-details.png',
  bookFinished: 'web-player/book-finished.png',
  journal: 'web-player/journal.png',
  journalBookmarks: 'web-player/journal-bookmarks.png',
  player: 'web-player/player.png',
  dockUndo: 'web-player/dock-undo.png',
  credits: 'web-player/end-credits.png',
  palette: 'web-player/palette.png',
  profile: 'web-player/profile-menu.png',
  library: 'web-player/library.png',
  upNext: 'web-player/up-next.png',
  librarySeries: 'web-player/library-series.png',
  series: 'web-player/series.png',
  author: 'web-player/author.png',
  collection: 'web-player/collection.png',
  search: 'web-player/search.png',
  settings: 'web-player/settings.png',
  downloads: 'web-player/downloads.png',
});

await captureWide('tablet', {width: 834, height: 1112}, {
  home: 'web-player/tablet-home.png',
});

await capturePhone('phone', {width: 430, height: 932}, {
  home: 'web-player/phone-home.png',
  book: 'web-player/phone-book-detail.png',
  player: 'web-player/phone-player.png',
  speedSheet: 'web-player/phone-speed-sheet.png',
  sleepSheet: 'web-player/phone-sleep-sheet.png',
  upNext: 'web-player/phone-up-next.png',
});

// ── Unauthenticated screens ─────────────────────────────────────────────────
console.log('== public screens ==');
await step('connect', async () => {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(BASE + 'connect', {waitUntil: 'networkidle', timeout: 45000});
  await sleep(2500);
  await shoot(page, 'web-player/connect.png');
  await ctx.close();
});

await step('demo', async () => {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(BASE + 'demo', {timeout: 45000});
  await sleep(1500); // catch the demo landing before/while the session provisions
  await shoot(page, 'web-player/demo.png');
  await ctx.close();
});

await browser.close();
console.log('capture-web: done.');
