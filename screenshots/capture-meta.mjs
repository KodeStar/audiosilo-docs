// Captures the meta.audiosilo.app site documentation screenshots against a
// locally-running metaserve (run.sh builds the data artifact + site and starts
// it). Env:
//   META_BASE       the site/API origin (default http://127.0.0.1:8795)
//   IMPORT_FIXTURE  library export dropped on /import (default: the vendored
//                   fixtures/openaudible-books.json, synthetic data)
//
// The site is an Astro static export whose React islands fetch /api/v1 on the
// CLIENT, so every wait here is content-based (a rendered element the island
// produced), never a bare load event. Remote cover images may be slow or 404;
// steps wait on text/layout and give images a short bounded settle rather than
// blocking on them, so a missing cover never fails a shot.
//
// Standalone: point META_BASE at any metaserve (or the live site) and run
// `node capture-meta.mjs` - it needs no other services.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {sleep, shoot, step, DESKTOP_CONTEXT} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.META_BASE || 'http://127.0.0.1:8795').replace(/\/$/, '');

// The work referenced by the developer docs: two recordings (Jim Dale + Stephen
// Fry), and a fully-populated community layer (characters + a story-so-far
// recap), so the same book anchors both the work and characters shots.
const WORK_ID = 'harry-potter-and-the-philosophers-stone';
const SERIES_ID = 'harry-potter';
// An OpenAudible books.json sample (synthetic ASINs, vendored here) that drives
// the /import diff to a populated results view without matching real catalogue
// entries.
const IMPORT_FIXTURE =
  process.env.IMPORT_FIXTURE || path.resolve(HERE, 'fixtures/openaudible-books.json');

const browser = await chromium.launch();
const ctx = await browser.newContext(DESKTOP_CONTEXT);
const page = await ctx.newPage();

// domcontentloaded, not networkidle: a hanging remote cover request would time
// the navigation out even though the page content rendered long before. Each
// step's own content wait (+ a bounded settle for cover paint) gates the shot.
const goto = (route) => page.goto(`${BASE}${route}`, {waitUntil: 'domcontentloaded', timeout: 45000});

// The home page's HERO search box. The header also carries a compact search
// (placeholder "Search books, narrators..."), which on the home page sits under
// the nav until the hero scrolls away, so a bare combobox locator can land on
// the covered one and its click never lands.
const heroSearch = (pg) => pg.locator('input[role="combobox"][placeholder^="Search by title"]').first();

// ── Home: search hero + stats band + latest additions ───────────────────────
await step('home', async () => {
  await goto('/');
  await page.waitForSelector('input[role="combobox"]', {timeout: 20000});
  // The stats band and latest-additions grid are client:visible islands - they
  // only hydrate + fetch once scrolled into view. A single jump to the bottom
  // skips past them (the observer never sees the crossing), so step down one
  // viewport at a time to arm each island, wait for the work-card links (proof
  // the API resolved), then anchor back to the top so the shot leads with the
  // search hero.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await page.waitForSelector('a[href^="/works/"]', {timeout: 20000});
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(2000); // let the stats count-up settle + covers paint (bounded)
  await shoot(page, 'meta/home.png');
});

// ── Search: the grouped dropdown for a seed-data query ───────────────────────
await step('search', async () => {
  // Continues on the home page; re-navigate if the home step failed partway.
  if (page.url() !== `${BASE}/`) {
    await goto('/');
    await page.waitForSelector('input[role="combobox"]', {timeout: 20000});
  }
  const box = heroSearch(page);
  await box.click();
  await box.fill('harry potter');
  // Results render as role=option rows inside the listbox once the debounced
  // fetch returns; wait for the first one rather than a fixed sleep.
  await page.waitForSelector('[role="option"]', {timeout: 15000});
  await sleep(1200); // covers in the option rows settle
  await shoot(page, 'meta/search.png');
});

// ── Work detail: cover, metadata, recordings ─────────────────────────────────
await step('work', async () => {
  await goto(`/work?id=${WORK_ID}`);
  await page.getByRole('heading', {level: 1}).first().waitFor({state: 'visible', timeout: 20000});
  // Recordings are the client island's main payload; wait for a recording card
  // (the cards only render inside the Recordings section).
  await page.waitForSelector('article', {timeout: 20000});
  await sleep(1800); // cover art settle (bounded)
  await shoot(page, 'meta/work.png');
});

// ── Characters: the community layer with one card opened ─────────────────────
// Continues on the work page the previous step loaded (same book by design);
// re-navigates only if that step failed partway, so one transient failure
// cannot cost both shots.
await step('characters', async () => {
  if (!page.url().includes(`/work?id=${WORK_ID}`)) {
    await goto(`/work?id=${WORK_ID}`);
    await page.getByRole('heading', {level: 1}).first().waitFor({state: 'visible', timeout: 20000});
  }
  // The Characters tab only exists when the work has a characters sidecar.
  const tab = page.getByRole('tab', {name: /characters/i}).first();
  await tab.waitFor({state: 'visible', timeout: 20000});
  await tab.click();
  await page.waitForSelector('#panel-characters article', {timeout: 15000});
  // Open the first character card that has a description (its disclosure button
  // starts collapsed) so the shot shows the spoiler-gated body revealed.
  const disclosure = page.locator('#panel-characters button[aria-expanded="false"]').first();
  await disclosure.waitFor({state: 'visible', timeout: 10000});
  await disclosure.click();
  await page.waitForSelector('#panel-characters p[id^="char-desc-"]', {timeout: 10000});
  // Bring the section (intro + grid + opened card) to the top of the viewport.
  await page.locator('#panel-characters').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1200);
  await shoot(page, 'meta/characters.png');
});

// ── Series: the ordered list of volumes ──────────────────────────────────────
await step('series', async () => {
  await goto(`/series?id=${SERIES_ID}`);
  await page.getByRole('heading', {level: 1}).first().waitFor({state: 'visible', timeout: 20000});
  // Each volume is a work link in an ordered list; wait for the list to fill.
  await page.waitForSelector('ol li a[href^="/works/"]', {timeout: 20000});
  await sleep(1500); // thumbnail covers settle (bounded)
  await shoot(page, 'meta/series.png');
});

// ── Series (watched): the Watch toggle + "I have this" marks ─────────────────
// Drives the real controls rather than seeding localStorage, so the shot can
// only succeed if the toggle and the ownership checkboxes actually work. The
// marks it leaves behind are what the /watching step below reads - the browser
// context is shared, and the watchlist lives in localStorage on this origin.
await step('series-watching', async () => {
  await goto(`/series/${SERIES_ID}`);
  const watch = page.getByRole('button', {name: /watch this series/i}).first();
  await watch.waitFor({state: 'visible', timeout: 20000});
  await watch.click();
  await page.getByRole('button', {name: /^watching$/i}).first().waitFor({timeout: 10000});
  // Ownership marks only exist while watching; tick the first two volumes so the
  // shot shows both states and /watching has something under "you already have".
  const owns = page.locator('input[type="checkbox"][aria-label^="I have "]');
  await owns.first().waitFor({state: 'visible', timeout: 10000});
  const count = await owns.count();
  for (let i = 0; i < Math.min(2, count); i += 1) await owns.nth(i).check();
  await sleep(1200); // thumbnail covers settle (bounded)
  await shoot(page, 'meta/series-watching.png');
});

// ── Watching: what is new across the watched series ──────────────────────────
// Continues from the step above (same context, same localStorage). A Preorder
// group only appears when the catalogue holds a future release_date; the shot is
// valid without one.
await step('watching', async () => {
  await goto('/watching');
  await page.getByText(/preorders? across/i).first().waitFor({timeout: 20000});
  // The per-series panel fills from the API; the ownership checkboxes are the
  // proof its entries rendered.
  await page.waitForSelector('input[type="checkbox"][aria-label^="I have "]', {timeout: 20000});
  await sleep(1200);
  await shoot(page, 'meta/watching.png');
});

// ── Contribute: the coverage browser ─────────────────────────────────────────
await step('contribute', async () => {
  await goto('/contribute');
  // The coverage island renders stat cards + the browser heading once /coverage
  // resolves; wait for the heading text rather than a load event.
  await page.getByText('Browse books by coverage', {exact: false}).first().waitFor({timeout: 20000});
  await sleep(1200);
  await shoot(page, 'meta/contribute.png');
});

// ── Import: drop a library export, capture the diff results ───────────────────
await step('import', async () => {
  await goto('/import');
  // The file input is visually hidden (sr-only); setInputFiles drives it
  // directly, which triggers the in-browser diff against the API.
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({state: 'attached', timeout: 20000});
  await input.setInputFiles(IMPORT_FIXTURE);
  // The diff finishes on the results stat tiles ("In the database" etc.).
  await page.getByText('In the database', {exact: false}).first().waitFor({timeout: 30000});
  await sleep(1000);
  await shoot(page, 'meta/import.png');
});

// ── Languages: the header selector opened on the catalogue's census ──────────
// Opening the list stores nothing (only ticking a box does), so this leaves the
// shared context exactly as it found it.
await step('languages', async () => {
  await goto('/');
  // The selector hydrates on idle; its trigger is labelled "Languages: <summary>".
  const trigger = page.locator('button[aria-label^="Languages:"]').first();
  await trigger.waitFor({state: 'visible', timeout: 20000});
  await trigger.click();
  // The rows come from /stats once the list opens; wait for a counted language.
  await page.waitForSelector('ul[aria-label="Languages to show"] input[type="checkbox"]', {timeout: 15000});
  await sleep(1200);
  await shoot(page, 'meta/languages.png');
});

await ctx.close();

// ── Language suggestion: a German browser that has never answered ────────────
// A FRESH context (empty localStorage) with a German locale, which is the one
// state the one-line prompt under the header appears in. Its own context so the
// choice the next step makes never reaches the shots above.
const deCtx = await browser.newContext({...DESKTOP_CONTEXT, locale: 'de-DE'});
const dePage = await deCtx.newPage();
const deGoto = (route) => dePage.goto(`${BASE}${route}`, {waitUntil: 'domcontentloaded', timeout: 45000});

await step('language-prompt', async () => {
  await deGoto('/');
  await dePage.locator('aside[aria-label="Language suggestion"]').waitFor({state: 'visible', timeout: 20000});
  await dePage.waitForSelector('input[role="combobox"]', {timeout: 20000});
  await sleep(1500);
  await shoot(dePage, 'meta/language-prompt.png');
});

// ── Search with a language filter: the prompt answered "Only Deutsch" ─────────
// Continues from the prompt above: accepting it stores the filter, and the
// search panel then says which languages it shows and offers to search them all.
await step('language-search', async () => {
  if (!dePage.url().startsWith(`${BASE}/`)) await deGoto('/');
  const prompt = dePage.locator('aside[aria-label="Language suggestion"]');
  await prompt.getByRole('button', {name: /^Only /}).click({timeout: 20000});
  await prompt.waitFor({state: 'detached', timeout: 10000});
  const box = heroSearch(dePage);
  await box.click();
  await box.fill('harry potter');
  await dePage.waitForSelector('[role="option"]', {timeout: 15000});
  // The filter line sits at the foot of the results panel, below the fold at the
  // hero's resting scroll. Scroll the typed query up to just under the sticky
  // header so the shot holds the query, the German results AND the line that
  // says so.
  const all = dePage.getByRole('button', {name: /search all languages/i}).first();
  await all.waitFor({timeout: 10000});
  await box.evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80);
  });
  await sleep(1200); // covers in the option rows settle
  await shoot(dePage, 'meta/language-search.png');
});

await deCtx.close();
await browser.close();
console.log('capture-meta: done.');
