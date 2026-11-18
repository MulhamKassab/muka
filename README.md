# Muka

Muka helps Claude Code work as a well-run team, and shows you what that team is doing and spending:

- **The panel:** see your agents at a glance and steer them without interrupting.
- **Smart rules:** coordination rules you switch on and off (task sizes, plan then swarm, helper models, stop rules, question rules).
- **Setup:** one command installs the helper agents, the status line and the settings.

It was first called Savvy, then Helm, then Orbit; those commands still work.

## Install with one prompt

Paste this into Claude Code on any computer. It installs Muka the first time and updates it later:

```text
Pull my private GitHub repo MulhamKassab/muka into the muka folder in my home folder (gh repo clone, or git pull if it's already there), then install it by following its INSTALL.md.
```

Claude follows [INSTALL.md](INSTALL.md), then tells you to type `/reload-plugins`, `/muka setup` and `/muka`. The computer needs the GitHub CLI signed in (`gh auth login`).

## Install by hand

```bash
gh repo clone MulhamKassab/muka ~/muka
```

```bash
claude plugin marketplace add ~/muka
```

```bash
claude plugin install muka@muka
```

Then type `/reload-plugins`, `/muka setup` and `/muka`. To update later: `git -C ~/muka pull`, `claude plugin marketplace update muka`, `claude plugin update muka@muka`.

## Commands

| Command | What it does |
|---|---|
| `/muka` or `/muka status` | What is on and off |
| `/muka on` / `/muka off` | The side panel (on by default) |
| `/muka smart` / `/muka smart off` | The coordination rules (on by default) |
| `/muka all on` / `/muka all off` | Panel and rules together |
| `/muka setup` / `/muka setup undo` | Install, or put back, the agents, status line and settings |
| `/muka budget 5` / `/muka budget off` | A spending cap per prompt (none by default) |
| `/muka guard on` / `/muka guard off` | Ask before shell commands delete files (off by default) |
| `/muka ping on` / `/muka ping off` | Sound, notification and phone push (on by default) |
| `/muka motion on` / `/muka motion off` | The panel's animations (on by default; also ⏸ on the Bridge) |
| `/muka recap` / `/muka recap yesterday` | The day's finished prompts |
| `/muka report` / `/muka report 14` | Efficiency over the last 7 (or up to 14) days, with suggestions |
| `/muka nudges on` / `/muka nudges off` | Tell the agent about waste as it happens (on by default) |
| `/muka models on` / `/muka models off` | Stop clear model waste for helpers (off by default) |
| `/muka rea` / `/muka rea setup` / `/muka rea doctor` | REA, Reverse Engineer Anything: status, install or update, checks |

`/orbit`, `/helm` and `/savvy` are old names for `/muka`.

## Smart rules

While smart is on, Muka adds the coordination rules to every new chat, the same way CLAUDE.md is read. Switching it on or off also sends the current chat a note, so the change applies from your next message. The rules:

- **Size every task first:** S (do it yourself), M (Haiku `Explore` helpers read, you build), L (plan then swarm), careful mode (as L, plus your approval, tests first and the `checker`).
- **Plan then swarm** for large tasks: scout, a PLAN.md with pieces and interfaces, one `builder` per independent piece, fit, one review.
- **Model and effort per helper:** the master, and every helper that starts its own, picks any model (Haiku, Sonnet, Opus or Fable) and any effort (low to max) by what the piece needs, at a sensible cost: Haiku/low for reading and lookups, Sonnet/medium for routine code, Sonnet or Opus/high for tricky work, Opus or Fable/high-max for hard reasoning the result depends on.
- **Sub-masters, at any depth:** every helper may run its piece like the master (plan it, start its own helpers, fit and test, report up), and its helpers may do the same. To keep usage sensible: split only M or L pieces, keep each team small, and keep reports to 150 words at every level.
- **Reports and the advisor:** reports of 150 words at most; the advisor once per large plan or when an error repeats (main session only).
- **Stop rules:** a stuck helper is steered or replaced; a budget, if you set one, wraps up at 70% and stops at 100%.
- **Questions:** one option marked recommended; if you're away it goes ahead with it, except for deleting, spending or sending.

Every chat gets a short core of the rules; the full large-task steps join only when a prompt looks large (long, a list of parts, or words like "refactor" or "one by one"), once per conversation and again after a compaction.

## Smarter work

Muka does more than show the agents: it keeps them efficient.

- **Waste nudges:** the agent is told at once, on the result that showed it, when it reads a file again that nothing has changed, runs the same failing command a second time, takes a result of more than ~5k tokens whole, or fills its context past 70%. Each one is listed under ♻️ in ⚠️ Alerts with its rough token cost.
- **Model guard (off by default):** with `/muka models on`, Muka stops only clear waste: Explore never on Opus or Fable (it runs on Haiku), and code never written on Haiku (Sonnet instead). Marked ⤵ in the Orbit.
- **Helper brief:** every helper that writes code gets a short version of the rules with its task (about 200 tokens), so it can act as a sub-master and pick models for its own helpers.
- **Report:** `/muka report` sums the last week: spend by model, by helper and by task size, the cache rate, the waste caught, the costliest prompts, and suggestions drawn from those numbers.
- **Self-tuning sizes:** Muka compares the size Claude gave each task ("Size: M") with what it really took. When Claude keeps sizing too small (or calling small tasks L), the next chat's rules say so.

## Setup

`/muka setup` installs:

- **Agents** in `~/.claude/agents`: `Explore` (Haiku, read-only), `builder` (Sonnet), `reviewer` (Sonnet, read-only), `checker` (Opus, read-only, only on request).
- **Status line** `~/.claude/statusline.js`: model, context, cost and usage limits.
- **Settings** merged into `~/.claude/settings.json`: Sonnet as the main model, a 60-second question timeout, the advisor model, and push notifications. Your other settings are kept; `env`, plugins and marketplaces are merged key by key, and a plugin you turned off stays off.
- **[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance)**, Google Chrome's plugin of up-to-date web best practices (HTML, CSS, browser JavaScript, accessibility, performance): its marketplace and plugin are added to the settings, and the install prompt installs it.
- **[REA, Reverse Engineer Anything](https://github.com/morluto/rea)**: tools for understanding how an app or feature works without its source code (native binaries, JavaScript and Electron apps, .NET assemblies, websites), with the evidence behind each finding. `/muka rea setup` installs or updates it for Claude Code in the background (REA's own setup, `npx rea-agents setup --client claude_code --yes`; a note says when it is done), `/muka rea` shows whether it is set up, and `/muka rea doctor` runs its checks. It needs Node.js 24.22.1 or newer (or 22.23.4+). Native-binary analysis can use Hopper, Ghidra, IDA or Kuna if you have one; JavaScript and web analysis needs none.

Earlier versions also set `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, which forced every helper onto Haiku and overrode the models the master picks; setup now takes that out if it still holds that value.

Everything it replaces is copied first to `~/.claude/backups/muka-setup-<time>/`; `/muka setup undo` puts it back. Files it added new stay in place. If `settings.json` can't be read, setup changes nothing.

## The panel (desktop app)

A row of icons opens each view: 🧭 Bridge, 📜 Activity, ⚠️ Alerts, 📝 Changes, 💲 Spend, ⏱️ Timeline, 🧊 Cache and 💡 Reflect. Every view is a picture first, on Claude's own light background.

- **🧭 Bridge**, one card:
  - MUKA with the clock and spend, what is happening now, the phase bar and where the plan stands.
  - The Orbit: Main in the centre and every helper and sub-helper around it as a tree, each with its model, time, and what it is doing right now (▸) or its steps and cost when done. A helper that started its own wears a violet ring. Past 6 helpers, every bubble shows a number, and a legend under the Orbit lists them all in tree order (sub-helpers indented) with model, cost and what each is doing.
  - Gauges for the usage limit, context and cache, and the latest steps.

  Under the card, a button per agent opens its details, with Steer and Stop.
- **📜 Activity:** a lane per agent with a dot per step (failures in red) and the latest steps.
- **⚠️ Alerts:** tiles for failed, denied, risky, outside the project, stuck and warnings, and the latest events.
- **📝 Changes:** a bar per changed file (red outside the project), ± to see its diff, and deletes.
- **💲 Spend:** spend by model against the budget, and per agent (at API prices).
- **⏱️ Timeline:** when each agent ran.
- **🧊 Cache:** a ring for all agents and a bar per agent.
- **💡 Reflect:** the last turn as tiles, and an AI review on demand.

The pictures move: the Orbit's rings turn, working helpers pulse and ping, links to them flow, Main breathes with a comet circling it while it works, sparks travel to working helpers, and progress bars shimmer. The motion carries on smoothly when the numbers update. ⏸ Pause animations under the Bridge (or `/muka motion off`) stops them, and a system "reduce motion" setting always keeps them still.

In the terminal and editors the same views are text.

The line under the message box is Muka's **pulse**. It shows the most urgent thing when something needs you (a stuck agent, failures, the budget, a full context). Otherwise it shows who is working, the spend and the context while work runs, and a one-line recap of the last task when idle.

## Delete guard

Off by default. With `/muka guard on`, before a `Bash` or `PowerShell` command deletes files, Muka shows what it would remove and asks **Delete them** or **Block it**. Anything but Delete them blocks it, including a question that closes on its own. It reads common delete commands (`rm`, `del`, `Remove-Item`, `git clean -f`, `find -delete` and others), including ones wrapped in `sudo`, `bash -c`, `powershell -c` or `$(...)`. It cannot see deletes inside scripts or programs it runs, and it is a safety net, not a sandbox.

Apart from the delete guard, the model guard, pings, setup and the notes it and you send, Muka only watches: it never changes or blocks an agent's work.

## What Muka does on your computer

Muka runs inside Claude Code as a plugin. Everything it does:

- **Network:** none. Muka makes no network calls of its own.
- **Programs it runs:** only `npx rea-agents …`, and only when you type `/muka rea setup` or `/muka rea doctor`.
- **Files it writes:** only during `/muka setup` and `/muka setup undo`: the helper agents in `~/.claude/agents`, `~/.claude/statusline.js`, `~/.claude/settings.json`, and backups of whatever they replace in `~/.claude/backups`. Its own state (panel views, the prompt log for `/muka recap` and `/muka report`, kept 14 days) lives in Claude Code's plugin store.
- **Files it reads:** your settings during setup, `~/.claude.json` and `~/.claude/skills` for `/muka rea`, and the files the agents change (to show their diffs).
- **Model calls:** one, the 💡 Reflect review, and only when you press it.
- **What it changes in a conversation:** the rules block at the start of a chat (while smart is on), short notes added after tool results (waste nudges, budget warnings, your steering notes), a short brief added to the task of a helper that writes code, a helper's model when you turn the model guard on, and a refused shell command when you turn the delete guard on and answer Block.
- **Notifications:** sounds, desktop notifications and phone pushes go through Claude Code's own notification features (`/muka ping off` stops them).

Is it cheaper? Unproven yet. `/muka report` measures spend by model, helper and task size from your own prompts; give it a week, and compare a week with `/muka smart off`.
