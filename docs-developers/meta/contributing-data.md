---
title: Contributing data to Meta
description: "How metadata enters audiosilo-meta: the GitHub issue forms (four in the core repository, two in audiosilo-meta-community) and the intake automation that turns them into validated bot pull requests, the advisory ai-verify layer, the OpenAudible/Libation importers, metascan, the in-browser site tools, and the authoring rules."
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
repository, `audiosilo-meta`, holds the four forms for the CC0 factual core:

| Form | Template | Routing label | For |
|---|---|---|---|
| Add a work (book) and its first recording | `add-work.yml` | `data:add-work` | a new book plus its first narration |
| Add a recording (narration) | `add-recording.yml` | `data:add-recording` | another narration of a work already in the database |
| Correct data | `correct-data.yml` | `data:correction` | a single-field fix to an existing record |
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

Six behaviors are worth knowing:

- **Mirror-seeded records are taken over by ASIN.** When an Add a work or Add a
  recording submission names, by ASIN, a recording that was seeded from the
  libex mirror and that no user has attested (every `sources[]` entry is
  `libex-import`), the bot does not close it as a duplicate: it applies the
  submission over that record through `importer.AttestAt`, which runs it as a
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
  routing label later - a `labeled` event. The job gate excludes the workflow's
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

:::note Intake runs on `issues`, not fork code
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

## Two validation layers on a pull request

Every pull request touching `data/**` is checked twice:

- **`check.yml` (mechanical, blocking).** Runs `go build`/`vet`/`test`,
  `metacheck` (schema, pack placement and caps, referential integrity,
  uniqueness, chapter/series rules), and `metafmt --check` (canonical JSON +
  pack invariants). A red pull request never merges. It uses the plain `pull_request` trigger, so fork pull
  requests run with a read-only token and no secrets.
- **`ai-verify.yml` (advisory, never blocking).** An AI judgement layer on top of
  the mechanical check: it posts a `PASS` / `FLAG` comment and label but **never
  blocks a merge**. It also uses the plain `pull_request` trigger by design (not
  `pull_request_target`, which is forbidden here as the "pwn request" pattern), so
  a fork pull request gets a neutral skip notice until a maintainer pushes its
  branch to the repo or re-runs it - fork secrets are never reached. The diff is
  passed to the model as untrusted data and never executed.

The one place that verdict is *not* advisory is the
[series-completion bot](./sync-bot.md): its bounded, `data/`-only batch imports
merge themselves once the required checks pass and `ai-verified` is applied, and
every other batch import - opened by a person or composed from the "Import a
library" form - still needs a maintainer's approval however green it is.

## Bulk importers: metaimport

`metaimport` ingests an external library export into `data/` as reviewable
records, for contributors who already have a library manager's export:

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
than minting a sibling. A row whose person, series, or work identity resolves to a
slug a repair merge has since **retired** is judged against the surviving record
instead of minting a new one at the old address - the same `data/redirects.json`
table `metaserve` uses to 301 a retired id (see [the data model](./data-model.md#slug-is-identity-the-file-is-only-storage)).

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
