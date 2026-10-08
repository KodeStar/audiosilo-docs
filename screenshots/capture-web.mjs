// Captures the web-player documentation screenshots against a locally-running
// AudioSilo server in demo mode (run.sh starts it). Three passes:
//   0. tag two seeded series through the admin API (the LibriVox files carry no
//      series tags, so the Library's Series section and a series page would be
//      empty) - needs ADMIN_PASSWORD, which run.sh passes,
//   1. warm a demo session (seek several books to varied positions so Home looks
//      lived-in - same technique as store/tools/login.mjs in the workspace), then
//      give the demo user an Up next queue, a collection and each WARM book's
//      records (a place, a finish and rating, bookmarks, notes, history, a
//      sleep-timer drift-off) through the API,
//   2. capture desktop, tablet and phone profiles into static/img/screenshots/web-player/.
import {chromium} from 'playwright';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  CACHE,
  DAY,
  HOUR,
  MIN,
  apiClient,
  firstVisible,
  isoAgo,
  pathQuery,
  shoot,
  sleep,
  step,
  tid,
  wanted,
} from './lib.mjs';

const BASE = process.env.AS_BASE || 'http://127.0.0.1:8790/web/';
const api = apiClient(new URL(BASE).origin);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH = path.join(CACHE, 'auth.json');

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

// The warmed books, oldest first (the last is the most recently played, the first
// Continue listening card the shots open): a title substring of a seeded book (the
// whole title from its start where a capture opens it by name), the fraction of its
// first file to seek to so progress bars vary, and the listener's records the shots
// show (fractions are of the whole book, times are before the run):
// - `place`: the saved place and the start date (half way, not in the last chapter:
//   the docked bar's next-chapter jump needs one after it);
// - `finished`: finished and rated (the start moves back too: a finish can't come
//   before it);
// - `history`: listening spans; `bookmarks` and `notes`;
// - `drift`: the sleep timer's drift-off, a span ending at the saved place with a
//   `fell_asleep` bookmark there, timed so the Journal's Diary pairs them
//   (the frontend's `matchDrifts`).
const WARM = [
  {
    q: 'The Scarlet Plague',
    frac: 0.82,
    finished: {startedAgo: 9 * DAY, finishedAgo: 2 * DAY + 2 * HOUR, rating: 4},
    history: [
      {from: 0.3, to: 0.7, endedAgo: 2 * DAY + 3 * HOUR},
      {from: 0.7, to: 1, endedAgo: 2 * DAY + 2 * HOUR},
    ],
    bookmarks: [{at: 0.6, note: 'The best chapter in the book.', label: 'favourite'}],
    notes: [{at: 0.95, body: 'Loved the ending.'}],
  },
  {q: 'Call of the Wild', frac: 0.18},
  {q: 'Looking-Glass', frac: 0.55},
  // The warm-up leaves this one about six minutes in (40% of its first file), so the
  // drift-off span before the saved place fits there.
  {q: 'Baskervilles', frac: 0.4, drift: {minutes: 5, endedAgo: 2 * MIN}},
  {
    q: 'Alice',
    frac: 0.07,
    place: {at: 0.5, startedAgo: DAY + 3 * HOUR},
    history: [
      {from: 0.2, to: 0.35, endedAgo: DAY + 2 * HOUR},
      {from: 0.35, to: 0.5, endedAgo: 50 * MIN},
    ],
    bookmarks: [
      {at: 0.1, note: 'Curiouser and curiouser!', label: 'quote'},
      {at: 0.22, label: 'relisten'},
      {at: 0.41, note: 'Who is telling this part?', label: 'question'},
    ],
    notes: [{at: 0.3, body: '**Theory:** none of this is really happening.\n\n- check the last chapter'}],
  },
];

// The finished book's page is captured by its title.
const FINISHED_TITLE = WARM.find((w) => w.finished).q;

// The book page's primary button while the book isn't playing: Start listening (a
// new book), Resume / Resume chapter N (in progress), Listen again (finished); plain
// Listen while the saved progress is still unknown.
const PRIMARY_PLAY = /^(start listening|resume( chapter \d+)?|listen again|listen)$/i;

// The sleep timer's automatic bookmark note: the frontend's
// src/i18n/locales/en.json `player.sleepTimer.fellAsleepNote` (run.sh's FRONTEND can be
// a bare web export, so it isn't read from there).
const FELL_ASLEEP_NOTE = 'Fell asleep';

// The demo user's token (the web player keeps it in localStorage under
// audiosilo.token.<connection id>), for provisioning through the API.
async function demoToken(page) {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('audiosilo.token.'));
    return key ? localStorage.getItem(key) : null;
  });
  if (!token) throw new Error('no demo token in localStorage');
  return token;
}

// The seeded library and a finder for its books by title substring.
async function seededBooks(token) {
  const [lib] = (await api(token, 'GET', '/libraries')).libraries;
  const {books} = await api(token, 'GET', `/libraries/${lib.id}/books?limit=200`);
  const find = (t) => books.find((b) => `${b.title} ${b.rel_path}`.includes(t));
  return {lib, find};
}

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

// ── A year of listening ─────────────────────────────────────────────────────
// Listening stats come from listening sessions, which the server only derives from
// progress saves as they happen (a device's listened time can't run faster than the
// server's clock), so a fresh demo user has a minute of listening and the You shots
// would be bare. seedListeningYear writes a year of sessions for the demo user straight
// into the capture server's own database (run.sh's .cache/data, a throwaway copy),
// marked token_id -1, and unseedListeningYear removes them once the web captures are
// done, so the admin console's Activity shots (captured afterwards) only show the
// listeners they provision. Deterministic (a fixed seed), so a re-run draws the same
// charts. Needs the sqlite3 CLI on PATH; without it the step fails and the shots show
// only the warm-up's listening.
const DB = path.join(CACHE, 'data', 'audiosilo.db');
const SEEDED_TOKEN = -1;
// The books the year is spread over, most listened first (title substrings).
const YEAR_BOOKS = [
  "Alice's Adventures",
  'Adventures of Sherlock Holmes',
  'Hound of the Baskervilles',
  'Call of the Wild',
  'Looking-Glass',
  'Christmas Carol',
  'Art of War',
];

function sqlite(sql) {
  if (!existsSync(DB)) throw new Error(`no capture database at ${DB}`);
  return execFileSync('sqlite3', [DB], {input: `.timeout 15000\n${sql}\n`, encoding: 'utf8'});
}

function seedListeningYear(userId, libraryId, books) {
  if (!books.length) throw new Error('no seeded books to listen to');
  let state = 20261008;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const rows = [];
  const now = Date.now();
  // Every day of the last year but today (the warm-up's own listening is today's): most
  // days some listening, the odd quiet spell, more at weekends; evenings the busiest hour,
  // a commute in the morning on weekdays. The last ten days all have some, so the streak
  // is running.
  for (let back = 364; back >= 1; back--) {
    const day = new Date(now - back * DAY);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const recent = back <= 10;
    if (!recent && rand() < (back % 47 < 6 ? 0.85 : 0.18)) continue; // quiet spells, days off
    const slots = weekend ? [[10, 2], [21, 1.5]] : [[7.5, 0.6], [21.5, 1]];
    for (const [i, [hour, spread]] of slots.entries()) {
      if (rand() < 0.3 && !(recent && i === slots.length - 1)) continue;
      const minutes = Math.round(15 + rand() * (weekend ? 85 : 50));
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const at = start.getTime() + (hour + (rand() - 0.5) * 2 * spread) * HOUR;
      // A book for a few weeks at a time, so the top lists have a clear order.
      const pick = Math.min(books.length - 1, Math.floor(((back / 30) % books.length) * rand() * 1.2));
      const b = books[pick];
      const startPos = Math.round(rand() * 1800);
      const listened = minutes * 60;
      rows.push(
        `(${userId}, ${libraryId}, ${q(b.rel_path)}, ${SEEDED_TOKEN}, 'Pixel 9', 'AudioSilo', '1.3.0', 'android', ` +
          `${q(new Date(at).toISOString())}, ${q(new Date(at + listened * 1000).toISOString())}, ` +
          `${startPos}, ${startPos + listened}, ${Math.max(b.duration ?? 0, startPos + listened)}, 1, ${listened})`,
      );
    }
  }
  sqlite(
    'BEGIN;\n' +
      'INSERT INTO listening_sessions (user_id, library_id, rel_path, token_id, device_name, client_app, ' +
      'client_version, client_platform, started_at, last_at, start_pos, end_pos, duration, speed, listened) VALUES\n' +
      rows.join(',\n') +
      ';\nCOMMIT;',
  );
  console.log(`  ✓ a year of listening: ${rows.length} sessions`);
}

function unseedListeningYear() {
  sqlite(`DELETE FROM listening_sessions WHERE token_id = ${SEEDED_TOKEN};`);
  console.log('  ✓ the seeded year removed again');
}

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
      const listen = firstVisible(page.getByRole('button', {name: PRIMARY_PLAY}));
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
  // Up next and a collection for the demo user, through the API with its own token.
  await step('queue + collection', async () => {
    const token = await demoToken(page);
    const {lib, find} = await seededBooks(token);
    const ref = (b) => ({library_id: lib.id, path: b.rel_path});
    const queued = QUEUE.map(find).filter(Boolean);
    for (const b of queued) await api(token, 'POST', '/me/queue', ref(b)); // in order
    const {name, description} = COLLECTION;
    const made = await api(token, 'POST', '/me/collections', {name, description});
    const items = COLLECTION.books.map(find).filter(Boolean).map(ref);
    await api(token, 'PUT', `/me/collections/${made.collection.id}/items`, {items});
    console.log(`  ✓ queued ${queued.length}, collection of ${items.length}`);
  });

  // Each WARM book's records (capability `annotations` for labels and the lists).
  await step('listener records', async () => {
    // Reload first: the warm-up's last book is still playing, and its next autosave
    // (a newer PUT, last write wins) would overwrite the place set below. A reload
    // stops it without a pause, so it records no span either (as between warm-ups).
    await page.goto(BASE, {waitUntil: 'networkidle'});
    const token = await demoToken(page);
    const info = await api(token, 'GET', '/server');
    if (!info?.capabilities?.annotations) throw new Error('the server has no annotations capability');
    const {lib, find} = await seededBooks(token);
    let made = 0;
    for (const w of WARM) {
      const b = find(w.q);
      if (!b) throw new Error(`no seeded book matching "${w.q}"`);
      const at = pathQuery(b.rel_path);
      const book = (what) => `/libraries/${lib.id}/${what}${at}`;
      const d = b.duration;
      const span = (from, to, endedAgo) =>
        api(token, 'POST', book('history'), {
          from_pos: from,
          to_pos: to,
          started_at: isoAgo(endedAgo + (to - from) * 1000),
          ended_at: isoAgo(endedAgo),
        });
      const bookmark = (position, note, label) =>
        api(token, 'POST', book('bookmarks'), {position: Math.round(position), note, label});
      for (const h of w.history ?? []) await span(d * h.from, d * h.to, h.endedAgo);
      if (w.place) {
        await api(token, 'PATCH', book('progress'), {
          position: Math.round(d * w.place.at),
          started_at: isoAgo(w.place.startedAgo),
        });
      }
      if (w.finished) {
        await api(token, 'PATCH', book('progress'), {
          finished: true,
          started_at: isoAgo(w.finished.startedAgo),
          finished_at: isoAgo(w.finished.finishedAgo),
        });
        await api(token, 'PUT', book('rating'), {rating: w.finished.rating});
      }
      for (const m of w.bookmarks ?? []) await bookmark(d * m.at, m.note ?? '', m.label);
      for (const n of w.notes ?? []) {
        await api(token, 'POST', book('notes'), {body: n.body, position: Math.round(d * n.at)});
      }
      if (w.drift) {
        const {progress} = await api(token, 'GET', book('progress'));
        const end = Math.round(progress.position);
        await span(Math.max(0, end - w.drift.minutes * 60), end, w.drift.endedAgo);
        await bookmark(end, FELL_ASLEEP_NOTE, 'fell_asleep');
      }
      made += (w.bookmarks?.length ?? 0) + (w.notes?.length ?? 0) + (w.drift ? 1 : 0);
    }
    console.log(`  ✓ ${made} bookmarks and notes, history, a finished book and a drift-off`);
  });

  // A year of listening for You (Your listening, Year in listening) and Home's This
  // week: see seedListeningYear.
  await step('listening year', async () => {
    const token = await demoToken(page);
    const me = await api(token, 'GET', '/me');
    const {lib, find} = await seededBooks(token);
    seedListeningYear(me.id, lib.id, YEAR_BOOKS.map(find).filter(Boolean));
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
// Every visited page stays mounted but hidden: act through `firstVisible` / `tid`.
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
  await tid(page, 'book-page').waitFor({timeout: 15000});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(SETTLE_MS);
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
  await sleep(SETTLE_MS);
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
    // The playing book's page again (the full player's View book details, so the book
    // stays loaded and paused): its Bookmarks tab, the bookmark editor on the Quote
    // (Edit opens it as a dialog on a desktop; Cancel leaves it unchanged), and, once
    // the book is downloaded here, Details.
    await step('book tabs', async () => {
      await expandPlayer(page);
      await tid(page, 'player-menu').click({timeout: 8000});
      await firstVisible(page.getByRole('menuitem', {name: 'View book details'})).click({timeout: 8000});
      await tid(page, 'player-menu').waitFor({state: 'hidden', timeout: 8000});
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
        try {
          await dialog.waitFor({timeout: 8000});
          await sleep(SETTLE_MS);
          await shoot(page, shots.bookmarkEditor);
        } finally {
          // Cancel whatever happened, so a failed shot can't leave the dialog over
          // every later step.
          const cancel = firstVisible(dialog.getByRole('button', {name: 'Cancel', exact: true}));
          if (await cancel.count()) await cancel.click({timeout: 8000});
          await dialog.waitFor({state: 'hidden', timeout: 8000});
        }
      }
      if (wanted(shots.bookDetails)) {
        // Download it here unless it already is (the default automatic download may
        // have kept it as it played), so Details says Plays from this device.
        const download = firstVisible(page.getByRole('button', {name: /^download( for offline)?$/i}));
        if (await download.count()) await download.click({timeout: 8000});
        await firstVisible(page.getByRole('button', {name: /^downloaded$/i})).waitFor({timeout: 120000});
        await tid(page, 'book-tab-details').click({timeout: 8000});
        await tid(page, 'book-playback-local').waitFor({timeout: 8000});
        await scrollToTop(tid(page, 'book-tab-details'));
        await shoot(page, shots.bookDetails);
      }
    });
  }

  if (wanted(shots.bookFinished)) {
    // The finished, rated book's page (Library > Books, by its title).
    await step('finished book', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, FINISHED_TITLE);
      await firstVisible(page.getByText(/^Finished /)).waitFor({timeout: 8000});
      await sleep(SETTLE_MS);
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
      await sleep(SETTLE_MS);
      await shoot(page, shots.journal);
      if (wanted(shots.journalBookmarks)) {
        await firstVisible(page.getByRole('radio', {name: /^Bookmarks/})).click({timeout: 8000});
        await firstVisible(page.getByTestId('bookmark-quote')).waitFor({timeout: 15000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.journalBookmarks);
      }
    });
  }

  if (wanted(shots.bookBookmarks, shots.bookmarkEditor, shots.bookDetails, shots.bookFinished, shots.journal, shots.journalBookmarks)) {
    // Back to Home, where the pause left a partial run, so the palette and profile
    // menu are shot over Home on every run.
    await step('back home', async () => {
      await tid(page, 'top-bar-(home)').click({timeout: 8000});
      // The Home tab still has the playing book's page pushed (View book details):
      // back out of it to Home's root.
      for (let i = 0; i < 3; i++) {
        const back = firstVisible(page.getByRole('button', {name: /^back$/i}));
        if (!(await back.count())) break;
        await back.click({timeout: 8000});
        await sleep(SETTLE_MS);
      }
      await sleep(3000);
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
    });
  }

  if (wanted(shots.youStats, shots.year)) {
    // You in the top bar: Your listening (Stats), then Year in listening. The context
    // reduces motion, so the story stays on its first card (a still frame).
    await step('you', async () => {
      await tid(page, 'top-bar-(me)').click({timeout: 8000});
      // The Me tab keeps its section: the Journal shot left it on the Journal.
      await tid(page, 'shell-sub-nav').getByRole('radio', {name: /^Stats/}).click({timeout: 8000});
      await tid(page, 'you-hub-stats').waitFor({timeout: 8000});
      await firstVisible(page.getByText(/^(Listening calendar|No listening yet)$/)).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, shots.youStats);
      if (wanted(shots.year)) {
        await tid(page, 'shell-sub-nav')
          .getByRole('radio', {name: /^Year in listening/})
          .click({timeout: 8000});
        await tid(page, 'year-section').waitFor({timeout: 8000});
        await firstVisible(page.getByText(/^(Share this card|Not much of a story yet)$/)).waitFor({timeout: 15000});
        await sleep(1500); // the stage's covers
        await page.mouse.move(0, 0);
        await shoot(page, shots.year);
      }
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

  if (wanted(shots.youStats, shots.settings)) {
    // The Me tab (the You hub): Stats, then its Settings section.
    await step('me tab', async () => {
      await tid(page, 'tab-bar-(me)').click({timeout: 8000});
      await tid(page, 'you-hub-stats').waitFor({timeout: 8000});
      await firstVisible(page.getByText(/^(This week|No listening yet)$/)).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await shoot(page, shots.youStats);
      if (wanted(shots.settings)) {
        await firstVisible(page.getByRole('radio', {name: 'Settings', exact: true})).click({timeout: 8000});
        await tid(page, 'settings-content').waitFor({timeout: 8000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.settings);
      }
      // Back to Stats, so a later visit to the tab starts where a fresh run does.
      await firstVisible(page.getByRole('radio', {name: 'Stats', exact: true})).click({timeout: 8000}).catch(() => {});
    });
  }

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
  youStats: 'web-player/you-stats.png',
  year: 'web-player/year.png',
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
  youStats: 'web-player/phone-you-stats.png',
  settings: 'web-player/phone-settings.png',
});

// ── Unauthenticated screens ─────────────────────────────────────────────────
console.log('== public screens ==');
// The connect flow on a fresh browser: the start screen with the probe card, then a
// first connection (the admin, by username and password: a real account, so the
// account page has its Password card and API keys) to "Your library is ready.", then
// the account page from the profile menu. That player session is signed out again at
// the end, so it never shows in the admin Devices shot.
await step('connect', async () => {
  const ctx = await browser.newContext({
    viewport: {width: 1440, height: 900},
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(drawerClosed);
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + 'connect', {waitUntil: 'networkidle', timeout: 45000});
    await tid(page, 'connect-start').waitFor({timeout: 15000});
    await firstVisible(page.getByRole('textbox', {name: 'Server address'})).fill(new URL(BASE).origin);
    await firstVisible(page.getByRole('button', {name: 'Continue', exact: true})).click({timeout: 8000});
    await tid(page, 'probe-notice').waitFor({timeout: 15000});
    await sleep(SETTLE_MS);
    await page.mouse.move(0, 0);
    await shoot(page, 'web-player/connect.png');
    if (!wanted('web-player/connect-ready.png', 'web-player/account.png')) return;
    if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: no first connection to show');

    await firstVisible(page.getByRole('button', {name: /^Sign in to /})).click({timeout: 8000});
    await tid(page, 'sign-in-step').waitFor({timeout: 8000});
    await firstVisible(page.getByRole('radio', {name: 'Username and password'})).click({timeout: 8000});
    await firstVisible(page.getByLabel('Username', {exact: true})).fill('admin');
    await firstVisible(page.getByLabel('Password', {exact: true})).fill(ADMIN_PASSWORD);
    await firstVisible(page.getByRole('button', {name: 'Sign in', exact: true})).click({timeout: 8000});
    await tid(page, 'ready-screen').waitFor({timeout: 15000});
    await firstVisible(page.getByRole('button', {name: 'Start listening'})).waitFor({timeout: 8000});
    await sleep(3000); // the library sentence and the shelf
    await shoot(page, 'web-player/connect-ready.png');

    if (wanted('web-player/account.png')) {
      await firstVisible(page.getByRole('button', {name: 'Start listening'})).click({timeout: 8000});
      await tid(page, 'top-bar-profile').click({timeout: 15000});
      await firstVisible(page.getByRole('menuitem', {name: /^Account on /})).click({timeout: 8000});
      await firstVisible(page.getByText('Signed-in devices')).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, 'web-player/account.png');
    }
  } finally {
    // Sign the admin's player session out again, whatever happened above.
    const token = await demoToken(page).catch(() => null);
    if (token) await api(token, 'POST', '/auth/logout').catch(() => {});
    await ctx.close();
  }
});

await step('demo', async () => {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(BASE + 'demo', {timeout: 45000});
  await sleep(1500); // catch the demo landing before/while the session provisions
  await shoot(page, 'web-player/demo.png');
  await ctx.close();
});

await step('remove the seeded year', unseedListeningYear);

await browser.close();
console.log('capture-web: done.');
