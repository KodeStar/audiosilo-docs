#!/usr/bin/env node
// Fails when a docs page uses the old admonition title syntax.
//
// With `future.v4` (MDX directives), `:::note Title` no longer parses as an
// admonition: the page shows the literal ":::note Title" text. The form that
// parses is `:::note[Title]`. Lines inside fenced code blocks are skipped, so a
// page may still show the old syntax as an example.
//
// Usage: node scripts/check-admonitions.mjs [dir ...]
// (defaults to docs-users and docs-developers; runs as the npm `prebuild`).

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const TYPES = 'note|tip|info|warning|danger|caution|important|success|secondary';
// An opener with a type followed by whitespace and more text (the old title).
// Leading whitespace and blockquote markers are allowed (lists, quotes).
const OLD_OPENER = new RegExp(`^[\\s>]*:{3,}\\s*(${TYPES})[ \\t]+\\S`);
const FENCE = /^[\s>]*(`{3,}|~{3,})/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules') yield* walk(path);
    } else if (/\.mdx?$/.test(name)) {
      yield path;
    }
  }
}

function findOldOpeners(text) {
  const hits = [];
  let fence = null; // the open fence's marker, e.g. "```" or "~~~~"
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(FENCE);
    if (m) {
      const marker = m[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      return;
    }
    if (fence === null && OLD_OPENER.test(line)) {
      hits.push({line: i + 1, text: line.trim()});
    }
  });
  return hits;
}

const dirs = process.argv.slice(2);
const roots = dirs.length > 0 ? dirs : ['docs-users', 'docs-developers'];
let failures = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    for (const hit of findOldOpeners(readFileSync(file, 'utf8'))) {
      failures++;
      console.error(`${relative(process.cwd(), file)}:${hit.line}: ${hit.text}`);
    }
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
