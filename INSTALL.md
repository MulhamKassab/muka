# Install Muka on a new computer

## Before you start (once per computer)

This repository is private, so the computer needs GitHub access. In a terminal:

```bash
gh auth login
```

```bash
gh auth setup-git
```

## The prompt

Paste this into Claude Code on the new computer:

> Install the Muka plugin for me. Run these two commands, one after the other, and show me what they print:
> 1. `claude plugin marketplace add MulhamKassab/muka`
> 2. `claude plugin install muka@muka`
>
> If either fails because GitHub asks for access, stop and tell me to run `gh auth login` and `gh auth setup-git`. When both succeed, tell me to type `/reload-plugins`, then `/muka setup`, then `/muka`.

## Then type these yourself

Claude can't type slash commands for you, so finish with:

1. `/reload-plugins`: loads Muka (or start a new chat).
2. `/muka setup`: installs the helper agents (Explore, builder, reviewer, checker), the status line, and the settings (60-second question timeout, Haiku for searching helpers, Sonnet as the main model, notifications). Anything it replaces is backed up first; `/muka setup undo` puts it back.
3. `/muka`: shows what is on.

## Turning things on and off

| Command | What it does |
|---|---|
| `/muka` | Status: what is on and off |
| `/muka on` / `/muka off` | The side panel |
| `/muka smart` / `/muka smart off` | The coordination rules (task sizes, plan then swarm, helper models, stop rules, question rules) |
| `/muka all on` / `/muka all off` | Panel and rules together |
| `/muka setup` / `/muka setup undo` | Install or undo the agents, status line and settings |
| `/muka budget 5` / `/muka budget off` | A spending cap per prompt (none by default) |
| `/muka guard on` / `/muka guard off` | Ask before shell commands delete files (off by default) |
| `/muka ping on` / `/muka ping off` | Sound, notification and phone push (on by default) |
| `/muka recap` | Today's finished prompts |

## Updating

```bash
claude plugin marketplace update muka
```

```bash
claude plugin update muka@muka
```

Then `/reload-plugins`.
