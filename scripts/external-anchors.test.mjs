import assert from 'node:assert/strict';
import {globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {checkAnchors, linkTargets, mergeTargets} from './external-anchors.mjs';
import {ROOT} from './pages.mjs';

function guide(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'external-anchors-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, content);
  }
  return dir;
}

test('sync collects full URLs, bare paths and template paths, including multiple links on one line', () => {
  const source = [
    '[One](https://docs.audiosilo.app/users/admin/server#modules) [Two](/users/faq#privacy)',
    '`${DOCS_URL}/users/admin/bridge/#share`',
    'See docs.audiosilo.app/users/faq?lang=en#privacy.',
    'https://example.org/users/admin/server#unrelated /api/users/person#unrelated',
    '/users/faq and /developers/example#unrelated',
  ].join('\n');
  assert.deepEqual(linkTargets(source), [
    '/users/admin/server#modules', '/users/faq#privacy', '/users/admin/bridge#share', '/users/faq#privacy',
  ]);
});

test('a renamed heading keeps its published link with an explicit id', (t) => {
  const dir = guide(t, {
    'admin/server.md': '## A new heading {/* #modules */}',
    'index.md': '---\nslug: /\n---\n### Overview {/* #overview */}',
  });
  assert.deepEqual(checkAnchors(['/users/admin/server#modules', '/users#overview'], dir), []);
});

test('every User Guide page is routed by its file name', () => {
  // checkAnchors maps a link to its file; a slug or id front matter, or a number
  // prefix Docusaurus strips (01-intro.md), would move the page.
  const pages = globSync('**/*.{md,mdx}', {cwd: join(ROOT, 'docs-users')});
  const moved = pages.filter((page) => {
    const front = readFileSync(join(ROOT, 'docs-users', page), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    return /(^|\/)\d+[-_.]/.test(page) || (page !== 'index.md' && /^(slug|id):/m.test(front));
  });
  assert.deepEqual(moved, []);
});

test('a generated id or an example of the explicit id cannot satisfy the check', (t) => {
  const dir = guide(t, {'faq.md': [
    '## Privacy',
    'A paragraph {/* #privacy */}',
    '~~~md', '## Sample {/* #privacy */}', '~~~',
    '# Title {/* #privacy */}',
    '## Inline code `{/* #privacy */}`',
    '## Another heading {/* #private */}',
  ].join('\n\n')});
  assert.deepEqual(checkAnchors(['/users/faq#privacy'], dir), [
    '/users/faq#privacy: missing explicit heading id; another repo links here, so end the heading with {/* #privacy */}',
  ]);
});

test('a missing page fails even when another page declares the id', (t) => {
  const dir = guide(t, {'questions.md': '## Privacy {/* #privacy */}'});
  assert.deepEqual(checkAnchors(['/users/faq#privacy'], dir), [
    '/users/faq#privacy: page missing; another repo links here, so restore the page or redirect it and change that link',
  ]);
});

test('sync keeps an entry no longer found on main, since a shipped app may still link to it', () => {
  const kept = ['/users/faq#privacy', '/users/admin/server#modules'];
  assert.deepEqual(mergeTargets(kept, ['/users/admin/server#modules', '/users/admin/books#series']), [
    '/users/admin/books#series', '/users/admin/server#modules', '/users/faq#privacy',
  ]);
});

test('two headings on one page with the same explicit id fail', (t) => {
  const dir = guide(t, {'faq.md': '## Privacy {/* #privacy */}\n\n### Privacy again {/* #privacy */}'});
  assert.deepEqual(checkAnchors([], dir), [
    'faq.md: two headings have the explicit id #privacy; give one of them another id',
  ]);
});

test('an id repeated in a fence or on the h1 is no second heading, and a third use reports once', (t) => {
  const dir = guide(t, {
    'faq.md': ['# Title {/* #privacy */}', '## Privacy {/* #privacy */}', '```md', '## Sample {/* #privacy */}', '```'].join('\n\n'),
    'admin/server.md': ['## One {/* #modules */}', '## Two {/* #modules */}', '## Three {/* #modules */}'].join('\n\n'),
  });
  assert.deepEqual(checkAnchors(['/users/faq#privacy'], dir), [
    'admin/server.md: two headings have the explicit id #modules; give one of them another id',
  ]);
});
