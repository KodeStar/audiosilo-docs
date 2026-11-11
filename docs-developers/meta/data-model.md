---
title: Meta data model
description: "The audiosilo-meta entities and their on-disk layout: slug identity and range-packed storage, works/recordings/people/series, the characters and recaps sidecars, the position model, provenance, and the JSON Schema contract."
---

## Slug is identity; the file is only storage

Every entity is addressed by a **slug** matching `^[a-z0-9]+(-[a-z0-9]+)*$`
(`common.schema.json` `$defs/slug`, max 100 chars). The slug is the identity.
There is no numeric id anywhere in the data.

Storage is **range-packed**, and the repo's `PACK-SPEC.md` is the full
specification. Each of the four families (`data/works/`, `data/works-community/`,
`data/people/`, `data/series/`) is a set of **pack files**. Each pack file holds
many records in an `entries` map keyed by slug.

A pack file's name is only the **range bound** its slugs start at, never the
identity of anything inside it. `data/series/wheel-of-time.json` holds every
series whose slug falls in its range, which is mostly not the Wheel of Time.
Nobody computes placement by hand. `metafmt --write` relocates a misplaced entry,
performs due splits, and re-renders canonically, so the tool corrects an
approximately-right edit. The pre-migration layout was one file per record,
`works/<shard>/<slug>/work.json`. Those paths survive only as a reference syntax
the issue forms still accept.

### Reserved slugs

Three slugs are **reserved** in the works, people, and series namespaces:
`search`, `latest` and `match`. Each is a literal route segment of the HTTP API
(`/api/v1/works/search`, `/api/v1/works/latest`, `/api/v1/works/match`, ...), so
a record at any of those ids would be unreachable through its family's `{id}`
route. (`match` joined with its route in 2026-10, when no record held it.)
Validation rejects them. The importers and the intake bot mint a disambiguated
slug instead, so a book titled "Search" gets the author-suffixed form
automatically.

### Retired slugs

A slug can also be **retired**. When a repair wave merges two duplicate records,
it tombstones the losing slug in `data/redirects.json` (one map per family) rather
than deleting it. `metaserve` resolves a request for it with a 301 to the
surviving slug.

The bulk importers and the intake bot honor the same table when they *mint*
records, so a later import can't recreate what a merge just retired:

- a person's retired slug resolves to the person they were merged into;
- a series name on a retired slug joins the surviving series;
- a work candidate on a retired slug is judged against its survivor by the same
  identity rules an ordinary duplicate would be.

### Retitle aliases

The same table records a **retitle alias**. A work's slug never follows its
title. So a retitle (a repair wave's `retitle-work`, or an intake title
correction) can leave the work off the slugs its new title composes, and the next
import of that title would miss it and mint a duplicate. The retitle therefore
also records, as a tombstone onto the work, the slug that import would mint at,
and the import merges into it instead. No alias is written when the new title
still reaches the work, or for a serial volume at `<title>-book-<n>`, which its
position already reaches.

### The redirects merge driver

The table has a git merge driver of its own, `cmd/metaredirectmerge`.
`.gitattributes` names it for that one path, and the intake rebase sweep
configures it (the pack driver merges pack files only). Two pull requests that
each record a tombstone (two intake retitles, say) touch adjacent sorted lines, so
git's line merge would stop on them. The driver merges each family's map three
ways instead:

- it keeps what either side added;
- it collapses a chain the two sides make together. If one side retired `a` into
  `b` and the other `b` into `c`, both end at `c`, as `pkg/redirects.Add` would
  have written them one after the other;
- it refuses, with conflict markers, one slug sent to two different targets, or
  deleted on one side and retargeted on the other.

### The schemas are the contract

The JSON Schemas in `schema/*.schema.json` (JSON Schema draft 2020-12, every
object `additionalProperties: false`) are the **authoritative, public contract**.
They are embedded into the tooling via `schema.go`, so a schema edit is a code
change that ships with tests. The field lists below are drawn straight from those
schemas.

## The factual core (CC0)

### work - an entry in the `data/works/` family

A work is the abstract book, independent of any particular narration. It is
stored as a **composite**: the work's own fields plus its recordings nested as
`"recordings": {"<rec-slug>": {...}}`. So one book is one entry, and a recording
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
| `genres` | no | values from the project's controlled vocabulary (`$defs/genre`, a flat retailer-neutral list), sorted ascending. A mirror-derived set is the vote over the work's recordings, with format categories counting only when nothing else maps. See [genres](./contributing-data.md#genres-the-format-rule-the-recording-vote-and-regeneration) |
| `credits` | no | role-qualified contributors as `{person, role}` pairs; `role` from the `$defs/credit_role` enum (adaptation, afterword, contributor, editor, foreword, illustrator, introduction, preface, translator). Additive and parallel to `authors`; emitted only when a source stated the role |
| `translation_of` | no | the work(s) this one is a **translation** of, as a set of work slugs (`$defs/slug_set`: at least one, unique, ascending). Almost always one; a translated omnibus names every original it collects. Stated evidence only, never inferred. See [translations and reading orders](#translations-and-reading-orders) |
| `xref` | no | `wikidata` (`Q\d+`), `openlibrary` (`OL\d+W`), `goodreads`, print `isbn[]`. A recording may not carry a work's print ISBN, in its ISBN-10 or ISBN-13 spelling: `metacheck` fails the tree. |
| `added_at` | no | `YYYY-MM-DD`, or a full RFC 3339 timestamp for migration-backfilled records |
| `recordings` | yes | the nested map of this work's recordings (below) |
| `license` | yes | `CC0-1.0` |
| `sources` | yes | provenance (below) |

### recording - a member of its work entry's `recordings` map

A recording is a specific narration or production of a work. **One work, many
recordings.** The canonical example is *Harry Potter and the Philosopher's
Stone*: one work with a Stephen Fry recording and a Jim Dale recording, each
carrying its own ASINs. A production released in several marketplaces stays
**one recording**. The region rides on the identifiers and the imprint, never on
a second record.

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
| `isbn` | no | array whose entries are either a bare 10/13-digit ISBN string (region unstated; the scale form every bulk writer emits) or the object `{isbn, region}` when the marketplace is known. Uniqueness keys on the value, so both spellings of one identifier collide |
| `publisher` | no | the publisher of record |
| `publishers` | no | array of `{region, publisher}`: other regions' imprints. May never restate the top-level `publisher` or name one region twice |
| `cover_url` | no | must be an `https://` URL |
| `chapters` | no | array of `{title, start_ms, length_ms, audio_url?, readers?, section_number?}`; the optional fields are described [below the table](#chapter-fields) |
| `librivox_id` | no | the LibriVox project id this recording *is* (integer, at least 1). The identity a LibriVox import deduplicates on (never the title); `metacheck` holds it unique across the dataset |
| `archive_id` | no | the Internet Archive item holding the recording's files (`archive.org/details/<archive_id>`), pattern `^[A-Za-z0-9][A-Za-z0-9._-]*$` |
| `links` | no | where the recording is published; see [The `links` field](#the-links-field) below the table |
| `librivox_title` | no | the LibriVox project's own title, verbatim (`Candide (version 2)`), its repeat markers and spelling kept. The work's `title` is the work's. Requires `librivox_id` |
| `librivox_genres` | no | the LibriVox project's own genre names, verbatim, each once, in LibriVox's order (the licence's public-domain exception). Never the work's `genres`, which stay this project's vocabulary. Requires `librivox_id` |
| `credits` | no | the recording's own role credits (`{person, role}`), in addition to the work's: a LibriVox project's translators, since a translation is a fact about the project. `role` is `translator` only (the one role a recording states today), and `metacheck` requires `librivox_id` beside them. The work keeps the translator credits its sources stated, and `authors` stays the identity list |
| `copyright_year` | no | the copyright year of the **text** this recording reads, as the source stated it (LibriVox's `copyright_year`; its `0`, meaning unstated, is never written). A signed integer, negative for a year BC, never `0`. Deliberately not the work's `first_published`, which another source may own |
| `added_at` | no | as on work |
| `license` | yes | `CC0-1.0` |
| `sources` | yes | |

#### Chapter fields

- **`audio_url`** (an `https://` URL) is the audio file the chapter *is*, for a
  recording published one file per section. `metacheck` requires the recording's
  `librivox_id` beside it.
- **`readers`** is who reads the chapter: person slugs, each one of the
  recording's narrators. When no chapter carries them, every chapter is read by
  the narrators. Once one does, a chapter without them states none. `metacheck`
  refuses readers on every chapter of a one-narrator recording, because their
  absence already says that narrator reads them all. It requires the recording's
  `librivox_id` beside any readers.
- **`section_number`** is LibriVox's own number for the section. It is written
  only where it differs from the 1-based position, since LibriVox numbers some
  projects from 0. `metacheck` requires `librivox_id` beside it and refuses one
  equal to the position.

#### The `links` field

Each URL is kept as the source stated it, `https://` only. The keys are:

- `librivox` (the catalogue page);
- `zip` (every file in one archive);
- `rss` (the podcast feed);
- `text` (the text the recording reads from; LibriVox's `url_text_source`);
- the recording's product page on a store the identifier-derived purchase links
  can't reach: `audiobookguild` (Audiobook Guild) and `graphicaudio`
  (GraphicAudio).

At least one key is required, and no others are allowed. `metacheck` holds a store
key to a page on that store's own host (`model.StoreLinkOK`: `https://`, the bare
or `www.` host, no port or credentials, a path past the host, no query string or
fragment). It also holds each store page unique across the dataset by
`model.StoreLinkKey`, which folds host case, a leading `www.` and a trailing `/`;
the stored link keeps its spelling. A store page is a route, not an identifier, so
a dead link is a data edit. The vocabulary is `pkg/model/storelinks.go`; see
[store listings](./contributing-data.md#store-listings-audiobook-guild-and-graphicaudio).

### person - an entry in the `data/people/` family

A person is one entity shared across roles. Authors on works and narrators on
recordings are the same entity type, and a person can be both.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | slug (see [The person's id](#the-persons-id)) |
| `name` | yes | |
| `sort_name` | no | |
| `kind` | no | `person` / `group` / `publisher` / `synthetic`. Marks records that are not an individual, such as a full cast, a corporate credit of record or a text-to-speech voice. **Absence means person or unclassified**, never a guess. The field stays in the data tree; the SQLite artifact and the API do not carry it |
| `description` | no | |
| `xref` | no | `wikidata`, `openlibrary` `OL\d+A`, `audible` ASIN |
| `librivox_reader_id`, `librivox_author_id` | no | the person's LibriVox catalogue ids, integers of at least 1. A translator's id is an author id |
| `librivox_reader_aliases`, `librivox_author_aliases` | no | further ids of one person LibriVox lists twice (below) |
| `birth_year`, `death_year` | no | the years a source stated (LibriVox's author `dob` / `dod`); signed integers, negative for a year BC, never `0` |
| `license` | yes | `CC0-1.0` |
| `sources` | yes | |

The two LibriVox ids are separate namespaces, so a reader id and an author id of
the same number are not a collision. `metacheck` holds each unique across the
dataset, because a LibriVox import keys people on them.

The alias fields are sorted integers. Each is unique against every id and alias of
its namespace, and the record's own id is required beside them. An import resolves
an alias to the record, and only an evidenced fold writes one
([how](contributing-data.md#one-person-under-two-librivox-ids)).

A life year is a fact or it is absent. A stated value that is not plainly a year
(`alive`, `c. 1500`) is never written, and `metacheck` refuses a `death_year`
before the `birth_year` (`pkg/check/librivox.go`).

#### The person's id

A person's `id` is the one `model.PersonSlug` derives from their `name`, reserved
names and the catch-all included. `metacheck` refuses a record whose id is not,
because the next import of that name would miss it and mint a second record.

A LibriVox author who shares a name with a catalogued person is told apart by the
years in the name itself ("James Grant (1822-1887)" is `james-grant-1822-1887`),
so that id is an ordinary derived one. Four other forms are legal, because the
LibriVox import finds a person by id before it reads a name. Two are for a
LibriVox reader:

- `<name slug>-librivox-<reader id>` (`martina-librivox-634`,
  `model.LibrivoxReaderSlug`) for a reader whose name another reader id, or an
  [author record](./contributing-data.md#librivox-the-public-domain-mirror),
  already holds. The name's part is shortened at a word boundary to keep the id
  within 100 characters; the reader id is always whole.
- `librivox-reader-<reader id>` (`librivox-reader-11294`,
  `model.LibrivoxUnslugReaderSlug`) for a reader whose name slugs to nothing
  (Greek, Cyrillic, CJK), the name kept as written. It is legal only for such a
  name.

Two are for a LibriVox author or translator:

- `<name slug>-librivox-author-<author id>` (`ralph-scott-librivox-author-16428`,
  `model.LibrivoxAuthorSlug`) for an author whose name a person who is someone
  else holds, when LibriVox states no year to date the name by.
- `librivox-author-<author id>` (`librivox-author-17538`,
  `model.LibrivoxUnslugAuthorSlug`) for an author or translator whose name slugs
  to nothing, the name kept as written. It is legal only for such a name.

`metacheck` accepts a reader form only on a record carrying exactly that
`librivox_reader_id`, and an author form only on one carrying exactly that
`librivox_author_id`. The rule is `model.PersonIDMatches`. A refusal suggests
`model.WantPersonID`, so a name that slugs to nothing is pointed at its LibriVox
form, never the catch-all `person`.

#### The catch-all person

The catch-all person, `person`, is where every name that slugs to nothing would
otherwise land. No import credits it. libex refuses the row, and every other
import (LibriVox, OpenAudible, Libation, AudioSilo books) leaves the credit off and
reports it as a credit not recorded, reason `unsluggable`.

`metacheck` refuses, whatever the source:

- a `person` record whose name slugs to nothing;
- unless a person really named "Person" holds the id, a work authoring or
  crediting `person`, and a recording keyed on or narrated by it.

Otherwise one record would author or narrate every unrelated book such a name
wrote or read.

### series - an entry in the `data/series/` family

A series is a named, ordered set of works. Each entry is `{work, position}`, where
**`position` is a string** so it can express decimals and omnibus ranges: `"1"`,
`"2.5"`, or a range spanning several entries, `"1-3.5"` (pattern
`^\d+(\.\d+)?(-\d+(\.\d+)?)?$`). `metacheck` enforces that **no two works share a
position** within a series.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | slug |
| `name` | yes | |
| `authors` | no | |
| `works` | yes | the `{work, position}` entries |
| `translation_of` | no | the series this one translates, a slug set like the work's. A series-level claim, independent of any work-level pairing |
| `ordering` | no | which reading order this series' positions state: `publication`, `chronological` or `recommended` |
| `ordering_of` | no | set only on a **variant** ordering: the slug of the franchise's primary series. The schema requires `ordering` beside it |
| `xref` | no | `wikidata`, `goodreads` |
| `license` | yes | `CC0-1.0` |
| `sources` | yes | |

A series states no language of its own. See
[translations and reading orders](#translations-and-reading-orders) for the one it
is given.

## Translations and reading orders

Two kinds of link tie records together across languages and across ways of
reading a franchise. Both are **stated evidence only**. Nothing infers them, and
no record carries one until somebody states it.

### Translations

A work's `translation_of` points from a translation to the work(s) it translates.
The direction is always translation to original. A series can carry the same
claim about another series. `metacheck` holds both families to five rules:

1. Every target is a **live** slug of the same family. A target that has been
   retired (a source in `redirects.json`) is refused with a message naming the
   survivor to point at instead.
2. A record never names **itself**.
3. The two sides are in **different languages**, compared by primary subtag
   (`en-GB` and `en` are one language).
   - For two works this is a problem, judged over their stated `language`.
   - For two series it is judged on each series' **derived** language (below),
     and skipped when either side has none, since a tie cannot be judged. It is
     only an **advisory**, `series-translation-same-language`. The link is still
     true when a member is misfiled in the wrong language, and a sync-bot
     addition that tips a series' majority must never turn a check it did not
     write red.
4. **No chains.** A target may not itself carry `translation_of`, so the original
   is always one hop away.
5. The set is stored in **ascending** order, so one set has one byte-form
   (uniqueness is the schema's own rule).

### Where translation links come from

Besides the correction form (see [contributing data](contributing-data.md)), the
maintainers' data-quality audit proposes links. It reads the one statement a
record makes about its own language: a retailer's own-language **edition
decoration**, such as "(German Edition)" or "[Spanish Edition]". Its `T-LINK`
class has two subclasses, each applied by a repair op named for the family it
links:

- **series-edition** (`add-series-link`). A series named
  `<name> [<Language> Edition]` whose members are in that language is linked to
  the one other series called `<name>` that shares a member's author and is in
  another language.
- **work-edition** (`add-work-link`). A work whose title or subtitle states its
  own language's edition is linked to the one work in another language that is
  the same book by the project's own identity rule. A translator credit marks a
  work as a translation but never makes one an original, and is not enough on its
  own.

There is exactly one original, or no proposal. A proposal is applied only when
nothing casts doubt on it; for a work, the translation's title must be the
original's title left untranslated. The rest are left for a human to review. The
repair pass applies proposals as ordinary reviewed data pull requests, and holds
every one to the rules above before anything is written.

### Reading orders

A franchise often has more than one order worth listening in (publication,
chronological, an author's recommended order). The **primary** ordering is the
series itself. A **variant** is a series of its own whose `ordering_of` names the
primary and whose `ordering` says which kind of order it is. An author's preferred
order and a recommended listening order both map to `recommended`; the series
name keeps the exact wording. `metacheck` refuses:

6. an `ordering_of` whose target is not a live series (a retired target names
   its survivor);
7. a series naming itself;
8. a **chain**: the target may not have an `ordering_of` of its own, so a family
   is always one hop deep;
9. two members of one **ordering family** (a primary and every series whose
   `ordering_of` names it) stating the **same** `ordering`. A second series in the
   same order is a duplicate to fold, not a view. The message names both series.

A variant that lists a work its primary does not is reported as the **advisory**
class `ordering-variant-not-subset`, never a failure. A chronological list
legitimately holds a prequel novella the publication list never numbered. It and
`series-translation-same-language` (rule 3) are the two advisories. Every other
rule above is a problem that fails the check.

### A series' language is derived, not stated

A series' language is the primary subtag that more of its members state than any
other. This is a strict plurality, so two English members beside one French and
one German make an English series, though not over half. It is nothing when the
leading languages tie or no member states one. `model.SeriesLanguage` is the one
definition that `metacheck`, the audit and the artifact builder share. The
compiled artifact writes it down for readers; the data never does.

## Data-quality audit rules

The maintainers' data-quality audit groups its findings into classes, and repair
ops act on them. The sections below are the rules each class follows.

### When a series mixes languages

A bulk import could join a same-named series whatever its language, so a German
edition's volumes sometimes sit in the English series of that name (or the
reverse). The audit reports every series whose members state two or more
languages under its `L-MIX` class. It reads the series against one **keeper**
language:

- the series' derived language;
- for a tie, the language its name's edition decoration states ("[German
  Edition]");
- else the half holding the member catalogued first.

The audit files each member in another language once, and three repair ops act on
it:

- **already homed** (`drop-membership`). The work also sits in a series of its
  own language, so the membership here is dropped.
- **a target exists** (`move-membership`). Exactly one other series in the work's
  language is this series under another name: the same name once an edition
  decoration is set aside, or a `translation_of` link either way. If its slot at
  the work's position is free, the membership moves there at the same position.
- **no target** (`split-series`). The members in that language move to a **new**
  series of the same name, at the next free slug on the importer's own chain,
  with their positions kept. The keeper language keeps the original slug. A
  series in three languages yields one split per minority language.

A proposal is applied only when nothing casts doubt on it. It is left for a human
when:

- the series is a tie decided by which half came first;
- a member carries a recording in the keeper language (that recording is
  relocated to a work in its own language first);
- a member's **narrators** record in another language than the work states;
- the series is part of a reading-order family;
- another proposal in the same audit changes the same record.

A split is also left for review when:

- the two halves share no author;
- the members moving out are themselves more than one author's series;
- the half keeping the slug states that it is a translation and the moving half
  does not;
- the moving half was catalogued first;
- the new series would carry an edition-decorated name onto works of another
  language.

### Which half keeps the slug is never decided by a count alone

A slug is public (URLs, watchlists, the server's metadata seam), and the larger
half is often the translation. `zodiac-academy` once held 15 German books of a
different franchise beside the 14 English originals. So a majority keeper is
**contested**, and every proposal for that series becomes advisory, the drops and
moves included, when:

- a keeper-language member states it is a translation (a `translation_of` link,
  an own-language edition decoration, a translator credit);
- the halves share no author (two series of one name);
- the series' principal author writes mostly in a minority language across the
  catalogue. Collective and classified credits are not evidence of either.

No signal sees every case. So the audit also proposes every mixed series' split in
**every other orientation** (subclass `other-keeper`, keyed
`<series>/<language>/keep-<keeper>`), even beside a same-name series in the moving
language. The reviewer can then always accept the orientation that is right,
rejecting an uncontested majority split in the same list. Accepting two
orientations of one series, or a drop the chosen orientation contradicts, is
refused at audit time.

### When one book is catalogued twice

Every duplicate check on works compares one normalized identity: the title with
retailer decoration removed, read with the authors and language. The checks are
the audit's `W-DUP` class, `metacheck`'s advisory census, and the importer's and
intake bot's create guards.

Decoration is what a listing says about the product rather than the book:

- an `(Unabridged)` marker;
- the series name at a title boundary;
- a marketplace edition (": International Edition", "(International Edition)");
- a narrator credit standing as a bracketed group or the last segment
  ("(Narrated by Stephen Fry)", " - Gesprochen von Rufus Beck", ", Read by Ray
  Ortlund"). The credit must look like a name, so "The Book Thief: Narrated by
  Death" keeps its title.

A leading brand possessive compares as the plain name ("Tom Clancy's Oath of
Office" meets "Tom Clancy Oath of Office"), but is never written into a proposed
retitle.

A stated edition in **another language** is the opposite case. "The Gambler
[Persian Edition]" is a translation, not a duplicate, so the audit never folds it
onto the English original even when its language tag is wrong. The wrong tag is a
`title-language` correction (below).

**Typography.** Finding a series name in a title folds typography first, for every
one of those checks. A curly or other apostrophe glyph reads as the straight one.
A colon in the series name also matches a spaced dash in the title, one way only:
a dash in the name never matches a title's colon. So "The Tournament at Gorlan:
Ranger’s Apprentice - The Early Years, Book 1" is read against the series
"Ranger's Apprentice: The Early Years" exactly as its straight twin would be.

**Extra keys.** `W-DUP` alone then groups works on two **extra keys** beside the
identity, so the census and the create guards are untouched by them:

- a **US/UK spelling** key over a closed word table (armour/armor, colour/color,
  grey/gray, travelling/traveling, whole words only), which meets the UK and US
  editions of one book;
- a **sub-series tail** key: a title "The Royal Ranger: The Missing Prince" whose
  head is the part after the colon of a series name the work's author holds
  ("Ranger's Apprentice: The Royal Ranger"), read against that tail.

**Series.** Two works sitting in entirely different series are never merged. Two
spellings of one series holding both works at the same position count as one
series, though: the same name with the same decoration, or a decoration on one
side only that is a catalogue note from a closed list (an ordering, an
own-language edition, a dramatization, an abridgement either way, a full cast, a
narration credit). Two different decorations stay apart, so "Pimsleur Chinese
(Cantonese)" and "Pimsleur Chinese (Mandarin)" are two courses.

**Refused retitles.** A proposed retitle is refused when stripping the series name
off the front leaves only a part of something:

- a collection statement or a bare volume ("Charassi's Fae Queen: Six Book World
  Boxset" would become "Six Book World Boxset");
- one end of a stated range ("Books 13 - 16" cut to "Books 13").

The intake bot then keeps the title as submitted. The audit also withholds a
retitle against a series that is only this one book's own edition ("Let's Split
Up (German Edition)", holding just this work), which would otherwise leave the
tagline as the title.

### When one series is spelled twice

The audit's `SER-DUP` class groups series whose names normalize to the same key
("Temeraire" and "Temeraire (abridged)"). It proposes a `merge-series` onto one
survivor, with the retired slug tombstoned like any merge.

A fold is withheld for a human whenever the members disagree: no shared author,
two languages, two reading orders of one franchise, a collection beside the books
it collects, or two lists that put different works at one position. A
parenthetical decoration is withheld too, since it usually says something the
plain name does not (an edition, an alternative order, an author).

Two decorations are the exception, and only on a series that **moves nothing**.
That means every membership is already in the undecorated survivor at the same
position, so the fold retires a spelling and changes no order:

- an **ordering** qualifier ("(Published Order)") whose list IS the plain series'
  list, as many memberships and none different;
- an **abridged** format qualifier, "(abridged)" or "(gekürzt)" only, whose
  memberships the plain series already holds. A part of the list is enough, since
  abridgement is a recording's `abridged` fact and only some volumes are ever
  abridged. Every work the abridged series lists must also carry a recording
  stating `abridged: true`. Otherwise the series name is the only record that an
  abridged production exists, and the fold would erase it. "Unabridged",
  dramatized, Hörspiel, radio and full-cast series are product lines of their own
  and are never folded this way.

After the fold, an import naming the retired "Women's Murder Club (abridged)"
resolves through the tombstone to the plain series, so it is not re-created.

**Reading-order families.** A group holding two reading orders of one franchise,
or a series and its translation, is withheld as a whole. The **plain** spellings
inside it (no reading-order or translation link of their own, no other ordering,
no other language) are still judged one by one against each member of the
reading-order family, one proposal per spelling. A fold here may only retire a
spelling, never add to a reading order:

- **family-spelling**. The plain series holds the very list one family member
  holds, slot for slot ("Chronicles of Narnia" beside "The Chronicles of Narnia
  (Author's Preferred Order)"). It folds onto that member. The fold is applied
  when the member is the primary. It is advisory (applied only through a reviewed
  `accept`) when the member is a variant, since an import naming the plain name
  would then reach a variant through the tombstone alone. When the lists still
  differ because the works themselves are not yet merged, it is a review naming
  the closest member and the duplicate-work clusters holding each conflicting
  slot.
- **family-renumbered**. The plain series states the target's ordering and lists
  the same works in the same relative order under different numbers. "Ranger's
  Apprentice (published order)" follows Audible's numbering, while the primary
  follows the publisher's, where The Lost Stories is Book 11. It is always
  advisory: a `merge-series` with field `position`, which keeps the target's
  numbering and names every dropped number in the repair's notes. The repair pass
  honours it only when the field is set explicitly, and still refuses a loser
  membership the target does not list.
- **ordering-twin**. An orphan reading order (one stating an ordering with no
  primary of its own) is folded onto its one same-ordering twin of the same
  franchise, sharing an author and every membership at the same slot ("The Jack
  Ryan Universe (publication order)" onto "A Jack Ryan Novel (publication
  order)"). It is always advisory. A sub-series ("Rincewind" beside "Discworld")
  and a series a translation link touches are never either side.

### Narrators are evidence, never a statement

The narration-language profile (`check.NarrationProfile`) asks what language a
work's narrators record in across their recordings of **other** works. It needs at
least two, 80% in one language. Group, publisher and synthetic credits and the
shared catch-all person are not counted.

The profile can withhold a change and put a question in front of a human. The
audit's `narration-contradicts` subclass proposes `set-work-language` for a work
whose narrators contradict its stated language. That op is always advisory: a
language is only ever set by a reviewed decision, never inferred.

### A title is evidence too

The audit's `title-language` subclass proposes the same always-advisory
`set-work-language` from a work's own title. It reaches a mis-tag whose narrators
have recorded nothing else. It reads two signals:

- an own-language **edition statement** in the title or subtitle naming a
  language other than the tag ("The Gambler [Persian Edition]" tagged `en`), over
  every work;
- in a mixed-language series whose language is not English (the derived one, or
  on a tie the one language every other member states), an **`en`-tagged member
  whose title reads as that language**. That is a bracketed English gloss ("La
  Odisea [The Odyssey]"), or two of that language's function words and no English
  one ("Il Cuore Spezzato Di Arelium"). Other tags are not read this way, since a
  translation usually keeps its original's English title.

A title that names a language (a language course) proposes nothing. Narrator
evidence is named in the reason but never vetoes. A work that
`narration-contradicts` already proposes keeps that one finding, with the title
evidence in its notes. Either way the correction is applied only through an
`accept` in the reviewed-decision list below.

### When a retail recording is a LibriVox project's audio

Retailers resell LibriVox projects under their own imprint. *Metamorphosis* holds
`david-barnes-2016` (Paperless, 152 minutes) beside the LibriVox recording of
project 527, read by the same David Barnes in 154. The two stay two recordings:
the retail edition has its own ASINs, cover and publisher, and the project its own
links and per-section audio.

So the audit's `R-REPACKAGE` class proposes a **link** for a person to review
(`link-librivox-repackage`: the work as target, the retail recording as `from`,
the LibriVox recording as `to`), never a merge. It is advisory throughout. It
proposes a pair only inside one work, and only when all of these hold:

- **Same readers.** The retail recording's narrators are exactly the LibriVox
  recording's readers (person slugs, any order). A reader set that merely
  overlaps is a group project's volunteer, counted in `SUMMARY.md` and never
  proposed.
- **Same language.** The two recordings state one language.
- **Runtime or publisher.** Either both runtimes are stated and fit the window
  below, or a runtime is unstated and the retail recording's publisher carries at
  least three runtime-confirmed proposals across the catalogue.

The runtime window: the retail runtime is never longer than the project's beyond
rounding (2 minutes, or 1% of a long project), and at most a minute a LibriVox
section shorter, which covers the spoken preambles a repackage trims. A project of
few sections may be up to 5 minutes shorter, but never by more than a fifth of its
length (one minute at least, for rounding), so a one-minute track is never read as
a six-minute poem's audio. A stated runtime outside the window refuses the pair
whatever the publisher, because that is a narrator re-recording a book they read
for LibriVox.

Each proposal names the LibriVox project id and its evidence: the readers, both
runtimes and the window, the publisher and how many runtime-confirmed proposals it
carries. Over the 2026-11 tree it made 149 proposals from 158 same-reader pairs.

## Reviewed decisions are recorded, not re-made

When a maintainer reviews a proposal, the verdict goes into one checked-in list,
`internal/audit/reviewed.json`, rather than into a one-off worklist. Each entry
names the proposal by its own fields (op, target, series, field, from, to,
others), with a decision and a one-line reason. Retired slugs are read through the
tombstone table.

There is one exception to that reading. An accepted or asserted decision about one
work's own record (`drop-membership`, `move-membership`, `restate-position`,
`retitle-work`, `set-work-language` or `fill-field`) whose work was since retired
is **stale**. It is never moved onto the survivor, even when the survivor sits at
the very position, carries the very title or lacks the very field the decision
names. The work it named is gone, and the survivor is another record nobody
reviewed. A reviewed drop of a duplicate *Philosopher's Stone*, once the two were
merged, must not remove the real one. A merge, an added membership or an added
link still follows the tombstone, since a merge carries those facts over.

### `reject`

`reject` turns a mechanical proposal advisory, so a fresh audit never offers it to
the repair pass again. Examples are a link whose "original" is itself a
translation, or a split of a language-learning series.

### `accept`

`accept` turns an advisory proposal mechanical. It is the only way a
`set-work-language` correction or a held-back split is ever applied.

- An accept that would make two mechanical proposals contradict each other is
  refused at audit time.
- An accept of a proposal no repair carries out (a `review`, a `rename-candidate`
  or a `repoint-sidecar`) is refused outright, since it has nothing to apply.
- The one exception is the **record-only** op `link-librivox-repackage` (below).
  Its accept applies nothing and promotes nothing to mechanical, because the
  accept itself is the record of the link.

An accepted `retitle-work` is a reviewer's title for that record, exactly as an
asserted one is:

- it is refused beside a mechanical merge folding its work away. This holds even
  when the detector already proposed the retitle and the accept would change
  nothing; the detector's retitle then stays as it was;
- once accepted, it refuses a later merge that would fold its work.

A detector's retitle nobody reviewed may sit beside such a merge, since either
order leaves one catalogue.

### `assert`

`assert` **sources** a proposal no detector makes: an alternate title, a reissue,
a work stating no series, an omnibus or a dramatisation sitting in a series'
slots, or a correct retitle the title rules refuse. The entry's fields ARE the
proposal. Only five ops may be asserted:

| Op | Fields |
|---|---|
| `merge-works`, `merge-series` | a target and the others folding onto it, nothing else |
| `add-series-member` | the work as target, the series, and a canonical position as `to`; `field` may be omitted |
| `drop-membership` | the work as target, the series, and the canonical position it is listed at as `from`; `field` may be omitted and is read as `position`; no `to` and no `others` |
| `retitle-work` | the work as target, its title as recorded as `from` and the new title as `to`; `field` may be omitted and is read as `title` |

An assertion appears in the class whose detector makes that op (`W-DUP`,
`SER-DUP`, `W-NOSERIES`, `S-INTEGRITY` or `W-TITLE`) under the subclass
`asserted`, and the repair pass applies it like any other proposal.

A drop naming no home applies only as a reviewed assertion; any other is refused
as malformed. It judges no language. It checks only that the series still lists
the work at that position and keeps a member, and its note carries the review's
reason.

An assertion is a human's decision, so no detector veto is asked of it, only that
its records still exist. Its outcome in `SUMMARY.md` is one of:

- **asserted**: sourced and made mechanical.
- **redundant**: a detector already makes the same proposal, so the assertion acts
  as an accept, promoting it even where the detector held it back. It should be
  rewritten as one.
- **stale**: a record it names is gone, or it has been applied, so a re-run
  proposes nothing. Applied means every loser now resolves to the target, the
  series already lists an added work at that position or no longer lists a
  dropped one, or the work already carries a retitle's new title. A dropped or
  retitled work since merged into another is stale whatever the survivor holds
  (see above).
- **refused**, with the reason named, when:
  - it would contradict another mechanical proposal. A drop also contradicts any
    other mechanical change to the same membership, or a merge folding its work or
    its series. A retitle, as for an accepted one, contradicts a merge folding its
    work away or a second retitle of it;
  - a `reject` of the same proposal withholds it;
  - a retitle's work (one that still exists) now carries a title other than its
    `from`;
  - another work holds the position;
  - the work is listed in that series at another position (for a drop, a work
    that still exists);
  - a drop would leave the series with no members (retiring a series is a
    `merge-series`);
  - a loser was already retired onto a different survivor. An assertion never
    widens a merge to fold that survivor too.

### Matched against the fresh audit

The decisions are matched against the FRESH audit every run. An accept or reject
whose proposal no longer appears is listed as stale in `SUMMARY.md` and never
applied, so a reviewed decision can never resurrect a change the data no longer
supports.

### A rejected merge of two people

A `reject` of a merge also reaches beyond the audit:

- `metacheck`'s advisory census stops naming the pair it covers.
- The importer honours a `reject` of `merge-people`. This is how "two people, not
  one" is recorded for a courtesy-title pair such as Dr. Alex George and Alex
  George. The importer's honorific fold, which otherwise resolves a "Dr. X" credit
  onto the catalogued bare "X", never folds a pair a rejection names, in either
  direction. Neither does the credential fold ("X PhD" onto "X"). Both judge the
  records the two spellings land on (through the initials merge) as well as the
  slugs they spell, so an import cannot re-merge two people a maintainer
  separated.
- The series author rule and the intake form's duplicate-title, takeover and
  series checks read the pair as two authors too. So the doctor's book never joins
  the novelist's series, not even through a third spelling of both. Beside the two
  of them, "A. George" counts as a person of its own, so a series or a batch never
  groups the pair as one author by way of it.
- The audit's series checks read the pair as two authors as well.
- When an import decides a batch's initials spellings, a fold it refused
  beforehand stays refused, so the decision cannot undo the review.

Because the importer honours a `merge-people` rejection whatever is live, the
audit never calls one stale merely because one of its two records is missing
(deleted, not yet created, or a mistyped slug). It is reported **unresolved** and
listed in `SUMMARY.md`, so a typo still surfaces but triage does not prune a
decision that is still in force.

### A record-only link: `link-librivox-repackage`

A `link-librivox-repackage` decision is **record-only**. The entry in the list IS
the record of the link, and no repair pass ever applies it or writes `data/`. The
entry names the work (`target`, read through the tombstone table, since a merge
carries both recordings to the survivor), the retail recording (`from`) and the
LibriVox recording (`to`), and nothing else. It cannot be asserted. It stays in
force while the work holds both recordings, whether or not a fresh audit still
proposes the pair. One retail recording repackages one project, so its outcome in
`SUMMARY.md` is one of:

- **linked**: an `accept`, recording the link. It takes EVERY pair of that retail
  recording out of `R-REPACKAGE`, not only the accepted one.
- **suppressed**: a `reject`, recording "not this project's audio". It takes that
  pair out of `R-REPACKAGE`, so it is never asked again.
- **refused**, with the reason named: a `reject` of the same pair outranks the
  `accept`, or an earlier `accept` already records that retail recording as a
  repackage of another LibriVox recording.
- **stale**: a recording it names has left the work (or the two have swapped
  kinds).

## The expressive layer (CC BY-SA)

Two **per-work sidecars** carry the community-authored, spoiler-tagged content.
They are the `characters` and `recaps` members of a work's entry in the separate
`data/works-community/` family, keyed by the **work's** slug. They are
structurally separated from the core. Their `license` field accepts only
`CC-BY-SA-4.0` (`$defs/license_content`), and the family boundary makes the
licensing split visible in the directory tree. Authoring them is documented in
the repo's `AUTHORING.md` (see [contributing data](contributing-data.md)).

### characters - the `characters` member of a works-community entry

An array of character entries under a `work` slug. Each character has:

- `id`, unique **within the member**, not globally (two works may each have a
  `bilbo-baggins`);
- `name`, optional `aliases[]`, optional `role` (`protagonist` / `antagonist` /
  `supporting` / `minor`);
- `reveal`, a [position](#the-position-model) that is the spoiler gate. A consumer
  only shows the entry once the listener has passed it (the Kindle X-Ray model);
- optional `description`, own-words, length-capped at 1500 chars. A card without
  one has nothing to reveal;
- optional `xref` (`wikidata`, `goodreads`). A shared `wikidata` QID links a
  recurring character across a series' per-work entries.

Recurring characters are **re-described per book**, so what a reader sees stays
bounded by which book they are currently in.

### position_scale - the ruler those positions are on

`position_scale` is an optional member of the same works-community entry, for
example `{"length": 5, "unit": "act"}`. It states the book's whole length in the
units its positions count: `act`, `chapter`, `entry`, `episode`, `letter`, `part`,
`piece`, `poem`, `scene`, `section` or `track`. `"partial": true` says the
sidecars stop short of it on purpose.

A consumer uses it to place a position on a recording whose tracks are finer or
coarser than the book's units. `metacheck` measures the sidecars against it
instead of the recording's track count. It is a ruler, not an exemption, so
`metacheck` still reports one stopping far short. It also refuses a position past
the scale, and a scale with no characters or recaps beside it.

### recaps - the `recaps` member of the same works-community entry

Position-keyed "story so far" summaries under a `work` slug, plus two optional
whole-book summaries. Each recap entry has:

- `through`, a [position](#the-position-model). The recap is safe to show once the
  listener has finished that chapter. **No two recaps in a member share a
  `through` chapter.**
- optional `scope` (`book` / `series`). A `chapter: 0` + `series` entry is the
  "previously, in earlier books" recap;
- `text`, own-words, length-capped at 3000 chars.

The member also carries two optional whole-book fields for a reader who has
finished the book:

- `in_short`: the whole arc in one paragraph, ending included, cap 1500;
- `ending`: how the book closes, stated plainly, cap 2000. That is deliberately
  tighter than a chaptered recap entry, a crisp sequel-handoff.

## The position model

Spoiler positions use one shape everywhere (`common.schema.json` `$defs/position`):

```json
{ "chapter": 3 }
```

`chapter` is a non-negative integer: the **logical, edition-independent** work
chapter (1-based), where `0` means front matter or knowledge carried in from
earlier books in a series. A consumer maps its own recording-chapter timeline
onto these ordinals. AudioSilo's server answers them
[on the book's own chapters](../server/api/reference.md#positions-on-this-books-chapters)
when the book splits finer than a work's `position_scale`. Text-to-audio alignment
is a consumer concern, out of schema scope. The object shape is deliberately
extensible, so a later `paragraph` or `offset_ms` can be added without a breaking
change.

For a **play**, `chapter` is the **act**, never the scene (`0` = before the play
begins). A character entering in Act II, Scene 3 is revealed at `2`, a recap
stands only at an act boundary, and a play with no act divisions is a single act.
Acts are how most play recordings are tracked, and they are stable across
editions, where scene numbering is not. The authoring rule is in the community
repository's `AUTHORING.md`.

## Provenance on every entity

Every record carries a `sources[]` array (`$defs/sources`, at least one entry).
Each source is `{type, ref?, imported_at?}`:

- `type` is one of a fixed enum: `user`, `openaudible-import`, `libation-import`,
  `audiosilo-books-import`, `libex-import`, `librivox`, `store-listing`,
  `audible-lookup`, `openlibrary`, `wikidata`, `inventaire`, `community`;
- `imported_at` is `YYYY-MM-DD`;
- a `librivox` entry's `ref` is the LibriVox project id, and a `store-listing`
  entry's is the store page's URL.

Because every fact records where it came from, a whole source can be audited or
retracted.

The source types are also ranked into trust tiers (`pkg/model/trust.go`; the
policy is LICENSING.md's "Trust tiers and the user-overwrite rule"), applied at
record granularity:

| Tier | Source types | Authority |
|---|---|---|
| User library | `user` (issue forms and hand edits), `openaudible-import`, `libation-import`, `audiosilo-books-import` | may overwrite a record whose sources are bulk-mirror only |
| Reference | `audible-lookup`, `openlibrary`, `wikidata`, `inventaire`, `community`, anything unclassified | no overwrite authority; its presence also means a record is not mirror-only |
| Bulk mirror | `libex-import`, `librivox`, `store-listing` | overwritable by the user-library tier: a hand edit outranks any of them |

Why `librivox` may mirror a whole catalogue, and how its records are written, is
in [the LibriVox mirror](./contributing-data.md#librivox-the-public-domain-mirror).
`store-listing` is a maintainer's import of a store's public listings for books
they name, never a mirror. See
[store listings](./contributing-data.md#store-listings-audiobook-guild-and-graphicaudio).

## The compiled artifact and schema versioning

`metabuild` compiles the tree into a deterministic SQLite artifact
(`internal/build`). It inserts rows in sorted id order, so identical data always
produces an identical file. It stamps a `schema_version` into the artifact's
`meta` table, and the expressive layer was added in later versions:

| artifact `schema_version` | Adds |
|---|---|
| 1 | the factual core (works, recordings, people, series, FTS5 search index) |
| 2 | the `characters`, `character_aliases`, and `recaps` tables |
| 3 | the per-work `recap_summaries` table (the `in_short` / `ending` fields) |
| 4 | the `work_genres` set table |
| 5 | the `redirects` table (retired slugs and their survivors) |
| 6 | the `work_descriptions` table (the community spoiler-free description) |
| 7 | the languages layer: the `translations` table (every work and series `translation_of` link), the series table's derived `language`, `ordering` and `ordering_of` columns, and a `language` column on the search index |
| 8 | the LibriVox layer: the recordings' `librivox_id` (indexed), `archive_id`, `link_librivox` / `link_zip` / `link_rss` / `link_text`, `copyright_year` and `added_at` columns, the chapters' `audio_url`, the people's `librivox_reader_id`, `librivox_author_id`, `birth_year` and `death_year`, the `work_credits` table (a work's credited people by role, so the feed can tell a translator from an author), and the `recording_sources` table (`work_id, recording_id, type`, indexed by type) behind the API's `source` filter |
| 9 | the LibriVox recording layer: `recordings.librivox_title`, `chapters.section_number`, and the `recording_credits` (`work_id, recording_id, person_id, role, ord`), `chapter_readers` (`work_id, recording_id, chapter_idx, person_id, ord`) and `recording_librivox_genres` (`work_id, recording_id, genre, ord`) tables, which the LibriVox-shaped feed answers its title, section numbers, translators, section readers and genres from, and `recording_sources.added_at` (each recording's own, so `works/latest?source=` orders by the source's recordings straight off its index) |
| 10 | the `position_scales` table (the ruler a work's sidecars are numbered on) |
| 11 | the store links: `recordings.link_audiobookguild` and `recordings.link_graphicaudio` (one column per store, not a table), which the API returns in the recording's `links` and as purchase links |

`metaserve` returns characters, recaps, genres, the community description and the
translation links inline on `GET /works/{id}` (`characters` / `recaps` /
`recap_summary` / `genres` / `community_description` / `position_scale` /
`translation_of` / `translations`, all `omitempty`). It returns a series'
language, ordering and ordering family on `GET /series/{id}` (see
[the API](api.md#apiv1seriesidlimitoffset)). From version 8 it also serves the
LibriVox layer ([the API](api.md#the-librivox-layer)).

### Reading an older artifact

The serve queries **degrade gracefully** when a newer binary briefly serves an
older release. A missing table or column reads as "no data", never a 500:

| Query | No-ops below `schema_version` |
|---|---|
| characters and recaps | 2 |
| the recap summary | 3 |
| genres | 4 |
| redirects | 5 |
| the description | 6 |
| the languages layer | 7 |
| the LibriVox layer | 8 |
| the LibriVox recording layer | 9 |
| position scales | 10 |
| the store links | 11 |

An artifact that *claims* any version from 5 to 11 but lacks what that version
adds is refused when it is loaded, naming the claim, because the builder always
writes the two together. For 7 that is the `translations` table or any of the
series table's `language`, `ordering` and `ordering_of` columns; for 8, any of its
columns or the `work_credits` and `recording_sources` tables; for 9, any of its
columns or tables; for 10, the `position_scales` table; for 11, either store link
column.

The same versioning drives the [coverage endpoints](api.md#coverage-endpoints).
They omit a dimension's count, rather than report it as a misleading zero, when
the artifact predates its table.

### Reading a newer artifact

The opposite direction matters as much. Mirror-mode AudioSilo servers download the
newest data release once a day and read it with the `pkg/query` their own build
carries. So they routinely read an artifact **newer** than their code, which is
why schema changes must stay additive (the rule is in the
[cross-repo contract](../architecture/cross-repo-contract.md#13-community-metadata-a-three-repo-seam)).

`query.MaxSchemaVersion` is the newest version the code understands. A newer
artifact still opens, because every optional read is gated with `>=`, and the
server flags that its copy is newer than it understands. A new version bumps
`internal/build.SchemaVersion` and `query.MaxSchemaVersion` together, and a test
pins them equal. See [Public Go packages](overview.md#public-go-packages).
