// Captures the web-player documentation screenshots against a locally-running
// AudioSilo server in demo mode (run.sh starts it). Three passes:
//   0. tag two seeded series through the admin API (the LibriVox files carry no
//      series tags, so the Library's Series section and a series page would be
//      empty) - needs ADMIN_PASSWORD, which run.sh passes,
//   1. warm a demo session (seek several books to varied positions so Home looks
//      lived-in - same technique as store/tools/login.mjs in the workspace), then
//      give the demo user an Up next queue and a collection through the API,
//   2. capture desktop, tablet and phone profiles into static/img/screenshots/web-player/.
import {chromium} from 'playwright';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {CACHE, apiClient, sleep, shoot, step} from './lib.mjs';

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

// Book-title substrings (must exist in the seeded library) + the fraction of
// the book to seek to, so progress bars vary.
const WARM = [
  {q: 'Scarlet Plague', frac: 0.82},
  {q: 'Call of the Wild', frac: 0.18},
  {q: 'Looking-Glass', frac: 0.55},
  {q: 'Baskervilles', frac: 0.4},
  {q: 'Alice', frac: 0.07},
];

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
      const listen = page.getByRole('button', {name: /listen/i}).first();
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

  await ctx.storageState({path: AUTH});
  await ctx.close();
  console.log('  ✓ demo session warmed');
}

// ── Pass 2: captures ────────────────────────────────────────────────────────
// The player shell (redesign 0b): a phone (< 640) has a bottom tab bar, a mini
// player above it and Listen opens the full-screen player; a tablet (640-1023)
// or desktop (>= 1024) has a top bar and Listen plays in place, with the docked
// player bar along the bottom (its expand button opens the full player). Moving
// around with the chrome (not page.goto) keeps the book loaded, so the shots
// after Listen show the mini player / docked bar.
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

async function listen(page) {
  await firstVisible(page.getByRole('button', {name: /^listen$/i})).click({timeout: 8000});
  await sleep(4500);
}

// Stage a paused, healthy player for the shots: a still frame (no moving playhead,
// no buffering spinner) that reads the same on every run. The play button is named
// Pause while playing.
async function pausePlayback(page) {
  const pause = firstVisible(page.getByRole('button', {name: /^pause$/i}));
  if (await pause.count()) await pause.click({timeout: 8000}).catch(() => {});
  await sleep(1500);
}

// The full player's minimise button (top left).
async function minimisePlayer(page) {
  await firstVisible(page.getByRole('button', {name: 'Minimise player'})).click({timeout: 8000});
  await sleep(1500);
}

// A player sheet from one of the full player's action pills (`player-speed`,
// `player-sleep`), shot and closed again with Escape.
async function sheetShot(page, testId, shot) {
  await tid(page, testId).click({timeout: 8000});
  await sleep(2000);
  await shoot(page, shot);
  await page.keyboard.press('Escape');
  await sleep(1200);
}

// Tablet/desktop: one browsing session with a book playing in the docked bar.
async function captureWide(name, viewport, shots) {
  const {ctx, page} = await newProfile(name, viewport, 2);

  await step('book', async () => {
    await openFirstBook(page, shots.book);
    await listen(page);
  });

  await step('home', async () => {
    await tid(page, 'top-bar-(home)').click({timeout: 8000});
    await sleep(3000);
    await shoot(page, shots.home);
  });

  if (shots.player) {
    await step('player', async () => {
      await pausePlayback(page);
      await tid(page, 'dock-expand').click({timeout: 8000});
      await sleep(3500);
      // The seeded books have no community notes, so the companion column shows its
      // Chapters tab (Who's who would only say there are none).
      await tid(page, 'companion-tab-chapters').click({timeout: 8000}).catch(() => {});
      await sleep(1500);
      await shoot(page, shots.player);
      if (shots.speedSheet) await sheetShot(page, 'player-speed', shots.speedSheet);
      if (shots.sleepSheet) await sheetShot(page, 'player-sleep', shots.sleepSheet);
      await minimisePlayer(page);
    });
  }

  if (shots.dockUndo) {
    // A jump of more than a minute (the next chapter, from the docked bar) brings up
    // the Undo chip for ten seconds; the shot is the bar along the window's bottom.
    await step('dock undo chip', async () => {
      await sleep(3500); // past jump-undo's settle window after the load
      await firstVisible(page.getByRole('button', {name: 'Next chapter'})).click({timeout: 8000});
      await sleep(2500);
      await tid(page, 'dock-actions').getByRole('button', {name: /^Back to /}).waitFor({timeout: 5000});
      const box = await tid(page, 'shell-docked-player').boundingBox();
      if (!box) throw new Error('no docked bar');
      await shoot(page, shots.dockUndo, {clip: box});
      // Undo it, so the book is back where the warm-up left it.
      await tid(page, 'dock-actions').getByRole('button', {name: /^Back to /}).click({timeout: 5000});
      await sleep(1500);
    });
  }

  if (shots.credits) {
    // The end credits, opened early from the full player's menu (the book is paused,
    // so nothing counts down): the year shelf or cover, the stats, Up next.
    await step('end credits', async () => {
      await tid(page, 'dock-expand').click({timeout: 8000});
      await sleep(3000);
      await tid(page, 'player-menu').click({timeout: 8000});
      await sleep(1000);
      await firstVisible(page.getByRole('menuitem', {name: 'View end credits'})).click({timeout: 8000});
      await sleep(4500);
      await shoot(page, shots.credits);
      await firstVisible(page.getByRole('button', {name: 'Close'})).click({timeout: 8000});
      await sleep(2000);
    });
  }

  if (shots.palette) {
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

  if (shots.profile) {
    await step('profile menu', async () => {
      await tid(page, 'top-bar-profile').click({timeout: 8000});
      await sleep(1500);
      await shoot(page, shots.profile);
      await page.keyboard.press('Escape');
      await sleep(1000);
    });
  }

  if (shots.library) {
    // Library > Books, the default section.
    await step('library', async () => {
      await tid(page, 'top-bar-(library)').click({timeout: 8000});
      await sleep(3000);
      await shoot(page, shots.library);
    });
  }

  if (shots.upNext) {
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

  if (shots.librarySeries || shots.series) {
    await step('series', async () => {
      await librarySection(page, 'Series');
      if (shots.librarySeries) await shoot(page, shots.librarySeries);
      if (shots.series) {
        await openNamed(page, 'Sherlock Holmes');
        await shoot(page, shots.series);
      }
    });
  }

  if (shots.author) {
    await step('author', async () => {
      await librarySection(page, 'Authors');
      await openNamed(page, 'Lewis Carroll');
      await shoot(page, shots.author);
    });
  }

  if (shots.collection) {
    await step('collection', async () => {
      await librarySection(page, 'Collections');
      await openNamed(page, COLLECTION.name);
      await shoot(page, shots.collection);
    });
  }

  if (shots.downloads) {
    // Download one short book first, so the Downloads page has a book ready offline.
    await step('download a book', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, 'The Art of War');
      await firstVisible(page.getByRole('button', {name: /^download$/i})).click({timeout: 8000});
      // Done once the book page offers Remove download.
      await firstVisible(page.getByRole('button', {name: /^remove download$/i})).waitFor({timeout: 120000});
      await sleep(1500);
    });
  }

  for (const [key, testId] of [
    ['settings', 'top-bar-settings'],
    ['downloads', 'top-bar-(offline)'],
  ]) {
    if (!shots[key]) continue;
    await step(key, async () => {
      await tid(page, testId).click({timeout: 8000});
      await sleep(2500);
      await shoot(page, shots[key]);
    });
  }

  if (shots.search) {
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

// Phone: Listen opens the full player; closing it leaves the mini player above
// the tab bar, which the Home shot shows.
async function capturePhone(name, viewport, shots) {
  const {ctx, page} = await newProfile(name, viewport, 2);

  await step('book + player', async () => {
    await openFirstBook(page, shots.book);
    await listen(page);
    await pausePlayback(page);
    await shoot(page, shots.player);
    if (shots.speedSheet) await sheetShot(page, 'player-speed', shots.speedSheet);
    if (shots.sleepSheet) await sheetShot(page, 'player-sleep', shots.sleepSheet);
    await minimisePlayer(page);
  });

  await step('home', async () => {
    await tid(page, 'tab-bar-(home)').click({timeout: 8000});
    await sleep(3000);
    await shoot(page, shots.home);
  });

  if (shots.upNext) {
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
