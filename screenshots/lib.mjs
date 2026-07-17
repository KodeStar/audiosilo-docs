// Shared helpers for the screenshot capture scripts.
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// All captures land directly in the docs static dir.
export const OUT_ROOT = path.resolve(here, '../static/img/screenshots');
export const CACHE = path.resolve(here, '.cache');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The standard desktop capture context (retina, dark, motion-reduced) shared by
// the capture scripts. capture-web builds its own parameterized contexts (phone
// profile, connect/demo variants) on purpose.
export const DESKTOP_CONTEXT = {
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  reducedMotion: 'reduce',
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

export async function shoot(page, relFile) {
  const file = path.join(OUT_ROOT, relFile);
  await mkdir(path.dirname(file), {recursive: true});
  await page.screenshot({path: file});
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
