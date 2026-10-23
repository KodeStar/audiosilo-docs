// Shared helpers for the screenshot capture scripts.
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// All captures land directly in the docs static dir.
export const OUT_ROOT = path.resolve(here, '../static/img/screenshots');
export const CACHE = path.resolve(here, '.cache');
// Fixture files the capture and seed scripts read (fixtures/*.json).
export const FIXTURES = path.resolve(here, 'fixtures');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Time for the fixtures: an ISO timestamp `ms` before now, and the units to build `ms` from.
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();

// A name as a file or URL slug ("The Slow Kitchen" -> "the-slow-kitchen").
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Where seed-podcasts.mjs writes the made-up directory's artwork for the podcast root
// `root` (beside it, so the library scan never sees it).
export const PODCAST_DIRECTORY = (root) => path.join(path.dirname(path.resolve(root)), 'podcast-directory');

// A content path as the API's `?path=` query.
export const pathQuery = (relPath) => `?path=${encodeURIComponent(relPath)}`;

// Every visited tab page (and every page further down a stack) stays mounted but
// hidden, so a test id or a button name can match several elements: always act on
// the visible one.
export const firstVisible = (locator) => locator.filter({visible: true}).first();
export const tid = (page, id) => firstVisible(page.getByTestId(id));

// The standard desktop capture context (retina, dark, motion-reduced) shared by
// the capture scripts. capture-web spreads it into its capture contexts
// (`newCaptureContext`), overriding the viewport where a shot needs it; its warm-up and
// demo-landing contexts are still built by hand.
export const DESKTOP_CONTEXT = {
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  reducedMotion: 'reduce',
};

// Makes the viewport as tall as the page (between min and max, at the desktop
// width), so a long card or every card is in the shot; the caller restores
// DESKTOP_CONTEXT.viewport.
export const fitViewportToPage = async (p, min, max, settle = 800) => {
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({width: DESKTOP_CONTEXT.viewport.width, height: Math.min(Math.max(height, min), max)});
  await sleep(settle);
};

// Fills the console's sign-in form (already open on `p`) as admin and submits it.
export const submitSignIn = async (p, password) => {
  await p.getByLabel('Username', {exact: true}).fill('admin');
  await p.getByLabel('Password', {exact: true}).fill(password);
  await p.getByRole('button', {name: 'Sign in', exact: true}).click();
};

// Fixture audio: ffmpeg(args) is true when ffmpeg ran and succeeded, and
// silence() writes silent mono audio, cheap to encode even when it is hours long.
export const ffmpeg = (args) =>
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'ignore'}).status === 0;
export const silence = (file, seconds, meta = {}, codec = ['-c:a', 'libmp3lame', '-b:a', '8k']) =>
  ffmpeg([
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', String(seconds),
    ...Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]),
    ...codec, file,
  ]);

// A JSON client for a server's /api/v1: api(token, method, path, body?, headers?)
// returns the parsed body (null when empty or not JSON) and throws on a non-2xx.
export const apiClient = (origin) => async (token, method, p, body, headers = {}) => {
  const res = await fetch(`${origin}/api/v1${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 120)}`);
  return json;
};

// Raw Playwright PNGs at deviceScaleFactor 2 are large (a full desktop shot is
// ~0.5-1.3 MB); pngquant's lossy-palette pass shrinks them ~60% with no
// perceptible loss on UI captures. It's a deterministic transform run on every
// capture, so the committed PNG is the optimized one - this is part of
// generation, NOT a hand-edit of a captured file. Degrades gracefully when
// pngquant is absent (the shot is just left raw + a one-time warning).
let pngquant; // undefined = unchecked, true/false = availability
export function optimize(file) {
  if (pngquant === undefined) {
    pngquant = spawnSync('pngquant', ['--version'], {stdio: 'ignore'}).status === 0;
    if (!pngquant) console.log('  ! pngquant not found - screenshots left unoptimized (brew install pngquant)');
  }
  if (!pngquant) return;
  const r = spawnSync(
    'pngquant',
    ['--quality=65-90', '--strip', '--skip-if-larger', '--force', '--output', file, file],
    {stdio: 'ignore'},
  );
  // 0 = optimized; 98 = result would be larger (original kept); 99 = below the
  // quality floor (original kept). Anything else is a real failure worth noting.
  if (![0, 98, 99].includes(r.status)) {
    console.log(`  ! pngquant failed on ${path.basename(file)} (status ${r.status})`);
  }
}

// SHOTS_ONLY=<prefix>[,<prefix>...] limits a run to the screenshots whose path
// starts with one of them (e.g. SHOTS_ONLY=admin/, or
// SHOTS_ONLY=admin/activity,admin/people.png), so adding a few shots doesn't
// re-encode every other committed PNG. Unset = capture everything.
const ONLY = (process.env.SHOTS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

// Whether a run captures any of `relFiles` (SHOTS_ONLY, above): a capture script
// skips the steps whose shots it wouldn't keep. An undefined file is never wanted.
export function wanted(...relFiles) {
  return relFiles.some(
    (f) => typeof f === 'string' && (!ONLY.length || ONLY.some((prefix) => f.startsWith(prefix))),
  );
}

// `opts.clip` ({x, y, width, height} in CSS pixels) captures just that region (a
// bar along the bottom, say) instead of the whole viewport.
export async function shoot(page, relFile, opts = {}) {
  if (!wanted(relFile)) return;
  const file = path.join(OUT_ROOT, relFile);
  await mkdir(path.dirname(file), {recursive: true});
  await page.screenshot({path: file, ...(opts.clip ? {clip: opts.clip} : {})});
  optimize(file);
  console.log(`  ✓ ${relFile}`);
}

// Best-effort step wrapper: a single failed capture shouldn't kill the run -
// placeholders.mjs backfills anything missing afterwards.
export async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`  ✗ ${name}: ${String(e && e.message ? e.message : e).split('\n')[0]}`);
  }
}

// A clip around `boxes` (each from boundingBox()), `pad` CSS pixels wider on every
// side, never starting off the page.
export const around = (boxes, pad = 16) => {
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return {x, y, width: right - x, height: bottom - y};
};

// A household for a capture, made as its owner (`token`) through the player's own API
// (see README.md): a collection of theirs named `collection` holding `items` (rel paths
// in library `libraryId`; none without a name), and `members` ({name, kind, access}),
// each on "collections" given that collection. What a previous run left on the account
// (a collection or a member of the same name) is reused, so a rerun adds nobody and
// spends none of the server's self-service rate limit. Resolves to
// {collectionId, members: [{...member spec, id, username}]}.
export async function addHousehold(api, token, libraryId, {collection, items = [], members = []}) {
  let collectionId = null;
  if (collection) {
    const owned = ((await api(token, 'GET', '/me/collections'))?.collections ?? []).find(
      (c) => c.owned && c.name === collection,
    );
    collectionId = owned?.id ?? (await api(token, 'POST', '/me/collections', {name: collection})).collection.id;
    await api(token, 'PUT', `/me/collections/${collectionId}/items`, {
      items: items.map((p) => ({library_id: libraryId, path: p})),
    });
  }
  const existing = members.length ? ((await api(token, 'GET', '/me/household/members'))?.members ?? []) : [];
  const made = [];
  for (const m of members) {
    const shares = m.access === 'collections' && collectionId ? {collection_ids: [collectionId]} : {};
    let member = existing.find((x) => x.name === m.name);
    if (member) {
      if (shares.collection_ids) member = await api(token, 'PATCH', `/me/household/members/${member.id}`, shares);
    } else {
      ({member} = await api(token, 'POST', '/me/household/members', {name: m.name, kind: m.kind, access: m.access, ...shares}));
    }
    made.push({...m, id: member.id, username: member.username});
  }
  return {collectionId, members: made};
}
