// What the page checks share (check-admonitions.mjs, stale-names.mjs,
// external-anchors.mjs): the docs pages, a page's lines outside fenced code
// blocks, and reading another repo's tree with git.

import {execFileSync} from 'node:child_process';
import {globSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The docs pages, relative to ROOT, sorted. Exits when there are none. */
export function docsPages(check) {
  const files = globSync('{docs-users,docs-developers}/**/*.{md,mdx}', {cwd: ROOT}).sort();
  if (files.length === 0) {
    console.error(`${check}: no docs pages found under ${ROOT}`);
    process.exit(1);
  }
  return files;
}

const FENCE = /^[\s>]*(`{3,}|~{3,})(.*)$/;

/** A page's lines outside fenced code blocks: [{line (1-based), text}]. */
export function linesOutsideFences(text) {
  const out = [];
  let fence = null; // the open fence's marker, e.g. "```" or "~~~~"
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(FENCE);
    if (m) {
      const marker = m[1];
      if (fence === null) {
        fence = marker;
      } else if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        m[2].trim() === '' // a closing fence carries no info string
      ) {
        fence = null;
      }
      return;
    }
    if (fence === null) out.push({line: i + 1, text: line});
  });
  return out;
}

/** Runs git in dir and returns its output. */
export function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', maxBuffer: 64 << 20});
}

/** git grep's output lines at ref (grepArgs: flags and patterns), none when nothing matches. */
export function gitGrep(dir, ref, grepArgs, ...paths) {
  try {
    return git(dir, 'grep', ...grepArgs, ref, '--', ...paths).split('\n').filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // no match
    throw e;
  }
}
