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

1. the delivery type (`Periodical`, `PodcastParent`), so a show is never called a
   preorder;
2. a plausible release date still ahead (`ReleaseIsUpcoming`) is a preorder,
   whatever `customer_rights` says, because Audible grants no rights to a title
   not out yet;
3. only then do missing download rights make a title unavailable.

A title whose date was set aside is logged once per listing through the client's
`WithLogger`: its ASIN and title, both dates, `content_delivery_type`,
`content_type` and `is_consumable_offline`, never a token or the customer id.

### Preorders

A pending preorder is **not** in the account's Audible library until it is
released: `GET /1.0/library` lists none, and `GET /1.0/library/{asin}` is a `404`.
Seen on a real UK account (2026-11), the orders listing is the only place the API
shows one, so each poll reads it (`audibleacct.Manager.Preorders`, which owns the
store, the sign-in and the service; `audiblejob` appends its records to the
library's):

- **The orders** (`audible.Client.Orders`, `GET /1.0/orders`, signed): an order
  has `date`, `preorder`, `state`, `detail_state`, `type` and `items` (each with
  `asin` and `is_preorder`, beside payment fields the client never decodes). A
  title is a pending preorder when its order has `preorder: true` **and** `state`
  `ORDER_PENDING_PREORDER` (`Order.PendingPreorder`); a delivered order is
  `ORDER_CLOSED`/`ORDER_SUCCEEDED`. The listing reaches back about six months and
  ignores every query parameter tried (`page`, `num_results`, `start_date` and
  `end_date`, `purchased_after`, `date_range`, `period`); any `response_groups` but
  the default is a `500`, so none is sent. The paging fields read `0`; `Orders`
  still follows `max_number_of_pages` should it ever page (at most 20 pages,
  stopping at a page that adds no new order).
- **The catalog** (`audible.Client.Products`) describes each pending preorder,
  read again every poll so a moved release date is picked up: `GET
  /1.0/catalog/products?asins=a,b,...` in batches of 25, split on a `400`/`414` as
  `lastpositions` is (`splitOnOverflow`), with `response_groups`
  `contributors,product_attrs,product_desc,series` (without `product_desc` the
  catalog sends `title` null). A failed batch ends the batches; then every ASIN not
  yet answered with its title (left out of a batch, one still refused alone, or in
  the failed batch or after it) is read alone (`GET /1.0/catalog/products/{asin}`),
  unless Audible asked to wait (`429`/`503`) or the context ended, which ends the
  reads too; a single read failing ends them as well. One the catalog doesn't know
  (a `404` or `400` alone) is left out. Records are built as the library's
  (`toRecord`), with no customer rights, then marked `Preorder` with
  `audible.PreorderReason`.
- **Remembered** (Bridge migration `0012_audible_preorders`, `store.AudiblePreorder`,
  `store/audiblepreorders.go`): one row per `(account, asin)` with `ordered_at`
  (the order's date, else when first seen), `last_seen_at` (last seen pending in the
  orders), `record` (the catalog's last description as JSON, `''` until a read
  succeeds; a cache the next fill replaces) and `filled_at` (no longer written
  or read; the column stays so a downgrade works). No credential, no
  payment field. Each poll reports every remembered row, so a preorder whose order
  has left the six-month window is still reported. The rows go with the account
  (`ON DELETE CASCADE`).
- **Matching.** A preorder the catalog hasn't described yet (no title) matches by
  ASIN only (`matchTitled`) and gets no planned destination; a preorder claiming a
  book a library title claims too gives way to it, uncontested.

**Drop rules** (`reconcilePreorders`, `dropReleased`), by ASIN:

- the library lists it (the library wins; it is reported from there);
- no order holds it pending and one holds it in a state other than delivered
  (cancelled). A delivered order (`Order.Delivered`: `state` `ORDER_CLOSED`,
  `detail_state` `ORDER_SUCCEEDED`) keeps it a preorder until the library lists it,
  which can be a little after the order closes, so it never drops out of a final
  poll in between. That wait is capped: a delivered one the library still
  doesn't list is dropped `DeliveredDropAfter` (14 days) after the later of its
  `last_seen_at` (last seen pending) and its release date, both bounds of when
  the order closed (a refund, or a release under another ASIN);
- the listing's oldest order is older than its `ordered_at` and the listing doesn't
  hold it: it was in the window and is gone, so it was cancelled (an empty listing,
  or one with no dated order, drops nothing);
- its release date is `PreorderDropAfter` (30 days) past and the library still
  doesn't list it; one the catalog never dated counts as released two years
  (`undatedPreorderYears`) after it was last seen pending.

A dropped preorder is no longer reported, so the server marks the title `gone` at
the next final titles PUT. What the server does with a reported preorder (the hourly
clock, the 14 days, a pending request):
[On the server: queueing](#on-the-server-queueing-internalaudibleimportsgo-catalogaudible_importgo).

**Soft failure.** Neither the orders nor the catalog ever fails the poll. A failed
orders listing (or a sign-in that can't be opened) adds and drops nothing beyond
the library and release-date rules, and one warning is logged (Audible's answer
redacted, never a credential). A sign-in that can't be opened, or a `429`/`503` on
the orders, skips the catalog for that poll, so the remembered rows are reported
with its last description; any other orders failure still reads the catalog. A catalog
that fails part way still describes the titles it read. A preorder the catalog never
described is reported by ASIN alone: the server stores it untitled (state
`preorder`, the reason, no match, no plan). A store failure is a warning too, and
nothing is written back.

**Elsewhere.** An import of one fails `not_released`
([step 2](#the-steps-on-the-bridge)). Position sync never touches one (a fuzzy match
can put one on a book, another edition): `audible.sync` leaves it out
([step 2](#audible-to-the-server-audiblesync)), and the push loop never writes its
place (Audible would deny the content reference every pass). Both read the store;
when it can't say, they run as before with a warning.

**Limit.** A preorder ordered more than about six months before the account's first
poll with this code can't be found (Audible's order history has no older pages;
the catalog's `customer_rights`, `is_preorderable` and `preorder_release_date` say
nothing about this customer's order). It is reported once released, from the
library. Every preorder ordered later is remembered.

### Enrichment pacing

A first poll can backfill hundreds of ASINs, one PUT each, and the server's
[address limiter](../server/auth-and-security.md#rate-limiting) (shared with the
house's players) answers a quick run `429`. The server is unchanged; the Bridge
paces the PUTs (`audiblejob.enrich`): at most one per 200 ms (`enrichGap`). On a
`429` it waits for the `Retry-After` (seconds or an HTTP date, read into
`link.APIError.RetryAfter`, with `RetryAfterSet` recording whether it was
provided), or else 2 s, doubling with each `429` in a row. An explicit
`Retry-After: 0`, including an HTTP date in the past, retries immediately
within the same attempt cap; an absent header uses the backoff. It
then retries the same book and doubles the gap, up to 2 s.

The poll leaves the rest of the backfill to the next poll after:

- five `429`s in a row;
- a `Retry-After` over a minute;
- 10 minutes of enriching (`enrichBudget`).

Those books still have no ASIN, so the next poll picks them up again. Their count
is the result's `enrich_deferred`. Only a cancelled job fails the poll.

Registering the `audible.poll` kind is what adds `audible` to the heartbeat's features
(`bridge.FeatureAudible`), which the `audible` module needs.

## Backing up a title (`audible.import`)

The **server decides** what to back up and when: a console request, Back up
everything, an account's policy after a poll, or a preorder's pending request. The
**Bridge downloads** the title for the account, removes the DRM and places it in the
account's library. The server never talks to Audible and never sees a key.

### The job

| | |
|---|---|
| Kind | `audible.import` (`bridge.KindAudibleImport`; the Bridge's `audiblejob.ImportKind`), feature `audible` |
| Server spec | internal (`POST /admin/bridge/jobs` refuses it with `400`), `writes` (a writable books mapping), `libraryKind` books, no book path (`bookNone`), owned by the `audible` module (`ModuleFor`: held while it is off), **not** quiet: a done or failed one is notified, named by the title (`notifyBridgeJob` reads the title's name) |
| Dedupe | one open job per account and title (`audibleImportSuffix`: `\|<account>\|<asin>`); a repeat returns the open one |
| Bridge lane | `download` (`jobs.LaneDownload`, 1 slot by default, shared with `podcast.fetch`), and one import per account at a time on top (a per-account gate, `Importer.gate`) |
| Library | the job row's `library_id` is the account's library at queue time |

**Params** are built by the server (`catalog.importParams`, from the account and the
title at queue time), strict on the server (`audibleImportParams`), read leniently by
the Bridge (`audiblejob.ParseImportParams`: unknown fields ignored, the ASIN
upper-cased):

```json
{ "account": "k3v9x0p2m4q8r1t5", "asin": "B0FAKE0002", "library_id": 2, "dest_path": "", "template": "" }
```

- `dest_path`: the console's destination for the title (`audible_titles.dest_path`),
  `""` for none. A library-relative file path, or a **folder** when its last
  segment has no audio extension. The server checks it with
  `bridge.CheckAudibleDestPath` (the rules are in the
  [API reference](../server/api/reference.md#patch-apiv1adminaudibletitlesaccountasin)).
- `template`: the account's placement template (`audible_accounts.template`), `""`
  for the Bridge's automatic placement. Checked with `bridge.CheckAudibleTemplate`
  (below).

Both are copied in at queue time: editing either later never changes a queued job.

**Progress** is `{"step", "message", "done", "total"}` with `step` one of
`license` (also while waiting for the account's gate or the mapping check),
`download`, `decrypt`, `place`, `rescan`, `enrich`, in that order (`done`/`total`
are bytes during `download` and `place`).

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

(The fake's title placed beside `Mara Quill/The Glass Orchard`, book 1 of its
series in a folder with no code: Auto kept the author folder and guessed the code.)
`path` is the **book** path `POST /bridge/rescan` answered for the placed file (a
single-file book is its file), `files` what was placed, `enriched` whether the
book now carries the title's ASIN (`false`: it had one already, the server refused
it, `asin_set`, or the file joined a book that isn't the title's).

**Failures** are `audiblejob.Failure` `{"code", "message"}`, both as the result and
as the error, so the server reads the code from the result (`bridge.AudibleImportCode`:
a park's code, else the result's `code`, else an error starting with a known code):

| Code | When |
|---|---|
| `not_released` | the title is a preorder (a remembered pending one, or a library title with a release date ahead), or Audible's license denial says it isn't out (`audible.ErrNotReleased`) |
| `no_rights` | the title isn't in the account's library (`ErrNotInLibrary`) nor a remembered pending preorder, Audible won't let it be downloaded (`UnavailableReason`: no rights, a show or periodical), or the license is denied for rights (`ErrNoRights`) |
| `audible_refused` | Audible refused the account's sign-in (`audibleacct.ErrRefused`: the account is marked refused) or the license for another reason (`ErrDenied`); or denied the device as throttled (`ErrThrottled`, a device on an older [profile](#the-device-profile)): the message is `ThrottledText`'s advice to sign in again on the Bridge, the account is marked refused and its later imports fail at once until a sign-in again |
| `not_writable` | the library isn't the account's, not a books library the server lists, or not mapped **and** writable at the mount in use; the destination or template gives no valid path (`transfer.CleanRel`'s refusals, a hidden segment included; another audio extension than `.m4b`, `.m4a`, `.mp4`); a path the Bridge can't follow (a file where a folder goes, a link out of the mapping, an unreadable folder); a read-only filesystem or a permission refusal at the install |
| `exists` | anything at the destination (a different file, a folder, a link), or a destination inside a book the library already has (its folder is a listed book's, or already holds audio): checked **before** the license, and again at the install |
| `disk_full` | free space short in the Bridge's temp folder (2.2x the size, less what the partial holds) or at the library's nearest existing folder (1.1x, `transfer.DefaultHeadroom`), checked before a byte is written; or ENOSPC/EDQUOT during the download, decrypt (ffmpeg's words too) or copy. A free space that can't be read is no refusal |
| `offline_url_expired` | the presigned download URL answered 401/403/410 again after the one new license |
| `unknown_account` | not this Bridge's account, or mapped on another server |
| `drm_free` | Audible offers the title only as a DRM-free MP3 (`audible.ErrDRMFree`), which the Bridge doesn't back up yet |

A download over `DownloadOptions.MaxBytes` (`audible.DefaultMaxDownloadBytes`,
4 GiB) and other errors fail with no code. The server's `bridge.AudibleImportCodes`
lists every code above, and the console words each one.

**Not writable while running.** A mapping check not made yet for the mount is
waited for (`mappingPoll`, 1 s), no park. An unwritable mapping refuses a **new**
job at once; a **resumed** job, and any job at the `place` step (the mapping is
checked again before the copy: it may have changed during the download), parks
`not_writable` (`Reporter.Park`, `progress.park.code`) and runs on once the
mapping is writable again, keeping its download.

### The steps on the Bridge

`audiblejob.Importer.Run` (`import.go`):

1. **Gate and checks.** Takes the account's gate, checks the account (this Bridge's,
   mapped on the paired server) and the library (the account's, mapped and
   writable).
2. **The title** (`Manager.Title`, `GET /1.0/library/{asin}` signed; on
   `ErrNotInLibrary`, a [remembered preorder](#preorders)'s record): a preorder is
   `not_released`, an unavailable reason `no_rights`.
3. **The destination** (`audiblejob.Destination`): `dest_path` first (the template
   isn't consulted), else the template (`placement.ModeTemplate`), else Auto
   (`importjob.Plan` over the paged books listing: the series siblings' folder and
   code convention, an existing author folder's spelling, else `Author/Title`; an
   empty author folder dropped). Then `transfer.OnDisk` spells it as the disk spells
   the folders that exist (the path the server indexes on a case-insensitive
   disk), and `vacant` refuses an occupied destination (`exists`). **All before
   the license and the download.**
4. **License** (`Client.License`): the AAXC URL, key, IV and size.
5. **Download** to `<data>/audible/tmp/<account>-<asin>.aaxc.part` (below).
6. **Decrypt** (`audible.Decrypt`: `ffmpeg -audible_key <key> -audible_iv <iv> -c copy
   -f ipod`) to `<account>-<asin>.m4b` in the same folder, then the partial goes
   (room for the copy).
7. **Place** (`transfer.Local.Place`, below), after the mapping check again.
8. **Rescan** (`POST /bridge/rescan` with the placed file, 3 tries):
   the server answers the book path. A failure here says the book is placed.
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
`DownloadOptions.ExpectedSize` (the license's size) and holds a validator or a size.
The `Range` carries `If-Range` (a strong ETag, else `Last-Modified`), so a `200`
replaces the partial; a `206` at another offset or for another total, or a `416`
for another file, starts again (the partial removed first; one it can't remove ends
the download). A short body is `io.ErrUnexpectedEOF`; a `200` without a length is
held to `ExpectedSize`. Each attempt runs under a stall watchdog (`downloadStall`,
2 minutes with no answer or no byte: `ErrStalled`, the partial kept). A `ctx`
cancel stops it mid-body. Its errors never name the presigned URL's query.

The importer's loop: a dropped connection, a stall or a `5xx` resumes from the
partial, waiting 2 s, then 8 s; only `downloadAttempts` (3) attempts **in a
row that add nothing** fail the job, so a long download over a link that drops now
and then finishes. A `401`/`403`/`410` licenses once more (a URL that expired over
a long wait or a restart), then `offline_url_expired`.

**Who keeps the partial**, from the gate on:

- a **stop** (`jobs.Resumes`: the Bridge shutting down, a refused token) or a **lost
  claim** (`jobs.Lost`: the lease lapsed and the server hands the job out again)
  keeps the partial and its state for the next run;
- a **cancel** or a **failure** deletes them (`audible.RemovePartial`);
- `Importer.Abandon` deletes them for a job the runner ends without running it,
  unless its claim was lost;
- the decrypted copy always goes.

**The start-up sweep** (`audiblejob.SweepTmp`, from `app.newAudible`) keeps only
`*.aaxc.part` files younger than `PartialMaxAge` (7 days) with their state, and
placement markers as young; everything else in the folder goes.

**The placement marker.** After the install the Bridge writes
`<account>-<asin>.placed.json` (`library_id`, the request's `dest_path` and
`template`, the placed `path`, `size`, `mtime_ns`, the join verdicts). While the
library holds exactly that file (its size, and its modification time within
`markerSlack`, 2 s), a retry of the same request goes on from the rescan with no
second license or download and the same result; a request whose destination turns
out to be that file finishes it too. A request for another destination places anew
(the earlier copy stays where it is, logged). A changed or replaced file drops the
marker (`exists`); one that can't be read now keeps it and fails, to try again. The
result removes it.

### The hardened transfer (`internal/transfer`)

`transfer.Local.Place` is the only writer into a library. It is hardened in three
ways:

- **Contained.** The mapping's root is opened first as an `os.Root` (a missing
  root, or a file, fails before the source is read) and every call goes through it,
  so a symlink can't lead out. `transfer.CleanRel` applies `mapping.SafeJoin`'s rules
  and refuses an empty path and any hidden (dot) segment (the server never indexes
  one): `ErrInvalidPath`.
- **No replace.** The same bytes already at the destination are `AlreadyPresent`
  (an earlier run's copy); anything else there (a different file, a folder, a link)
  is `ErrExists`. The copy is staged as a `.audiosilo-import-*.part` dotfile beside
  the destination (`0644`, synced, size-checked) and installed with
  `fsutil.InstallNoReplace` (an exclusive hard link, else `RenameNoReplace`:
  `renameat2(RENAME_NOREPLACE)` on Linux, a check-then-rename elsewhere; the
  podcast episode install's primitive, moved into `fsutil`). A file that raced in
  is kept (`ErrExists`, or `AlreadyPresent` when it is these bytes). A failure or
  cancel leaves no staged copy.
- **Free space.** 1.1x the file (`DefaultHeadroom`) free at the nearest existing
  folder, else `ErrDiskFull` (an unreadable free space is no refusal; ENOSPC/EDQUOT
  during the copy is `ErrDiskFull` too).

**Why joining an existing book is `exists`.** A backup is a book of its own: the
server's scan would make a file placed in a listed book's folder, or a folder that
already holds audio, part of that book, and the server refuses such a done import
(`ErrImportNotOwn`, below), so `vacant` refuses it before the license (step 3).
The one join left is a `dest_path` into a new disc folder of a disc set, which
never takes the ASIN.

### Enrichment after placing

The book the rescan answers decides. `joinedBooks` gives each book the file could
join (at its own path, its folder, or a disc set's folder above it) a verdict:
`importjob.BookMatcher` picks that book for the title and it isn't
`importjob.SpanMismatch` (the poll's rule). A book with a verdict takes the ASIN only
on it; any other book is new (the title's own, a pack placed as a pack included)
and takes it. The verdicts are kept in the placement marker. The one PUT waits out
`429`s as the poll's enrichment does (`limitWait`), then gives up with
`enriched: false`; `asin_set` and a moved book are `enriched: false`, no failure.

### Secrets

The license's key and IV live **in memory and in ffmpeg's argv only**: never a log,
progress, result, error or file (the import's tests walk all of them for the stub
key). `audible.License` redacts itself (`String`, `GoString`, `LogValue`;
`MarshalJSON` refuses), ffmpeg's stderr is redacted of the key and IV (any case:
ffmpeg echoes a bad key), and a voucher that won't parse is reported without its
bytes. The argv is visible in the container's process table: accepted. The download
URL is presigned: errors name it without its query. The account's sign-in stays in
the vault ([Who holds what](#who-holds-what)); `Title` and `License` go through
`Manager.signed` (a refusal retries once with a newer sign-in, else marks the account
refused), `Download` only opens the sign-in (its `401`/`403` is an expired URL, the
import's to license again, never the account's refusal).

### On the server: queueing (`internal/audible/imports.go`, `catalog/audible_import.go`)

`audible.Queues` queues a job (`bridge.Enqueue`) and records it on the title
(`catalog.SetAudibleImport`: `import_job_id`, clearing `import_pending`). A repeat
finds the open job by its dedupe key and records it too (a crash between the two
heals). **Priorities**:

| Who | Priority | Requester |
|---|---|---|
| a console **Back up** (`priorityBackup`), and a preorder's pending request when a poll queues it | `0` | the admin; the server (`0`) for a pending one |
| an account's **policy** after a poll (`priorityPolicy` = `schedulerPriority`) | `-10` (as the podcast scheduler's fetches and the scheduled polls) | the server |
| **Back up everything** (`priorityBackupAll`) | `-20` | the admin |

Back up everything sits below new podcast episodes, so a bulk backup in the
Bridge's one download slot never holds them back for days.

**"On this server"** is a match not marked Not this book (`rejected = 0`): Back up's
`already_matched`, the policy's pending drop, the titles' `matched` filter and the
accounts' `matched` count all read it so.

**Back up** (`RequestAudibleBackup`): `unknown_account`/`unknown_title`;
`account_paused`; `already_matched`; `import_open` (an open job, or a pending
request); a **preorder** stores `import_pending = 1` and answers pending (no job;
the request survives a restart); `not_available` for `unavailable` or `gone`.
Contested titles are allowed, and so is one whose last backup is done once it is
no longer on this server (the admin decides; `retryImportSQL` is Back up
everything's only).

**Back up everything** (`AudibleBackupAll`, `backupAllSQL`, also the
`backup_estimate`): `state = 'available'`, no match, not `rejected`, not `ignored`,
not `contested` (`contestedSQL`: `reason = 'contested'`), and `retryImportSQL`: no
backup yet, or the latest isn't open and isn't a `done` one whose result's book is
still indexed. So a failed or cancelled backup is tried again, a backed-up title
whose book left the library (deleted or moved) is queued again, and a refused fold
(`ErrImportNotOwn`) isn't queued again every time. It stops at the first refusal of
the queue (`kind_unavailable`, `library_not_writable`: none would be taken) with
what it queued. The estimate is `runtime_s x 8000` bytes (64 kbps AAXC), labelled
approximate.

**The policy** (`AudiblePolicyImports`, run by `afterAudiblePoll` after each
`final` titles PUT while the module is on and an online Bridge offers
`audible.import`, within 10 s; what it misses the next poll asks again). None for a
paused account, or one mapped to a person it may no longer be. Pending requests now
on this server are dropped first. Then `autoImport.wants` (a table test) per title:
available, not on this server, nothing open, not ignored; then a **pending request
always** (at priority `0`); otherwise not rejected, not contested, never attempted
(any `import_job_id`), `first_seen` **after** `policy_since`, and `all`, or `series`
when the account's person has a book of one of its series (`seriesOwner`: by series
key, main or other series, in a library their scopes reach). A refusal of the queue
that means none will be taken (`library_not_writable`, `kind_unavailable`) ends the
pass quietly.

**`policy_since`** makes policies new purchases only. It is set to now at the
account's creation (the Bridge's first `PUT /bridge/audible/accounts`), when the
console turns `all` or `series` on (`PatchAudibleAccount`; switching to `manual`
leaves it), and moved to the account's **first complete poll** (`PutAudibleTitles`
when `last_poll_at` was `NULL`), so that poll's titles count as the library the
account already had. The Bridge's account PUT sets `policy` on create only; after
that the console owns it.

**Preorders.** `preorderWaitingSQL`: a `preorder` with a `release_date` on or before
today's UTC date and less than `AudiblePreorderWait` (14 days) ago, that a backup may
wait for (not on this server, not rejected or ignored; or with a pending request
while not here). Such an account is due **every hour** (`DueAudiblePolls`) instead of
every `poll_hours`. Past the 14 days the title reads `needs_attention: true`
(`preorderOverdue`, the same terms; derived, no column) and the hourly clock stops.
The first poll that reports the title `available` queues a pending request. Where the
Bridge finds preorders: [Preorders](#preorders).

### On the server: the done fold

`FoldAudibleImport` runs from the jobs' `OnEnded` hook for a done `audible.import`:

1. the result must name the job's library (and the params') and a clean book path,
   else `ErrImportNotIndexed`;
2. `importOwnBook`: the book must be indexed in a books library
   (`ErrImportNotIndexed`) and be the **title's own**, else `ErrImportNotOwn`
   (logged): it carries the title's ASIN, or it holds **only** the files the backup
   placed (a single-file book is its file). A file the scan joined into a folder
   book already there never makes that book (nor another title's) this title's
   match, and never the book the admin marked Not this book for the title;
3. it sets the match (`match_how = 'import'`), clears `rejected` and `import_pending`,
   only while `import_job_id` is still this job.

A later poll keeps an `import` match while its book is indexed and the poll names no
other match for the title (`importMatches`): the poll may have listed the library
before the backup landed. A failed job leaves the title as it was; the console shows
its code (`import.code`).

Removing an account cancels its open imports (`bridge.CancelAudibleImports`, in the
account's delete transaction, `CancelAudibleRemoved`), whether the Bridge or the
console removed it.

### Migration `0064_audible_import`

- `audible_accounts.template TEXT NOT NULL DEFAULT ''`
- `audible_accounts.policy_since TEXT NOT NULL DEFAULT ''`, backfilled
  `COALESCE(last_poll_at, created_at)` (an account that polled starts from its last
  poll, one that never did from its creation)
- `audible_titles.import_pending INTEGER NOT NULL DEFAULT 0`

No new table. `policy_since` joins the user-state rule's free columns of
`audible_accounts` (`store/userstate.go`), as the two poll times; a titles write is
a user-state write. The Bridge's `0010_audible_profile` is
[the device profile](#the-device-profile)'s.

### Migration `0065_audible_planned`

What the console says of a title the Bridge left unmatched.

- `audible_titles.planned TEXT NOT NULL DEFAULT ''`: the title's planned
  destination as JSON, `''` for none.
- `audible_titles.contest_library_id INTEGER` and `contest_path TEXT NOT NULL
  DEFAULT ''` (NULL and `''` for none), with a partial index on both: the book a
  contested title tied for. Path-keyed with no FK, carried by a move or a join like
  a match's path, cleared by the library's delete.

All three are the poll's: each titles PUT writes them, and a stored match (the
poll's, a kept `import` match, `FoldAudibleImport`) clears them. A title the final
call marks `gone` loses its plan. The PUT checks `planned` strictly
(`checkAudiblePlan`, the rules in the
[reference](../server/api/reference.md#put-apiv1bridgeaudibleaccountsaccounttitles)),
bar a `path` over `MaxPathBytes` (Audible's long text through a template), stored
as an `error` plan. A contest is
stored only for the account's library. `GET /admin/audible/titles` shows `planned`
only while the account is mapped to the plan's library, and `contested {library_id,
path, with}` only while it is mapped to the contest's, `with` the account's other
titles (not `gone`) contested over that book or matched to it, at most 10
(`fillContests`, one query a page).

**Deploy the Bridge with the server** (no capability gate: see the
[cross-repo contract](../architecture/cross-repo-contract.md#16-the-bridge)).

### The template grammar

`bridge.CheckAudibleTemplate` is a copy of the Bridge's `placement.Parse` grammar
(keep `audibleTemplateVars` in step with `placement.knownVars` and `templateMods`
with `parseMods`): literal text, `{Var}` or `{Var:mods}` (mods `width=N`, `upper`,
`lower`, `trim`, comma-separated), optional groups `{ ... }` that collapse when a
variable inside renders empty, and `\` escaping the next character. Variables:
`Author`, `Series`, `Title`, `TitleShort`, `Seq`, `PaddedSeq`, `SHORTCODE`, `ASIN`,
`Narrator`, `Year`, `OriginalFilename`, `Ext`. The server also refuses over 500
bytes, a control character, a leading `/`, a `..` segment and a hidden, dot-led
segment (the scan skips those). The Bridge parses it again when it places (and
allows up to 1024 bytes). A rendered last segment ending `.m4b`, `.m4a` or `.mp4`
names the file; anything else is a folder and the title's file name
(`<title>.m4b`, `audible.safeFileName`) goes in it. A template that renders no
valid path is `not_writable`.

## Position sync: `audible.sync` and the push loop

Position sync keeps an account's listening places in step with Audible, both ways
(`internal/audiblesync` on the Bridge; `catalog/audible_sync.go`,
`api/handlers_audible_sync.go` and `0066` on the server). **Furthest wins** in both
directions. Audible's place never moves the server's back, and the Bridge never
writes over a place Audible moved on from. Only places travel. No listening
session, `listening_daily` or history row is ever written for Audible's listening,
and nothing is recorded against the bridge token.

### The switches (server)

- **Per account**, `audible_accounts.sync`, the console's alone:
  [`PATCH /admin/audible/accounts/{account}`](../server/api/reference.md#patch-apiv1adminaudibleaccountsaccount)
  `{sync}` (audited `bridge.audible.account`). `0066` turned every account off; a new
  account is created off and a Bridge PUT never turns it on (its `sync` is read and
  ignored). Turning it off cancels the account's open sync
  (`bridge.CancelAudibleSyncOff`, "sync with Audible was turned off for the
  account"); turning it on queues one at once. A Bridge PUT that maps the account
  to **another person** turns sync off, forgets `last_sync_at` and cancels the open
  sync: the admin turned it on for the person the console showed then.
- **Per title**, `audible_titles.no_sync`, the console's "Don't sync this book":
  [`PATCH /admin/audible/titles/{account}/{asin}`](../server/api/reference.md#patch-apiv1adminaudibletitlesaccountasin)
  `{no_sync}` (audited `bridge.audible.title`), kept by a poll like `rejected` and
  `ignored`. It is separate from `rejected` (Not this book) and the sync's alone:
  backups never read it.

A title syncs when `syncTitleSQL` holds: matched, not `rejected`, not `ignored`,
not `no_sync`, not `gone`, not `preorder`. A poll may match a preorder to another
edition on disk, and Audible holds no place for an unreleased ASIN, so the server
leaves a preorder out of both directions: not in `audible.sync`'s params,
`rejected` `not_synced` on the listening route, and not in the progress feed. The
Bridge's own `skipped_preorder` stays as a second guard. Once the title is
released (`preorder` to `available`), `0071`'s trigger offers its book's place to
Audible again, as for a title back from `gone`. An account syncs while the module is on, its `sync` is
on, it isn't paused, `refused_at` is NULL and its person may still be synced for
(`bridgeUserSQL`: not disabled, not a kid, not a demo account).

### Audible to the server: `audible.sync`

**Queueing.** The `audible` module's scheduler (`audible/scheduler.go`
`queueSyncs`, while the Bridge offers the kind) queues one `audible.sync` per
`DueAudibleSyncs` account (above, and `sync_queued_at` older than
`bridge.AudibleSyncEvery`, 15 minutes) at priority `-10`; none for an account with
no synced title. A console change to which titles sync (`{rejected}` or `{no_sync}`
on a title) or turning sync on queues the account's sync at once
(`audible.SyncNow`, `catalog.AudibleSyncQueueable`: the same rule bar the 15
minutes, with an online Bridge offering the kind). A title change queues even an
empty title list, so the Bridge drops a left-out title now.

**The kind** is internal, quiet, owned by the `audible` module (held while it is
off), deduped per account and `promotes` (a queued one takes the newest titles; one
the Bridge already runs keeps its own), and only the newest ended one of each
account is kept (`pruneAudibleEnded`). Its params are server-built and strict on
both sides (`audibleSyncParams`, `link.AudibleSyncParams`), at most 1 MiB
(`AudibleSync` drops the last titles past it):

```json
{
  "account": "k3v9x0p2m4q8r1t5",
  "titles": [
    { "asin": "B0EXAMPLE1", "library_id": 1, "path": "A. Writer/The Example", "runtime_s": 36000 }
  ]
}
```

Each ASIN once, `library_id` > 0, `path` a clean book path (or `.`), `runtime_s`
not negative.

**On the Bridge** (`audiblesync.Handler`, light lane):

1. a device refusal fails the job **`audible_refused`**: the server stops queueing
   until a sign-in again maps the account. A sign-in refusal fails it
   **`audible_sign_in`**, which the server treats as an ordinary failure and keeps
   queueing: the next poll Audible answers ends it. Another server's account, or
   none, is `unknown_account`;
2. leaves out the titles the account remembers as pending [preorders](#preorders)
   (`skipped_preorder`), stores the rest (`store.ListAudibleSync`), then while the account's
   `sync_retry_at` is ahead ends done with `waiting` without calling Audible;
3. reads Audible's places (`lastpositions`, 25 ASINs a request, split on a
   `400` or `414`); a failure fails `audible_error`, and a `429`/`503` also waits
   Audible's `Retry-After` from when it came back, at least 2 minutes
   (`sync_retry_at`);
4. skips a place under 1 s, one past the runtime (more than 5% plus 2 minutes:
   Audible's runtime is minute-rounded, so past it means a wrong match), one older
   than 85 days (the server refuses events past 90), and one within 5 s of the place
   last written to Audible (its own echo);
5. posts the rest to [`POST /bridge/audible/accounts/{account}/listening`](#the-two-bridge-routes):
   each a `listen` of no length (`from_pos` = `to_pos`, `started_at` = `ended_at` =
   Audible's `last_updated`, `start` `jump`), plus a `finish` when the place is at the
   book's end (98% in, or within 3 minutes of the end once 90% in), 200 events a
   call;
6. records `heard_ms` for each place the server answered (not rejected):
   `store.AudibleHeard` clears a `last_ms` written before the job began, and an
   applied one drops a place the push was waiting to write from the row it had
   then (it would move Audible back);
7. **re-asserts** a place the Audible app overwrote. The app may upload the older
   place it still held over one the push wrote, and the sync then reads it as
   `behind`. When the Bridge wrote the title's last place (`last_ms`), the server
   row it last read is still that place (within 5 s) and Audible's place is more
   than 5 s behind it, `store.RearmAudiblePush` sets `want_ms` to the row's place
   and `row_seen` to now, so the push writes it again after `StillFor`. It is
   guarded in SQL: only while the title is listed, nothing is waiting, and no push
   and no new server row came since the job read it. The push's read before the
   write still drops it if Audible moved further on meanwhile.
   **At most once per written place** (`reasserted_ms`, Bridge migration `0014`):
   a sync can't tell the app's stale upload from a listener who rewound in the
   Audible app and listens on there. So once a place was written again, Audible
   behind it again is left alone (an Info log says so) until the push writes a
   new place (`AudiblePushed` of another place, or another book for the title,
   resets it). A `duplicate` answer re-arms nothing.

`sync_off` from the server ends the job quietly (done, `sync_off`);
`user_unavailable` fails it with that code. The **event id** is
`aud-` and the first 32 hex characters of
`sha256(account|asin|position_ms|last_updated|kind|library_id|path)` (`EventID`;
`kind` is `""` for the listen and `finish` for the finish), so an unchanged place is
the same event (a `duplicate`) at every sync, and the same place on a title matched
again to another book is a new event.

The job's **result** is counts and flags only: `account`, `titles`, `heard`,
`sent`, `finished`, the server's `applied`, `duplicate`, `behind`, `not_applied`,
`rejected`, `reasserted` (step 7, omitted when 0), and the skips (`skipped_echo`,
`skipped_past_runtime`, `skipped_old`, `skipped_start`, `skipped_preorder`), `mismatched` (events the server rejected
`duration_mismatch`: counted, sent once a job and never retried in it); `waiting`
with `wait_until`, or `sync_off`. `titles` counts the titles kept, after
`skipped_preorder`. A failure's result is
`{code, message}`.

**The server's fold** (`OnEnded`, `catalog.FoldAudibleSync`): a done sync that read
Audible's places (`bridge.AudibleSynced`: neither `waiting` nor `sync_off`) sets
`last_sync_at`; a sync failed with `audible_refused` (the result's `code`, or an
`audible_refused:` error prefix, `AudibleSyncCode`) sets `refused_at`, which stops
the scheduler. Any account PUT of the Bridge's (a fresh sign-in, an edit) and a
complete poll (`PutAudibleTitles` with `final`: Audible answered the account) clear
it and stamp `refusal_ended_at` (`0071`). A refused sync claimed in an earlier
second than that stamp ran before the fresh sign-in, so it marks nothing
(`refusalEndedSince`; `claimed_at` is whole seconds, so one claimed in the same
second still marks). `audible_sign_in` (`bridge.SyncAudibleSignIn`) is a sync's
code only, never an import's, and an ordinary failure.

### The server's side of a batch: furthest only

The listening route builds the batch itself: `SyncBatch{UserID: the account's
person, DeviceID: "audible:<account>", DeviceName: "Audible (<label or STORE>)",
TokenID: 0, FurthestOnly: true}`. No request body can set `FurthestOnly` or
`TokenID`: `POST /me/listening/sync` refuses an unknown field. Each event's book is
resolved under the **person's** scopes (`userPathResolver`, `catalog.UserScopes`),
then must be a synced title's match (`AudibleSyncBooks`) whose Audible length
agrees with the book's (`audibleRuntimeAgrees`, listen and finish alike). The
book's length is its indexed duration, else the `duration` on the person's own
progress row for it: the progress feed's rule, so the two never disagree.
`FurthestOnly` (`furthestListen`) then applies only a place more than
`furthestSlack` ahead, over any device's row, keeping the row's `updated_at`,
speed and offer, and compares `finish_changed_at` for a place from before a finish
or a restart; `furthestPastEndRatio` (the manager's wrong-match guard) refuses a
place well past the end. A device's diverged span then offers Audible's place by
name (the row's `device_name`, in `other_place`). The rules and each event's
`rejected`/`not_applied` reason are in the
[API reference](../server/api/reference.md#post-apiv1bridgeaudibleaccountsaccountlistening).

The device id `audible:<account>` (`catalog.AudibleDevicePrefix`) is the route's
alone: `POST /me/listening/sync` refuses a batch naming one (`400 device_id is
reserved`), a `PUT .../progress` naming one (a row echoed back) saves under no
device id, and an edit of the row (`EditProgress`, the listener's or an admin's)
clears it, so the edit reaches the feed and Audible's next place can't undo it
unseen. A listening import (Audiobookshelf) that moves on such a row clears its
device id and name the same way (`importer.mergeProgress`), and its undo restores
the earlier place under no device either (`progressPrior.restored`), never as
Audible's, so the feed carries the undo to Audible too.

### The server to Audible: the push loop

`audiblesync.Pusher` is not a job (no row a minute). Every minute (`PushEvery`), for
each account mapped here that isn't refused, waiting or paused, it reads the feed
[`GET /bridge/progress`](#the-two-bridge-routes) from the account's `push_cursor`
(both started again by a mapping to another server, person or library). The feed
pages in the server's write order and may give a row again with `updated_at`
unchanged, so a row is new by its **place** alone, never its time or version: a new
version at the same place never re-arms a push. The baseline (every read until one
reaches the feed's end) takes only rows of the last 10 minutes by `updated_at`
and records the older ones as history, never pushed; after it, every row read is
new. A row the Bridge fails to record keeps the cursor, so
the pass reads it again. It skips rows written by `audible:<account>`, and keeps a row on a title
the last sync didn't list for that book pending (`listed` 0,
`store.PendAudiblePush`) until a sync lists it.

For each place **still for 3 minutes** (`StillFor`, since `row_seen`: the Bridge
has seen the same place for that long on its own clock, so a push lands up to
about 4 minutes after the listener stops), it drops one under 1 s, within 5 s of
`last_ms` (debounce) or `heard_ms` (echo), or past the runtime. It checks no length
of its own: a book whose length disagrees with the title's runtime never reaches
it, since the feed leaves that row out (the server's `duration_mismatch` rule). It
reads Audible's places once (`Positions`) and drops one Audible moved on
from since (over 5 s further on and neither `last_ms` nor `heard_ms`: furthest wins,
and the next sync brings it in); else writes it: `ContentACR` once per ASIN (cached;
a cached one a write answers `400`/`404` for is read again and the write tried once
more), then `SetPosition` (`PUT lastpositions`). The server's place is sent as it
is, so a move back on the server reaches Audible.

**Errors never refuse the account.** A `429`/`503` from Audible keeps the place and
waits its `Retry-After` (at least 2 minutes) counted from the failure; a `5xx` or
no answer keeps it and leaves the account for 2 minutes (this loop only); another
`4xx` or a denied license (`audible.IsDenial`) drops it, a throttled device also
leaving the account for 15 minutes. From the server, `sync_off` leaves the account
for 5 minutes, `user_unavailable` or `unknown_account` for 15, a `429`/`503` its
`Retry-After` (at least 2 minutes); all in memory, this loop only. Health
(`sync_at`, `sync_error`, and `sync_retry_at`, which no later call shortens) feeds
the `audible` setup item's detail only ("places not syncing for N accounts: ..."),
never whether it is done.

A successful new Audible sign-in clears the stored `sync_error` and
`sync_retry_at`, as does a `sync_off` response in either sync direction. These
clear stale health and retry information without recording a successful sync;
turning sync off does not claim that a place reached Audible.

### The two Bridge routes

Both are *bridge token*, header only, and act for the account's **person** (never
the paired admin); their shared refusals (`403 sync_off`, `403 user_unavailable`,
`404 unknown_account`) are in the
[API reference](../server/api/reference.md#audible-position-sync).

| Route | What |
|---|---|
| `POST /bridge/audible/accounts/{account}/listening` | `{sent_at, events}` (strict; `sent_at` required; the Sync v2 event shapes and limits): the account's places on Audible, furthest only. `200` the Sync v2 answer |
| `GET /bridge/progress?account=&since=&limit=` | the person's places on the synced titles' books, one row per title, the account's own rows left out, and a row whose own title's `runtime_s` disagrees with the book's length left out (per title), keyset by `(change_seq, asin)`: `{rows, next, more}`. `400 invalid_request` for no account, a bad limit or cursor |

The feed is keyset on `progress.change_seq` (`0066`), the order the server wrote
progress rows in, set by triggers so no write path can miss it: a row written late
with an earlier `updated_at` (an offline backlog, a client's clock behind) is still
fed, and a title newly matched, synced again or whose runtime changed offers its
book's place again (the Bridge drops a place it already holds). The counter and its
triggers are in the [data model](../server/data-model.md#the-bridge).

The Bridge mirrors them by hand in `internal/link/audiblesync.go`
(`AudibleSyncParams`/`AudibleSyncTitle`, `PostAudibleListening`, `AudibleProgress`;
`403 sync_off` is `ErrSyncOff`, `403 user_unavailable` `ErrUserUnavailable`).

### Bridge migration `0011_audible_push`

`audible_push`, keyed `(account, asin)`: the book the last `audible.sync` listed
(or, with `listed` 0, the one a feed row named, pending until a sync lists it),
`library_id`/`path`, `runtime_s`, `listed`, the cached content reference (`acr`),
`last_ms`/`at` written to Audible, `heard_ms` sent from it (each clears the other:
`AudiblePushed`, and `AudibleHeard` for a write before the job began), `want_ms`
waiting, and the feed row last read: `row_ms` and `row_seen` (when this Bridge
first read that place, the stillness clock). Migration `0014_audible_reasserted`
adds `reasserted_ms` (`-1` none): the written place a sync already wrote again
once (step 7 above). On `audible_accounts`: `push_cursor`/`push_from`, the health columns
`sync_at`/`sync_error`/`sync_retry_at`, and `refusal_kind` (above).

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
  device gets `401`, and `/_fake/refuse` makes it `403`.
- Register records each device's profile (its serial and app, os and software
  versions). Only the current profile with a 40-character serial gets licenses.
  Any other device lists its library, but every license is denied with the three
  throttled reasons, its customer id quoted, to prove the redaction.
  `POST /_fake/old-profile` ages every device registered so far.

**Library and places.** Library paging; `lastpositions` with a `400` over its limit
(10 by default); and `PUT lastpositions`, each recorded with its time
(`put_positions[].at` on `/_fake/calls`).

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
| `GET /_fake/titles` | the fixture titles |
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
Amazon endpoint at a fake, and `AUDIOSILO_BRIDGE_AUDIBLE_RECORD_DIR` records every
exchange into a `0600` JSON-lines file there, scrubbed as it is written
(`audiblefake.Recorder`: secret keys and the customer, device and token subtrees
redacted, headers from an allowlist, signed CDN queries dropped): the owner's
recording run that later, recorded fixtures will come from. See
[Configuration](configuration.md#audible) and
[Development](development.md) for the tagged gate.

```sh
go run -tags audiblefake ./cmd/audiblefake --listen 127.0.0.1:8099
go build -tags embedui,audiblefake -o bin/audiosilo-bridge-fake ./cmd/audiosilo-bridge
AUDIOSILO_BRIDGE_AUDIBLE_FAKE_URL=http://127.0.0.1:8099 ./bin/audiosilo-bridge-fake --data ./data
```

The fake covers the shape of Audible's answers; only a real account proves them.
