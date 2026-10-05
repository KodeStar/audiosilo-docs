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

A slug can also be **retired**: when a repair wave merges two duplicate records,
the losing slug is tombstoned in `data/redirects.json` (one map per family)
rather than deleted, and `metaserve` resolves a request for it with a 301 to the
surviving slug. The bulk importers and the intake bot honor the same table when
*minting* records, so a later import can't recreate what a merge just retired: a
person's retired slug resolves to the person they were merged into, a series
name on a retired slug joins the surviving series, and a work candidate on a
retired slug is judged against its survivor by the same identity rules an
ordinary duplicate would be.

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
| `translation_of` | no | the work(s) this one is a **translation** of, as a set of work slugs (`$defs/slug_set`: at least one, unique, ascending). Almost always one; a translated omnibus names every original it collects. Stated evidence only, never inferred - see [translations and reading orders](#translations-and-reading-orders) |
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
optional `translation_of` (the series this one translates, a slug set like the
work's - a series-level claim, independent of any work-level pairing), optional
`ordering` (which reading order this series' positions state: `publication`,
`chronological` or `recommended`), optional `ordering_of` (set only on a
**variant** ordering: the slug of the franchise's primary series; the schema
requires `ordering` beside it), optional `xref` (`wikidata`, `goodreads`),
`license` (`CC0-1.0`), `sources`. A series states no language of its own - see
[translations and reading orders](#translations-and-reading-orders) for the one
it is given.

## Translations and reading orders

Two kinds of link tie records together across languages and across ways of
reading a franchise. Both are **stated evidence only**: nothing infers them, and
no record carries one until somebody states it.

**Translations.** A work's `translation_of` points from a translation to the
work(s) it translates - the direction is always translation to original. A
series can carry the same claim about another series. `metacheck` holds both
families to five rules:

1. every target is a **live** slug of the same family; a target that has been
   retired (a source in `redirects.json`) is refused with a message naming the
   survivor to point at instead;
2. a record never names **itself**;
3. the two sides are in **different languages**, compared by primary subtag
   (`en-GB` and `en` are one language). For two works this is a problem over
   their stated `language`. For two series it is judged on each series'
   **derived** language (below), is skipped when either side has none (a tie
   cannot be judged), and is only an **advisory**,
   `series-translation-same-language`: the link is still true when a member is
   misfiled in the wrong language, and a sync-bot addition that tips a series'
   majority must never turn a check it did not write red;
4. **no chains**: a target may not itself carry `translation_of` - the original
   is always one hop away;
5. the set is stored in **ascending** order, so one set has one byte-form
   (uniqueness is the schema's own rule).

**Where translation links come from.** Beside the correction form (see
[contributing data](contributing-data.md)), the maintainers' data-quality audit
proposes links from the one statement a record makes about its own language: a
retailer's own-language **edition decoration**, such as "(German Edition)" or
"[Spanish Edition]". Its `T-LINK` class has two subclasses, each applied by a
repair op named for the family it links:

- **series-edition** (`add-series-link`): a series named
  `<name> [<Language> Edition]` whose members are in that language is linked to
  the one other series called `<name>` that shares a member's author and is in
  another language;
- **work-edition** (`add-work-link`): a work whose title or subtitle states its
  own language's edition is linked to the one work in another language that is
  the same book by the project's own identity rule. A translator credit marks a work as a
  translation but never makes one an original, and is not enough on its own.

Exactly one original, or no proposal. A proposal is applied only when nothing
casts doubt on it (for a work, the translation's title must be the original's
title left untranslated); the rest are left for a human to review. Proposals are
applied by the repair pass as ordinary reviewed data pull requests, and every one
is held to the rules above before anything is written.

**Reading orders.** A franchise often has more than one order worth listening in
(publication, chronological, an author's recommended order). The **primary**
ordering is the series itself; a **variant** is a series of its own whose
`ordering_of` names the primary and whose `ordering` says which kind of order it
is. An author's preferred order and a recommended listening order both map to
`recommended`; the series name keeps the exact wording. `metacheck` refuses:

6. an `ordering_of` whose target is not a live series (a retired target names
   its survivor);
7. a series naming itself;
8. a **chain**: the target may not have an `ordering_of` of its own, so a family
   is always one hop deep;
9. two members of one **ordering family** (a primary and every series whose
   `ordering_of` names it) stating the **same** `ordering` - a second series in
   the same order is a duplicate to fold, not a view. The message names both
   series.

A variant that lists a work its primary does not is reported as the
**advisory** class `ordering-variant-not-subset`, never a failure: a
chronological list legitimately holds a prequel novella the publication list
never numbered. It and `series-translation-same-language` (rule 3) are the two
advisories; every other rule above is a problem that fails the check.

**A series' language is derived, not stated.** It is the primary subtag more of
its members state than any other - a strict plurality, so two English members
beside one French and one German make an English series though not over half - or
nothing when the leading languages tie or no member states one (`model.SeriesLanguage`, the one definition `metacheck`, the audit and
the artifact builder share). The compiled artifact writes it down for readers;
the data never does.

**When a series mixes languages.** A bulk import could join a same-named series
whatever its language, so a German edition's volumes sometimes sit in the English
series of that name (or the reverse). The maintainers' data-quality audit reports
every series whose members state two or more languages under its `L-MIX` class,
reading it against one **keeper** language: the series' derived language, or for a
tie the language its name's edition decoration states ("[German Edition]"), else
the half holding the member catalogued first. Each member in another language is
filed once, and three repair ops act on it:

- **already homed** (`drop-membership`): the work also sits in a series of its own
  language, so the membership here is dropped;
- **a target exists** (`move-membership`): exactly one other series in the work's
  language is this series under another name - the same name once an edition
  decoration is set aside, or a `translation_of` link either way - and its slot at
  the work's position is free, so the membership moves there at the same position;
- **no target** (`split-series`): the members in that language move to a **new**
  series of the same name, at the next free slug on the importer's own chain, with
  their positions kept; the keeper language keeps the original slug. A series in
  three languages yields one split per minority language.

A proposal is applied only when nothing casts doubt on it. It is left for a human
when the series is a tie decided by which half came first, when a member carries a
recording in the keeper language (that recording is relocated to a work in its
own language first), when a member's **narrators** record in another language
than the work states, when the series is part of a reading-order family, or when
another proposal in the same audit changes the same record. A split is also left
for review when the two halves share no author, when the members moving out are
themselves more than one author's series, when the half keeping the slug
states that it is a translation and the moving half does not, when the moving half
was catalogued first, or when the new series would carry an edition-decorated name
onto works of another language.

**Which half keeps the slug is never decided by a count alone.** A slug is public
(URLs, watchlists, the server's metadata seam), and the larger half is often the
translation: `zodiac-academy` once held 15 German books of a different franchise
beside the 14 English originals. So a majority keeper is **contested** - every
proposal for that series becomes advisory, the drops and moves included - when a
keeper-language member states it is a translation (a `translation_of` link, an
own-language edition decoration, a translator credit), when the halves share no
author (two series of one name), or when the series' principal author writes
mostly in a minority language across the catalogue (collective and classified
credits are not evidence of either). And since no signal sees every case, every
mixed series' split is also proposed in **every other orientation** (subclass
`other-keeper`, keyed `<series>/<language>/keep-<keeper>`), even beside a same-name
series in the moving language, so the reviewer can always accept the orientation
that is right - rejecting an uncontested majority split in the same list; accepting two orientations of one series, or a drop the
chosen orientation contradicts, is refused at audit time.

**When one book is catalogued twice.** Every duplicate check on works - the
audit's `W-DUP` class, `metacheck`'s advisory census, and the importer's and
intake bot's create guards - compares one normalized identity: the title with
retailer decoration removed, read with the authors and language. Decoration is
what a listing says about the product rather than the book: an `(Unabridged)`
marker, the series name at a title boundary, a marketplace edition (": International
Edition", "(International Edition)") and a narrator credit standing as a bracketed
group or the last segment ("(Narrated by Stephen Fry)", " - Gesprochen von Rufus
Beck", ", Read by Ray Ortlund"). The credit must look like a name, so "The Book
Thief: Narrated by Death" keeps its title. A leading brand possessive compares as
the plain name ("Tom Clancy's Oath of Office" meets "Tom Clancy Oath of Office")
but is never written into a proposed retitle. A stated edition in **another
language** is the opposite case: "The Gambler [Persian Edition]" is a translation,
not a duplicate, so the audit never folds it onto the English original even when
its language tag is wrong; the wrong tag is a `title-language` correction
(below).

Finding a series name in a title folds typography first, for every one of those
checks: a curly or other apostrophe glyph reads as the straight one, and a colon
in the series name also matches a spaced dash in the title (one way only - a dash
in the name never matches a title's colon). So "The Tournament at Gorlan:
Ranger’s Apprentice - The Early Years, Book 1" is read against the series
"Ranger's Apprentice: The Early Years" exactly as its straight twin would be.
`W-DUP` alone then groups works on two **extra keys** beside the identity, so the
census and the create guards are untouched by them:

- a **US/UK spelling** key over a closed word table (armour/armor, colour/color,
  grey/gray, travelling/traveling, whole words only), which meets the UK and US
  editions of one book;
- a **sub-series tail** key: a title "The Royal Ranger: The Missing Prince" whose
  head is the part after the colon of a series name the work's author holds
  ("Ranger's Apprentice: The Royal Ranger"), read against that tail.

Two works sitting in entirely different series are never merged, but two
spellings of one series holding both works at the same position count as one
series: the same name with the same decoration, or a decoration on one side only
that is a catalogue note from a closed list (an ordering, an own-language
edition, a dramatization, an abridgement either way, a full cast, a narration
credit). Two different decorations stay apart, so "Pimsleur Chinese (Cantonese)"
and "Pimsleur Chinese (Mandarin)" are two courses. A proposed retitle is also
refused when stripping the series name off the front leaves only a part of
something - a collection statement or a bare volume ("Charassi's Fae Queen: Six
Book World Boxset" would become "Six Book World Boxset") - or when it would keep
one end of a stated range ("Books 13 - 16" cut to "Books 13"); the intake bot then
keeps the title as submitted. The audit also withholds a retitle against a series
that is only this one book's own edition ("Let's Split Up (German Edition)",
holding just this work), which would otherwise leave the tagline as the title.

**When one series is spelled twice.** The audit's `SER-DUP` class groups series
whose names normalize to the same key ("Temeraire" and "Temeraire
(abridged)") and proposes a `merge-series` onto one survivor, the retired
slug tombstoned like any merge. A fold is withheld for a human whenever the
members disagree - no shared author, two languages, two reading orders of one
franchise, a collection beside the books it collects, or two lists that put
different works at one position. A parenthetical decoration is withheld too, since
it usually says something the plain name does not (an edition, an alternative
order, an author). Two decorations are the exception, and only on a series that
**moves nothing** - every membership already in the undecorated survivor at the
same position, so the fold retires a spelling and changes no order:

- an **ordering** qualifier ("(Published Order)") whose list IS the plain
  series' list, as many memberships and none different;
- an **abridged** format qualifier - "(abridged)" or "(gekürzt)" only - whose
  memberships the plain series already holds; a part of the list is enough,
  since abridgement is a recording's `abridged` fact and only some volumes are
  ever abridged. Every work the abridged series lists must also carry a
  recording stating `abridged: true` - otherwise the series name is the only
  record that an abridged production exists, and the fold would erase it. "Unabridged", dramatized, Hörspiel, radio and full-cast series
  are product lines of their own and are never folded this way.

After the fold, an import naming the retired "Women's Murder Club (abridged)"
resolves through the tombstone to the plain series, so it is not re-created.

A group holding two reading orders of one franchise, or a series and its
translation, is withheld as a whole - but the **plain** spellings inside it (no
reading-order or translation link of their own, no other ordering, no other
language) are still judged one by one against each member of the reading-order
family, one proposal per spelling. A fold here may only retire a spelling, never
add to a reading order:

- **family-spelling**: the plain series holds the very list one family member
  holds, slot for slot ("Chronicles of Narnia" beside "The Chronicles of Narnia
  (Author's Preferred Order)"). It folds onto that member - applied when the
  member is the primary, advisory (applied only through a reviewed `accept`) when
  it is a variant, since an import naming the plain name would then reach a
  variant through the tombstone alone.
  When the lists still differ because the works themselves are not yet merged, it
  is a review naming the closest member and the duplicate-work clusters holding
  each conflicting slot.
- **family-renumbered**: the plain series states the target's ordering and lists
  the same works in the same relative order under different numbers. "Ranger's
  Apprentice (published order)" follows Audible's numbering, while the primary
  follows the publisher's, where The Lost Stories is Book 11. Always advisory: a
  `merge-series` with field `position`, which keeps the target's numbering and
  names every dropped number in the repair's notes. The repair pass honours it only
  when the field is set explicitly, and still refuses a loser membership the
  target does not list.
- **ordering-twin**: an orphan reading order (one stating an ordering with no
  primary of its own) folded onto its one same-ordering twin of the same
  franchise, sharing an author and every membership at the same slot ("The Jack
  Ryan Universe (publication order)" onto "A Jack Ryan Novel (publication
  order)"). Always advisory; a sub-series ("Rincewind" beside "Discworld") and a
  series a translation link touches are never either side.

**Narrators are evidence, never a statement.** The narration-language profile
(`check.NarrationProfile`) asks what language a work's narrators record in across
their recordings of **other** works (at least two, 80% in one language; group,
publisher and synthetic credits and the shared catch-all person are not
counted). It can withhold a change and put a question in front of a human - the
audit's `narration-contradicts` subclass proposes `set-work-language` for a work
whose narrators contradict its stated language - but that op is always advisory:
a language is only ever set by a reviewed decision, never inferred.

**A title is evidence too.** The audit's `title-language` subclass proposes the same
always-advisory `set-work-language` from a work's own title, which reaches a
mis-tag whose narrators have recorded nothing else. It reads two signals:

- an own-language **edition statement** in the title or subtitle naming a language
  other than the tag ("The Gambler [Persian Edition]" tagged `en`), over every work;
- in a mixed-language series whose language is not English (the derived one, or on
  a tie the one language every other member states), an **`en`-tagged member whose
  title reads as that language**: a bracketed English gloss ("La Odisea [The
  Odyssey]"), or two of that language's function words and no English one ("Il
  Cuore Spezzato Di Arelium"). Other tags are not read this way, since a
  translation usually keeps its original's English title.

A title that names a language (a language course) proposes nothing. Narrator
evidence is named in the reason but never vetoes, and a work
`narration-contradicts` already proposes keeps that one finding, with the title
evidence in its notes. Either way the correction is applied only through an
`accept` in the reviewed-decision list below.

**Reviewed decisions are recorded, not re-made.** When a maintainer reviews a
proposal, the verdict goes into one checked-in list,
`internal/audit/reviewed.json`, rather than into a one-off worklist. Each entry
names the proposal by its own fields (op, target, series, field, from, to,
others; retired slugs are read through the tombstone table) with a decision and
a one-line reason:

- `reject` turns a mechanical proposal advisory, so a fresh audit never offers
  it to the repair pass again (a link whose "original" is itself a translation,
  a split of a language-learning series);
- `accept` turns an advisory proposal mechanical, which is the only way a
  `set-work-language` correction or a held-back split is ever applied. An accept
  that would make two mechanical proposals contradict each other is refused at
  audit time, and an accept of a proposal no repair carries out - a `review`, a
  `rename-candidate` or a `repoint-sidecar` - is refused outright, since it has
  nothing to apply;
- `assert` **sources** a proposal no detector makes - an alternate title, a
  reissue, a work stating no series, an omnibus or a dramatisation sitting in a
  series' slots. The entry's fields ARE the proposal, and only four ops may be
  asserted: `merge-works` and `merge-series` (a target and the others folding
  onto it, nothing else), `add-series-member` (the work as target, the series,
  and a canonical position as `to`; `field` may be omitted) and
  `drop-membership` (the work as target, the series, and the canonical position
  it is listed at as `from`; `field` may be omitted and is read as `position`;
  no `to` and no `others`). It appears in the class whose detector makes that op
  (`W-DUP`, `SER-DUP`, `W-NOSERIES` or `S-INTEGRITY`) under the subclass
  `asserted`, and the repair pass applies it like any other proposal. The
  repair reads a drop by its shape: one naming no home series (only an
  assertion does) judges no language and checks only that the series still
  lists the work at that position and keeps a member.

An assertion is a human's decision, so no detector veto is asked of it - only
that its records still exist. Its outcome in `SUMMARY.md` is one of:

- **asserted**: sourced and made mechanical;
- **redundant**: a detector already makes the same proposal, so the assertion
  acts as an accept - promoting it even where the detector held it back - and
  should be rewritten as one;
- **stale**: a record it names is gone, or it has been applied (every loser now
  resolves to the target, the series already lists an added work at that
  position, or no longer lists a dropped one), so a re-run proposes nothing;
- **refused**, with the reason named: it would contradict another mechanical
  proposal (a drop also contradicts any other mechanical change to the same
  membership, or a merge folding its work or its series), a `reject` of the same
  proposal withholds it, another work holds the position, the work is listed in
  that series at another position, a drop would leave the series with no members
  (retiring a series is a `merge-series`), or a loser was already retired onto a
  different survivor (an assertion never widens a merge to fold that survivor
  too).

The decisions are matched against the FRESH audit every run, so an accept or
reject whose proposal no longer appears is listed as stale in `SUMMARY.md` and
never applied - a reviewed decision can never resurrect a change the data no
longer supports.

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
| 5 | the `redirects` table (retired slugs and their survivors) |
| 6 | the `work_descriptions` table (the community spoiler-free description) |
| 7 | the languages layer: the `translations` table (every work and series `translation_of` link), the series table's derived `language`, `ordering` and `ordering_of` columns, and a `language` column on the search index |

`metaserve` returns characters, recaps, genres, the community description and
the translation links inline on `GET /works/{id}` (`characters` / `recaps` /
`recap_summary` / `genres` / `community_description` / `translation_of` /
`translations`, all `omitempty`), and a series' language, ordering and ordering
family on `GET /series/{id}` (see [the API](api.md#apiv1seriesidlimitoffset)).
The serve queries **degrade gracefully** when a newer binary briefly serves an
older release: the characters/recaps queries no-op below `schema_version` 2, the
recap summary below 3, genres below 4, redirects below 5, the description below 6
and the languages layer below 7, so a missing table reads as "no data", never a
500. An artifact that *claims* version 5, 6 or 7 but lacks what that version adds
(for 7: the `translations` table or any of the series table's `language`,
`ordering` and `ordering_of` columns) is refused when it is loaded, naming the
claim, because the builder always writes the two together. The same versioning
drives the [coverage endpoints](api.md#coverage-endpoints), which omit a
dimension's count rather than report it as a misleading zero when the artifact
predates its table.
