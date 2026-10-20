---
title: Contributions
description: "Bridge Phase 2b end to end: the Accounts tab (the AudioSilo Contributions GitHub App's device flow, expiring tokens refreshed with the client ID alone, sign-out by revoke, the agent credentials), the page's /api/accounts routes, sidecars.contribute (sharing a book's kept characters and recaps later) and meta.correct (an admin's edits as one correction-batch issue), with what the server checks and what the console shows."
---

Phase 2b lets a server send what it knows back to the community metadata
database, always through the Bridge (decision 17: the server never holds a GitHub
credential, and never calls the Bridge). Three parts:

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
  and is tried again a minute later.
- **Refused and OK.** A `401` on the current device token marks the account
  refused (`refused_at`, `last_error`; a 401 on a token a refresh has since
  replaced is ignored), which drops `can_contribute`. A REST call that works moves
  `last_ok_at` (`contrib.NewClientFor` wires both hooks); it never ends a refusal,
  only a new sign-in does.
- **Signing out** (`DELETE /api/accounts/github`, `SignOut`):
  `POST https://api.github.com/credentials/revoke` with both tokens and no auth
  (`202`), then the local delete, which happens **even when the revoke failed**:
  the answer's `revoke_error` says so and the page shows it, beside the manage link
  (`https://github.com/settings/apps/authorizations`).

A sign-in that changes (signed in, signed out, refused) kicks a heartbeat, so the
console's Setup card and the `contribute` feature follow within seconds, and
re-admits the books parked `contrib_unavailable` once the Bridge can contribute.

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

`github`: `available` (a client ID is configured), `signed_in`, `refused`,
`login`, `signed_in_at`, `last_ok_at`, `last_error`, `pending` (the code above, or
`null`), `flow_error` (why the last flow ended without a sign-in), `env_token`
(`AUDIOSILO_BRIDGE_GITHUB_TOKEN` is set and wins), `from` (`env`, `device`, `gh`
or `""`), `can_contribute`, `manage_url`.

`agent`: `backend`, `kinds` (the kinds that backend takes, in the order it uses
them: `claude_oauth_token`, `anthropic_api_key` for claude; `openai_api_key` for
codex), `set` (kind to boolean), `set_at`, `available`, `detail`, `handoff` (the
runs get the Bridge's credential) and `container_credential` (the kind the
container has of its own, which wins; `""` for none). A value must be one
printable line without spaces, at most 2048 bytes (`ErrInvalidCredential`, said
without the value). Changing a credential re-admits the books parked
`agent_credential_refused` and `agent_unavailable`.

The page's Accounts tab (`web/src/components/tabs/AccountsTab.tsx`,
`src/lib/accounts.ts`) polls every 3 seconds only while a sign-in is pending.

## Sharing later: `sidecars.contribute`

"Share with the community" after a run kept on the server (plan D2). Family
`sidecars`; a book `path` required; it **writes nothing** into the library.

**The server** (`bridge/contribute.go`) takes params strictly:
`{work_id?, dimensions?}`, `dimensions` from `characters` and `recaps`, each once,
stored in that order (absent or empty means both); a `work_id` at most 200 bytes,
no control characters. It is refused `409 generate_open` while a
`sidecars.generate` job is open for the book, and a new generate job is refused
`409 contribute_open` while a contribute job is queued or working.

**The Bridge** (`generate/contributejob.go`, light lane) reads its params
leniently (a later server's field ignored), then:

1. finds the book through the library's mapping without needing it writable
   (`prepareRead`);
2. finds the **engine book** that keeps the results (`notesBook`: the sidecars
   survive the transcript purge) and holds it, so no stage runs on it meanwhile;
3. `pipeline.Executor.Share` files them the way the contributing stage does in
   issue mode, with no agent and no spend. The work is the job's `work_id` (a
   retired slug followed to its survivor and recorded on the book), else the
   book's match, else its exact identifiers; an unmatched book fails ("Match the
   book first"): a share never proposes a new work. A dimension counts as filed
   only when its row is `submitted`, `pr_open` or `merged` (a local export, a
   `covered` verdict or a closed issue is filed again); one already filed is kept
   and reported. A dimension the community already has is `covered`.

Result:

```json
{
  "library_id": 1, "path": "Jack London/The Call of the Wild", "work_id": "the-call-of-the-wild",
  "contributed": { "characters": "https://github.com/KodeStar/audiosilo-meta-community/issues/41" },
  "covered": ["recaps"]
}
```

Failures, worded for the console: not signed in, GitHub refused the sign-in
("sign in again on the Bridge's Accounts tab, then share the book again"), nothing
kept here ("it was not generated here, or they were removed"), a generate job
still running, not matched. A finished job whose `contributed` is empty and
`covered` isn't is "Already in the community" in the server's notification
(`bridge.Job.SharedNothing`).

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

**Params** (strict, `bridge.CheckCorrect`):

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

- 1 to 25 `changes`, each `field` once, from `title`, `author`, `narrator`,
  `series`, `series_index`, `more_series`, `published`, `isbn`
  (`bridge.CorrectionFields`); values trimmed, one line, at most 500 characters,
  `corrected` set and different from `current`; no control character
  (`unicode.IsControl`, C1 included) in any value;
- `evidence` required, at most 2000 characters, line breaks kept (CRLF stored as
  LF), and at most 2000 as the issue carries it (a line starting with `#` loses
  its indent and gains a backslash);
- `recording_id`, when given, a community slug; `asin`, `isbn` and `region` (the
  marketplace the ASIN sells in) say how the book was found.

What the Bridge would refuse when filing is a `400` here. Then the handler's
`checkCorrections` (security-relevant: the server files only an admin's own
edits) requires each change's field to be **edited** on the book
(`catalog.SourceEdited`: never a scanned, path, ABS or accepted-community value)
with `corrected` equal to the book's value now (`MatchState.EditedValue`), else
**`400 not_edited`** naming the `field`. It stores the book's own spelling of each
value and stamps `source` as `audiosilo-server/<version>` whatever was sent. Only
the values are bound to the book: the records the job names (`work_id`,
`recording_id`, `asin`, `isbn`, `region`) are the caller's (the console sends the
book's community match).

**The Bridge** (`internal/correct`, light lane; `ParseParams` strict, `work_id`
required):

1. reads the work's live coverage (`metaops.FreshCoverageForWork`; `errMetaOff`
   when its `metadata.base_url` is off) and picks the recording: the job's
   `recording_id`, else the one recording that lists the job's ASIN (in its
   `region`, when given) or ISBN; none, or several, is no recording;
2. maps the changes onto meta's batch vocabulary (`contrib.MapCorrections`):

   | Server field | Meta record and field | Applied by |
   |---|---|---|
   | `title` | work `title` | meta's bot |
   | `author` | work `authors` | a maintainer |
   | `series`, `series_index`, `more_series` | work `series`, `series_index`, `more_series` | a maintainer |
   | `published` | recording `release_date` | meta's bot |
   | `isbn` | recording `isbn` (added) | meta's bot |
   | `narrator` | recording `narrators` | a maintainer |

   A recording field with **no recording** is addressed to the work, and meta
   hands it to a maintainer (who finds the recording). Anything else (an unknown
   field, a duplicate field (two distinct ISBNs excepted), a value past the
   bounds) is `ErrInvalidCorrection` for the whole issue;
3. composes the issue (`contrib.CorrectionBatchIssue`, meta's form rendered
   verbatim): title `[corrections] <work title>`, labels `data` and
   `data:correction-batch`, sections **Record** (the work's page on
   meta.audiosilo.app), **Changes** (fenced JSON
   `{"v": 1, "source": "...", "changes": [{record, field, current, corrected}]}`,
   every change naming its record), **Evidence / source** and the ticked CC0
   dedication;
4. files **one** issue on the core repository (audiosilo-meta) with the GitHub
   token. A device token skips the labels check (`AppFiled`): meta's `route.yml`
   labels the issue.

**Never twice.** A `filing <time>` marker goes into the Bridge's store
(`meta.correct/<server id>/<job id>`) before `CreateIssue`, cleared only when
GitHub answered a 4xx or a rate limit (a 5xx can come after the issue was made,
and the client never resends a POST). A resumed run with a result returns it; one
with only the marker lists the core repository's issues made since
(`contrib.IssuesSince`: the list endpoint, not search, which lags) and adopts a
`[corrections]` issue with the same body, files when the list is complete and has
none, and otherwise fails asking the admin to look for a `[corrections]` issue
first. A `401` fails "GitHub refused the Bridge's sign-in".

Result:

```json
{ "issue_url": "https://github.com/KodeStar/audiosilo-meta/issues/2701", "issue_number": 2701,
  "changes": 2, "auto": ["title"], "maintainer": ["narrator"] }
```

`auto` and `maintainer` are as known at filing. The Bridge doesn't follow the
issue, so a batch meta applies only in part isn't reported back (plan D8,
deferred).

**The console** (`features/book/corrections-dialog.tsx`, `corrections-model.ts`)
offers **Suggest corrections** in the Community card (`correctionsOffered`) while
the module's flag and `capabilities.metadata` are on, the online Bridge lists the
`meta` feature, the book is matched with an ASIN or ISBN, and an edited
correction field holds a value (`isbn` only beside an ASIN: without one the ISBN
is how the community finds the book). The dialog looks the book up by ASIN, else
ISBN (`matchBook`), takes the candidate the identifier resolved, diffs the edited
values against the community's (`communityValues` for that recording;
`published` against the recording's release date, an ISBN the recording already
lists is no change), ticks each sendable row not suggested by the book's last
corrections job, badges it **Applied automatically** or **Reviewed by a
maintainer** (`handling`: a recording field is automatic only when the identifier
names the recording, `correctionRecording`), requires the evidence (prefilled)
and queues one `meta.correct`. The job's status and issue link show in the same
card part. The server enforces the 25-change cap.

## Notifications

The server words the new kinds itself (`internal/notify`): `sidecars.contribute`
done is "Shared with the community" (or "Already in the community" when it filed
nothing, the event's `shared_nothing`), failed "Sharing with the community
failed"; `meta.correct` done is "Corrections sent", failed "Corrections failed".
The `contrib_unavailable` park says to sign in to GitHub on the Bridge, and
`agent_credential_refused` to replace the credential where the Bridge gets it (its
Accounts tab or the agent container).
