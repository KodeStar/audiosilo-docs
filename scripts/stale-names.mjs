#!/usr/bin/env node
// The doc-staleness lint (audiosilo#96): fails when a page names a server
// capability flag, API route, config key or environment variable that the
// server no longer has, as of a pinned server commit.
//
// What the server has is a committed snapshot, scripts/server-names.json, so
// the build stays offline and the same everywhere:
//
//   node scripts/stale-names.mjs --sync [--server <dir>] [--ref <rev>]
//       read the names at <rev> (default origin/main) of the server checkout
//       <dir> (default ../audiosilo-server) into the snapshot, pinning the commit
//   node scripts/stale-names.mjs
//       the lint (runs in the npm `prebuild`); every name it reads is in
//       backticks, `like this`:
//         capabilities  `x` capability, capability `x`, capabilities.x
//         routes        `GET /path` (any method) or `/api/v1/path`
//         config keys   `section.key`, its first part a config section (also
//                       accepted: a console setting id and a GET /server field)
//         env vars      `AUDIOSILO_*` (the Bridge's AUDIOSILO_BRIDGE_* and
//                       AUDIOSILO_WORKER_* are the Bridge's own, not checked)
//
// Routes, config keys and env vars are not checked on the Bridge and meta
// pages (docs-developers/bridge/, docs-developers/meta/): those name their own
// services' routes and settings. A name a page means to keep (a planned
// route, another repo's variable) goes in scripts/stale-names-allow.json with
// why. npm run names:sync re-pins after a server change.

import {readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT, docsPages, git, gitGrep, linesOutsideFences} from './pages.mjs';

const SNAPSHOT = join(ROOT, 'scripts', 'server-names.json');
const ALLOW = join(ROOT, 'scripts', 'stale-names-allow.json');
const REPO = 'KodeStar/audiosilo-server';
const OTHER_SERVICES = /^docs-developers\/(bridge|meta)\//;

// ---- reading the server -------------------------------------------------

// -h drops the "<ref>:<path>:" prefix: one bare match per line.
const grepMatches = (dir, ref, pattern, ...paths) => gitGrep(dir, ref, ['-hoE', pattern], ...paths);

/**
 * Every route the server's mux registers, as a path (methods dropped): each
 * "METHOD /path" literal, and each path constant a pattern joins to a method
 * ("GET "+oidcStartPath). A bare "/api/v1/..." string is not counted: most are
 * prefixes the code compares with, or another service's URLs.
 */
export function routesFrom(patterns, constants) {
  const out = new Set();
  for (const lit of patterns) {
    const m = lit.match(/^"[A-Z]+ (\/[^"]*)"$/);
    if (m) out.add(m[1]);
    const c = lit.match(/^"[A-Z]+ "\s*\+\s*(\w+)$/);
    if (c && constants[c[1]]) out.add(constants[c[1]]);
  }
  return [...out].sort();
}

/**
 * The config's dotted keys, from the config package's structs: each field's
 * yaml tag, expanded through the struct types it names, from Config down.
 */
export function configKeysFrom(goSources) {
  const structs = new Map();
  function readStruct(name, body) {
    // An inline struct carries its yaml tag on its closing brace: name it
    // <outer>.<field> and read it like a named one, so the walk below needs
    // no special case (a list of them keeps its [] and is not walked).
    const inline = /^([ \t]+)(\w+)\s+([[\]*]*)struct \{\n([\s\S]*?)^\1\}([^\n]*)/gm;
    const namedFields = body.replace(inline, (_, indent, field, prefix, inner, tag) => {
      readStruct(`${name}.${field}`, inner);
      return `${indent}${field} ${prefix}${name}.${field}${tag}`;
    });
    const fields = [];
    for (const line of namedFields.split('\n')) {
      const f = line.match(/^\s*\w+\s+([\w.*[\]]+)\s+`[^`]*yaml:"([a-z0-9_]+)/);
      if (f) fields.push({key: f[2], type: f[1].replace(/^\*+/, '')});
    }
    structs.set(name, fields);
  }
  const structRe = /^type (\w+) struct \{\n([\s\S]*?)^\}/gm;
  for (const src of goSources) {
    for (const [, name, body] of src.matchAll(structRe)) readStruct(name, body);
  }
  const keys = new Set();
  const walk = (type, prefix, seen) => {
    for (const {key, type: t} of structs.get(type) ?? []) {
      const full = prefix ? `${prefix}.${key}` : key;
      keys.add(full);
      // A list (`libraries`) has no dotted keys: only a section is walked.
      if (structs.has(t) && !seen.has(t)) walk(t, full, new Set([...seen, t]));
    }
  };
  walk('Config', '', new Set(['Config']));
  return [...keys].sort();
}

function readServer(server, rev) {
  const ref = git(server, 'rev-parse', `${rev}^{commit}`).trim();
  const golden = JSON.parse(git(server, 'show', `${ref}:internal/api/testdata/wire/server.json`));
  const capabilities = Object.keys(golden.shape.capabilities).sort();
  // GET /server's own fields (`auth.methods`), which pages name like keys.
  const serverFields = [];
  const walk = (shape, prefix) => {
    if (shape === null || typeof shape !== 'object' || Array.isArray(shape)) return;
    for (const [k, v] of Object.entries(shape)) {
      serverFields.push(prefix + k);
      walk(v, `${prefix}${k}.`);
    }
  };
  walk(golden.shape, '');
  const goFiles = ['internal/*.go', ':!*_test.go'];
  const constants = Object.fromEntries(
    grepMatches(server, ref, '[A-Za-z0-9_]+[[:space:]]+= "/[^"]*"', ...goFiles).map((m) => {
      const [, name, value] = m.match(/(\w+)\s+= "([^"]*)"/);
      return [name, value];
    }),
  );
  const routes = routesFrom(
    grepMatches(server, ref, '"(GET|POST|PUT|PATCH|DELETE|HEAD) (/[A-Za-z0-9_./{}$-]*"|"[[:space:]]*\\+[[:space:]]*[A-Za-z0-9_]+)', ...goFiles),
    constants,
  );
  const configFiles = git(server, 'ls-tree', '--name-only', `${ref}:internal/config`)
    .split('\n')
    .filter((n) => n.endsWith('.go') && !n.endsWith('_test.go'));
  const config = configKeysFrom(
    configFiles.map((n) => git(server, 'show', `${ref}:internal/config/${n}`)),
  );
  // The console's setting ids ("metadata.upcoming") and the read-only facts
  // GET /admin/settings adds ("metadata.region_chosen"), which pages name too.
  const settings = [
    ...new Set([
      ...grepMatches(server, ref, 'setting: *"[a-z0-9_]+\\.[a-z0-9_]+"', 'internal/config/settings.go').map(
        (m) => m.match(/"(.*)"/)[1],
      ),
      ...grepMatches(server, ref, 'sections\\["[a-z_]+"\\]\\["[a-z_]+"\\]', 'internal/api/handlers_settings.go').map(
        (m) => m.replace(/sections\["([a-z_]+)"\]\["([a-z_]+)"\]/, '$1.$2'),
      ),
    ]),
  ].sort();
  // Code, tests and config, not prose: a variable the server dropped can live on
  // in its own README or CHANGELOG.
  const env = [...new Set(grepMatches(server, ref, 'AUDIOSILO_[A-Z0-9_]*[A-Z0-9]', '.', ':!*.md'))].sort();
  return {repo: REPO, ref, capabilities, routes, config, settings, serverFields: serverFields.sort(), env};
}

// ---- reading the docs ---------------------------------------------------

/** The backticked spans of a page, with their line numbers, outside fenced blocks. */
export function codeSpans(text) {
  return linesOutsideFences(text).flatMap(({line, text: lineText}) =>
    [...lineText.matchAll(/`([^`]+)`/g)].map((m) => ({line, code: m[1], index: m.index, text: lineText})),
  );
}

// A route as segments, each placeholder ({id}, <id>, :id) null, whether it
// covers everything below it (a trailing `*`, `…` or {rest...}, or a mux
// subtree pattern ending in `/`), and whether it was under /api/v1.
function parseRoute(path) {
  let p = path
    .replace(/\[[^\]]*\]/g, '') // `/connect[/]`, `/admin[/…]`, `/book[?path=]`: the optional part
    .replace(/[?#].*$/, '');
  const api = /^\/api\/v1(\/|$)/.test(p);
  p = p.replace(/^\/api\/v1(?=\/|$)/, '').replace(/\/\{\$\}$/, '');
  let open = false;
  if (/\/(\*|…|\{[^}]*\.\.\.\})$/.test(p)) {
    open = true;
    p = p.replace(/\/[^/]*$/, '');
  } else if (p.length > 1 && p.endsWith('/')) {
    open = true;
    p = p.slice(0, -1);
  }
  const segs = p
    .split('/')
    .filter(Boolean)
    .map((s) => (/^(\{.*\}|<.*>|:\w+)$/.test(s) ? null : s));
  return {segs, open, api};
}

const segEq = (a, b) => a === null || b === null || a === b;

/**
 * Whether a route a page names is one of the server's: placeholders match
 * anything, an open route covers what is under it, and a short form naming a
 * route's last segments (`GET /fs` for /libraries/{id}/fs) counts. A page
 * writes API routes without /api/v1 too, so a web subtree (the console's
 * `/admin/`) does not cover a route below it that names an API group
 * (`/admin/settings`): that one must be an API route.
 */
export function routeKnown(path, routes) {
  const doc = parseRoute(path);
  const parsed = routes.map(parseRoute);
  const apiGroups = new Set(parsed.filter((r) => r.api).map((r) => r.segs[0]));
  return parsed.some((srv) => {
    const prefix = (a, b) => a.segs.length >= b.segs.length && b.segs.every((s, i) => segEq(s, a.segs[i]));
    const covers = srv.api || doc.segs.length === srv.segs.length || !apiGroups.has(doc.segs[0]);
    if (srv.open && srv.segs.length > 0 && prefix(doc, srv) && covers) return true;
    if (doc.open && prefix(srv, doc)) return true;
    if (srv.segs.length === doc.segs.length && prefix(srv, doc)) return true;
    // The short form: the page's literal segments are the route's own last ones.
    const tail = srv.segs.slice(srv.segs.length - doc.segs.length);
    return !doc.open && doc.segs.some((s) => s !== null) && srv.segs.length > doc.segs.length &&
      doc.segs.every((s, i) => s === null || s === tail[i]);
  });
}

// A dotted name ending like a file (`metadata.json`, `scan.go`) or a host
// (`demo.audiosilo.app`) is not a key.
const NOT_A_KEY = /\.(json|go|ya?ml|md|mdx|ts|tsx|js|mjs|cjs|html|css|png|svg|ics|epub|sql|txt|sh|app|com|org|net|io)$/;

/** What a page names that the snapshot does not have: [{line, kind, name}]. */
export function staleNames(file, text, names) {
  const known = {
    capability: new Set(names.capabilities),
    config: new Set([...names.config, ...names.settings, ...names.serverFields]),
    env: new Set(names.env),
  };
  // A section: the first part of a dotted key (a list such as `libraries` has none).
  const sections = new Set([...known.config].filter((k) => k.includes('.')).map((k) => k.split('.')[0]));
  const ownService = !OTHER_SERVICES.test(file);
  const hits = [];
  const hit = (line, kind, name) => hits.push({line, kind, name});
  for (const {line, code, index, text: lineText} of codeSpans(text)) {
    const before = lineText.slice(0, index);
    const after = lineText.slice(index + code.length + 2);
    // Capabilities: `x` capability, capability `x`, capabilities.x.
    const cap = code.match(/^capabilities\.([a-z_]+)$/);
    if (cap) {
      if (!known.capability.has(cap[1])) hit(line, 'capability', cap[1]);
    } else if (/^[a-z_]+$/.test(code) && (/^\s*capabilit(y|ies)\b/.test(after) || /\bcapability\s*$/.test(before))) {
      if (!known.capability.has(code)) hit(line, 'capability', code);
    }
    if (!ownService) continue;
    // Routes.
    const route = code.match(/^(?:(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\/\S*)|(\/api\/v1\/\S*))$/);
    if (route) {
      // The query and optional parts first: a `|` in them is not an alternative.
      const path = (route[1] ?? route[2]).replace(/\[[^\]]*\]/g, '').replace(/[?#].*$/, '');
      // `/podcasts/discovery/providers|search|artwork`: each alternative.
      const alts = path.match(/^(.*\/)([^/]*\|[^/]*)$/);
      for (const p of alts ? alts[2].split('|').map((a) => alts[1] + a) : [path]) {
        if (!routeKnown(p, names.routes)) hit(line, 'route', p);
      }
      continue;
    }
    // Config keys and console settings: dotted, lower case, the first part a section.
    const key = code.match(/^([a-z_]+)(\.[a-z0-9_]+)+$/);
    if (key && sections.has(key[1]) && !NOT_A_KEY.test(code) && !known.config.has(code)) {
      hit(line, 'config', code);
    }
    // Environment variables.
    const env = code.match(/^(AUDIOSILO_[A-Z0-9_]+)(=.*)?$/);
    if (env && !/^AUDIOSILO_(BRIDGE|WORKER)_/.test(env[1]) && !known.env.has(env[1])) {
      hit(line, 'env', env[1]);
    }
  }
  return hits;
}

// ---- the commands ---------------------------------------------------------

function lint() {
  const names = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const allow = JSON.parse(readFileSync(ALLOW, 'utf8'));
  const files = docsPages('stale-names');
  const used = new Set();
  let failures = 0;
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const h of staleNames(file, text, names)) {
      if (h.name in allow) {
        used.add(h.name);
        continue;
      }
      failures++;
      console.error(`${file}:${h.line}: ${h.kind} \`${h.name}\` is not in ${REPO}@${names.ref.slice(0, 12)}`);
    }
  }
  for (const name of Object.keys(allow)) {
    if (!used.has(name)) {
      failures++;
      console.error(`scripts/stale-names-allow.json: \`${name}\` is named by no page now (or the server has it): remove it`);
    }
  }
  if (failures > 0) {
    console.error(
      `\nstale-names: ${failures} problem(s). Fix the page, or if the server changed on purpose ` +
        're-pin with npm run names:sync; a name kept on purpose goes in scripts/stale-names-allow.json.',
    );
    process.exit(1);
  }
}

function sync() {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const names = readServer(
    arg('--server') ?? join(ROOT, '..', 'audiosilo-server'),
    arg('--ref') ?? 'origin/main',
  );
  writeFileSync(SNAPSHOT, JSON.stringify(names, null, 2) + '\n');
  console.log(
    `server-names.json: ${REPO}@${names.ref}: ${names.capabilities.length} capabilities, ` +
      `${names.routes.length} routes, ${names.config.length} config keys, ${names.env.length} env vars`,
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--sync')) sync();
  else lint();
}
