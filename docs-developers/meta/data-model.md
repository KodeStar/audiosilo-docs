---
title: Meta data model
description: "The audiosilo-meta entities and their on-disk layout: slug identity and range-packed storage, works/recordings/people/series, the characters and recaps sidecars, the position model, provenance, and the JSON Schema contract."
---

## Slug is identity; the file is only storage

Every entity is addressed by a **slug** matching `^[a-z0-9]+(-[a-z0-9]+)*$`
(`common.schema.json` `$defs/slug`, max 100 chars). The slug is the identity -
there is no numeric id anywhere in the data.

Storage is **range-packed** (the repo's `PACK-SPEC.md` is the full
specification): each of the four families - `data/works/`, `data/works-community/`,
`data/people/`, `data/series/` - is a set of **pack files**, each holding many
records in an `entries` map keyed by slug. A pack file's name is only the **range
bound** its slugs start at, never the identity of anything inside it:
`data/series/wheel-of-time.json` holds every series whose slug falls in its
range, which is mostly not the Wheel of Time. Nobody computes placement by hand -
`metafmt --write` relocates a misplaced entry, performs due splits, and
re-renders canonically, so an approximately-right edit is corrected
mechanically. (The pre-migration layout was one file per record,
`works/<shard>/<slug>/work.json`; those paths survive only as a reference
syntax the issue forms still accept.)

Two slugs are **reserved** in the works, people, and series namespaces: `search`
and `latest`. Both are literal route segments of the HTTP API (`/api/v1/works/search`,
`/api/v1/works/latest`, ...), so a record at either id would be unreachable
through its family's `{id}` route. Validation rejects them, and the importers and
intake bot mint a disambiguated slug instead (a book titled "Search" gets the
author-suffixed form automatically).

The JSON Schemas in `schema/*.schema.json` (JSON Schema draft 2020-12, every
object `additionalProperties: false`) are the **authoritative, public contract**.
They are embedded into the tooling via `schema.go`, so a schema edit is a code
change that ships with tests. The field lists below are drawn straight from those
schemas.

## The factual core (CC0)

### work - an entry in the `data/works/` family

The abstract book, independent of any particular narration - stored as a
**composite**: the work's own fields plus its recordings nested as
`"recordings": {"<rec-slug>": {...}}`, so one book is one entry and a recording
edit is a read-modify-write of its work.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | slug |
| `title` | yes | |
| `subtitle` | no | |
| `authors` | yes | array of person slugs, at least one |
| `language` | yes | BCP-47-ish (`^[a-z]{2,3}(-[a-z0-9]{2,8})*$`) |
| `first_published` | no | `YYYY` or `YYYY-MM-DD` |
| `description` | no | community-written, never a publisher blurb |
| `genres` | no | values from the project's controlled vocabulary (`$defs/genre`, a flat retailer-neutral list), sorted ascending |
| `credits` | no | role-qualified contributors as `{person, role}` pairs; `role` from the `$defs/credit_role` enum (adaptation, afterword, contributor, editor, foreword, illustrator, introduction, preface, translator). Additive and parallel to `authors`; emitted only when a source stated the role |
| `xref` | no | `wikidata` (`Q\d+`), `openlibrary` (`OL\d+W`), `goodreads`, print `isbn[]` |
| `added_at` | no | `YYYY-MM-DD`, or a full RFC 3339 timestamp for migration-backfilled records |
| `recordings` | yes | the nested map of this work's recordings (below) |
| `license` | yes | `CC0-1.0` |
| `sources` | yes | provenance (below) |

### recording - a member of its work entry's `recordings` map

A specific narration/production of a work. **One work, many recordings** - the
canonical example is *Harry Potter and the Philosopher's Stone*, one work with a
Stephen Fry recording and a Jim Dale recording, each carrying its own ASINs. A
production released in several marketplaces stays **one recording**: the region
rides on the identifiers and the imprint, never on a second record.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | slug |
| `work` | yes | parent work slug |
| `narrators` | yes | array of person slugs, at least one |
| `abridged` | no | **tri-state**: absence means *unknown*, so importers omit it rather than guess |
| `language` | yes | |
| `runtime_min` | no | integer minutes, > 0 |
| `release_date` | no | `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` |
| `asin` | no | array of `{region, asin}`; `region` is one of 11 storefronts (`us`, `uk`, `ca`, `au`, `de`, `fr`, `es`, `it`, `jp`, `in`, `br`); `asin` is `[A-Z0-9]{10}` |
| `isbn` | no | array whose entries are a bare 10/13-digit ISBN string (region unstated - the scale form every bulk writer emits) or the object `{isbn, region}` when the marketplace is known; uniqueness keys on the value, so both spellings of one identifier collide |
| `publisher` | no | the publisher of record |
| `publishers` | no | array of `{region, publisher}`: other regions' imprints. May never restate the top-level `publisher` or name one region twice |
| `cover_url` | no | must be an `https://` URL |
| `chapters` | no | array of `{title, start_ms, length_ms}` |
| `added_at` | no | as on work |
| `license` | yes | `CC0-1.0` |
| `sources` | yes | |

### person - an entry in the `data/people/` family

One person, shared across roles: authors on works and narrators on recordings are
the same entity type, and a person can be both. Fields: `id`, `name`, optional
`sort_name`, optional `kind` (`person` / `group` / `publisher` - marks records
that are not an individual, such as a full cast or a corporate credit of record;
**absence means person or unclassified**, never a guess), optional `description`,
optional `xref` (`wikidata`, `openlibrary` `OL\d+A`, `audible` ASIN), `license`
(`CC0-1.0`), `sources`.

### series - an entry in the `data/series/` family

A named, ordered set of works. Each entry is `{work, position}`, where
**`position` is a string** so it can express decimals and omnibus ranges:
`"1"`, `"2.5"`, or a range spanning several entries `"1-3.5"` (pattern
`^\d+(\.\d+)?(-\d+(\.\d+)?)?$`). `metacheck` enforces that **no two works share a
position** within a series. Fields: `id`, `name`, optional `authors`, `works`,
optional `xref` (`wikidata`, `goodreads`), `license` (`CC0-1.0`), `sources`.

## The expressive layer (CC BY-SA)

Two **per-work sidecars** carry the community-authored, spoiler-tagged content:
the `characters` and `recaps` members of a work's entry in the separate
`data/works-community/` family, keyed by the **work's** slug. They are
structurally separated from the core: their `license` field accepts only
`CC-BY-SA-4.0` (`$defs/license_content`), and the family boundary makes the
licensing split visible in the directory tree. Authoring them is documented in
the repo's `AUTHORING.md` (see [contributing data](contributing-data.md)).

### characters - the `characters` member of a works-community entry

An array of character entries under a `work` slug. Each character has:

- `id` - unique **within the member**, not globally (two works may each have a
  `bilbo-baggins`);
- `name`, optional `aliases[]`, optional `role` (`protagonist` / `antagonist` /
  `supporting` / `minor`);
- `reveal` - a [position](#the-position-model), the spoiler gate: a consumer only
  shows the entry once the listener has passed it (the Kindle X-Ray model);
- optional `description` - own-words, length-capped at 1500 chars (a card
  without one simply has nothing to reveal);
- optional `xref` (`wikidata`, `goodreads`) - a shared `wikidata` QID links a
  recurring character across a series' per-work entries.

Recurring characters are **re-described per book**, so what a reader sees stays
bounded by which book they are currently in.

### recaps - the `recaps` member of the same works-community entry

Position-keyed "story so far" summaries under a `work` slug, plus two optional
whole-book summaries. Each recap entry has:

- `through` - a [position](#the-position-model): the recap is safe to show once
  the listener has finished that chapter. **No two recaps in a member share a
  `through` chapter.**
- optional `scope` (`book` / `series`) - a `chapter: 0` + `series` entry is the
  "previously, in earlier books" recap;
- `text` - own-words, length-capped at 3000 chars.

The member also carries two optional whole-book fields for a reader who has
finished the book: `in_short` (the whole arc in one paragraph, ending included,
cap 1500) and `ending` (how the book closes, stated plainly, cap 2000 -
deliberately tighter than a chaptered recap entry, a crisp sequel-handoff).

## The position model

Spoiler positions use one shape everywhere (`common.schema.json` `$defs/position`):

```json
{ "chapter": 3 }
```

`chapter` is a non-negative integer: the **logical, edition-independent** work
chapter (1-based), where `0` means front matter or knowledge carried in from
earlier books in a series. A consumer maps its own recording-chapter timeline
onto these ordinals; text-to-audio alignment is a consumer concern, out of schema
scope. The object shape is deliberately extensible - a later `paragraph` or
`offset_ms` can be added without a breaking change.

## Provenance on every entity

Every record carries a `sources[]` array (`$defs/sources`, at least one entry).
Each source is `{type, ref?, imported_at?}`, where `type` is one of a fixed enum
(`user`, `openaudible-import`, `libation-import`, `audiosilo-books-import`,
`libex-import`, `audible-lookup`, `openlibrary`, `wikidata`, `inventaire`,
`community`) and
`imported_at` is `YYYY-MM-DD`. Because every fact records where it came from, a
whole source can be audited or retracted.

## The compiled artifact and schema versioning

`metabuild` compiles the tree into a deterministic SQLite artifact (`internal/build`),
inserting rows in sorted id order so identical data always produces an identical
file. It stamps a `schema_version` into the artifact's `meta` table, and the
expressive layer was added in later versions:

| artifact `schema_version` | Adds |
|---|---|
| 1 | the factual core (works, recordings, people, series, FTS5 search index) |
| 2 | the `characters`, `character_aliases`, and `recaps` tables |
| 3 | the per-work `recap_summaries` table (the `in_short` / `ending` fields) |
| 4 | the `work_genres` set table |

`metaserve` returns characters, recaps and genres inline on `GET /works/{id}`
(`characters` / `recaps` / `recap_summary` / `genres`, all `omitempty`). The
serve queries **degrade gracefully** when a newer binary briefly serves an older
release: the characters/recaps queries no-op below `schema_version` 2, the recap
summary below 3, and genres below 4, so a missing table reads as "no data",
never a 500. The same versioning
drives the [coverage endpoints](api.md#coverage-endpoints), which omit a
dimension's count rather than report it as a misleading zero when the artifact
predates its table.
