---
title: Connect and home/away addresses
description: "The connect and onboarding flow (src/app/connect/, src/components/connect/): the address probe, sign-in, finishConnect and repairPlan, \"Your library is ready.\", remembered servers and the reconnect banner; and the home and away addresses: the stored pair, the pick rule, the native address runner and its security rule."
---

This page covers two closely coupled pieces:

- **Connect and onboarding**: every way a device gets a session.
- **Home and away addresses**: how a native app picks which of a server's addresses
  to talk to (capability `addresses`).

The user-facing side is [Connecting and signing in](/users/listening/connecting). The
wire is in the [API reference](../server/api/reference.md#get-apiv1addresses) and the
[cross-repo contract](../architecture/cross-repo-contract.md#7-pairing--connect-deep-links).

## Connect and onboarding

The routes are `src/app/connect/{_layout,index,sign-in,ready,scan}.tsx`. The screens and
their rules live in `src/components/connect/`, with the pure rules in `connect-model.ts`.
The route table is in the [overview](routes.md#route-map). The flow has three steps,
counted by `StepDots` (`CONNECT_STEPS`): Start, Sign in and Ready.

### Step 1: Start

`/connect` renders `ConnectStart`. Its address field asks the server who it is
(`GET /server` through a bare `ApiClient`) and shows a `ProbeNotice` with one of these:

- "Found &lt;name&gt;" with its version, **Sign in**, and **Try the demo** when
  `demo.enabled`.
- "Couldn't reach &lt;address&gt;", with a home-network hint when `looksLikeHomeAddress`
  holds. That check uses the same host rule as the server (see
  [`lan_url`](../server/configuration.md#home-address-lan_url)).
- The server's error.

#### Pairing links, QR codes and invite links

Native offers **Scan a QR code** (`/connect/scan`, `expo-camera`). Web offers **I have a
pairing link**, which takes a pasted link and parses it with `parsePairingScan`.

Both also take the console's **invite link**,
`https://<base>/connect#code=XXXX-XXXX-XXXX-XXXX`. `parseInviteScan` in
`src/lib/pairing.ts` reads it, and the server builds it in `inviteURL`. A `/web/connect`
link is a pairing link, never an invite. An invite link sets the pending server and
opens the sign-in step, which fills the code in and signs in with it at once, once
(`initialCode`). The code is handed over in memory (`holdInvite` and `takeInviteCode` in
`invite-handoff.ts`), taken once and only for that server. It never goes in the route,
where it would stay in the browser's history.

On the served player, a pasted pairing or invite link for **another server** sends
nothing. The player's CSP would block the call, and the failure would read as "Could not
reach the server". Instead the screen says the link is for another server and offers
**Open the link** (`Linking.openURL`).

A route `token` comes from a pairing link or QR. It carries `server` on native, and
`home` and `away` when the server sent them. The flow exchanges it at once.

#### Remembered servers

Remembered servers that the person listening isn't signed in to show as one-tap
"Reconnect to &lt;name&gt;" rows. `knownToOffer` picks them over `useProfileConnections`,
from `src/lib/known-servers.ts`. For Add someone (`?profile=new`) it offers every
remembered server.

On native, a remembered server with a home address is asked who it is there first
(`reconnectAddress` calls `pickAddress`, [the pick rule](#the-pick-rule-srclibserver-addressts)).
A reconnect goes straight to sign-in unless the server runs a demo.

#### The served player

**The served player** is a production web build whose origin is the server
(`servedOrigin()` in `src/lib/base-url.ts`). Its CSP, `connect-src 'self'`, reaches no
other origin, so the person types nothing:

- On open it asks its own origin, with a spinner meanwhile, and shows the found card
  with no address field and no remembered servers.
- Only when that probe fails does the field show, filled in with the origin.
- "Add a server" is hidden while every connection is at the page's origin
  (`onlyOwnServer`).
- The sign-in step's "Another server" reads "Back" and goes back.

The Metro dev server (`npm run web`) is not the server, so it keeps the field.

### Step 2: Sign in

`/connect/sign-in` renders `SignInStep`. It signs in against the address in
`pendingServerUrl`, read once when the screen opens, in one of two ways:

- **An invite code**: `redeemCode`, then `exchange`. A code handed over by an invite
  link is submitted at once, and a refused one stays in the field with the reason.
- **A username and password**: `login`.

The step uses a bare client, because this is not a saved connection yet and a wrong
password's `401` must never flag a reconnect. The username is sent trimmed. An empty
code, username or password is prompted for under its field, and nothing is sent.

#### How a refusal reads

`signInErrorText` in `sign-in-error.ts` puts a refusal in the app's words. It reads the
status and the request that failed (`SignInStage`):

| Answer | Says |
|---|---|
| `401` or `400` at `redeem` | The code didn't work. |
| `401` or `400` at `exchange` | The invite is used up or expired. |
| `401` or `400` at `login` | Wrong name or password. |
| `invite_used` or `invite_expired` on a redeem | Its own sentence. These codes need server 2.5.0; an older server's bare `401` reads as a code that didn't work. |
| `member_disabled` | Its own sentence. |
| `429` | The wait in whole minutes from `Retry-After` when the server sent one (`connect.signIn.errors.wait`), else "Too many tries". |
| Anything else, such as no answer or a `5xx` | "Sign in failed". |

`sharedRefusalText` is the part a pairing link shares.

The step shows the "At home and away" card only when the device already knows both
addresses, which means a reconnect of a connection that has them. For a new server, the
addresses are known only once the code is redeemed, and that is the sign-in itself.

### Step 3: Ready

`/connect/ready?connection=` renders `ReadyScreen`. It shows:

- "Your library is ready."
- The library sentence (`readyLine`). It is built from the library names and
  `bookTotal`, which sums each library's authors list under `browse_people` and is null
  without it.
- The listener's latest place on that server (`latestPlace`).
- The "At home and away" card when the server has both addresses.

Start listening leaves onboarding. When a place came with the listener, it plays that
book from that place through `usePlayBook`, in the full player on a phone and the docked
bar wider. Browse the library dismisses to `/library`.

### `finishConnect`: every way in ends here

**Every way in ends in `finishConnect`** (`finish-connect.ts`): a pairing link or QR, an
invite code, a password, the demo. It stores the connection through `setSession` with:

- the server's own name when the flow knows it, from the probe or the redeem payload's
  `server_name`. A connection made by a link is not named after its host.
- the addresses the link (`linkAddresses`) and the answer taught, merged there once
  (`mergeAddresses`).

Where the flow goes next:

- The device's **first** connection shows `/connect/ready`.
- An added server goes straight back with `leaveOnboarding()`.
- A link that names a book ends on its page instead
  (see [A link that names a book](#a-link-that-names-a-book)).
- Whenever the person listening is in kids mode afterwards (a kid's account signing in,
  described below), the flow goes straight to `/kids`, with no "Your library is ready.".

#### When a link's exchange fails

A link's failed exchange is described in the app's words, never the server's. **One
classifier** (`pairFailure` in `use-pairing.ts`) reads the error once for both the words
and what the failure means for the link (`PairOutcome`), so the two can't disagree.

**Refused** means the link is dead. It covers every `4xx` except `408` and `429`:

- When the server names a code (`invite_used`, `invite_expired`, `member_disabled`),
  `sharedRefusalText` words it. `/auth/exchange` names none today, so a link's `401`
  takes the next rule.
- A `401` or `410` is "This pairing link has expired or was already used..."
  (`pairingRefused`).
- Any other, a `409` without a code among them, is "This pairing link can't be used..."
  (`pairingUnusable`).
- A failure after the exchange answered is refused too. The token is spent, but this
  device couldn't keep the session: "This link was used, but signing in didn't finish.
  Ask for a new link." (`pairingSpent`).

**Temporary** means the same link can work later:

- A `429` names the wait in minutes from `Retry-After` when sent, else "Too many tries".
- A `5xx` or another non-`4xx` status is "The server couldn't finish pairing..."
  (`pairingServerError`).
- A `408` or no answer is "Could not reach the server to finish pairing.", or the
  self-signed certificate sentence where that may be why (`selfSignedMayBeWhy`).

Only a refusal drops the route's `token`, so a reload doesn't try it again, and shows the
served player's card. A temporary failure keeps the token for a reload and offers **Try
the link again** (`connect-start.tsx`).

### A link that names a book

A connect link can name a book to end on: `book=<library_id>&path=<rel_path>`. Beside
`token` and `sid`, it carries `uid=<user id>`, the user its token was minted for. The
admin console's **Listen in player** builds one
(`/web/connect?token=…&sid=…&uid=…&book=…&path=…`, same origin), and nothing else does
yet.

`parseConnectBook` (`src/lib/paths.ts`) reads it. `book` must be a positive integer and
`path` non-empty; otherwise the link names no book and the flow ends as it always does.
The book travels on the `PairingScan` as `book` and `userId`. Both the route's params and
a pasted link (`parsePairingScan`) fill it the same way, so a pasted link behaves as the
opened one. The flow rebuilds the destination with `bookHref` and never follows a URL
from the link, so there is no open redirect.

Then one of two things happens:

- **Already signed in as that user there.** `signedInAs` in `connect-model.ts` looks for
  a connection on the `sid` server whose `user.id` is `uid`, whose token is not refused
  and with no `needsReconnect`. When it finds one, there is no exchange:
  - `useLinkPairing.pair` checks this first. When the session read failed at launch, it
    reads the connections again, as `finishConnect` does.
  - It then asks `GET /me` with the stored token at the connection's own address, never
    the link's, and ends on the book.
  - The unused token expires by itself, and no second session (or "new device" notice)
    is made at each press.
  - A 401 there means the token was revoked, and the flow falls through to the exchange.
    A server that doesn't answer still opens the book.
  - "Add someone" never skips, so the exchange switches to that person.
- **Otherwise** the token is exchanged as for any link. `finishConnect`'s `book` ends the
  flow on the book's page (`router.dismissTo(bookHref(…))`) instead of `/connect/ready`
  or Home, first connection or not.

Both end through `endConnect` (`finish-connect.ts`), the flow's one ending, so kids mode
still wins (`/kids`) either way.

Native is unchanged, because no link it receives carries `book`.

### Kids mode and the sign-ins that skip `finishConnect`

**Kids mode never runs the flow.** `src/app/connect/_layout.tsx` is the one gate (see
[Kids mode](kids-mode.md#the-route-and-its-guard)). A kid's account placed for the first
time on this device starts in kids mode (`kidsOnForKidAccount`, see
[Kids mode](kids-mode.md)).

Two sign-ins skip `finishConnect`:

- the public demo landing (`src/app/demo.tsx`), which calls `setSession` itself so its
  QR stays on screen.
- a household member signed in beside the owner (`addMemberHere`, or `renewMemberHere`
  when signed in again; see
  [Signing a member in here](household.md#signing-a-member-in-here)).

### What a sign-in stores (`repairPlan`)

`repairPlan` decides what a sign-in stores:

- **The same connection again**, when its `server_id` answered through one of its own
  addresses. Keep its paired `serverUrl`. The reconnect banner signs in through the
  address in use now, which away from home is the away address.
- **A reset server**, when the banner's connection, reached through one of its own
  addresses, answers with a new `server_id`. Store the old connection's `serverUrl` and
  carry its addresses over; the home address is probed against the new id before it is
  used. `finishConnect` then retires only the **re-pairing person's own** dead identity
  at that URL (`staleToRetire`, passed to `setSession` as `retire`). That person is the
  banner's person, else the person listening, and nobody for Add someone. The new
  connection takes its place in their profile. Other people's connections stay, flagged
  `server-reset`, for them to sign in again
  ([Session](state-and-data.md#session-srcstoressessionts)).
- **Anything else**: store the address signed in through.

### The bounce, the reconnect banner and the screens

`/connect` bounces when there is nothing to add: an authenticated user without `?add=1`,
a `?token=` or a sign-in mid-flow. It decides this when it opens and when it is back on
top, never while another screen of the flow is over it.

The **reconnect banner** (`src/components/layout/reconnect-banner.tsx`) sets
`pendingServerUrl` to the address the connection uses now (`effectiveUrl`) and opens the
sign-in step with `reconnect=<cid>`.

The connect screens are full screens. `ConnectFrame` shrinks its column by the keyboard
overlap, and `ConnectInput` scrolls the focused field into view (`revealOffset`). Use
both for any new field there, because Android is edge to edge and the window doesn't
resize. The phone's cover panel (`CoverFan`, `cover-cascade.tsx`) is generated art, so
never put fake titles on it.

## Home and away addresses

A server may have two addresses:

- a **home** address: its address on the household network, often plain `http`, and
  only reachable at home.
- an **away** address (`public_url`), reachable from anywhere.

The server side, how each is chosen, is in
[Configuration](../server/configuration.md#home-address-lan_url).

### What the device keeps

`Connection.addresses?: ServerAddresses` (`{ home?, away? }`) is persisted with the
connection metadata. It comes from:

- the pairing link's `home=` and `away=` params (`parsePairingScan`),
- the redeem payload,
- the exchange, login or demo answer.

Each is cleaned once where it arrives, by `cleanAddresses` in `parsePairingScan` and in
the `ApiClient` methods that return them. A clean address is an `http(s)` URL with its
scheme, normalised, and `home` is dropped when it equals `away`.

- `setSession` merges what it is given with what the connection already knew (or, for a
  sign-in after signing out, what the remembered server knew). It keeps that when the
  answer has none.
- `mergeAddresses(prior, fresh)` treats an answer's `away` as authoritative. It **keeps**
  a known `home` when an answer lacks one, because the server derives the home address
  from the request, so an answer read through the away address cannot know it.
- `learnAddresses(id, fresh)` stores a `GET /addresses` answer the same way, merged with
  what the connection had, so a `home` survives an answer read away from home. The
  remembered server (`known-servers.ts`, `rememberAddresses`) learns the merge too, so a
  reconnect after signing out can still start at home.
- **`serverUrl` is never rewritten.** It stays what the listener paired with or typed.

### The pick rule (`src/lib/server-address.ts`)

The rule is pure and tested:

- No `home`: use `serverUrl`.
- With a `home`: ask `GET <home>/api/v1/server` **without a token** and use `home`
  **only when it answers with this connection's `server_id`**. Otherwise use `away`, else
  `serverUrl` (`chooseAddress`, `pickAddress`). The probe is `probeServerId`
  (`src/api/server-id-probe.ts`), a bare client with a 2.5 s timeout
  (`PROBE_TIMEOUT_MS`).

:::danger[Never send a token to an unverified home address]
A home address is a private IP or a local name, and another network can have a
different machine at the same address. A connection's token goes to its home address
only after a tokenless probe there answered with that connection's `server_id`, and a
home pick is dropped the moment the device changes network, before anything else is
sent. Any new code path that talks to a home address must keep this order.
:::

### Pairing at a self-signed server's home HTTP

A server on its own (self-signed) certificate also answers plain HTTP to the home
network ([Home HTTP](../server/configuration.md#home-http-tlshome_http)). Its pairing
links carry `home=http://<host:port>` beside an `https://` base, plus the server's id as
`sid=`, which `parsePairingScan` reads into `PairingScan.serverId`.

The app can't trust the certificate, so `useLinkPairing` exchanges at the base first.
Only when that couldn't connect does it ask `pairingFallback` whether to try the home
address once. `withFallback` never falls back after an `ApiError`, because that is the
server's own answer. `pairingFallback` says yes only when all of these hold:

- The app is native, because an https page can't call http.
- The failure is not a timeout, because a host that never answered would only time out
  again.
- The base is https and the home is plain http on the **same host and port**. An absent
  port is 443 for https and 80 for http.
- The link carries a `sid`.
- A tokenless `GET <home>/api/v1/server` answers with exactly that id.

The exchange's own `server_id` must match too. The connection is stored with the https
base as `serverUrl`, which fails safely by TLS on another network, and the home as its
address. `finishConnect` sets the home pick (`answeredAt`) before the connection is
stored, so its first requests go home. The address runner then keeps that pick by the
usual probe.

Android allows cleartext for this (`expo-build-properties`
`android.usesCleartextTraffic`). iOS's default ATS allows local networking (IP
addresses, `.local` and single-label names), but not a `.lan` or `.home.arpa` name.

When pairing or the address field can't reach an https server at all, the message
names a self-signed certificate as a likely cause. `selfSignedMayBeWhy` decides this:
native, https, not a timeout, and no http retry was made.

The Apple Watch gets its pairing token from the phone in a `pair` message rather than a
link, and follows the same rules in Swift (`Core/AddressPicker.swift`). See
[Apple Watch](apple-watch.md#the-message-contract).

### Where the pick lives (`src/api/address-route.ts`)

The pick is **in memory only**. `useAddressRoute` holds `{ [connectionId]: url }`, and
an absent entry means `serverUrl`.

`effectiveUrl(c)` is the address a connection's requests go to now (`pickedUrl`). That is
the pick while it is still one of the connection's own addresses (`isOwnAddress`), else
`serverUrl`. `ApiProvider` and `resolveClient` (`src/api/connection-clients.ts`) are the
**only** places that build a connection's client, and both build from `effectiveUrl`, so
media URLs follow too. Never build a client from `serverUrl` directly.

`useActiveAddress(cid)` gives `{ url, kind: 'home' | 'away' | 'paired' }` for UI, with
`ADDRESS_KIND_LABEL` and `ADDRESS_IN_USE_LABEL` for the words.

**The web player never switches.** The server serves it same-origin, so `pickedUrl`
always returns `serverUrl` there and the runner doesn't start.

### The runner (`src/api/address-runner.ts`)

`startAddressRouting()` starts once from the root layout, on native only, and re-picks
each connection's address at these times:

- At launch.
- When the app returns to the foreground. It reads the network first, since the device
  may have moved while suspended.
- When the network changes (`expo-network`).
- When a connection's URL or addresses change.
- At once when the reachability tracker marks a connection offline. The tracker's probe
  loop then runs through the client built on the new address.
- Every `HOME_RECHECK_MS` (90 s) while the app is in the foreground, for a connection
  away from its home address. Walking in the door raises no event the runner hears:
  Wi-Fi joins without a type change, and the app stays open. The runner makes one probe
  per connection at a time, and none in the background.

`leaveHome()` runs when the device leaves its network. That is `movedNetwork` (another
network type or no connection) or `ipChanged` (another IP address of its own, such as one
Wi-Fi network to another). Every connection using its home address first drops to its
away address, else `serverUrl`, and the re-pick that follows checks home again.

A per-connection generation counter discards a probe that a newer re-pick, or a change
to the connection, overtook.

The runner also refreshes what the device keeps. `refreshAddresses(cid)` reads
`GET /addresses` from a server with the flag (`addressesQuery`, `skipToken` without it)
at launch, for a new connection and on reconnect, and stores the merge
(`learnAddresses`).

**The playing book.** A streamed book's track URLs are baked in when it loads
(`book-queue.ts`). When its connection's address changes, `followPlayingBook` restarts it
in place, at its position and speed, through the existing `startBookInPlace`, with no
change to the playback internals. It restarts only a streamed book that is placed and is
playing or trying to (`playing`, `loading`), once per load and address. A paused book
moves at the listener's next press on play, and a downloaded book plays from the device
either way.

### In the UI

`AddressesCard` (`src/components/layout/addresses-card.tsx`) is the one "At home and
away" card:

- Connect's sign-in step and ready screen show it when the server has both addresses.
- The Account page shows whichever addresses it knows, from `connection.addresses`
  merged with `useServerAddresses` (on the web, the only refresh). On native it also
  shows which one is in use (`inUse`, from `useActiveAddress`).
