---
title: Contributions
description: "How a server sends what it knows back to the community metadata database through the Bridge: the Accounts tab (the AudioSilo Contributions GitHub App's device flow, expiring tokens refreshed with the client ID alone, sign-out by revoke, the agent credentials), the page's /api/accounts routes, sidecars.contribute (sharing a book's kept characters and recaps later) and meta.correct (an admin's edits as one correction-batch issue), with what the server checks and what the console shows."
---

A server can send what it knows back to the community metadata database, always
through the Bridge. Every write to meta goes through the Bridge, which holds the
GitHub credential, and the server never calls the Bridge (decisions 18, 19 and 8).
There are three parts:

- **Accounts** on the Bridge's page: a GitHub sign-in to file as, and the agent's
  credential. The Bridge hands the credential to the agent container for each run
  (see [The credential hand-off](agent-container.md#the-credential-hand-off)).
- **`sidecars.contribute`** shares a book's characters and recaps that a run kept
  local, without generating again.
- **`meta.correct`** files an admin's edits of a matched book's details as one
  correction-batch issue.

Both kinds, and `sidecars.generate` with `contribute: "issue"`, belong to the
server's `contributions` [module](../server/modules.md). See
[Jobs of a managed module](pairing-and-jobs.md#jobs-of-a-managed-module). What
meta does with the issues is in
[Contributing data](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app).

## The GitHub sign-in

The Bridge signs in to the **AudioSilo Contributions** GitHub App (id `5387686`,
slug `audiosilo-contributions`) with the **device flow**, which needs only the
App's public client ID. The App and its settings are in
[Configuration](configuration.md#contributing-github). The code is the Bridge's
`internal/ghauth` (a leaf: standard library only, every base URL injectable) and
`internal/accounts`.

### Starting and polling

- **Starting** (`POST /api/accounts/github/device`, `accounts.GitHub.Start`).
  `RequestCode` asks GitHub for a device code. The page shows the `user_code`, the
  `verification_uri` and `expires_at`, and the Bridge polls in the background.
  Only one flow runs at a time. A new flow, or a sign-out, ends the one before,
  which then stores nothing.
- **Polling** (`Poll`, `Wait`). GitHub answers every poll with **HTTP 200**, with
  an `error` while it isn't done:

  | `error` | What the Bridge does |
  |---|---|
  | `authorization_pending` | polls on |
  | `slow_down` | adds 5 seconds to the interval |
  | `expired_token`, `token_expired` | ends the flow as expired |
  | `access_denied` | ends the flow as denied |

  A poll GitHub doesn't answer (unreachable, a 5xx or a 429) adds 5 seconds, and
  the Bridge polls on until the code expires.
- **Tokens.** The answer is a `ghu_` user token (8 hours) and a `ghr_` refresh
  token (6 months). `User` (`GET /user`) reads the login. The Bridge seals the
  pair and both expiries as **one** vault value, `github_user_token`.

### Refreshing

Before the access token expires, `accounts.GitHub.Token` refreshes it with the
client ID alone (`grant_type=refresh_token`, no secret). A refresh ends the old
pair at once, so:

- the refresh is **single-flight**;
- the new pair is **persisted before it is used**;
- the refresh is detached from its caller, because a page request that goes away
  mid-refresh would otherwise lose the rotated pair.

How the Bridge reads the answer:

- **An OAuth `error` code**, whatever the HTTP status, is `ErrBadRefresh` and
  refuses the sign-in. A spent refresh token answers
  `incorrect_client_credentials`.
- **Any other failure counts as no answer**: GitHub unreachable, a non-2xx without
  an OAuth error, or an answer that isn't JSON or carries no token. The Bridge
  keeps the pair (the access token serves until it expires) and tries again a
  minute later. If GitHub took a refresh but its answer was lost, the pair is
  spent, so that next try refuses the sign-in.

Once the access token has expired as well, `Token` answers
`accounts.ErrUnrefreshed`, wrapping the refresh's error. With no environment token
or `gh` to fall back on, `contrib.TokenSource.Resolve` then answers
`contrib.ErrSignInUnrefreshed`. That is an `ErrNoCredential` for `errors.Is`, so a
caller that only asks whether a token resolves treats it as none.

The job failures (below) and a park's reason on the Bridge's Jobs tab word this
apart from "not signed in", because waiting until GitHub can be reached ends it,
not a new sign-in. The console's park line, the bell and the notification go by
the park code alone, so one sentence covers both causes.

### Refused, OK and signing out

- **Refused.** A `401` on the current device token marks the account refused
  (`refused_at`, `last_error`), which drops `can_contribute`. The Bridge ignores a
  401 on a token that a refresh has since replaced. It also ignores one on a token
  already past its own expiry, served while GitHub couldn't be reached to refresh
  it. The refresh decides then, and a revoked sign-in is still refused through it
  (`ErrBadRefresh`).
- **OK.** A REST call that works moves `last_ok_at` (`contrib.NewClientFor` wires
  both hooks). It never ends a refusal; only a new sign-in does.
- **Signing out** (`DELETE /api/accounts/github`, `SignOut`). The Bridge ends a
  flow in progress and deletes the sign-in here first (the vault value and the
  accounts row). Then it sends `POST https://api.github.com/credentials/revoke`
  with both tokens and no auth (`202`), best effort. A revoke that fails leaves the
  sign-in deleted, and the answer's `revoke_error` says so for the page to show as
  a warning. The page's manage link (`manage_url`,
  `https://github.com/settings/apps/authorizations`) shows only while signed in.

### What a change of sign-in does

A sign-in that changes (signed in, signed out, refused) kicks a heartbeat, so the
console's Setup card and the `contribute` feature follow within seconds. Once the
Bridge can contribute and its engine has started, the change also re-admits every
book parked `contrib_unavailable`, whatever its reason.

A Bridge start never re-admits them. So a sign-in that lands while the engine is
still starting (a first native start downloading ffmpeg) leaves them for
**Retry**. A book parked there while signed in (because the sign-in's refresh
couldn't reach GitHub) sees no change, and a refresh that later succeeds
re-admits nothing, so it also waits for **Retry**.

### While the sign-in can't be refreshed

While the sign-in's expired access token can't be refreshed, and there is no
environment token or `gh` to fall back on, nothing resolves. The Bridge reports
that it can't share until a refresh succeeds. The next token request comes a
minute later, the heartbeat's own included. Meanwhile:

- the heartbeat's `can_contribute` (and the estimate's) is false, so the server
  drops the `contribute` feature;
- the `contributions` module flag is false, and the console's Modules card says
  "Sign in to GitHub on your Bridge";
- the console's Setup card reads as not signed in, and the console offers no
  share, no Suggest corrections and no contribute switch;
- the Accounts tab keeps its **Signed in** badge (sharing uses "None");
- a job queued from a page loaded before then is refused `409 cannot_contribute`.

None of these says that GitHub is unreachable. Only three things do: the job
failures (below, for a job queued before the heartbeat told the server), the
park's reason (`pipeline.ContribUnrefreshedMsg`) on the Bridge's Jobs tab, and a
warning in the Bridge's log at each failed refresh. The console's park line, the
bell and the notification read the same for both causes.

### The accounts table

The `accounts` table (migration `0006`) keeps only what the page shows, never a
credential: `provider` (`github`, `agent`, or `agent/<kind>`, which keeps when that
kind was set), `login`, `signed_in_at`, `last_ok_at`, `refused_at`, `last_error`.

`performed_via_github_app` on an issue proves only that it was filed with a token
of this App, which anyone can get. Meta treats it as a routing hint and validates
every body.

## The page's routes

These routes are on the Bridge's page API and use the page's session, like every
other route (see [Development](development.md#the-page-and-its-api)). **No route
ever answers a credential back.**

| Route | What it does |
|---|---|
| `GET /api/accounts` | `{github, agent}` |
| `POST /api/accounts/github/device` | starts a sign-in; answers `{user_code, verification_uri, expires_at}` |
| `DELETE /api/accounts/github` | signs out (also ends a sign-in in progress); answers `{accounts, revoke_error}` |
| `PUT /api/accounts/agent` | `{kind, value}`: seals one agent credential; answers the accounts |
| `DELETE /api/accounts/agent?kind=` | removes one kind (`""` for all); answers the accounts |

The `github` object:

| Field | Meaning |
|---|---|
| `available` | a client ID is configured; always true, as an empty `github.client_id` falls back to the built-in one |
| `signed_in`, `refused`, `login`, `signed_in_at`, `last_ok_at`, `last_error` | the sign-in's state |
| `pending` | the code above, or `null` |
| `flow_error` | why the last flow ended without a sign-in |
| `env_token` | `AUDIOSILO_BRIDGE_GITHUB_TOKEN` is set; it wins unless GitHub refused it |
| `from` | the token used now: `env`, `device`, `gh` or `""` |
| `can_contribute`, `manage_url` | as above |

The `agent` object:

| Field | Meaning |
|---|---|
| `backend` | the CLI the agent container runs (claude or codex) |
| `kinds` | the kinds that backend takes, in the order it uses them: `claude_oauth_token`, `anthropic_api_key` for claude; `openai_api_key` for codex |
| `set` | kind to boolean |
| `set_at` | when the set last changed: a save, or a removal that left others |
| `set_at_by_kind` | additive: each held kind's own save time; a kind saved before per-kind rows existed is left out |
| `available`, `detail` | the agent container's state |
| `handoff` | the runs get the Bridge's credential |
| `container_credential` | the kind the container has of its own, which wins; `""` for none |

A value must be one printable line without spaces, at most 2048 bytes. Anything
else is `ErrInvalidCredential`, said without the value. Changing a credential
resumes the books and description jobs parked `agent_credential_refused` and
`agent_unavailable` ([Parks](generating.md#parks)).

The page's Accounts tab (`web/src/components/tabs/AccountsTab.tsx`,
`web/src/lib/accounts.ts`) polls every 3 seconds, only while a sign-in is pending.
Each agent field says **Set** with that credential's own saved time
(`set_at_by_kind`). The GitHub card says the App opens issues, plus a secret gist
when a characters or recaps file is too long for an issue.

## Sharing later: `sidecars.contribute`

This is "Share with the community" after a run kept its results on the server.
Family `sidecars`; a book `path` is required; it **writes nothing**
into the library.

### On the server

`bridge/contribute.go` takes the params strictly: `{work_id?, dimensions?}`.

- `dimensions` is drawn from `characters` and `recaps`, each once, stored in that
  order. Absent or empty means both.
- A `work_id` is at most 200 bytes, with no control characters.

The server refuses the job `409 generate_open` while a `sidecars.generate` job is
open for the book. It refuses a new generate job `409 contribute_open` while a
contribute job is queued or working. A new generate job cancels a parked
contribute job, or a queued one held while the `contributions` module is off ("a
generate job for the book replaced what it was sharing").

### On the Bridge

`generate/contributejob.go` runs in the light lane and reads its params leniently
(a later server's field is ignored). Then it:

1. finds the book through the library's mapping without needing it writable
   (`prepareRead`);
2. finds the **engine book** that keeps the results (`notesBook`; the sidecars
   survive the transcript purge) and holds it, so no stage runs on it meanwhile;
3. files the results with `pipeline.Executor.Share`, the way the contributing
   stage does in issue mode, with no agent and no spend.

**Which work.** The work is the first of:

- the job's `work_id` (a retired slug is followed to its survivor and recorded on
  the book);
- the Bridge's own match for the engine book (the console sends no `work_id`);
- the engine book's exact identifiers.

An unmatched book fails ("Match the book first"). A share never proposes a new
work.

**Which dimensions.** A dimension counts as filed only when its row is
`submitted`, `pr_open` or `merged`. A local export, a `covered` verdict or a closed
issue is filed again. One already filed is kept and reported. A dimension the
community already has is `covered`.

### Never filing twice

Each dimension's gist and issue are guarded against a second filing, across shares
and across the contributing stage's retries. Before each create, the Bridge
records a filing marker (`contrib.filing/<book id>/<kind>`), timed by
`Client.Now`. That is GitHub's clock, learned from the `Date` of its answers, or
the Bridge's own while GitHub hasn't answered. A create GitHub refused, or one that
never left (`contrib.NothingFiled`), clears its time from the marker. The next
submit then does one of these:

- **Adopts** the gist or issue the user made since the marker, less
  `contrib.FilingSkew` (`GistsSince`, `IssuesSinceBy`). The rows of pages read
  before one that failed count too.
- **Files again** when GitHub's list is complete and holds none. For an issue, it
  also waits until the marker is a minute old (`contrib.FilingSettle` through
  `Client.Settling`), because GitHub may still be making it. An issue edited since
  doesn't match, so it is filed again.
- **Files again** (`refileStale`, logged) when the list can't reach back to the
  marker (`contrib.ErrListIncomplete`) and the marker is over 24 hours old by
  GitHub's clock (`contrib.FilingStale`). The list since the marker only grows, so
  no later lookup settles it. `Client.StaleFiling` is false until GitHub has
  answered that submit. Meta's intake sends a member the work already has to a
  maintainer, and nothing on the page clears a marker.
- **Fails the share** (`ErrFilingUnknown`) with the marker kept, whatever its age,
  in every other case: a refusal, a rate limit, an outage, a cancel. A `401` there
  is worded as the refused sign-in (below).

### Result and failures

```json
{
  "library_id": 1, "path": "Jack London/The Call of the Wild", "work_id": "the-call-of-the-wild",
  "contributed": { "characters": "https://github.com/KodeStar/audiosilo-meta-community/issues/41" },
  "covered": ["recaps"]
}
```

The failures are worded for the console:

| Cause | Message |
|---|---|
| not signed in | "The Bridge isn't signed in to GitHub: sign in on the Bridge's Accounts tab, then share the book again." |
| signed in, but the sign-in couldn't be refreshed | "The Bridge's GitHub sign-in couldn't be refreshed because GitHub couldn't be reached: share the book again once it can." |
| GitHub refused the sign-in during the share (a `401`) | "sign in again on the Bridge's Accounts tab, then share the book again" |
| nothing kept here | "it was not generated here, or they were removed" |
| an earlier share stopped while filing, and the Bridge can't yet tell whether GitHub made the issue or the gist it links | "so it filed nothing more: share the book again in a few minutes, and if this keeps happening, look for the issue on the community repository" |

A generate job still running and a book not matched also fail. A sign-in GitHub
had already refused resolves no credential, so it reads as not signed in. The
Bridge tells the unrefreshed sign-in apart before the share starts
(`Options.ContribCredential`). When filing parks `contrib_unavailable`, it tells it
apart from the park's `Cause` (the resolve error), never from the reason's text.

A finished job whose `contributed` is empty and whose `covered` isn't is "Already
in the community" in the server's notification (`bridge.Job.SharedNothing`).

### In the console

`features/bridge/share-section.tsx` (`shareOffered`) offers the share in the
book's Community card only while all of these hold:

- the module's flag is on;
- an online Bridge offers `sidecars`;
- the brief estimate's `can_contribute` is true and the community answered;
- no generate or contribute job is open.

It offers only the dimensions the book has locally, the community lacks and no
earlier job contributed (`contributedLinks`). An existing share job shows with its
Cancel whatever the flag says.

## Corrections: `meta.correct`

`meta.correct` is "Suggest corrections". Family and feature `meta`; a book `path` is required; it writes nothing into the
library.

### Params

The params are strict (`bridge.CheckCorrect`). The bounds are in the
[API reference](../server/api/reference.md#post-apiv1adminbridgejobs), and the
field list is `bridge.CorrectionFields`.

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

`asin`, `isbn` and `region` (the marketplace the ASIN sells in) say how the book
was found.

### How the server reads the text

These rules go beyond the reference. They apply to the changes' values and the
evidence.

**Control characters.** A control character is `unicode.IsControl`, C1 included.
The identifiers refuse C0 and DEL only. The server looks for both a control
character and a bidirectional control (`isBidiControl`) in the text with its
character references decoded, the way the community's issue form reads them
(`checkProse` on `decodeRefs`, mirroring audiosilo-meta's `issueform`
`formValue`):

- each numeric or named HTML reference ending in `;` is decoded;
- one naming whitespace is read as a space;
- one that decodes to more than two characters is left as written.

GitHub shows the evidence decoded too. The server (and the console) also decode an
upper-case `&#X...;`, which meta's form leaves as written. This is on purpose,
because GitHub shows it decoded, so re-aligning `decodeRefs` with `formValue` must
keep `[xX]`. A reference is ASCII, so this covers the characters as written as
well, and `&#x202E;` is refused like the character itself.

Only references to the other C0 characters, DEL and the C1 points that
Windows-1252 leaves unmapped (0x81, 0x8D, 0x8F, 0x90, 0x9D) count as control
characters. A reference to whitespace reads as a space, `&#0;` as U+FFFD, and the
rest of 0x80-0x9F as Windows-1252 characters.

**Lengths.** The lengths (500, 2000) count the text as written, trimmed, before
decoding. The decoded text isn't trimmed again, so a U+0085 before a trailing
`&#32;` (which a trim after decoding would drop) is refused.

**A correction that changes nothing.** The server reads a `corrected` value as the
community reads it, decoded and trimmed (`asRead`). It compares that with
`current`, taken as the record spells it. A value that so reads as nothing, or as
`current`, changes nothing and is refused. For example, a corrected
`Tom &amp; Jerry` reads `Tom & Jerry`. That is refused against a current
`Tom & Jerry`, and is a correction of a current `Tom &amp; Jerry`.

**Evidence.** An `evidence` of exactly `_No response_` (the form's blank field),
or one that reads as nothing, is "evidence is required". `evidence` keeps its line
breaks (CRLF stored as LF) and tabs. It stays within 2000 characters both as
written and as the issue carries it (`issueLength`: a line starting with `#` loses
its indent and gains a backslash).

### What the server checks

What the Bridge would refuse when filing is a `400` here. The exception is a
`work_id` the community doesn't have. The server checks it only as text (at most
200 bytes, no control characters), and such a job fails on the Bridge.

Then the handler's `checkCorrections` runs. It is security-relevant, because the
server files only an admin's own edits:

- each change's field must be **edited** on the book (`catalog.SourceEdited`),
  never a scanned, path, ABS or accepted-community value;
- `corrected` must equal the book's value now (`MatchState.EditedValue`).

Otherwise the answer is **`400 not_edited`** naming the `field`. The server stores
the book's own spelling of each corrected value. It stamps `source` as
`audiosilo-server/<version>` whatever well-formed `source` was sent (at most 128
bytes, no control characters).

Only the corrected values are bound to the book. `current` and the records the job
names (`work_id`, `recording_id`, `asin`, `isbn`, `region`) are the caller's; the
console sends the book's community match.

### On the Bridge

`internal/correct` runs in the light lane. `ParseParams` is strict: `work_id` is
required, an unknown field is refused, and the params are at most 64 KiB as the
server stores them, which a batch at every server bound fits. `MapCorrections`
bounds the batch again as meta does. See the workspace CROSS-REPO.md §23 before
raising a bound or adding a field. The job:

1. **Resolves the GitHub credential** before it reads the work's community record
   or GitHub's issues. Only three things come first: a resumed job's kept result,
   a marker with no time to look from (below), and the Bridge's community metadata
   being off (`errMetaOff`).
   - No credential fails `errNoCredential` ("The Bridge isn't signed in to GitHub:
     sign in on the Bridge's Accounts tab, then suggest the corrections again.").
   - A sign-in that couldn't be refreshed (`contrib.ErrSignInUnrefreshed`) fails
     `errUnrefreshed` ("The Bridge's GitHub sign-in couldn't be refreshed because
     GitHub couldn't be reached: suggest the corrections again once it can.").
2. **Reads the work's live coverage** (`metaops.FreshCoverageForWork`; `errMetaOff`
   when its `metadata.base_url` is off) and picks the recording. That is the job's
   `recording_id`, else the one recording that lists the job's ASIN (in its
   `region`, when given) or ISBN. None, or several, is no recording.
3. **Maps the changes** onto meta's batch vocabulary (`contrib.MapCorrections`):

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
   maintainer, who finds the recording. Anything else is `ErrInvalidCorrection`
   for the whole issue: an unknown field, a duplicate field (two distinct ISBNs
   excepted), or a value past the bounds.
4. **Composes the issue** (`contrib.CorrectionBatchIssue`, meta's form rendered
   verbatim). The title is `[corrections] <work title>`, the labels are `data` and
   `data:correction-batch`, and the sections are:
   - **Record**: the work's page on meta.audiosilo.app;
   - **Changes**: fenced JSON
     `{"v": 1, "source": "...", "changes": [{record, field, current, corrected}]}`,
     every change naming its record;
   - **Evidence / source**;
   - the ticked CC0 dedication.
5. **Files one issue** on the core repository (audiosilo-meta) with the GitHub
   token, and reads no labels back. Meta's `route.yml` labels an issue filed with
   the Accounts sign-in (the App's token). One filed with
   `AUDIOSILO_BRIDGE_GITHUB_TOKEN` or `gh` by an account that can't label there
   arrives without labels and waits for a maintainer.

### Guarded against filing twice, per request

The Bridge keeps a job's result under `meta.correct/<server id>/<job id>`, so a
resumed job (the same job run again after a restart) returns it.

The filing itself is guarded per **request**, not per job or book. Before
`CreateIssue`, the Bridge writes a marker `{since, sum, job}` into its store under
`meta.correct.filing/<server id>/<request>`. `since` is GitHub's time from
`Client.Now`, and `sum` is the `contrib.IssueSum` of the title and body sent.

**The request key** (`filingKey`) is what the admin asked to change: the sha256 of
the record and of the changes as a set of `{field, corrected}`, sorted. The record
is the `work_id` and the `recording_id` when there is one. Otherwise it is the
ASIN, ISBN and region that pick the recording, in the forms `ParseParams` gives
them (the ASIN upper case, the region lower case).

These don't count towards the key: the evidence, the server's `source` stamp, each
change's `current` value and the order of the changes. The dialog starts from its
default evidence each time it opens (`book.corrections.evidencePrefill`, which
names the server's version, in the admin's language). So two kinds of job find
the marker:

- the job resumed;
- a new job asking for the same changes, for example the admin suggesting them
  again after a lost answer, whatever the evidence says now and wherever the book
  is on disk.

Another field, another corrected value (editing the book's title changes its
row's), or a change added or dropped is a new request and files again. So is a
retry after the community applied some of the rows between the lost answer and the
retry. The console offers only the rows that still differ, so its change set
shrinks (an accepted duplicate, below).

**When the marker goes.** The Bridge deletes the marker only while it is still the
one the run wrote or adopted (`clearFiling`), and only:

- once the filed or adopted issue is recorded as the job's result (a failed result
  write keeps it, so the job resumed adopts the issue);
- when nothing can have been filed (`contrib.NothingFiled`: a 4xx answer, a rate
  limit, or a request that never left);
- once a person has been told the Bridge can't tell (below).

A 5xx, which can come after the issue was made, a timeout or a lost answer keeps
the marker. The client never resends a POST. The job fails `errNoAnswer` ("GitHub
didn't confirm the issue ... suggest them again in a minute"). The user guide
quotes these failures word for word
([Suggest corrections](/users/admin/bridge#suggest-corrections)).

### A run that finds a marker

The run lists the core repository's issues made since the marker's time, less
`contrib.FilingSkew` (`contrib.IssuesSince`). It uses the list endpoint, not
search, which lags, and the rows of pages read before one that failed count too.
Then it:

- **Adopts** a `[corrections]` issue whose sum is the job's or the marker's,
  wherever it is in the list. The marker's sum is the request as composed then.
  The title is the work's live title, so what the run composes now changes when
  meta's bot has since applied a title correction, or a recording has since taken
  the ASIN. Other evidence or a new `source` stamp changes it too.
  - The job that wrote the marker (resumed) can always adopt the marker's sum.
  - Another job can adopt the marker's sum only while the marker is under a day
    old by GitHub's clock (`contrib.FilingStale`).
  - A new job that composes the issue exactly (the same evidence and `source`
    stamp, with the work's title and the recording unchanged) adopts it by its own
    sum at any age, open or closed.
  - Otherwise the same changes suggested again later are not a retry of the lost
    answer, whose issue may be closed by then. That issue reads as a same-record
    batch (below), and the person is told once.
- **On a `401`** (`contrib.Unauthorized`, even past a same-record batch on a page
  read before), fails `errRefused` (sign in again on the Accounts tab). On a rate
  limit it fails `errRateLimited`. The marker is kept either way.
- **Fails `errSettling`** ("suggest them again in a minute") when the list is
  complete back to the marker and holds nothing, but the marker is under a minute
  old by GitHub's clock (`contrib.FilingSettle`, `Client.Settling`). GitHub may
  still be making the issue.
- **Fails `errFiledBefore`** for a batch with the same **Record** (the work's
  page, whatever the recording) and another body (`otherBatch`), whatever the
  marker's age. That batch can be anyone's, filed by hand or from another server,
  or the run's own issue edited since. The failure asks the admin to look for a
  `[corrections]` issue first.
  - It is said once only when the list was read back to the marker whole and the
    marker has settled. Then the marker goes, so the next suggestion files.
  - Otherwise the marker stays and the next suggestion is told again.
  - A marker with no time to look from is told the same way, once, before the
    credential is resolved or anything is read from meta or GitHub.
- **Files** when the list is complete back to the marker and holds none.
- **For any other lookup failure** fails `errFiledBefore` with the marker kept.
  Unlike a share, this includes a list it can't read at all. Once the marker is
  over 24 hours old by GitHub's clock (`contrib.FilingStale`; `Client.StaleFiling`
  is false until GitHub has answered that run), it files again.

On the create, GitHub's refusal (a 4xx, a rate limit) clears the marker, since
nothing was filed. A `401` fails `errRefused`, a rate limit `errRateLimited`, and
any other refusal "could not file the corrections: ...".

### Accepted duplicates

Meta's intake labels a batch whose every change the record already holds
`data:duplicate`. One with a field a maintainer applies reaches a maintainer
again. Duplicates stay possible and are accepted, and meta's intake catches a
batch already applied. They come from:

- the same corrections suggested again after they were filed. A confirmed filing
  clears its marker, and the console unticks only the rows the book's newest
  corrections job suggested with the same value, and none when that job failed or
  was cancelled;
- a new request (a change added, dropped or corrected differently) that repeats
  changes already filed. Among them are a retry after the community applied some
  of the rows since the lost answer (the console's change set shrinks), and a
  retry after the community changed which recording or work the book's ASIN or
  ISBN names (the console resolves the record from a live lookup each time the
  dialog opens, so the key changes);
- a refile once the marker is over 24 hours old;
- the next suggestion after an `otherBatch` that was the run's own issue edited
  since;
- for another job once the marker is over a day old, the lost filing's issue
  unedited, because the job composes another (other evidence, a new `source`
  stamp, a retitled work);
- a POST still in flight after the one-minute settle when the lookup finds
  nothing.

### Result

```json
{ "issue_url": "https://github.com/KodeStar/audiosilo-meta/issues/2701", "issue_number": 2701,
  "changes": 2, "auto": ["title"], "maintainer": ["narrator"] }
```

`auto` and `maintainer` are as known at filing. The Bridge doesn't follow the
issue, so a batch meta applies only in part isn't reported back (deferred).

### In the console

`features/book/corrections-dialog.tsx` and `corrections-model.ts` offer **Suggest
corrections** in the Community card (`correctionsOffered`) while all of these hold:

- the module's flag and `capabilities.metadata` are on;
- the online Bridge lists the `meta` feature;
- the book is matched with an ASIN or ISBN;
- an edited correction field holds a value (`isbn` only beside an ASIN, because
  without one the ISBN is how the community finds the book).

`CorrectionsSection` also holds the offer back while a corrections job for the
book is open, and shows its status instead.

The dialog:

1. looks the book up by ASIN, else ISBN (`matchBook`), and takes the candidate
   the identifier resolved;
2. diffs the edited values against the community's (`communityValues` for that
   recording). `published` is compared with the recording's release date, and it
   is no change when it is the same as, or less precise than, that date or the
   work's first publication. An ISBN the recording already lists is no change;
3. ticks each sendable row not suggested by the book's last corrections job;
4. badges each row **Applied automatically** or **Reviewed by a maintainer**
   (`handling`). A recording field is automatic only when the identifier names the
   recording (`correctionRecording`);
5. requires the evidence (prefilled) and queues one `meta.correct`.

The job's status and issue link show in the same card part. The server enforces
the 25-change cap and the kind's params cap
([API reference](../server/api/reference.md#post-apiv1adminbridgejobs)), which a
batch at every bound fits.

The dialog runs the server's checks (above) on each value and the evidence, so it
never sends what would get the `400`. Its `decodeRefs` mirrors the server's:
numeric references are decoded as Go's `html` decodes them, named ones through the
browser's own HTML parser, and `&nLt;` and `&nGt;` are left as written, as Go
leaves them. `goTrim` trims as Go's `strings.TrimSpace` does.

- **A row** is left unticked, its box disabled (`sendable`), with the first flag
  in the order `tooLong`, `control`, `bidi`, `noChange` (`refusal`), shown as
  `book.corrections.<flag>`. The flags are a value over 500 characters, a control
  character, a bidirectional control (U+202A-U+202E, U+2066-U+2069) as written or
  as a character reference that reads as one (above), and a corrected value that
  reads as the community's value or as nothing.
- **An evidence problem** stops **Suggest N corrections** sending anything
  (`correctionProblem`, shown as `book.corrections.<problem>`):
  - `noEvidence`: blank, `_No response_` or reading as nothing; shown once
    **Suggest N corrections** has been pressed;
  - `evidenceTooLong`: over 2000 characters as written or as the issue carries it
    (`issueLength`);
  - `evidenceControl`: a control character other than a line break or a tab,
    written or as a reference that reads as one;
  - `evidenceBidi`.

The dialog's header clamps the book's title to two lines (`line-clamp-2`, with the
whole title in its `title` attribute and read out), so a long title never squeezes
the review on a phone.

## Notifications

The server words the new kinds itself (`internal/notify`, `bridge_job_finished`
with `shared_nothing`, and the `contrib_unavailable` park). See
[Notifications](../server/backups-and-notifications.md#events).
