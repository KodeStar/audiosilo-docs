// npm run anchors:sync [-- --workspace <parent of sibling repos>] updates the
// snapshot. The prebuild check reads only that snapshot and the User Guide.
import {existsSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {ROOT, gitGrep, linesOutsideFences} from './pages.mjs';

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

function collectAnchors(workspace) {
  const targets = new Set();
  for (const repo of repos) {
    const ref = repo === 'site' ? 'origin/master' : 'origin/main';
    const lines = gitGrep(join(workspace, `audiosilo-${repo}`), ref, ['-hI', '-e', '/users', '--and', '-e', '#'], '.');
    for (const target of linkTargets(lines.join('\n'))) targets.add(target);
  }
  return [...targets].sort();
}

// An h2-h6 heading ending in the explicit id comment, `## Title {/* #id */}`
// (the theme gives h1 no id).
const explicitId = /^#{2,6}\s.*\{\/\*\s*#([^\s*]+)\s*\*\/\}\s*$/;

function explicitIds(content) {
  return new Set(linesOutsideFences(content).map(({text}) => text.match(explicitId)?.[1]).filter(Boolean));
}

// Every User Guide page is routed by its file name: index.md is /users, and no
// other page sets slug or id front matter (a moved page gets a redirect).
export function checkAnchors(targets, usersDir) {
  const errors = [];
  for (const target of targets) {
    const [page, anchor] = target.split('#');
    const rel = page.replace(/^\/users\/?/, '') || 'index';
    const file = [`${rel}.md`, `${rel}.mdx`].map((f) => join(usersDir, f)).find(existsSync);
    if (!file) errors.push(`${target}: page missing`);
    else if (!explicitIds(readFileSync(file, 'utf8')).has(decodeURIComponent(anchor))) {
      errors.push(`${target}: missing explicit heading id`);
    }
  }
  return errors;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {sync: {type: 'boolean'}, workspace: {type: 'string'}}});
  if (values.sync) {
    const targets = collectAnchors(values.workspace ?? join(ROOT, '..'));
    writeFileSync(snapshot, JSON.stringify(targets, null, 2) + '\n');
    console.log(`external-anchors.json: ${targets.length} distinct targets`);
  } else {
    const targets = JSON.parse(readFileSync(snapshot, 'utf8'));
    const errors = checkAnchors(targets, join(ROOT, 'docs-users'));
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(`external-anchors: ${targets.length} explicit heading ids verified`);
    }
  }
}
