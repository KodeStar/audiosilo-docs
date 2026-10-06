// Captures the web-player documentation screenshots against a locally-running
// AudioSilo server in demo mode (run.sh starts it). Three steps:
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
import {CACHE, sleep, shoot, step} from './lib.mjs';

const BASE = process.env.AS_BASE || 'http://127.0.0.1:8790/web/';
const ORIGIN = new URL(BASE).origin;
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
    localStorage.setItem('audiosilo.upNext', JSON.stringify({drawerOpen: false, drawerWidth: 360}));
  } catch {
    /* storage blocked: the drawer opens, the shots are just narrower */
  }
};

const api = async (token, method, p, body) => {
  const res = await fetch(`${ORIGIN}/api/v1${p}`, {
    method,
    headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 120)}`);
  return text ? JSON.parse(text) : null;
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

// ── Step 0: series tags ─────────────────────────────────────────────────────
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
  console.log('  ✓ series: Sherlock Holmes (3, 5), Alice (1, 2)');
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
    const r = await page.evaluate(
      async ({queue, collection}) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('audiosilo.token.'));
        const token = key ? localStorage.getItem(key) : null;
        if (!token) throw new Error('no demo token in localStorage');
        const call = async (method, p, body) => {
          const res = await fetch(`${location.origin}/api/v1${p}`, {
            method,
            headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}`);
          return res.status === 204 ? null : res.json();
        };
        const libs = await call('GET', '/libraries');
        const lib = (libs.libraries ?? libs)[0];
        const {books} = await call('GET', `/libraries/${lib.id}/books?limit=200`);
        const find = (t) => books.find((b) => `${b.title} ${b.rel_path}`.includes(t));
        const ref = (b) => ({library_id: lib.id, path: b.rel_path});
        const queued = queue.map(find).filter(Boolean);
        for (const b of queued) await call('POST', '/me/queue', ref(b));
        const made = await call('POST', '/me/collections', {name: collection.name, description: collection.description});
        const items = collection.books.map(find).filter(Boolean).map(ref);
        await call('PUT', `/me/collections/${made.collection.id}/items`, {items});
        return {queued: queued.length, items: items.length};
      },
      {queue: QUEUE, collection: COLLECTION},
    );
    console.log(`  ✓ queued ${r.queued}, collection of ${r.items}`);
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
const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();

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
  await page
    .getByRole('button', {name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)})
    .first()
    .click({timeout: 8000});
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
  const btn = page.getByRole('button', {name: /^listen$/i}).first();
  await btn.click({timeout: 8000});
  await sleep(4500);
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
      await page.getByRole('button', {name: 'Expand player'}).first().click({timeout: 8000});
      await sleep(3500);
      await shoot(page, shots.player);
      await page.getByRole('button', {name: 'Close'}).first().click({timeout: 8000});
      await sleep(1500);
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
      await page.getByRole('button', {name: /^download$/i}).first().click({timeout: 8000});
      await page.getByText(/^Downloaded/).first().waitFor({state: 'visible', timeout: 120000});
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
    await shoot(page, shots.player);
    await page.getByRole('button', {name: 'Close'}).first().click({timeout: 8000});
    await sleep(1500);
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
