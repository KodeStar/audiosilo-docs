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

A **readiness** check, not a liveness check. Until an artifact is loaded it
answers **503** with a `Retry-After` header carrying the real seconds until the
next fetch attempt:

```json
{ "status": "starting" }
```

Once a snapshot is loaded it answers 200 with a cheap freshness signal - `built_at`
is the build time of the artifact currently being served, so a stuck poller shows
up as an ageing timestamp:

```json
{ "status": "ok", "built_at": "2026-07-15T...", "works": 1234 }
```

:::warning Readiness probe yes, liveness probe no
Wire `/healthz` as the **readiness/startup probe** so an orchestrator holds traffic
back until the catalogue is in. Do **not** wire it as a liveness probe: that
restart-loops a server that is patiently waiting out a GitHub outage. The degraded
boot is deliberate (see [boot and degraded start](#boot-and-degraded-start)) - the
process is healthy, it simply has no data yet, and killing it only resets the
backoff it is already managing.
:::

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

## `/api/v1/people/{id}?limit=&offset=`

A person plus their works, or 404 `person not found`. Both credit lists are
**paged**:

```json
{ "id": "...", "name": "...", "sort_name": "...",
  "authored": [workCard...],
  "narrated": [{ "work": workCard, "recording_id": "..." }],
  "authored_total": 0, "narrated_total": 0,
  "limit": 100, "offset": 0 }
```

`limit` defaults to **100** and is clamped to a maximum of **500**; `offset` is a
non-negative row offset. An unparseable or non-positive value falls back to the
default rather than erroring. The window applies to `authored` and `narrated`
**independently**, and `authored_total` / `narrated_total` are the unpaged counts
of each. A client must page against those totals rather than assume the arrays are
complete - a prolific narrator will exceed one page.

## `/api/v1/series/{id}?limit=&offset=`

A series with its ordered member works, or 404 `series not found`:

```json
{ "id": "...", "name": "...", "authors": [personRef...],
  "works": [{ "position": "2.5", "work": workCard }],
  "works_total": 0, "limit": 0, "offset": 0 }
```

`works` is sorted by the numeric start of each `position` string (so `"1-3.5"`
sorts by 1). Paging here is **opt-in**: with no `?limit=` the whole member list is
returned and the echoed `limit` is `0` (the player's series rail depends on getting
the complete list). Pass `?limit=` - clamped to a maximum of **500** - with an
optional `?offset=` to window it. `works_total` is always the unpaged member count,
so it is the reliable "how long is this series" number either way.

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
  unknown filter is 400 `unknown filter`. `q` is a **full-text** match over the
  work's title and subtitle, its authors, its recordings' narrators, and its series
  names - it runs through the same escaped FTS path as `/api/v1/search`, so it
  matches **whole words with the final token as a prefix**, not arbitrary
  substrings (`tolki` matches "Tolkien"; `olkien` does not). `limit`
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
| `--db` | (none) | a local `meta.sqlite` artifact to serve immediately (dev; the published image ships none and relies on `--poll`) |
| `--site` | (none) | a static site directory to serve at `/` |
| `--poll` | `false` | fetch and hot-swap the newest data release from GitHub Releases |
| `--repo` | `KodeStar/audiosilo-meta` | GitHub `owner/name` to poll |
| `--interval` | `1h` | fallback poll interval |
| `--cache` | `./cache` | directory for downloaded artifacts |
| `GITHUB_TOKEN` (env) | (none) | raises the GitHub API rate limit |
| `METASERVE_WEBHOOK_SECRET` (env) | (none) | enables the signed release webhook (requires `--poll`) |

At least one of `--db` and `--poll` is required (`New` refuses "nothing to serve"
otherwise). With `--poll` and no `--db` - the production shape - metaserve fetches
its catalogue at boot and **can legitimately start empty**; see below. With both,
the local `--db` serves immediately and the poller still runs one refresh at
startup.

## Boot and degraded start

The published image ships **no data** (see
[the overview](overview.md#the-published-image)), so a production boot always
fetches its catalogue. A fetch that fails does not stop the process - it degrades
visibly instead, in one of three states:

- **GitHub reachable** - the newest data release loads and the server is ready. If
  the `--cache` directory already holds that release's artifact, it is verified
  against the release's `meta.sqlite.sha256` and adopted **without downloading**
  (matched by digest, never trusted by filename). This is what makes a restart on a
  persistent cache volume cheap.
- **GitHub unreachable, something cached** - the newest cached artifact is adopted
  and served, logged loudly as stale, and replaced by the first poll that succeeds.
  Serving slightly old data beats refusing to serve data that is on disk. The
  staleness is a **log-only** signal: no endpoint reports it, and `built_at` on
  `/healthz` or `/api/v1/stats` is the only hint a client gets.
- **GitHub unreachable, nothing cached** - the process listens anyway. A static
  `--site` still serves, but `/healthz`, every `/api/v1` route and `/abs/search`
  answer **503** with an honest `Retry-After` and the envelope:

  ```json
  { "error": "no data loaded yet: the server is fetching the latest release" }
  ```

  Retries back off from **30 seconds**, doubling until they reach `--interval`, and
  `Retry-After` always reports the wait actually scheduled. The moment a release
  loads, the backoff resets and the server becomes ready without a restart.

Every one of those states is a correctly-working process, which is why `/healthz`
must be a readiness probe and never a liveness one.

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

The startup refresh means a recreated production container reaches the newest
release within seconds rather than at the first `--interval` tick. Superseded cache
files are pruned on every adopt, sparing any artifact still draining its swap
grace, so the cache does not grow release by release. The release asset contract
these steps rely on is described on
[the overview](overview.md#release-artifacts).
