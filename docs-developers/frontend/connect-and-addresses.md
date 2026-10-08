---
title: Connect and home/away addresses
description: "The connect and onboarding flow (src/app/connect/, src/components/connect/): the address probe, sign-in, finishConnect and repairPlan, \"Your library is ready.\", remembered servers and the reconnect banner; and the home and away addresses: the stored pair, the pick rule, the native address runner and its security rule."
---

Two closely coupled pieces: **connect and onboarding**, every way a device gets a
session, and **home and away addresses**, how a native app picks which of a server's
addresses to talk to (capability `addresses`). The user-facing side is
[Connecting and signing in](/users/listening/connecting); the wire is in the
[API reference](../server/api/reference.md#get-apiv1addresses) and the
[cross-repo contract](../architecture/cross-repo-contract.md#7-pairing--connect-deep-links).

## Connect and onboarding

The routes are `src/app/connect/{_layout,index,sign-in,ready,scan}.tsx`; the screens and
their rules live in `src/components/connect/` (pure rules in `connect-model.ts`). The
route table is in the [overview](overview.md#route-map). Three steps, counted by
`StepDots` (`CONNECT_STEPS`):

1. **Start** (`/connect` → `ConnectStart`). The address field asks the server who it is
   (`GET /server` through a bare `ApiClient`) and shows a `ProbeNotice`: "Found
   &lt;name&gt;" with its version, **Sign in**, and **Try the demo** when `demo.enabled`;
   or "Couldn't reach &lt;address&gt;", with a home-network hint when
   `looksLikeHomeAddress` (the same host rule the server uses, see
   [`lan_url`](../server/configuration.md#home-address-lan_url)); or the server's error.
   Native offers **Scan a QR code** (`/connect/scan`, `expo-camera`); web offers **I have
   a pairing link** (pasted, parsed with `parsePairingScan`). A route `token` (a pairing
   link or QR, with `server` on native and `home`/`away` when the server sent them) is
   exchanged at once. Remembered servers this device isn't signed in to
   (`knownToOffer`, from `src/lib/known-servers.ts`) are one-tap "Reconnect to
   &lt;name&gt;" rows; on native, one with a home address is asked who it is there first
   (`reconnectAddress` → `pickAddress`, the rule below), and a reconnect goes straight to
   sign-in unless the server runs a demo.
2. **Sign in** (`/connect/sign-in` → `SignInStep`): an invite code (`redeemCode` then
   `exchange`) or a username and password (`login`), against the address in
   `pendingServerUrl`, read once when the screen opens. It uses a bare client: it is not
   a saved connection yet, and a wrong password's `401` must never flag a reconnect. It
   shows the "At home and away" card only when the device already knows both addresses
   (a reconnect of a connection that has them): for a new server, the addresses are
   known only once the code is redeemed, which is the sign-in itself.
3. **Ready** (`/connect/ready?connection=` → `ReadyScreen`): "Your library is ready.",
   the library sentence (`readyLine`, from the library names and `bookTotal`, which sums
   each library's authors list under `browse_people`; null without it), the listener's
   latest place on that server (`latestPlace`), and the "At home and away" card when the
   server has both addresses. Start listening leaves onboarding; Browse the library
   dismisses to `/library`.

**Every way in ends in `finishConnect`** (`finish-connect.ts`): a pairing link or QR, an
invite code, a password, the demo. It stores the connection through `setSession` with
the server's own name when the flow knows it (the probe, the redeem payload's
`server_name`; a connection made by a link is not named after its host) and the
addresses the link and the answer taught (`pairingAddresses`). The device's **first**
connection then shows `/connect/ready`; an added server goes straight back with
`leaveOnboarding()`.

`repairPlan` decides what a sign-in stores:

- the **same connection again** (its `server_id` answered through one of its own
  addresses): keep its paired `serverUrl` (the reconnect banner signs in through the
  address in use now, which away from home is the away address);
- a **reset server** (the banner's connection, reached through one of its own addresses,
  answering with a new `server_id`): store the old connection's `serverUrl`, so the
  session store retires the dead identity at that URL, and carry its addresses over
  (the home address is probed against the new id before it is used);
- anything else: the address signed in through.

`/connect` decides its "nothing to add" bounce (an authenticated user without `?add=1`, a
`?token=` or a sign-in mid-flow) when it opens and when it is back on top, never while
another screen of the flow is over it. The **reconnect banner**
(`src/components/layout/reconnect-banner.tsx`) sets `pendingServerUrl` to the address the
connection uses now (`effectiveUrl`) and opens the sign-in step with `reconnect=<cid>`.

The connect screens are full screens: `ConnectFrame` shrinks its column by the keyboard
overlap and `ConnectInput` scrolls the focused field into view (`revealOffset`); use both
for any new field there, because Android is edge to edge and the window doesn't resize.
The phone's cover panel (`CoverFan`, `cover-cascade.tsx`) is generated art: never put
fake titles on it.

## Home and away addresses

A server may have a **home** address (its address on the household network, often plain
`http`, only reachable at home) and an **away** address (`public_url`, reachable from
anywhere). The server side, how each is chosen, is in
[Configuration](../server/configuration.md#home-address-lan_url).

### What the device keeps

`Connection.addresses?: ServerAddresses` (`{ home?, away? }`) is persisted with the
connection metadata. It comes from the pairing link's
`home=`/`away=` params (`parsePairingScan`), the redeem payload, and the exchange, login
or demo answer, each cleaned by `cleanAddresses` (an `http(s)` URL with its scheme,
normalised; `home` dropped when it equals `away`).

- `setSession` merges what it is given with what the connection (or, for a sign-in after
  signing out, the remembered server) already knew, and keeps it when the answer has
  none.
- `mergeAddresses(prior, fresh)`: an answer's `away` is authoritative; a known `home` is
  **kept** when an answer lacks one, because the server derives the home address from
  the request, so an answer read through the away address cannot know it.
- `setConnectionAddresses(id, addresses)` replaces them; the remembered server
  (`known-servers.ts`, `rememberAddresses`) learns them too, so a reconnect after signing
  out can still start at home.
- **`serverUrl` is never rewritten.** It stays what the listener paired with or typed.

### The pick rule (`src/lib/server-address.ts`)

Pure and tested:

- No `home`: use `serverUrl`.
- With a `home`: ask `GET <home>/api/v1/server` **without a token** (`probeServerId`,
  `src/api/server-id-probe.ts`: a bare client, 2.5 s timeout, `PROBE_TIMEOUT_MS`) and use
  `home` **only when it answers with this connection's `server_id`**. Otherwise use
  `away`, else `serverUrl` (`chooseAddress`, `pickAddress`).

:::danger Never send a token to an unverified home address
A home address is a private IP or a local name, and another network can have a
different machine at the same address. A connection's token goes to its home address
only after a tokenless probe there answered with that connection's `server_id`, and a
home pick is dropped the moment the device changes network, before anything else is
sent. Any new code path that talks to a home address must keep this order.
:::

### Where the pick lives (`src/api/address-route.ts`)

The pick is **in memory only**: `useAddressRoute` holds `{ [connectionId]: url }`;
absent means `serverUrl`. `effectiveUrl(c)` is the address a connection's requests go to
now (`pickedUrl`: the pick while it is still one of the connection's own addresses,
`isOwnAddress`, else `serverUrl`). `ApiProvider` and `resolveClient`
(`src/api/connection-clients.ts`) are the **only** places that build a connection's
client, and both build from it, so media URLs follow too. Never build a client from
`serverUrl` directly. `useActiveAddress(cid)` gives `{ url, kind: 'home' | 'away' |
'paired' }` for UI, with `ADDRESS_KIND_LABEL` / `ADDRESS_IN_USE_LABEL` for the words.

**The web player never switches**: it is served same-origin by the server, so
`pickedUrl` always returns `serverUrl` there and the runner doesn't start.

### The runner (`src/api/address-runner.ts`)

`startAddressRouting()`, started once from the root layout (native only), re-picks each
connection's address:

- at launch, when the app returns to the foreground (reading the network first, since
  the device may have moved while suspended), when the network changes
  (`expo-network`), when a connection's URL or addresses change, and at once when the
  reachability tracker marks a connection offline (its probe loop then runs through the
  client built on the new address);
- `leaveHome()`: when the device leaves its network (`movedNetwork`: another network
  type, or no connection), every connection using its home address drops to its away
  address (else `serverUrl`) first, and the re-pick that follows checks home again;
- a per-connection generation counter discards a probe that a newer re-pick, or a change
  to the connection, overtook.

It also refreshes what the device keeps: `refreshAddresses(cid)` reads `GET /addresses`
from a server with the flag (`addressesQuery`, `skipToken` without it) at launch, for a
new connection and on reconnect, and stores the merge.

**The playing book.** A streamed book's track URLs are baked in when it loads
(`book-queue.ts`). When its connection's address changes, `followPlayingBook` restarts it
in place, at its position and speed, through the existing `startBookInPlace`, with no
change to the playback internals. Only a streamed book that is playing or trying to
(`playing`, `loading`) and placed is restarted, once per load and address; a paused book
moves at the listener's next press on play, and a downloaded book plays from the device
either way.

### In the UI

`AddressesCard` (`src/components/layout/addresses-card.tsx`) is the one "At home and
away" card: Connect's sign-in step and ready screen show it when the server has both
addresses; the Account page shows whichever it knows (`connection.addresses` merged with
`useServerAddresses`, which on the web is the only refresh) and, on native, which one is
in use (`inUse`, from `useActiveAddress`).
