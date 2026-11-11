---
title: Audible
description: "Audible accounts on the Bridge (the paste-back PKCE sign-in, device registration and deregistration, the vault), the audible.poll job and its matching rules, preorders from the orders and the catalog (remembered, Bridge 0012), the audible.import backup (params, steps, result and codes, resume and temp files, the hardened transfer, enrichment, secrets), the server's accounts and titles (0063, 0064, 0065), its queueing (priorities, policy_since, preorders, the done fold) and the audible module, the console, and the build-tagged Audible fake; the current device profile (Bridge 0010), redacted account ids, contests settled by series number and planned destinations; position sync both ways (audible.sync, the push loop, furthest only, the two Bridge routes, server 0066 and Bridge 0011)."
---

The Bridge does three things with Audible accounts:

- It signs in to Audible accounts, lists what each owns and matches it against a
  books library on the server. The console shows the result
  ([The poll](#the-poll-audiblepoll)).
- It **backs titles up** into the library, as the server asks
  ([`audible.import`](#backing-up-a-title-audibleimport)).
- It keeps an account's **listening places in step** with Audible both ways,
  furthest only
  ([Position sync](#position-sync-audiblesync-and-the-push-loop)).

The player has no Audible surface. Audible's places reach it as another
device's.

The Audible client came from **audiosilo-manager**. Its `audible`, `importjob`,
`placement`, `source`, `transfer` (`Local` only) and `progress` packages were
imported **with their history** (`git filter-repo`), so `git log --follow` reaches
the manager's fixes. The manager's `registry` was imported and deleted in the same
change, replaced by the Bridge's vault (`internal/secrets`) and the server's
`audible_titles` columns. AAX activation bytes, the "sims" series watch and the folder,
probe and OpenAudible sources were not imported.

## Who holds what

| Where | What |
|---|---|
| The Bridge's vault | each account's sign-in, sealed as `audible_<id>` (`secrets.AudibleName`): the access, refresh and adp tokens, the device's RSA key, its serial, the customer id and marketplace (`audible.Credentials.Marshal`). **Full Amazon account access**, so never anywhere else |
| The Bridge's `bridge.db` | `audible_accounts` (migration `0009`): `id`, `label`, `marketplace`, `customer_hash` (sha256 of the customer id, never the id), `server_id` (the server the mapping was last recorded on), `user_id`/`user_name`, `library_id`, `policy`, `sync` (sent to the server, which ignores it), `created_at`, `last_ok_at`, `last_poll_at`, `last_titles`, `last_matched`, `refused_at`, `last_error`, `device_profile` (migration `0010`, [below](#the-device-profile)), and the push and sync health columns and `refusal_kind` with the `audible_push` table (migration `0011`, [below](#bridge-migration-0011_audible_push)). The remembered pending preorders: `audible_preorders` (migration `0012`, [below](#preorders)). Unique on `(customer_hash, marketplace)` where the hash isn't empty. No credential |
| The server | the mapping and the titles (`0063`, `0064`, `0065`, `0066`, below), the poll and sync schedules, what to back up and when, and whether an account's places sync. It never talks to Audible and never holds a credential or a book's key |

No credential reaches the store, job params or results, logs, the heartbeat or the
agent staging folder (the Bridge's tests walk all of them for every stub secret).
The pasted sign-in address holds a one-time authorization code: the page API takes
it and never answers it back or logs it. Errors carry Amazon's or the server's
answer, never a request body or a token, and that answer is
[redacted of account ids](#redacted-account-ids) before it becomes an error.

## The sign-in (`internal/audibleacct`)

Amazon doesn't allow a third-party sign-in page. So the Bridge uses the Audible
app's own flow, and the admin pastes back the address where it ends:

1. **Start** (`Manager.Start(marketplace)`, page `POST /api/accounts/audible/sign-in
   {"marketplace"}`). The Bridge makes a PKCE pair and a device serial
   (`audible.NewPKCE`, `NewDeviceSerial`) and holds them **in memory only** for
   `LoginTTL`: 15 minutes, at most 8 at once, the oldest dropped. It builds the
   authorize URL (`BuildAuthorizeURL`). The answer is
   `{login, url, marketplace, expires_at}`.
2. The admin signs in at `url` in their own browser. Amazon lands on
   `/ap/maplanding?...openid.oa2.authorization_code=...`, a page that doesn't
   exist, and the admin copies its address.
3. **Finish** (`Manager.Finish`, page `POST /api/accounts/audible {login,
   redirect_url, label, user_id, library_id, policy, sync}`). The Bridge, in
   order:
   - checks the mapping and the code (a page without a code keeps the login for
     another try);
   - spends the login;
   - registers the device (`audible.Register`: code + verifier -> `Credentials`);
   - records the mapping on the server (`PUT /bridge/audible/accounts/{account}`)
     **before** anything is sealed;
   - seals the credentials as `audible_<id>` and stores the row.

   If any step after the registration fails, the Bridge deregisters the new device
   and puts back what it changed, best effort. A new account is DELETEd on the
   server. An existing one's earlier sign-in goes back in the vault, and its
   earlier mapping is PUT again. A failed sign-in leaves no device and the account
   as it was.

The device is named `"<first name>'s AudioSilo"` in the Amazon account's device
list (`audible.DeviceName`, decisions 14/16: "AudioSilo", not "Bridge"). The
account id is the Bridge's own, `^[a-z0-9]{8,32}$`, opaque to the server.

**A sign-in of an Amazon account already here** (same `customer_hash` and
marketplace) replaces it. The account keeps its id, and the Bridge deregisters the
old device afterwards. An earlier sign-in that can't be opened is logged, and its
device stays. `Finish` runs one at a time from that lookup until the row is stored
(`finishMu`, backed by the unique index). So two sign-ins of one Amazon account
finishing together end as a sign-in again, not two accounts. A label the Bridge
made (`"<person> (<STORE>)"`) follows the person when a mapping changes; a typed
one stays.

**Map** (page `PUT /api/accounts/audible/{id}`) records the new mapping on the
server first, then locally. The page checks that the library is a books library
the heartbeat listed and that the person is one `GET /bridge/users` lists.

**Remove** (page `DELETE /api/accounts/audible/{id}`, answering `{audible,
warning}`) runs to the end even if the page goes away. In order, it:

1. forgets locally **first**: the vault, then the row (it takes `finishMu`
   meanwhile);
2. DELETEs on the server;
3. deregisters (`audible.Deregister`: `POST /auth/deregister` with
   `deregister_all_existing_accounts: false`, this device only). It first
   refreshes an access token within 2 minutes of expiry.

A server or Amazon failure is a `warning` for the page, never the account kept.
When the server's DELETE failed, the server keeps an orphaned account until an
admin removes it
([`DELETE /admin/audible/accounts/{account}`](../server/api/reference.md#delete-apiv1adminaudibleaccountsaccount)).
The admin does that from the console while the module is on, and otherwise as an
API call, since the console hides its Audible card and page while the module is
off.

**Refused.** A `401`/`403` on a signed call (`audible.IsRefused`) marks the account
refused (`refused_at`, `last_error`; the page's **Sign in again**). The exception
is when a sign-in again replaced the device meanwhile; then `Library` lists again.
A refused account's poll **fails**; it isn't parked. Signing in again clears the
refusal, and so does a poll that succeeds, except for a **throttled** refusal
(below). A throttled device still lists, so a poll keeps the refusal and only a
sign-in again ends it.

The refusal's kind is its own column, `refusal_kind`: `store.RefusalSignIn`
`sign_in` or `store.RefusalDevice` `device`. Migration `0011` set the older rows
from their `last_error` text. So `Throttled` reads the kind, and `ThrottledText`
is copy only.

### The device profile

Since about September 2026, Amazon denies every license to a device registered
with the older iPhone profile (app 3.56.2, iOS 15/17, software `35602678`, a
32-character upper-case hex serial). Listing still works. The denial carries three
reasons, with the customer id quoted: `Membership`/`RequesterEligibility`,
`Ownership`/`CustomerThrottled` and `Client`/`RequesterEligibility`. The upstream
mkb79/Audible project reports the same (its issue 909 and pull request 910), and
Libation's device-registration notes agree.

The Bridge registers with the current profile (`internal/audible/profile.go`):

- app `4.60`, os `26.2`, software `46000856`, one constant set that register, the
  token refresh and deregister share;
- a 40-character `[A-Za-z0-9]` serial from `crypto/rand` (`NewDeviceSerial`);
- a user agent built from the same set
  (`Audible/46000856 CFNetwork/3860.300.31 Darwin/25.2.0`), on every signed call
  and download and on the identity calls (`/auth/register`, `/auth/token`,
  `/auth/deregister`).

How the Bridge keeps track of the profile and handles a denial:

- `audible.ProfileVersion` (`"4.60/26.2/46000856"`) is recorded in
  `Credentials.Profile` at `Register` and in the row's `device_profile` (Bridge
  migration `0010_audible_profile`, `''` for an account signed in before it was
  kept). `audibleacct.OldProfile(a)` flags an account whose profile isn't the
  current one. The page then shows `old_profile` (an amber **Sign in again** badge
  and "Sign in again to keep backups working. ..."), and the setup item `audible`
  is not done ("N account(s) need signing in again to keep backups working").
  Changing the constant set flags every account registered before it.
- `denialKind` checks the customer's throttling (`customerthrottled`, "being
  throttled") **first**, as `audible.ErrThrottled`. A bare "Throttled", a rate
  limit, stays `ErrDenied`. `Manager.signed` retries a throttled license once when
  a newer sign-in replaced the device meanwhile. Otherwise it marks the account
  refused with `audibleacct.ThrottledText` and answers the denial.
- The import then fails `audible_refused` with the advice to sign in again (never
  `no_rights`). Every later import of the account fails `audible_refused` at once,
  before the title read or a license, until a sign-in again. Any refused account's
  imports fail this way, after a second read of the account. A sign-in refusal
  gets Audible's sign-in advice until a sign-in again or a poll that succeeds
  clears it.
- A sign-in again of the same Amazon account replaces the device and deregisters
  the old one (as before). Existing accounts keep their old registration until
  the owner signs in again after updating.

The page's `GET /api/accounts/audible` answers `{accounts, marketplaces, policies,
paired, libraries, users, users_error}`. The Bridge reads the people live from the
server's `GET /bridge/users`, and the libraries are the heartbeat's books
libraries. An account whose `server_id` isn't the paired server's is
`other_server: true`. The page's Audible writes have a 15-minute write timeout
(`audibleWriteTimeout`), because each calls Amazon or the server, whose backoff may
wait minutes.

## The audible client (`internal/audible`)

The client covers:

- **Signed calls**: RSA PKCS#1 v1.5 over method, path and query, date, body and
  the adp token; no bearer.
- **`Library`**: pages of 1000, deduped, at most 250 pages. `UnavailableReason`
  says preorder, show/periodical or no download rights.
- **`Client.Title`** (`GET /1.0/library/{asin}`, `ErrNotInLibrary` on a `404`).
- **`LastPositions`** (25 ASINs a request, split on a `400` or a `414`, with
  `last_updated` from `lastpositions`) and **`SetLastPosition`**.
- **Licenses.** `Client.License` answers a self-redacting
  `License {URL, Key, IV, Size}`. It answers `ErrNotReleased`, `ErrNoRights` or
  `ErrDenied` from a denial's reasons, and `ErrDRMFree` for a title granted only as
  a DRM-free MP3. The client also has `DecryptVoucher` and `Decrypt`. `ContentACR` (a
  license request asking only for the content reference a written place needs)
  wraps a `200` denying the license as `License` does. `IsDenial(err)` says
  whether an error is one of the four denials.
- **Identity**: `RefreshAccessToken` and `Deregister`.
- **`Download`**: Range-resumable, capped at `MaxBytes` (4 GiB by default), with
  a state file, `If-Range` and a stall watchdog (see
  [Resume and temp files](#resume-and-temp-files)).
- **Backoff on `429`/`503`**: `Retry-After` seconds or a date, else 2 s doubling,
  4 attempts. A wait over 2 minutes fails at once, and each attempt is signed
  afresh. `RetryWait(err)` reads a `429`/`503`'s `Retry-After`, kept on the error
  and read up to a day.
- **Injectable endpoints** (`WithEndpoints`, `WithHTTPClient`;
  `EndpointsFor(marketplace)` gives the real ones). The marketplaces are `us`,
  `uk`, `de`, `fr`, `ca`, `it`, `au`, `in`, `jp`, `es`, `br`.
- **Preorders**: `Client.Orders` (`GET /1.0/orders`) and `Client.Products` (the
  catalog), added after Bridge 0.6.0. See [Preorders](#preorders).

The manager's `Source.Acquire` is gone; `audiblejob` runs the steps.

### Redacted account ids

Amazon's error bodies quote the customer id ("Customer id [A1...] being
throttled"). So `audible.RedactAccountIDs` (`redact.go`) runs on Audible's answer
as it becomes an error (the snippet, a license's denial reasons).

- **Removed:** customer ids (labelled, or `A` plus 10 or more capitals with a
  digit), `amzn1.*` ids, device serials (labelled, 32+ hex, or 40 letters and
  digits), emails and tokens.
- **Kept:** the ASIN (`B0...` or 10 digits) and the human part.

`RedactKnown` and `Credentials.Redact` also remove the account's own customer id
and serial by value, and `audibleacct`'s `Service` wraps every error it answers
with them. `audiblejob`'s job errors and recorded poll failures pass the redactor
again. A `Failure` redacts the errors it quotes, never its library paths or
titles, and `RedactedError` keeps `errors.Is`. So no log, job error, result,
progress or anything sent to the server carries an account id.

## The poll: `audible.poll`

**On the server** (`internal/bridge/audible.go`) the kind is:

- **internal**: `POST /admin/bridge/jobs` refuses it with `400`;
- **quiet**: no notifications;
- **strict about params**, `{"account", "template"}`. `template` is the account's
  placement template at queue time, omitted when `""`. It is bounded to 500 bytes
  but never parsed, so a template the grammar later refuses never stops the polls;
- **without a library or path**, and deduped per account (`audiblePollSuffix`);
- **owned by the `audible` module** (`ModuleFor`), so a queued poll is held while
  the module is off;
- **promoting**: a request that finds the account's poll open raises its
  priority, never lowers it.

Enqueue keeps only the newest ended poll of each account (`pruneAudiblePolls`).
Removing an account cancels its open poll (`CancelAudibleRemoved`), and so does
deleting the library it is mapped to (`CancelAudiblePaused`). Both are
`IsCancelReason`'s, and the console keeps a copy (`SERVER_CANCEL_REASONS`).

**The scheduler** (`internal/audible.RunScheduler`, the module's `Start`) passes
at once, then every minute while the module is on. With an online Bridge that
offers the kind, it queues up to 20 due accounts at priority `-10` and records
`last_queued_at`, so a failed poll waits its interval. `catalog.DueAudiblePolls`
picks accounts that are not paused, are mapped to a person an account may still be
mapped to, and have a `last_queued_at` older than `poll_hours` (6 by default).

The console's Check now (`POST /admin/audible/accounts/{account}/poll`) queues at a
person's priority (`0`), or raises the open poll to it. A request that finds the
poll still queued also gives it the current template, so Check now after a
template change plans by the new one. A claimed poll runs as claimed.

**On the Bridge** (`internal/audiblejob`, the `light` lane) a poll:

1. checks the account is this Bridge's and was mapped on the paired server (else
   it fails, asking to map it again);
2. lists the Audible library, then adds the account's pending [preorders](#preorders)
   (`audibleacct.Manager.Preorders`: from the orders, remembered, described by the
   catalog). Adding preorders never fails the poll. A refused listing fails the
   poll with a coded `audiblejob.Failure` (result and error, as an import's). The
   code is `audible_refused` with `ThrottledText` for a refused device, else
   `audible_sign_in` for a refused sign-in. The server folds no poll's code, and
   the console's Bridge jobs list words both;
3. reads the account's library on the server, 500 books a page
   (`GET /bridge/libraries/{id}/books`, at most 2000 pages);
4. skips records without a usable ASIN, and states the rest from
   `UnavailableReason` and `Preorder`: no reason is `available`, a reason with
   `Preorder` set is `preorder`, any other `unavailable` with the reason. Every
   preorder from the orders carries `audible.PreorderReason` ("Not released yet
   (pre-order)");
5. matches them with `importjob.BookMatcher` over `[]link.LibraryBook`, then
   settles books claimed by several titles with `importjob.KeepBest`. The matcher
   is `audiosilo-server/pkg/match.BestWith` under `match.ImportOptions()`: ASIN
   exact first, then author + series + title tokens. A book in several series is a
   candidate under each, and narrators join the person gate (see
   [Matching rules](#matching-rules); a preorder has two more rules, see
   [Preorders](#preorders)). `how` is `asin` when the book's ASIN is the title's,
   else `fuzzy`.

   A book path goes out only as `.` (a library that is one book) or a clean path
   below the root, within the server's 4096-byte limit (`MaxBookPath`). A title
   matched to a book whose path is over the limit can't name that book. So it goes
   out unmatched with `reason: "contested"` and no `contested_path`, counted in
   `overlong`, and a warning logs the path's length. If it went out plain
   unmatched, Back up everything would download a second copy of a book the
   library already has; as contested, it is skipped. One over-limit path never
   rejects the other matches of the batch;
6. **plans** each unmatched title (contested included, never a matched one, nor a
   preorder with no title yet):
   where a backup would go, `planned` (see [Planned destinations](#planned-destinations)),
   with no Amazon request;
7. PUTs the titles in calls of 500 under **one** poll id (the job, the attempt and a
   random suffix), the last one `final` (an empty library sends one empty final
   call, so every title becomes `gone`), with each title's authors cut to 20;
8. **backfills ASINs** (`PUT /bridge/libraries/{id}/enrichment`) for each matched
   book without one. It skips:
   - a book that is [contested](#matching-rules), because nothing durable is
     derived from a doubtful match;
   - a preorder title, which is not out yet, so the book is another edition;
   - a match by words to a book with an identical twin in the library
     (`importjob.Twins`: the same folded title, authors and series). The match is
     kept, but the ASIN isn't stamped on an arbitrary copy.

   `asin_set` and a moved book are skipped, and other failures counted. The PUTs
   are paced (see [Enrichment pacing](#enrichment-pacing)).

The result is counts only, never a title or a credential: `account`, `poll_id`,
`titles`, `available`, `preorder`, `unavailable`, `skipped`, `matched`,
`matched_asin`, `matched_fuzzy`, `contested` (books more than one title claimed),
`enriched`, `enrich_failed`, `enrich_deferred` and `overlong` (both omitted when 0), `books`.
`matched` counts the titles that kept a match.
A poll that finished records `last_poll_at`, the counts and clears a refusal on the
Bridge's row; one stopped, cancelled or lost records nothing.

### Matching rules

`BookMatcher` runs the ASIN step over every candidate, then `match.BestWith` under
`match.ImportOptions()` over the candidates past the person gate. The options turn
on every opt-in rule of the server's `pkg/match` (the table is in
[the server's `pkg/match`](../server/overview.md#pkgmatch-public)); the server's own
callers keep the default rules. `BookMatcher.MatchScored` hands the winning score
(`match.ScoreASIN` for an ASIN match) to the contested rule.

**Positions.** The books listing sends each series' position as a string. It fills
an empty main series position from a code leading the book's folder name:
`DH06 - ...` is `"6"`, and `LAM05-06` the range `"5-6"` (the full rule is at
[`GET /bridge/libraries/{id}/books`](../server/api/reference.md#get-apiv1bridgelibrariesidbooks)).

On the Bridge, a book with a range position in any of its series spans books:

- Its candidates sit at the range's start (`rangeStart`), and a title that is no
  range never sees them. So a single Audible volume never matches an omnibus
  folder, and never gives it that volume's ASIN.
- An Audible title with a range position and no sequence is placed at the range's
  start, so a number in its title ("Pack 3") never stands in for the position
  Audible gave.
- Such a title tries the spanning books that start where it does first, then the
  single volumes, because a pack may be stored as a folder numbered as its first
  volume. A spanning book that starts elsewhere is another pack.
- A pack matched that way to a single-volume folder is kept as a match but not
  enriched (`importjob.SpanMismatch`), so the folder never takes the pack's ASIN.

An ASIN match is never held back by any of this.

**Contested books.** `importjob.KeepBest` settles a path claimed by several titles
(`Claim{Path, Score, Work, Agrees, Disagrees}`):

1. An ASIN match (`match.ScoreASIN`) keeps it.
2. Otherwise, when some claims' series position agrees with the book's, only
   those compete. So the volume whose number is the book's keeps it even over a
   higher score (`MatchScored` itself is not gated by it).
   `importjob.PositionAgrees(rec, b)` compares the title's `SeriesPosition`, as
   one number, against the book's position in the title's series, else the book's
   main series' position, where the books listing puts a folder code's number. A
   range or no number on either side is neither.
3. Then the single best score keeps the match.
4. A tie for the best keeps none, unless every tied title is the same work
   (`WorkKey`: the folded title, the folded authors in any order and the series
   position). Then all keep it: one book owned twice, under two ASINs. A title
   that folds to nothing has no key. Neither does a title with no series position
   that is just its series' name (folded alike, or alike under
   `match.NormalizeSeries`). Audible lists some volumes so, and a tie between them
   keeps none (contested) rather than all.

The losers go out in two ways:

- A losing title whose position **disagrees** with the book's is another volume.
  It goes out plainly unmatched, with no reason.
- The other losers are PUT with no `match`, `reason: "contested"`
  (`link.ReasonContested`, set only on a title with no other reason) and
  `contested_path` (the book's path, omitted otherwise). The console shows them as
  not here and names the book and the other titles, and Back up everything skips
  them.

A contested path gets no ASIN backfill, not even from the title that kept it. Not
this book doesn't settle a contest, because the Bridge never reads `rejected`;
that is a follow-up.

### Planned destinations

Each unmatched title of a poll carries `planned` (`audiblejob/plan.go`,
`titlePlanner`): the import's own `destination()` for the same record, the same
books listing and the params' `template`, **without** the title's `dest_path` (the
console's override is checked when the backup starts):

```json
"planned": {
  "library_id": 1,
  "path": "Ben Aaronovitch/Rivers of London/2 - Moon over Soho/Moon over Soho.m4b",
  "file": "Moon over Soho.m4b",
  "kind": "series_existing",
  "siblings": 7,
  "state": "joins",
  "conflict": "",
  "template": ""
}
```

- `path` is the file's path after `spelled` (as the disk spells the folders that
  exist), `file` its name; both `""` when `state` is `error`.
- `kind` is the placement's: `series_existing`, `series_new` or `standalone`;
  `siblings` how many of the series' books the library lists.
- `state`: `new`; `joins` (siblings, or the path's top folder is a listed book's
  or, when mapped, a folder at the mount); `exists` with `conflict` `file`, `book`
  or `audio` (`vacant`'s refusal, `link.ConflictFile|Book|Audio`); `error` with the
  reason in `conflict` (a template that renders no valid path, say).
- `template` is the template the plan used, as the params gave it (`""` for
  Auto): the console notes when the account's template changed since.
- Disk checks (`spelled`, `vacant`, free functions over a `transfer.LibraryFS`)
  run only when the library is mapped at the Bridge's mount, through a per-poll
  directory cache; otherwise the books listing alone decides (a listed book's
  folder is `exists`/`book`).

### Release dates

`audible.Library` takes a title's date from `release_date`, else `issue_date`. It
keeps only a plausible one (`plausibleDate`: parseable, a year before 2100 and at
most two years after now). With neither, the date is unknown (`release_date` `""`)
and reads as released. Audible sends placeholders such as 2200-01-01 for titles it
has had for years, and those must never be stored as preorders. That is a library
title's rule; a pending preorder from the orders is one whatever its date (see
[Preorders](#preorders)).

`unavailableReason` decides in this order:

1. the delivery type (`Periodical`, `PodcastParent`) comes first, so a show is
   never called a preorder;
2. a plausible release date still ahead (`ReleaseIsUpcoming`) is a preorder,
   whatever `customer_rights` says, because Audible grants no rights to a title
   not out yet;
3. only then do missing download rights make a title unavailable.

A title whose date was set aside is logged once per listing through the client's
`WithLogger`: its ASIN and title, both dates, `content_delivery_type`,
`content_type` and `is_consumable_offline`, never a token or the customer id.

### Preorders

A pending preorder is **not** in the account's Audible library until it is
released. `GET /1.0/library` lists none, and `GET /1.0/library/{asin}` answers
`404`. On a real UK account (2026-11), the orders listing is the only place the API
shows one, so each poll reads it. `audibleacct.Manager.Preorders` does this; it
owns the store, the sign-in and the service. `audiblejob` appends its records to the
library's.

#### The orders

`audible.Client.Orders` reads `GET /1.0/orders`, signed. An order has `date`,
`preorder`, `state`, `detail_state`, `type` and `items`. Each item has `asin` and
`is_preorder`, beside payment fields the client never decodes.

- A title is a pending preorder when its order has `preorder: true` **and**
  `state` `ORDER_PENDING_PREORDER` (`Order.PendingPreorder`).
- A delivered order is `ORDER_CLOSED`/`ORDER_SUCCEEDED`.

The listing reaches back about six months. It ignores every query parameter tried:
`page`, `num_results`, `start_date` and `end_date`, `purchased_after`, `date_range`
and `period`. Any `response_groups` other than the default is a `500`, so the
client sends none. The paging fields read `0`. `Orders` still follows
`max_number_of_pages` in case the listing ever pages: at most 20 pages, stopping at
a page that adds no new order.

#### The catalog

`audible.Client.Products` describes each pending preorder. It reads them again
every poll, so a moved release date is picked up.

- It asks `GET /1.0/catalog/products?asins=a,b,...` in batches of 25. A batch is
  split on a `400`/`414` as `lastpositions` is (`splitOnOverflow`).
- The `response_groups` are `contributors,product_attrs,product_desc,series`.
  Without `product_desc` the catalog sends `title` null.
- A failed batch ends the batches. Every ASIN not yet answered with its title is
  then read alone (`GET /1.0/catalog/products/{asin}`). That covers one left out of
  a batch, one still refused alone, and one in the failed batch or after it.
- There are no single reads when Audible asked to wait (`429`/`503`) or the
  context ended. A single read that fails ends the single reads as well.
- A title the catalog doesn't know (a `404` or `400` alone) is left out.

The records are built as the library's are (`toRecord`), with no customer rights,
then marked `Preorder` with `audible.PreorderReason`.

#### Remembered preorders

Bridge migration `0012_audible_preorders` (`store.AudiblePreorder`,
`store/audiblepreorders.go`) keeps one row per `(account, asin)`:

| Column | What |
|---|---|
| `ordered_at` | the order's date, else when the Bridge first saw it |
| `last_seen_at` | when the Bridge last saw it pending in the orders |
| `record` | the catalog's last description as JSON, `''` until a read succeeds. It is a cache the next fill replaces |
| `filled_at` | no longer written or read. The column stays so a downgrade works |

A row holds no credential and no payment field. Each poll reports every remembered
row, so a preorder whose order has left the six-month window is still reported. The
rows go with the account (`ON DELETE CASCADE`).

**Matching.** A preorder the catalog hasn't described yet (no title) matches by
ASIN only (`matchTitled`) and gets no planned destination. A preorder that claims
the same book as a library title gives way to the library title, uncontested.

#### Drop rules

`reconcilePreorders` and `dropReleased` drop a remembered preorder, by ASIN, when:

- **The library lists it.** The library wins, and the title is reported from there.
- **An order cancelled it.** No order holds it pending, and one holds it in a state
  other than delivered.
- **It was in the orders window and is gone.** The listing's oldest order is older
  than its `ordered_at`, and the listing doesn't hold it, so it was cancelled. An
  empty listing, or one with no dated order, drops nothing.
- **Its release date is `PreorderDropAfter` (30 days) past** and the library still
  doesn't list it. One the catalog never dated counts as released two years
  (`undatedPreorderYears`) after it was last seen pending.

A delivered order (`Order.Delivered`: `state` `ORDER_CLOSED`, `detail_state`
`ORDER_SUCCEEDED`) keeps the title a preorder until the library lists it. The
library can list it a little after the order closes, so the title never drops out
of a final poll in between. That wait is capped. A delivered preorder the library
still doesn't list is dropped `DeliveredDropAfter` (14 days) after the later of its
`last_seen_at` (last seen pending) and its release date. Both bound when the order
closed. The cap covers a refund, or a release under another ASIN.

A dropped preorder is no longer reported, so the server marks the title `gone` at
the next final titles PUT. What the server does with a reported preorder (the
hourly clock, the 14 days, a pending request) is in
[On the server: queueing](#on-the-server-queueing-internalaudibleimportsgo-catalogaudible_importgo).

#### Soft failure

Neither the orders nor the catalog ever fails the poll.

- A failed orders listing, or a sign-in that can't be opened, adds and drops
  nothing beyond the library and release-date rules. One warning is logged, with
  Audible's answer redacted and never a credential.
- A sign-in that can't be opened, or a `429`/`503` on the orders, skips the catalog
  for that poll. The remembered rows are then reported with their last
  description. Any other orders failure still reads the catalog.
- A catalog that fails part way still describes the titles it read.
- A preorder the catalog never described is reported by ASIN alone. The server
  stores it untitled: state `preorder`, the reason, no match, no plan.
- A store failure is a warning too, and nothing is written back.

#### Elsewhere

- An import of a preorder fails `not_released`
  ([step 2](#the-steps-on-the-bridge)).
- Position sync never touches a preorder, since a fuzzy match can put one on a
  book of another edition. `audible.sync` leaves it out
  ([step 2](#audible-to-the-server-audiblesync)). The push loop never writes its
  place, because Audible would deny the content reference every pass.

Both read the store. When the store can't say, they run as before with a warning.

#### Limit

The Bridge can't find a preorder ordered more than about six months before the
account's first poll with this code. Audible's order history has no older pages,
and the catalog's `customer_rights`, `is_preorderable` and `preorder_release_date`
say nothing about this customer's order. Such a preorder is reported once released,
from the library. Every preorder ordered later is remembered.

### Enrichment pacing

A first poll can backfill hundreds of ASINs, one PUT each. The server's
[address limiter](../server/auth-and-security.md#rate-limiting) is shared with the
house's players, and it answers a quick run `429`. The server is unchanged. The
Bridge paces the PUTs instead (`audiblejob.enrich`), at most one per 200 ms
(`enrichGap`).

On a `429` the Bridge waits, then retries the same book and doubles the gap, up to
2 s. The wait is:

- the `Retry-After`, in seconds or as an HTTP date. The link reads it into
  `link.APIError.RetryAfter`, and `RetryAfterSet` records whether it was provided.
- none for an explicit `Retry-After: 0`, including an HTTP date in the past. The
  Bridge retries immediately, within the same attempt cap.
- with no header, 2 s, doubling with each `429` in a row.

The poll leaves the rest of the backfill to the next poll after:

- five `429`s in a row;
- a `Retry-After` over a minute;
- 10 minutes of enriching (`enrichBudget`).

Those books still have no ASIN, so the next poll picks them up again. Their count
is the result's `enrich_deferred`. Only a cancelled job fails the poll.

Registering the `audible.poll` kind adds `audible` to the heartbeat's features
(`bridge.FeatureAudible`). The `audible` module needs that feature.

## Backing up a title (`audible.import`)

The **server decides** what to back up and when: a console request, Back up
everything, an account's policy after a poll, or a preorder's pending request. The
**Bridge downloads** the title for the account, removes the DRM and places it in the
account's library. The server never talks to Audible and never sees a key.

### The job

| | |
|---|---|
| Kind | `audible.import` (`bridge.KindAudibleImport`; the Bridge's `audiblejob.ImportKind`), feature `audible` |
| Internal | yes. `POST /admin/bridge/jobs` refuses it with `400` |
| Needs | `writes` (a writable books mapping), `libraryKind` books, no book path (`bookNone`) |
| Module | owned by the `audible` module (`ModuleFor`), so it is held while the module is off |
| Notified | yes, it is **not** quiet. A done or failed one is notified and named by the title (`notifyBridgeJob` reads the title's name) |
| Dedupe | one open job per account and title (`audibleImportSuffix`: `\|<account>\|<asin>`). A repeat returns the open one |
| Bridge lane | `download` (`jobs.LaneDownload`, 1 slot by default, shared with `podcast.fetch`). On top of that, one import per account runs at a time (a per-account gate, `Importer.gate`) |
| Library | the job row's `library_id` is the account's library at queue time |

**Params.** The server builds them (`catalog.importParams`) from the account and the
title at queue time. The server reads them strictly (`audibleImportParams`). The
Bridge reads them leniently (`audiblejob.ParseImportParams`): it ignores unknown
fields and upper-cases the ASIN.

```json
{ "account": "k3v9x0p2m4q8r1t5", "asin": "B0FAKE0002", "library_id": 2, "dest_path": "", "template": "" }
```

- `dest_path` is the console's destination for the title
  (`audible_titles.dest_path`), `""` for none. It is a library-relative file path,
  or a **folder** when its last segment has no audio extension. The server checks
  it with `bridge.CheckAudibleDestPath`. The rules are in the
  [API reference](../server/api/reference.md#patch-apiv1adminaudibletitlesaccountasin).
- `template` is the account's placement template (`audible_accounts.template`),
  `""` for the Bridge's automatic placement. The server checks it with
  `bridge.CheckAudibleTemplate` ([The template grammar](#the-template-grammar)).

Both are copied in at queue time, so editing either later never changes a queued
job.

**Progress** is `{"step", "message", "done", "total"}`. `step` runs through these
in order:

1. `license`, also while the job waits for the account's gate or the mapping check;
2. `download`;
3. `decrypt`;
4. `place`;
5. `rescan`;
6. `enrich`.

`done` and `total` are bytes during `download` and `place`.

**Result** of a done job:

```json
{
  "library_id": 2,
  "path": "Mara Quill/OC02 - The Copper Grove",
  "files": [{ "path": "Mara Quill/OC02 - The Copper Grove/The Copper Grove.m4b", "size": 67984 }],
  "bytes": 67984,
  "enriched": true
}
```

This is the fake's title placed beside `Mara Quill/The Glass Orchard`, which is
book 1 of its series in a folder with no code. Auto kept the author folder and
guessed the code.

- `path` is the **book** path that `POST /bridge/rescan` answered for the placed
  file. A single-file book's path is its file.
- `files` is what the Bridge placed.
- `enriched` says whether the book now carries the title's ASIN. It is `false` when
  the book had one already, when the server refused it (`asin_set`), or when the
  file joined a book that isn't the title's.

**Failures** are `audiblejob.Failure` `{"code", "message"}`, sent both as the result
and as the error. The server reads the code with `bridge.AudibleImportCode`: a
park's code, else the result's `code`, else an error that starts with a known code.

| Code | When |
|---|---|
| `not_released` | The title is a preorder: a remembered pending one, or a library title with a release date ahead. Or Audible's license denial says it isn't out (`audible.ErrNotReleased`) |
| `no_rights` | The title is neither in the account's library (`ErrNotInLibrary`) nor a remembered pending preorder. Or Audible won't let it be downloaded (`UnavailableReason`: no rights, a show or a periodical). Or the license is denied for rights (`ErrNoRights`) |
| `audible_refused` | Audible refused the account's sign-in (`audibleacct.ErrRefused`, and the account is marked refused), or refused the license for another reason (`ErrDenied`). Or Audible denied the device as throttled (`ErrThrottled`, a device on an older [profile](#the-device-profile)). Then the message is `ThrottledText`'s advice to sign in again on the Bridge, the account is marked refused, and its later imports fail at once until a sign-in again |
| `not_writable` | The library isn't the account's, isn't a books library the server lists, or isn't mapped **and** writable at the mount in use. Or the destination or template gives no valid path: `transfer.CleanRel`'s refusals (a hidden segment included), or an audio extension other than `.m4b`, `.m4a`, `.mp4`. Or the path is one the Bridge can't follow: a file where a folder goes, a link out of the mapping, an unreadable folder. Or the install hit a read-only filesystem or a permission refusal |
| `exists` | Something is at the destination (a different file, a folder, a link). Or the destination is inside a book the library already has: its folder is a listed book's, or already holds audio. The Bridge checks this **before** the license, and again at the install |
| `disk_full` | Before writing a byte, the Bridge found free space short in its temp folder (2.2x the size, less what the partial holds) or at the library's nearest existing folder (1.1x, `transfer.DefaultHeadroom`). Or the download, the decrypt (ffmpeg's words too) or the copy hit ENOSPC/EDQUOT. A free space that can't be read is no refusal |
| `offline_url_expired` | The presigned download URL answered 401/403/410 again after the one new license |
| `unknown_account` | The account is not this Bridge's, or is mapped on another server |
| `drm_free` | Audible offers the title only as a DRM-free MP3 (`audible.ErrDRMFree`), which the Bridge doesn't back up yet |

A download over `DownloadOptions.MaxBytes` (`audible.DefaultMaxDownloadBytes`,
4 GiB) fails with no code, as do other errors. The server's
`bridge.AudibleImportCodes` lists every code above, and the console words each one.

**Not writable while running.** The job waits for a mapping check the mount hasn't
had yet (`mappingPoll`, 1 s), with no park. When the mapping isn't writable:

- a **new** job is refused at once;
- a **resumed** job parks `not_writable` (`Reporter.Park`, `progress.park.code`);
- any job at the `place` step parks `not_writable` too. The Bridge checks the
  mapping again before the copy, since it may have changed during the download.

A parked job runs on once the mapping is writable again, and keeps its download.

### The steps on the Bridge

`audiblejob.Importer.Run` (`import.go`) runs these steps:

1. **Gate and checks.** It takes the account's gate. It checks the account (this
   Bridge's, mapped on the paired server) and the library (the account's, mapped
   and writable).
2. **The title.** `Manager.Title` reads `GET /1.0/library/{asin}`, signed. On
   `ErrNotInLibrary` it takes a [remembered preorder](#preorders)'s record
   instead. A preorder fails `not_released`, and an unavailable reason fails
   `no_rights`.
3. **The destination** (`audiblejob.Destination`). **All of this happens before
   the license and the download.**
   - `dest_path` comes first, and the template isn't consulted.
   - Else the template (`placement.ModeTemplate`).
   - Else Auto: `importjob.Plan` over the paged books listing. It follows the
     series siblings' folder and code convention, else an existing author folder's
     spelling, else `Author/Title`. An empty author folder is dropped.

   Then `transfer.OnDisk` spells the path as the disk spells the folders that
   exist. That is the path the server indexes on a case-insensitive disk. Last,
   `vacant` refuses an occupied destination (`exists`).
4. **License** (`Client.License`): the AAXC URL, key, IV and size.
5. **Download** to `<data>/audible/tmp/<account>-<asin>.aaxc.part`
   ([Resume and temp files](#resume-and-temp-files)).
6. **Decrypt** (`audible.Decrypt`: `ffmpeg -audible_key <key> -audible_iv <iv> -c copy
   -f ipod`) to `<account>-<asin>.m4b` in the same folder. Then the partial is
   deleted, to make room for the copy.
7. **Place** (`transfer.Local.Place`,
   [The hardened transfer](#the-hardened-transfer-internaltransfer)), after the
   mapping check again.
8. **Rescan** (`POST /bridge/rescan` with the placed file, 3 tries). The server
   answers the book path. A failure here says the book is placed.
9. **Enrich** (`PUT /bridge/libraries/{id}/enrichment` with the title's ASIN; see
   [Enrichment after placing](#enrichment-after-placing)).

### Resume and temp files

The temp folder is `<data>/audible/tmp/` (`0700`), one set of files per account and
title:

| File | What |
|---|---|
| `<account>-<asin>.aaxc.part` | the partial download, and its state file `.aaxc.part.state` (`audible.StatePath`: `{size, etag, last_modified}`, written before the body) |
| `<account>-<asin>.m4b` | the decrypted copy, always removed when the run ends |
| `<account>-<asin>.placed.json` | the placement marker, written after the install (below) |

**`audible.Download`** resumes a partial only when its state file agrees with
`DownloadOptions.ExpectedSize` (the license's size) and holds a validator or a
size. The `Range` request carries `If-Range` (a strong ETag, else
`Last-Modified`).

| Answer | What the download does |
|---|---|
| `200` | replaces the partial |
| `206` at another offset or for another total | starts again |
| `416` for another file | starts again |
| `200` without a length | is held to `ExpectedSize` |
| a short body | fails with `io.ErrUnexpectedEOF` |

Starting again removes the partial first. A partial it can't remove ends the
download.

Each attempt runs under a stall watchdog (`downloadStall`). Two minutes with no
answer or no byte fail it with `ErrStalled`, and the partial is kept. A `ctx`
cancel stops the download mid-body. Its errors never name the presigned URL's
query.

**The importer's loop.** A dropped connection, a stall or a `5xx` resumes from the
partial, after waiting 2 s, then 8 s. Only `downloadAttempts` (3) attempts **in a
row that add nothing** fail the job, so a long download over a link that drops now
and then finishes. A `401`/`403`/`410` means the URL expired over a long wait or a
restart. The importer licenses once more, and a second one fails
`offline_url_expired`.

**Who keeps the partial**, from the gate on:

- a **stop** (`jobs.Resumes`: the Bridge shutting down, a refused token) keeps the
  partial and its state for the next run;
- a **lost claim** (`jobs.Lost`: the lease lapsed and the server hands the job out
  again) keeps them too;
- a **cancel** or a **failure** deletes them (`audible.RemovePartial`);
- `Importer.Abandon` deletes them for a job the runner ends without running it,
  unless its claim was lost;
- the decrypted copy always goes.

**The start-up sweep** (`audiblejob.SweepTmp`, from `app.newAudible`) keeps only
`*.aaxc.part` files younger than `PartialMaxAge` (7 days) with their state, and
placement markers as young. Everything else in the folder goes.

**The placement marker.** After the install the Bridge writes
`<account>-<asin>.placed.json`. It holds `library_id`, the request's `dest_path`
and `template`, the placed `path`, `size`, `mtime_ns` and the join verdicts. The
marker counts while the library holds exactly that file: its size, and its
modification time within `markerSlack` (2 s). Then:

- a retry of the same request goes on from the rescan, with no second license or
  download, and gives the same result;
- a request whose destination turns out to be that file finishes it too;
- a request for another destination places anew. The earlier copy stays where it
  is, and the Bridge logs it.

A changed or replaced file drops the marker (`exists`). A file that can't be read
now keeps the marker and fails, to try again. The result removes the marker.

### The hardened transfer (`internal/transfer`)

`transfer.Local.Place` is the only writer into a library. It is hardened in three
ways.

- **Contained.** It opens the mapping's root first as an `os.Root`. A missing root,
  or a root that is a file, fails before the source is read. Every call goes
  through the root, so a symlink can't lead out. `transfer.CleanRel` applies
  `mapping.SafeJoin`'s rules. It also refuses an empty path and any hidden (dot)
  segment, which the server never indexes (`ErrInvalidPath`).
- **No replace.** The same bytes already at the destination are `AlreadyPresent`
  (an earlier run's copy). Anything else there (a different file, a folder, a link)
  is `ErrExists`. The copy is staged as a `.audiosilo-import-*.part` dotfile beside
  the destination (`0644`, synced, size-checked). `fsutil.InstallNoReplace` then
  installs it with an exclusive hard link, else `RenameNoReplace`. That is
  `renameat2(RENAME_NOREPLACE)` on Linux and a check-then-rename elsewhere; it is
  the podcast episode install's primitive, moved into `fsutil`. A file that raced
  in is kept: `ErrExists`, or `AlreadyPresent` when it is these bytes. A failure or
  cancel leaves no staged copy.
- **Free space.** It needs 1.1x the file (`DefaultHeadroom`) free at the nearest
  existing folder, else `ErrDiskFull`. A free space that can't be read is no
  refusal. ENOSPC/EDQUOT during the copy is `ErrDiskFull` too.

**Why joining an existing book is `exists`.** A backup is a book of its own. The
server's scan would make a file part of an existing book when it is placed in a
listed book's folder, or in a folder that already holds audio. The server refuses
such a done import (`ErrImportNotOwn`, in
[The done fold](#on-the-server-the-done-fold)). So `vacant` refuses that
destination before the license (step 3). The one join left is a `dest_path` into a
new disc folder of a disc set, which never takes the ASIN.

### Enrichment after placing

The book the rescan answers decides. `joinedBooks` gives a verdict to each book the
file could join: at its own path, at its folder, or at a disc set's folder above
it. The verdict is yes when `importjob.BookMatcher` picks that book for the title
and it isn't `importjob.SpanMismatch` (the poll's rule).

- A book with a verdict takes the ASIN only when its verdict is yes.
- Any other book is new, and takes the ASIN. That includes the title's own book,
  and a pack placed as a pack.

The placement marker keeps the verdicts. The one PUT waits out `429`s as the poll's
enrichment does (`limitWait`), then gives up with `enriched: false`. `asin_set` and
a moved book are `enriched: false` too, with no failure.

### Secrets

The license's key and IV live **in memory and in ffmpeg's argv only**. They are
never in a log, progress, result, error or file, and the import's tests walk all of
those for the stub key.

- `audible.License` redacts itself (`String`, `GoString`, `LogValue`), and its
  `MarshalJSON` refuses.
- ffmpeg's stderr is redacted of the key and IV in any case, since ffmpeg echoes a
  bad key.
- A voucher that won't parse is reported without its bytes.
- The argv is visible in the container's process table. That is accepted.
- The download URL is presigned, and errors name it without its query.

The account's sign-in stays in the vault ([Who holds what](#who-holds-what)).
`Title` and `License` go through `Manager.signed`. A refusal there retries once
with a newer sign-in, else marks the account refused. `Download` only opens the
sign-in. Its `401`/`403` is an expired URL, which the import licenses again, never
the account's refusal.

### On the server: queueing (`internal/audible/imports.go`, `catalog/audible_import.go`)

`audible.Queues` queues a job (`bridge.Enqueue`) and records it on the title
(`catalog.SetAudibleImport`: `import_job_id`, clearing `import_pending`). A repeat
finds the open job by its dedupe key and records it too, so a crash between the two
heals.

**Priorities:**

| Who | Priority | Requester |
|---|---|---|
| a console **Back up** (`priorityBackup`), and a preorder's pending request when a poll queues it | `0` | the admin; the server (`0`) for a pending one |
| an account's **policy** after a poll (`priorityPolicy` = `schedulerPriority`) | `-10` (as the podcast scheduler's fetches and the scheduled polls) | the server |
| **Back up everything** (`priorityBackupAll`) | `-20` | the admin |

Back up everything sits below new podcast episodes. So a bulk backup in the
Bridge's one download slot never holds them back for days.

**"On this server"** is a match not marked Not this book (`rejected = 0`). Back
up's `already_matched`, the policy's pending drop, the titles' `matched` filter and
the accounts' `matched` count all read it that way.

#### Back up

`RequestAudibleBackup` answers:

- `unknown_account` or `unknown_title`;
- `account_paused`;
- `already_matched`;
- `import_open` for an open job, or a pending request;
- pending for a **preorder**. It stores `import_pending = 1` and queues no job. The
  request survives a restart;
- `not_available` for `unavailable` or `gone`.

Contested titles are allowed. So is a title whose last backup is done, once it is
no longer on this server: the admin decides. `retryImportSQL` is Back up
everything's alone.

#### Back up everything

`AudibleBackupAll` (`backupAllSQL`, which also gives the `backup_estimate`) takes
the titles that are:

- `state = 'available'`, with no match;
- not `rejected`, not `ignored`, and not `contested` (`contestedSQL`:
  `reason = 'contested'`);
- passed by `retryImportSQL`: no backup yet, or the latest backup isn't open and
  isn't a `done` one whose result's book is still indexed.

So a failed or cancelled backup is tried again, and a backed-up title whose book
left the library (deleted or moved) is queued again. A refused fold
(`ErrImportNotOwn`) isn't queued again every time.

It stops at the first refusal of the queue that means none would be taken
(`kind_unavailable`, `library_not_writable`), with what it queued so far. The
estimate is `runtime_s x 8000` bytes (64 kbps AAXC), labelled approximate.

#### The policy

`AudiblePolicyImports` runs from `afterAudiblePoll` after each `final` titles PUT,
within 10 s. It runs only while the module is on and an online Bridge offers
`audible.import`. What it misses, the next poll asks again.

It queues none for a paused account, or for one mapped to a person it may no longer
be. It first drops pending requests for titles now on this server. Then
`autoImport.wants` (a table test) decides per title:

1. The title must be available, not on this server, with nothing open, and not
   ignored.
2. A **pending request** is then **always** queued, at priority `0`.
3. Otherwise the title must also be not rejected, not contested and never attempted
   (no `import_job_id`), with `first_seen` **after** `policy_since`. And the policy
   must be `all`, or `series` when the account's person has a book of one of the
   title's series. `seriesOwner` decides that by series key, main or other series,
   in a library the person's scopes reach.

A refusal of the queue that means none will be taken (`library_not_writable`,
`kind_unavailable`) ends the pass quietly.

#### `policy_since`

`policy_since` makes policies apply to new purchases only. The server sets it to
now:

- at the account's creation (the Bridge's first `PUT /bridge/audible/accounts`);
- when the console turns `all` or `series` on (`PatchAudibleAccount`). Switching to
  `manual` leaves it.

It moves to the account's **first complete poll** (`PutAudibleTitles` when
`last_poll_at` was `NULL`), so that poll's titles count as the library the account
already had. The Bridge's account PUT sets `policy` on create only. After that the
console owns it.

#### Preorders on the server

`preorderWaitingSQL` selects a `preorder` that a backup may wait for:

- its `release_date` is on or before today's UTC date, and less than
  `AudiblePreorderWait` (14 days) ago;
- it is not on this server and not rejected or ignored, or it has a pending
  request while not here.

An account with such a title is due **every hour** (`DueAudiblePolls`) instead of
every `poll_hours`. Past the 14 days the title reads `needs_attention: true`
(`preorderOverdue`, on the same terms; derived, with no column), and the hourly
clock stops. The first poll that reports the title `available` queues a pending
request. Where the Bridge finds preorders is in [Preorders](#preorders).

### On the server: the done fold

`FoldAudibleImport` runs from the jobs' `OnEnded` hook for a done `audible.import`:

1. The result must name the job's library (and the params' library) and a clean
   book path, else `ErrImportNotIndexed`.
2. `importOwnBook` checks the book. It must be indexed in a books library, else
   `ErrImportNotIndexed`. It must be the **title's own**, else `ErrImportNotOwn`
   (logged). The title's own book carries the title's ASIN, or holds **only** the
   files the backup placed (a single-file book is its file). A file the scan joined
   into a folder book already there never makes that book (nor another title's)
   this title's match. Nor does it ever match the book the admin marked Not this
   book for the title.
3. It sets the match (`match_how = 'import'`) and clears `rejected` and
   `import_pending`, only while `import_job_id` is still this job.

A later poll keeps an `import` match while its book is indexed and the poll names no
other match for the title (`importMatches`). The poll may have listed the library
before the backup landed. A failed job leaves the title as it was, and the console
shows its code (`import.code`).

Removing an account cancels its open imports (`bridge.CancelAudibleImports`, in the
account's delete transaction, `CancelAudibleRemoved`). That holds whether the
Bridge or the console removed it.

### Migration `0064_audible_import`

- `audible_accounts.template TEXT NOT NULL DEFAULT ''`
- `audible_accounts.policy_since TEXT NOT NULL DEFAULT ''`, backfilled
  `COALESCE(last_poll_at, created_at)`. An account that polled starts from its last
  poll, and one that never did starts from its creation.
- `audible_titles.import_pending INTEGER NOT NULL DEFAULT 0`

No new table. `policy_since` joins the user-state rule's free columns of
`audible_accounts` (`store/userstate.go`), as the two poll times do. A titles write
is a user-state write. The Bridge's `0010_audible_profile` belongs to
[the device profile](#the-device-profile).

### Migration `0065_audible_planned`

These columns hold what the console says of a title the Bridge left unmatched.

- `audible_titles.planned TEXT NOT NULL DEFAULT ''`: the title's planned
  destination as JSON, `''` for none.
- `audible_titles.contest_library_id INTEGER` and `contest_path TEXT NOT NULL
  DEFAULT ''` (NULL and `''` for none), with a partial index on both: the book a
  contested title tied for. They are path-keyed with no FK. A move or a join
  carries them like a match's path, and the library's delete clears them.

All three belong to the poll. Each titles PUT writes them, and a stored match
clears them: the poll's match, a kept `import` match, or `FoldAudibleImport`'s. A
title the final call marks `gone` loses its plan.

The PUT checks `planned` strictly (`checkAudiblePlan`; the rules are in the
[reference](../server/api/reference.md#put-apiv1bridgeaudibleaccountsaccounttitles)).
The exception is a `path` over `MaxPathBytes` (Audible's long text through a
template), which is stored as an `error` plan. A contest is stored only for the
account's library.

`GET /admin/audible/titles` shows:

- `planned`, only while the account is mapped to the plan's library;
- `contested {library_id, path, with}`, only while the account is mapped to the
  contest's library. `with` lists the account's other titles (not `gone`)
  contested over that book or matched to it, at most 10 (`fillContests`, one query
  a page).

**Deploy the Bridge with the server.** There is no capability gate; see the
[cross-repo contract](../architecture/cross-repo-contract.md#16-the-bridge).

### The template grammar

`bridge.CheckAudibleTemplate` is a copy of the Bridge's `placement.Parse` grammar.
Keep `audibleTemplateVars` in step with `placement.knownVars`, and `templateMods`
with `parseMods`. The grammar has:

- literal text;
- `{Var}` or `{Var:mods}`, where the mods are `width=N`, `upper`, `lower` and
  `trim`, comma-separated;
- optional groups `{ ... }` that collapse when a variable inside renders empty;
- `\` escaping the next character.

The variables are `Author`, `Series`, `Title`, `TitleShort`, `Seq`, `PaddedSeq`,
`SHORTCODE`, `ASIN`, `Narrator`, `Year`, `OriginalFilename` and `Ext`.

The server also refuses a template over 500 bytes, a control character, a leading
`/`, a `..` segment and a hidden, dot-led segment (the scan skips those). The
Bridge parses the template again when it places, and allows up to 1024 bytes.

A rendered last segment ending `.m4b`, `.m4a` or `.mp4` names the file. Anything
else is a folder, and the title's file name (`<title>.m4b`,
`audible.safeFileName`) goes in it. A template that renders no valid path is
`not_writable`.

## Position sync: `audible.sync` and the push loop

Position sync keeps an account's listening places in step with Audible, both ways.
The code is `internal/audiblesync` on the Bridge, and `catalog/audible_sync.go`,
`api/handlers_audible_sync.go` and `0066` on the server.

- **Furthest wins** in both directions. Audible's place never moves the server's
  back, and the Bridge never writes over a place Audible moved on from.
- Only places travel. No listening session, `listening_daily` or history row is
  ever written for Audible's listening, and nothing is recorded against the bridge
  token.

### The switches (server)

**Per account** is `audible_accounts.sync`, which only the console sets:
[`PATCH /admin/audible/accounts/{account}`](../server/api/reference.md#patch-apiv1adminaudibleaccountsaccount)
`{sync}` (audited `bridge.audible.account`).

- `0066` turned every account off. A new account is created off, and a Bridge PUT
  never turns it on (the server reads its `sync` and ignores it).
- Turning it off cancels the account's open sync (`bridge.CancelAudibleSyncOff`,
  "sync with Audible was turned off for the account"). Turning it on queues one at
  once.
- A Bridge PUT that maps the account to **another person** turns sync off, forgets
  `last_sync_at` and cancels the open sync. The admin turned sync on for the person
  the console showed then.

**Per title** is `audible_titles.no_sync`, the console's "Don't sync this book":
[`PATCH /admin/audible/titles/{account}/{asin}`](../server/api/reference.md#patch-apiv1adminaudibletitlesaccountasin)
`{no_sync}` (audited `bridge.audible.title`). A poll keeps it, as it keeps
`rejected` and `ignored`. It is separate from `rejected` (Not this book). Only the
sync reads it; backups never do.

**A title syncs** when `syncTitleSQL` holds: matched, not `rejected`, not
`ignored`, not `no_sync`, not `gone`, not `preorder`.

A poll may match a preorder to another edition on disk, and Audible holds no place
for an unreleased ASIN. So the server leaves a preorder out of both directions:

- it is not in `audible.sync`'s params;
- the listening route rejects it with `not_synced`;
- it is not in the progress feed.

The Bridge's own `skipped_preorder` stays as a second guard. Once the title is
released (`preorder` to `available`), `0071`'s trigger offers its book's place to
Audible again, as for a title back from `gone`.

**An account syncs** while all of these hold:

- the module is on;
- its `sync` is on;
- it isn't paused;
- `refused_at` is NULL;
- its person may still be synced for (`bridgeUserSQL`: not disabled, not a kid,
  not a demo account).

### Audible to the server: `audible.sync`

**Queueing.** The `audible` module's scheduler (`audible/scheduler.go`
`queueSyncs`) runs while the Bridge offers the kind. It queues one `audible.sync`
at priority `-10` for each account `DueAudibleSyncs` returns. That is an account
that syncs ([The switches](#the-switches-server)) with `sync_queued_at` older than
`bridge.AudibleSyncEvery` (15 minutes). It queues none for an account with no
synced title.

Some console changes queue the account's sync at once (`audible.SyncNow`):

- a change to which titles sync (`{rejected}` or `{no_sync}` on a title);
- turning sync on.

`catalog.AudibleSyncQueueable` applies the same rule without the 15 minutes, and
needs an online Bridge that offers the kind. A title change queues even an empty
title list, so the Bridge drops a left-out title now.

**The kind:**

- is internal and quiet;
- is owned by the `audible` module, and held while the module is off;
- is deduped per account and `promotes`: a queued one takes the newest titles, and
  one the Bridge already runs keeps its own;
- keeps only the newest ended job of each account (`pruneAudibleEnded`).

Its params are server-built and strict on both sides (`audibleSyncParams`,
`link.AudibleSyncParams`), at most 1 MiB. `AudibleSync` drops the last titles past
that size.

```json
{
  "account": "k3v9x0p2m4q8r1t5",
  "titles": [
    { "asin": "B0EXAMPLE1", "library_id": 1, "path": "A. Writer/The Example", "runtime_s": 36000 }
  ]
}
```

Each ASIN appears once, `library_id` is above 0, `path` is a clean book path (or
`.`), and `runtime_s` is not negative.

**On the Bridge**, `audiblesync.Handler` runs in the light lane:

1. **Refusals.** A device refusal fails the job **`audible_refused`**, and the
   server stops queueing until a sign-in again maps the account. A sign-in refusal
   fails it **`audible_sign_in`**. The server treats that as an ordinary failure and
   keeps queueing, and the next poll Audible answers ends it. Another server's
   account, or none, is `unknown_account`.
2. **The titles.** It leaves out the titles the account remembers as pending
   [preorders](#preorders) (`skipped_preorder`) and stores the rest
   (`store.ListAudibleSync`). Then, while the account's `sync_retry_at` is ahead,
   the job ends done with `waiting` without calling Audible.
3. **Audible's places.** It reads them with `lastpositions`, 25 ASINs a request,
   split on a `400` or `414`. A failure fails the job `audible_error`. A `429`/`503`
   also waits Audible's `Retry-After`, counted from when it came back and at least
   2 minutes (`sync_retry_at`).
4. **Skips.** It skips:
   - a place under 1 s;
   - a place past the runtime by more than 5% plus 2 minutes. Audible's runtime is
     minute-rounded, so a place past it means a wrong match;
   - a place older than 85 days, since the server refuses events past 90;
   - a place within 5 s of the place last written to Audible (its own echo).
5. **Posting.** It posts the rest to
   [`POST /bridge/audible/accounts/{account}/listening`](#the-two-bridge-routes),
   200 events a call. Each place is a `listen` of no length: `from_pos` = `to_pos`,
   `started_at` = `ended_at` = Audible's `last_updated`, and `start` `jump`. A place
   at the book's end adds a `finish`. The end is 98% in, or within 3 minutes of the
   end once 90% in.
6. **Heard.** It records `heard_ms` for each place the server answered and didn't
   reject. `store.AudibleHeard` clears a `last_ms` written before the job began. An
   applied place drops a place the push was waiting to write from the row it had
   then, because that place would move Audible back.
7. **Re-assert.** It writes again a place the Audible app overwrote. The app may
   upload the older place it still held over one the push wrote, and the sync then
   reads it as `behind`. `store.RearmAudiblePush` sets `want_ms` to the row's place
   and `row_seen` to now when all of these hold:
   - the Bridge wrote the title's last place (`last_ms`);
   - the server row it last read is still that place (within 5 s);
   - Audible's place is more than 5 s behind it.

   The push then writes it again after `StillFor`. The re-arm is guarded in SQL:
   only while the title is listed, nothing is waiting, and no push and no new
   server row came since the job read it. The push's read before the write still
   drops it if Audible moved further on meanwhile.

   **At most once per written place** (`reasserted_ms`, Bridge migration `0014`).
   A sync can't tell the app's stale upload from a listener who rewound in the
   Audible app and listens on there. So once a place was written again, Audible
   behind it again is left alone, and an Info log says so. That lasts until the
   push writes a new place: `AudiblePushed` of another place, or another book for
   the title, resets it. A `duplicate` answer re-arms nothing.

**Server answers.** `sync_off` from the server ends the job quietly (done,
`sync_off`). `user_unavailable` fails it with that code.

**The event id** is `aud-` and the first 32 hex characters of
`sha256(account|asin|position_ms|last_updated|kind|library_id|path)` (`EventID`).
`kind` is `""` for the listen and `finish` for the finish. So an unchanged place is
the same event (a `duplicate`) at every sync. The same place on a title matched
again to another book is a new event.

**The job's result** is counts and flags only:

- `account` and `titles`. `titles` counts the titles kept, after
  `skipped_preorder`;
- `heard`, `sent` and `finished`;
- the server's `applied`, `duplicate`, `behind`, `not_applied` and `rejected`;
- `reasserted` (step 7), omitted when 0;
- the skips: `skipped_echo`, `skipped_past_runtime`, `skipped_old`,
  `skipped_start` and `skipped_preorder`;
- `mismatched`: events the server rejected `duration_mismatch`. They are counted,
  sent once a job and never retried in it;
- `waiting` with `wait_until`, or `sync_off`.

A failure's result is `{code, message}`.

**The server's fold** (`OnEnded`, `catalog.FoldAudibleSync`):

- A done sync that read Audible's places (`bridge.AudibleSynced`: neither `waiting`
  nor `sync_off`) sets `last_sync_at`.
- A sync failed with `audible_refused` sets `refused_at`, which stops the
  scheduler. `AudibleSyncCode` reads the code from the result's `code`, or from an
  `audible_refused:` error prefix.
- Any account PUT of the Bridge's (a fresh sign-in, an edit) clears `refused_at`
  and stamps `refusal_ended_at` (`0071`). So does a complete poll
  (`PutAudibleTitles` with `final`: Audible answered the account).
- A refused sync claimed in an earlier second than that stamp ran before the fresh
  sign-in, so it marks nothing (`refusalEndedSince`). `claimed_at` is whole
  seconds, so one claimed in the same second still marks.
- `audible_sign_in` (`bridge.SyncAudibleSignIn`) is a sync's code only, never an
  import's, and an ordinary failure.

### The server's side of a batch: furthest only

The listening route builds the batch itself: `SyncBatch{UserID: the account's
person, DeviceID: "audible:<account>", DeviceName: "Audible (<label or STORE>)",
TokenID: 0, FurthestOnly: true}`. No request body can set `FurthestOnly` or `TokenID`, because
`POST /me/listening/sync` refuses an unknown field.

For each event:

1. The route resolves the event's book under the **person's** scopes
   (`userPathResolver`, `catalog.UserScopes`).
2. The book must be a synced title's match (`AudibleSyncBooks`).
3. The title's Audible length must agree with the book's (`audibleRuntimeAgrees`),
   for a listen and a finish alike. The book's length is its indexed duration, else
   the `duration` on the person's own progress row for it. That is the progress
   feed's rule, so the two never disagree.
4. `FurthestOnly` (`furthestListen`) then applies only a place more than
   `furthestSlack` ahead, over any device's row. It keeps the row's `updated_at`,
   speed and offer. It compares `finish_changed_at` for a place from before a
   finish or a restart. `furthestPastEndRatio` (the manager's wrong-match guard)
   refuses a place well past the end.

A device's diverged span then offers Audible's place by name (the row's
`device_name`, in `other_place`). The rules and each event's
`rejected`/`not_applied` reason are in the
[API reference](../server/api/reference.md#post-apiv1bridgeaudibleaccountsaccountlistening).

**The device id `audible:<account>`** (`catalog.AudibleDevicePrefix`) belongs to
the listening route alone.

- `POST /me/listening/sync` refuses a batch naming one (`400 device_id is
  reserved`).
- A `PUT .../progress` naming one (a row echoed back) saves under no device id.
- An edit of the row (`EditProgress`, the listener's or an admin's) clears the
  device id. So the edit reaches the feed, and Audible's next place can't undo it
  unseen.
- A listening import (Audiobookshelf) that moves on such a row clears its device id
  and name the same way (`importer.mergeProgress`). Its undo restores the earlier
  place under no device either (`progressPrior.restored`), never as Audible's, so
  the feed carries the undo to Audible too.

### The server to Audible: the push loop

`audiblesync.Pusher` is not a job, so it adds no job row a minute. Every minute
(`PushEvery`) it visits each account mapped here that isn't refused, waiting or
paused.

**Reading the feed.** For each account it reads the feed
[`GET /bridge/progress`](#the-two-bridge-routes) from the account's `push_cursor`.
Both the cursor and the baseline (below) start again when the account is mapped to
another server, person or library.

- The feed pages in the server's write order, and may give a row again with
  `updated_at` unchanged. So a row is new by its **place** alone, never its time or
  version. A new version at the same place never re-arms a push.
- The baseline is every read until one reaches the feed's end. It takes only rows
  of the last 10 minutes by `updated_at`, and records the older ones as history,
  never pushed. After the baseline, every row read is new.
- A row the Bridge fails to record keeps the cursor, so the pass reads it again.
- It skips rows written by `audible:<account>`.
- A row on a title the last sync didn't list for that book stays pending (`listed`
  0, `store.PendAudiblePush`) until a sync lists it.

**Writing a place.** A place is ready when it has been **still for 3 minutes**
(`StillFor`, since `row_seen`). That is the Bridge's own clock seeing the same place
for that long, so a push lands up to about 4 minutes after the listener stops. The
loop then drops a place:

- under 1 s;
- within 5 s of `last_ms` (debounce) or `heard_ms` (echo);
- past the runtime.

It checks no length of its own. A book whose length disagrees with the title's
runtime never reaches it, since the feed leaves that row out (the server's
`duration_mismatch` rule).

It reads Audible's places once (`Positions`). It drops a place Audible moved on from
since: over 5 s further on, and neither `last_ms` nor `heard_ms`. Furthest wins,
and the next sync brings Audible's place in. Otherwise it writes the place:

1. `ContentACR` once per ASIN, cached. When a write answers `400`/`404` for a
   cached one, the loop reads it again and tries the write once more.
2. `SetPosition` (`PUT lastpositions`).

The server's place is sent as it is, so a move back on the server reaches Audible.

**Errors never refuse the account.** All the waits below are in memory, for this
loop only.

| Answer | What the loop does |
|---|---|
| Audible `429`/`503` | keeps the place and waits its `Retry-After`, at least 2 minutes, counted from the failure |
| Audible `5xx` or no answer | keeps the place and leaves the account for 2 minutes |
| Audible's other `4xx`, or a denied license (`audible.IsDenial`) | drops the place |
| a throttled device | drops the place and leaves the account for 15 minutes |
| the server's `sync_off` | leaves the account for 5 minutes |
| the server's `user_unavailable` or `unknown_account` | leaves the account for 15 minutes |
| the server's `429`/`503` | waits its `Retry-After`, at least 2 minutes |

Health (`sync_at`, `sync_error`, and `sync_retry_at`, which no later call shortens)
feeds only the `audible` setup item's detail ("places not syncing for N accounts:
..."). It never decides whether that item is done.

A successful new Audible sign-in clears the stored `sync_error` and
`sync_retry_at`, as does a `sync_off` response in either sync direction. These
clear stale health and retry information without recording a successful sync.
Turning sync off does not claim that a place reached Audible.

### The two Bridge routes

Both take a *bridge token* in the header only, and act for the account's
**person**, never the paired admin. Their shared refusals (`403 sync_off`,
`403 user_unavailable`, `404 unknown_account`) are in the
[API reference](../server/api/reference.md#audible-position-sync).

| Route | What |
|---|---|
| `POST /bridge/audible/accounts/{account}/listening` | The account's places on Audible, furthest only. The body is `{sent_at, events}`: strict, `sent_at` required, with the Sync v2 event shapes and limits. `200` is the Sync v2 answer |
| `GET /bridge/progress?account=&since=&limit=` | The person's places on the synced titles' books, one row per title, keyset by `(change_seq, asin)`: `{rows, next, more}`. It leaves out the account's own rows, and a row whose own title's `runtime_s` disagrees with the book's length (per title). `400 invalid_request` for no account, a bad limit or a bad cursor |

The feed is keyset on `progress.change_seq` (`0066`), the order the server wrote
progress rows in. Triggers set it, so no write path can miss it.

- A row written late with an earlier `updated_at` (an offline backlog, a client's
  clock behind) is still fed.
- A title newly matched, synced again or whose runtime changed offers its book's
  place again. The Bridge drops a place it already holds.

The counter and its triggers are in the
[data model](../server/data-model.md#the-bridge).

The Bridge mirrors both routes by hand in `internal/link/audiblesync.go`
(`AudibleSyncParams`/`AudibleSyncTitle`, `PostAudibleListening`, `AudibleProgress`).
`403 sync_off` is `ErrSyncOff`, and `403 user_unavailable` is `ErrUserUnavailable`.

### Bridge migration `0011_audible_push`

`audible_push` is keyed `(account, asin)`. Its columns:

| Column | What |
|---|---|
| `library_id`, `path` | the book the last `audible.sync` listed. With `listed` 0, the book a feed row named, pending until a sync lists it |
| `runtime_s`, `listed` | Audible's runtime, and whether the last sync listed the book |
| `acr` | the cached content reference |
| `last_ms`, `at` | the place written to Audible, and when |
| `heard_ms` | the place sent from Audible. It and `last_ms` each clear the other (`AudiblePushed`, and `AudibleHeard` for a write before the job began) |
| `want_ms` | the place waiting to be written |
| `row_ms`, `row_seen` | the feed row last read. `row_seen` is when this Bridge first read that place, the stillness clock |
| `reasserted_ms` | added by migration `0014_audible_reasserted`, `-1` for none. The written place a sync already wrote again once (step 7 of [`audible.sync`](#audible-to-the-server-audiblesync)) |

On `audible_accounts` it adds `push_cursor`/`push_from`, the health columns
`sync_at`/`sync_error`/`sync_retry_at`, and `refusal_kind`
([Refused](#the-sign-in-internalaudibleacct)).

## On the server (`0063`, `catalog/audible.go`)

The server keeps two tables. The columns are in the
[data model](../server/data-model.md#the-bridge).

- **`audible_accounts`**: the mapping, `poll_hours`, `last_poll_at`,
  `last_queued_at`, `template` and `policy_since`.
- **`audible_titles`**: one row per account and ASIN, with its state and match,
  plus the console's and an import's columns: `rejected`, `ignored`, `dest_path`,
  `import_job_id` and `import_pending`, which a titles PUT never overwrites.

`ignored` has no route that sets it yet. Back up everything, the policy pass and
the preorder clock skip an ignored title. Migration `0066` adds `sync_queued_at`,
`last_sync_at` and `refused_at` to the accounts, `no_sync` to the titles and
`change_seq` to `progress` (see
[Position sync](#position-sync-audiblesync-and-the-push-loop)).

- **Paused** is `library_id` NULL: the library was deleted. `DeleteLibrary`, in the
  library's own transaction, clears the matches into it and cancels the paused
  accounts' open polls and open syncs ("the Audible account's
  library was deleted"), so no titles call can match into it in between. The
  scheduler skips a paused account and Check now is `409 account_paused` until the
  Bridge maps it again.
- A title's match **moves with its book**: a move (a scan's move detection or a
  Bridge rescan's `from`) and a join carry it, in the per-user transaction after
  the book's places (`moveAudibleTitles`). So the re-match trigger offers the moved
  book's place to Audible, never a stale row an earlier book left at the new path,
  and a carry that fails leaves the titles where they were.
- Unpairing keeps the rows; deleting a user removes their accounts (the FK).
- The Bridge's writes are user-state writes (`store/userstate.go`): titles and the
  poll times don't move the content generation; a mapping change does.
- Free text is cleaned and bounded, never refused (one odd title never fails a
  poll): a title's authors past the first 20 and series past the first 10 are
  dropped. A match naming a missing or non-books library is stored as none.

## The `audible` module

A [managed module](../server/modules.md) (`internal/modules/builtin`), off by
default (`modules.audible.enabled`, `AUDIOSILO_MODULES_AUDIBLE_ENABLED`), whose
Bridge requirement is the `audible` feature. Its flag on `GET /server` is `false`
(sent, never absent) unless the toggle is on **and** an online Bridge offers
`audible`. Following the podcasts module:

- the **Bridge's routes are not gated**: the Bridge's page signs in and maps
  accounts whether or not the console turned the module on (and says the module
  must be on for polls);
- the **console's routes** (`/admin/audible/accounts`, `/admin/audible/titles`,
  `.../poll`, backup, backup-all and the two PATCHes) answer
  `404 module_off` while it is off;
- `DELETE /admin/audible/accounts/{account}` is **outside** the toggle (admin only):
  an account the Bridge can no longer remove must be removable after the module is
  turned off. The console only shows it while the module is on, so with it off it
  is an API call;
- queued polls, imports and syncs are held while it is off, and the scheduler and
  the policy pass after a poll only run while it is on. The two sync Bridge routes
  answer `403 sync_off` while it is off.

The player doesn't read the flag and doesn't mirror it (`Capabilities`,
`ModuleFlag`): it has no Audible surface yet. An old client ignores an unknown
flag.

## The console

While the module is on, Settings > Bridge gains an **Audible accounts** card (the
mapping read-only, title counts, Check now and Remove per account), and
Settings > Audible lists the titles with their filters. Remove removes the account
from this server only. The code is in `features/audible/`.

**Per title:**

- **Back up** (off while its account is paused), **Not this book** and its undo,
  and **Destination...** (`title-actions.tsx`);
- the import's state and code (`importStatus`). The loaded titles are fetched
  again every 5 s while a backup is queued or running (`backupRunning`);
- **Backed up here** for an `import` match;
- **Don't sync** / **Sync again**, with a **Not synced** badge.

**Per account:**

- the **Placement** row;
- **Account settings...** (`account-settings-button.tsx`): policy, template and the
  sync switch. It was called Backup settings before sync existed;
- **Back up everything...**, with its "N books, ~X GB" confirm
  (`backup-all-button.tsx`, from `backup_estimate`, also at the top of the titles
  page);
- the **Sync** row.

The legal line is on the titles page and in both dialogs.

**Notes on an unmatched title.** Each unmatched title shows `PlannedNote`
(`plannedLine`):

- "Will go to &lt;path&gt;, beside N books of its series" and the like, with
  "(planned at the last check)";
- a warning tone on `exists` or `error`;
- a note when the plan's template isn't the account's now;
- "Your destination is checked when the backup starts" instead, while a
  `dest_path` is set.

There is no `PlannedNote` on an `unavailable` or `gone` title, nor on a matched
one, a Not this book title included, since a stored match clears the plan.

`ReasonNote` explains `contested` with the other titles and the book linked
through `bookRoute`, as a plain sentence without data. A reason that is a machine
code reads as a sentence (`reasonKey`); Audible's own words stay.
Destination...'s placeholder comes from the planned path, never its value
(`plannedPlaceholder`).

**The Bridge's job list** names an `audible.import` by its ASIN, and reads one
with no requester as "Scheduled by the server". Its placed files are no verify
check (`resultSummary`). A sync job reads "Syncing places with Audible".

The components are in the [console's catalogue](../server/web-ui.md#what-the-console-has-today).
The Bridge's optional setup step `audible` links its Accounts tab. It is done with
an account signed in, none refused and none on an older device profile. See the
[User Guide's Audible page](/users/admin/audible).

## The routes

All in the [API reference](../server/api/reference.md#audible-accounts):

| Route | Who | What |
|---|---|---|
| `GET /bridge/users` | bridge token | who an account may be mapped to |
| `PUT /bridge/audible/accounts/{account}` | bridge token | record an account's mapping |
| `DELETE /bridge/audible/accounts/{account}` | bridge token | the Bridge removed it |
| `PUT /bridge/audible/accounts/{account}/titles` | bridge token | a page of a poll's titles |
| `GET /bridge/libraries/{id}/books` | bridge token | a books library's books, paged, for matching |
| `PUT /bridge/libraries/{id}/enrichment?path=` | bridge token | backfill a matched book's ASIN |
| `POST /bridge/audible/accounts/{account}/listening` | bridge token, sync on | an account's places on Audible, furthest only |
| `GET /bridge/progress?account=` | bridge token, sync on | the person's places to push to Audible |
| `GET /admin/audible/accounts` | admin, module on | the accounts with title counts |
| `GET /admin/audible/titles` | admin, module on | the titles, filtered and keyset-paged |
| `POST /admin/audible/accounts/{account}/poll` | admin, module on | Check now |
| `PATCH /admin/audible/accounts/{account}` | admin, module on | an account's policy and template, and `sync` |
| `POST /admin/audible/accounts/{account}/backup-all` | admin, module on | Back up everything |
| `PATCH /admin/audible/titles/{account}/{asin}` | admin, module on | Not this book and a destination, and `no_sync` |
| `POST /admin/audible/titles/{account}/{asin}/backup` | admin, module on | Back up one title |
| `DELETE /admin/audible/accounts/{account}` | admin | remove an account from the server only |

`audible.import` itself uses no new Bridge route: it reads the library through
`GET /bridge/libraries/{id}/books`, indexes the placed file with
[`POST /bridge/rescan`](../server/api/reference.md#post-apiv1bridgerescan) and sets
the ASIN with the enrichment PUT.

The Bridge mirrors the bridge-token routes by hand in `internal/link/audible.go`
(`Users`, `PutAudibleAccount`, `DeleteAudibleAccount`, `PutAudibleTitles`,
`LibraryBooks`, `Enrich`; the sync routes are [above](#the-two-bridge-routes)) and decodes
nothing it doesn't need; the server decodes
accounts and titles strictly, so the Bridge sends only the documented fields.

## The Audible fake

`internal/audible/audiblefake` exists **only** with the build tag `audiblefake`; no
release build or image carries it. It is an httptest server with synthetic fixtures
shaped from the manager's code and tests: 30 made-up titles (22 available, 4
preorders, 4 unavailable) and 7 places.

**Sign-in and identity.**

- `/ap/signin` redirects to its own `/ap/maplanding` with a code bound to the PKCE
  challenge.
- `/auth/register` checks the verifier and client id and issues a device key.
- `/auth/token` and `/auth/deregister` (this device only, recorded).
- Signed calls are verified against the issued key. An unknown or deregistered
  device gets `401`, and after `/_fake/refuse` signed calls get `403`.
- Register records each device's profile (its serial and app, os and software
  versions). Only the current profile with a 40-character serial gets licenses.
  Any other device lists its library, but every license is denied with the three
  throttled reasons, its customer id quoted, to prove the redaction.
  `POST /_fake/old-profile` ages every device registered so far.

**Library and places.** The fake pages the library and answers `lastpositions`,
with a `400` over its limit (10 by default). It records each `PUT lastpositions`
with its time (`put_positions[].at` on `/_fake/calls`).

**Content** (`content.go`):

- `GET /1.0/library/{asin}`;
- `POST /1.0/content/{asin}/licenserequest`. It is denied for a title not owned, a
  preorder not released or one without download rights. Otherwise it is granted,
  with a voucher sealed from the device type, serial, customer id and ASIN, which
  carries the key and IV `FakeKey(asin)` gives, and an `offline_url` on the fake
  good for one license;
- `GET /_fake/content/{asin}.aaxc` serves the embedded `testdata/fixture.m4b` (30
  s, three chapters, retagged per title by ffmpeg when there is one) through
  `http.ServeContent` with an ETag, so `Range` and `If-Range` work. It answers
  `403` once expired.

The fixture is an **unencrypted** MP4. ffmpeg 7.1 passes one through with
`-audible_key`/`-audible_iv` set (exit 0, chapters kept, audio bit-identical,
`TestDecryptPassesAnUnencryptedMP4Through`), so the real decrypt runs unchanged
against the fake.

**Controls:**

| Route | What it does |
|---|---|
| `GET /_fake/calls` | licenses, and downloads with their `Range`/`If-Range` |
| `POST /_fake/refuse` | refuses signed calls (`403`) |
| `GET /_fake/titles` | the fixture titles with their states |
| `POST /_fake/cut?after=N` | the next download drops after N bytes |
| `POST /_fake/expire` | the download URLs expire |
| `POST /_fake/release?asin=` | a preorder out today: it joins the library, available, and its order closes |
| `POST /_fake/position?asin=&ms=&ago=` | sets a place heard on another device (`SetPosition`) |
| `GET /_fake/positions` | lists every place it holds |

**Preorders** (`orders.go`), shaped as the real account answered:

- A fixture preorder is **not** in `/1.0/library`, and is a `404` on
  `/1.0/library/{asin}` until released. The library lists the 26 titles that are
  out.
- `GET /1.0/orders` lists one order per fixture title within `OrdersWindow` (183
  days). The preorders are pending in `ORDER_PENDING_PREORDER`, the others
  `ORDER_CLOSED`/`ORDER_SUCCEEDED`. It adds a cancelled preorder
  (`CancelledPreorder`, `ORDER_CANCELLED`; the real cancelled state was not seen).
  Each order has synthetic payment fields. Any `response_groups` gets a `500`, and
  there is no paging.
- `GET /1.0/catalog/products` (`?asins=`, a `400` over `LastPositionsMax`) and
  `/1.0/catalog/products/{asin}` answer any fixture title and the cancelled
  preorder, with its `title` only when `product_desc` is asked.

The recorder scrubs order payment fields and prices.

In a tagged build, `AUDIOSILO_BRIDGE_AUDIBLE_FAKE_URL` points every Audible and
Amazon endpoint at a fake. `AUDIOSILO_BRIDGE_AUDIBLE_RECORD_DIR` records every
exchange into a `0600` JSON-lines file there, scrubbed as it is written. The
scrubber, `audiblefake.Recorder`, redacts secret keys and the customer, device and
token subtrees, keeps headers from an allowlist, and drops signed CDN queries. This
is for the owner's recording run, which later recorded fixtures will come from. See
[Configuration](configuration.md#audible) and
[Development](development.md) for the tagged gate.

```sh
go run -tags audiblefake ./cmd/audiblefake --listen 127.0.0.1:8099
go build -tags embedui,audiblefake -o bin/audiosilo-bridge-fake ./cmd/audiosilo-bridge
AUDIOSILO_BRIDGE_AUDIBLE_FAKE_URL=http://127.0.0.1:8099 ./bin/audiosilo-bridge-fake --data ./data
```

The fake covers the shape of Audible's answers; only a real account proves them.
