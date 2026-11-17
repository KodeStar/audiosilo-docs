#!/usr/bin/env node
// Fails when a docs page uses the old admonition title syntax.
//
// `future.v4` turns off `markdown.mdx1Compat.admonitions`, so `:::note Title`
// no longer parses as an admonition: the page shows the literal ":::note Title"
// text. The form that parses is `:::note[Title]`. Lines inside fenced code
// blocks are skipped, so a page may still show the old syntax as an example.
//
// Usage: node scripts/check-admonitions.mjs (runs as the npm `prebuild`).

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT, docsPages, linesOutsideFences} from './pages.mjs';

const TYPES = 'note|tip|info|warning|danger|caution|important|success|secondary';
// An opener with a type followed by whitespace and more text (the old title).
// Leading whitespace and blockquote markers are allowed (lists, quotes).
const OLD_OPENER = new RegExp(`^[\\s>]*:{3,}\\s*(${TYPES})[ \\t]+\\S`);

function findOldOpeners(text) {
  return linesOutsideFences(text)
    .filter(({text: line}) => OLD_OPENER.test(line))
    .map(({line, text: l}) => ({line, text: l.trim()}));
}

const files = docsPages('check-admonitions');

let failures = 0;
for (const file of files) {
  for (const hit of findOldOpeners(readFileSync(join(ROOT, file), 'utf8'))) {
    failures++;
    console.error(`${file}:${hit.line}: ${hit.text}`);
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} admonition(s) use the old ":::type Title" syntax, which renders as raw text.` +
      '\nWrite the title in brackets instead: ":::type[Title]".',
  );
  process.exit(1);
}
console.log('check-admonitions: ok');
