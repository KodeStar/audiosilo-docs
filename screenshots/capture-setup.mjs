// Captures the first-run setup screenshots: the --setup page (the account, then
// its hand-over to the console) and every step of the admin console's "Set up
// your server" flow, then the Overview's "Finish setting up" card. Requires the
// --setup server run.sh starts (a fresh data dir, no admin yet) and env:
//   SETUP_URL    that server's one-time wizard URL (http://127.0.0.1:<port>/setup#token=...)
//   SETUP_BOOKS  optional: where to build the books folder the flow adds
//                (default .cache/setup/Audiobooks; rebuilt on every run)
//   SETUP_HOST   optional: the name the browser uses for the server (default
//                audiosilo.local, mapped to 127.0.0.1 inside the browser only),
//                so the address step treats it as a home-network address and
//                offers it as the home address, as it would on a real LAN
//
// The books folder is four tiny books of generated silence (ffmpeg on PATH) laid
// out as Author / Series / N - Title, whose tags are poor or missing (a generic
// "Track 01" title, an author written surname first, no tags at all), so the
// naming step shows the two sources disagreeing and suggests the folders. The
// flow is driven through its real UI with the exact English labels of the
// server's admin-ui/src/i18n/locales/en.json (setup.*): a renamed button there
// needs the same rename here. Every step is continued except the
// Audiobookshelf step (left unopened, so it counts as skipped) and the Bridge
// step (no Bridge, so "Skip and finish"), which leaves the Overview card two
// steps to list. Run once per fresh --setup server: the account it makes
// closes the wizard.
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {
  CACHE, DESKTOP_CONTEXT, around, fitViewportToPage, shoot, silence, sleep, step, submitSignIn, wanted,
} from './lib.mjs';
import {SHOTS as MANIFEST} from './manifest.mjs';

const SETUP_URL = process.env.SETUP_URL || '';
const BOOKS = path.resolve(process.env.SETUP_BOOKS || path.join(CACHE, 'setup', 'Audiobooks'));
const HOST = process.env.SETUP_HOST || 'audiosilo.local';
const PASSWORD = 'hearthside-setup';
if (!wanted(...MANIFEST.filter((s) => s.capture === 'setup').map((s) => s.file))) {
  console.log('capture-setup: no setup shots wanted, skipped.');
  process.exit(0);
}
if (!SETUP_URL) {
  console.error('capture-setup: SETUP_URL is required (run.sh starts the --setup server)');
  process.exit(1);
}

// The wizard's URL with the browser's name for the server.
const wizard = new URL(SETUP_URL);
wizard.hostname = HOST;

// ── The books folder ────────────────────────────────────────────────────────
// Each book: its folder under BOOKS and the tags its two files carry.
const FIXTURE = [
  // Tagged well, apart from the series the folders know.
  {dir: ['Arthur Conan Doyle', 'Sherlock Holmes', '1 - A Study in Scarlet'],
    tags: {album: 'A Study in Scarlet', artist: 'Arthur Conan Doyle', composer: 'David Clarke'}},
  // Tagged another way: the album as a shop sells it, the author surname first.
  {dir: ['Arthur Conan Doyle', 'Sherlock Holmes', '2 - The Sign of the Four'],
    tags: {album: 'The Sign of Four (Unabridged)', artist: 'Doyle, Arthur Conan', composer: 'David Clarke'}},
  // Only a generic track title.
  {dir: ['L. Frank Baum', 'Oz', '1 - The Wonderful Wizard of Oz'], tags: {title: 'Track 01'}},
  // No tags at all.
  {dir: ['Jane Austen', 'Pride and Prejudice'], tags: {}},
];
await step('build the setup books folder', async () => {
  await rm(BOOKS, {recursive: true, force: true});
  let ok = true;
  for (const b of FIXTURE) {
    const folder = path.join(BOOKS, ...b.dir);
    await mkdir(folder, {recursive: true});
    for (const n of [1, 2]) ok = silence(path.join(folder, `0${n}.mp3`), 4, b.tags) && ok;
  }
  if (!ok) throw new Error('ffmpeg missing or failed: the folder and naming steps will find nothing');
  console.log(`  ✓ books folder (${FIXTURE.length} books) at ${BOOKS}`);
});

// ── Capture ────────────────────────────────────────────────────────────────
const browser = await chromium.launch({args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`]});
const ctx = await browser.newContext(DESKTOP_CONTEXT);
const page = await ctx.newPage();

// Makes the viewport as tall as the page (between min and max) for one shot.
const tall = async (file, min = 900, max = 2400) => {
  await fitViewportToPage(page, min, max, 600);
  await shoot(page, file);
  await page.setViewportSize(DESKTOP_CONTEXT.viewport);
};
const heading = (name) => page.getByRole('heading', {level: 1, name, exact: true});
const button = (name) => page.getByRole('button', {name, exact: true});
// Leaves the current step with `action` (Continue, Skip, ...) and waits for the next one.
const leave = async (action, nextTitle) => {
  await button(action).click();
  await heading(nextTitle).waitFor({timeout: 30000});
  await page.mouse.move(0, 0);
  await sleep(800);
};

await step('the --setup page', async () => {
  await page.goto(wizard.href, {waitUntil: 'networkidle', timeout: 45000});
  await page.locator('#setup-form').waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'server/setup-wizard.png');
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#setup-submit').click();
  await page.locator('#setup-done').waitFor({state: 'visible', timeout: 15000});
  await sleep(600);
  await shoot(page, 'server/setup-wizard-done.png');
});

// The flow from here on: each step needs the one before it.
await step('the console flow', async () => {
  await page.getByRole('link', {name: 'Continue setup', exact: true}).click();
  await submitSignIn(page, PASSWORD);
  // The console sends a server that hasn't finished setting up to the flow.
  await heading('Where are your books?').waitFor({timeout: 20000});

  // 1. Books folder: typed, checked, named.
  await page.getByLabel('Books folder', {exact: true}).fill(BOOKS);
  await button('Check folder').click();
  await page.getByText(/^Found \d+ audio files$/).waitFor({timeout: 30000});
  await page.getByLabel('Library name', {exact: true}).fill('Audiobooks');
  await page.mouse.move(0, 0);
  await sleep(600);
  await shoot(page, 'setup/folder.png');
  await leave('Continue', 'How are your books named?');

  // 2. Naming: the samples side by side, the folders suggested.
  await page.getByRole('list', {name: 'Sample books'}).waitFor({timeout: 30000});
  await sleep(600);
  await tall('setup/naming.png');
  await leave('Continue', 'Community metadata');

  // 3. Metadata, then the library is added and its first scan starts.
  await shoot(page, 'setup/metadata.png');
  await leave('Continue', 'How will people reach the server?');

  // 4. Addresses: the scan bar above the step, once the scan has finished.
  await page.getByText(/^\d+ books ready$/).waitFor({timeout: 60000});
  // ... and the "Added Audiobooks" toast has gone.
  await page.getByText('Added Audiobooks', {exact: true}).waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
  await sleep(600);
  await tall('setup/reach.png');
  await leave('Continue', 'Coming from Audiobookshelf?');

  // 5. Audiobookshelf: the import never opened, so Continue records it skipped.
  await shoot(page, 'setup/abs.png');
  await leave('Continue', 'Backups and updates');

  // 6. Backups and updates.
  await shoot(page, 'setup/backups.png');
  await leave('Continue', 'Connect a phone');

  // 7. Phone: the pairing QR code drawn.
  await page.getByRole('img', {name: 'Pairing QR code for your phone'}).waitFor({timeout: 20000});
  await sleep(600);
  await shoot(page, 'setup/phone.png');
  await leave('Continue', 'Add a Bridge');

  // 8. Bridge: none paired, so the flow ends with "Skip and finish".
  await tall('setup/bridge.png');
  await button('Skip and finish').click();

  // The Overview card lists the two skipped steps.
  const card = page.locator('[aria-labelledby="finish-setup-heading"]');
  await card.waitFor({timeout: 20000});
  await card.getByRole('link', {name: 'Add a Bridge'}).waitFor({timeout: 10000});
  await sleep(1500); // the toast fades, the covers load
  await shoot(page, 'setup/finish-card.png', {clip: around([await card.boundingBox()])});
});

await ctx.close();
await browser.close();
console.log('capture-setup: done.');
