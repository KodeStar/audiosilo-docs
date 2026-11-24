// npm run anchors:sync [-- --workspace <parent of sibling repos>] updates the
// snapshot. The prebuild check reads only that snapshot and the User Guide.
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join, posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {DEFAULT_PARSE_FRONT_MATTER, Globby, GlobExcludeDefault} from '@docusaurus/utils';
import slug from '@docusaurus/plugin-content-docs/lib/slug.js';
import {DefaultNumberPrefixParser} from '@docusaurus/plugin-content-docs/lib/numberPrefix.js';
import {createProcessor} from '@mdx-js/mdx';
import {visit} from 'unist-util-visit';
import {ROOT} from './pages.mjs';

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
    const dir = join(workspace, `audiosilo-${repo}`);
    const ref = repo === 'site' ? 'origin/master' : 'origin/main';
    let lines;
    try {
      const args = ['-C', dir, 'grep', '-hI', '-e', '/users', '--and', '-e', '#', ref, '--', '.'];
      lines = execFileSync('git', args, {encoding: 'utf8', maxBuffer: 64 << 20});
    } catch (err) {
      if (err.status === 1) continue; // git grep found no matches
      throw err;
    }
    for (const target of linkTargets(lines)) targets.add(target);
  }
  return [...targets].sort();
}

const mdx = createProcessor();

function explicitIds(content) {
  const ids = new Set();
  visit(mdx.parse(content), 'heading', (heading) => {
    // The theme omits h1 ids. For h2-h6 Docusaurus takes a single comment
    // from the last MDX expression in the heading.
    if (heading.depth === 1) return;
    const last = heading.children.at(-1);
    const program = last?.data?.estree;
    if (program?.body.length === 0 && program.comments?.length === 1 && last.type === 'mdxTextExpression') {
      const [firstWord] = program.comments[0].value.trim().split(' ');
      if (firstWord.startsWith('#')) ids.add(firstWord.slice(1));
    }
  });
  return ids;
}

export async function checkAnchors(targets, usersDir) {
  const pages = new Map();
  const wanted = new Set(targets.map((target) => target.split('#')[0]));
  const sources = await Globby('**/*.{md,mdx}', {cwd: usersDir, ignore: GlobExcludeDefault});
  for (const source of sources) {
    const filePath = join(usersDir, source);
    const fileContent = readFileSync(filePath, 'utf8');
    const {frontMatter, content} = await DEFAULT_PARSE_FRONT_MATTER({filePath, fileContent});
    if (frontMatter.draft) continue;
    // Use the docs plugin's route rules, including slug overrides and index pages.
    const {name, dir} = posix.parse(source);
    const stripPrefixes = frontMatter.parse_number_prefixes !== false;
    const pageSlug = slug.default({
      source,
      sourceDirName: dir || '.',
      baseID: frontMatter.id ?? (stripPrefixes ? DefaultNumberPrefixParser(name).filename : name),
      frontMatterSlug: frontMatter.slug,
      stripDirNumberPrefixes: stripPrefixes,
    });
    const page = posix.join('/users', pageSlug).replace(/\/$/, '');
    if (wanted.has(page)) pages.set(page, explicitIds(content));
  }
  const errors = [];
  for (const target of targets) {
    const {pathname: page, hash} = new URL(target, 'https://docs.audiosilo.app');
    if (!pages.has(page)) errors.push(`${target}: page missing`);
    else if (!pages.get(page).has(decodeURIComponent(hash.slice(1)))) {
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
    const errors = await checkAnchors(targets, join(ROOT, 'docs-users'));
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(`external-anchors: ${targets.length} explicit heading ids verified`);
    }
  }
}
