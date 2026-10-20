---
title: Bridge accounts
description: "The Bridge page's Accounts tab: signing the Bridge in to GitHub (through the AudioSilo Contributions app, with a code you enter on GitHub) so it can share with the community, signing out and revoking it, the agent's credential the Bridge hands to the agent container, and the environment settings that take precedence over both."
---

## Bridge accounts

The **Accounts** tab on the [Bridge's page](running-a-bridge.md#3-open-the-bridges-page)
holds the two outside accounts the Bridge uses:

- **GitHub**, so the Bridge can share characters, recaps and corrections with the
  community metadata database. Optional: without it, everything the Bridge makes
  stays on your server.
- **The agent's credential**, which the AI agent needs to write characters and
  recaps.

You sign in here, on the Bridge's own page, and nowhere else: the server never
connects to the Bridge, so the console's **Server > Settings > Bridge** only
shows these accounts read-only, as the Bridge last reported them, with **Open
Accounts on the Bridge** to come here (see
[The setup card](../admin/bridge.md#the-setup-card)). Nothing you
enter on this tab is ever shown again: the page says only whether a credential
is set, and when (for the agent, when its credentials last changed).

### GitHub

The Bridge files what it shares as **issues** on the community metadata
repositories on GitHub, under **your** GitHub account, through a GitHub app called
**AudioSilo Contributions**, and GitHub marks each one as filed through that
app. You need a GitHub account; a free one is fine.

To sign in:

1. On the Accounts tab, press **Sign in to GitHub**. The card shows a short code
   and an address on github.com, and how many minutes the code works for.
2. Open the address (on any device), sign in to GitHub if you aren't already,
   enter the code and authorize **AudioSilo Contributions**.
3. Back on the Bridge's page, the card says **Signed in**, with your GitHub user
   name, on its own within a few seconds. **Cancel** stops a sign-in that is still
   waiting for its code (when you sign in again after GitHub stopped accepting the
   old sign-in, that button is **Sign out**, which also forgets the old one).

What the app may do: open issues on the community metadata repositories it is
installed on, and create secret gists (a characters or recaps file too long for
an issue is attached as one). It can't change code, read your private
repositories or act anywhere else.
Your password never reaches the Bridge: GitHub gives it a token, which the Bridge
keeps encrypted in its data folder and renews by itself.

The card's states:

| Badge | Means |
|---|---|
| **Signed in** | the sign-in works, as the user shown (the Bridge shares with it unless **Sharing uses** names another token) |
| **Waiting for the code** | a sign-in is waiting for you to enter the code on GitHub |
| **Sign in again** | GitHub stopped accepting the sign-in: you revoked it on GitHub, or it expired. Press **Sign in to GitHub** again |
| **Not signed in** | no sign-in yet |

**Sharing uses** says where the GitHub token for sharing comes from now: this
sign-in, the `AUDIOSILO_BRIDGE_GITHUB_TOKEN` environment variable (see below), the
`gh` command's own sign-in on the Bridge's computer (for a Bridge run outside a
container), or none.

**Signing out.** **Sign out** revokes the sign-in on GitHub and forgets it on the
Bridge. If GitHub can't be reached to revoke it, the Bridge forgets it anyway and
says so: then revoke **AudioSilo Contributions** yourself in your GitHub settings,
under **Applications > Authorized GitHub Apps** (while you are signed in, the
card's **Review access on GitHub** opens that page). That page is also where you
can revoke the Bridge's access at any time without the Bridge.

Once signed in, turn on the [Contributions module](../admin/server.md#modules) in
the console to share. What is shared, and how the community reviews it, is in
[Contributing from your server](../community/contributing-from-your-server.md).

### The agent's credential

The **Agent** card shows the tool the agent container runs (`claude` or `codex`),
whether the agent is **Ready**, and one field for each kind of credential that tool
takes:

| Tool | Fields |
|---|---|
| `claude` (the default) | **Claude subscription token** (from `claude setup-token` on any computer signed in to your Claude plan), **Anthropic API key** (billed per use) |
| `codex` | **OpenAI API key** (billed per use) |

Paste the credential and press **Save** (**Replace** once one is set, **Remove**
to delete it). It must be one line with no spaces. Each field says **Set**, with
how long ago that credential was saved, or **Not set**. With both Claude fields set,
the subscription token is used. A ChatGPT subscription for Codex is signed in in
the agent container instead (`agent-login codex`, see
[Running a Bridge](running-a-bridge.md#7-the-agents-credential)).

The Bridge keeps the credential encrypted and gives it to the agent container
**for each run only**: as a file the container reads and deletes before the AI
tool starts, so it is never left on disk there. Replacing a credential that the
provider refused lets the jobs that paused for it carry on.

The agent container must be the same version as the Bridge to take a credential
this way. An older one says so on the card ("the container is too old"): update
its image.

### Settings that take precedence

Two credentials set outside the page win over the ones set here, so a Bridge set
up from its compose file keeps working as before:

- **`AUDIOSILO_BRIDGE_GITHUB_TOKEN`** in the Bridge's `environment`: a GitHub token
  of your own (how earlier versions were set up: a fine-grained token that can open
  issues on the community metadata repositories, and create gists for characters
  or recaps too long for an issue). While it is set, the Bridge shares with it
  rather than the sign-in (unless GitHub refuses it: then the sign-in is used), and
  the GitHub card says so. It is read from the environment only: remove it and
  restart the Bridge to use the sign-in.
  (Earlier versions kept an encrypted copy of it; this one deletes that copy.)
- **A credential in the agent container**: `CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `CODEX_API_KEY` in its environment, the matching file in
  `/agent/secrets/`, or a Codex sign-in. While the container has one for the tool
  it runs, it uses its own, and the Agent card says so.
