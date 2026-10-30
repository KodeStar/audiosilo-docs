// Seeds The Call of the Wild's read-along map for the read-along shots (run.sh section
// 2e): fixtures/call-of-the-wild.readalong.json is the readalong.json a real Bridge made
// for this LibriVox recording and Project Gutenberg's ebook #215. The seed caps each book
// at MAX_FILES audio files, and the server serves a map only while its audio files are
// the book's, so the map written to <book>/.audiosilo/readalong.json is cut to the files
// seeded: their seeded names (seed-librivox.sh's "001 - <file>"), the spans and audio
// gaps inside them, the duration theirs and coverage.text scaled by the share of spans
// kept (all seeded files keep it whole). The EPUB is checked against the map's
// ebook.sha256 first: a map made from another file would be served stale
// (ebook_changed) and the read-along shots would fail later with an unclear error, so
// a drift (Gutenberg rebuilt ebook #215) fails here and writes nothing; run.sh then
// stops the run when it wants those shots (docs#200). Written on every run (the
// cached library may predate it). The server only reads it.
//
//   node seed-readalong.mjs <book dir> <epub>
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {FIXTURES} from './lib.mjs';

const [book, epub] = process.argv.slice(2);
if (!book || !epub) {
  console.error('usage: node seed-readalong.mjs <book dir> <epub>');
  process.exit(1);
}
const map = JSON.parse(readFileSync(path.join(FIXTURES, 'call-of-the-wild.readalong.json'), 'utf8'));
const sha = createHash('sha256').update(readFileSync(epub)).digest('hex');
if (sha !== map.ebook.sha256) {
  console.error(
    `  ! ${epub} is not the EPUB the read-along map was made from (sha256 ${sha.slice(0, 8)}, not ${map.ebook.sha256.slice(0, 8)}):` +
      ' Project Gutenberg has likely rebuilt ebook #215. Make the map again with a Bridge from the new EPUB' +
      ' (fixtures/call-of-the-wild.readalong.json), or put the old EPUB back in .cache.',
  );
  process.exit(1);
}
// The seeded audio files by their own names: "001 - callofthewild_1_london_64kb.mp3".
const seeded = new Map(
  readdirSync(book)
    .filter((f) => f.endsWith('.mp3'))
    .map((f) => [f.replace(/^\d+ - /, ''), f]),
);
const files = [];
for (const f of map.audio.files) {
  if (!seeded.has(f.path)) break;
  files.push({path: seeded.get(f.path), duration: f.duration});
}
if (!files.length) throw new Error('no audio file of the map is seeded');
const end = files.reduce((t, f) => t + f.duration, 0);
const all = map.sections.reduce((n, s) => n + s.spans.length, 0);
let kept = 0;
for (const s of map.sections) {
  s.spans = s.spans.filter((sp) => sp.end <= end);
  kept += s.spans.length;
}
map.ebook.file = 'The Call of the Wild.epub';
map.audio = {duration: Math.round(end * 100) / 100, files};
map.coverage.text = Math.round(map.coverage.text * (kept / all) * 10000) / 10000;
map.audio_gaps = (map.audio_gaps || []).filter((g) => g.end <= end);
mkdirSync(path.join(book, '.audiosilo'), {recursive: true});
writeFileSync(path.join(book, '.audiosilo', 'readalong.json'), JSON.stringify(map));
console.log(`  read-along: ${files.length} audio files of the map seeded, ${kept} of ${all} sentences kept`);
