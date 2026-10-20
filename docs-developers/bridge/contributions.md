---
title: Contributions
description: "Bridge Phase 2b end to end: the Accounts tab (the AudioSilo Contributions GitHub App's device flow, expiring tokens refreshed with the client ID alone, sign-out by revoke, the agent credentials), the page's /api/accounts routes, sidecars.contribute (sharing a book's kept characters and recaps later) and meta.correct (an admin's edits as one correction-batch issue), with what the server checks and what the console shows."
---

Phase 2b lets a server send what it knows back to the community metadata
database, always through the Bridge (decisions 18 and 19: every write to meta goes
through the Bridge, which holds the GitHub credential; decision 8: the server never
calls the Bridge). Three parts:

- **Accounts** on the Bridge's page: a GitHub sign-in to file as, and the agent's
  credential (handed to the agent container per run, see
  [The credential hand-off](agent-container.md#the-credential-hand-off)).
- **`sidecars.contribute`**: share a book's characters and recaps that a run kept
  local, without generating again.
- **`meta.correct`**: file an admin's edits of a matched book's details as one
  correction-batch issue.

Both kinds, and `sidecars.generate` with `contribute: "issue"`, belong to the
server's `contributions` [module](../server/modules.md): see
[Jobs of a managed module](pairing-and-jobs.md#jobs-of-a-managed-module). What
meta does with the issues is in
[Contributing data](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app).

## The GitHub sign-in

The Bridge signs in to the **AudioSilo Contributions** GitHub App (id `5387686`,
slug `audiosilo-contributions`; the App and its settings are in
[Configuration](configuration.md#contributing-github)) with the **device flow**,
which needs only the App's public client ID. The code is the Bridge's
`internal/ghauth` (a leaf: standard library only, every base URL injectable) and
`internal/accounts`.

- **Starting** (`POST /api/accounts/github/device`, `accounts.GitHub.Start`):
  `RequestCode` asks GitHub for a device code; the page shows the `user_code`, the
  `verification_uri` and `expires_at`, and the Bridge polls in the background, one
  flow at a time (a new one, or a sign-out, ends the one before, which then stores
  nothing).
- **Polling** (`Poll`, `Wait`): GitHub answers every poll **HTTP 200**, with an
  `error` while it isn't done. `authorization_pending` polls on; `slow_down` adds
  5 seconds to the interval; `expired_token` and `token_expired` end the flow as
  expired, `access_denied` as denied. A poll GitHub doesn't answer (unreachable,
  a 5xx or a 429) adds 5 seconds and polls on until the code expires.
- **Tokens.** The answer is a `ghu_` user token (8 hours) and a `ghr_` refresh
  token (6 months). `User` (`GET /user`) reads the login. The pair and both
  expiries are sealed as **one** vault value, `github_user_token`.
- **Refreshing** (`accounts.GitHub.Token`): before the access token expires the
  Bridge refreshes it with the client ID alone (`grant_type=refresh_token`, no
  secret). A refresh ends the old pair at once, so it is **single-flight**, the new
  pair is **persisted before it is used**, and the refresh is detached from its
  caller (a page request that goes away mid-refresh would otherwise lose the
  rotated pair). **Any** error GitHub answers is `ErrBadRefresh` (a spent refresh
  token answers `incorrect_client_credentials`) and refuses the sign-in; a refresh
  GitHub didn't answer keeps the pair (the access token serves until it expires)
  and is tried again a minute later. Once the access token has expired as well,
  `Token` answers `accounts.ErrUnrefreshed` (wrapping the refresh's error), and
  `contrib.TokenSource.Resolve`, with no environment token or `gh` to fall back
  on, answers `contrib.ErrSignInUnrefreshed`. That is an `ErrNoCredential` for
  `errors.Is`, so a caller that only asks whether a token resolves treats it as
  none, but each place a person reads it words it apart from "not signed in"
  (below): waiting until GitHub can be reached ends it, not a new sign-in.
- **Refused and OK.** A `401` on the current device token marks the account
  refused (`refused_at`, `last_error`), which drops `can_contribute`. A 401 on a
  token a refresh has since replaced is ignored, and so is one on a token already
  past its own expiry (served while GitHub couldn't be reached to refresh it): the
  refresh decides then, and a revoked sign-in is still refused through it
  (`ErrBadRefresh`). A REST call that works moves
  `last_ok_at` (`contrib.NewClientFor` wires both hooks); it never ends a refusal,
  only a new sign-in does.
- **Signing out** (`DELETE /api/accounts/github`, `SignOut`): ends a flow in
  progress and deletes the sign-in here first (the vault value and the accounts
  row), then `POST https://api.github.com/credentials/revoke` with both tokens and
  no auth (`202`), best effort: a revoke that fails leaves the sign-in deleted, and
  the answer's `revoke_error` says so for the page to show as a warning. The page's
  manage link (`manage_url`, `https://github.com/settings/apps/authorizations`)
  shows only while signed in.

A sign-in that changes (signed in, signed out, refused) kicks a heartbeat, so the
console's Setup card and the `contribute` feature follow within seconds, and
re-admits the books parked `contrib_unavailable` once the Bridge can contribute.
A book parked there while signed in (the sign-in's refresh couldn't reach GitHub)
sees no change, so it waits for **Retry**.

While the sign-in can't be refreshed nothing resolves, so the Bridge reports it
as unable to share until a refresh succeeds (the next token request a minute
later, the heartbeat's own included): the heartbeat's `can_contribute` (and the
estimate's) is false, so the console's Setup card shows **GitHub signed in** still
to do, **GitHub account** as **Not signed in** and **Contributing** as **Not
ready**, and offers no share, no Suggest corrections and no contribute switch.
The Accounts tab keeps its **Signed in** badge with **Sharing uses** "None: the
Bridge can't share with the community". Neither says that GitHub is unreachable;
only the job failures (below) and the `contrib_unavailable` park do.

The `accounts` table (migration `0006`) keeps only what the page shows, never a
credential: `provider` (`github`, `agent`, or `agent/<kind>`, which keeps when that
kind was set), `login`, `signed_in_at`, `last_ok_at`, `refused_at`, `last_error`.

`performed_via_github_app` on an issue proves only that it was filed with a token
of this App, which anyone can get: meta treats it as a routing hint and validates
every body.

## The page's routes

On the Bridge's page API (the page's session, like every other route; see
[Development](development.md#the-page-and-its-api)). **No route ever answers a
credential back.**

| Route | What it does |
|---|---|
| `GET /api/accounts` | `{github, agent}` |
| `POST /api/accounts/github/device` | starts a sign-in; answers `{user_code, verification_uri, expires_at}` |
| `DELETE /api/accounts/github` | signs out (also ends a sign-in in progress); answers `{accounts, revoke_error}` |
| `PUT /api/accounts/agent` | `{kind, value}`: seals one agent credential; answers the accounts |
| `DELETE /api/accounts/agent?kind=` | removes one kind (`""` for all); answers the accounts |

`github`: `available` (a client ID is configured: always, as an empty
`github.client_id` falls back to the built-in one), `signed_in`, `refused`,
`login`, `signed_in_at`, `last_ok_at`, `last_error`, `pending` (the code above, or
`null`), `flow_error` (why the last flow ended without a sign-in), `env_token`
(`AUDIOSILO_BRIDGE_GITHUB_TOKEN` is set; it wins unless GitHub refused it), `from`
(the token used now: `env`, `device`, `gh` or `""`), `can_contribute`,
`manage_url`.

`agent`: `backend`, `kinds` (the kinds that backend takes, in the order it uses
them: `claude_oauth_token`, `anthropic_api_key` for claude; `openai_api_key` for
codex), `set` (kind to boolean), `set_at` (when the set last changed: a save, or
a removal that left others), `set_at_by_kind` (Phase 2b, additive: each held
kind's own save time; a kind saved before per-kind rows existed is left out),
`available`, `detail`, `handoff` (the runs get the Bridge's credential) and
`container_credential` (the kind the container has of its own, which wins; `""`
for none). A value must be one
printable line without spaces, at most 2048 bytes (`ErrInvalidCredential`, said
without the value). Changing a credential resumes the books and description
jobs parked `agent_credential_refused` and `agent_unavailable`
([Parks](generating.md#parks)).

The page's Accounts tab (`web/src/components/tabs/AccountsTab.tsx`,
`web/src/lib/accounts.ts`) polls every 3 seconds only while a sign-in is pending.
Each agent field says **Set** with that credential's own saved time
(`set_at_by_kind`), and the GitHub card says the App opens issues, plus a secret
gist when a characters or recaps file is too long for an issue.

## Sharing later: `sidecars.contribute`

"Share with the community" after a run kept on the server (decision 17). Family
`sidecars`; a book `path` required; it **writes nothing** into the library.

**The server** (`bridge/contribute.go`) takes params strictly:
`{work_id?, dimensions?}`, `dimensions` from `characters` and `recaps`, each once,
stored in that order (absent or empty means both); a `work_id` at most 200 bytes,
no control characters. It is refused `409 generate_open` while a
`sidecars.generate` job is open for the book, and a new generate job is refused
`409 contribute_open` while a contribute job is queued or working; it cancels a
parked one, or a queued one held while the `contributions` module is off ("a
generate job for the book replaced what it was sharing").

**The Bridge** (`generate/contributejob.go`, light lane) reads its params
leniently (a later server's field ignored), then:

1. finds the book through the library's mapping without needing it writable
   (`prepareRead`);
2. finds the **engine book** that keeps the results (`notesBook`: the sidecars
   survive the transcript purge) and holds it, so no stage runs on it meanwhile;
3. `pipeline.Executor.Share` files them the way the contributing stage does in
   issue mode, with no agent and no spend. The work is the job's `work_id` (a
   retired slug followed to its survivor and recorded on the book), else the
   Bridge's own match for the engine book (the console sends no `work_id`), else
   the engine book's exact identifiers; an unmatched book fails ("Match the book
   first"): a share never proposes a new work. A dimension counts as filed only
   when its row is `submitted`, `pr_open` or `merged` (a local export, a `covered`
   verdict or a closed issue is filed again); one already filed is kept and
   reported. A dimension the community already has is `covered`. Each
   dimension's gist and issue are guarded against a second filing across shares
   and the contributing stage's retries. A filing marker is recorded before each
   create (`contrib.filing/<book id>/<kind>`), timed by `Client.Now`: GitHub's
   clock, learned from the `Date` of its answers (the Bridge's own while GitHub
   hasn't answered). A create GitHub refused, or one that never left
   (`contrib.NothingFiled`), clears its time from the marker. The next submit
   then:
   - adopts the gist or issue the user made since the marker, less
     `contrib.FilingSkew` (`GistsSince`, `IssuesSinceBy`; the rows of pages read
     before one that failed count too);
   - files again when GitHub's list is complete and holds none (for an issue, also
     only once the marker is a minute old, `contrib.FilingSettle` through
     `Client.Settling`: GitHub may still be making it; an issue edited since doesn't match, so it is filed again);
   - files again (`refileStale`, logged) when the list can't reach back to the
     marker (`contrib.ErrListIncomplete`: the list since the marker only grows, so
     no later lookup settles it) and the marker is over 24 hours old by GitHub's
     clock (`contrib.FilingStale`; `Client.StaleFiling` is false until GitHub has
     answered that submit): meta's intake sends a member the work already has to
     a maintainer, and nothing on the page clears a marker;
   - otherwise (a refusal, a rate limit, an outage, a cancel) fails the share
     (`ErrFilingUnknown`) with the marker kept, whatever its age; a `401` there
     is worded as the refused sign-in (below).

Result:

```json
{
  "library_id": 1, "path": "Jack London/The Call of the Wild", "work_id": "the-call-of-the-wild",
  "contributed": { "characters": "https://github.com/KodeStar/audiosilo-meta-community/issues/41" },
  "covered": ["recaps"]
}
```

Failures, worded for the console: not signed in ("The Bridge isn't signed in to
GitHub: sign in on the Bridge's Accounts tab, then share the book again."), signed
in but the sign-in couldn't be refreshed ("The Bridge's GitHub sign-in couldn't be
refreshed because GitHub couldn't be reached: share the book again once it can.";
told apart before the share starts through `Options.ContribCredential`, and when
filing parks `contrib_unavailable` from the park's `Cause`, the resolve error, so
never from the reason's text), GitHub refused the sign-in
("sign in again on the Bridge's Accounts tab, then share the book again"), nothing
kept here ("it was not generated here, or they were removed"), a generate job
still running, not matched, and an earlier share that stopped while filing when
the Bridge can't yet tell whether GitHub made the issue or the gist it links ("so
it filed nothing more: share the book again in a few minutes, and if this keeps
happening, look for the issue on the community repository"). A finished job
whose `contributed` is empty and `covered` isn't is "Already in the community" in
the server's notification (`bridge.Job.SharedNothing`).

**The console** (`features/bridge/share-section.tsx`, `shareOffered`) offers it in
the book's Community card only while the module's flag is on, an online Bridge
offers `sidecars`, the brief estimate's `can_contribute` is true and the community
answered, no generate or contribute job is open, and only for the dimensions the
book has locally, the community lacks and no earlier job contributed
(`contributedLinks`). An existing share job shows with its Cancel whatever the
flag says.

## Corrections: `meta.correct`

"Suggest corrections" (decision 18, CORRECTIONS-SPIKE sections 4.1 and 5). Family
and feature `meta`; a book `path` required; it writes nothing into the library.

**Params** (strict, `bridge.CheckCorrect`; the bounds are in the
[API reference](../server/api/reference.md#post-apiv1adminbridgejobs), the field list is
`bridge.CorrectionFields`):

```json
{
  "work_id": "project-hail-mary",
  "recording_id": "ray-porter-2021",
  "asin": "B08G9PRS1K",
  "changes": [ { "field": "title", "current": "Project Hail Mar", "corrected": "Project Hail Mary" } ],
  "evidence": "Corrected in an AudioSilo server library (audiosilo-server 2.5.0).",
  "source": "ignored: the server stamps it"
}
```

Beyond the reference: in the changes' values and the evidence a control character
is `unicode.IsControl` (C1 included; the identifiers refuse C0 and DEL only), and both it and a bidirectional control
(`isBidiControl`) are looked for in the text with its character references
decoded the way the community's issue form reads them (`checkProse` on
`decodeRefs`, mirroring audiosilo-meta's `issueform` `formValue`: each numeric or
named HTML reference ending in `;` decoded, one naming whitespace read as a space,
one that decodes to more than two characters left as written; GitHub shows the
evidence's decoded too). The server (and the console) also decode an upper-case
`&#X...;`, which meta's form leaves as written, on purpose: GitHub shows it
decoded, so re-aligning `decodeRefs` with `formValue` must keep `[xX]`. A
reference is ASCII, so this covers the characters as written as well, and
`&#x202E;` is refused like the character itself. Only references to the other
C0 characters, DEL and the C1 points Windows-1252 leaves unmapped (0x81, 0x8D,
0x8F, 0x90, 0x9D) count as control characters: one to whitespace reads as a
space, `&#0;` as U+FFFD, and the rest of 0x80-0x9F as Windows-1252 characters. The lengths (500, 2000) count the text as written, trimmed,
before decoding. The decoded text isn't trimmed again, so a U+0085 before a
trailing `&#32;` (which a trim after decoding would drop) is refused. A `corrected` value is then read as the community reads it, decoded
and trimmed (`asRead`), and compared with `current`, which is taken as the record
spells it: one that so reads as nothing or as `current` changes nothing and is
refused (a corrected `Tom &amp; Jerry` reads `Tom & Jerry`: refused against a
current `Tom & Jerry`, a correction of a current `Tom &amp; Jerry`). An `evidence`
of exactly `_No response_` (the form's blank field), or one that reads as nothing,
is "evidence is required". `evidence` keeps its line breaks (CRLF stored as LF)
and tabs, and stays within 2000 characters both as written and as the issue
carries it (`issueLength`: a line starting with `#` loses its indent and gains a
backslash); `asin`, `isbn` and `region` (the marketplace the ASIN sells in) say
how the book was found.

What the Bridge would refuse when filing is a `400` here, except a `work_id` the
community doesn't have: the server checks it only as text (at most 200 bytes, no
control characters), and such a job fails on the Bridge. Then the handler's
`checkCorrections` (security-relevant: the server files only an admin's own
edits) requires each change's field to be **edited** on the book
(`catalog.SourceEdited`: never a scanned, path, ABS or accepted-community value)
with `corrected` equal to the book's value now (`MatchState.EditedValue`), else
**`400 not_edited`** naming the `field`. It stores the book's own spelling of each
corrected value and stamps `source` as `audiosilo-server/<version>` whatever
well-formed `source` was sent (at most 128 bytes, no control characters). Only the
corrected values are bound to the book: `current` and the records the job names
(`work_id`, `recording_id`, `asin`, `isbn`, `region`) are the caller's (the console
sends the book's community match).

**The Bridge** (`internal/correct`, light lane; `ParseParams` strict, `work_id`
required, an unknown field refused, the params at most 64 KiB as the server
stores them, which a batch at every server bound fits; `MapCorrections` bounds
the batch again as meta does: see the workspace CROSS-REPO.md §23 before raising
a bound or adding a field):

1. resolves the GitHub credential before reading anything: none fails `errNoCredential` ("The
   Bridge isn't signed in to GitHub: sign in on the Bridge's Accounts tab, then
   suggest the corrections again."), a sign-in that couldn't be refreshed
   (`contrib.ErrSignInUnrefreshed`) fails `errUnrefreshed` ("The Bridge's GitHub
   sign-in couldn't be refreshed because GitHub couldn't be reached: suggest the
   corrections again once it can.");
2. reads the work's live coverage (`metaops.FreshCoverageForWork`; `errMetaOff`
   when its `metadata.base_url` is off) and picks the recording: the job's
   `recording_id`, else the one recording that lists the job's ASIN (in its
   `region`, when given) or ISBN; none, or several, is no recording;
3. maps the changes onto meta's batch vocabulary (`contrib.MapCorrections`):

   | Server field | Meta record and field | Applied by |
   |---|---|---|
   | `title` | work `title` | meta's bot |
   | `author` | work `authors` | a maintainer |
   | `series`, `series_index`, `more_series` | work `series`, `series_index`, `more_series` | a maintainer |
   | `published` | recording `release_date` | meta's bot |
   | `isbn` | recording `isbn` (added) | meta's bot |
   | `narrator` | recording `narrators` | a maintainer |

   The series fields go to the work, which meta's batch form takes, not to the
   series record's `works[]` entry the spike drew (section 5). A recording field
   with **no recording** is addressed to the work, and meta hands it to a
   maintainer (who finds the recording). Anything else (an unknown
   field, a duplicate field (two distinct ISBNs excepted), a value past the
   bounds) is `ErrInvalidCorrection` for the whole issue;
4. composes the issue (`contrib.CorrectionBatchIssue`, meta's form rendered
   verbatim): title `[corrections] <work title>`, labels `data` and
   `data:correction-batch`, sections **Record** (the work's page on
   meta.audiosilo.app), **Changes** (fenced JSON
   `{"v": 1, "source": "...", "changes": [{record, field, current, corrected}]}`,
   every change naming its record), **Evidence / source** and the ticked CC0
   dedication;
5. files **one** issue on the core repository (audiosilo-meta) with the GitHub
   token, and reads no labels back: an issue filed with the Accounts sign-in (the
   App's token) is labelled by meta's `route.yml`, while one filed with
   `AUDIOSILO_BRIDGE_GITHUB_TOKEN` or `gh` by an account that can't label there
   arrives without labels and waits for a maintainer.

**Guarded against filing twice, per request.** A job's result is kept under
`meta.correct/<server id>/<job id>`, so a resumed job (the same job run again
after a restart) returns it. The filing itself is guarded per **request**, not per
job or book: before `CreateIssue` a marker `{since, sum, job}` (`since` GitHub's
time from `Client.Now`, `sum` the `contrib.IssueSum` of the title and body sent)
goes into the Bridge's store under `meta.correct.filing/<server id>/<request>`,
the request being what the admin asked to change (`filingKey`): the sha256 of the
record and the changes as a set of `{field, corrected}`, sorted. The record is
the `work_id` and the `recording_id` when there is one, else the ASIN, ISBN and
region that pick the recording, in the forms `ParseParams` gives them (the ASIN
upper case, the region lower case). The evidence, the server's `source` stamp,
each change's `current` value and the order of the changes don't count: the
dialog starts from its default evidence each time it opens
(`book.corrections.evidencePrefill`, which names the server's version, in the
admin's language). So the job resumed, or a new job asking for the same changes
(the admin suggesting them again after a lost answer, whatever the evidence says
now and wherever the book is on disk), finds the marker. Another field, another
corrected value (editing the book's title changes its row's), or a change added
or dropped is a new request and files again. So is a retry after the community
applied some of the rows between the lost answer and the retry: the console
offers only the rows that still differ, so its change set shrinks (an accepted
duplicate, below). The
marker is deleted only while it is still the one the run wrote or
adopted (`clearFiling`): once the filed or adopted issue is recorded as the job's
result (a failed result write keeps it, so the job resumed adopts the issue), when
nothing can have been filed (`contrib.NothingFiled`: a 4xx answer, a rate limit,
or a request that never left), or once a person has been told the Bridge can't
tell (below). A 5xx, which can come after the issue was made, a timeout or a lost
answer (the client never resends a POST) keeps it and fails the job
`errNoAnswer` ("GitHub didn't confirm the issue ... suggest them again in a
minute"). The user guide quotes these failures word for word
([Suggest corrections](/users/admin/bridge#suggest-corrections)).

A run that finds a marker lists the core repository's issues made since its time
less `contrib.FilingSkew` (`contrib.IssuesSince`: the list endpoint, not search,
which lags; the rows of pages read before one that failed count too) and:

- adopts a `[corrections]` issue whose sum is the job's or the marker's, wherever
  it is in the list. The marker's is the request as composed then: the title is
  the work's live title, so a title correction meta's bot applied since (or a
  recording that took the ASIN since) changes what the run composes now, and so
  does other evidence or a new `source` stamp. The job that wrote the marker
  (resumed) can always adopt the marker's sum; another job only while the marker
  is under a day old by GitHub's clock (`contrib.FilingStale`). Later the same
  changes suggested again are no retry of the lost answer (whose issue may be
  closed by then): that issue reads as a same-record batch (below) and the
  person is told once;
- on a `401` (`contrib.Unauthorized`, even past a same-record batch on a page read
  before) fails `errRefused` (sign in again on the Accounts tab), and on a rate
  limit `errRateLimited`, the marker kept either way;
- when the list is complete back to the marker and holds nothing, but the marker
  is under a minute old by GitHub's clock (`contrib.FilingSettle`,
  `Client.Settling`: GitHub may still be making the issue), fails `errSettling`
  ("suggest them again in a minute");
- for a batch with the same **Record** (the work's page, whatever the recording)
  and another body (`otherBatch`: anyone's, filed by hand or from another server,
  or its own edited since) fails asking the admin to look for a `[corrections]`
  issue first (`errFiledBefore`), whatever the marker's age. It is said once only
  when the list was read back to the marker whole and the marker has settled:
  then the marker goes, so the next suggestion files. Otherwise the marker stays
  and the next suggestion is told again. A marker with no time to look from is
  told the same way, once, before anything is read;
- files when the list is complete back to the marker and holds none;
- for any other lookup failure (unlike a share's, also a list it can't read at
  all) fails `errFiledBefore` with the marker kept, until the marker is over 24
  hours old by GitHub's clock (`contrib.FilingStale`; `Client.StaleFiling` is
  false until GitHub has answered that run): then it files again.

meta's intake labels a batch whose every change the record already holds
`data:duplicate`; one with a field a maintainer applies reaches a maintainer
again. On the create, GitHub's refusal (a 4xx, a rate limit) clears the marker,
since nothing was filed: a `401` fails `errRefused`, a rate limit
`errRateLimited`, and any other refusal "could not file the corrections: ...".
Duplicates stay possible, accepted, and meta's intake catches a batch already
applied: the same corrections suggested again after they were filed (a confirmed
filing clears its marker, and the console unticks only the rows of the book's
last done job), a new request (a change added, dropped or corrected
differently) that repeats changes already filed, among them a retry after the
community applied some of the rows since the lost answer (the console's change
set shrinks), a refile once the marker is
over 24 hours old, the
next suggestion after an `otherBatch` that was the run's own issue edited since,
and a POST still in flight after the one-minute settle when the lookup finds
nothing.

Result:

```json
{ "issue_url": "https://github.com/KodeStar/audiosilo-meta/issues/2701", "issue_number": 2701,
  "changes": 2, "auto": ["title"], "maintainer": ["narrator"] }
```

`auto` and `maintainer` are as known at filing. The Bridge doesn't follow the
issue, so a batch meta applies only in part isn't reported back (deferred).

**The console** (`features/book/corrections-dialog.tsx`, `corrections-model.ts`)
offers **Suggest corrections** in the Community card (`correctionsOffered`) while
the module's flag and `capabilities.metadata` are on, the online Bridge lists the
`meta` feature, the book is matched with an ASIN or ISBN, and an edited
correction field holds a value (`isbn` only beside an ASIN: without one the ISBN
is how the community finds the book); `CorrectionsSection` also holds the offer
back while a corrections job for the book is open, showing its status instead. The dialog looks the book up by ASIN, else
ISBN (`matchBook`), takes the candidate the identifier resolved, diffs the edited
values against the community's (`communityValues` for that recording;
`published` against the recording's release date, and no change when it is the
same as, or less precise than, that date or the work's first publication; an
ISBN the recording already lists is no change), ticks each sendable row not suggested by the book's last
corrections job, badges it **Applied automatically** or **Reviewed by a
maintainer** (`handling`: a recording field is automatic only when the identifier
names the recording, `correctionRecording`), requires the evidence (prefilled)
and queues one `meta.correct`. The job's status and issue link show in the same
card part. The server enforces the 25-change cap and the kind's params cap
([API reference](../server/api/reference.md#post-apiv1adminbridgejobs)), which a
batch at every bound fits. The dialog runs the server's checks (above) on each
value and the evidence, so it never sends what would get the `400`: `decodeRefs`
mirrors the server's (numeric references as Go's `html` decodes them, named ones
through the browser's own HTML parser, `&nLt;` and `&nGt;` left as written as Go
leaves them) and `goTrim` trims as Go's `strings.TrimSpace` does.

- A row is left unticked, its box disabled (`sendable`), with the first flag in
  the order `tooLong`, `control`, `bidi`, `noChange` (`refusal`) shown as
  `book.corrections.<flag>`: a value over 500 characters, a control character or
  a bidirectional control (U+202A-U+202E, U+2066-U+2069) as written or as a
  character reference that reads as one (above), or a corrected value that reads as the community's value or
  as nothing.
- An evidence problem stops **Suggest N corrections** sending anything
  (`correctionProblem`, shown as `book.corrections.<problem>`): `noEvidence`
  (blank, `_No response_` or reading as nothing; shown once **Suggest N
  corrections** has been pressed), `evidenceTooLong` (over 2000 characters as
  written or as the issue carries it, `issueLength`), `evidenceControl` (a
  control character other than a line break or a tab, written or as a reference
  that reads as one) and `evidenceBidi`.

The dialog's header clamps the book's title to two lines (`line-clamp-2`, the
whole title in its `title` attribute and read out), so a long title never
squeezes the review on a phone.

## Notifications

The server words the new kinds itself (`internal/notify`, `bridge_job_finished`
with `shared_nothing`, and the `contrib_unavailable` park): see
[Notifications](../server/backups-and-notifications.md#events).
