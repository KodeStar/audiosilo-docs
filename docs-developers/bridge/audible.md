---
title: Audible
description: "Bridge Phase 4a: Audible accounts on the Bridge (the paste-back PKCE sign-in, device registration and deregistration, the vault), the audible.poll job, its matching rules (contested books, folder-code positions, release dates) and its paced ASIN backfill, the server's accounts and titles (0063), its scheduler and the audible module, the console's card and titles page, and the build-tagged Audible fake."
---

Phase 4a of the Bridge plan (BRIDGE-PLAN.md Phase 4, the workspace's
`.phase-4/plan.md`): the Bridge signs in to Audible accounts, lists what each owns
and matches it against a books library on the server, and the console shows the
result. **Nothing downloads yet** (4b, `audible.import`) and **places don't sync
yet** (4c). The player has no Audible surface.

The Audible client came from **audiosilo-manager**: its `audible`, `importjob`,
`placement`, `source`, `transfer` (`Local` only) and `progress` packages were
imported **with their history** (`git filter-repo`), so `git log --follow` reaches
the manager's fixes. The manager's `registry` was imported and deleted in the same
change: the Bridge's vault (`internal/secrets`) and the server's `audible_titles`
columns replace it. AAX activation bytes, the "sims" series watch and the folder,
probe and OpenAudible sources were not imported.

## Who holds what

| Where | What |
|---|---|
| The Bridge's vault | each account's sign-in, sealed as `audible_<id>` (`secrets.AudibleName`): the access, refresh and adp tokens, the device's RSA key, its serial, the customer id and marketplace (`audible.Credentials.Marshal`). **Full Amazon account access**, so never anywhere else |
| The Bridge's `bridge.db` | `audible_accounts` (migration `0009`): `id`, `label`, `marketplace`, `customer_hash` (sha256 of the customer id, never the id), `server_id` (the server the mapping was last recorded on), `user_id`/`user_name`, `library_id`, `policy`, `sync`, `created_at`, `last_ok_at`, `last_poll_at`, `last_titles`, `last_matched`, `refused_at`, `last_error`. Unique on `(customer_hash, marketplace)` where the hash isn't empty. No credential |
| The server | the mapping and the titles (`0063`, below), and the poll schedule. It never talks to Audible and never holds a credential |

No credential reaches the store, job params or results, logs, the heartbeat or the
agent staging folder (the Bridge's tests walk all of them for every stub secret).
The pasted sign-in address holds a one-time authorization code: the page API takes
it and never answers it back or logs it. Errors carry Amazon's or the server's
answer, never a request body or a token.

## The sign-in (`internal/audibleacct`)

Amazon doesn't allow a third-party sign-in page, so the Bridge uses the Audible
app's own flow and the admin pastes back where it ends:

1. **Start** (`Manager.Start(marketplace)`, page `POST /api/accounts/audible/sign-in
   {"marketplace"}`): a PKCE pair and a device serial (`audible.NewPKCE`,
   `NewDeviceSerial`) held **in memory only** for `LoginTTL` (15 minutes; at most 8
   at once, the oldest dropped), and the authorize URL (`BuildAuthorizeURL`). The
   answer is `{login, url, marketplace, expires_at}`.
2. The admin signs in at `url` in their own browser. Amazon lands on
   `/ap/maplanding?...openid.oa2.authorization_code=...`, a page that doesn't
   exist; the admin copies its address.
3. **Finish** (`Manager.Finish`, page `POST /api/accounts/audible {login,
   redirect_url, label, user_id, library_id, policy, sync}`): the mapping and the
   code are checked first (a page without a code keeps the login for another try),
   then the login is spent, the device registered (`audible.Register`: code +
   verifier -> `Credentials`), the mapping recorded on the server
   (`PUT /bridge/audible/accounts/{account}`) **before** anything is sealed, the
   credentials sealed as `audible_<id>`, and the row stored. Any step after the
   registration that fails deregisters the new device and puts back what it
   changed (best effort): a new account is DELETEd on the server, an existing
   one's earlier sign-in goes back in the vault and its earlier mapping is PUT
   again. A failed sign-in leaves no device and the account as it was.

The device is named `"<first name>'s AudioSilo"` in the Amazon account's device
list (`audible.DeviceName`, decisions 14/16: "AudioSilo", not "Bridge"). The
account id is the Bridge's own, `^[a-z0-9]{8,32}$`, opaque to the server.

**A sign-in of an Amazon account already here** (same `customer_hash` and
marketplace) replaces it: same id, the old device deregistered afterwards (an
earlier sign-in that can't be opened is logged and its device stays). `Finish`
runs one at a time from that lookup until the row is stored (`finishMu`, backed by
the unique index), so two sign-ins of one Amazon account finishing together end as
a sign-in again, not two accounts. A label the Bridge made (`"<person>
(<STORE>)"`) follows the person when a mapping changes; a typed one stays.

**Map** (page `PUT /api/accounts/audible/{id}`) records the new mapping on the
server first, then locally. The page checks that the library is a books library
the heartbeat listed and that the person is one `GET /bridge/users` lists.

**Remove** (page `DELETE /api/accounts/audible/{id}`, answering `{audible,
warning}`) forgets locally **first** (the vault, then the row; it takes `finishMu`
meanwhile), then DELETEs on the server, then deregisters
(`audible.Deregister`: `POST /auth/deregister` with
`deregister_all_existing_accounts: false`, this device only, refreshing an access
token within 2 minutes of expiry first). It runs to the end even if the page goes
away. A server or Amazon failure is a `warning` for the page, never the account
kept. When the server's DELETE failed, the server keeps an orphaned account until
an admin removes it
([`DELETE /admin/audible/accounts/{account}`](../server/api/reference.md#delete-apiv1adminaudibleaccountsaccount)):
from the console while the module is on, else as an API call, since the console
hides its Audible card and page while the module is off.

**Refused.** A `401`/`403` on a signed call (`audible.IsRefused`) marks the account
refused (`refused_at`, `last_error`; the page's **Sign in again**), unless a sign-in
again replaced the device meanwhile, in which case `Library` lists again. In 4a a
refused account's poll **fails** (it isn't parked). Signing in again clears it, and
so does a poll that succeeds.

The page's `GET /api/accounts/audible` answers `{accounts, marketplaces, policies,
paired, libraries, users, users_error}`: the people are read live from the server's
`GET /bridge/users`, the libraries are the heartbeat's books libraries, and an
account whose `server_id` isn't the paired server's is `other_server: true`. The
page's Audible writes have a 15-minute write timeout (`audibleWriteTimeout`): each
calls Amazon or the server, whose backoff may wait minutes.

## The audible client (`internal/audible`)

Signed calls (RSA PKCS#1 v1.5 over method, path and query, date, body and the adp
token; no bearer), `Library` (pages of 1000, deduped, at most 250 pages;
`UnavailableReason` says preorder, show/periodical or no download rights),
`LastPositions` (25 ASINs a request, split on a `400`) and `SetLastPosition`,
`License` + `DecryptVoucher` and `Source.Acquire` (for 4b). Phase 4a added
`RefreshAccessToken`, `Deregister`, a Range-resumable `Download` capped at
`MaxBytes` (4 GiB by default), `last_updated` from `lastpositions`, a backoff on
`429`/`503` (`Retry-After` seconds or a date, else 2 s doubling, 4 attempts, a wait
over 2 minutes fails at once, each attempt signed afresh) and injectable endpoints
(`WithEndpoints`, `WithHTTPClient`; `EndpointsFor(marketplace)` the real ones).
Marketplaces: `us`, `uk`, `de`, `fr`, `ca`, `it`, `au`, `in`, `jp`, `es`, `br`.

## The poll: `audible.poll`

**On the server** (`internal/bridge/audible.go`) the kind is internal (refused by
`POST /admin/bridge/jobs` with `400`) and quiet (no notifications), with params
exactly `{"account"}` (strict), no library or path, deduped per account
(`audiblePollSuffix`), owned by the `audible` module (`ModuleFor`: a queued poll is
held while the module is off), and it **promotes**: a request that finds the
account's poll open raises its priority, never lowers it. Enqueue keeps only the
newest ended poll of each account (`pruneAudiblePolls`). Removing an account cancels
its open poll (`CancelAudibleRemoved`), and so does deleting the library it is
mapped to (`CancelAudiblePaused`): both are `IsCancelReason`'s, and the console
keeps a copy (`SERVER_CANCEL_REASONS`).

**The scheduler** (`internal/audible.RunScheduler`, the module's `Start`) passes
at once, then every minute while the module is on: with an online Bridge that
offers the kind, it queues up to 20 due accounts (`catalog.DueAudiblePolls`: not
paused, mapped to a person an account may still be mapped to, `last_queued_at`
older than `poll_hours`, 6 by default) at priority `-10` and records
`last_queued_at`, so a failed poll waits its interval. The console's Check now
(`POST /admin/audible/accounts/{account}/poll`) queues at a person's priority
(`0`), or raises the open one to it.

**On the Bridge** (`internal/audiblejob`, the `light` lane) a poll:

1. checks the account is this Bridge's and was mapped on the paired server (else
   it fails, asking to map it again);
2. lists the Audible library (a refusal is the account's: the job just fails);
3. reads the account's library on the server, 500 books a page
   (`GET /bridge/libraries/{id}/books`, at most 2000 pages);
4. skips records without a usable ASIN, and states the rest from
   `UnavailableReason`: `""` is `available`, `"pre-order"` `preorder`, anything
   else `unavailable` with the reason;
5. matches them with `importjob.BookMatcher` over `[]link.LibraryBook`
   (`audiosilo-server/pkg/match.BestWith` under `match.ImportOptions()`: ASIN exact
   first, then author + series + title tokens; a book in several series is a
   candidate under each; narrators join the person gate; see
   [Matching rules](#matching-rules)), then settles books several titles claimed
   (`importjob.KeepBest`). `how` is `asin` when the book's ASIN is the title's,
   else `fuzzy`. A book path goes out only as `.` (a library that is one book) or a
   clean path below the root, as the server takes it;
6. PUTs the titles in calls of 500 under **one** poll id (the job, the attempt and a
   random suffix), the last one `final` (an empty library sends one empty final
   call, so every title becomes `gone`), with each title's authors cut to 20;
7. **backfills ASINs** (`PUT /bridge/libraries/{id}/enrichment`) for each matched
   book without one, unless a second title claims the same book
   (`importjob.Contested`: derive nothing durable from a doubtful match) or the
   title is a preorder (not out yet: the book is another edition). `asin_set` and a
   moved book are skipped, other failures counted. The PUTs are paced (see
   [Enrichment pacing](#enrichment-pacing)).

The result is counts only, never a title or a credential: `account`, `poll_id`,
`titles`, `available`, `preorder`, `unavailable`, `skipped`, `matched`,
`matched_asin`, `matched_fuzzy`, `contested` (books more than one title claimed),
`enriched`, `enrich_failed`, `enrich_deferred` (omitted when 0), `books`.
`matched` counts the titles that kept a match.
A poll that finished records `last_poll_at`, the counts and clears a refusal on the
Bridge's row; one stopped, cancelled or lost records nothing.

### Matching rules

`pkg/match` is shared by the server's catalog, meta, importer, matchrun and
chapteralign. Its default behaviour (`Best`, or `BestWith` with the zero
`Options`) is what those callers were tuned on and is unchanged. The Bridge turns
on every opt-in rule with `match.ImportOptions()`: rules for mapping a store's
whole catalog onto a library where both sides are mostly right but spelled
differently. No server caller uses them.

| Option | Rule |
|---|---|
| `SeriesMarker` | a wordy candidate title with no position confirms a bare query's number when it names its place right after the series, `<series>[ Series][,:-( ]Book N` ("Iron Will: Dragon Heart Series, Book 2" is Dragon Heart 2). Confirm-grade only, never a veto; "Book 1-3" is no marker |
| `ExactTitle` | the same title by the same person (`exactTitleKey`: case, spacing, punctuation, bracketed groups and edition words aside) adds `scoreExactTitle` (3.0, enough alone to clear the threshold) to the pair's own score, so it matches across differently named series while the series and number still rank two same-titled candidates. Not when a side's title is just its series name and number, which every volume shares |
| `WordlessFallback` | a cleaned title left with no word and no digit ("The" of "The Mayor of Noobtown" in series "Mayor of Noobtown") falls back to the uncleaned one; a series-named candidate it gave words back to must then agree on the number (1 when it states none) |
| `DropUnabridged` | "(Unabridged)" is removed before a genre tail is judged ("The Primal Hunter 15: A LitRPG Adventure (Unabridged)" is volume 15) |

`BestWith` also returns the winning score (`match.ScoreASIN`, 10, for an ASIN
match), which `BookMatcher.MatchScored` hands to the contested rule.

**The listing's folder-code position.** `GET /bridge/libraries/{id}/books` sends
each series' position as a string, as stored (`"3"`, `"1-3"`, `""`). When the
main series has none, the listing (`bridgeSeries`) takes it from the code leading
the book's folder name (`metadata.FolderCodePosition`): one to five letters, an
optional space, then a number of one to three digits with an optional decimal part
(`DH06 - Land of Magic` is `"6"`, `DF15.5 Brief Cases` `"15.5"`). The letters must
be the series' initials, all or some in order (`BDM` for "Beneath the Dragoneye
Moons"); `HALO 07` in series "Halo", a franchise's own numbering, gives none, as
does 0. A range code (`LAM05-06`) goes out as the range, `"5-6"`. Only this
listing reads folder codes: the scan's positions, and every other route, are
unchanged.

On the Bridge a position that isn't one number (a range) gives the candidate no
number, so a single Audible volume's number never confirms an omnibus folder. An
Audible title whose own position is a range and that has no sequence is placed at
the range's start (`rangeStart`), so a number in its title ("Pack 3") never stands
in for the position Audible gave.

**Contested books.** `importjob.KeepBest` settles a path several titles claimed
(`Claim{Path, Score, Work}`): only the single best score keeps the match, and a tie
for the best keeps none, unless every tied title is the same work (`WorkKey`: the
folded title, the folded authors in any order and the series position), which all
keep it: one book owned twice, two ASINs. The others are PUT with no `match` and
`reason: "contested"` (`link.ReasonContested`, set only on a title with no other
reason), so the console shows them as not here and 4b's back up of everything
skips them. A contested path gets no ASIN backfill, not even from the title that
kept it.

### Release dates

`audible.Library` takes a title's date from `release_date`, else `issue_date`,
keeping only a plausible one (`plausibleDate`: parseable, a year before 2100 and at
most two years after now). With neither, the date is unknown (`release_date` `""`)
and reads as released: Audible sends placeholders such as 2200-01-01 for titles it
has had for years, and those must never be stored as preorders. `unavailableReason`
checks the delivery type (`Periodical`, `PodcastParent`) and `customer_rights`
before the preorder rule, so a show or a title without download rights is never
called a preorder. A title whose date was set aside is logged once per listing
(its ASIN and title, both dates, `content_delivery_type`, `content_type` and
`is_consumable_offline`; never a token or the customer id) through the client's
`WithLogger`.

### Enrichment pacing

A first poll can backfill hundreds of ASINs, one PUT each, and the server's
address limiter (shared with the house's players) answers a quick run `429`. The
server is unchanged; the Bridge paces the PUTs (`audiblejob.enrich`): at most one
per 200 ms (`enrichGap`). A `429` waits its `Retry-After` (seconds or an HTTP date,
read into `link.APIError.RetryAfter`), else 2 s doubling with each `429` in a row,
then tries the same book again, and doubles the gap up to 2 s. The poll leaves the
rest of the backfill to the next poll after more than five `429`s in a row, a
`Retry-After` over a minute, or 10 minutes of enriching (`enrichBudget`): those
books still have no ASIN, so the next poll picks them up again. Their count is the
result's `enrich_deferred`. Only a cancelled job fails the poll.

Registering the kind is what adds `audible` to the heartbeat's features
(`bridge.FeatureAudible`), which the `audible` module needs.

## On the server (`0063`, `catalog/audible.go`)

Two tables, `audible_accounts` (the mapping, `poll_hours`, `last_poll_at`,
`last_queued_at`) and `audible_titles` (one row per account and ASIN, with its state
and match, plus the columns 4b fills, which a titles PUT never overwrites): the
columns are in the [data model](../server/data-model.md#the-bridge).

- **Paused** is `library_id` NULL: the library was deleted. `DeleteLibrary`, in the
  library's own transaction, clears the matches into it and cancels the paused
  accounts' open polls, so no titles call can match into it in between. The
  scheduler skips a paused account and Check now is `409 account_paused` until the
  Bridge maps it again.
- A title's match **moves with its book**: a move (`moveBookState`, a scan's move
  detection or a Bridge rescan's `from`) and a join (`joinBookState`) carry it.
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
  `.../poll`) answer `404 module_off` while it is off;
- `DELETE /admin/audible/accounts/{account}` is **outside** the toggle (admin only):
  an account the Bridge can no longer remove must be removable after the module is
  turned off. The console only shows it while the module is on, so with it off it
  is an API call;
- queued polls are held while it is off, and the scheduler only runs while it is on.

The player doesn't read the flag and doesn't mirror it (`Capabilities`,
`ModuleFlag`): it has no Audible surface yet. An old client ignores an unknown
flag.

## The console

While the module is on, Settings > Bridge gains an **Audible accounts** card (the
mapping read-only, title counts, Check now and Remove per account) and Settings >
Audible lists the titles with their filters; Remove removes the account from this
server only. The components are in the [console's catalogue](../server/web-ui.md#what-the-console-has-today).
The Bridge's optional setup step `audible` (done with an account signed in and none
refused) links its Accounts tab. See the
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
| `GET /admin/audible/accounts` | admin, module on | the accounts with title counts |
| `GET /admin/audible/titles` | admin, module on | the titles, filtered and keyset-paged |
| `POST /admin/audible/accounts/{account}/poll` | admin, module on | Check now |
| `DELETE /admin/audible/accounts/{account}` | admin | remove an account from the server only |

The Bridge mirrors the bridge-token routes by hand in `internal/link/audible.go`
(`Users`, `PutAudibleAccount`, `DeleteAudibleAccount`, `PutAudibleTitles`,
`LibraryBooks`, `Enrich`) and decodes nothing it doesn't need; the server decodes
accounts and titles strictly, so the Bridge sends only the documented fields.

## The Audible fake

`internal/audible/audiblefake` exists **only** with the build tag `audiblefake`; no
release build or image carries it. It is an httptest server with synthetic fixtures
shaped from the manager's code and tests (30 made-up titles: 22 available, 4
preorders, 4 unavailable; 7 places): `/ap/signin` redirects to its own
`/ap/maplanding` with a code bound to the PKCE challenge, `/auth/register` checks
the verifier and client id and issues a device key, `/auth/token`,
`/auth/deregister` (this device only, recorded), signed calls verified against the
issued key (an unknown or deregistered device `401`, `/_fake/refuse` `403`),
library paging, `lastpositions` with a `400` over its limit (10 by default), and
`PUT lastpositions` recorded. `licenserequest` answers `501` until 4b. Its controls
are `GET /_fake/calls`, `POST /_fake/refuse` and `GET /_fake/titles`.

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
