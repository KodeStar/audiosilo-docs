---
title: "Managed modules"
description: "The server's managed modules framework (Bridge Phase 2a): optional features that ship off and that an admin turns on in the console without a restart. What a module is, its toggle and capability flag, how its routes are gated (kids and demo accounts refused on user routes), the Bridge jobs a module owns, its background work, GET /admin/modules, the console's Settings > Modules, the player's module registry, and the steps for adding a module."
---

A **managed module** is an optional feature that ships **off**. An admin turns it
on in the console's **Settings > Modules**, and it starts at once, with no restart;
nothing turns one on by itself (pairing a Bridge doesn't). A module may need a
[Bridge](../bridge/index.md) feature to be usable, and then its capability flag
stays `false` until an online Bridge offers that feature.

The framework landed in Bridge Phase 2a with one module, `contributions`, as an
inert shell so the console had a real card. Phase 2b gave it its actions, which are
Bridge jobs rather than routes of its own (see
[Jobs a module owns](#jobs-a-module-owns)); it still has no routes and no
background work. Phase 2c-1 adds `podcasts`, requiring the `podcast` Bridge
feature, user actions and a scheduler. Phase 2c-2a extends it with episode
fetch/retention jobs and admin storage actions (see [Podcasts](../bridge/podcasts.md)).
`transcode`, `metadata` and `bridge`
are not modules: their keys, variables and flags shipped before the framework, and
none is just a toggle (`transcode` follows ffmpeg, `metadata` needs its service built
at start as well as its switch, `bridge` follows the heartbeat).

## What a module is (`internal/modules`)

A module is a `modules.Module` value:

| Field | Meaning |
|---|---|
| `ID` | names the module everywhere: its capability flag on `GET /server` (`capabilities.<id>`), its config key `modules.<id>.enabled`, its console setting id `modules.<id>`, its variable `AUDIOSILO_MODULES_<ID>_ENABLED`, its routes' `module_off` gate and the console's copy (`settings.module.<id>.name`, `.blurb`, `.needs`) |
| `RequiresBridge` | a Bridge feature (one of `bridge.features` on `GET /server`) the module needs, `""` for none |
| `Routes(Registrar)` | registers the module's HTTP routes; `nil` for none. Called once, when the API builds its handler |
| `Start(ctx, Deps)` | the module's background work while it is on, returning when `ctx` is cancelled; `nil` for none. `Deps` carries a logger tagged with the module's id, the catalog and the Bridge service |

Beside it, `Module.BridgeState(online, features)` says where the module stands with
the feature it needs (`BridgeOffline`, `BridgeNoFeature`, `BridgeReady`, or `""` for
a module that needs none), and `modules.Active(on, state)` is its capability flag;
`GET /server` and `GET /admin/modules` both work it out through them.

The registry is `Modules()` in `internal/modules/builtin`, in the order the console
lists them. It is a sub-package so a module's own package (`internal/modules/<id>`)
can import `modules` without a cycle. The launcher hands it to `API.SetModules`, which refuses to start
the server on a `modules.Validate` error: an id must match `^[a-z][a-z0-9_]{0,31}$`,
appear once, not be a core capability's name (`coreCapabilities`), and have its
config row (`config.HasModule`).

## The toggle and the capability flag

The toggle is an ordinary setting (see
[Changing settings at runtime](configuration.md#changing-settings-at-runtime)):
config key `modules.<id>.enabled` (`false` by default), setting `modules.<id>` in the
settings envelope's `modules` section, variable `AUDIOSILO_MODULES_<ID>_ENABLED`,
applied at once. A save is audited as `settings.update`, and a variable locks it
(`409 setting_locked`) like any other setting.

The **capability flag** (`modules.Active`, through the API's `moduleActive`) is the
toggle **and** the Bridge requirement met: for a module with a `RequiresBridge`, a Bridge whose last heartbeat is under two
minutes old and whose `features` hold it. It is `false`, never absent, while the
module is off, and it follows the Bridge's heartbeat, so it can change from one
request to the next (the server reuses a heartbeat for up to 5 seconds). `GET
/server` reads the Bridge once per request and uses it for the `bridge` flag, the
`bridge` block and every module's flag.

The `contributions` module needs `contribute`, the Bridge's first feature that is not
a job family: see
[The heartbeat and the capability](../bridge/pairing-and-jobs.md#the-heartbeat-and-the-capability).

## Routes: always mounted, gated on the toggle

A module mounts its routes through the `Registrar` it is given: `Admin(pattern, h)`
puts `h` behind `requireAdmin`; `User(pattern, h)` behind `requireAuth`, then (Phase
2b) `notKid` (**`403 kid_account`**) and `notDemo` (**`403 demo_account`**), since a
module's actions (contributing to the community, first of all) are a grown-up's
own: the token's lookup loads `is_demo` and the kid flag, so neither reads the
account again. Inside those checks `requireModule` answers **`404 module_off`**
while the toggle is off. The auth checks run first, so a caller they refuse gets
its `401` or `403`, never `module_off`. A
pattern must be `"METHOD /api/v1/..."`, so the global middleware and the auth
wrappers apply; anything else panics when the server starts (`checkModulePattern`).

The routes are mounted whether the module is on or off, so turning one on needs no
restart. They gate on the **toggle only**, so a route stays put while the flag follows
the heartbeat. An action that needs the Bridge refuses on its own, with its own
`409`, as the Bridge's job routes do.

Every api test's `newTestEnv` mounts the builtin modules through the real
`Handler()`, so a bad or clashing route pattern fails the tests, not a start.

The podcast actions are mounted in `internal/api` with the same user wrapper,
so `builtin` need not import `api`; the module's `Routes` remains nil. Only
follow/unfollow/check use this user gate. Admin retention PUT/DELETE and new
episode fetches use admin/not-demo auth and the same toggle plus the exact
Bridge kind and writable mapping; a valid present pin returns 200 before
those storage checks. Retention GET is also core and uses the admin catalog.
Authenticated podcast reads, including kids, are core with the client gate
and private-show scope still applied. The
`podcasts` module needs `podcast`; `contributions` needs `contribute`.

## Jobs a module owns

A module's action can be a Bridge job instead of a route: `bridge.kindSpec.module`
names the module a kind needs and `bridge.ModuleFor(kind, params)` answers it. Such
a job gets the same toggle gate (`404 module_off` through `writeModuleOff`), and a
queued one is held while the toggle is off: see
[Jobs of a managed module](../bridge/pairing-and-jobs.md#jobs-of-a-managed-module).

## Background work

A `modules.Runner` (`internal/modules/runner.go`) runs each module's `Start` while
the module is on. The launcher calls the API's `StartModules(ctx)` once, beside the
chapter checks (`Runner.Start`: each module that is on starts), and defers
`StopModules()` (`Runner.Stop`), which cancels every run and waits for each to return,
so a module is done before the database closes. In between, `handleUpdateSettings`
calls `syncModules` (`Runner.Sync`) right after the live config swap of every save,
under the settings mutex:

- a module turned on starts `Start` in its own goroutine, its `Deps.Log` tagged with
  its id; a panic ends that run only, never the server;
- a module turned off has its context cancelled, and the save doesn't wait for it to
  return;
- a module that is on but whose run has ended by itself (returned or panicked) starts
  again at the next save;
- a module turned back on while its last run is still stopping starts once that run
  has returned, so two runs of one module never overlap.

Nothing starts before `StartModules` or after `StopModules`.

The `podcasts` module's `Start` runs `podcast.RunScheduler`: it folds ended
subscribe/poll/fetch/retain outcomes and queues due polls, policy-selected
downloads and retention checks. It wakes at start, on committed job completion,
follow/policy changes and every 60 seconds. Per pass it admits at most ten
fetches (two per show, rotating for fairness) and ten retains (at most hourly
per show with followers and present files). Off stops that work and holds
queued podcast jobs. Already claimed jobs may finish; committed playback and
core read/Bridge aggregate routes stay available. No player on-demand/status
protocol is enabled in this release.

## `GET /api/v1/admin/modules`

*Admin.* Every module in registry order, with its toggle, its flag and where it
stands with the Bridge (shape in the
[reference](api/reference.md#get-apiv1adminmodules)).

## The console: Settings > Modules

`admin-ui`'s `features/settings/modules-topic.tsx` shows one card per module, over
`GET /admin/modules`. The server sends ids only: the name, blurb and `needs` line come
from the locale files (`settings.module.<id>.*`). The card's parts are described with
the rest of the console in [The web UI](web-ui.md).

A settings page a module brings is a `SETTINGS_PAGES` entry like any other (with its
icon in `PAGE_ICONS` and its case in the page's `Topic`), mapped to the module's id in
`settings-model.ts`'s `MODULE_PAGES`. `MODULE_PAGES` adds no page: `visiblePages`
filters `SETTINGS_PAGES` through it, listing a module's page only while the module's
toggle is on, and a `?topic=` for a hidden one opens General.

## The player: `src/modules/`

The player keeps its own registry, `PLAYER_MODULES` in `src/modules/registry.ts`,
each entry's `id` being the module's capability flag. It is still **empty** after
Phase 2b (the player never contributes): the slots are open and tested with fake
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
