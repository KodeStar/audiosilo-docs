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

You sign in on the Bridge's own page. The console's **Server > Settings >
Bridge** shows the account status and lets you manage Audible backups. After
you enter a credential, the Bridge only shows whether one is set.

## GitHub

The Bridge files what it shares as **issues** on the community database's
repositories, under **your** GitHub account, through a GitHub app called
**AudioSilo Contributions**. A free GitHub account is fine.

![The Bridge's Accounts tab with GitHub sign-in and the controls for a saved Endpoint API key](/img/screenshots/bridge/accounts.png)

Here the agent uses an endpoint. You can replace or remove its saved API key on this tab.

1. On the Accounts tab, press **Sign in to GitHub**. The card shows a short code
   and an address on github.com.
2. Open the address on any device and sign in to GitHub.
3. Enter the code and authorize **AudioSilo Contributions**.
4. Back on the Bridge's page, the card says **Signed in**, with your GitHub user
   name, within a few seconds.

Then turn on the [Contributions module](../admin/server.md#modules) in the
console. What is shared, and how it is reviewed, is in
[Contributing from your server](../community/contributing-from-your-server.md).

The app can open issues on the community database's repositories and use your gists (for a
file too long for an issue). It can't change code or read your private
repositories. Your password never reaches the Bridge.

If the card says **Sign in again**, GitHub stopped accepting the sign-in. Sign in
again. If GitHub can't be reached for a while, the Bridge can't share until it
can. It tries again every minute, and paused jobs carry on by themselves once
GitHub answers.

**Sign out** revokes the sign-in on GitHub. You can also revoke **AudioSilo
Contributions** yourself on GitHub, under **Settings > Applications > Authorized
GitHub Apps**.

## The agent's credential

The **Agent** card shows which tool the agent runs, whether it is **Ready**, and
a field for each kind of credential:

| Tool | Fields |
|---|---|
| `claude` (the default) | **Claude subscription token** (from `claude setup-token`), **Anthropic API key** (billed per use) |
| `codex` | **OpenAI API key** (billed per use) |
| `openai-compatible` | **Endpoint API key**, also under the address in **Settings > Agent**. A local server such as Ollama takes none. See [Use an OpenAI-compatible endpoint](running-a-bridge.md#use-an-openai-compatible-endpoint) |

Paste the credential and press **Save**. With both Claude fields set, the agent
uses the subscription token. For a ChatGPT subscription, you sign the agent
container in instead (see [Add a Bridge](running-a-bridge.md#7-the-agents-credential)).

The Bridge keeps the credential encrypted and hands it to the agent only for each
run. Replacing a refused credential lets paused jobs carry on.

If the Bridge can't keep the credential to its own group (the agent isn't in the
group, the work folder's drive refuses the change, or the two containers see
different user ids on it), any user of the work folder
can read it until the agent picks it up, and the Bridge's log says how to fix
that. Once you fix it, the Bridge notices within about 5 minutes and keeps the
credential to its group again, with no restart. The console's **Server >
Settings > Bridge** shows which way the credential is handed over (see
[The setup card](../admin/bridge.md#the-setup-card)).

To have the agent wait instead, set
`AUDIOSILO_BRIDGE_AGENT_REQUIRE_GROUP: "true"` on the Bridge. The **Accounts** tab
then says why the agent isn't ready.

## Audible

The **Audible** card signs the Bridge in to one or more Audible accounts. The
Bridge finds the books already in your library and backs up the titles you choose.
You can also turn on automatic backups for new purchases. See
[Back up your Audible books](../admin/audible.md).

Each account belongs to **one person** on your server and goes with **one books
library**. The sign-in stays on the Bridge, and the server never sees it. Pair the
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

The console's [Audible accounts card](../admin/audible.md#the-audible-accounts-card)
holds the current **Back up** setting. The Bridge's card shows the value it last
saw, as **Last known to the Bridge**. It catches up the next time you press
**Change** and **Save** on the Bridge's card, or sign in to the account again.

Use **Change** to edit the person, library or name. A new library is refused
while the account's template or a title's saved destination would put a backup
in a [disc folder that joins another book](../admin/audible.md#choosing-a-destination)
there. Listening place sync starts off. You can turn it on in the console.
Changing the person turns it off again.

### The account's states

| Badge | Means |
|---|---|
| **Not checked yet** | signed in, not checked yet (or the Audible module is off) |
| **Signed in** | checked at least once; **Last checked** says when |
| **Sign in again** | Audible refused the sign-in or its downloads, for example after a password change or a Bridge update. Press **Sign in again**. The account's settings are kept. A refused download stays refused until you sign in again |
| **Mapped on another server** | set up while the Bridge was paired with another server. Press **Change** and save. While every account is like this, the setup checklist says to map one on this server |

### Removing an account

On the Audible card, choose **Remove**, then **Remove the account**. The Bridge
forgets the sign-in immediately. Books already in your library stay.

If the paired server is offline, the card says the Bridge will try again.
Leave the Bridge paired until it does. If you unpair first, or the server
still hasn't accepted the removal after about a week, the Bridge stops trying.
If the card says the server may still list the account, or the console still
lists it after that, remove it with **Remove...** in the console (see
[Removing an account](../admin/audible.md#removing-an-account)).

The Bridge also asks Amazon to remove the AudioSilo device. If the card warns
about the device, remove it yourself in Amazon's device list.

Backing up is for a personal backup of books you bought. Read the note at the top
of [Back up your Audible books](../admin/audible.md) first.

## Settings that take precedence

Two credentials set outside the page win over the ones set here:

- **`AUDIOSILO_BRIDGE_GITHUB_TOKEN`** in the Bridge's `environment`: a GitHub token
  of your own. While it is set, the Bridge shares with it, and the GitHub card says
  so. Remove it and restart the Bridge to use the sign-in instead.
- **A credential in the agent container**: `CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `CODEX_API_KEY` in its environment, the
  matching file in `/agent/secrets/`, or a Codex sign-in. The Agent card says when
  the container uses its own.
