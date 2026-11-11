---
title: "Managed modules"
description: "The server's managed modules framework: optional features that ship off and that an admin turns on in the console without a restart. What a module is, its toggle and capability flag, how its routes are gated (kids and demo accounts refused on user routes), the Bridge jobs a module owns, its background work, GET /admin/modules, the console's Settings > Modules, the player's module registry, and the steps for adding a module."
---

A **managed module** is an optional feature that ships **off**. An admin turns it
on in the console's **Settings > Modules**, and it starts at once, with no
restart. Nothing turns a module on by itself; pairing a Bridge doesn't. A module
may need a [Bridge](../bridge/index.md) feature to be usable. Its capability
flag then stays `false` until an online Bridge offers that feature.

The server has three modules:

| Module | Bridge feature | What it brings |
|---|---|---|
| `contributions` | `contribute` | Actions that are Bridge jobs rather than routes of its own (see [Jobs a module owns](#jobs-a-module-owns)). It has no routes and no background work. |
| `podcasts` | `podcast` | User actions and a scheduler; episode fetch and retention jobs and admin storage actions; on-demand fetches, fetch status and Retry, and queue prefetch. See [Podcasts](../bridge/podcasts.md). |
| `audible` | `audible` | Admin routes behind the toggle, a scheduler, and three job kinds: `audible.poll`, `audible.import` (backups) and `audible.sync` (listening places), plus the policy pass after each poll. See [Audible](../bridge/audible.md). |

`transcode`, `metadata` and `bridge` are not modules. Their keys, variables and
flags shipped before the framework, and none is only a toggle:

- `transcode` follows ffmpeg;
- `metadata` needs its service built at start as well as its switch;
- `bridge` follows the heartbeat.

## What a module is (`internal/modules`)

A module is a `modules.Module` value:

| Field | Meaning |
|---|---|
| `ID` | names the module everywhere: its capability flag on `GET /server` (`capabilities.<id>`), its config key `modules.<id>.enabled`, its console setting id `modules.<id>`, its variable `AUDIOSILO_MODULES_<ID>_ENABLED`, its routes' `module_off` gate and the console's copy (`settings.module.<id>.name`, `.blurb`, `.needs`) |
| `RequiresBridge` | a Bridge feature (one of `bridge.features` on `GET /server`) the module needs, `""` for none |
| `Routes(Registrar)` | registers the module's HTTP routes; `nil` for none. Called once, when the API builds its handler |
| `Start(ctx, Deps)` | the module's background work while it is on, returning when `ctx` is cancelled; `nil` for none. `Deps` carries a logger tagged with the module's id, the catalog and the Bridge service |

Beside it, `Module.BridgeState(online, features)` says where the module stands with
the feature it needs: `BridgeOffline`, `BridgeNoFeature`, `BridgeReady`, or `""` for
a module that needs none. `modules.Active(on, state)` is its capability flag.
`GET /server` and `GET /admin/modules` both work the flag out through them.

The registry is `Modules()` in `internal/modules/builtin`, in the order the console
lists them. It is a sub-package so a module's own package (`internal/modules/<id>`)
can import `modules` without a cycle. The launcher hands it to `API.SetModules`,
which refuses to start the server on a `modules.Validate` error. An id must:

- match `^[a-z][a-z0-9_]{0,31}$`;
- appear once;
- not be a core capability's name (`coreCapabilities`);
- have its config row (`config.HasModule`).

## The toggle and the capability flag

The toggle is an ordinary setting, applied at once (see
[Changing settings at runtime](configuration.md#changing-settings-at-runtime)):

- config key `modules.<id>.enabled`, `false` by default;
- setting `modules.<id>` in the settings envelope's `modules` section;
- variable `AUDIOSILO_MODULES_<ID>_ENABLED`.

A save is audited as `settings.update`. Like any other setting, a variable locks
it (`409 setting_locked`).

The **capability flag** (`modules.Active`, through the API's `moduleActive`) is
the toggle **and** the Bridge requirement met. For a module with a
`RequiresBridge`, the requirement is a Bridge whose last heartbeat is under two
minutes old and whose `features` hold it. The flag is `false`, never absent,
while the module is off. It follows the Bridge's heartbeat, so it can change from
one request to the next; the server reuses a heartbeat for up to 5 seconds.
`GET /server` reads the Bridge once per request and uses it for the `bridge`
flag, the `bridge` block and every module's flag.

The `contributions` module needs `contribute`, the Bridge's first feature that is
not a job family. See
[The heartbeat and the capability](../bridge/pairing-and-jobs.md#the-heartbeat-and-the-capability).

## Routes: always mounted, gated on the toggle

A module mounts its routes through the `Registrar` it is given:

- `Admin(pattern, h)` puts `h` behind `requireAdmin`.
- `User(pattern, h)` puts `h` behind `requireAuth`, then `notKid`
  (**`403 kid_account`**) and `notDemo` (**`403 demo_account`**). A module's
  actions, contributing to the community first of all, are a grown-up's own. The
  token's lookup loads `is_demo` and the kid flag, so neither check reads the
  account again.

Inside those checks, `requireModule` answers **`404 module_off`** while the
toggle is off. The auth checks run first, so a caller they refuse gets its `401`
or `403`, never `module_off`. A pattern must be `"METHOD /api/v1/..."`, so the
global middleware and the auth wrappers apply. Anything else panics when the
server starts (`checkModulePattern`).

The routes are mounted whether the module is on or off, so turning one on needs no
restart. They gate on the **toggle only**, so a route stays put while the flag follows
the heartbeat. An action that needs the Bridge refuses on its own, with its own
`409`, as the Bridge's job routes do.

Every api test's `newTestEnv` mounts the builtin modules through the real
`Handler()`, so a bad or clashing route pattern fails the tests, not a start.

### Podcast routes

The podcast actions are mounted in `internal/api` with the same user wrapper, so
`builtin` need not import `api`. The module's `Routes` remains nil. The routes
fall into these groups:

- **Follow, unfollow and check** are the only routes behind this user gate.
- **Admin retention `PUT` and `DELETE`, and new episode fetches,** use admin and
  not-demo auth, the same toggle, the exact Bridge kind and a writable mapping.
  A valid present pin returns `200` before those storage checks.
- **Retention `GET`** is core and uses the admin catalog.
- **Authenticated podcast reads**, kids included, are core, with the client gate
  and private-show scope still applied. This covers `GET` fetch status and ready
  media. Missing media can request a fetch automatically.
- **The listener's `POST` Retry** requires read scope and not-demo auth, and
  allows kids too.

The read and Retry routes do not use the adult-only module wrapper.
`EnsurePodcastFetch` checks the module, the exact online Bridge kind and a
writable mapping before it creates a new intent. An existing intent can be
returned or promoted, and a valid ready file reused. Demo streams cannot create
new intents. The core `podcast_fetch:true` capability advertises protocol
support independently of the live module flag.

The directory search (`/podcasts/discovery/*`) and OPML import use the same
adult user wrapper plus the client gate. The OPML export is core
(`requireAuth` + `notDemo`), so it works with the module off. Search needs no
Bridge, so the core `podcast_discovery` flag advertises it, not the module flag
(see [Capability flags](api/index.md#capability-flags---gate-your-features)).
Turning the module off (`syncModules`) or shutting down calls the discovery
service's `Reset`. That cancels fetches in flight and empties every result,
artwork and image cache, so turning the module back on starts empty. See
[Podcast discovery](api/reference.md#podcast-discovery).

### Audible routes

The `audible` module mounts its console routes with the admin wrapper
(`moduleRoutes.Admin`), as the podcasts' admin storage routes are:

- `GET /admin/audible/accounts`
- `GET /admin/audible/titles`
- `POST /admin/audible/accounts/{account}/poll`

Its Bridge routes are not gated, because the Bridge's page signs in either way.
The exceptions are the two position sync routes, which act for a person and
answer `403 sync_off` while the module is off.

`DELETE /admin/audible/accounts/{account}` is deliberately mounted outside the
toggle (`requireAdmin` only). It removes an account the Bridge can no longer
remove, which the scheduler would otherwise poll for good, so it must work after
the module is turned off.

## Jobs a module owns

A module's action can be a Bridge job instead of a route. `bridge.kindSpec.module`
names the module a kind needs, and `bridge.ModuleFor(kind, params)` answers it.
Such a job gets the same toggle gate (`404 module_off` through `writeModuleOff`),
and a queued one is held while the toggle is off. See
[Jobs of a managed module](../bridge/pairing-and-jobs.md#jobs-of-a-managed-module).

## Background work

A `modules.Runner` (`internal/modules/runner.go`) runs each module's `Start` while
the module is on.

- The launcher calls the API's `StartModules(ctx)` once, beside the chapter
  checks. `Runner.Start` starts each module that is on.
- The launcher defers `StopModules()` (`Runner.Stop`), which cancels every run
  and waits for each to return, so a module is done before the database closes.

In between, `handleUpdateSettings` calls `syncModules` (`Runner.Sync`) right
after the live config swap of every save, under the settings mutex:

- a module turned on starts `Start` in its own goroutine, its `Deps.Log` tagged with
  its id; a panic ends that run only, never the server;
- a module turned off has its context cancelled, and the save doesn't wait for it to
  return;
- a module that is on but whose run has ended by itself (returned or panicked) starts
  again at the next save;
- a module turned back on while its last run is still stopping starts once that run
  has returned, so two runs of one module never overlap.

Nothing starts before `StartModules` or after `StopModules`.

### The podcasts scheduler

The `podcasts` module's `Start` runs `podcast.RunScheduler`. It folds the
outcomes of ended subscribe, poll, fetch and retain jobs, and queues due polls,
policy-selected downloads and retention checks. It wakes at start, on a committed
job completion, on a follow or policy change, and every 60 seconds, within the
per-pass limits described in
[Podcasts](../bridge/podcasts.md#polling-and-outcomes).

Turning the module off stops that work and holds queued podcast jobs:

- Jobs already claimed may finish.
- Committed playback and the core read and Bridge aggregate routes stay
  available.
- Fetch status reports unavailable while the module is off, even for claimed or
  running work that may finish. A ready status wins.
- The one-ahead prefetch hook uses the same intent checks and starts no new
  work while the module is off.

See [On-demand play](../bridge/podcasts.md#on-demand-play-and-shared-intents).

### The Audible scheduler

The `audible` module's `Start` runs `audible.RunScheduler`. It makes a pass at
once, then every minute:

- It queues up to 20 due accounts' `audible.poll` at priority `-10` while an
  online Bridge offers the kind (see
  [Audible](../bridge/audible.md#the-poll-audiblepoll)). An account with a
  released preorder it waits for is polled every hour.
- It queues one `audible.sync` every 15 minutes for each account whose sync is
  on, while the Bridge offers that kind (see
  [Position sync](../bridge/audible.md#audible-to-the-server-audiblesync)).

Turning the module off stops the scheduler, holds the queued polls, backups and
syncs, and skips the policy pass after a poll.

## `GET /api/v1/admin/modules`

*Admin.* Every module in registry order, with its toggle, its flag and where it
stands with the Bridge. The shape is in the
[`GET /admin/modules` reference](api/reference.md#get-apiv1adminmodules).

## The console: Settings > Modules

`admin-ui`'s `features/settings/modules-topic.tsx` shows one card per module, over
`GET /admin/modules`. The server sends ids only. The name, blurb and `needs` line come
from the locale files (`settings.module.<id>.*`). The card's parts are described with
the rest of the console in [The web UI](web-ui.md).

A settings page a module brings is a `SETTINGS_PAGES` entry like any other (with its
icon in `PAGE_ICONS` and its case in the page's `Topic`), mapped to the module's id in
`settings-model.ts`'s `MODULE_PAGES`. `MODULE_PAGES` adds no page. `visiblePages`
filters `SETTINGS_PAGES` through it and lists a module's page only while the
module's toggle is on. A `?topic=` for a hidden page opens General.

## The player: `src/modules/`

The player keeps its own registry, `PLAYER_MODULES` in `src/modules/registry.ts`,
each entry's `id` being the module's capability flag. It is still **empty**,
because the player never contributes. The slots are open and tested with fake
modules, so the player renders exactly as before. See [Player modules](../frontend/state-and-data.md#player-modules-srcmodules).

## Adding a module

1. Its config row in `internal/config/settings.go`'s `fields` (key
   `modules.<id>.enabled`, variable `AUDIOSILO_MODULES_<ID>_ENABLED`, setting
   `modules.<id>`), a field on `ModulesConfig`, and the key in
   `config.example.yaml`. Its own settings, if any, are setting `<id>.<name>`, key
   `modules.<id>.<name>`.
2. Its entry in `internal/modules/builtin`, with `RequiresBridge` if it needs the
   Bridge, and its own package `internal/modules/<id>` for `Routes` and `Start`.
3. Its console copy (`settings.module.<id>.name`, `.blurb`, `.needs`) in every
   locale; if it brings a settings page, that page in `SETTINGS_PAGES` and mapped to
   the module in `MODULE_PAGES`.
4. If listeners see it, the flag on the player's `Capabilities` type and in its
   `ModuleFlag`, and its entry in `PLAYER_MODULES`.
5. Docs: its flag in the [capability flags](api/index.md#capability-flags---gate-your-features)
   table and the [`GET /server`](api/reference.md#get-apiv1server) module table, its
   routes in the [reference](api/reference.md), its key in
   [Configuration](configuration.md#managed-modules-modules) (the key, environment
   variable and runtime settings tables), its card in the User Guide's
   [Modules](/users/admin/server#modules), and the `admin/settings-modules.png`
   screenshot.
