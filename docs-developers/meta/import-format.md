---
title: Import file format
description: "The producer-facing spec for integrating an external tool with the meta import: the self-identifying audiosilo-books envelope, its per-book factual fields, the facts-only rules, how the importer deduplicates and identifies records, and how to submit and test a generated file."
---

This page is for authors of an **external tool** (a library manager, a tagger, a
catalogue exporter) who want the file their tool produces to import cleanly into
`audiosilo-meta`. It is the format contract; the ingestion paths, validation
layers, and authoring rules are in [Contributing data to Meta](./contributing-data.md).

If your tool works from **local audio files** rather than existing metadata, emit
the folder-scan envelope instead (see [Scanning local files](#local-files-emit-the-folder-scan-envelope)).

## Target the `audiosilo-books` envelope

Emit a single self-identifying JSON object. The `format` field is the contract:
the intake bot **sniffs it and trusts it over the submitter's dropdown**, so a
correctly-labelled file can never be misdetected as a bare OpenAudible array
(which would silently drop authors, narrators, and series).

```json
{
  "format": "audiosilo-books",
  "version": 1,
  "books": [
    { "…one flat record per book…": "" }
  ]
}
```

- `format` must be exactly `"audiosilo-books"`.
- `version` must be exactly `1` (a different version is rejected loudly rather
  than misparsed).
- `books` is an array of flat, factual per-book records (below).

The same shape is read by two mirrored consumers - the Go automated intake
(`internal/importer/audiosilobooks.go`) and the site's in-browser parser
(`site/src/lib/import-parse.ts`) - so a file that imports through the bot also
previews in the browser.

## Per-book fields

Each entry in `books` is a flat object with these keys (all snake_case). A book
is imported only if it carries a `title`, at least one author, at least one
narrator, and a recognized `language` - a book missing any of those **four
required fields is skipped** with a warning. Every other field is optional;
**omit a field you cannot verify rather than guessing a value**.

| Key | Type | Notes |
|---|---|---|
| `title` | string | **Required.** The work title. If it is already `"Title: Subtitle"`, the subtitle is split back off to form the short work title. |
| `subtitle` | string | The subtitle, when carried separately from the title. |
| `authors` | string array | **Required** (at least one). Canonical form is an array; a comma-joined string is also accepted. Names should already be clean (no trailing role qualifiers). |
| `narrators` | string array | **Required** (at least one). Same shape as `authors`. |
| `series` | string | The series name. |
| `series_position` | string | A number (`"1"`, `"2.5"`) or an omnibus range (`"1-3.5"`). If it fails the position pattern the book still imports, but is **not placed in the series**. |
| `asin` | string | The Audible ASIN. This is the **identity and dedup key**. The envelope carries no marketplace region, so a present ASIN defaults to region `us`. |
| `language` | string | **Required.** An ISO 639-1 code (`en`) or the English language word (`English`). An absent or unmappable language **skips the book**. |
| `release_date` | string | `YYYY-MM-DD`. |
| `publisher` | string | The recording's publisher. |
| `runtime_min` | integer | Total runtime in minutes (positive). |
| `abridged` | boolean | Tri-state: **omit when unknown** - present only when the source actually states it. |
| `cover_url` | string | Cover image URL. **`https://` only**; any other value is dropped. |
| `chapters` | integer | A chapter *count*, not a per-chapter array. The importer ignores it (chapter timing lives on recordings, sourced elsewhere), so it is optional and informational. |

**Not consumed.** `isbn` may appear in the shape but the bulk importer keys
identity on ASIN alone and does not map ISBN in. Any field not listed above
(genre, ratings, publisher blurb, personal listening state, local file paths) is
dropped - this is a facts-only database.

### The rules that govern the values

Both apply to every field, and both are enforced downstream:

- **Facts only, never fabricated.** Emit only values your source actually
  provides. If a fact is not known, omit the optional field - do not invent an
  ASIN, a date, or an abridged flag.
- **No marketing or personal data.** Publisher copy, genres, ratings, star
  counts, and per-user state are not imported even if present, so there is no
  value in emitting them.

## A minimal valid file

```json
{
  "format": "audiosilo-books",
  "version": 1,
  "books": [
    {
      "title": "Fugitive Telemetry",
      "authors": ["Martha Wells"],
      "narrators": ["Kevin R. Free"],
      "series": "The Murderbot Diaries",
      "series_position": "6",
      "asin": "B08XYZ1234",
      "language": "en",
      "runtime_min": 273,
      "release_date": "2021-04-27",
      "publisher": "Recorded Books"
    }
  ]
}
```

## What the importer does with it

When the file is ingested, each book runs through the shared importer pipeline,
so the same identity and dedup rules apply as any other import (full detail under
[bulk importers](./contributing-data.md#bulk-importers-metaimport)):

- **ASIN dedup.** A book whose ASIN already exists in the catalogue is skipped.
  An import that produces no new records **and** dedupes nothing is flagged
  `needs-human`, not `duplicate` - usually a sign the file did not match its
  declared format.
- **Work identity** is (title slug + author set), with per-volume disambiguation
  so distinct series volumes never merge into one work.
- **ASIN merge.** A same-work, same-narrator entry whose only new fact is another
  ASIN merges that ASIN into the existing recording (guarded by runtime and
  abridged deltas) rather than minting a duplicate recording.
- **Edition markers.** A trailing `(Unabridged)`/`(Abridged)` in the title is
  stripped before identity and, if `abridged` was not set, seeds the recording's
  tri-state abridged flag.

## Submitting a generated file

The file is attached to the **Import a library** issue form
(`data:import`). The intake workflow sniffs the envelope, runs it through the
importer, and - on a clean result - opens a bot pull request with the canonical
records for review. See
[Intake automation](./contributing-data.md#intake-automation-issue-form-to-bot-pull-request)
for the verdicts and the pull-request flow.

Your tool can also create that issue over the GitHub API. Note that the API drops
labels on issues opened by non-collaborators, so an API-created intake issue
arrives label-less and waits for a maintainer to apply the routing label before
the workflow admits it (the `labeled` trigger handles this). The sibling
`audiosilo-sidecars` tool submits this way.

## Testing before you submit

- **In the browser, offline.** Drop the file on
  [`/import`](https://meta.audiosilo.app/import). It runs the same parser and
  **diffs against the live catalogue**, so you see exactly what is new. Nothing
  leaves the device.
- **Locally, end to end.** The envelope is ingested through the intake tooling
  rather than a dedicated `metaimport` subcommand;
  `internal/importer.IsAudiosiloBooksEnvelope` is the cheap format check and
  `RunAudiosiloBooks` performs a real import (pass a dry-run to plan without
  writing).

## Local files: emit the folder-scan envelope

If your tool inspects audio files directly (tags, `ffprobe`) rather than
re-exporting existing metadata, target the folder-scan envelope instead - it is
the same idea with per-field provenance, which is what a scanner can honestly
supply:

```json
{ "format": "audiosilo-folder-scan", "version": 1, "books": [ "…" ] }
```

This is the shape `metascan` produces (see
[Scanning local files](./contributing-data.md#scanning-local-files-metascan)); the
`pkg/scan` package is the reference producer. Each book records where every field
came from (`tag` / `path` / `filename`), and unknown fields are omitted rather
than guessed - the same facts-only rule, expressed through provenance.
