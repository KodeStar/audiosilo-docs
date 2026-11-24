// npm run anchors:sync [-- --workspace <parent of sibling repos>] adds to the
// snapshot the links on each sibling repo's origin branch as last fetched (no
// network). It never removes one: a shipped app may still link to it.
// The prebuild check reads only that snapshot and the User Guide.
import {existsSync, globSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {ROOT, git, gitGrep, linesOutsideFences} from './pages.mjs';

const snapshot = join(ROOT, 'scripts/external-anchors.json');
const repos = ['frontend', 'server', 'bridge', 'site', 'meta'];

// Accept a bare guide path, a path following a template expression, or a URL
// on the docs host. Other hosts and paths such as /api/users/ are unrelated.
const guideLink = /(?<![\w./:-])(?:(?:https?:\/\/|\/\/)?docs\.audiosilo\.app)?(\/users(?=[/#?])[^\s"'`()[\]{}<>]*)/gu;

export function linkTargets(text) {
  const targets = [];
  for (const [, link] of text.matchAll(guideLink)) {
    const {pathname, hash} = new URL(link.replace(/[.,;:!?]+$/, ''), 'https://docs.audiosilo.app');
    if (hash) targets.push(pathname.replace(/\/$/, '') + hash);
  }
  return targets;
}

// The workspace holding the sibling repos: the main checkout's parent, also from
// a worktree kept elsewhere (its git common dir is the main checkout's .git).
function defaultWorkspace() {
  return dirname(dirname(git(ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim()));
}

function collectAnchors(workspace) {
  const targets = new Set();
  for (const repo of repos) {
    const dir = join(workspace, `audiosilo-${repo}`);
    if (!existsSync(dir)) {
      console.error(`anchors:sync: no ${dir}; clone it, or pass the folder holding the sibling repos: npm run anchors:sync -- --workspace <dir>`);
      process.exit(1);
    }
    const ref = repo === 'site' ? 'origin/master' : 'origin/main';
    const lines = gitGrep(dir, ref, ['-hI', '-e', '/users', '--and', '-e', '#'], '.');
    for (const target of linkTargets(lines.join('\n'))) targets.add(target);
  }
  return targets;
}

/** The snapshot after a sync: every kept entry and every link found, sorted. */
export const mergeTargets = (kept, found) => [...new Set([...kept, ...found])].sort();

// An h2-h6 heading ending in the explicit id comment, `## Title {/* #id */}`
// (the theme gives h1 no id).
const explicitId = /^#{2,6}\s.*\{\/\*\s*#([^\s*]+)\s*\*\/\}\s*$/;

// A page's explicit heading ids, and those given to more than one heading.
function explicitIds(file) {
  const ids = new Set();
  const repeated = new Set();
  for (const {text} of linesOutsideFences(readFileSync(file, 'utf8'))) {
    const id = text.match(explicitId)?.[1];
    if (id) (ids.has(id) ? repeated : ids).add(id);
  }
  return {ids, repeated};
}

// Every User Guide page is routed by its file name: index.md is /users, and no
// other page sets slug or id front matter (a moved page gets a redirect).
export function checkAnchors(targets, usersDir) {
  const errors = [];
  const pages = new Map(); // file -> its explicit ids
  for (const page of globSync('**/*.{md,mdx}', {cwd: usersDir}).sort()) {
    const file = join(usersDir, page);
    const found = explicitIds(file);
    pages.set(file, found);
    for (const id of found.repeated) {
      errors.push(`${page}: two headings have the explicit id #${id}; give one of them another id`);
    }
  }
  for (const target of targets) {
    const [page, anchor] = target.split('#');
    const rel = page.replace(/^\/users\/?/, '') || 'index';
    const file = [`${rel}.md`, `${rel}.mdx`].map((f) => join(usersDir, f)).find((f) => pages.has(f));
    if (!file) {
      errors.push(`${target}: page missing; another repo links here, so restore the page or redirect it and change that link`);
    } else if (!pages.get(file).ids.has(decodeURIComponent(anchor))) {
      errors.push(`${target}: missing explicit heading id; another repo links here, so end the heading with {/* #${anchor} */}`);
    }
  }
  return errors;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {sync: {type: 'boolean'}, workspace: {type: 'string'}}});
  if (values.sync) {
    const kept = existsSync(snapshot) ? JSON.parse(readFileSync(snapshot, 'utf8')) : [];
    const found = collectAnchors(values.workspace ?? defaultWorkspace());
    const targets = mergeTargets(kept, found);
    writeFileSync(snapshot, JSON.stringify(targets, null, 2) + '\n');
    const had = new Set(kept);
    console.log(`external-anchors.json: ${targets.length} targets, ${targets.filter((target) => !had.has(target)).length} added`);
    const unlinked = [...had].filter((target) => !found.has(target));
    if (unlinked.length) {
      console.log(`Kept, though no repo's origin links to them now (remove by hand once no shipped app does):\n${unlinked.join('\n')}`);
    }
  } else {
    const targets = JSON.parse(readFileSync(snapshot, 'utf8'));
    const errors = checkAnchors(targets, join(ROOT, 'docs-users'));
    if (errors.length) {
      console.error(errors.join('\n'));
      // Only a snapshot entry's error starts with its /users link.
      if (errors.some((error) => error.startsWith('/users'))) console.error('An entry stays even after the other repo drops its link, since a shipped app may still use it. Remove one from scripts/external-anchors.json only by hand, with the reason in the commit.');
      process.exitCode = 1;
    } else {
      console.log(`external-anchors: ${targets.length} explicit heading ids verified`);
    }
  }
}
