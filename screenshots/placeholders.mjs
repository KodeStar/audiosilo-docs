// Backfills a styled placeholder PNG for every manifest entry whose file is
// missing, so the docs build (which hard-fails on missing images) always works.
// Run capture scripts first; this fills whatever they couldn't reach (e.g. the
// Wails manager on a headless box). Pass --force to regenerate all placeholders
// listed for a capture group: node placeholders.mjs [--force] [group]
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {SHOTS} from './manifest.mjs';
import {OUT_ROOT, optimize} from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const group = args.find((a) => !a.startsWith('--'));

const pageHtml = (title, hint) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#141210;color:#e7e5e4;
    font:400 16px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:14px;text-align:center;padding:0 8%}
  .dot{width:56px;height:56px;border-radius:16px;background:#db2777;opacity:.9}
  h1{font-size:26px;font-weight:600;margin:0}
  p{margin:0;opacity:.65;max-width:36em}
  .tag{margin-top:10px;font-size:13px;opacity:.45;border:1px solid #44403c;
    border-radius:999px;padding:4px 14px}
</style></head><body><div class="wrap">
  <div class="dot"></div>
  <h1>${title}</h1>
  <p>${hint}</p>
  <div class="tag">placeholder — regenerate with audiosilo-docs/screenshots/run.sh</div>
</div></body></html>`;

const missing = SHOTS.filter((s) => {
  if (group && s.capture !== group) return false;
  return force || !existsSync(path.join(OUT_ROOT, s.file));
});

if (!missing.length) {
  console.log('placeholders: nothing missing.');
  process.exit(0);
}

const browser = await chromium.launch();
for (const s of missing) {
  const phone = path.basename(s.file).startsWith('phone-');
  const page = await browser.newPage({
    viewport: phone ? {width: 430, height: 932} : {width: 1440, height: 900},
  });
  await page.setContent(pageHtml(s.title, s.hint));
  const file = path.join(OUT_ROOT, s.file);
  await mkdir(path.dirname(file), {recursive: true});
  await page.screenshot({path: file});
  optimize(file);
  await page.close();
  console.log(`  ◌ placeholder: ${s.file}`);
}
await browser.close();
console.log(`placeholders: generated ${missing.length}.`);
