---
title: Meta HTTP API
description: "The metaserve read-only JSON API reference: every /api/v1 route, the Audiobookshelf provider at /abs/search, the production release webhook, CORS behavior, and how the server refreshes its artifact from GitHub Releases."
---

`metaserve` (`cmd/metaserve` over `internal/serve`) is a **read-only** JSON API
over the compiled SQLite artifact. All data is public, so there is **no auth**;
every `/api/v1` route (and `/abs/search`) responds with permissive CORS
(`Access-Control-Allow-Origin: *`, `Vary: Origin`), and responses are
gzip-compressed. Cross-origin `GET`s work from any browser; there is no
preflight handling, so requests must stay CORS-simple (no custom headers). It
can also serve a static site at `/` (`--site`) and hot-swaps a newer release
artifact without a restart.

Errors are a JSON envelope `{"error": "..."}` with the matching HTTP status. All
routes are `GET`.

## `/healthz`

Liveness plus a cheap freshness signal. Always 200 while a snapshot is loaded:

```json
{ "status": "ok", "built_at": "2026-07-15T...", "works": 1234 }
```

## `/api/v1/stats`

Catalogue totals, precomputed once per loaded snapshot:

```json
{ "works": 0, "recordings": 0, "people": 0, "series": 0,
  "total_runtime_min": 0, "total_chapters": 0, "built_at": "..." }
```

## `/api/v1/search?q=&limit=`

Full-text search over works, people, and series. `q` is **required** (400 `q is
required` when empty). `limit` defaults to 20, clamped to `[1, 50]`. Returns
`{"results": [...]}`, best-ranked first; each result is one of three shapes
distinguished by `kind`:

- **work**: `{kind, id, title, authors[], series, cover_url, added_at, narrators[]}`
- **person**: `{kind, id, name}`
- **series**: `{kind, id, name, works}` (`works` = member count)

FTS input is escaped defensively (every token quoted, the final token
prefixed with `*`), so no user input can break the underlying `MATCH`.

## `/api/v1/works/latest?limit=`

The newest works, for the site's landing grid. `limit` defaults to 12, clamped to
`[1, 50]`. Returns `{"works": [workCard...]}` ordered by `added_at` descending
(then title), with at most two works from any one series so a bulk import sharing
one date can't fill the grid. A **workCard** is the compact shape reused across
lists and lookups: `{id, title, authors[], series, cover_url, added_at}`.

## `/api/v1/works/{id}`

The full work document, or 404 `work not found`. It carries the work's
identifiers, its `authors[]` and `series[]`, every `recordings[]` entry (with
narrators, ASINs, ISBNs, and a `chapter_count`), and - when the loaded artifact is
new enough and the work has them - the inline expressive layer:

- `characters[]` - `{id, name, aliases?, role?, reveal:{chapter}, description?, xref?}`
- `recaps[]` - `{through:{chapter}, scope?, text}`
- `recap_summary` - `{in_short?, ending?}`

All three are `omitempty` and gated on the artifact `schema_version`
(characters/recaps at 2, recap summary at 3), so an older artifact simply omits
them (see [the data model](data-model.md#the-compiled-artifact-and-schema-versioning)).

## `/api/v1/works/{id}/recordings/{rid}/chapters`

The chapter list for one recording of a work: `{"chapters": [{title, start_ms,
length_ms}]}`, ordered by chapter index. An unknown work/recording yields an empty
list, not a 404.

## `/api/v1/people/{id}`

A person plus their works, or 404 `person not found`:

```json
{ "id": "...", "name": "...", "sort_name": "...",
  "authored": [workCard...],
  "narrated": [{ "work": workCard, "recording_id": "..." }] }
```

## `/api/v1/series/{id}`

A series with its ordered member works, or 404 `series not found`:

```json
{ "id": "...", "name": "...", "authors": [personRef...],
  "works": [{ "position": "2.5", "work": workCard }] }
```

`works` is sorted by the numeric start of each `position` string (so `"1-3.5"`
sorts by 1).

## `/api/v1/lookup?asin=|isbn=`

Resolve one identifier to a work. At least one of `asin` / `isbn` is **required**
(400 `asin or isbn is required`); a miss is 404 `not found`. On a hit:

```json
{ "work": workCard, "recording_id": "..." }
```

ASIN resolves against recording ASINs; ISBN resolves against recording ISBNs and
then falls back to a work's print ISBN (pointing at its first recording). This is
the entry point the AudioSilo server's `internal/meta` uses to enrich a book by
its `asin`/`isbn`.

## Coverage endpoints

These back the site's contribute page and stay small at any catalogue size.

- **`/api/v1/coverage`** - the top-line totals only:
  `{"totals": {works, with_characters?, with_recaps?, with_recap_summary?}}`. The
  three sidecar counts are **omitted** (not zero) when the loaded artifact's
  `schema_version` predates that dimension's table, so an unknowable count is
  never reported as a misleading 0.
- **`/api/v1/coverage/works?filter=&q=&limit=&offset=`** - the paginated,
  searchable per-work browser. `filter` selects the dimension - `missing` (missing
  any dimension) or `has_characters` / `has_recaps` / `has_recap_summary` - and an
  unknown filter is 400 `unknown filter`. `q` matches title/author; `limit`
  defaults to 25, clamped to `[1, 100]`; `offset` is a non-negative row offset. The
  response carries a per-filter `available` flag that is false when the dimension
  is not evaluable at the artifact's schema version.
- **`/api/v1/coverage/series-gaps?q=&limit=&offset=`** - the paginated,
  name-searchable list of series with interior position gaps (integer positions
  absent between the lowest and highest present integer). No schema-version
  dependency, so it is always available.

## `GET /abs/search` (Audiobookshelf provider)

`metaserve` doubles as an **Audiobookshelf custom metadata provider**. An ABS
admin configures the base URL `https://meta.audiosilo.app/abs` (no auth; ABS
v2.8.0+), and ABS appends `/search`. ABS sends `?mediaType=book&query=<title>`
with optional `&author=` and `&isbn=`, and **never** an ASIN.

- `query` is **required** (400 `query is required`); the endpoint **never 404s** -
  a no-match is a 200 with an empty array.
- Resolution: if an ISBN is present, an exact identifier lookup runs first (the
  hyphens ABS sends are stripped to the bare stored form); otherwise, or on an
  ISBN miss, an FTS work search runs, with works whose authors loosely match
  `author` boosted ahead of the rest (a wrong author boosts rather than filters,
  so it never empties results).
- The response is `{"matches": [...]}`, **one entry per recording** (a recording is
  what ABS matches a local audiobook against), capped at 10. Each match carries
  `title` (the only required field) plus, when present, `subtitle`, `author`,
  `narrator`, `publisher`, `publishedYear` (a string), `description`, `cover`,
  `isbn`, `asin`, `series[]` (`{series, sequence}`), `language`, and `duration`
  **in minutes**. `genres` and `tags` are **deliberately never returned** - the
  data model does not carry publisher genres/tags.

## Production release webhook (optional)

When `METASERVE_WEBHOOK_SECRET` (at least 32 bytes) is set **and** `--poll` is
enabled, metaserve registers `POST /hooks/github/release`, authenticated by the
standard `X-Hub-Signature-256: sha256=...` HMAC header. `release.yml` calls it
only after every release asset has finished uploading. The request body is only a
**trigger**: metaserve re-queries GitHub and goes through the same verified
refresh path as polling, never trusting or installing data from the request body.
The endpoint is not registered when the secret is absent, and a missed delivery
is non-fatal - the fallback poller still discovers the release.

## Flags

`cmd/metaserve` is flag wiring only; every knob maps onto `internal/serve.Config`:

| Flag / env | Default | Purpose |
|---|---|---|
| `--addr` | `:8080` | listen address |
| `--db` | (none) | a local `meta.sqlite` artifact to serve (dev) |
| `--site` | (none) | a static site directory to serve at `/` |
| `--poll` | `false` | fetch and hot-swap the newest data release from GitHub Releases |
| `--repo` | `KodeStar/audiosilo-meta` | GitHub `owner/name` to poll |
| `--interval` | `1h` | fallback poll interval |
| `--cache` | `./cache` | directory for downloaded artifacts |
| `GITHUB_TOKEN` (env) | (none) | raises the GitHub API rate limit |
| `METASERVE_WEBHOOK_SECRET` (env) | (none) | enables the signed release webhook (requires `--poll`) |

With `--poll` and no `--db`, metaserve fetches the newest data release on boot so
it never starts empty. With both, the baked `--db` serves immediately and the
poller still runs one refresh at startup.

## Serving and refresh

The current artifact lives behind an atomic pointer (a `snapshot`); readers load
the pointer once per request. With `--poll`, a background loop plus the optional
webhook keep it current:

- It selects the newest **data** release (the selection rule is on
  [the overview](overview.md#release-artifacts)) and fetches conditionally
  (`If-None-Match` / 304).
- On a new release it first tries a `--patch-from` binary delta against the
  currently-loaded artifact (zstd, `--long=31` window), verifying the reconstructed
  file byte-for-byte against `meta.sqlite.sha256` before installing it; it falls
  back unconditionally to a full `meta.sqlite.gz` download (verified against
  `meta.sqlite.gz.sha256`) whenever a patch is unavailable or fails. The first
  refresh after boot is always full.
- Either way it hot-swaps the pointer; in-flight requests finish on the old
  handle (closed after a grace delay). A rejected patch never swaps, and a poll
  failure only logs and retries - it never crashes the process.

The startup refresh means a recreated production container catches up to the
newest release within seconds instead of serving build-time data for a full
`--interval`. The release asset contract these steps rely on is described on
[the overview](overview.md#release-artifacts).
