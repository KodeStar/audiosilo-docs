// Tests for the doc-staleness lint (node's own test runner; the npm `prebuild`
// runs them before the lint itself).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {allowList, codeSpans, configKeysFrom, routeKnown, routesFrom, staleNames} from './stale-names.mjs';

const ROUTES = [
  '/',
  '/admin/',
  '/web/',
  '/api/v1/server',
  '/api/v1/libraries/{id}/item',
  '/api/v1/libraries/{id}/fs',
  '/api/v1/me/collections/{id}',
  '/api/v1/auth/oidc/start',
  '/api/v1/admin/settings',
];

test('routeKnown: a route the server has, in the forms pages write it', () => {
  for (const path of [
    '/api/v1/server',
    '/server',
    '/libraries/{id}/item',
    '/libraries/<lib>/item',
    '/libraries/:id/item',
    '/fs', // the short form of /libraries/{id}/fs
    '/admin', // under the /admin/ subtree
    '/web/reader.html',
    '/me/collections/*',
    '/auth/oidc/start',
    '/admin/settings', // the API route, written without /api/v1
  ]) {
    assert.equal(routeKnown(path, ROUTES), true, path);
  }
});

test('routeKnown: a route the server does not have', () => {
  for (const path of [
    '/uploads',
    '/api/me', // not /api/v1/me
    '/libraries/{id}/nope',
    '/libraries/{id}/item/extra',
    '/collections', // a short form must end like a route, placeholders aside
    '/auth/oidc/admin',
    '/admin/gone', // an API group: the console's /admin/ subtree does not cover it
    '/api/v1/admin/gone',
  ]) {
    assert.equal(routeKnown(path, ROUTES), false, path);
  }
});

test('routesFrom: method patterns and the path constants joined to a method only', () => {
  const routes = routesFrom(
    ['"GET /api/v1/server"', '"POST /api/v1/libraries/{id}/history"', '"GET "+oidcStartPath', '"HEAD "+p', '"/api/v1/works/"'],
    {oidcStartPath: '/api/v1/auth/oidc/start'},
  );
  assert.deepEqual(routes, ['/api/v1/auth/oidc/start', '/api/v1/libraries/{id}/history', '/api/v1/server']);
});

test('configKeysFrom: yaml tags through the section structs, lists not walked', () => {
  const src = `
type Config struct {
	Name      string        \`yaml:"name"\`
	TLS       TLSConfig     \`yaml:"tls"\`
	Libraries []Library     \`yaml:"libraries"\`
	Meta      *MetaConfig   \`yaml:"metadata,omitempty"\`
	Hidden    string        \`yaml:"-"\`
}

type TLSConfig struct {
	Mode  TLSMode  \`yaml:"mode"\`
	Hosts []string \`yaml:"hosts"\`
}

type Library struct {
	Root string \`yaml:"root"\`
}

type MetaConfig struct {
	Region string \`yaml:"region"\`
	MirrorSettings struct {
		Interval time.Duration \`yaml:"interval,omitempty"\`
		Retry    *struct {
			After time.Duration \`yaml:"after"\`
		} \`yaml:"retry"\`
	} \`yaml:"mirror,omitempty"\`
	Sources []struct {
		URL string \`yaml:"url"\`
	} \`yaml:"sources"\`
}
`;
  assert.deepEqual(configKeysFrom([src]), [
    'libraries',
    'metadata',
    'metadata.mirror',
    'metadata.mirror.interval',
    'metadata.mirror.retry',
    'metadata.mirror.retry.after',
    'metadata.region',
    'metadata.sources',
    'name',
    'tls',
    'tls.hosts',
    'tls.mode',
  ]);
});

test('codeSpans keeps a fence open across a line with an info string', () => {
  // A "```bash" line inside a ``` block opens nothing and closes nothing.
  const spans = codeSpans('```\n```bash\n`two`\n```\n`three`\n');
  assert.deepEqual(
    spans.map((s) => [s.line, s.code]),
    [[5, 'three']],
  );
});

test('codeSpans skips fenced blocks', () => {
  const spans = codeSpans('a `one` b\n```\n`two`\n```\n`three`\n');
  assert.deepEqual(
    spans.map((s) => [s.line, s.code]),
    [
      [1, 'one'],
      [5, 'three'],
    ],
  );
});

const NAMES = {
  capabilities: ['metadata', 'cast'],
  routes: ROUTES,
  config: ['tls', 'tls.mode', 'metadata', 'metadata.enabled'],
  settings: ['general.name'],
  serverFields: ['auth', 'auth.methods'],
  env: ['AUDIOSILO_TLS_MODE'],
};

test('staleNames: a page naming only what the server has passes', () => {
  const page = [
    'The `metadata` capability, capability `cast`, `capabilities.metadata`.',
    'Ask `GET /libraries/{id}/item?path=` or `/api/v1/server`.',
    'Set `tls.mode` (`AUDIOSILO_TLS_MODE=off`), see `general.name` and `auth.methods`.',
    'Files and hosts are not keys: `metadata.json`, `demo.audiosilo.app`. Neither is `catalog.ListBooks`.',
    'The Bridge `AUDIOSILO_BRIDGE_LISTEN` is the Bridge\'s.',
  ].join('\n');
  assert.deepEqual(staleNames('docs-developers/server/x.md', page, NAMES), []);
});

test('staleNames: a removed capability, route, key and variable are each reported', () => {
  const page = [
    'The `podcast_magic` capability and `capabilities.gone`.',
    '`GET /libraries/{id}/vanished` then `/api/v1/old`.',
    '`tls.retired` and `AUDIOSILO_OLD_SWITCH`.',
    '```',
    '`GET /in/a/code/block` is not read',
    '```',
  ].join('\n');
  assert.deepEqual(staleNames('docs-developers/server/x.md', page, NAMES), [
    {line: 1, kind: 'capability', name: 'podcast_magic'},
    {line: 1, kind: 'capability', name: 'gone'},
    {line: 2, kind: 'route', name: '/libraries/{id}/vanished'},
    {line: 2, kind: 'route', name: '/api/v1/old'},
    {line: 3, kind: 'config', name: 'tls.retired'},
    {line: 3, kind: 'env', name: 'AUDIOSILO_OLD_SWITCH'},
  ]);
});

test('staleNames: Bridge and meta pages are checked for capabilities only', () => {
  const page = 'The `gone` capability; `GET /api/jobs`; `tls.anything`; `AUDIOSILO_ANY`.';
  assert.deepEqual(staleNames('docs-developers/bridge/x.md', page, NAMES), [
    {line: 1, kind: 'capability', name: 'gone'},
  ]);
});

test('staleNames: each alternative of a/b|c is checked', () => {
  const page = '`GET /libraries/{id}/item|fs|nope`';
  assert.deepEqual(staleNames('docs-developers/server/x.md', page, NAMES), [
    {line: 1, kind: 'route', name: '/libraries/{id}/nope'},
  ]);
});

test('allow-list literals stay exact and patterns match the whole name', () => {
  const pattern = 'pattern:(?:/api/v1)?/works/(?:match|\\{id\\})';
  const unused = 'pattern:/elsewhere/.+';
  const allow = allowList({
    'metadata.health': 'response field',
    '/works/one': 'one exact route',
    [pattern]: 'metadata service routes',
    [unused]: 'unused pattern',
  });
  assert.equal(allow.allows('metadata.health'), true);
  assert.equal(allow.allows('metadataXhealth'), false);
  assert.equal(allow.allows('constructor'), false);
  assert.equal(allow.allows('/works/one'), true);
  assert.ok(allow.unused.has(pattern));
  assert.equal(allow.allows('/works/{id}'), true);
  assert.equal(allow.allows('/api/v1/works/match'), true);
  assert.equal(allow.allows('/other/works/match'), false);
  assert.equal(allow.allows('/works/serach'), false);
  assert.equal(allow.allows('/works/{id}/typo'), false);
  assert.deepEqual([...allow.unused], [unused]);
});

test('an invalid allow-list pattern fails when the list is loaded', () => {
  assert.throws(() => allowList({'pattern:[': 'broken pattern'}), SyntaxError);
});
