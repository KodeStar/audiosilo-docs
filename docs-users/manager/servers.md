---
title: "Managing servers"
description: "Add an existing AudioSilo server to the manager, create one on this computer, deploy one over SSH or to a VPS, and keep it updated."
---

## Adding a server you already run

Click **+ Add** in the sidebar (or **Add a server** on the welcome screen).

![The Add a server form: server URL, auth code, display name, and device name](/img/screenshots/manager/add-server.png)

You'll be asked for:

- **Server URL** - the address you use to reach the server, e.g.
  `https://my-server:8080`.
- **Auth code** - an auth code minted on the server. For full management you want
  a code for an **admin** account: in the server's
  [admin console](../admin/console-tour.md), use **Copy invite** on your admin user
  ([Users and invites](../admin/users-and-invites.md)).
- **Display name** *(optional)* - what to call this server in the sidebar; left
  blank, the server's own name is used.
- **Device name** - how this session appears in the server's session list
  (defaults to "AudioSilo Manager").
- **Allow self-signed certificate (LAN)** - tick this if your server uses the
  default self-signed HTTPS certificate.

Clicking **Connect** redeems the code for a session and stores the token in your
operating system's keychain. The manager then reads the server's version and
capabilities and, if the code was for an admin account, lists its libraries.

:::note Connected but no libraries?
A non-admin code still connects, but listing and managing libraries needs admin
access. Use **Enter admin auth code** in the Libraries section (or **⋯ → Admin
access**) and paste an admin code - see
[Granting admin access](#granting-admin-access) below.
:::

## The server detail view

Selecting a server in the sidebar shows its detail view.

![A server's detail view: online status with capability tags, an update banner, and the library list](/img/screenshots/manager/server-detail.png)

- **Status line** - checked automatically when you select the server (and on the
  ↻ button): **Online** with the running version and capability tags (such as
  `web_player` and `transcode`), or **Offline** with the reason.
- **Update banner** - when a newer server release exists, a banner shows the
  running and latest versions. If the manager knows how the server is deployed
  (see [Deployment settings](#deployment-settings-and-in-place-updates)), an
  **Update now** button updates it in place; otherwise the banner tells you what
  to configure first. An up-to-date, manageable server instead offers **Re-pull &
  restart stack**. If the manager can't reach GitHub to look up the latest release
  (for example when it has been rate-limited, or you're offline), it says so and
  offers a **Retry** in place of the version comparison - the **Re-pull & restart
  stack** button still works.
- **Local server panel** - for a server created on this computer: running/stopped
  state, the folder it serves, **Start**/**Stop**, and **Open setup page** while
  first-run setup is pending.
- **Libraries** - every library on the server, each with a **Manage** menu:
  - **Browse…** - a read-only view of what's in the library.
  - **Host path…** - where on the destination machine the manager should write
    this library's files (required before importing - see
    [Organizing and importing books](organizing.md#setting-a-librarys-host-path)).
  - **Import…** - import books into this library (disabled until the host path is
    set).
  - **Audible** - the per-library [Audible backup](audible-backup.md), including
    the Series & Gaps tools.
- **⋯ menu** (top right) - **Admin access**, **Settings** (name, address,
  self-signed certificate), **Transfer settings**
  ([how files are written](organizing.md#transfer-settings)), **Deployment**, and
  **Remove**.

### Granting admin access

**⋯ → Admin access** lets you paste an admin auth code for a server that's already
in your list. You'll need this after deploying a fresh server (finish its setup
wizard in the browser first, then mint a code from its admin console), or if the
manager's saved session was revoked. The new session token replaces the old one
and the library list is refreshed.

### Removing a server

**⋯ → Remove** forgets the server and its saved token *in the manager only*.
Nothing on the server - accounts, libraries, files - is touched.

## Creating a server

Click **Create** in the sidebar (or **Create a server** on the welcome screen) and
pick where it should run:

- **This computer** - run a server inside the manager, optionally shared via a
  free Cloudflare Tunnel.
- **Linux server (SSH)** - install it with Docker on a machine you already run.
- **Unraid (SSH)** - the same, with Unraid's path conventions pre-filled.
- **VPS - Hetzner** - provision a new always-on cloud server.

### On this computer

![Creating a local server: name, audiobooks folder, and the Cloudflare Tunnel option](/img/screenshots/manager/local-server.png)

Give it a name, choose (or type) your **audiobooks folder**, and decide whether to
tick **Make it reachable from anywhere (Cloudflare Tunnel)** - a free tunnel that
gives the server a public HTTPS address without touching your router. Click
**Create server**.

The manager starts a full AudioSilo server on your computer, serving that folder,
and shows an **Open setup page** button: finish first-run setup in your browser
(choose an admin password). Then mint an admin invite code in the server's admin
console and paste it via **⋯ → Admin access** so the manager can manage the
libraries.

Worth knowing:

- The server runs **inside the manager app** - quitting the manager stops it. Use
  the **Local server** panel on the server's detail page to start and stop it.
- The server's data (settings, database, certificates) lives under the manager's
  data folder (`local-servers/<id>` inside it); your audiobooks stay in the folder
  you chose.
- The tunnel uses Cloudflare's free "quick tunnel", so the public address is
  assigned fresh **each time the server starts** - fine for trying things out;
  for a permanent address, consider a proper deployment
  ([Remote access](../getting-started/remote-access.md)).
- The tunnel needs the `cloudflared` helper program. The manager finds an
  installed copy or downloads one automatically on Linux and Windows; on macOS,
  install it once with `brew install cloudflared`.

### On a Linux machine or Unraid, over SSH

This installs AudioSilo with Docker on a machine you already run - a NAS, a home
server, an Unraid box. The machine needs SSH access and Docker.

1. **Connect**: enter the host, port, and user, and pick how to authenticate -
   your SSH agent, a key file (with optional passphrase), or a password. Click
   **Test connection**: the manager shows the machine's SSH host-key fingerprint,
   and you confirm it with **Trust & continue** (the fingerprint is remembered and
   verified on every later connection).
2. **Configure**: server name, a **data folder** (server settings and database),
   a **library folder** (your audiobooks - browsable remotely), the port (default
   8080), whether to use plain HTTP instead of the default self-signed HTTPS, and
   optionally a Cloudflare Tunnel.
3. **Deploy**: the manager starts the server in Docker - with Docker Compose if
   it's available on the machine, otherwise a plain container - with your library
   folder mounted into it. A log streams as it works.

When it finishes, **Open setup page** takes you to the server's first-run wizard:
choose an admin password, and set the books folder to `/library` (that's where
your library folder appears inside the container). The manager pre-configures
itself to write content to your library folder over SFTP, so imports work as soon
as you grant it admin access.

:::tip Unraid specifics
The form pre-fills Unraid conventions: keep the **data folder** on a cache/pool
path (e.g. `/mnt/cache/appdata/audiosilo`) so the database isn't on the slower
user-share layer; the **library** can be any `/mnt/user` share. Files are written
as `nobody:users`. Docker Compose is used if the Compose Manager plugin is
installed, otherwise a plain container.
:::

### On a VPS (Hetzner)

Provisions a brand-new cloud server and runs AudioSilo on it. You'll need a
**Hetzner Cloud API token** - it is used once for the deployment and **not
stored** - and this incurs Hetzner's normal hosting cost. Pick a region (default
`nbg1`) and size (default `cx22`), name the server, and give the name of an **SSH
key already in your Hetzner account** - that key is how the manager will upload
content later.

After deployment, open the setup page (expect a browser warning - the server uses
a self-signed certificate) and finish first-run setup. Content transfer over SSH
(SFTP) is pre-configured; adjust it under **⋯ → Transfer settings** if needed.

## Editing a server's settings

**⋯ → Settings** edits the basics of a server already in your list: display name,
address, and whether to accept a self-signed certificate. The saved session is
kept - if you point the entry at a *different* server, pair again via **Admin
access**.

## Deployment settings and in-place updates

**⋯ → Deployment** records how a server's Docker setup lives on its host machine:
Linux or Unraid, Docker Compose or `docker run`, the data and library folders, the
port, TLS mode, container name, and image. For servers the manager deployed, these
are filled in already; for a server you set up yourself, you can enter them.

With deployment details **plus** a working SSH connection (**⋯ → Transfer
settings**, with the host key trusted), the update banner's **Update now** button
can update the server in place: the manager pulls the latest server image over SSH
and recreates the container, keeping your data and library exactly where they
were.
