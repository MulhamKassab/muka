# Muka

Muka brings together everything that makes Claude Code work as a cheap, well-run team:

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
| `/muka recap` / `/muka recap yesterday` | The day's finished prompts |

`/orbit`, `/helm` and `/savvy` are old names for `/muka`.

## Smart rules

While smart is on, Muka adds the coordination rules to every new chat, the same way CLAUDE.md is read. Switching it on or off also sends the current chat a note, so the change applies from your next message. The rules:

- **Size every task first:** S (do it yourself), M (Haiku `Explore` helpers read, you build), L (plan then swarm), careful mode (as L, plus your approval, tests first and the `checker`).
- **Plan then swarm** for large tasks: scout, a PLAN.md with pieces and interfaces, one `builder` per independent piece, fit, one review.
- **Helpers:** Explore on Haiku; builder and reviewer on Sonnet; never Haiku for code; reports of 150 words at most; the advisor once per large plan or when an error repeats.
- **Stop rules:** a stuck helper is steered or replaced; a budget, if you set one, wraps up at 70% and stops at 100%.
- **Questions:** one option marked recommended; if you're away it goes ahead with it, except for deleting, spending or sending.

## Setup

`/muka setup` installs:

- **Agents** in `~/.claude/agents`: `Explore` (Haiku, read-only), `builder` (Sonnet), `reviewer` (Sonnet, read-only), `checker` (Opus, read-only, only on request).
- **Status line** `~/.claude/statusline.js`: model, context, cost and usage limits.
- **Settings** merged into `~/.claude/settings.json`: Haiku for helpers that name no model, Sonnet as the main model, a 60-second question timeout, the advisor model, and push notifications. Your other settings, plugins and marketplaces are kept; `env` is merged key by key.

Everything it replaces is copied first to `~/.claude/backups/muka-setup-<time>/`; `/muka setup undo` puts it back. Files it added new stay in place. If `settings.json` can't be read, setup changes nothing.

## The panel (desktop app)

A row of icons opens each view: 🧭 Bridge, 📜 Activity, ⚠️ Alerts, 📝 Changes, 💲 Spend, ⏱️ Timeline, 🧊 Cache and 💡 Reflect. Every view is a picture first, on Claude's own light background.

- **🧭 Bridge**, one card:
  - MUKA with the clock and spend, what is happening now, the phase bar and where the plan stands.
  - The Orbit: Main in the centre and helpers around it, each with its model, time, steps and cost.
  - Gauges for the usage limit, context and cache, and the latest steps.

  Under the card is 🎯 Steer: pick an agent, type a note or press a quick one (⏸ Wrap up, 🚫 No helpers, 🗺 Explain, 🐢 Smaller steps, 💰 Keep it cheap). The note reaches the agent at its next step, so it keeps working. A button per agent opens its details, with Steer and Stop.
- **📜 Activity:** a lane per agent with a dot per step (failures in red) and the latest steps.
- **⚠️ Alerts:** tiles for failed, denied, risky, outside the project, stuck and warnings, and the latest events.
- **📝 Changes:** a bar per changed file (red outside the project), ± to see its diff, and deletes.
- **💲 Spend:** spend by model against the budget, and per agent (at API prices).
- **⏱️ Timeline:** when each agent ran.
- **🧊 Cache:** a ring for all agents and a bar per agent.
- **💡 Reflect:** the last turn as tiles, and an AI review on demand.

In the terminal and editors the same views are text.

The line under the message box is Muka's **pulse**. It shows the most urgent thing when something needs you (a stuck agent, failures, the budget, a full context). Otherwise it shows who is working, the spend and the context while work runs, and a one-line recap of the last task when idle.

## Delete guard

Off by default. With `/muka guard on`, before a `Bash` or `PowerShell` command deletes files, Muka shows what it would remove and asks **Delete them** or **Block it**. Anything but Delete them blocks it, including a question that closes on its own. It reads common delete commands (`rm`, `del`, `Remove-Item`, `git clean -f`, `find -delete` and others), including ones wrapped in `sudo`, `bash -c`, `powershell -c` or `$(...)`. It cannot see deletes inside scripts or programs it runs, and it is a safety net, not a sandbox.

Apart from the delete guard, pings, setup and the notes you send, Muka only watches: it never changes or blocks an agent's work.
