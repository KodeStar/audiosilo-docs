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

The registry is `modules/builtin.Modules()`, in the order the console lists them. It
is a sub-package so a module's own package (`modules/<id>`) can import `modules`
without a cycle. The launcher hands it to `API.SetModules`, which refuses to start
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

The **capability flag** (`moduleActive`) is the toggle **and** the Bridge requirement
met: for a module with a `RequiresBridge`, a Bridge whose last heartbeat is under two
minutes old and whose `features` hold it. It is `false`, never absent, while the
module is off, and it follows the Bridge's heartbeat, so it can change from one
request to the next (the server reuses a heartbeat for up to 5 seconds). `GET
/server` reads the Bridge once per request and uses it for the `bridge` flag, the
`bridge` block and every module's flag.

`contribute` is the first Bridge feature that is not a job family: the server adds it
to `features` while the last heartbeat's `estimates.sidecars.can_contribute` is true
(the Bridge holds a GitHub credential; `bridge.FeatureContribute`). No heartbeat
field was added for it, so an older server still accepts a newer Bridge's heartbeat.

## Routes: always mounted, gated on the toggle

A module mounts its routes through the `Registrar` it is given: `Admin(pattern, h)`
puts `h` behind `requireAdmin`, `User(pattern, h)` behind `requireAuth`, and both then
behind `requireModule`, which answers **`404 module_off`** while the toggle is off. A
pattern must be `"METHOD /api/v1/..."`, so the global middleware and the auth
wrappers apply; anything else panics when the server starts (`checkModulePattern`).

The routes are mounted whether the module is on or off, so turning one on needs no
restart. They gate on the **toggle only**: an action that needs the Bridge refuses
on its own (with its own `409`, as the Bridge's job routes do), so a route doesn't
come and go with the heartbeat's timing while the flag does.

## Background work

`StartModules(ctx)` runs at launch, beside the chapter checks, and starts each module
that is on. From then on, `handleUpdateSettings` calls `syncModules` right after the
live config swap, under the settings mutex:

- a module turned on starts `Start` in its own goroutine; a panic stops that module
  only, never the server;
- a module turned off has its context cancelled, and the save doesn't wait for it to
  return;
- a module turned back on while its last run is still stopping starts once that run
  has returned, so two runs of one module never overlap.

## `GET /api/v1/admin/modules`

*Admin.* Every module in registry order, with its toggle, its flag and where it
stands with the Bridge (shape in the
[reference](api/reference.md#get-apiv1adminmodules)). Whether a toggle is locked is
the settings envelope's `locked["modules.<id>"]`, not repeated here.

## The console: Settings > Modules

`admin-ui`'s `features/settings/modules-topic.tsx` shows one card per module: its
name and blurb from the locale files (`settings.module.<id>.*`, so the server sends
ids only), a **Learn more** link to the User Guide's
[Modules](/users/admin/server#modules) section, the **Enable** switch (an instant
settings save, disabled while locked), the Bridge state line (`settings.modules.bridge.<state>`,
or the module's own `needs` line for `no_feature`, with a link to Settings > Bridge
unless ready) and, while enabled but not active, the "hidden from listeners" note.
`useModules` polls `GET /admin/modules` every 15 seconds, like the Bridge's status,
and refetches after every settings save. The command palette lists the topic
(keywords include "plugins" and "contributions").

A settings page a module brings goes in `settings-model.ts`'s `MODULE_PAGES`;
`visiblePages` lists it only while the module's toggle is on, and a `?topic=` for a
hidden one opens General.

## The player: `src/modules/`

The player keeps its own registry, `PLAYER_MODULES` in `src/modules/registry.ts`
(not the repo-root `modules/`, which holds the native Expo modules). A
`PlayerModule` is `{id, homeRails?, youSections?, bookActions?}`, its `id` being the
capability flag. It is **empty** in Phase 2a, so the player renders exactly as
before: the slots are open and tested with fake modules. See
[Player modules](../frontend/state-and-data.md#player-modules-srcmodules).

## Adding a module

1. Its config row in `internal/config/settings.go`'s `fields` (key
   `modules.<id>.enabled`, variable `AUDIOSILO_MODULES_<ID>_ENABLED`, setting
   `modules.<id>`), a field on `ModulesConfig`, and the key in
   `config.example.yaml`. Its own settings, if any, are setting `<id>.<name>`, key
   `modules.<id>.<name>`.
2. Its entry in `modules/builtin`, with `RequiresBridge` if it needs the Bridge, and
   its own package `modules/<id>` for `Routes` and `Start`.
3. Its console copy (`settings.module.<id>.name`, `.blurb`, `.needs`) in every
   locale, and a `MODULE_PAGES` entry if it brings a settings page.
4. If listeners see it, its entry in the player's `PLAYER_MODULES`, and the flag on
   the player's `Capabilities` type.
5. Docs: its flag in the [capability flags](api/index.md#capability-flags---gate-your-features),
   its routes in the [reference](api/reference.md), its key in
   [Configuration](configuration.md#managed-modules-modules), and its card in the User
   Guide's [Modules](/users/admin/server#modules).
