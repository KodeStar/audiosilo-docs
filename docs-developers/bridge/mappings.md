---
title: Library mappings
description: "How the Bridge finds each server library on its own disk and proves it has the server's copy: the default mapping, the size comparison, the write probe, why a books library with no book is never mapped, the podcast marker, and how often it checks."
---

The server and the Bridge usually run in different containers, so a library at
`/audiosilo/books` on the server may be somewhere else for the Bridge, or not there
at all. Before the Bridge may write into a library it has to **prove** it sees the
server's copy of it. A mapping is **checked, never assumed**: a wrong mount must
never let a later job write into the wrong folder. The code is the Bridge's
`internal/mapping` and the heartbeat loop in `internal/app`.

## Where the Bridge looks

For each library the server lists (in the answer to every heartbeat), the Bridge
looks at:

1. **Its configured mapping** for that library id, if there is one: the
   `libraries` setting (`AUDIOSILO_BRIDGE_LIBRARIES="<id>=<path>;..."`, or the
   **Bridge folder** field on the Libraries tab of its page). The path must be
   absolute.
2. **Otherwise the server's own root path** for the library. A compose stack that
   mounts the libraries at the same path in both containers (read-only for the
   server, read-write for the Bridge) needs no mapping at all; this is the default
   the [compose example](configuration.md#running-it-beside-a-server) uses.

## The check

For each **books** library, one at a time:

1. **The folder.** The mount path must exist and be a folder.
2. **A known book.** The Bridge asks the server for the library's **sample book**
   (`GET /bridge/libraries/{id}/book` with no path) and gets its files with the
   sizes the server sees on its own disk right now. The server picks the first
   **whole** book (every file still on its disk) among the library's first five
   by title, so one book deleted before a scan notices doesn't make the whole
   library look unmapped; a single-file book is listed as its own one file.
3. **The sizes.** It stats each of those files through its mount (at most 50; every
   path goes through its `SafeJoin`, which refuses absolute paths, `..` and NUL) and
   compares the size with the server's. Only when **every** file is there with the
   server's size is the library **mapped**.
4. **Writing.** Only then does it probe whether it can write: it creates a file
   named `.audiosilo-bridge-probe-<random>` in the mount folder (exclusively, so it
   can never replace anything), writes a line and removes it. If that works the
   library is **writable**. The leading dot keeps a probe a crash leaves behind out
   of the server's scan, which never walks hidden names.

Why sizes and not just "the folder exists": a stale copy, a different share or an
empty mount point can sit at the right path. The research spike for the Bridge
found that only comparing a known book's file sizes with the server's catches a
stale copy of a library, so that is the test.

**A books library with no indexed book is never mapped.** With nothing to compare, a
wrong mount would look right, and a later write job would land in the wrong
folder. Such a library reports "the library has no indexed book to compare against
yet" until the server has indexed one.

## Podcast libraries: the marker

Podcast libraries have no sample book. `internal/mapping/podcast.go` instead
checks the shared root with `.audiosilo/library.json`:

```json
{"version":1,"library_id":3,"nonce":"a1b2c3d4e5f60718a1b2c3d4e5f60718"}
```

The Bridge creates a missing marker after probing writability, then calls
`GET /api/v1/bridge/libraries/{id}/marker` and requires the same nonce before
reporting `mapped`. It probes writing again for `writable`. A new marker is
removed on a failed check, so a wrong mount is not left claiming that library.
A marker of a removed library can be replaced; one naming another current
library is refused.

Both sides require version 1, a 32-character lowercase hex nonce, a regular file
no larger than 4 KiB and a non-symlink `.audiosilo` directory. The server also
checks the library id and answers only `{nonce}`; absent or invalid is
`404 no_marker`. `checked_path` is `.audiosilo/library.json`. The library can be
empty, but both mounts must see the marker. An older Bridge's sample-book lookup
on a podcast library returns `404 no_book`, so it cannot map it as books.

Marker lookup errors currently read as "this folder isn't the library the
server sees" on the Bridge, including a failed server request. The normal
mapping recheck interval applies. `bridge.verify` below remains a book check.

## What it reports

Each check becomes one entry of the heartbeat's `libraries`:

| Field | Meaning |
|---|---|
| `library_id` | the server's library |
| `mount_path` | where the Bridge looked |
| `mapped` | the sample book's file sizes matched, or the podcast marker matched |
| `writable` | the probe file could be written and removed there |
| `checked_path` | the sample book's path, or `.audiosilo/library.json` for podcasts |
| `error` | why it isn't mapped or writable, `""` when it is both |

The errors the Bridge writes:

| `error` | Means |
|---|---|
| `the folder <path> is not found here` (or `... is permission denied`) | nothing at the mount path, or the Bridge can't read it |
| `<path> is not a folder` | the mount path is a file |
| `the library has no indexed book to compare against yet` | the server has no book in it to compare |
| `could not ask the server for a book: ...` | the book lookup failed |
| `this folder doesn't hold the server's copy of the library (<file>: <reason>)` | a file is missing (`not found here`), unreadable (`permission denied`) or a different size (`size differs: N bytes here, M on the server`) |
| `mapped, but not writable here: permission denied` | the right library, but the Bridge can't write there |

The server stores the entries as reported and the console shows each library with
its state: **Ready** (mapped and writable), **Can't write** (mapped, read-only),
**Not found** (not mapped) or **Not reported yet**, with the server's path, the
Bridge's path, the book it checked and the error. Write jobs, like
`sidecars.generate`, are refused for a library that isn't both mapped and
writable (`409 library_not_writable` from the server; the Bridge checks again
before it writes).

## When it checks

Not on every heartbeat: a check stats files and writes a probe, and doing that
every 30 seconds would keep a NAS's spun-down disks awake (an Unraid array, say).
The Bridge checks:

- **after pairing**, and **when the server's list of libraries changes** (a library
  added, removed, renamed or moved);
- **when a check is due**: every `mapping.check_minutes` (default **10**, 1 to 1440);
- **when someone asks**: **Check now** on its page's Libraries tab checks every
  library, and changing one library's folder there re-checks that library only.

A check runs in the background, one library at a time, and checks never overlap: one
asked for while another runs is done right after it (with the newest server link),
so a mapping changed mid-check is never missed. When a check finishes, the Bridge
sends a heartbeat at once so the console sees the results. Every heartbeat in
between carries the last results.

## `bridge.verify` is the same check, on demand

The console's **Verify** queues [`bridge.verify`](pairing-and-jobs.md#the-proof-job-bridgeverify),
which runs the same comparison for one library's sample book (or a book an admin
names) as a job, and probes writing in **the book's own folder** rather than the
library's root. A folder inside a library can refuse writes where the root allows
them, so a job that writes into a book checks that book's folder.
