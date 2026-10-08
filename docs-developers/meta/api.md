---
title: Meta HTTP API
description: "The metaserve read-only JSON API reference: every /api/v1 route, the structured works/match for identifying a file, the lang language filter, the Audiobookshelf provider at /abs/search and its per-language twin /abs/{lang}/search, the production release webhook, CORS behavior, connection deadlines and security headers, and how the server refreshes its artifact from GitHub Releases."
---

`metaserve` (`cmd/metaserve` over `internal/serve`) is a **read-only** JSON API
over the compiled SQLite artifact. All data is public, so there is **no auth**;
every `/api/v1` route (and both Audiobookshelf provider routes) responds with permissive CORS
(`Access-Control-Allow-Origin: *`, `Vary: Origin`), and responses are
gzip-compressed. Cross-origin `GET`s work from any browser; there is no
preflight handling, so requests must stay CORS-simple (no custom headers). It
can also serve a static site at `/` (`--site`) and hot-swaps a newer release
artifact without a restart.

Errors are a JSON envelope `{"error": "..."}` with the matching HTTP status. All
routes are `GET`. Every **500** carries the same fixed body regardless of what
actually failed - the real error (a SQL statement, a cache-volume path, a driver
message) goes to the server log instead, since every route here is public and
CORS-open and would otherwise reflect that detail to anyone who could provoke it.

The same surface is published in two other forms: an interactive, human-readable
reference at [meta.audiosilo.app/docs/api](https://meta.audiosilo.app/docs/api),
and the machine-readable OpenAPI document it is rendered from at
[meta.audiosilo.app/api/v1/openapi.json](https://meta.audiosilo.app/api/v1/openapi.json).
Both are the same file (`internal/serve/openapi.json`), so the reference, the
served spec, and this page describe one API.

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
backoff it is already managing. For the same reason the published image ships
**no Dockerfile `HEALTHCHECK`** of its own - an orchestrator's own "unhealthy"
verdict is exactly what triggers an automatic restart, and the orchestrator wires
`/healthz` as readiness/startup itself.
:::

## `/api/v1/openapi.json`

The **OpenAPI 3.1** description of every route on this page, embedded in the
binary (`//go:embed openapi.json` in `internal/serve/openapi.go`) and served
verbatim. It is static - it reads no snapshot and touches no database - so it is
registered **outside** the loaded-artifact gate and never answers 503: a client
discovering the API on a boot that is still downloading its first release still
gets the contract. Like the rest of `/api/v1` it is CORS-open and gzipped, and it
is served with an `ETag` and `Cache-Control: public, max-age=3600` - a
revalidating `If-None-Match` request gets a bodiless **304**.

The document is hand-authored rather than generated, and kept honest
mechanically: `TestOpenAPICoversEveryRoute` pins its path set to the mux's own
route table, so a route added on one side only fails the build. The site's
`/docs/api` page imports the same file at build time, so the human reference and
the machine contract are one document rather than two copies to keep in step.

## `/api/v1/stats`

Catalogue totals, precomputed once per loaded snapshot:

```json
{ "works": 0, "recordings": 0, "people": 0, "series": 0,
  "total_runtime_min": 0, "total_chapters": 0, "built_at": "...",
  "languages": [{ "language": "en", "works": 0 }] }
```

`languages` is the works census by language: one `{language, works}` row per
BCP 47 tag exactly as the works carry it, most works first (ties by tag). It is
computed once when an artifact loads, not per request, and is **omitted** when
the loaded artifact predates `schema_version` 7.

## `/api/v1/search?q=&limit=`

Full-text search over works, people, and series. `q` is **required** (400 `q is
required` when empty). `limit` defaults to 20, clamped to `[1, 50]`. Returns
`{"results": [...]}`, best-ranked first; each result is one of three shapes
distinguished by `kind`:

- **work**: `{kind, id, title, authors[], language, series, release_date?, cover_url, added_at, narrators[]}`
  (every workCard field below, with the same rules - `release_date` omitted when
  no recording states one - plus `kind` and `narrators`)
- **person**: `{kind, id, name}`
- **series**: `{kind, id, name, works, language?}` (`works` = member count;
  `language` is the series' derived language - see
  [`series/{id}`](#apiv1seriesidlimitoffset) - omitted when its members tie and
  on an artifact older than `schema_version` 7)

FTS input is escaped defensively (every token quoted, the final token
prefixed with `*`), so no user input can break the underlying `MATCH`. `q` is
also bounded - 256 bytes and 64 FTS phrases - since one phrase is one
posting-list walk and the server, not a per-keystroke caller, decides how many of
those a request can cost; an oversized query is **truncated to the leading
phrases it keeps**, never rejected, since a 400 mid-typing is a worse answer than
the page for what has been typed so far. The same bound applies to
`works/search`, `people/search`, and `series/search` below.

A **possessive matches in either spelling.** The FTS tokenizer indexes "Ender's"
as two terms, `ender` + `s`, so a query typed without the apostrophe - which is
how a title read off a file name arrives - used to find nothing. Now a word of
four or more characters ending in a single `s` (`enders`, but not `its`, `das`
or `darkness`) also matches the possessive it may be: `enders game` finds
"Ender's Game". The mirror holds too: a possessive written with its apostrophe
also matches a title stored without one, so `finnegan's wake` finds "Finnegans
Wake". Each such word becomes a two-spelling group, and a group counts as
**two** of the 64 phrases, so both spellings of a query cost the same against
the bound. A query that is a work's whole title returns that work first, and
that comparison ignores a possessive's apostrophe as well, so `enders game` leads
with "Ender's Game". A query
with neither form is matched exactly as before; one containing a possessive may
now return a slightly different page, since it matches the other spelling too.

## `/api/v1/works/search`, `/api/v1/people/search`, `/api/v1/series/search`

The same search restricted to one kind. Each takes the same `?q=&limit=`, shares
the combined search's contract exactly - `q` **required** (400 `q is required`),
`limit` default 20 clamped to `[1, 50]`, the same defensive FTS escaping,
`{"results": [...]}` ranked best-first - and returns only that kind's shape from
the list above: `works/search` returns **work** results, `people/search` returns
**person** results, `series/search` returns **series** results. The `kind`
discriminator is still on every result, so a client can consume either endpoint
with one parser.

The filter is applied inside the query (`search_fts` stores `kind` as an
unindexed column), so `?limit=20` on `works/search` returns up to 20 works rather
than the works among 20 mixed hits - and because no new index is involved, the
three answer against every already-published artifact.

A query that names a series and a volume number (`jack reacher 2`) resolves that
volume and returns it **first**, ahead of the ranked FTS hits. That boost applies
to the combined `/api/v1/search` and to `works/search`, and to those only: the
ids it resolves are always works, so prepending them to a people or series page
would put a work on a page that promises neither.

## `/api/v1/works/match`

Identifies the work an audiobook **file** is, from the facts its tags and folder
path state, each of which may be wrong. `works/search` needs every word of one
query, so it can't find a file whose title tag holds the author's name while
its folders are named well (`Bernard Cornwell/Richard Sharpe/Sharpe - 08 -
Sharpe's Eagle`). This route takes the facts **separately**, gathers candidates
along each of them, and ranks every candidate by how well its own facts agree.
audiosilo-server's "Match with community metadata" dialog is its client (see
the server's [match endpoint](../server/api/reference.md#get-apiv1adminlibrariesidbookmatch)).

| Query param | Notes |
|---|---|
| `q` | Free text as a person typed it, title, author and series words in any order. |
| `title` | A title guess (a tag, a folder or file name), **repeatable**; the first 4 are read. Send it as named: numbering and edition fluff are taken off here (`02 - `, `SW06 - `, `Sharpe - 08 - `, `(Unabridged)`, `: Series, Book 5`), and the number the numbering carried is the position when `position` is absent. |
| `author` | An author guess, **repeatable**; the first 4 are read. `A & B`, `A, B` and `A; B` are read as each person, `Cornwell, Bernard` as Bernard Cornwell. Matched by surname, then first name or initial. |
| `series` | A series name guess (the folder a book sits in, a series tag), **repeatable**; the first 2 are read. Each is judged and the better counts, so a wrong guess beside a right one costs nothing. Numbering is taken off (`03 - Tawny Man` is `Tawny Man`). |
| `position` | The book's position in `series` (`8`, `08`, `7.5`), one value, compared numerically and applied to whichever series guess agrees best. A value that isn't a position is ignored. |
| `runtime` | The book's length in seconds. Within 3% of a recording agrees fully, within 10% partly. Non-numeric, non-positive or above 1,000,000 is ignored. |
| `asin` · `isbn` | Looked up exactly as on [`/api/v1/lookup`](#apiv1lookupasinisbn); a hit scores 100. An ASIN longer than 20 characters, or an ISBN longer than 20 once hyphens and spaces are taken out, is ignored. |
| `limit` | Default 10, capped at 20; a non-numeric or non-positive value falls back to the default. |

At least one of `q`, `title`, `author`, `series`, `asin` or `isbn` must carry a
value (400 `one of q, title, author, series, asin or isbn is required`). A
`position` or `runtime` that doesn't parse is ignored rather than refused: these
come from file tags, and a garbage tag mustn't cost the rest of the request.

**Candidates** come from the identifier, the typed text (exactly as
`works/search` reads it, plus exact-title probes of its leading and trailing word
runs), every title guess, the members of the named series, and **every work by
the named authors** (people resolved through the FTS person rows by full name,
then by surname with first-name agreement): that last probe finds a book whose
title is misspelt in the folder name or garbage in the tags.

**Scoring.** The structured facts score as a weighted average of title (60),
author (20), series (10) and runtime (10) agreement over the facts the request
states; a fact left out counts neither for nor against, and each field is judged
by its best guess. Titles that identify nothing (absent, or only `CD1`/`12`
shaped) keep their weight unless the series and its position agree. The typed
text is scored separately, read per candidate as the facts it states about that
work (its author words as the author, its series words plus a volume number as
that volume, the rest as a title), and the better of the two scores counts. A
named title that clearly disagrees outranks a numbering match, and named
authors none of whom wrote a work scale its score down. metaserve is the one
place a title's numbering is read, so clients send folder names raw.

```json
{ "results": [
  { "kind": "work", "id": "sharpes-eagle", "title": "Sharpe's Eagle", "…": "every works/search field",
    "score": 94, "recording_id": "sharpes-eagle-1",
    "reasons": { "title": 1, "author": "full", "series": "position", "runtime": 0.01 } }
] }
```

- `results` - best first, never null; empty when nothing scored at all. Each is
  a `works/search` work result plus:
- `score` - 0-100: 100 for an identifier hit, otherwise the better of the
  structured-facts score and the typed-text score.
- `recording_id` - the recording the identifier named, else the one whose
  runtime is closest to `runtime`; omitted when neither applies.
- `reasons` - which facts agreed, each field omitted when the request didn't let
  it be judged: `title` (the best title similarity, 0-1), `text` (the typed
  text's similarity, 0-1; 1 when it named the work's series and volume, as in
  `sharpe 8`), `author` (`full`, `surname` or `none`), `series` (`position`,
  `name`, `conflict` or `none`), `runtime` (the relative difference of the
  closest recording, `0.02` = 2%) and `identifier` (`asin` or `isbn`).

**Bounds.** Like every route here it is unauthenticated and CORS-open, so a
request can't price itself: each text value is cut to 256 bytes, an author
resolves through a bounded window of people, the author and series probes add
at most **2,500** works, and comparisons run in Go over batched, indexed reads.
At most **8** matches run at once, each within a **2-second** budget that every
read it makes honours; a match that can't start or finish within it is a
**503** `the match did not finish in time; retry shortly` with `Retry-After: 1`
(the usual 503 also applies while no artifact is loaded). Nothing is cached
server-side and responses carry no `Cache-Control`, as for the searches. It
takes no [`lang` filter](#the-lang-filter). It reads only tables that have
existed since `schema_version` 1, so it answers against every published
artifact.

`match` is a [reserved slug](data-model.md) in all three families, like `search`
and `latest`, since it is a literal segment of this route.

## The `lang` filter

The list surfaces take an optional `lang` query parameter that narrows them to
works in the named languages: `lang=de`, or `lang=de,en` for two. It applies to:

| Route | What `lang` matches |
|---|---|
| `/api/v1/search` | a work's language; a series' derived language; **people always pass** |
| `/api/v1/works/search` | a work's language |
| `/api/v1/series/search` | the series' derived language; a series whose members **tie** passes every filter |
| `/api/v1/works/latest` | a work's language (the two-per-series cap is then taken over what is left) |
| `/api/v1/coverage/works` | a work's language |
| `/api/v1/people/search` | **accepted and ignored** - a person has no language - but still validated |

Everything that names a record outright is **never** filtered: `works/{id}`,
`series/{id}`, `people/{id}`, `lookup`, the HTML entity pages, the sitemaps and
the watch feeds. Hiding a record there would be a 404 for a book the catalogue
holds.

**Parsing** (`parseLangFilter` in `internal/serve/langfilter.go`, the one parser
every surface reads):

- A comma-separated list; a repeated parameter is the same list
  (`lang=de&lang=en` reads as `lang=de,en`). Items are trimmed and lowercased,
  and empty items are skipped, so an absent or empty `lang` is **no filter**.
- Each item must match the schema's language tag pattern
  (`^[a-z]{2,3}(-[a-z0-9]{2,8})*$`). An item that does not is a **400** naming it
  (`lang: "x_y" is not a language tag ...`), because a typo that silently
  filtered to nothing would read as "the catalogue holds no such books".
- At most **8** distinct languages (`maxLangFilter`); more is a 400.
- A valid code the catalogue holds no works in is **not** an error - it simply
  matches nothing.

**Matching is by primary subtag** (RFC 4647 basic filtering): `de` matches a work
tagged `de` and one tagged `de-at`, and a regional item (`pt-br`) is reduced to
its primary subtag before matching, since the catalogue does not state regions
consistently enough for a narrower filter to mean anything but "fewer of the
books you asked for". Every tag in today's catalogue is a bare primary subtag,
but the schema allows regional ones. A record with **no** language - a person, or
a series whose members tie between languages - is never judged, so it passes
every filter: hiding a tied series from a German reader would hide the very
series that holds German volumes.

Both search boosts (the exact-title lead and the `jack reacher 2` volume) obey
the filter too: they resolve works outside the full-text query, so their ids are
checked against the filter before they are prepended, and a page never carries a
work outside it.

**Version gate.** The filter is a plain predicate on columns the
`schema_version` 7 artifact already carries (`search_fts.language` and
`works.language`), so it needed no artifact change. Against an artifact older
than 7 the value is still parsed (garbage is still a 400) and then **ignored** -
the reader gets the unfiltered page rather than an error. A request without
`lang` runs exactly the SQL it always did.

Two response fields arrived with the filter, both additive: a **series** search
result carries the series' derived `language` (above), and a
[coverage](#coverage-endpoints) row carries the work's `language`, so a client
can badge an item whose language differs from the reader's.

## `/api/v1/works/latest?limit=`

The newest works, for the site's landing grid. `limit` defaults to 12, clamped to
`[1, 50]`. Returns `{"works": [workCard...]}` ordered by `added_at` descending
(then title), with at most two works from any one series so a bulk import sharing
one date can't fill the grid. It takes the [`lang` filter](#the-lang-filter).
Two reading orders of one franchise - a series and a
chronological or recommended variant of it - count as one series for that cap
(`schema_version` 7). A **workCard** is the compact shape reused across
lists and lookups: `{id, title, authors[], language, series, release_date?,
cover_url, added_at}`.

`release_date` is the **earliest release date across the work's recordings**, at
whatever precision the source stated - `YYYY`, `YYYY-MM` or `YYYY-MM-DD`
(`recording.schema.json` permits all three). "Earliest" is the minimum by plain
**string** order over the recordings that state one, which sorts chronologically
for any pair that differs in the part they share; where two recordings state the
same year at different precisions the shorter value wins. The rule lives in one
place, `snapshot.cardFactsByWork` in `internal/serve/store.go`, alongside the
"which cover wins" rule it now shares a query with.

Unlike `series`, `cover_url` and `added_at` - which are always present and null
when unknown - `release_date` is **omitted** (`omitempty`) when no recording of
the work states one, so a card from a `metaserve` predating the field and a card
for a work with no dated recording look the same to a client. A date in the
**future** is a catalogued preorder, not an error; the site's watchlist uses
exactly that to split a series into available and preorderable entries.

`series` is the work's **first** series membership, `{id, name, position,
ordering_of?}`, or null. With artifact `schema_version` 7 every series that is
not a variant reading order (a chronological or recommended listing whose
`ordering_of` names a primary series) is chosen before every variant one, then by
series id - so a work in "The Saga" and "The Saga (Chronological Order)" is carded
under the series itself however the two slugs sort. `ordering_of` is present only on a variant's
reference. The same choice, keyed by its ordering family (the primary a variant
names), caps `works/latest` per series; it also orders the work
page's `series[]` and is the work page's JSON-LD `isPartOf`.

`language` is the work's BCP 47 language tag, always lowercase (`en`, `fr`,
`pt-br`) - the value `GET /api/v1/works/{id}` serves. Every work states one, so
it is **always present**; it is what tells a work from its translations on a
list ("Throne of Glass" and its French and German editions otherwise read as one
book three times). A `metaserve` older than the field sends no `language`, so a
client should treat it as optional.

## `/api/v1/watch/feed.atom`, `/api/v1/watch/feed.json`

A **stateless** notification feed for a list of series, in Atom 1.0
(`application/atom+xml; charset=utf-8`) and JSON Feed 1.1
(`application/feed+json; charset=utf-8`). Both routes share one implementation
(`internal/serve/watchfeed.go`) and differ only in the renderer.

Stateless is the whole design: **the series list is carried in the request URL**
and the server stores no subscription, no reader identity and no delivery state.
The site builds the URL in the browser from the reader's local watchlist
(`site/src/lib/feed-url.ts`) and the reader pastes it into a feed reader - so a
watchlist that never leaves the browser can still produce notifications, at the
cost that the URL must be re-copied whenever the list changes, and that anyone
holding the URL can see which series it names.

### Parameters

| Parameter | Required | Default | Meaning |
|---|---|---|---|
| `s` | yes | - | 1 to 200 series slugs (`maxWatchSeries`), comma-separated, or the compact `z:` form below. Empty or invalid is 400. |
| `window` | no | `90` | How many days back of released or newly catalogued works to include. An integer in `[1, 365]`; anything else is 400. |

`window` bounds only the **backward** look. Entries whose release date is in the
future are always included, however far ahead they are - a preorder is the news.

### The `s` encodings

`s` has two spellings, both parsed by `decodeSeriesParam`
(`internal/serve/seriesparam.go`):

- **CSV** - `s=the-stormlight-archive,mistborn`. Readable, and what a hand-written
  subscription uses.
- **Compact** - `s=z:<base64url(deflate(csv))>`: raw DEFLATE (no zlib header, no
  gzip framing) then **unpadded base64url**, prefixed `z:` so it can never be
  mistaken for a slug list (a slug cannot contain `:`).

The site emits CSV while the complete Atom URL stays under 1500 characters and
switches to the compact form beyond that (`PLAIN_URL_LIMIT`), so a short
watchlist produces a URL a human can read and a long one still fits every
reader's URL limits.

Decoding is bounded before it is split: the decompressed stream is read through
an `io.LimitReader` capped at `maxWatchSeries * (model.MaxSlugLen + 1) - 1`
bytes, the largest a valid CSV can be, so a compact parameter cannot become a
decompression bomb. Past that bound, both spellings run the same
`validateSeriesList` - at most 200 entries, every one a valid slug - so the two
forms have identical contracts.

### What is in the feed

Each requested slug is resolved with the same redirect handling as the rest of
the API: a **retired** series slug follows its redirect to the surviving series.
A slug that resolves to nothing is **omitted** and named in the feed's
subtitle/description ("*n* slugs not found: ..."), rather than failing the
request - a stale entry in a long-lived subscription URL must not take the whole
feed down. Duplicate slugs, and distinct slugs that redirect to the same series,
are collapsed.

For each member work of each resolved series, one item is emitted when:

- its `release_date` is in the **future** - a preorder, always included; or
- its `release_date` is within `window` days of today; or
- it has **no** `release_date` but its `added_at` is within `window` days.

A work with a `release_date` this server can't parse (anything but a 4, 7 or 10
character value) is skipped rather than guessed at, as is a dateless work with no
`added_at`.

Items are sorted by `updated` **descending** (the release date, or the added-at
date for a dateless work), then deterministically by series name, the numeric
start of the position string, the position string, and finally the item id. The
list is capped at **200** items (`maxWatchFeedItems`).

### Item identity

Every item's id is a tag URI:

```
tag:meta.audiosilo.app,2026:work/<work-slug>/<state>
```

where `<state>` is `preorder` or `released`. Feed readers deduplicate by id, so
the state is deliberately part of it: when a preorder's date passes, the same
work emits a **different** id and the reader announces it again - which is the
point, since "you can listen to it now" is the news the first item couldn't
carry. A dateless work uses `released` in its id (there is nothing to be waiting
for) even though its displayed state reads `date unknown`.

The feed's own id is `tag:meta.audiosilo.app,2026:watch/<identity>`, where the
identity is the same FNV-1a hash of the path and the raw parameters that backs
the ETag - so two different watchlists are two different feeds to a reader.

### Item shape

| Atom | JSON Feed | Value |
|---|---|---|
| `<title>` | `title` | `<series name> #<position>: <work title>` (the `#<position>` part is dropped when the entry has no position) |
| `<link rel="alternate">` | `url` | `<site URL>/works/<work slug>` |
| `<updated>` | `date_published`, `date_modified` | RFC 3339 UTC; both JSON fields carry the same value |
| `<author><name>` | `authors[].name` | the work's authors |
| `<category term>` | `tags[0]` | `preorder`, `released` or `date unknown` |
| `<summary>` | `content_text` | `Preorder - due 1 Nov 2026`, `Released 20 Oct 2026`, or `Added to the catalogue, release date unknown` |

The feed title is the constant `AudioSilo Meta: new in your series`; the subtitle
(`description` in JSON Feed) is the resolved series names, plus the not-found
note when there is one. The self link (`feed_url`) is the request URI joined onto
the configured public site URL, not the `Host` header.

### Caching

A successful response carries `Cache-Control: public, max-age=3600` and a **weak**
`ETag` computed from the loaded artifact's release tag (falling back to its
`built_at`), the configured site URL, the route path, and the **raw** `s` and
`window` strings. Raw, not normalized: the CSV and compact spellings of the same
list are different cache entries, which is the conservative choice for a
validator and costs nothing in practice because a given subscription URL is
fixed.

An `If-None-Match` that matches, or that carries `*`, answers **304** with the
`ETag` and `Cache-Control` and no body. A new data release changes the artifact
tag and so invalidates every watch feed at once.

Errors are the usual envelope: **400** for a missing/invalid `s` (bad slug, more
than 200 entries, undecodable `z:` payload) or an out-of-range `window`, **500**
for a snapshot read failure, and **503** while no artifact is loaded.

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

Two more fields carry the work's **translation links** (`schema_version` 7),
both `[{id, title, language}]` in work id order and both omitted when empty:

- `translation_of[]` - the work(s) this one translates. Almost always one; a
  translated omnibus names every original it collects.
- `translations[]` - the works that translate this one.

`series[]` lists every membership, every non-variant series before every variant
reading order (see the workCard's `series` above); each variant's entry carries
`ordering_of`, the primary's slug.

The two AudioSilo consumers of this route choose by `ordering_of` rather than by
that order, so neither depends on it: audiosilo-server collapses each ordering
family into one series rail whose main view is the first membership with no
`ordering_of` (see its [meta enrichment envelope](../server/api/reference.md#reading-order-families)),
and audiosilo-sidecars reads a book in the first membership with no `ordering_of`
when it cuts a series glossary. Both fall back to the first membership, so a work
only a variant places keeps that variant.

## `/api/v1/works/{id}/recordings/{rid}/chapters`

The chapter list for one recording of a work: `{"chapters": [{title, start_ms,
length_ms}]}`, ordered by chapter index. An unknown work/recording yields an empty
list, not a 404. audiosilo-server's
[community chapter check](../server/community-chapters.md) calls it for the
`recording_id` a `lookup` names, and fits the list onto the book's own audio.

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
{ "id": "...", "name": "...", "language": "en",
  "ordering": "chronological", "ordering_of": "the-saga",
  "authors": [personRef...],
  "works": [{ "position": "2.5", "work": workCard }],
  "works_total": 0, "limit": 0, "offset": 0,
  "translation_of": [{ "id": "...", "name": "...", "language": "de" }],
  "translations": [{ "id": "...", "name": "...", "language": "fr" }],
  "orderings": [{ "id": "the-saga", "name": "The Saga", "ordering": "publication" },
                { "id": "...", "name": "...", "ordering": "chronological" }] }
```

The fields after `name` that the original shape lacked are the **languages
layer** (`schema_version` 7), each omitted when it has nothing to say and all
omitted on an older artifact:

- `language` is **derived**, not stated: the primary language subtag more of the
  series' members state than any other (a plurality - it need not be over half),
  omitted when the leading languages tie or no member states one.
- `ordering` is the reading order this series' positions state
  (`publication`, `chronological` or `recommended`); `ordering_of` is set only on
  a **variant** ordering and names the franchise's primary series.
- `translation_of[]` / `translations[]` are the series' translation links in
  both directions, `{id, name, language?}` in id order (`language` being that
  series' derived language).
- `orderings[]` is the whole ordering **family** - the primary first, then every
  variant of it by id, each `{id, name, ordering?}` - served identically on the
  primary and on every variant, so a reader can switch order from any of them.
  It is omitted when the series has no variant ordering.

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
  unknown filter is 400 `unknown filter`. It also takes the
  [`lang` filter](#the-lang-filter), and each row carries the work's `language`
  tag (always present) beside its `id`, `title`, `authors` and `missing` list.
  `q` is a **full-text** match over the
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
  so it never empties results). `query` is matched like the `q` of
  `/api/v1/search`, possessives included, so a title Audiobookshelf read off a
  file name without its apostrophes (`Enders Game`) still finds the work, and a
  title written with one finds a work stored without it.
- The response is `{"matches": [...]}`, **one entry per recording** (a recording is
  what ABS matches a local audiobook against), capped at 10. Each match carries
  `title` (the only required field) plus, when present, `subtitle`, `author`,
  `narrator`, `publisher`, `publishedYear` (a string), `description`, `cover`,
  `isbn`, `asin`, `series[]` (`{series, sequence}`), `language`, `genres` and
  `duration` **in minutes**. `genres` are human-facing labels from the project's
  own controlled vocabulary, never a retailer's raw genre strings; `tags` is
  **never** populated, since the data model has no tag concept.

A library in one language can rank its own language first through the
[per-language provider](#get-abslangsearch-per-language-provider) below.

## `GET /abs/{lang}/search` (per-language provider)

The same provider for a library in one language. The admin configures the base
URL with a language segment - `https://meta.audiosilo.app/abs/de` - and
Audiobookshelf calls `/abs/de/search`.

**Why the language rides in the path:** Audiobookshelf builds the request URL by
plain string concatenation, `${providerUrl}/search?...`, keeping whatever path
the admin typed, and sends only its own four parameters (`mediaType`, `query`,
`author`, `isbn`). There is nowhere else to put a preference. A base configured
with a trailing slash (`/abs/de/`) arrives as `/abs/de//search`; the router's
path cleaning answers it with a **307** to `/abs/de/search` with the query kept,
and Audiobookshelf follows the redirect.

- `{lang}` is parsed exactly like the [`lang` filter](#the-lang-filter): one code
  or a comma list (`/abs/de,en`), matched by primary subtag. A segment that is
  not a language list is a **404** (`unknown provider language`) rather than a
  400 - it names no provider this server offers, and Audiobookshelf shows "no
  results" either way.
- The language **ranks, it never filters**: a German library may still hold an
  English original, and "no results" would be the worse answer. The candidates
  are the language-matched full-text window followed by the unfiltered one (each
  `limit*3` long, deduplicated).
- The author still dominates. Candidates are partitioned, stably, into
  **author + language**, then **author** (any language), then **language**, then
  **the rest**: the author is evidence about this one book, the language only a
  library-wide default.
- An exact ISBN hit is not re-ranked - it names one recording outright.
  Everything else (the response shape, the 10-match cap, the attribution line on
  a community description, the 400 on a missing `query`) is exactly
  `/abs/search`'s, and below `schema_version` 7 the segment is ignored and the
  answer is the unscoped one.

`/abs/search` itself is unchanged byte for byte.

## Production release webhook (optional)

When `METASERVE_WEBHOOK_SECRET` (at least 32 bytes) is set **and** `--poll` is
enabled, metaserve registers `POST /hooks/github/release`, authenticated by the
standard `X-Hub-Signature-256: sha256=...` HMAC header. `release.yml` calls it
only after every release asset has been uploaded **and** read back verified
against the GitHub API's own digest **and** the release has been published (see
[release artifacts](overview.md#release-artifacts)) - so the receiver is never
woken to a release it cannot trust or cannot yet see. The request body is only a
**trigger**: metaserve re-queries GitHub and goes through the same verified
refresh path as polling, never trusting or installing data from the request body.
The endpoint is not registered when the secret is absent, and a missed delivery
is non-fatal - the fallback poller still discovers the release.

:::warning History: the payload was malformed until 2026-09-24
From the webhook's introduction until 2026-09-24, the notification body was
composed with a shell `printf` inside single quotes, so its backslash escapes
were sent as literal characters instead of JSON escapes. The body was therefore
never valid JSON, and `webhook.go` rejected **every** delivery with 400 - silently,
since delivery failure is non-fatal by design. Any operator who had
`METASERVE_WEBHOOK_SECRET` configured was, in practice, running on the hourly
fallback poller the whole time. The sender was rewritten to compose the payload
with `jq` and is now pinned to the receiver by a test that runs it against the
real handler, so the two cannot drift apart again; delivery status (the HTTP
response code, or the reason it could not be sent) is now reported in the
`release.yml` workflow log.
:::

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

## Deadlines, security headers, and reverse proxies

The listener bounds how long a **client** can hold a connection; none of these
limits how long the server may work, since nothing artifact-sized runs inside a
request (the release webhook answers 202 and refreshes in the background):

| Deadline | Value | Bounds |
|---|---|---|
| `ReadHeaderTimeout` | 10s | the request line and headers |
| `ReadTimeout` | 30s | the whole request read - every route is a bodyless `GET` except the webhook, whose body is capped at 1 MiB |
| `WriteTimeout` | 2m | the handler plus the response transfer, sized so the largest body (a 50,000-URL sitemap shard) still reaches a slow client |
| `IdleTimeout` | 3m | how long a keep-alive connection waits for its next request |

:::warning Keep the proxy's upstream idle timeout below 3 minutes
When metaserve closes an idle keep-alive connection at the moment a reverse proxy
reuses it, the proxy answers **502**. The proxy has to be the side that gives up
first, so its upstream idle timeout must stay shorter than metaserve's 3 minutes.
Production runs behind nginx, whose upstream `keepalive_timeout` defaults to 60s,
which satisfies this; raise it past 3 minutes and intermittent 502s follow.
:::

Every response carries `X-Content-Type-Options: nosniff`, the router's own 404
included, so a browser never second-guesses a declared content type. HTML
documents - the static site's pages and the server-rendered entity pages, along
with their 301, 304 and 404 answers - additionally carry
`Referrer-Policy: strict-origin-when-cross-origin` and
`Content-Security-Policy: frame-ancestors 'none'`: **the pages cannot be
framed** by any site, and a page's path and query stay out of the `Referer` sent
to another origin (a purchase link leaves the site from a page naming the book).
The CSP sets that one directive only. The JSON API, the feeds and the sitemaps
carry neither document header.

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
  `--site` still serves, but `/healthz`, every `/api/v1` route and both
  Audiobookshelf provider routes answer **503** with an honest `Retry-After` and the envelope:

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
