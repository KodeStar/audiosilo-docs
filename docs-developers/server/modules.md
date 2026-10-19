---
title: "Managed modules"
description: "The server's managed modules framework (Bridge Phase 2a): optional features that ship off and that an admin turns on in the console without a restart. What a module is, its toggle and capability flag, how its routes are gated, its background work, GET /admin/modules, the console's Settings > Modules, the player's module registry, and the steps for adding a module."
---

A **managed module** is an optional feature that ships **off**. An admin turns it
on in the console's **Settings > Modules**, and it starts at once, with no restart;
nothing turns one on by itself (pairing a Bridge doesn't). A module may need a
[Bridge](../bridge/index.md) feature to be usable, and then its capability flag
stays `false` until an online Bridge offers that feature.

The framework landed in Bridge Phase 2a with one module, `contributions`, as an
inert shell (no routes, no background work) so the console has a real card and the
framework can be exercised; Phase 2b fills it. `transcode`, `metadata` and `bridge`
are not modules: their keys, variables and flags shipped before the framework, and
none is a plain runtime on/off.

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
puts `h` behind `requireAdmin`, `User(pattern, h)` behind `requireAuth`, and both then
behind `requireModule`, which answers **`404 module_off`** while the toggle is off. A
pattern must be `"METHOD /api/v1/..."`, so the global middleware and the auth
wrappers apply; anything else panics when the server starts (`checkModulePattern`).

The routes are mounted whether the module is on or off, so turning one on needs no
restart. They gate on the **toggle only**, so a route stays put while the flag follows
the heartbeat. An action that needs the Bridge refuses on its own, with its own
`409`, as the Bridge's job routes do.

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

## `GET /api/v1/admin/modules`

*Admin.* Every module in registry order, with its toggle, its flag and where it
stands with the Bridge (shape in the
[reference](api/reference.md#get-apiv1adminmodules)).

## The console: Settings > Modules

`admin-ui`'s `features/settings/modules-topic.tsx` shows one card per module, over
`GET /admin/modules`. The server sends ids only: the name, blurb and `needs` line come
from the locale files (`settings.module.<id>.*`). The card's parts are described with
the rest of the console in [The web UI](web-ui.md).

A settings page a module brings goes in `settings-model.ts`'s `MODULE_PAGES`;
`visiblePages` lists it only while the module's toggle is on, and a `?topic=` for a
hidden one opens General.

## The player: `src/modules/`

The player keeps its own registry, `PLAYER_MODULES` in `src/modules/registry.ts`,
each entry's `id` being the module's capability flag. It is **empty** in Phase 2a:
the slots are open and tested with fake modules, so the player renders exactly as
before. See [Player modules](../frontend/state-and-data.md#player-modules-srcmodules).

## Adding a module

1. Its config row in `internal/config/settings.go`'s `fields` (key
   `modules.<id>.enabled`, variable `AUDIOSILO_MODULES_<ID>_ENABLED`, setting
   `modules.<id>`), a field on `ModulesConfig`, and the key in
   `config.example.yaml`. Its own settings, if any, are setting `<id>.<name>`, key
   `modules.<id>.<name>`.
2. Its entry in `internal/modules/builtin`, with `RequiresBridge` if it needs the
   Bridge, and its own package `internal/modules/<id>` for `Routes` and `Start`.
3. Its console copy (`settings.module.<id>.name`, `.blurb`, `.needs`) in every
   locale, and a `MODULE_PAGES` entry if it brings a settings page.
4. If listeners see it, the flag on the player's `Capabilities` type and in its
   `ModuleFlag`, and its entry in `PLAYER_MODULES`.
5. Docs: its flag in the [capability flags](api/index.md#capability-flags---gate-your-features)
   table and the [`GET /server`](api/reference.md#get-apiv1server) module table, its
   routes in the [reference](api/reference.md), its key in
   [Configuration](configuration.md#managed-modules-modules) (the key, environment
   variable and runtime settings tables), its card in the User Guide's
   [Modules](/users/admin/server#modules), and the `admin/settings-modules.png`
   screenshot.
