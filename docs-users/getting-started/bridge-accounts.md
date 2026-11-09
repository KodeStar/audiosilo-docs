---
title: Sign the Bridge in to your accounts
description: "Sign the Bridge in to GitHub, an AI account and Audible on the Accounts tab of its own page."
---

The **Accounts** tab on the [Bridge's page](running-a-bridge.md#3-open-the-bridges-page)
holds the outside accounts the Bridge uses:

- **GitHub** (optional), to share characters, recaps and corrections with the
  community.
- **The agent's credential**, which the AI agent needs to write characters and
  recaps.
- **Audible** (optional), to back up the books you bought.

You sign in only on the Bridge's own page. The console's **Server > Settings >
Bridge** shows these accounts read-only. A credential you enter is never shown
again: the page only says whether one is set.

## GitHub

The Bridge files what it shares as **issues** on the community metadata
repositories, under **your** GitHub account, through a GitHub app called
**AudioSilo Contributions**. A free GitHub account is fine.

![The Bridge's Accounts tab: the GitHub card and the Agent card](/img/screenshots/bridge/accounts.png)

1. On the Accounts tab, press **Sign in to GitHub**. The card shows a short code
   and an address on github.com.
2. Open the address on any device and sign in to GitHub.
3. Enter the code and authorize **AudioSilo Contributions**.
4. Back on the Bridge's page, the card says **Signed in**, with your GitHub user
   name, within a few seconds.

Then turn on the [Contributions module](../admin/server.md#modules) in the
console. What is shared, and how it is reviewed, is in
[Contributing from your server](../community/contributing-from-your-server.md).

The app can open issues on the community repositories and use your gists (for a
file too long for an issue). It can't change code or read your private
repositories. Your password never reaches the Bridge.

If the card says **Sign in again**, GitHub stopped accepting the sign-in: sign in
again. If GitHub just can't be reached for a while, the Bridge can't share until it
can, and recovers by itself.

**Sign out** revokes the sign-in on GitHub. You can also revoke **AudioSilo
Contributions** yourself on GitHub, under **Settings > Applications > Authorized
GitHub Apps**.

## The agent's credential

The **Agent** card shows which tool the agent runs (`claude` or `codex`), whether
it is **Ready**, and a field for each kind of credential:

| Tool | Fields |
|---|---|
| `claude` (the default) | **Claude subscription token** (from `claude setup-token`), **Anthropic API key** (billed per use) |
| `codex` | **OpenAI API key** (billed per use) |

Paste the credential and press **Save**. With both Claude fields set, the
subscription token is used. A ChatGPT subscription is signed in in the agent
container instead (see [Add a Bridge](running-a-bridge.md#7-the-agents-credential)).

The Bridge keeps the credential encrypted and hands it to the agent only for each
run. Replacing a refused credential lets paused jobs carry on. The agent container
must be the same version as the Bridge to take a credential this way.

## Audible

The **Audible** card signs the Bridge in to one or more Audible accounts. The
Bridge then lists each account's books, finds the ones already on your server and
backs up the ones you choose. You manage them in the console: see
[Back up your Audible books](../admin/audible.md).

Each account belongs to **one person** on your server and goes with **one books
library**. The sign-in stays on the Bridge: the server never sees it. Pair the
Bridge first.

![The Bridge's Accounts tab: the Audible card with one account signed in](/img/screenshots/bridge/accounts-audible.png)

### Signing in

Amazon doesn't let other programs show its sign-in page, so you sign in in your
browser and paste back the address it ends on:

1. Press **Sign in to Audible** (or **Add another Audible account**).
2. Pick the **Audible store** the account buys from and press **Open Amazon
   sign-in**. Amazon's page opens in a new tab.
3. Sign in to Amazon as usual.
4. Amazon then shows a page that says it can't be found. **That is expected.**
   Copy that page's whole address from the address bar.
5. Back on the Bridge's page, paste it into **The address Amazon showed**. Do this
   within 15 minutes.
6. Choose who and where the account is for (below), then press **Finish the
   sign-in**.

![The Audible sign-in on the Accounts tab](/img/screenshots/bridge/audible-sign-in.png)

The Bridge appears in your Amazon account's device list as **"&lt;your first
name&gt;'s AudioSilo"**. Your Amazon password never reaches the Bridge. Signing in
to the same account again replaces its sign-in rather than adding a second one.

### Who and where each account is for

| Field | What it is |
|---|---|
| **Belongs to** | the person on your server whose books these are (an adult or admin) |
| **Library** | the books library its titles are matched against, and where backups go. The Bridge must be able to write to it |
| **Back up** | which **new** purchases the Bridge backs up by itself. You change this later in the console |
| **Name (optional)** | how the console names the account. Empty, it is the person and the store, such as "Chris (US)" |

**Change** on an account edits these. Syncing listening places is off for a new
account; you turn it on in the console. Changing who an account belongs to turns
it off again.

### The account's states

| Badge | Means |
|---|---|
| **Not checked yet** | signed in, not checked yet (or the Audible module is off) |
| **Signed in** | checked at least once; **Last checked** says when |
| **Sign in again** | Audible refused the sign-in or its downloads, for example after a password change or a Bridge update. Press **Sign in again**: the account's settings are kept |
| **Mapped on another server** | set up while the Bridge was paired with another server. Press **Change** and save |

### Removing an account

**Remove**, then **Remove the account**, removes it everywhere: from the Bridge,
from the server and from your Amazon device list. Books already in your library
stay. If the server or Amazon can't be reached, the card says what didn't happen.

:::note[Backing up your own books]
Backing up is for a **personal backup of books you bought**, with your own
account. Laws on removing DRM differ from country to country, and in some places it
is not allowed at all. Check your local law, and keep the copies for yourself.
:::

## Settings that take precedence

Two credentials set outside the page win over the ones set here:

- **`AUDIOSILO_BRIDGE_GITHUB_TOKEN`** in the Bridge's `environment`: a GitHub token
  of your own. While it is set, the Bridge shares with it, and the GitHub card says
  so. Remove it and restart the Bridge to use the sign-in instead.
- **A credential in the agent container**: `CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `CODEX_API_KEY` in its environment, the
  matching file in `/agent/secrets/`, or a Codex sign-in. The Agent card says when
  the container uses its own.
