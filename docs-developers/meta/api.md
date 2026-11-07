---
title: Meta HTTP API
description: "The metaserve JSON API reference: every /api/v1 route, works/match for identifying a file, the lang and source filters, the LibriVox layer and its LibriVox-shaped feed, the Audiobookshelf provider, rate limiting and caching, the optional release webhook and unknown-ASIN intake queue, CORS, deadlines and security headers, and how the server refreshes its artifact from GitHub Releases."
---

`metaserve` (`cmd/metaserve` over `internal/serve`) is a JSON API over the compiled
SQLite artifact. **The catalogue is read-only**: nothing a client sends changes it.
Two optional features, each off unless configured, accept input: the signed
[release webhook](#production-release-webhook-optional) and the
[unknown-ASIN intake queue](#unknown-asin-intake-queue-optional), which writes only
to a small file of its own. The queries and the API handler are the
public `pkg/query` (`NewHandler`), which metaserve serves behind its own CORS and
gzip, and which a mirror-mode AudioSilo server mounts in-process over a
downloaded copy of the artifact, so the same responses come from either (see
[Public Go packages](overview.md#public-go-packages)). All catalogue data is public,
so there is **no auth**; every catalogue `/api/v1` route (and both Audiobookshelf
provider routes) responds with permissive CORS
(`Access-Control-Allow-Origin: *`, `Vary: Origin`), and responses are
gzip-compressed. A cross-origin `GET` that needs no preflight works from any browser.
No route answers `OPTIONS`: a preflight gets the site's HTML 404, or a 405 from the
router on a deployment with no site, so a request that would trigger one, such as one
with a custom header, fails. `Retry-After` is exposed, so a script on another origin
can read how long to wait after a 429. The same routes are [rate limited per client and carry a `Cache-Control`](#rate-limit-and-caching).
`metaserve` can also serve a static site at `/` (`--site`) and hot-swaps a newer release
artifact without a restart.

Errors are a JSON envelope `{"error": "..."}` with the matching HTTP status. A
request no route claims does not answer JSON ([the intake queue when it is
off](#when-the-queue-is-off) is one). The catalogue routes are all `GET`. Every
**500** carries the same fixed body regardless of what actually failed - the real error (a SQL statement, a cache-volume path, a driver
message) goes to the server log instead, since every catalogue route is public and
CORS-open and would otherwise reflect that detail to anyone who could provoke it.

The same surface is published in two other forms: an interactive, human-readable
reference at [meta.audiosilo.app/docs/api](https://meta.audiosilo.app/docs/api),
and the machine-readable OpenAPI document it is rendered from at
[meta.audiosilo.app/api/v1/openapi.json](https://meta.audiosilo.app/api/v1/openapi.json).
Both come from one file (`internal/serve/openapi.json`), so the reference, the
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

:::warning[Readiness probe yes, liveness probe no]
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
as written, less the [intake queue](#unknown-asin-intake-queue-optional) members
this deployment does not offer (`Server.servedSpec`): with the queue off it names no
intake path or schema, and with the `POST` alone it has no `GET`. It is static - it
reads no snapshot and touches no database - so it is registered **outside** the loaded-artifact gate and never answers 503: a client
discovering the API on a boot that is still downloading its first release still
gets the contract. Like the catalogue routes it is CORS-open and gzipped, and it
is served with an `ETag` and `Cache-Control: public, max-age=3600` - a
revalidating `If-None-Match` request gets a bodiless **304**.

The document is hand-authored rather than generated, and kept honest
mechanically: `TestOpenAPICoversEveryRoute` pins its path set to the mux's own
route table, so a route added on one side only fails the build. The site's
`/docs/api` page imports the same file at build time, so the human reference and
the machine contract are one document rather than two copies to keep in step. That
page renders the whole file, so it lists the intake routes whether or not a given
deployment offers them; `/api/v1/openapi.json` is what a deployment itself offers.

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

It takes the [`lang` filter](#the-lang-filter) and the
[`source` filter](#the-source-filter).

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

`works/search` also takes the [`source` filter](#the-source-filter);
`people/search` and `series/search` ignore it, so even an unknown value is not a
400 there.

## `/api/v1/works/match`

Identifies the work an audiobook **file** is, from the facts its tags and folder
path state, each of which may be wrong. `works/search` needs every word of one
query, so it can't find a file whose title tag holds the author's name while
its folders are named well (`Bernard Cornwell/Richard Sharpe/Sharpe - 08 -
Sharpe's Eagle`). This route takes the facts **separately**, gathers candidates
along each of them, and ranks every candidate by how well its own facts agree.
audiosilo-server's "Match with community metadata" dialog is its client (see
the server's [match endpoint](../server/api/reference.md#get-apiv1adminlibrariesidbookmatch)),
and so is its [bulk match run](../server/api/reference.md#what-a-run-asks-of-the-community-service).

| Query param | Notes |
|---|---|
| `q` | Free text as a person typed it, title, author and series words in any order. |
| `title` | A title guess (a tag, a folder or file name), **repeatable**; the first 4 are read. Send it as named: numbering and edition fluff are taken off here (`02 - `, `SW06 - `, `Sharpe - 08 - `, `(Unabridged)`, `: Series, Book 5`), and the number the numbering carried is the position when `position` is absent. A title that is a `series` guess's name and then a volume number (`He Who Fights with Monsters 4: A LitRPG Adventure`, `The Expanse, Book 3`) states that volume, ahead of the number a numbering prefix carried in the same guess (`01 - `, `SW06 - `); across guesses the first one stating a number decides. With `position` stated, such a number counts as a volume only when it agrees with the position; otherwise it stays a title (a series whose volumes are titled with their own numbers: `Dungeon Diving 102` at position 2). |
| `author` | An author guess, **repeatable**; the first 4 are read. `A & B`, `A, B` and `A; B` are read as each person, `Cornwell, Bernard` as Bernard Cornwell. Matched by surname, then first name or initial. |
| `series` | A series name guess (the folder a book sits in, a series tag), **repeatable**; the first 2 are read. Each is judged and the better counts, so a wrong guess beside a right one costs nothing. Numbering is taken off (`03 - Tawny Man` is `Tawny Man`). |
| `position` | The book's position in `series` (`8`, `08`, `7.5`), one value, compared numerically and applied to whichever series guess agrees best. A value that isn't a position is ignored. |
| `runtime` | The book's length in seconds. Within 3% of a recording agrees fully, within 10% partly. More than 25% off the closest recording (allowing the minute a stored runtime is rounded to) is another edition, and scales the work's score down. Non-numeric, non-positive or above 1,000,000 is ignored. |
| `language` | The book's language: a BCP-47 tag (`en`, `en-US`; only the primary subtag is compared), an ISO 639-2 code (`eng`, `ger`) or a language's name (`English`, `Deutsch`). A work in another known language (a translation stored as its own work) has its score scaled down. A value that names no language this API reads, or a work whose language is unknown, isn't judged. It finds no candidates on its own. |
| `narrator` | A narrator guess, **repeatable**; the first 4 are read, each split and matched like `author`. When a recording of a work credits narrators, the best-agreeing recording's agreement counts as a fact weighted 10, and that recording is the `recording_id` (the closest runtime choosing between agreeing recordings) unless it is more than 25% off `runtime`. A work whose recordings credit no narrator isn't judged on it. It finds no candidates on its own. |
| `asin` · `isbn` | Looked up exactly as on [`/api/v1/lookup`](#apiv1lookupasinisbnlibrivox_id); a hit scores 100. An ASIN longer than 20 characters, or an ISBN longer than 20 once hyphens and spaces are taken out, is ignored. |
| `limit` | Default 10, capped at 20; a non-numeric or non-positive value falls back to the default. |
| `expand` | What to inline, as a comma-separated list or by repeating the parameter. `work` is the one value read ([below](#expandwork)); any other is ignored. |

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
authors none of whom wrote a work scale its score down (0.75). With `narrator`
stated, narrator agreement is a further fact weighted 10. Three more factors scale
a score (start values from a benchmark, tuned on the server's harness, each pinned in
`match_factors_test.go`): a work in the named series at another position than the
stated one (`positionConflictFactor`, 0.8, unless a membership's range covers it, an
omnibus), a work in another known language than a stated `language`
(`languageMismatchFactor`, 0.8), and a closest recording more than 25% off `runtime`
(`runtimeMismatchFactor`, 0.85). No factor touches an identifier hit, which scores
100 whatever else disagrees. A request without `language` and `narrator` scores as before, except
for the position and runtime factors, which apply to any request stating a position or
a runtime. A title guess that is
only the `series` name (what `FWM04 - He Who Fights with Monsters - Book 4`
leaves once its numbering is cut) says nothing about which volume, so it never
lets another volume outrank a stated one. It still counts for a work titled that
name, stopwords aside (a series named after its first book), unless a title
guess ties the volume being read to the name: beside `He Who Fights with Monsters
4: A LitRPG Adventure` the bare name is only that numbering's leftover, while a
second guess naming another volume (`Throne of Glass 1` beside `02 - Throne of
Glass`) doesn't count. A generic record
("Dork Diaries 12") at the stated volume counts a little below a real title
there that a guess matches well, unless a guess spells the record exactly.

**A listing vouches for a work** when the request states `position` and
`runtime` and:

- a series the request's `series` guesses name lists the work at exactly that
  position (a range included: an omnibus or a publisher's pack);
- its closest recording is within 2% of `runtime`, plus the minute a stored
  runtime is rounded to;
- it is in the request's `language` when one is given. With no language, a
  listing only through a series that translates another doesn't count.

Such a work's series agreement isn't marked down for a weak title, and its title
counts at least as much as a generic record's at the stated volume: the
series-named first volume whose file names only the subtitle, a pack against
its range, `American Dragons, Book 3`. The series guess resolves to the series
spelled as named when the pool holds one (`Dark Road Series` is `Dark Road`),
else to every series that fits. So beside the series it names, a fuzzy
sub-series (`Frontlines: Evolution` for `Frontlines`), a shorter name
(`Summoner` beside `Summoner School`) or a spin-off gains nothing. A title
guess that names a sibling at another position more clearly still wins, unless the runtime rules that sibling out
(`Sharpe's Siege` filed at 20 is not Sharpe's Revenge however close its length).

metaserve is the one place a title's numbering is read, so clients send folder
names raw.

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
- `recording_id` - the recording the identifier named, else the one a `narrator`
  agrees with best, else the one whose runtime is closest to `runtime`; omitted
  when none applies.
  Length never names a dramatization (GraphicAudio's imprint, a full-cast credit, a
  title keeping a statement such as `(Dramatized)`, or a recording stating no publisher
  on a work still titled with the adaptation label) unless the request's own text says
  the book is one: the work still matches and scores as before, because a dramatization
  is a recording of its book, but `recording_id` is omitted when nothing else fits. A
  narrator credited on both a plain reading and a dramatization names the plain reading.
- `reasons` - which facts agreed, each field omitted when the request didn't let
  it be judged: `title` (the best title similarity, 0-1), `text` (the typed
  text's similarity, 0-1; 1 when it named the work's series and volume, as in
  `sharpe 8`), `author` (`full`, `surname` or `none`), `series` (`position`,
  `name`, `conflict` or `none`), `runtime` (the relative difference of the
  closest recording, `0.02` = 2%), `identifier` (`asin` or `isbn`), `narrator`
  (`full`, `surname` or `none`; only when `narrator` was given and a recording of
  the work credits narrators) and `language` (`same` or `other`; only when both are
  known).

**Bounds.** Like every catalogue route it is unauthenticated and CORS-open, so a
request can't price itself: each text value is cut to 256 bytes, an author
resolves through a bounded window of people, the author and series probes add
at most **2,500** works, and comparisons run in Go over batched, indexed reads.
At most **8** matches run at once, each within a **2-second** budget that every
read it makes honours; a match that can't start or finish within it is a
**503** `the match did not finish in time; retry shortly` with `Retry-After: 1`
(the usual 503 also applies while no artifact is loaded). Nothing is cached
server-side, and a 200 carries the searches' short
[`Cache-Control: public, max-age=60`](#rate-limit-and-caching). It
takes no [`lang` filter](#the-lang-filter) and no
[`source` filter](#the-source-filter). It reads only tables that have
existed since `schema_version` 1, so it answers against every published
artifact.

`match` is a [reserved slug](data-model.md) in all three families, like `search`
and `latest`, since it is a literal segment of this route.

### `expand=work`

From v0.24.0. Over the public service the network is most of a bulk match's time,
so `expand=work` carries in one answer what a client matching a whole library
would otherwise fetch per book. **Only the best result** gains two members; every
other result, and every other member, is as it was, and without `expand` the answer
is byte-identical.

```json
{ "results": [
  { "kind": "work", "id": "the-colour-of-magic", "…": "every works/search field",
    "score": 97, "recording_id": "the-colour-of-magic-1", "reasons": { "title": 1, "author": "full" },
    "work": { "…": "byte for byte GET /api/v1/works/the-colour-of-magic" },
    "series_facts": {
      "discworld": { "language": "en" },
      "scheibenwelt": { "language": "de", "translation_of": ["discworld"] }
    } },
  { "kind": "work", "id": "runner-up", "…": "every works/search field",
    "score": 71, "reasons": { "title": 0.8 } }
] }
```

- `work` - exactly what [`GET /api/v1/works/{id}`](#apiv1worksid) serves, characters
  and recaps included when the work has them.
- `series_facts` - by series id, what the work's series records say: `language`
  (omitted where the series' members tie, or on an artifact that predates it) and
  `translation_of` (bare ids, omitted when it translates none), each the value
  `GET /api/v1/series/{id}` serves. It covers the work's memberships in order, each
  once, up to 16, leaving out a variant reading order (`ordering_of`). It is never
  a member list, so one answer adds one work and at most 16 small objects whatever
  the series' length. A series with no entry is one nothing is known about, and
  the member is omitted when it would be empty.
- **Which result.** The first, or at its score the one an identifier found. This
  route's own ranking ties on the title, so an identifier hit can rank second: find
  the best by that rule rather than taking `results[0]`.

**A client must not assume it.** The expansion is read after the match has its
answer, inside the same slot and the same 2-second budget, and it is all or nothing:
`work` present means the facts were read too. Out of budget or on a read error the
answer goes out as it would have without `expand`, never a 503 of its own (a match
that itself runs out of budget is still the 503 above). An older metaserve ignores
the parameter. So `work` absent on the best is a normal answer that means "fetch it
yourself", and a client needs that path anyway.

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

The existing entity-detail and identifier routes are **never** filtered: `works/{id}`,
`series/{id}`, `people/{id}`, `lookup`, the HTML entity pages, the sitemaps and
the watch feeds. Hiding a record there would be a 404 for a book the catalogue
holds. The separate person-recordings endpoint has its own recording-language
filter, described below.

**Parsing** (`parseLangFilter` in `pkg/query/langfilter.go`, the one parser
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

## The `source` filter

`source=<type>` narrows a work list to the works with **at least one recording
from that source type**. The use case is `source=librivox`: only the works that
have a free, public-domain [LibriVox](#the-librivox-layer) recording. It applies
to the combined `/api/v1/search` (where it scopes the page to works: a person or
a series has no recording), `/api/v1/works/search` and `/api/v1/works/latest`.
Like `lang` it narrows **lists** only: `works/{id}`, `people/{id}`,
`series/{id}` and `lookup` name their record outright and never read it.

- The value is one source type of the schema's enum (`model.KnownSourceType`:
  the [provenance types](data-model.md#provenance-on-every-entity), `librivox`,
  `libex-import`, `user` and the rest). Anything else is a **400** naming it
  (`source: "librivx" is not a source type (for example: librivox)`), for the
  same reason as `lang`: a typo that silently filtered to nothing would read as
  "the catalogue holds no such books". An empty value is no filter.
- It runs **inside** the query, through the artifact's `recording_sources` table
  (one `(work_id, recording_id, type)` row per source of each recording, indexed
  by type), so `?limit=20` returns up to 20 matching works, not the matches among
  20. Both search boosts (the exact-title lead and the series volume) obey it;
  the exact-title probe applies it **inside** its bounded window of same-titled
  works, so twenty retail "Poems" cannot crowd the LibriVox one out of
  `q=poems&source=librivox`. It combines with `lang`.
- Filtered, `works/latest` orders by the **newest recording from that source**,
  not by the work: a work's date there is the latest `added_at` among its
  recordings of that source type (the work's own `added_at` when none of them
  carries one). So a LibriVox reading that joined a classic catalogued long
  before surfaces as new, which is what a "new on LibriVox" list wants. The
  unfiltered list, and `lang` alone, still order by the work.
- **Version gate.** The table arrived with `schema_version` 8. Against an older
  artifact the value is still validated (an unknown type is still a 400) and a
  filtered list is **empty**, never the unfiltered page, which would claim every
  work came from that source.

`source` is implemented in `pkg/query/librivox.go` (`sourceParam`), beside the
rest of the LibriVox layer.

## `/api/v1/works/latest?limit=`

The newest works, for the site's landing grid. `limit` defaults to 12, clamped to
`[1, 50]`. Returns `{"works": [workCard...]}` ordered by `added_at` descending
(then title; under `source`, by the newest recording from that source - see the
[`source` filter](#the-source-filter)), with at most two works from any one series
so a bulk import sharing one date can't fill the grid. It takes the [`lang` filter](#the-lang-filter)
and the [`source` filter](#the-source-filter).
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
place, `DB.cardFactsByWork` in `pkg/query/store.go`, alongside the
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
(`pkg/query/watchfeed.go`) and differ only in the renderer.

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
(`pkg/query/seriesparam.go`):

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

`position_scale` - `{length, unit, partial?}` - is the ruler those positions are on
(`schema_version` 10, omitted when the work states none): the book's whole length in
`unit`s (`act`, `chapter`, `entry`, `episode`, `letter`, `part`, `piece`, `poem`, `scene`,
`section`, `track`), with `partial: true` when the sidecars stop short of it on purpose.
Use it to place a `reveal` or `through` on a recording whose tracks differ from those
units.

Two more fields carry the work's **translation links** (`schema_version` 7),
both `[{id, title, language}]` in work id order and both omitted when empty:

- `translation_of[]` - the work(s) this one translates. Almost always one; a
  translated omnibus names every original it collects.
- `translations[]` - the works that translate this one.

`series[]` lists every membership, every non-variant series before every variant
reading order (see the workCard's `series` above); each variant's entry carries
`ordering_of`, the primary's slug.

Each recording also carries `purchase_links[]`, derived at response time and
**non-affiliate**: `{retailer, id, region?, url, availability, free?}`, one
`audible` link per ASIN whose region has an Audible storefront and one
`libro-fm` link per valid 13-digit recording ISBN. `availability` is always
`unknown` (the catalogue keeps no volatile retailer state), so a link is a route
to check, not a claim the product is listed. A LibriVox recording carries more
fields and leads this list with a free link; see
[the LibriVox layer](#the-librivox-layer).

**Store pages** (`schema_version` 11). A recording sold by a store the
identifier-derived links can't reach carries its product page there in `links`
(`audiobookguild`, `graphicaudio`, each the store's URL as stated, each omitted
when unstated; see [store listings](contributing-data.md#store-listings-audiobook-guild-and-graphicaudio)),
and each stated page is also a purchase link, with the store key as `retailer`
and the URL as both `id` and `url`:

```json
{"retailer": "graphicaudio", "id": "https://www.graphicaudio.net/mistborn-1-the-final-empire-1-of-3.html",
 "url": "https://www.graphicaudio.net/mistborn-1-the-final-empire-1-of-3.html", "availability": "unknown"}
```

The order is the free LibriVox link, then the store pages (`audiobookguild`
before `graphicaudio`), then the derived `audible` and `libro-fm` links: a stated
page before a constructed route. Its `availability` is `unknown` like every
other, since no store feed reports it. The fact sheet and the site label them
"Audiobook Guild" and "GraphicAudio". A client that doesn't know a `links` key
or a `retailer` ignores it; against an artifact older than 11 neither appears.

Recordings also carry optional `language` and `abridgement` fields.
`abridgement` is `abridged` or `unabridged` only when the source states it;
absence means unknown. Artifact **schema 12** preserves explicit source
`abridged: false` in a nullable `recordings.abridgement` column. Against older
artifacts, legacy true still yields `abridged`, but legacy false yields no
`abridgement`. The existing optional `abridged` boolean remains compatible and
must not be used to infer unabridgement. The site's comparison and JSON-LD use
the same presence rule; no format or retailer availability is inferred.

The two AudioSilo consumers of this route choose by `ordering_of` rather than by
that order, so neither depends on it: audiosilo-server collapses each ordering
family into one series rail whose main view is the first membership with no
`ordering_of` (see its [meta enrichment envelope](../server/api/reference.md#reading-order-families)),
and the Bridge's generating engine reads a book in the first membership with no
`ordering_of` when it cuts a series glossary. Both fall back to the first membership, so a work
only a variant places keeps that variant.

## `/api/v1/works/{id}/recordings/{rid}/chapters`

The chapter list for one recording of a work: `{"chapters": [{title, start_ms,
length_ms, audio_url?}]}`, ordered by chapter index. `audio_url` is the
chapter's own audio file, present only for a recording published one file per
section (a LibriVox recording, `schema_version` 8). An unknown work/recording
yields an empty list, not a 404. audiosilo-server's
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

`translated` / `translated_total` (artifact `schema_version` 9) list, in the same
window and shape as `narrated`, the recordings that credit the person as their
own **translator** (a LibriVox project's translator, credited on the recording
rather than the work). Both are omitted when there are none and on an older
artifact; a translator a work credits is already in `authored`.

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

## `/api/v1/series/{id}/listening-guide?limit=&offset=`

A bounded series page with recording alternatives, or **404** `series not found`:

```json
{ "id": "the-saga", "name": "The Saga", "authors": [],
  "entries": [{ "position": "2.5", "work": { "id": "a-work", "title": "A work" },
    "recordings_total": 7, "recordings_limit": 5,
    "recordings": [{ "id": "a-reading", "narrators": [{ "id": "a-reader", "name": "A reader" }],
      "language": "en", "abridgement": "unabridged", "runtime_min": 480,
      "release_date": "2026", "publisher": "A publisher", "chapter_count": 20 }] }],
  "works_total": 1, "limit": 50, "offset": 0 }
```

`work` is the full compact workCard shape described above (abbreviated in these
examples). The response also carries the series' optional `language`, `ordering`,
`ordering_of`, `orderings`, `translation_of` and `translations` metadata under
the existing series rules. Members sort by the numeric start of their position,
then position string and work id, retaining decimal and range positions.
`works_total` is the unpaged catalogued member count.

Each `RecordingSummary` has `id` and `narrators[]`; `language`, `abridgement`,
`runtime_min`, `release_date`, `publisher` and `chapter_count` are omitted when
unstated or zero. Summaries contain no identifiers or chapter bodies. A work
gets at most **five** alternatives, deterministically by recording id;
`recordings_total` counts all its recordings and `recordings_limit` is `5`.
An empty array means no recording is catalogued, not that none exists.

## `/api/v1/people/{id}/recordings?limit=&offset=&series=&lang=`

Narration credits, retaining separate recordings of a work and deduplicating a
repeated credit on the same recording:

```json
{ "recordings": [{ "work": { "id": "a-work", "title": "A work" },
    "recording": { "id": "a-reading", "narrators": [] },
    "series": [{ "id": "the-saga", "name": "The Saga", "position": "2.5" }] }],
  "total": 1, "limit": 50, "offset": 0 }
```

`work` is a workCard and `recording` is the RecordingSummary above. `series[]`
contains the work's memberships, primary orders before variants, and is empty
for a standalone work. Rows sort by work title, work id and recording id.
`total` counts matching recording credits before paging. A known person with
no matching credits gets an empty array; an unknown person gets **404**
`person not found`. Authorship and translation credits remain on `people/{id}`.

`series` optionally matches one exact series slug (invalid syntax is **400**).
`lang` uses the shared language parser and primary-subtag matching against the
**recording's** stated language; unknown recording languages do not match a
filter. Invalid language values are **400**. Both filters apply before counting
and paging, and this endpoint does not depend on the older work-language gate.

Both new endpoints default `limit` to **50**, cap it at **100**, and default
`offset` to **0**. Invalid/non-positive limits use the default; invalid/negative
offsets use zero. A window beyond the end returns an empty array with the true
total. They use bounded indexed reads and batch only the current page's
recordings and credits, without a full work-detail read per row.

## `/api/v1/lookup?asin=|isbn=|librivox_id=`

Resolve one identifier to a work. At least one of `asin` / `isbn` /
`librivox_id` is **required** (400 `asin, isbn or librivox_id is required`); a
miss is 404 `not found`. On a hit:

```json
{ "work": workCard, "recording_id": "..." }
```

ASIN resolves against recording ASINs; ISBN resolves against recording ISBNs and
then falls back to a work's print ISBN (pointing at its first recording). This is
the entry point the AudioSilo server's `internal/meta` uses to enrich a book by
its `asin`/`isbn`.

`librivox_id` is a LibriVox **project id** (the number in LibriVox's API
answer, such as `52`, not its catalogue page slug) and resolves the one
recording that carries it. It is read only when
neither `asin` nor `isbn` is given, so a request carrying an ASIN keeps the
lookup it always was. A value that is not a positive integer is a 400
(`librivox_id: "x" is not a LibriVox project id`), on any artifact; against an
artifact older than `schema_version` 8 every well-formed `librivox_id` is a 404,
since it holds no LibriVox recording.

## The LibriVox layer

`schema_version` 8 carries the [LibriVox mirror](contributing-data.md#librivox-the-public-domain-mirror)'s
facts to the API. LibriVox recordings are ordinary works and recordings here, so
every route above serves them; what the layer adds:

- On `GET /works/{id}`, a LibriVox recording carries `librivox_id` (the project
  id), `archive_id` (the Internet Archive item holding its files), `links`
  (`librivox` the catalogue page, `zip` every file in one archive, `rss` the
  podcast feed, `text` the public-domain text it was read from; each omitted when
  unstated, the object omitted when all are) and `copyright_year` (the year
  LibriVox states for the source text, an integer, negative for a year BC;
  omitted when unstated). All are `omitempty`, so a non-LibriVox recording looks
  as it always did, apart from the `links` a store page adds (`schema_version`
  11, [above](#apiv1worksid)).
- Its `purchase_links[]` **lead** with
  `{"retailer": "librivox", "id": "<project id>", "url": "<links.librivox>", "availability": "unknown", "free": true}`:
  the catalogue page, the one route that costs nothing. `free` is present only
  when true, never `false` on another link. A recording with no catalogue link
  gets no LibriVox entry.
- Its chapters carry `audio_url` (above), one file per section.
- `lookup?librivox_id=` (above), the [`source` filter](#the-source-filter) and
  the [LibriVox-shaped feed](#apiv1librivoxaudiobooks) below.

A person's `birth_year` / `death_year` (LibriVox's author `dob` / `dod`) are in
the data and the artifact, but `GET /people/{id}` does not serve them; the feed
reads them as its authors' and translators' `dob` / `dod`. The recording-level
facts and the people's LibriVox ids are described in
[the data model](data-model.md#recording---a-member-of-its-work-entrys-recordings-map).

**Version gate.** An artifact older than 8 omits every field above, answers the
filter with an empty list, `librivox_id` with 404 and the feed with its 404, so
a client should treat all of it as optional. An artifact that *claims* 8 but
lacks part of the layer is refused at load
([schema versioning](data-model.md#the-compiled-artifact-and-schema-versioning)).

`schema_version` 9 adds the **LibriVox recording layer**: a project's own title,
section numbers, translators, section readers and genre names (in the data
model, a recording's `librivox_title`, `librivox_genres` and `credits`, and a
chapter's `section_number` and `readers`), which the feed below answers with. A
version 8 artifact serves the feed's earlier answer; one that claims 9 without
the layer is refused at load.

## `/api/v1/librivox/audiobooks`

**LibriVox's own audiobooks feed** (`librivox.org/api/feed/audiobooks`),
answered from the mirror with LibriVox's parameters and LibriVox's JSON shape,
so an app that reads LibriVox can move here by changing its base URL. The
trailing-slash spelling LibriVox documents (`/api/v1/librivox/audiobooks/?id=52`)
is served too. The implementation and its list of differences live in
`pkg/query/librivoxfeed.go`; `TestLibrivoxFeedGolden` compares four real
projects (527, 296, 801, 1870) field by field with LibriVox's responses.

:::tip[Bulk readers: download the artifact]
The feed is for an app's lookups and incremental syncs. To read the whole
catalogue, download `meta.sqlite.gz` from the newest
[data release](overview.md#release-artifacts) instead of paging the feed: it
holds every LibriVox recording and is what the feed reads.
:::

### Parameters

| Parameter | Meaning |
|---|---|
| `id` | one LibriVox project id; not a positive integer is a 400 |
| `since` | a UNIX time: the projects that **reached the mirror** on or after that day (below); not an integer is a 400 |
| `title` | the project's own title (LibriVox's, its `(version N)` marker kept), matched exactly and case-insensitively (ASCII letters only, as SQLite folds case); a leading `^` makes it a prefix match |
| `author` | an author's **last name** (the last word of the stored name), exact and case-insensitive (ASCII letters only), or a prefix with a leading `^`. A translator never matches |
| `genre` | one of the project's own LibriVox genre names (`Science Fiction`), exact and case-insensitive, or a prefix with `^`. Never widened through this project's vocabulary: `Mathematics` matches the projects LibriVox files under Mathematics, not every science work |
| `extended` | `1` adds `url_iarchive`, `sections`, `genres` and `translators` |
| `coverart` | `1` adds `coverart_jpg` (`null` when the recording has no cover URL), `coverart_pdf` and `coverart_thumbnail` |
| `fields` | keep only these top-level fields: `{id,title}`, a comma list, or repeated as `fields[]` |
| `limit` | default **50**, at most **500**. Over 500 is a **400** (as LibriVox answers); empty or `0` is the default |
| `offset` | matching projects to skip; not a non-negative integer is a 400 |
| `sort_order` | `desc` orders by project id descending; anything else ascending |
| `format` | `json` only (the default). `xml`, `jsonp`, `php` or any other value is a **400** |

A flag is off when empty or `0` and on otherwise, as LibriVox's PHP reads it.
Results are ordered by project id. A malformed parameter is a 400 with the usual
`{"error": "..."}` envelope. **No result** is LibriVox's own **404**,
`{"error": "Audiobooks could not be found"}`, which is also every answer of an
artifact older than `schema_version` 8 to a well-formed request (a malformed
parameter is still the 400).

**`since` means "reached the mirror since".** LibriVox compares `since` with the
day it catalogued a project; the mirror compares it, at the same day
granularity (from the first UTC midnight at or after `since`), with the day the
mirror **imported** the recording (its `added_at`). A client syncing LibriVox's
newly catalogued projects reads LibriVox's own `since`; this one trails
LibriVox by however long a project takes to be imported (for the backfill, the
day its tranche was imported).

### The response

`{"books": [...]}`, each book in LibriVox's field names, with values as strings
where LibriVox sends strings (ids, years, counts, `playtime`):
`id`, `title`, `description`, `url_text_source`, `language` (LibriVox's language
name, such as `English`; the stored language code when no LibriVox name is
known for it), `copyright_year` (`"0"` when unstated, as LibriVox
sends it), `num_sections`, `url_rss`, `url_zip_file`, `url_project`,
`url_librivox`, `url_other`, `totaltime` (`H:MM:SS`), `totaltimesecs` (an
integer) and `authors[]` (`{id, first_name, last_name, dob, dod}`), plus the
`extended` and `coverart` fields above. A section is
`{id, section_number, title, listen_url, language, playtime, file_name, readers[]}`;
a reader `{reader_id, display_name}`.

### Where it differs from LibriVox

The mirror keeps facts only (the licence's public-domain exception), so the feed
answers with what it holds and nothing more:

- `description` is **always `""`**: LibriVox's descriptions are often quoted from
  elsewhere and are never imported. `url_project` and `url_other` are `""`;
  `coverart_pdf` and `coverart_thumbnail` are `null`.
- `genres` carry an empty `id` (LibriVox's genre ids are not stored), and a
  genre LibriVox lists twice on one project is listed once.
- An author's or translator's `first_name` / `last_name` are the stored name
  split at its last word, and `dob` / `dod` are years or `""` (LibriVox's
  `alive` is not a year). A person's LibriVox id and years come from their
  person record, so a translator the mirror credited by name alone (no person
  carried their LibriVox author id) has neither. A person LibriVox lists under
  two ids states their record's own id on every project, also where LibriVox's
  answer states the second (F. P. Walter is 6492 on project 4385, where LibriVox
  says 6858).
- `^` on `author` is the documented **prefix** match; LibriVox's own
  implementation matches the end of the name.
- A section's `id` is `""`, its `file_name` `null` (`listen_url` names the
  file), and its `language` the project's language (LibriVox sometimes states a
  different one per section).
- `totaltimesecs` is the sum of the sections' playtimes (the runtime when a
  recording has no sections).

Everything else is LibriVox's value as the mirror stored it (artifact
`schema_version` 9, the LibriVox recording layer): the project's own `title`,
`(version N)` marker and spelling kept (`librivox_title`); each section's
`section_number`, LibriVox's own (some projects count from 0); each section's
`readers`, its own (a recording read by one narrator throughout names that
narrator on every section); the project's own `translators` (the recording's
credits, never the work's, so two translations of one work each list their own);
its LibriVox `genres` names; and the ids, the language name, `copyright_year`,
the URLs, the section titles, files and playtimes, the author ids and years.

**On an artifact older than 9** the feed answers as it did before, and on a
version 9 one it falls back **per recording**: a recording the import has not
yet restated (no project title stored - a release cut while the backfill is
part-landed) answers its genres and translators, and matches `genre`, as
before, while every restated recording answers from its own facts. As it did
before means: the
catalogue work's title without the `(version N)` marker, 1-based positions as
section numbers, the work's translator credits, this project's vocabulary as the
`genres` (and the `genre` filter, which then also takes a vocabulary value such
as `science-fiction`), and a section reader only for a recording with one
narrator.

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

:::warning[History: the payload was malformed until 2026-09-24]
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

## Unknown-ASIN intake queue (optional)

A deployment can offer a queue of Audible ASINs the catalogue does not hold, which
a token holder reads as ASINs worth looking up. It is the one place metaserve takes
anything from an anonymous caller. A report is a suggestion of where to look and
never a record: the queue is a separate file, outside the artifact and its swaps, and
nothing in it reaches the catalogue by itself (`internal/serve/intake.go`,
`intake_queue.go`). The routes are metaserve's own and not `pkg/query`'s, so a mirror-mode
AudioSilo server does not have them.

The token holder is the series-completion bot's
[reported-ASIN lane](./sync-bot.md#the-reported-asin-lane), when enabled: it reads the
queue with the `GET` below, looks each ASIN up as a real retailer listing, and imports
what passes in a bounded, reviewed pull request. That pull request is the only way a
report reaches the catalogue.

**It is off unless configured**, by two environment variables:

| Variable | What it does |
|---|---|
| `METASERVE_INTAKE_DB` | The path of the queue's SQLite file. Setting it registers the `POST`. The shipped compose file has it commented out as `/data/intake/queue.sqlite`, on the volume and outside the artifact cache. A file that cannot be opened or written is logged and leaves both routes off; the catalogue API stays up. |
| `METASERVE_INTAKE_TOKEN` | A random value of at least 32 bytes once trimmed (`openssl rand -hex 32`). Together with `METASERVE_INTAKE_DB`, it also registers the bearer-token `GET`. A shorter one is logged without its value and leaves only the `GET` off; set without `METASERVE_INTAKE_DB`, it is logged and both routes stay off. Never commit it. |

Unsetting `METASERVE_INTAKE_DB` is the kill switch. The file is disposable: it holds
nothing of the catalogue's, and a client can report again.

### When the queue is off

With `METASERVE_INTAKE_DB` unset, or a file that would not open, both `POST` and `GET`
answer **404**, and the [served OpenAPI document](#apiv1openapijson) does not list the
path. A metaserve that predates the route answers the same way, so a client should
read a 404 as "not offered". With the `POST` on and no valid token, the `GET` alone is
not registered: it answers the site's HTML 404, or a **405** from the router on a
deployment with no site.

:::warning[These answers are not JSON]
A route that is not registered has no error envelope. On a deployment with a static
site the answer is **the site's HTML 404 page**, and without one it is the Go router's
plain text. A client must check the status and must not parse the body as JSON.
:::

### `POST /api/v1/intake/unknown-asins`

```http
POST /api/v1/intake/unknown-asins
Content-Type: application/json

{ "asins": ["B0ABCDEFGH", "B0XXXXXXXX"] }
```

- `asins` is required and must be an array, of at most **200** items. Any other
  member of the object is ignored and never stored.
- **ASINs must be upper case.** Each item must match `^[A-Z0-9]{10}$` exactly, the
  catalogue's own format. A lower-case spelling is invalid, not normalized, so one
  ASIN has one row.
- An item that is not a string, or not an ASIN, is counted in `invalid` and does not
  refuse the report. One ASIN named twice in a body counts once, and one report adds
  1 to each ASIN's count.
- ASINs the loaded artifact already holds, in any region, are dropped. With no artifact
  loaded yet the report is taken whole, `known` is 0 and the next one to load filters
  it: unlike the catalogue routes, these two do not answer 503 for want of an artifact.

A taken report is **202**, and an empty `asins` array is a 202 with three zeros:

```json
{ "accepted": 1, "known": 1, "invalid": 0 }
```

- `accepted` - distinct valid ASINs queued or counted.
- `known` - distinct valid ASINs the loaded artifact holds, which are dropped.
- `invalid` - items that were not an ASIN, one per occurrence.

| Status | When |
|---|---|
| **202** | Taken, as above. |
| **400** | The body could not be read, is not a JSON object with an array member `asins`, or holds more than 200 items in that array. A bad item alone is not a 400. |
| **413** | The body is over **8 KiB**. |
| **415** | The `Content-Type` is not `application/json` (a charset parameter is allowed). |
| **429** | Past this client's limit (below; a refused POST counts), with `Retry-After` in whole seconds until its next report is allowed. |
| **503** | The report could not be checked against the artifact or stored. Nothing was recorded. |

Errors are the usual `{"error": "..."}` envelope.

**The limit** is **6 POSTs a day per client** with a burst of 6: six at once, then one
every four hours as the bucket refills. The `POST` skips the
[API's own limit](#rate-limit-and-caching) and keeps this one with that limit turned
off. The limiter runs first, so **a POST refused for size, type or format still spends
one of the six**. A client is keyed as on the rest of the API. Behind a proxy, [name
it](#rate-limit-and-caching) in `METASERVE_TRUSTED_PROXIES`, or every reporting client
shares one 6-a-day bucket.

**A script on another origin cannot get a report taken.** The route carries no CORS
headers and has no `OPTIONS` route, and `application/json` is required, so a browser's
preflight fails. The only cross-origin `POST` a browser sends without a preflight has
another `Content-Type`, which is a 415 here: nothing is stored, but like any refused POST
it spends one of that visitor's six.

Every answer, on both methods, is `Cache-Control: no-store` and is not gzipped.

### `GET /api/v1/intake/unknown-asins`

The token holder's read of the whole queue, at most 20,000 rows:

```http
GET /api/v1/intake/unknown-asins
Authorization: Bearer <METASERVE_INTAKE_TOKEN>
```

```json
{ "total": 1,
  "asins": [{ "asin": "B0XXXXXXXX", "count": 3, "first_day": "2026-11-05", "last_day": "2026-11-07" }] }
```

- `total` - the number of rows in `asins`, which is `[]` on an empty queue, never null.
- `asins` - ordered by `count` descending, then `first_day`, then `asin`.
- `count` - how many reports named the ASIN. **It is unverified**: it orders work and
  says nothing about how many distinct clients reported it.
- `first_day`, `last_day` - the UTC days of the first and the latest report.

| Status | When |
|---|---|
| **200** | The queue, as above. |
| **401** | A missing or wrong bearer token, with `WWW-Authenticate: Bearer`. |
| **429** | Past the [API's own limit](#rate-limit-and-caching), when that limit is on. A read spends no report. |
| **503** | The queue could not be read. |

There is no acknowledgement: reading removes nothing. An ASIN the reported-ASIN lane
imports leaves as below once a data release holds it; one it refuses leaves only by
expiry or eviction, and the lane keeps its own record of having refused it, which
itself expires (after 45 days for most, sooner for a lookup or import that failed), so the ASIN
is looked up again if it is still queued.

### How a row leaves

- **A newer data release holds its ASIN.** The housekeeping loop notices a new artifact
  on its one-minute tick and purges against it, so this can land up to about a minute
  after the swap. A purge that fails is logged, and its rows stay until the next artifact
  or restart.
- **90 days with no report.** Expiry runs at boot and once a UTC day.
- **The queue is at its cap of 20,000 rows and a new ASIN arrives.** Each one evicts the
  lowest row by `count`, then `last_day`, then `asin`, leaving alone any row the same
  report names.

### What is stored and what is not

The file is one table, `intake_asins(asin, count, first_day, last_day)`, `WITHOUT ROWID`,
created with mode 0600 (a file that already exists keeps its own mode).

- **Stored:** each reported ASIN, a count of the reports naming it, and the first and
  last UTC day it was reported.
- **Not stored:** a client address, a timestamp, a user agent, a batch id or anything else
  a report's body carried. Nothing on this path logs an address, a user agent or an ASIN
  either.
- **Held in memory only:** to enforce the limit, the client's address (an IPv6 address
  as its /64), until about a day after its last POST, refused or not. It never reaches
  the file.
- **Arrival order:** the rows hold only days, and no rowid, so they can say no more than
  that ASINs were reported on the same UTC day, which on a day with one report is that
  report's whole list. An SQLite page does list its rows as they arrived, so metaserve
  rewrites the file in key order (`VACUUM`) on the one-minute housekeeping tick after any
  report, on the first tick after a start, and at shutdown. **At most about the last
  minute's reports are in arrival order on disk**, for as long as the rewrite succeeds: one
  that fails is logged and tried again on the next tick. `journal_mode=DELETE` means no WAL
  file holds batches in arrival order, and `secure_delete=ON` zeroes a freed row's content.

That covers metaserve alone: a reverse proxy in front logs what it is set to log, so
check its access log for this route.

## HTML routes and sitemaps

With `--site`, metaserve renders catalogue facts and embeds the entity payload
before React hydrates. These are HTML routes, not additional JSON endpoints:

| Route | Content |
|---|---|
| `/browse` | Directory links to works, series, people and existing guides |
| `/browse/works`, `/browse/series`, `/browse/people`, `/browse/characters`, `/browse/recaps` | Up to 50 entries per page, sorted by displayed title/name (`COLLATE NOCASE`), then id |
| `/works/{id}` | Every recording, comparison links to `#recording-{rid}`, and detailed cards |
| `/works/{id}/characters`, `/works/{id}/recap` | Existing community guides with closed spoiler disclosures |
| `/series/{id}` | Up to 50 ordered works and their bounded listening-guide alternatives |
| `/people/{id}` | Authorship/translation lists and 50 narrated recording credits per page |
| `/works/{id}/recordings/{rid}/chapters` | Up to 100 chapter titles, starts and durations for a validated recording |

The five browse directories accept `q` (search within that directory), `letter`
(`A`-`Z`, `0-9` or `Other`; omitted means All) and `page`. Search and letter
filters compose. A-Z groups ASCII initials without regard to case, 0-9 groups
numeric initials, and Other includes punctuation and non-ASCII initials. Guide
directories search only works with the corresponding guide. Search uses the
same escaped, bounded FTS expression as public search; the public JSON API is
unchanged. `BrowseFiltered` in `pkg/query/discovery.go` implements these reads;
`internal/serve/catalogue.go` handles the HTML controls and URLs.

`q` must be valid UTF-8 and at most 256 bytes before whitespace is trimmed and
collapsed. Repeated `q`/`letter`, invalid letter values, malformed query encoding,
or a raw query string over 8,192 bytes return **400**. Letter values normalize
case (`m` becomes `M`, `other` becomes `Other`); empty/`all` means no letter
filter. Empty normalized searches are omitted. Canonical directory query order
is `letter`, `page`, `q`, with page one omitted. Valid alternate spellings, query
ordering and extra parameters redirect to that URL. Each filtered page has its
own canonical and ETag; a nonempty normalized `q` adds `noindex,follow`, while
letter-only pages remain indexable.

Directory search and letter changes reset to page one. Previous/next,
first/last, nearby numbered links and native page-jump forms retain `q` and
`letter`; the controls work without JavaScript. Clear filters removes both.

Paged routes use `?page=N`; page one omits `page` and later pages keep it in
their canonical URL and normal previous/next links. Malformed, empty, repeated,
non-positive or above-1,000,000 page values are **400**. Out-of-range pages and
missing entities/recordings are **404**. Empty catalogued directories and
recordings with no chapters have a meaningful first page. Alternate valid page
spellings and extra query parameters redirect to the canonical page URL.
Legacy `/work?id=`, `/person?id=` and `/series?id=` links redirect to their
canonical paths; retired slugs preserve relevant pagination and guide/recording
suffixes. The JSON chapter endpoint retains its separate empty-list behavior
for an unknown recording.

Absent data or a temporary HTML composition failure returns **503** with
`Retry-After` and `Cache-Control: no-store`. A missing or broken site shell
returns **500** with `no-store`, never a successful blank entity page. A real
missing record remains **404**. Spoiler bodies and aliases remain in the DOM
inside closed native `details` elements, marked `data-nosnippet`; work tab
panels stay mounted with `hidden` semantics.

`/sitemap-index.xml` lists the static sitemap when present and the generated
`/sitemaps/{family}-{shard}.xml` shards (up to 50,000 URLs each). Entity URLs
omit `lastmod`: `added_at`, import dates and artifact build times cannot establish
when a page's content changed. The index dates generated shards by artifact
build time only. Family/id order is deterministic, not a crawl-priority claim;
neither `priority` nor `changefreq` is emitted. True entity revision tracking
remains follow-up work. Sitemap validators include artifact identity, renderer
version, site URL and available build revision; this is cache invalidation, not
a content-revision date, and release builds without VCS metadata may have no
build revision. A missing artifact or failed shard composition makes a generated
shard return **503** with `Retry-After` and `no-store`. Without an artifact, the
index serves the site's static index with `no-store` when available; otherwise
it also returns **503**.

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
| `METASERVE_INTAKE_DB` (env) | (none) | the [intake queue](#unknown-asin-intake-queue-optional)'s file; setting it turns the queue on |
| `METASERVE_INTAKE_TOKEN` (env) | (none) | the bearer token of the queue's `GET`; needs `METASERVE_INTAKE_DB` |
| `--rate-limit` / `METASERVE_RATE_LIMIT` | `100` | per-client requests a second on the API; `0` turns the limit off ([below](#rate-limit-and-caching)) |
| `--rate-burst` / `METASERVE_RATE_BURST` | `400` | the per-client burst; at least 1 while the limit is on |
| `--trusted-proxy` / `METASERVE_TRUSTED_PROXIES` | (none) | comma-separated proxy addresses and CIDR prefixes whose `X-Forwarded-For` names the client |

At least one of `--db` and `--poll` is required (`New` refuses "nothing to serve"
otherwise). With `--poll` and no `--db` - the production shape - metaserve fetches
its catalogue at boot and **can legitimately start empty**; see below. With both,
the local `--db` serves immediately and the poller still runs one refresh at
startup.

## Rate limit and caching

The catalogue API is public, unauthenticated and CORS-open, and the
[LibriVox-shaped feed](#apiv1librivoxaudiobooks) invites apps that used to call
a volunteer-run server, so metaserve limits each client
(`internal/serve/ratelimit.go`). This is metaserve's own middleware: a
mirror-mode AudioSilo server mounting `pkg/query` in-process has no limit and
no `Cache-Control` defaults.

**What is limited.** Every route of the API stack: `/api/v1/*` (the OpenAPI
document and the feed included) and both Audiobookshelf provider routes.
`/healthz` is exempt (a probe, not a browser's call), and so are the HTML pages,
the static site and the sitemaps. The one exception under `/api/v1` is the
[intake queue's `POST`](#post-apiv1intakeunknown-asins), which has its own limit.

**The bucket.** One token bucket per client: `--rate-limit` requests a second
(default **100**) with a burst of `--rate-burst` (default **400**). The defaults
are sized from the heaviest legitimate caller, an AudioSilo server's bulk match,
and a console Series page's burst of lookups. Two generations of that server talk to
this service at once: one before 2.6.0 does not pace itself (2 workers, about 90
requests a second at full speed on a fast link), and one from 2.6.0 paces a whole run
to about 60 a second across 6 workers, whichever path it falls back to. Those figures
come from audiosilo-server's meta client (`internal/matchrun/runner.go` `workers` and
`maxRequestsPerSecond`, `internal/meta/service.go` `maxConcurrentWorkFetches` and
`maxConcurrentLookups`; `workers` is 6 from 2.6.0, 2 before it);
`TestDefaultsHoldAnAudioSiloBulkMatch` replays a copy of the unpaced generation's, the
faster of the two on the same bucket, so a change on the server side must re-check these defaults by hand; a scraper looping flat out
wants far more, and its route is the
[release artifact](overview.md#release-artifacts). A rate of `0` turns the
limit off (a private metaserve on the same host or LAN as its server can outrun
any sane limit). A negative or non-finite rate, or a burst under 1 while the
limit is on, is **refused at startup** rather than defaulted. (An environment
value that does not parse as a number at all, such as `METASERVE_RATE_LIMIT=off`,
is reported on stderr and the default is used.)

**Past the limit** a client gets **429** with `Retry-After` (whole seconds),
`Cache-Control: no-store` and the error envelope
(`{"error": "rate limit exceeded: at most 100 requests a second per client; ..."}`).
The limit sits inside CORS, and the API sends
`Access-Control-Expose-Headers: Retry-After`, so a script on another origin can
read how long to wait (on a 429 or on a cold boot's 503). A client should wait
that long before it retries.

**Who is a client.** The connection's address, with an IPv6 address keyed as
its **/64** (one subscriber is routinely handed a whole /64, so the full address
would be a fresh bucket per request). Only when the connection comes from one of
`--trusted-proxy` does metaserve read `X-Forwarded-For`, taking the rightmost
entry that is not itself a trusted proxy (an entry may carry a port or brackets).
An entry that is not an address ends the walk, and a request whose forwarded
entries are all trusted, or that carries none, counts as the proxy itself. A
forwarded header from anywhere else is a value the client chose and is never
read.

:::warning[Behind a reverse proxy, name it]
Without `--trusted-proxy` every request through a proxy counts as the proxy, so
the whole site shares one bucket. The shipped `docker-compose.yml` pins its
network's subnet (`METASERVE_SUBNET`, default `10.217.53.0/28`) and sets
`METASERVE_TRUSTED_PROXIES` to the loopback and that subnet alone
(`127.0.0.0/8,::1,${METASERVE_SUBNET}`). In practice that trusts only the
compose network's **gateway**, which is where a host proxy (nginx on the host,
proxying to the loopback-published port) arrives from - right for that setup and
no other. A **containerised proxy on another Docker network** arrives from its
own address, which is not trusted, so every visitor shares one rate-limit bucket:
add that proxy's address to the list. Set `METASERVE_SUBNET` in `.env` if the
default collides with a network on the host (`docker compose up` refuses with
"Pool overlaps"). An existing deployment's first start after the subnet was
pinned needs `docker compose down && docker compose up -d` **once**, which
recreates the network. Do **not** widen the list to the private ranges: if the
proxy also serves a LAN, a LAN client's own address would then be a trusted hop,
and the `X-Forwarded-For` it sends would pick its bucket. The proxy must send
`X-Forwarded-For` (nginx:
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`). If a CDN sits in
front of that proxy, add the CDN's ranges too, or rewrite the header at the host
proxy (nginx `real_ip`), or the CDN's edges become the clients.
:::

**Cache-Control.** A **200** whose route states no `Cache-Control` of its own
gets `public, max-age=600` (a release changes the data at most a few times a
day), or `public, max-age=60` on the searches (`/api/v1/search`,
`works/search`, `people/search`, `series/search`, both `/abs` provider routes)
and `works/match`, which a reader expects to track the search box. A route that
states its own keeps it: the [watch feeds](#caching) and the
[OpenAPI document](#apiv1openapijson) (`max-age=3600`), and the
[intake queue](#unknown-asin-intake-queue-optional) (`no-store`). Every other status
gets no default (`internal/serve/cache.go`): a catalogue read error carries no
`Cache-Control`, a no-artifact 503 and a 429 carry `no-store`, and only answers whose handler
states one keep it (a retired slug's 301 and a watch feed's 304, both
`max-age=3600`, and every intake queue answer, `no-store`).

## Deadlines, security headers, and reverse proxies

The listener bounds how long a **client** can hold a connection; none of these
limits how long the server may work, since nothing artifact-sized runs inside a
request (the release webhook answers 202 and refreshes in the background):

| Deadline | Value | Bounds |
|---|---|---|
| `ReadHeaderTimeout` | 10s | the request line and headers |
| `ReadTimeout` | 30s | the whole request read - only the two optional `POST`s carry a body: the webhook's capped at 1 MiB, the intake queue's at 8 KiB |
| `WriteTimeout` | 2m | the handler plus the response transfer, sized so the largest body (a 50,000-URL sitemap shard) still reaches a slow client |
| `IdleTimeout` | 3m | how long a keep-alive connection waits for its next request |

:::warning[Keep the proxy's upstream idle timeout below 3 minutes]
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
  `--site` still serves, but `/healthz`, every catalogue `/api/v1` route and both
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

The current artifact lives behind an atomic pointer (a `*query.DB`); readers
load the pointer once per request. With `--poll`, a background loop plus the optional
webhook keep it current:

- It selects the newest **data** release (the selection rule is on
  [the overview](overview.md#release-artifacts)) and fetches conditionally
  (`If-None-Match` / 304), through `pkg/release`, the fetcher mirror-mode
  AudioSilo servers use too.
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
