---
title: Contributing data to Meta
description: "How metadata enters audiosilo-meta: the GitHub issue forms (five in the core repository, two in audiosilo-meta-community) and the intake automation that turns them into validated bot pull requests, the advisory ai-verify layer, the OpenAudible/Libation importers, the LibriVox public-domain mirror and its work-matching rules, metascan, the in-browser site tools, the authoring rules, and how CI runs the Go gate and the check verdict."
---

## The rules that govern everything

Two non-negotiable rules apply to every contribution, whichever path it takes.
They are enforced by tooling where possible and by review everywhere else (the
full policy is in the repo's `LICENSING.md` and `GOVERNANCE.md`):

- **Facts only, never fabricated.** Contributed data must be real and verifiable.
  If a fact can't be verified, the (optional) field is **omitted rather than
  guessed**. That means no publisher blurbs, no invented ASINs and no cover files
  (covers are URLs). Every record carries a `sources[]` provenance entry.
- **Own words, never copied.** Descriptions and the CC BY-SA characters and recaps
  are community-authored and length-capped for the reference-guide tier. Verbatim
  or near-verbatim phrasing from a source is a separate publish-pipeline failure
  (see [Authoring the expressive layer](#authoring-the-expressive-layer)).

Because the GitHub repository is the database, **all writes go through GitHub**.
There are no server-side accounts. A contribution is either a direct pull request
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
| Correct several fields (batch) | `correction-batch.yml` | `data:correction-batch` | up to 25 corrections to one book with one shared source, as a JSON list. Usually filed by an AudioSilo Bridge (see [The correction-batch form](#the-correction-batch-form)). |
| Import a library export | `import-library.yml` | `data:import` | an OpenAudible, Libation, Audiobookshelf or metascan export to bulk-import |

The CC BY-SA sidecars live in their own repository,
[`KodeStar/audiosilo-meta-community`](https://github.com/KodeStar/audiosilo-meta-community),
since the community-repo split, and so do their two forms
([choose one there](https://github.com/KodeStar/audiosilo-meta-community/issues/new/choose)):

| Form | Template | Routing label | For |
|---|---|---|---|
| Add characters (the cast) | `add-characters.yml` | `data:characters` | the per-work characters sidecar |
| Add recaps (story so far) | `add-recaps.yml` | `data:recaps` | the per-work recaps sidecar |

The core repository's issue chooser links there. The spoiler-free description
member has no form at all. It arrives as a hand-authored pull request on the
community repository.

Both repositories run the same `metaissue` composer, each under its own tree
profile (`--profile core` here). So a sidecar label applied to an issue in the
core repository is refused with a pointer to the community repository's chooser,
rather than composed into the wrong tree.

## Intake automation: issue form to bot pull request

`.github/workflows/intake.yml` converts a submitted form into a validated bot
pull request. On a data-labelled issue it runs `metaissue`, which parses the
rendered form body into canonical records (or a single-field correction, or a
placed sidecar), **deduplicates against the existing catalogue**, and emits a
machine-readable verdict the workflow branches on:

| Verdict | Meaning | Workflow action |
|---|---|---|
| `ok` | valid new or changed records produced, including a mirror-seed takeover (described later in this section) | opens a PR on branch `intake/issue-<n>` |
| `duplicate` | everything already exists (requires at least one skip) | labels and comments, no PR |
| `needs-human` | ambiguous. Examples are an import that produced and deduped nothing, or a submission that disagrees with a mirror-seeded record | labels and comments for maintainer attention |
| `invalid` | the submission fails the schema or validation | labels and comments with the errors |

The bot's pull-request body lists the files it changed as they stand in the
working tree after every step has run. That includes the libex fill, which can
rewrite packs `metaissue` never listed. The list is capped at 50, with a count of
the rest. The pull request's own Files changed tab is the full list.

The pull request's **Notes**, and the messages of a verdict comment, are bounded
too, because GitHub stops an issue comment or pull-request body at 65,536
characters. They hold at most 50 lines and 40 KB, with each line at most 2 KB, then
one "... and N more" line. The complete list is `all_messages` in the
`result.json` printed to the workflow run log. Because the bound keeps the head, an
import's messages come in this order:

1. the run-level summary lines;
2. the **conflict** lines (a row refused for contradicting a recorded runtime or
   release date);
3. every other per-row warning.

Seven behaviors are worth knowing:

- **Mirror-seeded records are taken over by ASIN.** An Add a work or Add a
  recording submission may name, by ASIN, a recording that was seeded from a bulk
  mirror and that no user has attested (every `sources[]` entry is bulk-mirror
  tier: `libex-import` or `librivox`). The bot does not close such a submission
  as a duplicate. It applies the submission over that record through `importer.AttestAt`, which
  runs it as a one-row user-library import over the store `metaissue` already
  opened, and hands it to `attestExisting`, the hook a library import takes at its
  ASIN-dedup skip.

  What the takeover changes:

  - the stated runtime, release date, publisher and cover replace the mirror's (a
    stated date never coarsens a recorded one);
  - a stated recording ISBN is appended when no recording carries it yet;
  - blank fields keep the mirror's values;
  - genres are added to the work's set;
  - a `user` source citing the form's Sources field is appended, to the work too
    when it is also a mirror seed.

  The pull request carries a *modified* record, which the rebase sweep and
  `ai-verify` (through `cmd/metadiff`) handle like any other change, and a
  maintainer still approves it.

  Nothing is applied, and the verdict is `needs-human` naming why, when:

  - the submission disagrees with the seed: a runtime more than 10% apart, or a
    release date that is not the same date at another precision;
  - it describes a different book than the record its ASIN names (authors,
    narrators or language), because a mistyped ASIN must not attest somebody
    else's record;
  - a submitted ISBN is recorded on a different recording;
  - its ASINs name two different recordings.

  Every matched ASIN is classified before the verdict, so their order never
  changes it. A title that differs is only a note, and identity is never
  rewritten.

  Only an ASIN match takes a record over. A mirror-seeded record met by title,
  ISBN or narrator set is `needs-human`. The verdict names the mirror that seeded
  the record ("the libex mirror", "the LibriVox mirror"), never libex for a
  LibriVox record. On the add forms the message names the record's mirror-only
  ASINs, and adding the matching one to the issue turns it into a takeover. The
  rule itself is LICENSING.md's "Trust tiers and the user-overwrite rule" (in
  `audiosilo-meta`).
- **A taken title slug is judged by author.** On Add a work, a title whose slug
  another work already holds is a duplicate only when that work is by the
  submitting author. The importer's same-person rule decides this, so "J. Doe"
  meets "Jane Doe".

  A clearly different author's book of the same title is a different book. The bot
  composes it at the author-suffixed slug the bulk importer would mint
  (`the-good-shepherd-c-s-forester` beside Kenneth E. Bailey's
  `the-good-shepherd`), whoever attested the existing record.

  The verdict is `needs-human` rather than a composed record in two cases:

  - the author is close to the incumbent's (the same surname, or one edit apart),
    so it may be a misspelling;
  - the author-suffixed slug is held by yet another author's book.
- **Retailer decoration comes off a submitted title.** On Add a work, some
  decoration in a title is not part of a book's identity:

  - an `(Unabridged)` marker;
  - its series name at a title boundary;
  - a marketplace edition such as ": International Edition";
  - a trailing narrator credit such as " - Read by Luke Daniels".

  The bot composes the record under the cleaned title
  (`titlerule.StripDecoration`), and the verdict notes it. The cleaned title then
  meets the slug and identity gates. So "Hammered: International Edition" from the
  author of the catalogued "Hammered" is a `duplicate`, not a second record.

  The decoration is kept when the cleaned title is a work this submission is not a
  second record of (a stated volume, a collection). A title that cleans to nothing
  that names a book, or to a fragment, is `needs-human`.
- **Envelope sniffing.** For an import, `metaissue` sniffs a self-identifying
  `audiosilo-books` envelope and routes it to that importer, whatever the form's
  export-type dropdown says. The file is trusted over the form. If you are building
  a tool that produces such a file, the [Import file format](./import-format.md)
  page is the producer-facing spec.
- **A submission is admitted by its routing label, not by `opened`.** The
  workflow triggers on `labeled` (for a routing `data:*` label) and `edited` (for
  an issue carrying a `data:` label). An issue opened with its routing label
  fires that label's `labeled` event too, so admitting `opened` as well ran
  intake twice and posted every verdict twice.

  The GitHub API silently drops labels on issues opened by non-collaborators. A
  Bridge filing with a token from its environment or `gh` creates intake issues
  over the API, so such an issue arrives label-less. It is admitted when a
  maintainer applies the routing label later, which is a `labeled` event. An
  issue filed through the AudioSilo App comes in by a third door,
  `workflow_call` from `route.yml`
  ([Issues filed through the AudioSilo App](#issues-filed-through-the-audiosilo-app)).

  The job gate excludes the workflow's own outcome labels (`data:invalid`,
  `data:needs-human` and `data:duplicate`), so outcome-labeling can't re-fire
  intake. Each run posts its non-ok verdict as a comment, so an edit always gets
  an answer.
- **Corrections are judged against the schema first.**
  - A correction naming a field that lives on the *other* record kind is
    `invalid`. An example is `runtime_min` against a work URL, when a runtime
    belongs to one narration. The verdict points at the right record. It lists
    the work's recording references, or gives a recording's work page URL.
  - A value outside the schema's closed vocabulary (a `license` other than
    `CC0-1.0`, a person `kind`, a genre) is `invalid`, and the verdict names the
    allowed values. An allowed value is stored in the schema's own spelling
    (`Publisher` becomes `publisher`).
  - A correction that restates the value the record already carries is a no-op
    `duplicate` that writes nothing.
- **A title correction can add a retitle alias.** A work's slug stays put when its
  title is corrected. When the new title no longer reaches the slug, the bot also
  records a tombstone onto the work in `data/redirects.json`, at the slug the next
  import of that title would mint (the
  [retitle alias](data-model.md#slug-is-identity-the-file-is-only-storage)). The
  pull request carries that file beside the work's pack. The correction-batch form
  does the same for its title changes.
- **Translation and reading-order links are correctable one at a time.** Before
  anything is written, the bot judges them by the same link rules `metacheck` runs
  (the [data model's](data-model.md#translations-and-reading-orders)). The verdict
  follows **where the fault lies**:

  - a fault in what the submitter wrote is `invalid`, naming the fix;
  - a conflict that lies in OTHER records, where either statement could be the
    wrong one, is `needs-human` for a maintainer to decide.

  The rules per field:

  - A work's `translation_of` is **additive**. The correction contributes ONE
    original, given as a work reference: a `/works/{slug}` page URL, the legacy
    `?id=` URL, a data path or a bare slug.
    - A retired slug is followed through the tombstone table, and the bot composes
      the link under its survivor with a note.
    - A reference that names nothing is `invalid`, naming it.
    - A target already listed is the no-op `duplicate`. The set is re-sorted after
      the add.
    - A link to the record itself, to a work in the same language, or to a work
      that is itself a translation is `invalid`. For a translation, the verdict
      names ITS original to use instead.
    - The correction is `needs-human` when the record being corrected is already
      the original other records translate, or the target already names this
      record as its original. Either way the correction would make a chain out of
      links somebody else stated.
  - A series' `translation_of` follows the same rules, with a series reference (a
    series page URL or slug) and the two series' derived languages. The language
    test is skipped when either series has none. The form still refuses a
    same-language series link as `invalid`, though `metacheck` only reports one
    already in the tree as an advisory.
  - A series' `ordering` is a scalar from the enum (`publication`,
    `chronological`, `recommended`). A value that another series of the same
    ordering family already states is `invalid`. Two series in one order are a
    duplicate to report, not two views.
  - A series' `ordering_of` is a series reference naming the primary ordering.
    - A series that states no `ordering` yet is `invalid` with "state this series'
      ordering first", because the schema requires the ordering beside the link.
    - It is `invalid` when it names itself, when the target is itself a variant
      (the verdict names that variant's primary to use instead), or when the
      family already holds a series in this series' order.
    - It is `needs-human` when other variants already name this series as THEIR
      primary, because it would stop being one.
  - A work's `language` correction is judged by the translation rule too. A
    language that puts the work in the same language as a work it translates, or
    as a work translating it, is `needs-human`, since either the language or the
    link is wrong. A series it belongs to changing its derived language is never a
    reason to refuse it. Correcting a misfiled member's language is how a
    series-level language clash gets fixed.

:::note[Intake runs on `issues`, not fork code]
`intake.yml` triggers on the `issues` event, so there is **no fork code
execution**. The only untrusted input is the issue body and any attachment. The
workflow writes it to a file through an environment variable (never interpolated
into a shell command). `metaissue` parses it, and nothing executes it.

The workflow fetches attachments HTTPS-only from GitHub's user-attachment hosts,
with a size cap set per form:

- up to 25 MiB for the import form's **Export file** (GitHub's own ceiling for a
  non-image issue attachment);
- 1 MiB for a characters or recaps sidecar.

The fetch deadline scales with the cap, so a sidecar fetch does not wait out an
export's timeout on a dead link. The security posture is deliberate. The
workspace-wide CI rules are in [gates and CI](../contributing/gates-and-ci.md).
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

A recording field addressed to the **work** isn't a mapping bug. The filer didn't
know the recording, so it goes to a maintainer, who finds it.

One structurally invalid change refuses the **whole** issue, naming every bad
change, because a batch is machine-written and one bad change makes its siblings
suspect. A change is invalid when it has:

- an unknown field, or a work field addressed to a recording;
- no record or no corrected value;
- a value over 500 characters or holding a control character;
- the same field of the same record stated twice (two different ISBNs are two
  facts);
- a bidirectional embedding, override or isolate control in a value (U+202A to
  U+202E or U+2066 to U+2069). A zero-width joiner or non-joiner is allowed.

The whole issue is also refused for a Changes block that can't be read (not
version 1, an unknown or repeated key, no changes or more than 25), missing
evidence, evidence over 2,000 characters or holding a bidirectional control, or an
unticked dedication.

The valid changes are then decided one at a time. A maintainer's field, a
recording field addressed to the work, or a record the bot can't resolve is
`needs-human`. A bot-applied field runs through the single-field form's own path,
`applyCorrection`, which returns applied, unchanged, needs-human or invalid. The
verdict is:

- `ok` when at least one change applied. The bot opens ONE pull request with the
  applied part. When nothing is left for a maintainer, the pull request closes the
  issue on merge. Otherwise it **references** the issue without closing it
  ("Applies part of #N"). Once it is open, the workflow comments the rest
  (`needs_human`) on the issue and labels it `data:needs-human`;
- `needs-human` when nothing applied and something needs a maintainer;
- `duplicate` when every change already matches the record;
- `invalid` when any change is invalid, including one only applying it could find
  (a malformed date), and then nothing is written.

## Issues filed through the AudioSilo App

A Bridge files characters and recaps on the community repository, and correction
batches here. How it files depends on its sign-in:

- **With its Accounts sign-in**, it files **under the server admin's own GitHub
  account**, through the public **AudioSilo Contributions** GitHub App (id
  `5387686`, slug `audiosilo-contributions`; see
  [Contributions](../bridge/contributions.md)).
- **With a token from its environment or `gh`**, it files a plain issue, which
  this workflow leaves alone. Its routing labels stick only for an account with
  write access to the repository, and their `labeled` event admits it. Otherwise a
  maintainer routes it.

An App-filed issue arrives **without labels**. GitHub drops the labels a
non-collaborator sets, and an issue form's labels never apply to an API-filed
issue. So intake's `labeled` door would never open. Instead,
`.github/workflows/route.yml` (one copy in each repository) routes it, on
`issues: opened`:

1. **It checks the issue.** It runs only for an App-filed issue
   (`performed_via_github_app.id > 0`) with no `data:` label, and compares the id
   with its `APP_ID` constant in the step. The id proves only which App's token
   filed the issue, and **anyone** can obtain that token: the App is public and
   its device flow needs no secret. So the id is a routing hint, never trust.
   Intake validates the body exactly as for a hand-filed form, and every pull
   request is still reviewed before it merges, by a maintainer or the
   maintainer's [steward](steward.md).
2. **It picks the template from the title prefix**, an allowlist:
   - here, `[work] ` is `data:add-work` and `[corrections] ` is
     `data:correction-batch`;
   - on the community repository, the prefixes are `[characters] ` and
     `[recaps] `.

   Any other prefix is left for a maintainer.
3. **Abuse bounds** hold the issue for a maintainer instead of routing it. The
   workflow labels it `intake:held` and comments why. The bounds are:
   - a GitHub account younger than **30 days** (`gh api users/<login>`'s
     `created_at`);
   - **more than 25** open App-filed issues from that account here, this one
     included (**50** on the community repository), counted with the issues list
     endpoint filtered by creator;
   - a numeric user id listed in `.github/intake-denylist` (one per line, `#`
     comments). The workflow reads it through the contents API, and a missing
     file lists nobody;
   - any of these checks failing to read.

   A routing label the workflow couldn't apply holds the issue too, since nothing
   re-runs this workflow.
4. **Under the bounds, it routes the issue.** It labels the issue `data` and the
   template's label with `GITHUB_TOKEN`, which starts **no** workflow (GitHub's
   recursion guard). Then it calls `intake.yml` as a **reusable workflow** in the
   same run: `workflow_call` with `issue_number` and `template`, and the
   `INTAKE_PAT` secret passed on, so the bot's pull request still triggers CI. A
   called run is admitted only for the issue that started its caller, and routes
   on the `template` input.

A maintainer releases a held issue by applying its routing label by hand, which
intake's ordinary `labeled` trigger admits. Blocking the account or setting
interaction limits are the stronger tools.

The labels `data:correction-batch` and `intake:held` must exist in the repository,
because a label the workflow can't apply holds the issue. The workflow's security
rules:

- the untrusted title, body and login reach `run:` only through environment
  variables, and are only compared;
- nothing is checked out;
- `permissions: {}` sits at the top, with the least each job needs;
- the route job has a timeout, and the called intake job keeps its own.

## Two validation layers on a pull request

Every pull request touching `data/**` is checked twice:

- **`check.yml` (mechanical, blocking).** It runs these as parallel jobs:
  - `go build`, `go vet` and `go test`;
  - `metacheck`: schema, pack placement and caps, referential integrity,
    uniqueness, chapter and series rules, LibriVox id rules;
  - `metafmt --check`: canonical JSON and pack invariants.

  Its `check` job is [the verdict](#check-is-the-verdict) over all of them. A red
  pull request never merges. It uses the plain `pull_request` trigger, so fork pull
  requests run with a read-only token and no secrets.
- **`ai-verify.yml` (advisory, never blocking).** An AI judgement layer on top of
  the mechanical check. It posts a `PASS` or `FLAG` comment and label but **never
  blocks a merge**.

  It also uses the plain `pull_request` trigger by design. `pull_request_target` is
  forbidden here as the "pwn request" pattern. So a fork pull request gets a
  neutral skip notice until a maintainer pushes its branch to the repo or re-runs
  it, and fork secrets are never reached. The workflow passes the diff to the
  model as untrusted data and never executes it.

  When a rebase leaves what it judged unchanged, the workflow re-applies the last
  verdict without a model call. Each verdict comment carries a hidden key for
  this. A manual dispatch or a re-run always judges afresh.

The one place that verdict is *not* advisory is the
[series-completion bot](./sync-bot.md). Its bounded, `data/`-only batch imports
merge themselves once the required checks pass and `ai-verified` is applied. Every
other batch import, opened by a person or composed from the "Import a library"
form, still needs a maintainer's approval however green it is.

## The Go gate in CI

`check.yml` runs the same gate as the
[local build](overview.md#build-validate-and-serve-locally) (build, vet,
`go test -race`, golangci-lint) plus a `govulncheck` scan, in its `build`, `test`,
`lint` and `vuln` jobs. It runs them only when a `changes` job classifies the diff
as touching Go code. A data-and-prose-only pull request (most of them here, from
the intake and sync bots) skips their steps straight through. The `metacheck` and
`metafmt` jobs are never gated, since they are the data's own check whatever else
changed.

### Jobs, shards and caches

The jobs run in parallel, each on its own runner, so a pull request waits for the
slowest of them rather than their sum.

- **`test` is three shards.** `.github/scripts/go-test-shard.sh` partitions
  `go list ./...` so that every package runs in exactly one. Each shard takes 3 to
  6 minutes.
- **`advisories`** runs on a pull request only. It runs metacheck over the base
  beside the head's run, for the advisory delta. A pull request touching no
  `data/` skips it, since it cannot introduce one.
- **Sparse checkouts.** The jobs that need only Go code (`build`, `lint`, `vuln`)
  and the `site` job check out a sparse tree without `data/`, which skips most of
  a full checkout's time. `advisories` does too, and reads the base's `data/` from
  git.
- **A shared `-race` build cache.** The test shards restore it with
  `actions/cache`, keyed on the Go patch and `go.sum` and saved only on pushes to
  `main`. setup-go's cache has one key for every Go job, and the non-race `build`
  job saves it first, so the shards used to recompile everything under the race
  detector on every run.

### Real-data tests under `-race`

Almost every test that walks the real data tree skips under the race detector.
The fixture suites cover the concurrent code, and `metacheck` and `metafmt`
validate the real tree anyway.

The exception is `internal/recorddiff`'s real-checkout test, which diffs the last
commit under `-race` too. Under `-race` it diffs only a bounded sample of the
changed packs (every family the commit touched keeps one), so it takes a few
seconds whatever merged last. Without `-race` it diffs the whole commit.

### The real-data workflow

The skipped real-data tests still run in CI, in the `real-data.yml` workflow. It
runs the whole suite without `-race`:

- every day;
- on demand;
- on every push to `main` that touches anything the Go gate would run on. A
  `paths:` filter skips `data/**` other than `data/go.mod`, and `*.md`, so the
  bots' data-only commits never trigger it. The one deliberate difference from
  the Go gate is `site/**`, which no real-data test reads, so site-only pushes do
  not trigger it either.

It never runs on pull requests. A newer run cancels an older one, so the newest
commit on `main` is what reports, and a cancelled run reports nothing. A failure
opens or updates a single issue labelled `ci-real-data`, and the next green run
closes it. Run the same tests locally with `go test -count=1 ./...`.

### The pinned linter set

The committed `.golangci.yml` pins the linter set (errcheck, govet, ineffassign,
staticcheck, unused), so a new golangci-lint release cannot change which linters
run. Adding one is an edit there, with its findings fixed in the same change.

### `check` is the verdict

The `check` job needs `changes`, `build`, `test`, `metacheck`, `metafmt` and
`advisories`. It passes only when every one of them but `advisories` concluded
`success` (`.github/scripts/check-verdict.sh`). A skipped or cancelled job counts
as a failure.

- **It runs under `always()`,** so a cancelled run reports a red `check`. A
  skipped `check` would read as green to branch protection and the sync bot.
- **`advisories` can never end red.** Every step continues on error, each under
  its own timeout, because the sync bot treats any failed check run on a head as a
  failure, required or not.
- **Its summary and log.** `check` writes the advisories a pull request
  introduces into its job summary. When it fails, its log ends with the tails of
  the failing jobs' own output. It fetches those from the Actions API for the
  current run attempt only (`.github/scripts/failed-job-logs.sh`, so it needs
  `actions: read`). A re-run of the failed jobs therefore never prints a log from
  an earlier attempt, as the old uploaded-artifact logs could.

**The name is load-bearing.** Branch protection requires `check` and `compose`.
The [sync bot](sync-bot.md) gates its merge on `check` (with `compose`, `site` and
`verify`) by name, and hands the tail of a failed `check` log to its resolver.
Renaming or dropping `check` leaves both waiting for a check that never comes.

## Bulk importers: metaimport

`metaimport` ingests an external library export into `data/` as reviewable
records. It is for contributors who already have a library manager's export:

```sh
go run ./cmd/metaimport openaudible <books.json>  [--dry-run] [--date YYYY-MM-DD]
go run ./cmd/metaimport libation    <export.json> [--dry-run] [--date YYYY-MM-DD]
```

LibriVox's public-domain catalogue has its own two-step path, described in
[LibriVox: the public-domain mirror](#librivox-the-public-domain-mirror). A
maintainer's store listings use
[`metaimport store`](#store-listings-audiobook-guild-and-graphicaudio).

The importer:

- imports **factual fields only**, dropping publisher copy, genres, ratings and
  personal state;
- maps one export entry to a work and a recording, plus its people and series;
- **deduplicates by ASIN** against the catalogue.

`--dry-run` prints the plan without writing. A real run writes the files, then
validates the whole tree and exits non-zero if that fails.

The identity rules:

- **People.** A person slug is the identity. Name variants merge, and there are no
  numbered duplicates.
- **Works.** A work is (title slug + author set), with per-volume disambiguation
  so distinct series volumes never merge. Before a row creates a work, its
  normalized identity (see
  [the data model](./data-model.md#translations-and-reading-orders)) is also
  checked against the catalogue and the run so far. A match is skipped as
  `identity-duplicate` rather than minted beside it.
- **Title decoration.** A trailing `(Unabridged)` or `(Abridged)` marker is
  stripped before identity, and seeds the recording's tri-state `abridged` when the
  source didn't state it. A marketplace edition or a trailing narrator credit is
  stripped too. So "The Search: International Edition" or "The Search, Read by Dee
  Reader" from the author of a catalogued "The Search" resolves to that work, and
  lands as a recording of it (or merges its ASIN into the same production).
- **Qualified titles.** A work catalogued only under a qualified title stays
  reachable as a merge target, never created there. Several such works decide
  nothing.
- **Recordings.** A same-work, same-narrator entry whose only new fact is another
  ASIN **merges that ASIN into the existing recording**, guarded by runtime and
  abridged checks, rather than minting a sibling.
- **Series.** A series claim joins a same-named catalogued series only when its
  authors and its language fit that series (see
  [the import format](./import-format.md)). Otherwise the row founds its own
  series of that name at the next slug.
- **Retired slugs.** A row whose person, series, or work identity resolves to a
  slug a repair merge has since **retired** is judged against the surviving
  record, instead of minting a new one at the old address. This is the same
  `data/redirects.json` table `metaserve` uses to 301 a retired id (see
  [the data model](./data-model.md#slug-is-identity-the-file-is-only-storage)).

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

`--recordings-only` also takes `--copies-of <path>`, a file of one
`{"asin","anchor"}` line per row. Each listed row is another marketplace's copy
of the production the catalogued `anchor` ASIN belongs to, as the caller proved
it. [The series-completion bot](./sync-bot.md#every-stores-copy-of-a-book)
proves it by libex SKU group. The import merges the row's ASIN onto the anchor's
recording and resolves nothing from the row's credits or series, so it mints no
person, work or series. It still refuses a row whose anchor is not catalogued,
or whose language, runtime, abridgement or region does not fit the recording.
`--skipped` writes those under `copy-anchor-unknown`, `copy-language`,
`copy-runtime-mismatch`, `copy-abridged` and `copy-region-held`. An AI-narrated
row is still refused as `ai-narrator`, since it is another production. An
unlisted row in the same run takes the ordinary `--recordings-only` path.

For relocation, export rows for **all ASINs of the cross-language recordings**
in one batch. The metadata repository's `scripts/README.md` documents deriving
the list from the pack tree and running `scripts/libex-relocate-rows.sql` against
the libex dump. The query retains every copy so contradictory source evidence
cannot disappear behind an export filter.

```sh
go run ./cmd/metaimport libex /tmp/xrec-rows.ndjson --relocate \
  --data /tmp/review-data --dry-run --skipped /tmp/relocate-skipped.ndjson
```

A move needs all of these:

- every supplied row naming the recording agrees on its language, and that
  language matches the recording;
- the old work is in another primary language, and retains an own-language
  recording;
- the narrators' recordings of other works do not veto it. They can veto through
  the shared narration-language profile. Thin or mixed evidence does not veto, and
  no language is inferred.

Work resolution uses the ordinary create path's slug chain, identity guard, credit
cleaning and genre mapping. The importer refuses conflicting destinations for
review.

The recording moves as raw fields, preserving chapters, cover, `added_at`,
identifiers and sources, with the run's provenance appended. A colliding id is
numbered. A same-narrator sibling with compatible runtime and abridgement instead
absorbs the recording's identifiers and sources, and notes name each discarded
field and value.

Series claims always use `--existing-series-only` semantics. When the old work
holds a claimed slot of a catalogued series deriving the recording's language, the
importer re-points that membership to the destination. Other old-work fields and
memberships stay as they were. No translation link is written.

Before repeating without `--dry-run`, review:

- the three disjoint recording counts: `relocated-to-existing`,
  `relocated-to-new-work` and `merged-into-sibling`. New-work counts include
  recordings joining a work minted earlier in the run;
- the memberships re-pointed;
- the notes and refusals.

`--skipped` writes one atomic NDJSON `{"asin","reason"}` line per refused input
copy. Unlike create mode, those ASINs are already catalogued. Refusal counts in
the summary count recordings. The new stable codes start with `relocate-`:
`rows-language`, `recording-language`, `work-language`, `no-home-recording`,
`narration-contradicts`, `destination-conflict` and `row-unusable`. The existing
create admission and `identity-duplicate` codes also apply.

Relocation cannot be combined with `--enrich`, `--recordings-only`, or the
create-only `--attach-editions`. A repeated run moves nothing already relocated
and repeats unresolved refusals. A real run validates the whole written tree.

### Genres: the format rule, the recording vote and regeneration

A libex row states every Audible category the book is filed under, and the
importer maps each one onto the project's genre vocabulary
(`internal/importer/audiblegenres.json`). Two rules decide what a work keeps.

- **Format categories.** Some Audible categories say how a book was produced
  rather than what it is about, in every marketplace:

  - "Audio Performances & Dramatizations", with its Dramatizations and
    Storytelling children;
  - the "Radio" and "Film & TV" leaves under "Entertainment & Performing Arts".

  They are listed in the table's `format` key. `format_tree`, derived by
  `scripts/genrepaths`, gives their ancestors.

  Within one row, a format category contributes its genre only when nothing else
  in the row maps. The same holds for an Arts & Entertainment ancestor the row
  reaches only through a format category. For example:

  - a full-cast radio dramatization of a mystery is a mystery;
  - a radio panel show stays `arts-entertainment`;
  - a row that also states Arts & Entertainment > Art keeps `arts-entertainment`
    through Art.

  "Radio" and "Film & TV" are a format only beside a FICTION genre. The table's
  `genre_kinds` classifies every genre as fiction, nonfiction or neither. The same
  leaves file books about film, television and radio, which keep
  `arts-entertainment`. A comedy panel show keeps it too, because `comedy-humor`
  is not fiction. The dramatizations subtree is a format beside anything.

  The site's `/add` prefill applies the same rule over the same table.
- **The recording vote.** A work with several recordings from different publishers
  is tagged by each of them, so a union of every row collects each publisher's
  mistakes. A mirror-derived set is instead the vote over the work's recordings
  (`importer.VoteGenres`):

  - each recording is one vote, its regional ASINs together;
  - a recording whose rows map nothing does not vote;
  - with three or more voters, a genre is kept when at least two state it;
  - with fewer voters, every voter's genres are kept.

  A work that a libex create run makes gets this set. So does a genre-less work
  that `--enrich` fills, voted over the recordings its rows matched. User-library
  imports keep adding their genres and never remove one.

`--regenerate-genres` applies both rules to works already in the catalogue, which
no other mode does. Every other writer only adds to a recorded set, and `--enrich`
fills only a work with none. Feed it the rows of **every** catalogued ASIN. The
metadata repository's `scripts/README.md` shows the export. For each work a row
reaches, it computes the vote, then:

- a work takes the vote as its set when it has no user-library source on it or on
  any of its recordings (`openaudible-import`, `libation-import`,
  `audiosilo-books-import`, `user`), and every one of its ASIN-carrying recordings
  met a row. A vote that states no genre leaves the work as it is;
- any other work only gains what the vote adds.

It touches no field but `genres`, creates nothing and appends no source, because
the genres are derived from rows the work already cites. So a second run over the
same rows is a no-op.

A row that contradicts its recording's recorded runtime casts no vote. The runtime
is what catches an ASIN attached to the wrong recording, the same test enrichment
and the ASIN merge use. A release date is not the test, since it may legitimately
differ for a regional re-release. A recording whose rows were all contradicted does
not count as covered.

The mode refuses flags that would do nothing in it: `--date`, `--conflicts`,
`--existing-series-only`, the series lookup and `--skipped`.

The regeneration never judges a record with evidence older than the record.
`--rows-as-of YYYY-MM-DD` is required. Set it to the dump's snapshot date. A date
after the day of the run is refused, since it would hold nothing back.

A work's newest provenance is the latest of its `added_at`, every recording's
`added_at`, and every `sources[].imported_at` on it and its recordings. A work
whose newest provenance falls on a later day than `--rows-as-of` is left as it is,
counted and named in a note. Those dates record when something was imported, not
how old its evidence was. So a later day is safe only if every import up to it
used rows no newer than the export.

`--genre-changes <path>` writes one NDJSON line per changed work, for review
before the data pull request. Each line is `{"work","removed","added","mode"}`,
with `mode` `trim` or `add-only`:

```sh
go run ./cmd/metaimport libex /tmp/all-rows.ndjson --regenerate-genres \
  --rows-as-of 2026-07-29 --dry-run --genre-changes /tmp/genre-changes.ndjson
```

The summary line counts the works set to the vote, added to, unchanged and
reached by no row, and the genre instances added and removed. Notes count the
contradicted rows and the works held back as newer than the rows.

### Store listings: Audiobook Guild and GraphicAudio

The purchase links derived from identifiers are Audible (by ASIN) and Libro.fm (by
ISBN). Some books are sold only by a store those links don't reach. Today those
stores are Audiobook Guild and GraphicAudio. A recording can carry its product
page there (`links.audiobookguild`, `links.graphicaudio`; see
[the data model](./data-model.md#recording---a-member-of-its-work-entrys-recordings-map)).
A maintainer can import such a store's **public listing** for books they name:

```sh
go run ./cmd/metaimport store <listings.ndjson> [--data data] [--dry-run] [--date YYYY-MM-DD] \
  [--attach-editions] [--existing-series-only] [--conflicts <path>]
```

The input is a reviewed file in the libex row shape (NDJSON, one JSON array, or a
single object), with `store` and the page's `url` in place of an ASIN:

```json
{"store": "audiobookguild", "url": "https://audiobookguild.com/products/without-law-17",
 "title": "Without Law 17", "authors": [{"name": "Eric Vall"}],
 "narrators": [{"name": "Joshua Story"}], "series": [{"name": "Without Law", "position": "17"}],
 "lengthMinutes": 612, "releaseDate": "2024-03-05", "publisher": "Royal Guard Publishing",
 "imageUrl": "https://cdn.shopify.com/...", "language": "english"}
```

- **Facts only.** The importer reads these fields and nothing else:
  - the title;
  - the subtitle, as the libex import does. It is never stored as the work's
    subtitle, only joined to the title where it tells two same-titled volumes
    apart;
  - the authors, narrators and series;
  - `lengthMinutes`, `releaseDate`, `publisher` and `language`;
  - `imageUrl`, an `https://` cover URL. Any other URL is dropped with a warning.

  So a blurb, rating, price or store genre in the file stores nothing.
- **Refused at parse**, with a warning:
  - an unknown `store`;
  - a `url` that isn't a product page on that store's own host
    (`model.StoreLinkOK`);
  - a row carrying an `asin`, because a listing with an ASIN belongs to
    `metaimport libex`;
  - the libex credit refusals.
- **Deduplicated on the page.** A row whose page the catalogue, or the run so far,
  already holds is a skip. The key is `model.StoreLinkKey`, which folds host case,
  a leading `www.` and a trailing `/`. It is the key `metacheck` holds unique. A
  rerun of the same file is all skips.
- **A page joins a held production only on proof.** The work the identity walk
  reaches may already hold a retail recording with the row's narrators (LibriVox
  projects aside). Then the importer adds the page to the **one** such recording
  that is provably the row's production. That is the ISBN attach's test: both
  state a runtime, the runtimes agree, and there is no abridged or series-position
  conflict.

  The importer refuses the row with a warning, and creates nothing (no work, person
  or series claim), when no recording qualifies, when several do, or when the one
  that qualifies states another page for that store. The summary counts the pages
  added this way.
- Otherwise the row is a new recording or work through the ordinary identity,
  duplicate, person and series rules. The store page goes on its `links`, with a
  `store-listing` source whose `ref` is the page's URL.
- **Create mode only**, with its `--attach-editions`, `--existing-series-only`
  and `--conflicts`. The other modes key on an ASIN, which a store row never has.

The licence posture is LICENSING.md's "Store listings: a maintainer-named import"
(and GOVERNANCE.md's "Store listings (maintainer imports)") in `audiosilo-meta`.
The import is:

- bounded to books a maintainer names and reviews;
- landed as an ordinary `data/` pull request;
- never run on a schedule;
- not used by the [series-completion bot](./sync-bot.md) or the LibriVox lane.

`store-listing` ranks with the bulk mirror, so a user's own library or hand edit
outranks it (see [provenance](./data-model.md#provenance-on-every-entity)).
Adding a store is a schema change (its `links` key and host check) and an edit to
that section.

### LibriVox: the public-domain mirror

`metaimport librivox` mirrors [LibriVox](https://librivox.org)'s catalogue, every
language, under the `librivox` source type. It is the **one named exception** to
the rule that the catalogue is never an unbounded mirror. The case is LICENSING.md's
"The public-domain exception: LibriVox", in `audiosilo-meta`:

- LibriVox volunteers release every recording into the public domain;
- the texts they read are public domain too;
- what the importer takes is the factual record of each project.

The exception names LibriVox only. Another catalogue would need its own case
argued in LICENSING.md before any tooling points at it.

**Facts only.** A LibriVox record carries:

- the title and the authors;
- the readers, as narrators, and on each chapter its section's own `readers`;
- the translators, as `translator` credits on the recording, since a translation
  is the project's fact, not the work's;
- the language and the runtime;
- the sections, as chapters. Each has its `audio_url`, and LibriVox's
  `section_number` where it differs from the 1-based position;
- the genres, mapped onto the vocabulary where one fits;
- the project's own title and genre names verbatim (`librivox_title`,
  `librivox_genres`), which the LibriVox-shaped feed answers and filters with;
- the LibriVox ids and the archive.org identifier;
- the `links`: catalogue page, zip, RSS feed and the source text's URL;
- the `copyright_year` LibriVox states for the text;
- the authors' and translators' birth and death years, where LibriVox states them
  as years;
- the cover URL (`https://` only);
- `LibriVox` as the publisher of record.

It **never** carries the project `description`. LibriVox's descriptions are often
quoted from Wikipedia, so they are neither the project's to relicense nor CC0.
Audio and cover art stay on archive.org, and the records hold URLs. In the trust
tiers `librivox` is a bulk-mirror source beside `libex-import`, so a user hand
edit outranks it (see [provenance](./data-model.md#provenance-on-every-entity)).

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
- on `429`, a `5xx` or a network error, it backs off:
  - it honours `Retry-After` (seconds or an HTTP date), never waiting less than
    the 5-second spacing;
  - otherwise it waits exponentially, from 30 seconds up to 10 minutes;
  - after at most six retries (seven requests for one page), the run stops,
    resumably.
- any other error status stops the run at once. So does a response body over
  64 MiB. No feed page comes near that size, so no page is ever cut off and then
  decoded.

#### The snapshot

The snapshot is a directory that is **never committed**. It holds:

- `manifest.json`, the fetch's resume state: feed, query, limit, next offset,
  page and project counts, and whether the catalogue is complete;
- `pages/offset-NNNNNNN.json`, each one feed response body verbatim.

`fetch` writes every page atomically before the manifest records it. So rerunning
the same command after an interrupt resumes at the first page the last run had not
finished. A snapshot fetched with other query parameters is refused rather than
mixed in.

Pages are offset windows over the feed's ascending project-id order. So a project
catalogued during a long fetch lands at the end instead of shifting a window
already read. The catalogue ends at a short page or the feed's "no results"
answer. A snapshot already complete makes no request, so a fresh reading goes into
a new directory. `--max-pages N` stops after `N` pages (`0`, the default, runs to
the end).

#### `import` lands a tranche

`--from` names the snapshot. The importer reads `pages/*.json` and nothing else,
so a hand-assembled snapshot works too. `--ids` is required. It takes one project
id (`527`), a range (`1-2000`), an open range (`5000-`) or a comma-separated union
of them.

`fetch` records each page's range of project ids in the manifest (`page_ids`). A
tranche decodes only the pages whose range meets its ids: a 2,000-project tranche
of the 22,449-project snapshot reads in 0.19 s instead of 2.0 s. The importer reads
the snapshot whole when:

- the manifest does not range every page (one fetched before the ranges were
  recorded, or a hand-assembled one);
- a decoded page holds an id outside its range.

A project whose id is missing or unreadable is skipped with a warning naming its
page and title, since no `--ids` could select it.

The other flags are the usual ones:

- `--data`, `--dry-run`;
- `--date YYYY-MM-DD`, the `imported_at` stamp (today in UTC by default);
- `--conflicts <path>`, one NDJSON row per refused contradiction;
- `--skipped <path>`, one `{"librivox_id","reason"}` NDJSON line per project
  refused under a refusal code: an unknown language, no narrator or author, or
  the duplicate-identity guard's `identity-duplicate`. It is the
  `metaimport libex --skipped` shape with the project id in place of the ASIN,
  written once the run completed;
- `--worklist <path>`, which appends the [worklist](#the-worklist) to a file as
  well, one NDJSON row per project.

The `--skipped` and `--worklist` files are written on a `--dry-run` too. A real
run writes the packs, then validates the whole tree. For each selected project:

- **A retired project number is set aside.** LibriVox gives a number it retired
  or keeps for reuse no author, and a title such as "DO NOT RE-USE PROJECT
  NUMBER" or "REUSE project number - 03 sections". It is no book, and the run only
  counts them (`librivox: set aside N retired or reusable project numbers`).
- **An in-progress project is set aside first.** A row with no runtime
  (`totaltimesecs` 0, missing or not a number) and no archive.org item (no
  `url_iarchive` naming an `archive.org/details/<id>` item) writes nothing: no
  work, person or id stamp. The run prints the ids on one line
  (`librivox: skipped N in-progress projects (no runtime and no archive.org item;
  nothing written, re-import once complete): <ids>`).

  The feed has no status field, so this is the sign of a project still being
  recorded. A later run over the same ids imports it once LibriVox completes it
  and a runtime or an archive.org item appears. A zero-runtime row with an
  archive.org item is imported normally. An in-progress project the catalogue
  already holds is counted as already present rather than listed.
- **Dedup is on `librivox_id`**, never the title. A project whose id is already
  catalogued is skipped, so a rerun of a range never imports a project twice. The
  recording pass (described later in this list) still restates LibriVox's own
  facts on a skipped project's recording. So a rerun over a snapshot backfills
  them, and a second rerun changes nothing.
- Otherwise it becomes a **new recording**, never merged into another one,
  because two LibriVox projects of one text are two productions. The
  [matching rules](#which-work-a-librivox-project-joins) find its work.
- **Sections become chapters.** `start_ms` is cumulative from each section's
  playtime, and the section's archive.org file is the chapter's `audio_url`. One
  section without a playtime leaves the timeline unknowable past it, so the whole
  chapter list is omitted.
- **People are keyed by LibriVox id.**
  - A `librivox_reader_id` or `librivox_author_id` the catalogue already holds
    resolves to that person, whatever the feed now calls them.
  - For every project that landed, the run stamps its readers' and authors'
    LibriVox ids onto the people they resolved to. A translator's id is a
    LibriVox author id. On an attach, only the people the work names are stamped
    (see the attach rule later in this list).
  - A person already carrying a different id in that namespace keeps it, and an id
    already on another person is not recorded twice. The run warns about both.
    That is the case for an author who is two LibriVox ids but one person here. A
    reader reaches it only when the reader-id split, described later in this list,
    cannot apply.
  - An author or translator whose name slugs to nothing is a person of their own
    at `librivox-author-<author id>`. With no id, they are credited nowhere (see
    [Names that slug to nothing](#which-work-a-librivox-project-joins)).
  - An author's or translator's `dob` and `dod` become the `birth_year` and
    `death_year` of the person carrying that LibriVox author id. This happens on
    every run, for a landed project or a held one, but only when LibriVox states a
    plain year (`1883`, `-428`, `428 BC`), and only where the person lacks it:
    - a year another source or a hand edit wrote is never overwritten. When
      LibriVox contradicts it, the stored year is kept, and the run warns and
      writes nothing for that person;
    - a filled half must pair with the other;
    - a pair whose death precedes its birth is dropped whole.
- **The recording pass** (`internal/importer/librivoxrecording.go`) runs last, on
  every project whose recording the catalogue holds, landed or held. It writes:
  - the project's own title (`librivox_title`, markers kept) and genre names
    (`librivox_genres`);
  - its translators, as the recording's `credits`. An attach records no work
    credit, so the recording is what credits them. Each translator is, in order of
    preference, the person carrying the translator's LibriVox author id; else the
    name's person, when that carries no other author id; else a person created for
    them, carrying the id and years. A name another author id holds, or one that
    slugs to nothing with no LibriVox author id, is left off and counted. One that
    slugs to nothing with an id is its `librivox-author-<id>` person;
  - when the stored chapters are the project's sections one to one, each section's
    `section_number` where LibriVox's differs from the position, and each
    section's `readers`. The readers are always among the recording's narrators.
    One reader that resolves to none of them leaves the recording with no chapter
    readers, counted. A recording one narrator reads throughout states none.

  Apart from those translators, the pass never creates or stamps a person. A rerun
  never deletes what its row does not contradict. A row stating no genres or no
  translators keeps the stored ones. A stored translator is dropped only when the
  row names its translators, every one resolves, and that person is not among
  them. The run prints one line of its counts.
- **A new author id is checked against the person its name meets.** It is not
  simply credited to whoever holds its name's slug
  (`internal/importer/librivoxpeople.go`). Only new projects are judged. A project
  already catalogued, and the people it credits, are left as they are.

  The run decides once per author id, for the whole run and before any project is
  placed. It judges against the person the import would actually credit, after its
  spelling rules, the initials step included. So "A.B. Kovacs" is judged as the
  catalogued "AB Kovacs" it would land on. Every credit of the id then carries that
  person, whatever its spelling. So the work it lands on, its credits and the id
  stamp all name one person. Ids are decided in the order of the lowest project
  crediting each, so the outcome does not depend on the order the run reads its
  projects in.
  - **Same-name authors.** The catalogued person is someone else when:
    - they carry another `librivox_author_id` and the two do not state the
      same birth and death years;
    - their years disagree with LibriVox's (a flourished year outside their
      life included); or
    - with neither id nor years, they are credited only as a narrator, or only on
      late works that share no title with the author's projects. A LibriVox
      reader meeting an undated author is taken to be the same volunteer.

    A late work is one first published more than 25 years after the author's death
    or flourished year. With a birth year alone, the 25 years count from the end of
    a hundred-year life from it: no one born in 1840 wrote a 2020 first edition. A
    generic title ("Poems") is not a title in common, though "Poems
    (Ballads of a Cheechako)" is.

    A work's first publication is its text's date: its `first_published`, else the
    `copyright_year` a LibriVox recording of it states. Without either, it is its
    recordings' earliest release date. Two kinds of work are evidence for the
    match, not against it: a work with no date at all, and one co-credited with
    someone who died within those 25 years (a translator of an old text).

    **Naming the separate person.** When it is someone else, the author becomes a
    person of their own, named with LibriVox's years:

    - "James Grant (1822-1887)" at `james-grant-1822-1887`;
    - "Richard Wilson (fl. 1916)" at `richard-wilson-fl-1916`;
    - a death or birth year alone reads "(d. 1942)" or "(b. 1850)".

    When LibriVox states no year, or that dated name is already a person carrying
    another `librivox_author_id`, the author is a person of their own at
    `<name slug>-librivox-author-<author id>`. Ralph Scott (16428) beside a retail
    narrator called Ralph Scott is `ralph-scott-librivox-author-16428`. This is
    the reader form's twin (the
    [person id rule](data-model.md#person---an-entry-in-the-datapeople-family)).
    The run report lists each such split under `librivox worklist: N author ids
    filed at <name>-librivox-author-<id>` to merge or confirm, since LibriVox may
    list one person under two ids
    ([one person under two ids](#one-person-under-two-librivox-ids)).

    A collective ("Anonymous" under another id) is never split this way. A slot
    that another person or a tombstone holds sends the project to the worklist
    instead.

    **When release dates cannot tell.** A modern book and a modern edition of an
    old one look alike by release date. So when any of the catalogued person's
    late works is dated only by its recordings' release dates, the project goes to
    the [worklist](#the-worklist) as `same-name-author`, naming that person's
    works.

    Release dates stop counting against the author when a project they wrote shows
    that those works are editions. The project must be by them alone or with one
    other author, and never an anthology. It shows editions when the catalogue
    holds that text under its full title, credited to a co-author the project
    names, and dated only by a release long past the author's death. The co-author
    must be that catalogued person, not merely someone of the same surname. An
    example is "Narrative of Sojourner Truth", 1850 by LibriVox, beside Olive
    Gilbert's 2009 edition.

    These prove nothing of the kind:

    - a project they only translated, because it is another author's book. Thomas
      Taylor's 1816 Proclus says nothing of a modern novelist named Thomas Taylor;
    - a qualified title, because it names one edition ("Metamorphoses (Howard
      Version)"). So J. J. Howard (fl. 1807) meeting a modern J.J. Howard waited on
      the worklist until a dated record settled it.

    **A second author id of the same name in the run** is the first's person only
    when both state the same birth and death years. Otherwise it gets a dated id,
    or the author-id form when it states no year, as a later run would decide it.

    **Settling a worklist row** means putting the `librivox_author_id` on the right
    person, the catalogued one or a new dated record. Re-importing the id then
    finds that person by id.
  - **Courtesy titles and ranks.** A titled credit is never folded onto its
    bare twin when LibriVox lists the two as different author ids in one run,
    whatever their years. "Mrs. William Platt" beside "William Platt" are two
    people. "Mrs. C. M. Livingston" beside "C. M. Livingston" is LibriVox's own
    duplicate record of one (15071 is now an alias on her record). A run cannot
    tell which case it has, so both records are kept. The run report
    lists the pair under `librivox worklist: N author id pairs one courtesy
    title apart` for a person to merge or confirm, and metacheck's
    honorific-person-pair advisory names it too.

    Nor is a titled credit folded onto a catalogued bare record that the
    same-name test above finds is someone else ("Sir Hugh Fraser" is not
    `hugh-fraser`, an actor who narrates). When that test cannot tell, the
    project goes to the worklist as `same-name-author`. The exception is when a
    reviewed rejection already says the records the two spellings land on are
    two people; then the credit stays on its own. A credit whose id the
    catalogue already holds keeps its holder's spelling.

    The other way round, a bare name that would otherwise be a new person lands
    on the one catalogued record with a courtesy title or a military rank in
    front of it ("Frederick Treves" on `sir-frederick-treves`, "Joseph H.
    Alexander" on `colonel-joseph-h-alexander`). It does not when their life
    years disagree, when that record only narrates, or when it carries a
    `librivox_author_id` and the credit states years that are not that record's
    birth and death. A titled credit the fold leaves meets the same-name test
    under its own spelling.
- **A reader id is a person of its own, even when the name is not.** LibriVox
  readers are accounts, and several share a display name ("Martina", "eva",
  "Lisa").

  - **A shared name.** When a reader's name slugs to a person who already carries
    (or earlier in the run took) a **different** reader id, the reader gets a
    person of their own at `<name slug>-librivox-<reader id>`
    (`martina-librivox-634`, the
    [person id rule](data-model.md#person---an-entry-in-the-datapeople-family)),
    created with that id. The first holder of the name keeps the plain slug. That
    is decided per reader id before any project is placed, by lowest project id,
    so the run's row order never matters. A reader first credited on a project
    that goes to the worklist still holds the name. A later project by the same
    reader finds that person by id, so no reader is ever minted twice.
  - **A catalogued narrator.** A person at the plain slug who carries no reader id
    (a narrator another source catalogued) is not another reader. The first
    LibriVox reader of that name is stamped onto them.
  - **An author record.** The exception is a person who is an **author record**,
    which means one of:
    - a person carrying a catalogued `librivox_author_id`;
    - a person whose life ended before 2005, when LibriVox began. A birth year
      alone counts, since no one born in 1840 read for LibriVox.

    The id or the life may be the person's own, or that of a new author id of the
    run landing on them, whether the run meets the author or the reader first. The
    reader is then split off the same way. A reader called Adam Smith is
    `adam-smith-librivox-19341`, never Adam Smith (1723-1790). A living or undated
    author id of the same run and a reader of the same name are one person,
    whichever project the run meets first.
  - **Collective credits** ("Various", "Full Cast") and the synthetic voice stand
    for no one person and are never split. A second reader id of one is the
    keep-and-warn case above.
  - **A taken id.** The run never writes over an existing or retired person id
    that the composed id happens to match. It credits the plain slug instead,
    whose holder keeps their own reader id, and warns.
  - **Authors are not split this way.** A work's identity rides on its author
    slugs; a same-name author is told apart by its years, or by its author id when
    it states none (above).

  The `librivox:` summary line counts the readers split.

  **A name that slugs to nothing** (Greek, Cyrillic, CJK) makes the reader a
  person of their own at `librivox-reader-<reader id>` (`librivox-reader-11294`),
  created with that id and the name kept as written. So two such readers are never
  one record, and a rerun finds each by id. A `librivox:` summary line of its own
  counts them.

  The project is skipped with a warning, before anything is planned, when:

  - that id is already another person's or a retired one, either before the run
    or because a row of the run created a person there;
  - the credit carries no reader id.

  The project stays re-importable. It is never credited to the shared catch-all
  person, which `metacheck` refuses whatever the source.
- **A rerun splits readers on recordings it skips.** A held recording may credit
  a reader to a person carrying another reader id of the same name, or to anyone
  other than the person the catalogue already holds that reader's id on. The
  rerun still skips the project, but moves that narrator credit onto the reader's
  own person. It creates that person when needed, and keeps the other reader's
  credit when both read the project. The summary line counts the credits moved,
  and a second rerun changes nothing.
- **An attach records the recording, not new credits.** A project that joins a
  work already in the catalogue adds only its recording and its readers, because
  a create run never edits a catalogued work's credits. So the run stamps only the
  authors and translators that work already names, in its authors or its
  `credits`. It creates no person record for anyone else, since that person would
  be credited nowhere. A work created earlier in the same run still takes the
  project's translators. The import report lists every credit left out
  ([credits not recorded](#credits-not-recorded)).
- `copyright_year` is written only when LibriVox states a year (its `0` means
  unstated). `url_text_source` becomes `links.text` when it is `https://`.
- **Genres** map onto the vocabulary only where a counterpart is evident. A
  sub-genre is included when its own name has one:
  - a poetry form ("Sonnets") maps to `poetry`;
  - a Bible translation ("King James Version") maps to `religion-spirituality`;
  - a science branch ("Chemistry") maps to `science`.

  These are left unmapped, and named in the run's `unmapped genre strings:`
  warning:
  - period tags ("Published before 1800", "Medieval");
  - umbrella and form tags ("General Fiction", "Short works");
  - genres whose nearest entry would be a guess ("Nautical & Marine Fiction").

  The table is `librivoxGenres` in `pkg/model/librivox.go`.
- **Reported skips, never guesses.** A language name with no known code is a
  `language` refusal, never mapped to `und` or a neighbour. Teaching the importer
  the language is what lets a re-import of that id range take it. A project with
  no reader or no author is refused like any other source's row. A work match the
  rules cannot settle goes to the [worklist](#the-worklist).

#### Which work a LibriVox project joins

`routeLibrivox` (`internal/importer/librivoxmatch.go`, the author rules in
`librivoxauthors.go`) decides the work. Before it does, two steps run on the
project:

- LibriVox's repeat markers are stripped from the title (see Repeat markers,
  after the rules);
- any author or translator credit whose name slugs to nothing is filed by its
  LibriVox id or dropped (see Names that slug to nothing, after the rules).

Then these rules decide the work, in order:

1. **The ordinary identity walk**: same title, same identity authors, same
   language.
2. **Spelling variants.** Otherwise, the project joins the **one** work by the
   same authors, in a compatible language, whose title differs only by a leading
   article, punctuation, case or accents. "The Metamorphosis" joins
   "Metamorphosis" by Franz Kafka.
   - The articles set aside are the English the, a and an, French le, la, les and
     l', German der, die and das, Spanish el, los and las, Italian il and lo, and
     Dutch de, het and een. They are set aside in any language.
   - A volume number is one key however it is spelled: "Vol. 1 of 3" joins
     "Volume 1".
   - Two stated totals that differ are two volume sets. "Vol. 1 of 3" never joins
     "Vol. 1 of 5". Nor does a "Vol. 1 of 5" project join a work titled "Volume 1"
     that already holds a "Vol. 1 of 3" recording. That project is the worklist's
     `volume-total`.
   - Numbers stay apart: "Vol. 1, 2" is not "Vol. 12", and "Vol. 1" is not
     "Vol. 2".
   - Two or more such works is the worklist's `several-works`, even when one of
     them matches the credits exactly.
3. **An author spelled with more or fewer words.** Otherwise, a work under the
   project's title (rule 2's spelling) may be by an author the project spells
   differently. Then the two names are compared word by word, with case, accents
   and punctuation folded and a trailing Jr., Sr. or II-IV set aside. The **same
   surname** with one name's words a **subset** of the other's is the same
   author, provided both names carry the same generational suffix or neither
   does. Examples are "Henrietta Elizabeth Marshall" and "Henrietta Marshall", or
   "Joseph Sheridan Le Fanu" and "Sheridan Le Fanu".

   The project **attaches** to that work and credits the catalogued person, whose
   spelling the work keeps. A
   [person record](data-model.md#person---an-entry-in-the-datapeople-family)
   has no alias field, so LibriVox's spelling appears only in the run's note. The
   attach needs all of these:
   - the work is in a compatible language;
   - its authors and the project's pair one to one, each exactly or this way. The
     work credits no other author, and a collective such as "Anonymous" pairs
     only with itself;
   - nothing else under the title resembles them.

   **When LibriVox's spelling is already a person.** The project's spelling may
   itself be a person record: catalogued, keyed by the LibriVox author id the
   project states, or created earlier in the run. Then the credit is not moved.
   The project still attaches, but the credit stays with that record and its id,
   and is listed under [credits not recorded](#credits-not-recorded) for the work
   it joined. Two records of one surname are a person merge for a maintainer, not
   something an import decides.

   **The worklist instead.** Anything looser is the worklist's `author-spelling`,
   never an attach:
   - an initial ("E. Nesbit" and "Edith Nesbit");
   - another given name ("Fanny" and "Frances Burney", "Lev" and "Leo Tolstoy");
   - a one-word name ("Homer");
   - "Saint" against "St";
   - Jr. against Sr., or a suffix on one name only ("Francis Parkman, Jr." and
     "Francis Parkman", "Henry James" and "Henry James Sr."), since they are
     possibly father and son;
   - a catalogued person no credit can name (a reader record at
     `<name slug>-librivox-<reader id>`);
   - a work whose author already carries a **different** LibriVox author id from
     the project's, because LibriVox keeps the two as two people;
   - a variant beside any other candidate.

   Two variants are `several-works`. A different surname is a different author
   (rule 5).

   **Once per author id.** When the variant is a catalogued person on a catalogued
   work, the project's author id may be decided once for the whole run, before any
   project is planned. That happens only when:
   - no person carries that id yet;
   - LibriVox's spelling is not a person record;
   - the catalogued person carries no LibriVox author id;
   - every project proposing the id names the same person.

   Then every project of that id credits the catalogued person, who is keyed by
   the id, so the author's other books do not mint a second record. Otherwise each
   project is decided on its own. A work created earlier in the run is matched
   like a catalogued one. An author id that an earlier project of the run took
   counts as carried. So two spellings land the same way whether they arrive in
   one run or two.
4. **A trailing qualifier waits for a person.** Otherwise, the title's trailing
   `(...)` or `[...]` qualifiers are dropped one at a time from the end. What
   remains may match a work by the same authors under rule 2: "Frankenstein
   (1818)" beside "Frankenstein", or "Black Beauty (The Autobiography of a Horse)"
   beside "Black Beauty". Then the project goes to the worklist as
   `differently-spelled-title`, or `several-works` when more than one work
   matches.

   It is **never attached**. The qualifier may be an edition or a subtitle, but
   just as well a volume ("King in Yellow (part 1)"), and only a person can tell
   them apart.
   - Only a work whose authors fully agree holds the project back. One whose
     authors only partly agree is passed over here, leaving the project to rule 5.
   - A "Part N" outside brackets ("Anna Karenina, Book 1") is not a qualifier.
   - A mostly non-Latin title (see Mostly non-Latin titles, after the rules) skips
     this rule.
   - A repeat marker the strip left in place is dropped here like any other
     qualifier, provided it is a parenthetical and only parentheticals follow it
     (see Repeat markers).
5. **Otherwise a new work.** A same-titled work by an entirely **different**
   author is a different book (think of every "Poems"). So the project gets a work
   of its own rather than a skip. A work under the project's own title (rule 2's
   spelling) whose authors only **partly** agree with the project's is
   `author-unmatched`, decided before rule 4 is tried.

**Repeat markers.** LibriVox numbers its second and later projects of one text in
the title, and marks a cast production there too. Either is another recording of
the same text. So the marker is stripped before any rule runs, and the rules above
decide the project under the plain title. The project joins the plain-titled work
as any other project would, or creates a work under the plain title.
`librivoxTitle` (`internal/importer/librivox.go`) strips these, from the **end** of
the title only:

- a parenthetical holding `version N`, `ver N`, `ver. N` (any number, a year
  included) or `Dramatic Reading`, in any case. "version" is also matched in its
  Italian, Spanish and Portuguese spellings (`versione`, `versión`, `versão`).
  Examples: "Candide (version 2)", "Fables (Ver. 3)", "Canti (Versione 2)",
  "Eclogae (Dramatic Reading)";
- several markers in one parenthetical, bare or separated by a comma, semicolon,
  colon, hyphen or dash: "Scarlet Pimpernel (Version 3, Dramatic Reading)",
  "Dracula (version 2 dramatic reading)". A separator just before the
  parenthetical goes with it, so "Ballad of Reading Gaol, (version 2)" is "Ballad
  of Reading Gaol";
- a bare version without brackets. That is the full word (in any of the spellings
  above, never "ver") and a number of one or two digits, after a space or one of
  those separators: "Walden, Version 2", "Thief in the Night - Version 2", "Rimas
  Versión 2". A title that merely ends in a number or a year ("... Version 1611")
  is left alone, and so is a parenthetical's three-digit number ("(Version
  1611)");
- a version marker ending a parenthetical that names something else. Only the
  marker goes:
  - "Spring (Barber version 2)" is "Spring (Barber)";
  - "Sir Gawain and the Green Knight (Weston Translation Version 2)" is "...
    (Weston Translation)";
  - "Alice's Adventures in Wonderland (abridged, version 2)" is "...
    (abridged)". It is an abridged recording of the plain work, as a project
    titled "(abridged)" always is;
  - a translation whose name ends in "Version" keeps the word: "Bible (King James
    Version 2)" is "Bible (King James Version)".

The strip repeats until no marker is left at the end, so stacked markers go in any
order ("Wonderful Wizard of Oz (version 3) (Dramatic Reading)", "Emma (Dramatic
Reading), Version 2"). Anything else after a marker keeps it in the title.
"Metamorphosis (Dramatic Reading) (1915)" and "Ulysses (version 2): Circe" are
unchanged by the strip. Rule 4 then drops trailing parentheticals of any kind:

- "Metamorphosis (Dramatic Reading) (1915)" goes to the worklist when a
  plain-titled work by the same authors exists;
- "Ulysses (version 2): Circe" ends in no parenthetical, so rule 4 never reaches
  its marker.

A title is never emptied. One made of markers alone keeps its first: "(Dramatic
Reading) (version 2)" is "(Dramatic Reading)".

**Names that slug to nothing.** An author or translator whose name has no letter
the slug rule keeps (a Cyrillic "Зинаида Гиппиус") would land on the one
catch-all person record every such name shares. Instead:

- **With a LibriVox author id**, it is a person of their own at
  `librivox-author-<author id>` (`librivox-author-17538`), with the name kept as
  written (the
  [person id rule](data-model.md#person---an-entry-in-the-datapeople-family)).
  Every later project finds that person by the id, as a reader of that kind takes
  `librivox-reader-<reader id>`.
- **With no id, or when that slot is another person's or a retired one**, it is
  credited nowhere. The importer drops the credit before the work is decided, and
  lists it under [credits not recorded](#credits-not-recorded) as `unsluggable`
  once the project lands.

If the project also credits another author ("Yordan Yovkov"), its work is decided
on that author alone. When no individual author is left, the project is the
worklist's `author-unsluggable`, since a work by "Anonymous" alone would merge two
authors' same-titled books. No individual author is left when the name was the
project's only author, or when only a translator or a collective such as
"Anonymous" remains.

**Mostly non-Latin titles.** This covers a title that slugs to nothing, or one in
which more than half of the letters are not Latin script. Digits, punctuation and
spaces are not counted, and the leading article is dropped first.

- Such a title never walks a slug chain. That would file it under the shared
  "untitled" fallback, or under its Latin or number fragment ("Сборник стихов
  001" as "001").
- It is matched by rules 2 and 3 alone, on a key that keeps its own letters. So a
  second project of the same title by the same author attaches, and "The Война и
  мир" meets "Война и мир".
- Otherwise its new work is created at **`librivox-<project id>`**, titled as
  LibriVox writes it. Such a slug never merges two works. When it is already
  taken, the project is the worklist's `fallback-slug-taken`.

A title exactly half Latin ("Anna Karenina (Анна Каренина)") stays on the slug
rule. A book from any other source (libex, a user library) under the same
non-Latin title, by the same authors in a compatible language, finds that
`librivox-<project id>` work by the same key rather than minting a duplicate
beside it. A rerun is idempotent. The project id is already catalogued, so the
rerun writes nothing beyond the
[reader split](#librivox-the-public-domain-mirror) on recordings it skips.

#### One person under two LibriVox ids

LibriVox lists some people twice: two author records (F. P. Walter is 6492 and
6858, the same translation of the same Gutenberg text), or two reader accounts
(Branko Collin is 778 and 1775, with the same website on both pages). A person
record holds one `librivox_author_id` and one `librivox_reader_id`, each unique,
and an import never folds two ids by itself, so the second id is filed as a twin
record beside the first.

Once the evidence says one person:

1. Move the twin's credits onto the survivor (authors, work and recording
   `credits`, narrators, chapter `readers`) and union the two records' `sources`.
2. Retire the twin's slug in `data/redirects.json`, through `pkg/redirects`.
3. Record the second id in the survivor's `librivox_author_aliases` or
   `librivox_reader_aliases`.

An import resolves an alias exactly as it does the record's own id, whatever the
feed calls the person, so the twin is never minted again. `metacheck`:

- holds each list sorted, and each alias unique against every id and alias of its
  namespace;
- refuses a list on a record without its own id;
- refuses a retired slug of a LibriVox id form (`x-librivox-1775`) whose target
  does not answer to that id.

No import ever writes these lists. A record's slug composes from its own id, never
an alias.

Evidence of two people goes the other way: a reviewed `merge-people` rejection
in `internal/audit/reviewed.json`, which names the pair as distinct. A shared
name on its own is no evidence of either. Two bare forenames on two forum
accounts stay two records, with nothing to record.

#### The worklist

A match the rules cannot settle is **never guessed**. The project is skipped and
listed in the import report's worklist, which `metaimport librivox import`
prints. Each project is one line, with its id, title, authors, a reason code and
the catalogued works involved:

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
| `author-unsluggable` | no individual author is left once the names that slug to nothing and carry no LibriVox author id are dropped ([Names that slug to nothing](#which-work-a-librivox-project-joins), above) |
| `author-slot-taken` | as `author-unsluggable`, but an author's LibriVox id could have filed them at `librivox-author-<id>`, and that slot is another person's or a retired one. The run warns. A co-author's credit is listed under credits not recorded as `librivox-author-slot-taken`. |
| `differently-spelled-title` | the duplicate-identity guard holds the book under a title rule 2 does not read as the same, such as one with a subtitle, or the one work rule 4 matches |
| `same-name-author` | a new author id meets, by name, a catalogued person or another new id of the run. The same-name test (in the mirror's people rules, under [LibriVox: the public-domain mirror](#librivox-the-public-domain-mirror)) cannot tell them apart. Or it finds they are someone else when no record of their own can be made: the name is a collective's, or the dated or author-id slot is taken or retired. The line names a few of that catalogued person's works. |
| `volume-total` | the one work rule 2 finds holds a LibriVox recording stating another volume total than the project's title, so the work may be either volume set. An example is "Vol. 1 of 3" on a work titled "Volume 1", with the project "Vol. 1 of 5". |
| `fallback-slug-taken` | a non-Latin title's `librivox-<project id>` slug is already held by another record, or retired |

`--worklist <path>` appends the same entries to a file, one NDJSON row per
project (`librivox_id`, `title`, `authors`, `reason`, `candidates`). So a
tranche's worklist is a file to work through rather than scrollback. Once a
person has settled the work (merged the duplicates, fixed the credit),
re-importing the project's id lands it.

A `differently-spelled-title` project is also the guard's ordinary skip:

- it is counted among the run's duplicate-identity skips;
- with `--conflicts`, it writes that guard's `work_identity` row, which carries
  `librivox_id` since a LibriVox row has no ASIN;
- with `--skipped`, it is an `identity-duplicate` line keyed by `librivox_id`.

The other reasons appear on the worklist alone.

#### Credits not recorded

After the worklist, the import report lists credits for each project that landed.
A project on the worklist lists none. The list holds:

- the author and translator credits an attach leaves out, including one kept with
  its own record under rule 3;
- every author or translator credit whose name slugs to nothing. A reader of that
  kind is a person of their own, and is never listed.

Each credit is one line with:

- the project id;
- the name and its roles;
- the person's `librivox_author_id`, when LibriVox states one;
- the work the recording landed on;
- `unsluggable` for a name no record can hold, or `person not created` when no
  person record exists for the name.

```
credits not recorded: 2 (the row attached to a work that does not name them, or the name slugs to nothing and was left off; a LibriVox translator who resolves is credited on its recording instead):
  2027 "Amy Coulter" (translator, librivox_author_id 9876) -> siddhartha, person not created
  2607 "Йордан Йовков" (author, librivox_author_id 6294) -> staroplaninski-legendi, unsluggable
```

The work gains no credit for them. A LibriVox translator who resolves is credited
on its recording instead, by the recording pass. The run's
`Summary.UnrecordedCredits` carries the same rows.

**Known gap.** An author whose surname is spelled differently from the
catalogue's is a different author to these rules, so the project still creates a
duplicate work. Examples are "Publius Ovidius Naso" for "Ovid", or a misspelt
"Henrietta Marhall" for "Henrietta Marshall". The duplicates the first tranche
minted before rule 3 existed need a repair. A rerun does not undo them, since the
projects are already catalogued.

The backfill lands as human-reviewed tranches by project-id range (about 2,000
projects a pull request) under the ordinary merge policy. No automated LibriVox
lane runs yet, and `GOVERNANCE.md` holds only a stub of its future invariant.

`metacheck` enforces the identity rules the schema cannot see
(`pkg/check/librivox.go`):

- the LibriVox ids are unique;
- a chapter's `audio_url` needs its recording's `librivox_id`;
- a person's `death_year` is not before their `birth_year`.

The fields and their rules are in
[the data model](./data-model.md#recording---a-member-of-its-work-entrys-recordings-map).
Once built into the artifact, the records reach the API's
[LibriVox layer](./api.md#the-librivox-layer).

## Scanning local files: metascan

`metascan` is the low-friction path when you have only audio files and no export.
It walks a folder locally and **sends nothing anywhere**. It emits an import JSON
that the site's `/import` page accepts:

```sh
go run ./cmd/metascan /path/to/audiobooks -o scan.json
```

Per book it gathers:

- embedded tags (via `dhowden/tag`);
- the folder structure, treated as a first-class source: `Author/Book`,
  `Author/Series/Book`, and name patterns like `01 - Title` or
  `Jack Reacher 03 - Title`;
- an ASIN, hunted in tag atoms and in file and folder names;
- runtime and chapter counts, if `ffprobe` is on `PATH`.

Every field records where it came from (`tag`, `path` or `filename`) in the book's
`sources`. Unknown fields are omitted rather than guessed. Without `ffprobe` the
scan still works, but embedded ASIN and series extraction is more limited. Pass
`-ffprobe ""` to skip it entirely.

## The in-browser site tools

meta.audiosilo.app hosts two client-side helpers, so a contributor never has to
run Go tooling. The Developer Docs only note them. The end-user walkthrough is the
User Guide's [community metadata site page](/users/community/meta-site).

- **[`/import`](https://meta.audiosilo.app/import)** parses an OpenAudible,
  Libation or Audiobookshelf export, or a `metascan` folder scan, entirely in the
  browser. It **diffs it against the live catalogue**, so a contributor sees
  exactly what is new before submitting.
- **[`/build`](https://meta.audiosilo.app/build)** is a guided builder that walks a
  contributor through writing the characters or recaps sidecar for a work already
  in the catalogue.

## Authoring the expressive layer

The CC BY-SA characters and recaps layer has its own documented process. The
process documents moved with the layer to the root of the
`audiosilo-meta-community` repository, and `audiosilo-meta` keeps pointer stubs at
the old paths. The tooling they use stays in `audiosilo-meta`.

- `AUTHORING.md`: the reusable authoring process for characters and recaps. It
  covers positions, the spoiler model, the copyright length caps and the
  submission checklist.
- `EXTRACTION.md`: the epub source-to-sidecar pipeline (rolling fact pass,
  notes-only synthesis, adversarial spoiler audit), supported by
  `metaextract split` and `ngram`.
- `EXTRACTION-AUDIO.md`: the audio-only variant (chapter-isolated ASR and
  proper-noun verification). It is the process the Bridge's
  [generating](../bridge/generating.md) job automates.
- `GOVERNANCE.md` (in `audiosilo-meta`): the merge policy and contributor trust
  tiers. Schema, tooling and `.github` changes always need maintainer review
  through CODEOWNERS.

Source material and transcripts **never enter the repository**. Only the derived
CC BY-SA sidecars are committed. So, by design, you run the near-verbatim `ngram`
check locally against the source you hold.
