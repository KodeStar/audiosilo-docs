---
title: Contributing data to Meta
description: "How metadata enters audiosilo-meta: the six GitHub issue forms and the intake automation that turns them into validated bot pull requests, the advisory ai-verify layer, the OpenAudible/Libation importers, metascan, the in-browser site tools, and the authoring rules."
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

## The six issue forms

`.github/ISSUE_TEMPLATE/*.yml` are structured forms (machine-parseable field ids)
so a non-programmer can contribute without touching JSON. Each carries a
`data:<kind>` routing label that the intake workflow branches on:

| Form | Routing label | For |
|---|---|---|
| Add a work (book) and its first recording | `data:add-work` | a new book plus its first narration |
| Add a recording (narration) | `data:add-recording` | another narration of a work already in the database |
| Correct data | `data:correction` | a single-field fix to an existing record |
| Add characters (the cast) | `data:characters` | the per-work characters sidecar (CC BY-SA) |
| Add recaps (story so far) | `data:recaps` | the per-work recaps sidecar (CC BY-SA) |
| Import a library export | `data:import` | an OpenAudible / Libation / Audiobookshelf / metascan export to bulk-import |

## Intake automation: issue form to bot pull request

`.github/workflows/intake.yml` converts a submitted form into a validated bot
pull request. On a data-labelled issue it runs `metaissue`, which parses the
rendered form body into canonical records (or a single-field correction, or a
placed sidecar), **deduplicates against the existing catalogue**, and emits a
machine-readable verdict the workflow branches on:

| Verdict | Meaning | Workflow action |
|---|---|---|
| `ok` | valid new/changed records produced | opens a PR on branch `intake/issue-<n>` |
| `duplicate` | everything already exists (requires at least one skip) | labels + comments, no PR |
| `needs-human` | ambiguous - e.g. an import that produced and deduped nothing | labels for maintainer attention |
| `invalid` | the submission fails schema/validation | labels + comments with the errors |

Two behaviors are worth knowing:

- **Envelope sniffing.** For an import, `metaissue` sniffs a self-identifying
  `audiosilo-books` envelope and routes it to that importer regardless of the
  form's export-type dropdown - the file is trusted over the form. If you are
  building a tool that produces such a file, the [Import file format](./import-format.md)
  page is the producer-facing spec.
- **The `labeled` trigger is load-bearing.** The GitHub API silently drops labels
  on issues opened by non-collaborators (the sibling `audiosilo-sidecars`
  contributor tool creates intake issues over the API), so such an issue arrives
  label-less and the `opened`/`edited` runs skip it. When a maintainer later
  applies the routing label, the `labeled` trigger admits it. The job gate
  excludes the workflow's own outcome labels (`data:invalid` / `data:needs-human`
  / `data:duplicate`) so outcome-labeling can't re-fire intake.

:::note Intake runs on `issues`, not fork code
`intake.yml` triggers on the `issues` event, so there is **no fork code
execution**. The only untrusted input is the issue body and any attachment: it is
written to a file via an environment variable (never interpolated into a shell
command), parsed by `metaissue`, and never executed. Attachments are fetched
HTTPS-only from GitHub's user-attachment hosts with a size cap. The security
posture is deliberate - see [gates and CI](../contributing/gates-and-ci.md) for
the workspace-wide CI rules.
:::

## Two validation layers on a pull request

Every pull request touching `data/**` is checked twice:

- **`check.yml` (mechanical, blocking).** Runs `go build`/`vet`/`test`,
  `metacheck` (schema, id/shard agreement, referential integrity, uniqueness,
  chapter/series rules), and `metafmt --check` (canonical JSON). A red pull
  request never merges. It uses the plain `pull_request` trigger, so fork pull
  requests run with a read-only token and no secrets.
- **`ai-verify.yml` (advisory, never blocking).** An AI judgement layer on top of
  the mechanical check: it posts a `PASS` / `FLAG` comment and label but **never
  blocks a merge**. It also uses the plain `pull_request` trigger by design (not
  `pull_request_target`, which is forbidden here as the "pwn request" pattern), so
  a fork pull request gets a neutral skip notice until a maintainer pushes its
  branch to the repo or re-runs it - fork secrets are never reached. The diff is
  passed to the model as untrusted data and never executed.

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
than minting a sibling.

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

The CC BY-SA characters/recaps layer has its own documented process and tooling,
all at the root of the `audiosilo-meta` repository:

- `AUTHORING.md` - the reusable authoring process for characters/recaps:
  positions, the spoiler model, the copyright length caps, and the submission
  checklist.
- `EXTRACTION.md` - the epub source-to-sidecar pipeline (rolling fact pass,
  notes-only synthesis, adversarial spoiler audit), supported by
  `metaextract split` + `ngram`.
- `EXTRACTION-AUDIO.md` - the audio-only variant (chapter-isolated ASR +
  proper-noun verification), the process the `audiosilo-sidecars` tool automates.
- `GOVERNANCE.md` - the merge policy and contributor trust tiers
  (schema/tooling/`.github` changes always need maintainer review via
  CODEOWNERS).

Source material and transcripts **never enter the repository** - only the derived
CC BY-SA sidecars are committed, so the near-verbatim `ngram` check is run locally
against the source you hold, by design.
