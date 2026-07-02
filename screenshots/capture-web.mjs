// Captures the web-player documentation screenshots against a locally-running
// AudioSilo server in demo mode (run.sh starts it). Two passes:
//   1. warm a demo session (seek several books to varied positions so the home
//      screen's Continue Listening shelf looks lived-in) — same technique as
//      store/tools/login.mjs in the workspace,
//   2. capture desktop + phone profiles into static/img/screenshots/web-player/.
import {chromium} from 'playwright';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {CACHE, sleep, shoot, step} from './lib.mjs';

const BASE = process.env.AS_BASE || 'http://127.0.0.1:8790/web/';
const AUTH = path.join(CACHE, 'auth.json');

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

// ── Pass 1: warm a demo session ─────────────────────────────────────────────
console.log('== warm demo session ==');
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  await ctx.addInitScript(audioHook);
  const page = await ctx.newPage();
  await page.goto(BASE + 'demo', {waitUntil: 'networkidle', timeout: 60000});
  for (let i = 0; i < 30; i++) {
    if ((await page.locator('div[tabindex="0"]:has(img)').count().catch(() => 0)) > 0) break;
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
  await ctx.storageState({path: AUTH});
  await ctx.close();
  console.log('  ✓ demo session warmed');
}

// ── Pass 2: captures ────────────────────────────────────────────────────────
async function captureProfile(name, viewport, dsf, shots) {
  console.log(`== ${name} (${viewport.width}x${viewport.height}) ==`);
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    storageState: AUTH,
  });
  const page = await ctx.newPage();

  await step('home', async () => {
    await page.goto(BASE, {waitUntil: 'networkidle', timeout: 45000});
    await sleep(3000);
    await shoot(page, shots.home);
  });

  await step('book + player', async () => {
    const card = page.locator('div[tabindex="0"]:has(img)').first();
    await card.waitFor({state: 'visible', timeout: 20000});
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await card.click({timeout: 12000});
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(2000);
    await shoot(page, shots.book);
    const listen = page.getByRole('button', {name: /listen/i}).first();
    if (await listen.count()) {
      await listen.click({timeout: 8000}).catch(() => {});
      await sleep(4500);
    }
    await shoot(page, shots.player);
  });

  if (shots.library) {
    await step('library', async () => {
      await page.goto(BASE + 'library', {waitUntil: 'networkidle', timeout: 45000});
      await sleep(1800);
      await shoot(page, shots.library);
    });
  }

  if (shots.search) {
    await step('search', async () => {
      await page.goto(BASE + 'search', {waitUntil: 'networkidle', timeout: 45000});
      await sleep(1200);
      const box = page.locator('input').first();
      if (await box.count()) {
        await box.click();
        await box.fill('holmes');
        await sleep(2500);
      }
      await shoot(page, shots.search);
    });
  }

  if (shots.settings) {
    await step('settings', async () => {
      await page.goto(BASE + 'settings', {waitUntil: 'networkidle', timeout: 45000});
      await sleep(1800);
      await shoot(page, shots.settings);
    });
  }

  if (shots.downloads) {
    await step('downloads', async () => {
      await page.goto(BASE + 'downloads', {waitUntil: 'networkidle', timeout: 45000});
      await sleep(1800);
      await shoot(page, shots.downloads);
    });
  }

  await ctx.close();
}

await captureProfile('desktop', {width: 1440, height: 900}, 2, {
  home: 'web-player/home.png',
  book: 'web-player/book-detail.png',
  player: 'web-player/player.png',
  library: 'web-player/library.png',
  search: 'web-player/search.png',
  settings: 'web-player/settings.png',
  downloads: 'web-player/downloads.png',
});

await captureProfile('phone', {width: 430, height: 932}, 2, {
  home: 'web-player/phone-home.png',
  book: 'web-player/phone-book-detail.png',
  player: 'web-player/phone-player.png',
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
