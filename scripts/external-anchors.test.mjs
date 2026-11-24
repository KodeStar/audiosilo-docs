import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {checkAnchors, linkTargets} from './external-anchors.mjs';

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

test('renamed headings and files keep their published links with explicit ids and slugs', async (t) => {
  const dir = guide(t, {
    'admin/renamed.mdx': '---\nslug: /admin/server\n---\n## A new heading {/* #modules */}',
    'index.md': '---\nslug: /\n---\n### Overview {/* #overview */}',
  });
  assert.deepEqual(await checkAnchors(['/users/admin/server#modules', '/users#overview'], dir), []);
});

test('a generated id or an example of the explicit id cannot satisfy the check', async (t) => {
  const dir = guide(t, {'faq.md': [
    '## Privacy',
    'A paragraph {/* #privacy */}',
    '~~~md', '## Sample {/* #privacy */}', '~~~',
    '# Title {/* #privacy */}',
    '## Inline code `{/* #privacy */}`',
    '## Another heading {/* #private */}',
  ].join('\n\n')});
  assert.deepEqual(await checkAnchors(['/users/faq#privacy'], dir), [
    '/users/faq#privacy: missing explicit heading id',
  ]);
});

test('a missing page fails even when another page declares the id', async (t) => {
  const dir = guide(t, {'faq.md': '---\nslug: /questions\n---\n## Privacy {/* #privacy */}'});
  assert.deepEqual(await checkAnchors(['/users/faq#privacy'], dir), ['/users/faq#privacy: page missing']);
});
