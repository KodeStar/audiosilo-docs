---
title: Contributing data to Meta
description: "How metadata enters audiosilo-meta: the GitHub issue forms (five in the core repository, two in audiosilo-meta-community) and the intake automation that turns them into validated bot pull requests, the advisory ai-verify layer, the OpenAudible/Libation importers, the LibriVox public-domain mirror and its work-matching rules, metascan, the in-browser site tools, and the authoring rules."
---

## The rules that govern everything

Two non-negotiable rules apply to every contribution, whichever path it takes.
They are enforced by tooling where possible and by review everywhere else (the
full policy is in the repo's `LICENSING.md` and `GOVERNANCE.md`):

- **Facts only, never fabricated.** Contributed data must be real and verifiable.
  If a fact can't be verified, the (optional) field is **omitted rather than
  guessed** - no publisher blurbs, no invented ASINs, no cover files (covers are
  URLs). Every record carries a `sources[]` provenance entry.
- **Own words, never copied.** Descriptions and the CC BY-SA characters/recaps
  are community-authored and length-capped for the reference-guide tier; verbatim
  or near-verbatim phrasing from a source is a separate publish-pipeline failure
  (see [the extraction docs](#authoring-the-expressive-layer)).

Because the GitHub repository is the database, **all writes go through GitHub** -
there are no server-side accounts. A contribution is either a direct pull request
editing `data/**`, or an issue form that the intake automation turns into one.

## The issue forms

`.github/ISSUE_TEMPLATE/*.yml` are structured forms (machine-parseable field ids)
so a non-programmer can contribute without touching JSON. Each carries a
`data:<kind>` routing label that the intake workflow branches on. The core
repository, `audiosilo-meta`, holds the five forms for the CC0 factual core:

| Form | Template | Routing label | For |
|---|---|---|---|
| Add a work (book) and its first recording | `add-work.yml` | `data:add-work` | a new book plus its first narration |
| Add a recording (narration) | `add-recording.yml` | `data:add-recording` | another narration of a work already in the database |
| Correct data | `correct-data.yml` | `data:correction` | a single-field fix to an existing record |
| Correct several fields (batch) | `correction-batch.yml` | `data:correction-batch` | up to 25 corrections to one book with one shared source, as a JSON list; usually filed by an AudioSilo Bridge ([below](#the-correction-batch-form)) |
| Import a library export | `import-library.yml` | `data:import` | an OpenAudible / Libation / Audiobookshelf / metascan export to bulk-import |

The CC BY-SA sidecars live in their own repository,
[`KodeStar/audiosilo-meta-community`](https://github.com/KodeStar/audiosilo-meta-community),
since the community-repo split, and so do their two forms
([choose one there](https://github.com/KodeStar/audiosilo-meta-community/issues/new/choose)):

| Form | Template | Routing label | For |
|---|---|---|---|
| Add characters (the cast) | `add-characters.yml` | `data:characters` | the per-work characters sidecar |
| Add recaps (story so far) | `add-recaps.yml` | `data:recaps` | the per-work recaps sidecar |

The core repository's issue chooser links there, and the spoiler-free
description member has no form at all - it arrives as a hand-authored pull
request on the community repository. Both repositories run the same `metaissue`
composer, each under its own tree profile (`--profile core` here), so a sidecar
label applied to an issue in the core repository is refused with a pointer to
the community repository's chooser rather than composed into the wrong tree.

## Intake automation: issue form to bot pull request

`.github/workflows/intake.yml` converts a submitted form into a validated bot
pull request. On a data-labelled issue it runs `metaissue`, which parses the
rendered form body into canonical records (or a single-field correction, or a
placed sidecar), **deduplicates against the existing catalogue**, and emits a
machine-readable verdict the workflow branches on:

| Verdict | Meaning | Workflow action |
|---|---|---|
| `ok` | valid new/changed records produced (including a mirror-seed takeover, below) | opens a PR on branch `intake/issue-<n>` |
| `duplicate` | everything already exists (requires at least one skip) | labels + comments, no PR |
| `needs-human` | ambiguous - e.g. an import that produced and deduped nothing, or a submission that disagrees with a mirror-seeded record | labels + comments for maintainer attention |
| `invalid` | the submission fails schema/validation | labels + comments with the errors |

The bot's pull-request body lists the files it changed as they stand in the
working tree after every step has run (including the libex fill, which can
rewrite packs `metaissue` never listed), capped at 50 with a count of the rest -
the pull request's own Files changed tab is the full list. Its **Notes**, and the
messages of a verdict comment, are bounded too: at most 50 lines and 40 KB (each
line at most 2 KB), then one "... and N more" line, since GitHub stops an issue
comment or pull-request body at 65,536 characters. The complete list is
`all_messages` in the `result.json` printed to the workflow run log. Because the
bound keeps the head, an import's run-level summary lines come first, then the
**conflict** lines (a row refused for contradicting a recorded runtime or release
date), then every other per-row warning.

Seven behaviors are worth knowing:

- **Mirror-seeded records are taken over by ASIN.** When an Add a work or Add a
  recording submission names, by ASIN, a recording that was seeded from a bulk
  mirror and that no user has attested (every `sources[]` entry is bulk-mirror
  tier: `libex-import` or `librivox`), the bot does not close it as a duplicate:
  it applies the submission over that record through `importer.AttestAt`, which runs it as a
  one-row user-library import over the store `metaissue` already opened and
  hands it to `attestExisting` - the hook a library import takes at its
  ASIN-dedup skip. The stated runtime, release date, publisher and cover replace
  the mirror's (a stated date never coarsens a recorded one), a stated recording
  ISBN is appended when no recording carries it yet, blank fields keep the
  mirror's values, genres are added to the work's set, and a `user` source
  citing the form's Sources field is appended - to the work too when it is also
  a mirror seed. The pull request carries a *modified* record, which the rebase
  sweep and `ai-verify` (through `cmd/metadiff`) handle like any other change,
  and a maintainer still approves it. Nothing is applied, and the verdict is
  `needs-human` naming why, when the submission disagrees with the seed (a
  runtime more than 10% apart, or a release date that is not the same date at
  another precision), when it describes a different book than the record its
  ASIN names (authors, narrators or language - a mistyped ASIN must not attest
  somebody else's record), when a submitted ISBN is recorded on a different
  recording, or when its ASINs name two different recordings. Every matched
  ASIN is classified before the verdict, so their order never changes it. A
  title that differs is only a note, and identity is never rewritten. Only an
  ASIN match takes a record over: a mirror-seeded record met by title, ISBN or
  narrator set is `needs-human`, and on the add forms the message names the
  record's mirror-only ASINs (adding the matching one to the issue turns it
  into a takeover). The rule itself is LICENSING.md's "Trust tiers and the
  user-overwrite rule" (in `audiosilo-meta`).
- **A taken title slug is judged by author.** On Add a work, a title whose slug
  another work already holds is a duplicate only when that work is by the
  submitting author, judged by the importer's same-person rule (so "J. Doe"
  meets "Jane Doe"). A clearly different author's book of the same title is a
  different book: it is composed at the author-suffixed slug the bulk importer
  would mint (`the-good-shepherd-c-s-forester` beside Kenneth E. Bailey's
  `the-good-shepherd`), whoever attested the existing record. An author close to
  the incumbent's - the same surname, or one edit apart - may be a misspelling,
  so that submission is `needs-human` rather than composed, as is one whose
  author-suffixed slug is held by yet another author's book.
- **Retailer decoration comes off a submitted title.** On Add a work, a title
  carrying decoration that is not part of a book's identity - an `(Unabridged)`
  marker, its series name at a title boundary, a marketplace edition such as
  ": International Edition", or a trailing narrator credit such as
  " - Read by Luke Daniels" - is composed under the cleaned title
  (`titlerule.StripDecoration`) and the verdict notes it. The cleaned title then
  meets the slug and identity gates, so "Hammered: International Edition" from
  the author of the catalogued "Hammered" is a `duplicate`, not a second record.
  The decoration is kept when the cleaned title is a work this submission is not
  a second record of (a stated volume, a collection), and a title that cleans to
  nothing that names a book, or to a fragment, is `needs-human`.
- **Envelope sniffing.** For an import, `metaissue` sniffs a self-identifying
  `audiosilo-books` envelope and routes it to that importer regardless of the
  form's export-type dropdown - the file is trusted over the form. If you are
  building a tool that produces such a file, the [Import file format](./import-format.md)
  page is the producer-facing spec.
- **A submission is admitted by its routing label, not by `opened`.** The
  workflow triggers on `labeled` (for a routing `data:*` label) and `edited`
  (for an issue carrying a `data:` label). An issue opened with its routing
  label fires that label's `labeled` event too, so admitting `opened` as well
  ran intake twice and posted every verdict twice. And the GitHub API silently
  drops labels on issues opened by non-collaborators (the sibling
  `audiosilo-sidecars` contributor tool creates intake issues over the API), so
  such an issue arrives label-less and is admitted when a maintainer applies the
  routing label later - a `labeled` event. (An issue filed through the AudioSilo
  App comes in by a third door, `workflow_call` from `route.yml`:
  [below](#issues-filed-through-the-audiosilo-app).) The job gate excludes the workflow's
  own outcome labels (`data:invalid` / `data:needs-human` / `data:duplicate`) so
  outcome-labeling can't re-fire intake. Each run posts its non-ok verdict as a
  comment, so an edit always gets an answer.
- **Corrections are judged against the schema first.** A correction naming a
  field that lives on the *other* record kind - `runtime_min` against a work
  URL, say, when a runtime belongs to one narration - is `invalid`, and the
  verdict points at the right record (it lists the work's recording references,
  or gives a recording's work page URL). A value outside the schema's closed
  vocabulary (a `license` other than `CC0-1.0`, a person `kind`, a genre) is
  `invalid` naming the allowed values; an allowed value is stored in the
  schema's own spelling (`Publisher` becomes `publisher`). A correction that
  restates the value the record already carries is a no-op `duplicate` that
  writes nothing.
- **Translation and reading-order links are correctable one at a time**, and
  judged by the same link rules `metacheck` runs (the
  [data model's](data-model.md#translations-and-reading-orders)) before anything
  is written. The verdict follows **where the fault lies**: a fault in what the
  submitter wrote is `invalid` naming the fix, while a conflict that lies in
  OTHER records - where either statement could be the wrong one - is
  `needs-human` for a maintainer to decide.
  - A work's `translation_of` is **additive**: the correction contributes ONE
    original, given as a work reference (a `/works/{slug}` page URL, the legacy
    `?id=` URL, a data path or a bare slug). A retired slug is followed through
    the tombstone table and composed under its survivor with a note; a
    reference that names nothing is `invalid` naming it. A target already listed
    is the no-op `duplicate`, and the set is re-sorted after the add. A link to
    the record itself, to a work in the same language, or to a work that is
    itself a translation (the verdict names ITS original to use instead) is
    `invalid`. When the record being corrected is already the original other
    records translate, or the target already names this record as its
    original, the correction would make a chain out of links somebody else
    stated, so it is `needs-human`.
  - A series' `translation_of` is the same, with a series reference (a series
    page URL or slug) and the two series' derived languages - the language test
    is skipped when either series has none. The form still refuses a
    same-language series link as `invalid`, though `metacheck` only reports one
    already in the tree as an advisory.
  - A series' `ordering` is a scalar from the enum (`publication`,
    `chronological`, `recommended`); a value another series of the same
    ordering family already states is `invalid` - two series in one order are
    a duplicate to report, not two views.
  - A series' `ordering_of` is a series reference naming the primary ordering.
    A series that states no `ordering` yet is `invalid` with "state this
    series' ordering first", because the schema requires the ordering beside
    the link. Naming itself, a target that is itself a variant (the verdict
    names that variant's primary to use instead), or a family that already
    holds a series in this series' order is `invalid`; a series that other
    variants already name as THEIR primary would stop being one, which is
    `needs-human`.
  - A work's `language` correction is judged by the translation rule too: a
    language that puts the work in the same language as a work it translates,
    or as a work translating it, is `needs-human`, since either the language or
    the link is wrong. A series it belongs to changing derived language is
    never a reason to refuse it - correcting a misfiled member's language is
    how a series-level language clash gets fixed.

:::note[Intake runs on `issues`, not fork code]
`intake.yml` triggers on the `issues` event, so there is **no fork code
execution**. The only untrusted input is the issue body and any attachment: it is
written to a file via an environment variable (never interpolated into a shell
command), parsed by `metaissue`, and never executed. Attachments are fetched
HTTPS-only from GitHub's user-attachment hosts with a size cap set per form: up
to 25 MiB for the import form's **Export file** (GitHub's own ceiling for a
non-image issue attachment), and 1 MiB for a characters or recaps sidecar. The
fetch deadline scales with the cap, so a sidecar fetch does not wait out an
export's timeout on a dead link. The security
posture is deliberate - see [gates and CI](../contributing/gates-and-ci.md) for
the workspace-wide CI rules.
:::

## The correction-batch form

`correction-batch.yml` (title prefix `[corrections] `, labels `data` and
`data:correction-batch`) carries several corrections to **one** book with one
shared evidence text. A Bridge files it for a server admin's edits
([`meta.correct`](../bridge/contributions.md#corrections-metacorrect)); by hand the
single-field form is easier. Its sections:

- **Record** - the book's page on meta.audiosilo.app, the record a change applies
  to when it names none.
- **Changes** - fenced JSON, version 1:

  ```json
  {"v": 1, "source": "audiosilo-server/2.5.0", "changes": [
    {"record": "https://meta.audiosilo.app/works/the-hobbit", "field": "title", "current": "The Hobit", "corrected": "The Hobbit"},
    {"record": "data/works/the-hobbit/recordings/andy-serkis-2020", "field": "release_date", "current": "2021", "corrected": "2020-09-17"}
  ]}
  ```

- **Evidence / source** (required, at most 2,000 characters) and the ticked CC0
  dedication.

`metaissue` (`internal/issueform`, `correctBatch`) checks **every** change before
applying any. The field vocabulary is closed, per record kind, and only three
fields are applied by the bot:

| Record | Applied by the bot | Packaged for a maintainer |
|---|---|---|
| work | `title` | `authors`, `series`, `series_index`, `more_series` |
| recording | `release_date`, `isbn` (added) | `narrators` |

A recording field addressed to the **work** isn't a mapping bug: the filer didn't
know the recording, so it goes to a maintainer, who finds it. One structurally
invalid change (an unknown field, a work field addressed to a recording, no record
or no corrected value, a value over 500 characters or holding a control character,
the same field of the same record stated twice (two different ISBNs are two
facts), a bidirectional embedding, override or isolate control, U+202A to U+202E
or U+2066 to U+2069, in a value; a zero-width joiner or non-joiner is allowed)
refuses the **whole** issue, naming every bad change: a batch is machine-written,
so one bad change makes its siblings suspect. So does a Changes block that can't
be read (not version 1, an unknown or repeated key, no changes or more than 25),
missing evidence, evidence over 2,000 characters or holding a bidirectional
control, or an unticked dedication. The valid changes are then decided one at a
time: a maintainer's field, a recording field addressed to the work, or a record
it can't resolve is `needs-human`; a bot-applied field runs through the single-field form's own path
(`applyCorrection`: applied, unchanged, needs-human or invalid). The verdict is:

- `ok` when at least one change applied: ONE pull request with the applied part,
  which closes the issue on merge when nothing is left for a maintainer, else
  **references** it without closing it ("Applies part of #N"), and once it is open
  the workflow comments the rest (`needs_human`) on the issue and labels it
  `data:needs-human`;
- `needs-human` when nothing applied and something needs a maintainer;
- `duplicate` when every change already matches the record;
- `invalid` when any change is invalid, including one only applying it could find
  (a malformed date), and then nothing is written.

## Issues filed through the AudioSilo App

A Bridge files its issues (characters and recaps on the community repository;
correction batches here) **under the server admin's own GitHub account**, through
the public **AudioSilo Contributions** GitHub App (id `5387686`, slug
`audiosilo-contributions`; see [Contributions](../bridge/contributions.md)) when it
files with its Accounts sign-in. With a token from its environment or `gh` it files
a plain issue, which this workflow leaves alone: its routing labels stick only for
an account with write access to the repository (their `labeled` event admits it),
else a maintainer routes it. An App-filed issue arrives **without labels** (GitHub drops the labels a non-collaborator sets,
and an issue form's labels never apply to an API-filed issue), so intake's
`labeled` door would never open. `.github/workflows/route.yml` (one copy in each
repository) routes it instead, on `issues: opened`:

1. It runs only for an App-filed issue (`performed_via_github_app.id > 0`) with no
   `data:` label, and compares the id with its `APP_ID` constant in the step. The
   id proves only which App's token filed the issue, which **anyone** can obtain
   (the App is public and its device flow needs no secret), so it is a routing
   hint, never trust: intake validates the body exactly as for a hand-filed form,
   and every pull request is still reviewed before it merges (by a maintainer or
   the maintainer's [steward](steward.md)).
2. The template comes from the **title prefix**, an allowlist: `[work] ` is
   `data:add-work` and `[corrections] ` `data:correction-batch` here;
   `[characters] ` and `[recaps] ` on the community repository. Any other prefix is
   left for a maintainer.
3. **Abuse bounds** hold the issue for a maintainer (label `intake:held` and a
   comment saying why) instead of routing it: a GitHub account younger than **30
   days** (`gh api users/<login>`'s `created_at`); **more than 25** open App-filed
   issues from that account here, this one included (**50** on the community
   repository; counted with the issues list endpoint filtered by creator); a
   numeric user id listed in `.github/intake-denylist` (one per line, `#`
   comments; read through the contents API, a missing file listing nobody); or any
   of these checks failing to read. A routing label the workflow couldn't apply
   holds the issue too, since nothing re-runs this workflow.
4. Under the bounds, it labels the issue `data` and the template's label with
   `GITHUB_TOKEN`, which starts **no** workflow (GitHub's recursion guard), and
   calls `intake.yml` as a **reusable workflow** in the same run
   (`workflow_call` with `issue_number` and `template`; the `INTAKE_PAT` secret
   passed on, so the bot's pull request still triggers CI). A called run is
   admitted only for the issue that started its caller, and routes on the
   `template` input.

A maintainer releases a held issue by applying its routing label by hand, which
intake's ordinary `labeled` trigger admits; blocking the account or setting
interaction limits are the stronger tools. The labels `data:correction-batch` and
`intake:held` must exist in the repository (a label the workflow can't apply holds
the issue). The untrusted title, body and login reach `run:` only through
environment variables and are only compared; nothing is checked out;
`permissions: {}` at the top with the least each job needs, and a timeout on the
route job (the called intake job keeps its own).

## Two validation layers on a pull request

Every pull request touching `data/**` is checked twice:

- **`check.yml` (mechanical, blocking).** Runs `go build`/`vet`/`test`,
  `metacheck` (schema, pack placement and caps, referential integrity,
  uniqueness, chapter/series rules, LibriVox id rules), and `metafmt --check`
  (canonical JSON + pack invariants) as parallel jobs, and its `check` job is
  the verdict over all of them. A red pull request never merges. It uses
  the plain `pull_request` trigger, so fork pull requests run with a read-only
  token and no secrets.
- **`ai-verify.yml` (advisory, never blocking).** An AI judgement layer on top of
  the mechanical check: it posts a `PASS` / `FLAG` comment and label but **never
  blocks a merge**. It also uses the plain `pull_request` trigger by design (not
  `pull_request_target`, which is forbidden here as the "pwn request" pattern), so
  a fork pull request gets a neutral skip notice until a maintainer pushes its
  branch to the repo or re-runs it - fork secrets are never reached. The diff is
  passed to the model as untrusted data and never executed. When a rebase leaves
  what it judged unchanged, the last verdict is re-applied without a model call
  (each verdict comment carries a hidden key for this); a manual dispatch or a
  re-run always judges afresh.

The one place that verdict is *not* advisory is the
[series-completion bot](./sync-bot.md): its bounded, `data/`-only batch imports
merge themselves once the required checks pass and `ai-verified` is applied, and
every other batch import - opened by a person or composed from the "Import a
library" form - still needs a maintainer's approval however green it is.

## Bulk importers: metaimport

`metaimport` ingests an external library export into `data/` as reviewable
records, for contributors who already have a library manager's export (LibriVox's
public-domain catalogue has its own two-step path, described
[below](#librivox-the-public-domain-mirror)):

```sh
go run ./cmd/metaimport openaudible <books.json>  [--dry-run] [--date YYYY-MM-DD]
go run ./cmd/metaimport libation    <export.json> [--dry-run] [--date YYYY-MM-DD]
```

It imports **factual fields only** (dropping publisher copy, genres, ratings, and
personal state), maps one export entry to a work + recording (+ people + series),
and **deduplicates by ASIN** against the catalogue. `--dry-run` prints the plan
without writing; a real run writes the files, then validates the whole tree and
exits non-zero if that fails. The identity rules are careful: a person slug is the
identity (name variants merge, no numbered duplicates), a work is (title slug +
author set) with per-volume disambiguation so distinct series volumes never merge,
a trailing `(Unabridged)`/`(Abridged)` marker is stripped before identity (and
seeds the recording's tri-state `abridged` when the source didn't state it), and a
same-work/same-narrator entry whose only new fact is another ASIN **merges that
ASIN into the existing recording** (guarded by runtime and abridged checks) rather
than minting a sibling. A marketplace edition or a trailing narrator credit is
stripped before identity too, so "The Search: International Edition" or "The
Search, Read by Dee Reader" from the author of a catalogued "The Search" resolves
to that work and lands as a recording of it (or merges its ASIN into the same
production). A work catalogued only under a qualified title stays reachable as a
merge target, never created there; several such works decide nothing. Before a
row creates a work, its normalized identity (see
[the data model](./data-model.md#translations-and-reading-orders)) is also checked
against the catalogue and the run so far, and a match is skipped as
`identity-duplicate` rather than minted beside it. A series claim joins a same-named catalogued series only
when its authors and its language fit that series (see
[the import format](./import-format.md)); otherwise the row founds its own series
of that name at the next slug. A row whose person, series, or work identity resolves to a
slug a repair merge has since **retired** is judged against the surviving record
instead of minting a new one at the old address - the same `data/redirects.json`
table `metaserve` uses to 301 a retired id (see [the data model](./data-model.md#slug-is-identity-the-file-is-only-storage)).

### Libex modes and recording relocation

The `libex` source reads factual JSON or NDJSON rows, with five mutually
exclusive planning modes:

| Mode | Effect |
|---|---|
| Default | Creates works and recordings from a selected row set. |
| `--enrich` | Fills absent facts on ASIN-matched records. |
| `--recordings-only` | Adds alternate narrations to existing works; creates no work or series. |
| `--relocate` | Moves a cross-language recording to the work its source rows resolve to in its stated language, creating that work when needed. |
| `--regenerate-genres` | Re-derives catalogued works' `genres` from their own recordings' rows; touches no other field and creates nothing. |

For relocation, export rows for **all ASINs of the cross-language recordings**
in one batch. The metadata repository's `scripts/README.md` documents deriving
the list from the pack tree and running `scripts/libex-relocate-rows.sql` against
the libex dump. The query retains every copy so contradictory source evidence
cannot disappear behind an export filter.

```sh
go run ./cmd/metaimport libex /tmp/xrec-rows.ndjson --relocate \
  --data /tmp/review-data --dry-run --skipped /tmp/relocate-skipped.ndjson
```

Every supplied row naming the recording must agree on its language, and that
language must match the recording. The old work must be in another primary
language and retain an own-language recording. Narrators' recordings of other
works can veto the move through the shared narration-language profile; thin or
mixed evidence does not veto, and no language is inferred. Work resolution uses
the ordinary create path's slug chain, identity guard, credit cleaning and genre
mapping. Conflicting destinations are refused for review.

The recording moves as raw fields, preserving chapters, cover, `added_at`,
identifiers and sources, with the run's provenance appended. A colliding id is
numbered. A same-narrator sibling with compatible runtime and abridgement instead
absorbs its identifiers and sources; notes name each discarded field and value.
Series claims always use `--existing-series-only` semantics. When the old work
holds a claimed slot of a catalogued series deriving the recording's language,
that membership is re-pointed to the destination. Other old-work fields and
memberships stay as they were. No translation link is written.

Review the three disjoint recording counts (`relocated-to-existing`,
`relocated-to-new-work`, `merged-into-sibling`), memberships re-pointed, notes and
refusals before repeating without `--dry-run`. New-work counts include recordings
joining a work minted earlier in the run. `--skipped` writes one atomic NDJSON
`{"asin","reason"}` line per refused input copy; unlike create mode, those ASINs
are already catalogued. Refusal counts in the summary count recordings. New
stable codes start with `relocate-`: `rows-language`, `recording-language`,
`work-language`, `no-home-recording`, `narration-contradicts`,
`destination-conflict`, and `row-unusable`. Existing create admission and
`identity-duplicate` codes also apply.

Relocation cannot be combined with `--enrich`, `--recordings-only`, or the
create-only `--attach-editions`. A repeated run moves nothing already relocated
and repeats unresolved refusals. A real run validates the whole written tree.

### Genres: the format rule, the recording vote and regeneration

A libex row states every Audible category the book is filed under, and the
importer maps each one onto the project's genre vocabulary
(`internal/importer/audiblegenres.json`). Two rules decide what a work keeps.

- **Format categories.** Audible's "Audio Performances & Dramatizations" (with
  its Dramatizations and Storytelling children) and the "Radio" and "Film & TV"
  leaves under "Entertainment & Performing Arts", in every marketplace, say how a
  book was produced rather than what it is about. They are listed in the table's
  `format` key (`format_tree`, derived by `scripts/genrepaths`, gives their
  ancestors). Within one row, a format category - or an Arts & Entertainment
  ancestor the row reaches only through one - contributes its genre only when
  nothing else in the row maps: a full-cast radio dramatization of a mystery is a
  mystery, a radio panel show stays `arts-entertainment`, and a row that also
  states Arts & Entertainment > Art keeps `arts-entertainment` through Art.
  "Radio" and "Film & TV" are a format only beside a FICTION genre (the table's
  `genre_kinds` classifies every genre as fiction, nonfiction or neither): the
  same leaves file books about film, television and radio, which keep
  `arts-entertainment`, and a comedy panel show (`comedy-humor` is not fiction)
  keeps it too. The dramatizations subtree is a format beside anything. The
  site's `/add` prefill applies the same rule over the same table.
- **The recording vote.** A work with several recordings from different
  publishers is tagged by each of them, so a union of every row collects each
  publisher's mistakes. A mirror-derived set is instead the vote over the work's
  recordings (`importer.VoteGenres`): each recording is one vote (its regional
  ASINs together), a recording whose rows map nothing does not vote, and with
  three or more voters a genre is kept when at least two state it - with fewer,
  every voter's genres are kept. A work a libex create run makes gets this set,
  and so does a genre-less work `--enrich` fills (over the recordings its rows
  matched); user-library imports keep adding their genres and never remove one.

`--regenerate-genres` applies both rules to works already in the catalogue,
which no other mode does: every other writer only adds to a recorded set, and
`--enrich` fills only a work with none. Feed it the rows of **every** catalogued ASIN (the
metadata repository's `scripts/README.md` shows the export). For each work a row
reaches it computes the vote, then:

- a work with no user-library source (`openaudible-import`, `libation-import`,
  `audiosilo-books-import`, `user`) on it or on any of its recordings, whose
  every ASIN-carrying recording met a row
  takes the vote as its set - unless the vote states no genre, which leaves the
  work as it is;
- any other work only gains what the vote adds.

It touches no field but `genres`, creates nothing and appends no source (the
genres are derived from rows the work already cites), so a second run over the
same rows is a no-op. A row that contradicts its recording's recorded runtime
casts no vote - the runtime is what catches an ASIN attached to the wrong
recording, the same test enrichment and the ASIN merge use, while a release date
may legitimately differ for a regional re-release - and a recording whose rows
were all contradicted does not count as covered. Flags that would do nothing in
this mode (`--date`, `--conflicts`, `--existing-series-only`, the series lookup,
`--skipped`) are refused.

The regeneration never judges a record with evidence older than the record.
`--rows-as-of YYYY-MM-DD` is required: set it to the dump's snapshot date (a date
after the day of the run is refused, since it would hold nothing back). A
work whose newest provenance - its `added_at`, every recording's, and every
`sources[].imported_at` on it and its recordings - falls on a later day is left
as it is, counted and named in a note. Those dates record when something was
imported, not how old its evidence was, so a later day is safe only if every
import up to it used rows no newer than the export. `--genre-changes <path>` writes one NDJSON line per
changed work, `{"work","removed","added","mode"}` with `mode` `trim` or
`add-only`, for review before the data pull request:

```sh
go run ./cmd/metaimport libex /tmp/all-rows.ndjson --regenerate-genres \
  --rows-as-of 2026-07-29 --dry-run --genre-changes /tmp/genre-changes.ndjson
```

The summary line counts the works set to the vote, added to, unchanged and
reached by no row, and the genre instances added and removed; notes count the
contradicted rows and the works held back as newer than the rows.

### LibriVox: the public-domain mirror

`metaimport librivox` mirrors [LibriVox](https://librivox.org)'s catalogue, every
language, under the `librivox` source type. It is the **one named exception** to
the rule that the catalogue is never an unbounded mirror (LICENSING.md's "The
public-domain exception: LibriVox", in `audiosilo-meta`): LibriVox volunteers
release every recording into the public domain, the texts they read are public
domain too, and what the importer takes is the factual record of each project.
The exception names LibriVox only; another catalogue would need its own case
argued in LICENSING.md before any tooling points at it.

**Facts only.** A LibriVox record carries the title, the authors, the readers
(as narrators), the translators (as `translator` credits), the language, the
runtime, the sections (as chapters, each with its `audio_url`), the genres mapped
onto the vocabulary where one fits, the LibriVox ids, the archive.org identifier,
the `links` (catalogue page, zip, RSS feed and the source text's URL), the
`copyright_year` LibriVox states for the text, the authors' and translators'
birth and death years where LibriVox states them as years, the cover URL
(`https://` only) and `LibriVox` as the publisher of record. It **never** carries
the project `description`: LibriVox's descriptions are often quoted from Wikipedia, so they are neither the project's to relicense
nor CC0. Audio and cover art stay
on archive.org; the records hold URLs. In the trust tiers `librivox` is a
bulk-mirror source beside `libex-import`, so a user hand edit outranks it (see
[provenance](./data-model.md#provenance-on-every-entity)).

It runs in two steps, and only the first calls LibriVox:

```sh
# 1) Fetch a local snapshot of LibriVox's audiobooks feed (resumable).
go run ./cmd/metaimport librivox fetch --out ~/librivox-snapshot [--max-pages N]

# 2) Import a tranche of it by project-id range, offline; --dry-run first.
go run ./cmd/metaimport librivox import --from ~/librivox-snapshot --ids 1-2000 --dry-run
```

**`fetch` is polite by design**, because LibriVox's volunteer-run API caps its
clients and asks them to slow down:

- 100 projects a page (`limit=100`, with `extended=1` and `coverart=1` for the
  sections, genres, translators, archive.org link and cover);
- at least 5 seconds between the start of any two requests, retries included;
- a User-Agent naming meta.audiosilo.app and a contact address;
- on `429`, a `5xx` or a network error it backs off, honouring `Retry-After`
  (seconds or an HTTP date, never less than the 5-second spacing) and otherwise
  waiting exponentially from 30 seconds up to 10 minutes, for at most six retries
  (seven requests for one page) before the run stops, resumably. Any other error
  status stops the run at once.

The snapshot is a directory that is **never committed**: `manifest.json` (the
fetch's resume state: feed, query, limit, next offset, page and project counts,
and whether the catalogue is complete) and `pages/offset-NNNNNNN.json`, each one
feed response body verbatim. Every page is written atomically before the manifest
records it, so rerunning the same command after an interrupt resumes at the
first page the last run had not finished, and a snapshot fetched with other query
parameters is refused rather than mixed in. Pages are offset windows over the
feed's ascending project-id order, so a project catalogued during a long fetch
lands at the end instead of shifting a window already read. The catalogue ends
at a short page or the feed's "no results" answer; a snapshot already complete
makes no request, so a fresh reading goes into a new directory. `--max-pages N`
stops after `N` pages (`0`, the default, runs to the end).

**`import` lands a tranche.** `--from` names the snapshot (the importer reads
every `pages/*.json` and nothing else, so a hand-assembled snapshot works too)
and `--ids` is required: one project id (`527`), a range (`1-2000`), an open
range (`5000-`) or a comma-separated union of them. The other flags are the
usual ones: `--data`, `--dry-run`, `--date YYYY-MM-DD` (the `imported_at` stamp,
today in UTC by default) and `--conflicts <path>` (one NDJSON row per refused
contradiction). A real run writes the packs, then validates the whole tree. For
each selected project:

- **Dedup is on `librivox_id`**, never the title: a project whose id is already
  catalogued is skipped, so a rerun of a range never imports a project twice.
- Otherwise it becomes a **new recording**, never merged into another one (two
  LibriVox projects of one text are two productions). Its work is found by the
  [matching rules](#which-work-a-librivox-project-joins) below.
- Sections become chapters: `start_ms` is cumulative from each section's
  playtime and the section's archive.org file is the chapter's `audio_url`. One
  section without a playtime leaves the timeline unknowable past it, so the whole
  chapter list is omitted.
- **People are keyed by LibriVox id.** A `librivox_reader_id` or
  `librivox_author_id` the catalogue already holds resolves to that person
  whatever the feed now calls them, and for every project that landed, its
  readers' and authors' LibriVox ids are stamped onto the people they resolved to
  (a translator's id is a LibriVox author id; on an attach, only the people the
  work names, below). A person already carrying a different id in that
  namespace keeps it, and an id already on another person is not recorded twice;
  the run warns about both. That is the case for an author who is two LibriVox
  ids but one person here; a reader reaches it only when the split below cannot
  apply. A reader whose name slugs to nothing lands on the catch-all person,
  which is never given an id (an author or translator of that kind is credited
  nowhere: [Names that slug to nothing](#which-work-a-librivox-project-joins)).
  An author's or translator's `dob` / `dod` become the person's `birth_year` /
  `death_year` as the run records that person's LibriVox author id, only when
  LibriVox states a plain year (`1883`, `-428`, `428 BC`), and only when the
  person states neither yet: a year another source or a hand edit wrote is never
  overwritten, and a pair whose death precedes its birth is dropped whole.
- **A reader id is a person of its own, even when the name is not.** LibriVox
  readers are accounts, and several share a display name ("Martina", "eva",
  "Lisa"). When a reader's name slugs to a person who already carries (or
  earlier in the run took) a **different** reader id, the reader gets a person
  of their own at `<name slug>-librivox-<reader id>` (`martina-librivox-634`,
  the [person id rule](data-model.md#person---an-entry-in-the-datapeople-family)),
  created with that id, and the first holder of the name keeps the plain slug. A
  later project by the same reader finds that person by id, so no reader is ever
  minted twice. A person at the plain slug who carries no reader id (a narrator
  another source catalogued) is not another reader: the first LibriVox reader of
  that name is stamped onto them. Collective credits ("Various", "Full Cast") and
  the synthetic voice stand for no one person and are never split: a second
  reader id of one is the keep-and-warn case above. The run never writes over an
  existing or retired person id that the composed id happens to match: it
  credits the plain slug instead, whose holder keeps their own reader id, and
  warns. Authors are never split this way: a work's identity rides on its author
  slugs. The `librivox:` summary line counts the readers split.
- **A rerun splits readers on recordings it skips.** When a held recording
  credits a reader to a person carrying another reader id of the same name, or
  to anyone other than the person the catalogue already holds that reader's id
  on, the rerun still skips the project but moves that narrator credit onto the
  reader's own person (creating it when needed, and keeping the other reader's
  credit when both read the project). The summary line counts the credits moved;
  a second rerun changes nothing.
- **An attach records the recording, not new credits.** A project that joins a
  work already in the catalogue adds its recording (and its readers) only: a
  create run never edits a catalogued work's credits. So only the authors and
  translators that work already names (in its authors or its `credits`) are
  stamped; no person record is created for anyone else, since it would be
  credited nowhere. A work created earlier in the same run still takes the
  project's translators. The import report lists every credit left out
  ([credits not recorded](#credits-not-recorded)).
- `copyright_year` is written only when LibriVox states a year (its `0` means
  unstated); `url_text_source` becomes `links.text` when it is `https://`.
- Genres map onto the vocabulary only where a counterpart is evident, a
  sub-genre included when its own name has one: a poetry form ("Sonnets") to
  `poetry`, a Bible translation ("King James Version") to
  `religion-spirituality`, a science branch ("Chemistry") to `science`. Left
  unmapped, and named in the run's `unmapped genre strings:` warning, are period
  tags ("Published before 1800", "Medieval"), umbrella and form tags ("General
  Fiction", "Short works") and genres whose nearest entry would be a guess
  ("Nautical & Marine Fiction"). The table is `librivoxGenres` in
  `pkg/model/librivox.go`.
- **Reported skips, never guesses.** A language name with no known code is a
  `language` refusal (never mapped to `und` or a neighbour); teaching the
  importer the language is what lets a re-import of that id range take it. A
  project with no reader or no author is refused like any other source's row. A
  work match the rules cannot settle goes to the [worklist](#the-worklist).

#### Which work a LibriVox project joins

`routeLibrivox` (`internal/importer/librivoxmatch.go`, the author rules in
`librivoxauthors.go`) decides the work, in order, after LibriVox's trailing
"(version 2)" title marker is stripped and any credit whose name slugs to
nothing is dropped (Names that slug to nothing, below):

1. **The ordinary identity walk**: same title, same identity authors, same
   language.
2. **Spelling variants.** Otherwise, the **one** work by the same authors, in a
   compatible language, whose title differs only by a leading article,
   punctuation, case or accents ("The Metamorphosis" joins "Metamorphosis" by
   Franz Kafka). The articles set aside are the English the/a/an, French
   le/la/les/l', German der/die/das, Spanish el/los/las, Italian il/lo and Dutch
   de/het/een, in any language. Numbers stay apart ("Vol. 1, 2" is not
   "Vol. 12"). Two or more such works is the worklist's `several-works`, even
   when one of them matches the credits exactly.
3. **An author spelled with more or fewer words.** Otherwise, when a work
   under the project's title (rule 2's spelling) is by an author the project
   spells differently, the two names are compared word by word, case, accents
   and punctuation folded and a trailing Jr., Sr. or II-IV set aside. The
   **same surname** with one name's words a **subset** of the other's
   ("Henrietta Elizabeth Marshall" and "Henrietta Marshall", "Joseph Sheridan
   Le Fanu" and "Sheridan Le Fanu") is the same author, provided both names
   carry the same generational suffix or neither does. The project
   **attaches** to that work and credits the catalogued person, whose spelling
   the work keeps (a
   [person record](data-model.md#person---an-entry-in-the-datapeople-family)
   has no alias field, so LibriVox's spelling appears only in the run's note).
   The work must be in a compatible language, and its authors and the
   project's must pair one to one, each exactly or this way (the work credits
   no other author; a collective such as "Anonymous" pairs only with itself).
   Nothing else under the title may resemble them.

   **When LibriVox's spelling is already a person.** If the project's spelling
   is itself a person record (catalogued, keyed by the LibriVox author id the
   project states, or created earlier in the run), the credit is not moved: the
   project still attaches, but the credit stays with that record and its id,
   listed under [credits not recorded](#credits-not-recorded) for the work it
   joined. Two records of one surname are a person merge for a maintainer, not
   something an import decides.

   **The worklist instead.** Anything looser is the worklist's
   `author-spelling`, never an attach: an initial ("E. Nesbit" and "Edith
   Nesbit"), another given name ("Fanny" and "Frances Burney", "Lev" and "Leo
   Tolstoy"), a one-word name ("Homer"), "Saint" against "St", Jr. against
   Sr., or a suffix on one name only ("Francis Parkman, Jr." and "Francis
   Parkman", "Henry James" and "Henry James Sr.": possibly father and son), or
   a catalogued person no credit can name (a reader record at
   `<name slug>-librivox-<reader id>`). So is a work whose author already
   carries a **different** LibriVox author id from the project's (LibriVox
   keeps the two as two people), and a variant beside any other candidate;
   two variants are `several-works`. A different surname is a different author
   (rule 5).

   **Once per author id.** When the variant is a catalogued person on a
   catalogued work, the project's author id is decided once for the whole run,
   before any project is planned, provided no person carries that id yet,
   LibriVox's spelling is not a person record, the catalogued person carries no
   LibriVox author id, and every project proposing the id names the same
   person. Then every project of that id credits the catalogued person (who is
   keyed by the id), so the author's other books do not mint a second record.
   Otherwise each project is decided on its own. A work created earlier in the
   run is matched like a catalogued one, and an author id an earlier project of
   the run took counts as carried, so two spellings land the same way whether
   they arrive in one run or two.
4. **A trailing qualifier waits for a person.** Otherwise the title's trailing
   `(...)` or `[...]` qualifiers are dropped one at a time from the end. If what
   remains matches a work by the same authors under rule 2 ("Frankenstein
   (1818)" beside "Frankenstein", "Black Beauty (The Autobiography of a Horse)"
   beside "Black Beauty"), the project goes to the worklist as
   `differently-spelled-title`, or `several-works` when more than one work
   matches. It is **never attached**: the qualifier may be an edition or a
   subtitle, but just as well a volume ("King in Yellow (part 1)"), which
   only a person can tell apart. Only a work whose authors fully agree holds
   the project back: one whose authors only partly agree is passed over here,
   leaving the project to rule 5. A "Part N" outside brackets ("Anna Karenina,
   Book 1") is not a qualifier, and a mostly non-Latin title (below) skips
   this rule.
5. **Otherwise a new work.** A same-titled work by an entirely **different**
   author is a different book (think of every "Poems"), so the project gets a
   work of its own rather than a skip. A work under the project's own title
   (rule 2's spelling) whose authors only **partly** agree with the project's
   is `author-unmatched`, decided before rule 4 is tried.

**Names that slug to nothing.** An author or translator whose name has no letter
the slug rule keeps (a Cyrillic "Йордан Йовков") would land on the one catch-all
person record every such name shares. It is credited nowhere instead: the credit
is dropped before the work is decided and listed under
[credits not recorded](#credits-not-recorded) as `unsluggable` once the
project lands. If the project also credits another author ("Yordan Yovkov"), its
work is decided on that author alone.
If no individual author is left (the name was its only author, or only a
translator or a collective such as "Anonymous" remains), the project is the
worklist's `author-unsluggable`, since a work by "Anonymous" alone would merge
two authors' same-titled books.

**Mostly non-Latin titles.** A title that slugs to nothing, or in which more than
half of the letters are not Latin script (digits, punctuation and spaces are not
counted, and the leading article is dropped first), never walks a slug chain:
that would file it under the shared "untitled" fallback, or under its Latin or
number fragment ("Сборник стихов 001" as "001"). It is matched by rules 2 and 3
alone, on a key that keeps its own letters (so a second project of the same
title by the same author attaches, and "The Война и мир" meets "Война и мир"),
and otherwise its new work is created at **`librivox-<project id>`**, titled as
LibriVox writes it. Such a slug never merges two works; when it is already
taken the project is the worklist's `fallback-slug-taken`. A title exactly
half Latin ("Anna Karenina (Анна Каренина)") stays on the slug rule. A rerun is
idempotent: the project id is already catalogued, so it writes nothing beyond
the [reader split](#librivox-the-public-domain-mirror) on recordings it skips.

#### The worklist

A match the rules cannot settle is **never guessed**: the project is skipped and
listed in the import report's worklist (printed by `metaimport librivox import`),
one line per project with its id, title, authors, a reason code and the
catalogued works involved:

```
librivox worklist: 2 projects skipped for a person to resolve (re-import the ids once settled):
  99502 "The Metamorphosis" by Franz Kafka [several-works]: metamorphosis "Metamorphosis"; metamorphosis-2 "Metamorphosis"
  99503 "Metamorphosis: A Novella" by Franz Kafka [differently-spelled-title]: metamorphosis "Metamorphosis"
```

| Reason | Why the project waits |
|---|---|
| `several-works` | two or more catalogued works qualify under rule 2, 3 or 4 |
| `author-unmatched` | a work carries the title but its authors only partly agree with the project's |
| `author-spelling` | a work carries the title by an author of the same surname that rule 3 does not attach (a looser spelling, another LibriVox author id, or a variant beside other candidates) |
| `author-unsluggable` | no individual author is left once the names that slug to nothing are dropped ([Names that slug to nothing](#which-work-a-librivox-project-joins), above) |
| `differently-spelled-title` | the duplicate-identity guard holds the book under a title rule 2 does not read as the same, such as one with a subtitle, or the one work rule 4 matches |
| `fallback-slug-taken` | a non-Latin title's `librivox-<project id>` slug is already held by another record, or retired |

Once a person has settled the work (merged the duplicates, fixed the credit),
re-importing the project's id lands it. A `differently-spelled-title` project is
also the guard's ordinary skip: it is counted among the run's duplicate-identity
skips and, with `--conflicts`, writes that guard's `work_identity` row, which
carries `librivox_id` since a LibriVox row has no ASIN. The other reasons
appear on the worklist alone.

#### Credits not recorded

After the worklist, the import report lists the author and translator credits
an attach leaves out (including one kept with its own record under rule 3) and
every credit whose name slugs to nothing, for each project that landed (a
project on the worklist lists none). Each is one line: the project id, the
name, its roles, the person's `librivox_author_id` when LibriVox states one, the
work the recording landed on, and `unsluggable` for a name no record can hold or
`person not created` when no person record exists for the name:

```
librivox credits not recorded: 2 (the project attached to a work that does not name them, or the name slugs to nothing; for recording-level credits, meta#2752):
  2027 "Amy Coulter" (translator, librivox_author_id 9876) -> siddhartha, person not created
  2607 "Йордан Йовков" (author, librivox_author_id 6294) -> staroplaninski-legendi, unsluggable
```

Nothing is written for them yet: recording-level credits, which would give a
recording a translator its work does not share, are to hold them. The run's
`Summary.LibrivoxUnrecordedCredits` carries the same rows.

Known gap: an author whose surname is spelled differently from the catalogue's
("Publius Ovidius Naso" for "Ovid", a misspelt "Henrietta Marhall" for
"Henrietta Marshall") is a different author to these rules, so the project still
creates a duplicate work. The duplicates the first tranche minted before rule 3
existed need a repair: a rerun does not undo them, since the projects are
already catalogued.

The backfill lands as human-reviewed tranches by project-id range (about 2,000
projects a pull request) under the ordinary merge policy. No automated LibriVox
lane runs yet; `GOVERNANCE.md` holds only a stub of its future invariant.

`metacheck` enforces the identity rules the schema cannot see
(`pkg/check/librivox.go`: the LibriVox ids are unique, a chapter's `audio_url`
needs its recording's `librivox_id`, and a person's `death_year` is not before
their `birth_year`); the fields and their rules are in
[the data model](./data-model.md#recording---a-member-of-its-work-entrys-recordings-map).
Once built into the artifact, the records reach the API's
[LibriVox layer](./api.md#the-librivox-layer).

## Scanning local files: metascan

`metascan` is the low-friction path when you have only audio files - no export.
It walks a folder locally and **sends nothing anywhere**, emitting an import JSON
the site's `/import` page accepts:

```sh
go run ./cmd/metascan /path/to/audiobooks -o scan.json
```

Per book it gathers embedded tags (via `dhowden/tag`), the folder structure
treated as a first-class source (`Author/Book`, `Author/Series/Book`, and name
patterns like `01 - Title` or `Jack Reacher 03 - Title`), an ASIN hunted in tag
atoms and file/folder names, and - if `ffprobe` is on `PATH` - runtime and chapter
counts. Every field records where it came from (`tag` / `path` / `filename`) in
the book's `sources`, and unknown fields are omitted rather than guessed. Without
`ffprobe` the scan still works; embedded ASIN/series extraction is just more
limited (pass `-ffprobe ""` to skip it entirely).

## The in-browser site tools

meta.audiosilo.app hosts two client-side helpers so a contributor never has to run
Go tooling. The Developer Docs only note them; the end-user walkthrough is the
User Guide's [community metadata site page](/users/community/meta-site):

- **[`/import`](https://meta.audiosilo.app/import)** - parses an OpenAudible,
  Libation, or Audiobookshelf export, or a `metascan` folder scan, entirely in the
  browser and **diffs it against the live catalogue**, so a contributor sees
  exactly what is new before submitting.
- **[`/build`](https://meta.audiosilo.app/build)** - a guided builder that walks a
  contributor through writing the characters or recaps sidecar for a work already
  in the catalogue.

## Authoring the expressive layer

The CC BY-SA characters/recaps layer has its own documented process. The
process documents moved with the layer to the root of the
`audiosilo-meta-community` repository (`audiosilo-meta` keeps pointer stubs at the
old paths), while the tooling they use stays in `audiosilo-meta`:

- `AUTHORING.md` - the reusable authoring process for characters/recaps:
  positions, the spoiler model, the copyright length caps, and the submission
  checklist.
- `EXTRACTION.md` - the epub source-to-sidecar pipeline (rolling fact pass,
  notes-only synthesis, adversarial spoiler audit), supported by
  `metaextract split` + `ngram`.
- `EXTRACTION-AUDIO.md` - the audio-only variant (chapter-isolated ASR +
  proper-noun verification), the process the `audiosilo-sidecars` tool automates.
- `GOVERNANCE.md` (in `audiosilo-meta`) - the merge policy and contributor trust tiers
  (schema/tooling/`.github` changes always need maintainer review via
  CODEOWNERS).

Source material and transcripts **never enter the repository** - only the derived
CC BY-SA sidecars are committed, so the near-verbatim `ngram` check is run locally
against the source you hold, by design.
