# Install or update Muka (steps for Claude)

The person pasted the short prompt from the README. Do these steps in order and show what each command prints. If a step fails, stop there and say what it printed and what to do next. Change nothing else on the computer.

`<home>` below is the person's home folder as a full path (for example `C:/Users/name` or `/Users/name`).

1. **GitHub access.** Run `gh auth status`. If the GitHub CLI is missing or not signed in, stop and tell the person to install it from https://cli.github.com, run `gh auth login`, then ask again.
2. **Pull the code.**
   - If `<home>/muka` exists: `git -C <home>/muka pull`.
   - Otherwise: `gh repo clone MulhamKassab/muka <home>/muka`.
3. **Install or update the plugin.** Run `claude plugin marketplace list`.
   - If a marketplace named `muka` is listed (an update): `claude plugin marketplace update muka`, then `claude plugin update muka@muka`.
   - Otherwise (a first install): `claude plugin marketplace add <home>/muka`, then `claude plugin install muka@muka`.
   - **Modern Web Guidance** (Google Chrome's web best-practice guides, part of Muka): if `claude plugin marketplace list` has no `googlechrome`, run `claude plugin marketplace add GoogleChrome/modern-web-guidance`; then, if `claude plugin list` has no `modern-web-guidance@googlechrome`, run `claude plugin install modern-web-guidance@googlechrome`. On an update, run `claude plugin update modern-web-guidance@googlechrome` instead.
   - **REA, Reverse Engineer Anything** (part of Muka): if `claude plugin marketplace list` has no `rea`, run `claude plugin marketplace add morluto/rea`; then, if `claude plugin list` has no `rea@rea`, run `claude plugin install rea@rea`. On an update, run `claude plugin update rea@rea` instead. It needs Node.js 24.22.1 or newer (or 22.23.4+ on Node 22): if `node --version` is older, the install fails with "Could not download rea-agents"; tell the person to update Node.js from https://nodejs.org and ask again. On Windows the plugin install can also give up after about 5 minutes while unpacking REA's 10,000+ files (same message). Then tell the person to run REA's own setup themselves in a terminal, `npx rea-agents setup`, and pick Claude Code: it registers the same tools with no time limit.
4. **Check.** Run `claude plugin list` and confirm `muka@muka`, `modern-web-guidance@googlechrome` and `rea@rea` are enabled. If another copy named `muka` is also enabled (for example `muka@local-mods`, a development copy), say so: two copies would both load.
5. **Hand over.** Claude can't type slash commands, so tell the person to type these, one at a time:
   - `/reload-plugins`: loads Muka in this chat (a new chat loads it anyway).
   - `/muka setup` (first install only): installs the helper agents, the status line and the settings. Anything it replaces is backed up first; `/muka setup undo` puts it back.
   - `/muka`: shows what is on.

## Commands, for the person

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
| `/muka report` | Efficiency over the last week, with suggestions |
| `/muka nudges on` / `/muka nudges off` | Waste nudges to the agent (on by default) |
| `/muka models on` / `/muka models off` | The helper model guard (on by default) |
