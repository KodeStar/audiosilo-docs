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
  await page.waitForSelector('a[href^="/work?id="]', {timeout: 20000});
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
  const box = page.locator('input[role="combobox"]').first();
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
  await page.waitForSelector('ol li a[href^="/work?id="]', {timeout: 20000});
  await sleep(1500); // thumbnail covers settle (bounded)
  await shoot(page, 'meta/series.png');
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

await ctx.close();
await browser.close();
console.log('capture-meta: done.');
