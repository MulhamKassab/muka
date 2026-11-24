# Muka

**A Claude Code mod.** Muka is a plugin for [Claude Code](https://docs.claude.com/en/docs/claude-code) that helps it work as a well-run team, and shows you what that team is doing and spending. The repository is public and open source under the [MIT licence](LICENSE).

## What it is

- **The agents panel:** a panel beside the chat in the Claude desktop app shows the main agent and every helper it starts (what each is doing, its model, spend and context) and lets you steer them without interrupting. In the terminal and editors the same views are text. See [The panel](#the-panel-desktop-app).
- **Smart rules:** coordination rules added to every chat while `/muka smart` is on: task sizes, plan then swarm, which helper model to use, stop rules and question rules. `/muka smart off` turns them all off; `/muka rule <id> off` turns off one. See [Smart rules](#smart-rules).
- **Setup:** `/muka setup` installs the helper agents, the `verify` and `muka-helpers` skills, the status line and the settings in one go, backing up anything it replaces; `/muka setup undo` puts the backups back. See [Setup](#setup).

Muka makes no network calls of its own and only watches your agents unless you switch on one of its guards (details in [What Muka does on your computer](#what-muka-does-on-your-computer)).

It was first called Savvy, then Helm, then Orbit; those old command names are gone, so use `/muka`.

## Install

You need Claude Code and `git`. Muka installs as a Claude Code plugin from a local clone of this repository.

### With one prompt

Paste this into Claude Code. It installs Muka the first time and updates it later:

```text
Clone the public GitHub repo https://github.com/MulhamKassab/muka into the muka folder in my home folder (or git pull if it's already there), then install it by following its INSTALL.md.
```

Claude follows [INSTALL.md](INSTALL.md), then tells you to type `/reload-plugins`, `/muka setup` and `/muka`.

### By hand

```bash
git clone https://github.com/MulhamKassab/muka ~/muka
```

```bash
claude plugin marketplace add ~/muka
```

```bash
claude plugin install muka@muka
```

Then, in Claude Code, type `/reload-plugins`, `/muka setup` and `/muka`.

To update later: `git -C ~/muka pull`, `claude plugin marketplace update muka`, `claude plugin update muka@muka`.

To remove what setup installed, type `/muka setup undo`; `/muka all off` switches off the panel and the rules without uninstalling.

## Commands

| Command | What it does |
|---|---|
| `/muka` or `/muka status` | What is on and off |
| `/muka on` / `/muka off` | The side panel (on by default) |
| `/muka smart` / `/muka smart off` | The coordination rules (on by default) |
| `/muka rules` | Each rule, on or off, and how often its check fired this session |
| `/muka rule <id> on` / `/muka rule <id> off` | Switch one rule (`/muka rule all off` for every one) |
| `/muka all on` / `/muka all off` | Panel and rules together |
| `/muka setup` / `/muka setup undo` | Install, or put back, the agents, the verify and muka-helpers skills, status line and settings |
| `/muka budget 5` / `/muka budget off` | A spending cap per prompt (none by default) |
| `/muka guard on` / `/muka guard off` | Ask before shell commands delete files (off by default) |
| `/muka ping on` / `/muka ping off` | Sound, notification and phone push (on by default) |
| `/muka motion on` / `/muka motion off` | The panel's animations (on by default; also ✨ Motion on the Bridge) |
| `/muka recap` / `/muka recap yesterday` | The day's finished prompts |
| `/muka report` / `/muka report 14` | Efficiency over the last 7 (or up to 14) days, with suggestions |
| `/muka cache` / `/muka cache ttl 5` | The prompt cache: TTL, minutes left and the last turn's hit rate; set the TTL in minutes (60 by default) |
| `/muka audit` | Enabled plugins with no recorded use, and the most used ones (never changes your settings) |
| `/muka nudges on` / `/muka nudges off` | Tell the agent about waste as it happens (on by default) |
| `/muka models on` / `/muka models off` | Stop clear model waste for helpers (off by default) |
| `/muka rea` / `/muka rea setup` / `/muka rea doctor` | REA, Reverse Engineer Anything: status, install or update, checks |
| `/muka trim auto` / `/muka trim on` / `/muka trim off` / `/muka trim 12000` | Output trimming (auto by default); the number sets the threshold in characters (1,000 to 200,000) |
| `/muka caps` / `/muka caps hard on` / `/muka caps hard off` | The helper caps (numbers, soft or hard, this prompt's counts); hard refuses a helper over a cap |
| `/muka depth <n>` / `/muka depth off` | How deep helpers may nest below the master (2 by default; `off` is no limit) |
| `/muka context` | What filled Main's context: Muka's rules and notes, tool results by kind, the engine's total |
| `/muka handoff` | Main writes `.claude/handoff.md` so a fresh chat can continue |
| `/muka compact` | Hints Main to run `/compact` at its next step |
| `/muka menu` | Opens the ☰ Menu tab: a button for every command |

## Smart rules

While smart is on, Muka adds the coordination rules to every new chat, the same way CLAUDE.md is read. Switching it on or off also sends the current chat a note, so the change applies from your next message. The rules (the helper, model and sub-master rules ride in the chat as a short paragraph each, with the full text in the `muka-helpers` skill that Claude loads before starting a helper; the verify rule is two lines pointing at the `verify` skill; both skills are installed by `/muka setup`):

- **Size every task first:** S (do it yourself, no helpers), M (at most 3 helpers, see the table below; you build), L (the team: at most 6 helpers, in waves of 3), careful mode (as L, plus your approval, tests first and the `checker`).
- **Plan then swarm** for large tasks: scout, a PLAN.md with pieces and interfaces, one `builder` per independent piece (at most 3 per wave, 6 in all), fit, one `reviewer` (Opus, high).
- **Helpers: which, when, how many:** a table of which helper to start for what, and how many (below). Helpers cost about 4x the tokens of doing the work yourself, so none is started where the table says none.
- **Model and effort per helper:** every Agent call names a model and an effort; the table gives the default for each case, a step up one level only after a real shortfall, and any other model only when you ask for it.
- **Sub-masters:** a helper starts its own helpers only for an L piece whose parts have their own files: at most 2, and at most two levels below the master unless you lift the limit (`/muka depth`); otherwise it does the piece itself. Reports of 150 words at every level.
- **Reports and the advisor:** reports of 150 words at most; the advisor once per large plan or when an error repeats (main session only).
- **Stop rules:** a stuck helper is steered or replaced; a budget, if you set one, wraps up at 70% and stops at 100%.
- **Questions:** one option marked recommended; if you're away it goes ahead with it, except for deleting, spending or sending.

### Which helper, when, how many

| Situation | Helper | Model, effort | How many |
|---|---|---|---|
| A change in up to 3 files with the location known; one question over fewer than 10 files; dependent steps; edits to the same file; anything that needs back-and-forth | none: do it yourself | | 0 |
| 10+ files to explore, or 2-3 independent questions | `Explore` | haiku, low | one per question, at most 3 at once |
| Web or docs research | `Explore` | haiku, low (sonnet if it must weigh sources) | 1-2 |
| 2+ independent pieces in different files, each about 10+ tool calls | `builder` | sonnet, medium | one per piece, 2 usual, at most 3 per wave |
| A noisy run (full test suite, long logs) that should return a summary | `builder` as a runner | sonnet, low | 1 |
| A bug that survived two fix attempts | a fresh `builder` with a full brief | opus, high | 1 |
| The end of an L task | `reviewer` | opus, high | once |
| Only when you ask, or in careful mode | `checker` | | once |
| **Per prompt** | | | S 0, M at most 3, L at most 6 in waves of at most 3 |

A brief gives the objective, the exact files, what is already known, done-when and the output format; the report back is at most 150 words. Reuse a helper that already has the context (SendMessage) before starting a new one, and never poll a helper.

### Caps

Muka checks the numbers when a helper starts (a `fork` is exempt):

- **Per prompt**, for the helpers Main starts: S 0, M 3, L or unsized 6.
- **Running at once** under the same parent: 3 (2 when the parent is a helper).
- **Depth** (`/muka depth <n|off>`, 2 by default): helpers below the master. The helpers rule governs the first two caps and the sub-masters rule the depth; a rule that is off is not checked.

By default the caps are **soft**: the helper starts, and its starter hears one note per cap kind per prompt (and Alerts lists it). With `/muka caps hard on` (store key `capsHard`; 🚧 Hard caps in the Menu) the helper is refused instead, with `Muka: <which cap>. <what to do instead>.` `/muka caps` prints the numbers, whether they are hard or soft, and this prompt's counts. Hits are counted under the `helpers` and `submasters` rules (`/muka rules`).

Two more checks, under the `helpers` rule, each at most once per prompt: a **thin brief** (a code-writing helper's brief under 200 characters or with no file path or file name in it, or an `Explore` brief under 100 characters) brings `Muka: that brief is thin: ...` to whoever started it; a **long report** (a helper's answer over 8,000 characters) adds an Alerts line (`long report from builder: ~Nk tokens`) and tells Main to ask helpers for reports of at most 150 words.

Every chat gets a short core of the rules; the full large-task steps join only when a prompt looks large (long, a list of parts, or words like "refactor" or "one by one"), once per conversation and again after a compaction.

## Rule controller

The rules are a registry of nine separate rules. Each one can be switched on or off by itself; a rule that is off is neither sent to Claude nor checked. `/muka smart off` (🧠 Rules on the Bridge) still pauses all of them at once.

| Id | Rule | How Muka checks it |
|---|---|---|
| `size` | Size every task first (S: no helpers; M: at most 3; L: the team, at most 6; careful mode) | If Main's third tool call of a prompt comes with no "Size:" line, one note asks for it; a helper started on a task sized S, or a fourth on one sized M, brings one note quoting the rule |
| `large` | Large tasks: plan, then swarm (sent only with prompts that look large; every chat gets a one-paragraph summary) | Not checked |
| `helpers` | Helpers: which, when, how many (the table above, the brief, the 150-word report, the advisor, stop rules, Muka notes) | Starting a helper of a type while a finished one of that type from this prompt exists brings one note per type (continue it with SendMessage); a helper over a cap, a thin brief and a long report bring one note per prompt (see Caps); `/muka caps hard on` refuses a helper over a cap |
| `models` | Models: name `model` and `effort` on every Agent call; the defaults per case are in the helper table, one step up only after a real shortfall, any other model only when you ask. Main chat: routine S work belongs in a Sonnet chat | A helper started without a model is marked **DEFAULT** (amber) in the agents console, and whoever started it is told at its next step; an `Explore` started on Opus or Fable brings a note that reading runs on Haiku (the model is left alone; the model guard moves it when on); a task Main sizes S while the chat runs on Opus or Fable brings one note per session asking Main to tell you, in one line, that a Sonnet chat (`/model sonnet`) costs about half (a quarter for Fable) |
| `submasters` | Sub-masters: a helper starts helpers only for an L piece whose parts have their own files, at most 2 and two levels deep (also the brief added to a helper that writes code) | The depth cap (see Caps) |
| `verify` | Verify before done: targeted tests while working, the full suite once at the end, build, linter and app; a `reviewer` only on L tasks; never edit a check to pass; say what ran | A turn that changed files inside the project and ran no test, build, lint or app check is flagged in Alerts with a toast, and your next prompt carries a note asking Claude to verify first (edits under a temp or scratchpad folder, or outside the project, never count) |
| `context` | Context: at about 50% full, finish the piece and `/compact`; a fresh chat for an unrelated task; big reading to a helper | At 50% full Main is told, once per climb, on its next tool result (the 70% waste nudge stays); a prompt-cache drop is also counted here (see Caching) |
| `recover` | Recover: after two failed fixes of the same problem, go back to the last good state and try another way, or report the blocker | The second identical failure of a call brings this note (even with the waste nudges off) |
| `questions` | Questions: one option marked recommended; go ahead with it when you're away, except for deleting, spending or sending | Not checked |

Every check that fires is counted for the session and listed under ♻️ in ⚠️ Alerts.

To switch a rule: `/muka rule verify off`, `/muka rule verify on`, or `/muka rule all on|off`; or open the 🧠 **Rules** tab in the panel, which shows each rule as a row (ON/OFF and "checked: n") with a button per rule plus **All on** and **All off**. The choice is kept across chats (store key `rulesOff`), and switching tells the current chat at once in one short note. A small chat gets no more rule text than before the rules were split.

## Caching

The prompt cache keeps what a chat has already read, so a turn pays for the new text only. It lapses after a while without a request (about an hour on the long cache, five minutes on the short one), and then the next turn pays for everything again. Muka helps in four ways:

- **A stable rules block:** the `mukaRules` context block is byte-identical in every chat while the same rules are on. The sizing tune (when Claude keeps sizing too small) no longer rides in it; it goes once per conversation with the first real prompt instead.
- **The cache clock:** Muka notes when Main's last request ended. The header shows a chip, `CACHE WARM · 42m` (green; amber under 10 minutes) or `CACHE COLD` (past the TTL), and nothing before the first turn. When idle with under 5 minutes left, the pulse line says `cache expires in Nm: a pause now costs a full re-read`. `/muka cache` shows the TTL, the minutes left and the last turn's hit rate; `/muka cache ttl 5` sets the TTL in minutes (store key `cacheTtlMin`, 60 by default).
- **The drop alert:** when a turn read at least 20,000 input tokens and its cache rate fell 30 points or more below the previous turn's, Alerts shows `cache dropped NN% → MM%: <cause>`: an idle gap longer than the TTL, the model changed, the effort changed, the context was compacted, a rule or setting toggled or plugins reloaded, else unknown. It is counted under the `context` rule.
- **`/muka audit`:** every plugin you leave enabled adds tool definitions and skill names to the front of every chat. Muka counts per day (store keys `use:`, 14 days) how often each tool server (`mcp__<server>__`), plugin skill (`<plugin>:<skill>`) and agent type was used. `/muka audit` lists the enabled plugins with no recorded use, the most used ones, and how to turn one off (`claude plugin disable <name>`). It only reads your settings and never changes them. A plugin that only adds commands or hooks shows no use here.

## Saving tokens

- **Output trimming (`/muka trim auto|on|off`, auto by default):** a successful `Bash` or `PowerShell` result is trimmed by mode. **auto** trims one over 20,000 characters always, and one over the threshold (12,000; `/muka trim <chars>`) once Main's context is at 40% or more (a helper's results always use the threshold); **on** trims over the threshold at any context; **off** never. A trimmed result reaches the model as its first ~3,000 characters, every line that looks like an error (`error`, `fail`, `exception`, `warn`, `traceback`, `fatal`, `denied`, `not found`; at most 60, each clipped, deduped), its last ~3,000 characters, and one line saying how much was cut and where the full text is. A stored `true` or `false` from an older version reads as on or off. The Menu and Bridge Trim button cycles auto, on, off. The full text is saved under `~/.claude/muka-outputs/output-01.txt` to `output-30.txt` (the oldest is overwritten; the engine gives plugins no way to delete a file). Muka answers from its `tool.call` hook with `{ result }` in the tool's own output shape (`stdout`, `stderr`, ...), which the engine checks against the tool's schema. `Read`, `Grep`, `Edit`, agents and MCP tools are never trimmed, nor failed or backgrounded commands. Each trim adds an Alerts line (`trimmed Bash output: ~Nk tokens saved`), counts toward the prompt's `trimSavedTokens` in the log, and shows in `/muka report` as `Saved by Muka`.
- **Context breakdown (🧮 Context tab, `/muka context`):** a stacked bar and rows for what Muka can measure of Main's context this conversation: its rules and notes, and tool results by kind (Read, Bash/PowerShell, Grep/Glob, MCP, agents' reports, other), against the engine's own total. The rest is shown as `other (system prompt, tools, conversation)`: Muka does not see inside it. Counts are characters / 4, restart in a new chat, and reset when the context is compacted.
- **Handoff (`/muka handoff`, 📝 Handoff on the Bridge and the Menu):** a note asks Main to write a handoff (goal, done, left, decisions, files, how to verify, 300 words) to `<project>/.claude/handoff.md` and to tell you to start a new chat and say "continue from .claude/handoff.md". Muka suggests it once, in Alerts and the pulse, when Main's chat passes 4 hours of turn time or 300 steps.
- **Compact hint (`/muka compact`, 🗜 Compact hint in the Menu):** when a plan step finishes while the context is over 40%, Main is told that is a clean place to `/compact` (at most one hint every 20 minutes; off with nudges and the context rule off).
- **Cache causes and the tool list:** the engine exposes no cache-miss cause to plugins (nothing like `last_miss_cause` is in its types), so the drop alert's cause stays Muka's best guess, and `/muka cache` shows the last drop and says so; if a turn ever carries `last_miss_cause`, Muka uses it. When a tool server joins or leaves between Main's turns (read from the engine's tool list), Alerts shows `tool list changed: <server> (this can reset the cache)` and that becomes the likeliest cause of the next drop.

## The Menu

The ☰ **Menu** tab (right after the Bridge, on every surface; `/muka menu` opens it) has a button for every command, in groups:

- **Switches** (primary while on, the state in the label): Panel rules, Nudges, Model guard, Delete guard, Pings, Motion, Trim (cycles auto, on, off), Hard caps, Depth (cycles 2, 3, no limit), and Budget cycle (off, $2, $5, $10).
- **Views:** Rules, Context, Report, Alerts, Changes, Activity.
- **Actions:** Wrap up all, Stop helpers, Verify, Handoff, Compact hint.
- **Info:** Status, Cache, Caps, Audit, Recap today, Recap yesterday, Rules list. Their text prints in a result area under the buttons (with a Clear button).
- **Tools:** REA status, REA setup, REA doctor, Setup, Setup undo. REA setup and Setup undo need a second press within 10 seconds (the label reads `Press again to confirm`).

The Bridge's Controls also carry a ✂️ Trim toggle and its Actions a 📝 Handoff button.

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
- **The `muka-helpers` skill** in `~/.claude/skills/muka-helpers/SKILL.md`: the full text of the Helpers, Models and Sub-masters rules (which helper for what, how many, model and effort per case, the brief and the 150-word report, sub-master limits, advisor, stop rules, Muka notes). Claude loads it before starting any helper; the chat itself carries only the hard numbers (S 0 / M 3 / L 6, 3 per wave) and a pointer to it, which keeps the rules every chat starts with about 35% shorter.
- **The `verify` skill** in `~/.claude/skills/verify/SKILL.md`: used before calling work done or committing. It finds the project's test, build, lint and run commands (package.json, Makefile, pyproject and the like, and the CI workflows), runs them, starts a web or desktop app and walks the changed path with the browser or computer tools (with a screenshot), never edits a test to pass, and ends with what ran and what was not checked.
- **Status line** `~/.claude/statusline.js`: model, context, cost and usage limits.
- **Settings** merged into `~/.claude/settings.json`: Sonnet as the main model, a 60-second question timeout, the advisor model, push notifications, and `"autoCompactWindow": 200000` (the conversation compacts at 200,000 tokens instead of filling a larger window; Claude Code's `autoCompactWindow` setting, 100,000 or more, capped at the model's window). `autoCompactWindow` is added only when your settings have none: yours is never replaced, and setup's result says which. Your other settings are kept; `env`, plugins and marketplaces are merged key by key, and a plugin you turned off stays off.
- **[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance)**, Google Chrome's plugin of up-to-date web best practices (HTML, CSS, browser JavaScript, accessibility, performance): its marketplace and plugin are added to the settings, and the install prompt installs it.
- **[REA, Reverse Engineer Anything](https://github.com/morluto/rea)**: tools for understanding how an app or feature works without its source code (native binaries, JavaScript and Electron apps, .NET assemblies, websites), with the evidence behind each finding. `/muka rea setup` installs or updates it for Claude Code in the background (REA's own setup, `npx rea-agents setup --client claude_code --yes`; a note says when it is done), `/muka rea` shows whether it is set up, and `/muka rea doctor` runs its checks. It needs Node.js 24.22.1 or newer (or 22.23.4+). Native-binary analysis can use Hopper, Ghidra, IDA or Kuna if you have one; JavaScript and web analysis needs none.

Earlier versions also set `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, which forced every helper onto Haiku and overrode the models the master picks; setup now takes that out if it still holds that value.

Everything it replaces is copied first to `~/.claude/backups/muka-setup-<time>/`; `/muka setup undo` puts it back. Files it added new stay in place. If `settings.json` can't be read, setup changes nothing.

## The panel (desktop app)

A row of icons opens each view: 🧭 Bridge, ☰ Menu, 📜 Activity, ⚠️ Alerts, 📝 Changes, 💲 Spend, 🧮 Context, 💡 Reflect and 🧠 Rules. Every view is a picture first, drawn as a dark HUD: black-green glass with faint scanlines, a green hairline, monospace type and neon colours (the same in light and dark themes).

- **🧭 Bridge**, one card:
  - The glowing MUKA with a blinking ● LIVE (or IDLE / STUCK) chip and the verified chip, the clock and spend on the right, a cyan prompt line (`> builder :: Edit mailer.ts_`), the plan bar (the current step pulsing violet) and `PLAN 2/4 · NOW: BUILD`.
  - The Orbit as a radar: rings, a crosshair and a turning sweep, Main in the centre, every helper and sub-helper as a numbered blip in a radial tree (sparks travel along links to working helpers; ✓ / ✗ marks on finished ones; a violet ring on a helper that started its own). Beside it, gauges as label, big number and thin bar: the week (or 5h) limit, context and cache.
  - The **agents console**, `AGENTS · 2 ACTIVE · 2 DONE`: one row per helper in tree order (sub-helpers indented), its number tile in its status colour, its name, a model·effort tag (`OPUS·HI`, `HAIKU·LO`; the model alone when the spawn gave no effort), what it is doing now (▸ step) or how it ended, and its cost. Working rows get a cyan outline; past 8 helpers each row is one line.
  - The pace line and the latest steps.

  Under the card, a chip per helper ("Tap a helper to open it"), numbered and in the same order as the Orbit's bubbles: `3 🔨 builder ▸` (▸ working, ✓ done, ✗ failed, ⚠ stuck; working ones are highlighted). Tapping a chip opens that helper's **control page**: a picture of the helper (a HUD target with its icon, halo and ping while it works; name, model, status, time, steps, estimated cost, what it is doing now, a mini lane of its last 20 steps with failures in red, and the helpers it started), then a message box and quick buttons (⏸ Wrap up, ⏹ Stop, 💬 Explain, 🔬 Smaller steps, 💲 Keep cheap, ✅ Verify), then back and parent buttons, its sub-helpers and its latest steps as text. A note to a working helper rides on its next step; for a finished helper, Muka asks Main to resume it with SendMessage and pass the note on. Each press toasts. Below the chips, two rows of buttons:
  - **Controls**, toggles that are highlighted while on, each doing what its `/muka` command does: 🧠 Rules (smart), ♻️ Nudges, 🛡 Model guard, 🗑 Delete guard, 🔔 Pings, ✨ Motion, and 💲 Budget, which cycles off, $2, $5, $10, off.
  - **Actions**, each with a toast: ⏸ Wrap up all (a wrap-up note to Main and every running helper), ⏹ Stop helpers (a stop-and-report note to every running helper), ✅ Verify (asks Main to run the tests, build and linter, and look at anything visible), and 📊 Report (the last 7 days, as `/muka report` prints it, with a button back to the Bridge).
  - **Verified badge:** next to LIVE/IDLE, a green ✓ VERIFIED chip shows once tests, a build, the linter or a look at the running app followed your last file change, and an amber ⚠ UNVERIFIED chip shows while a change has not been checked. It resets with each new prompt. While idle with unverified changes, the pulse reads "⚠ changes not verified yet".
- **📜 Activity:** a lane per agent with a dot per step (failures in red) and the latest steps.
- **⚠️ Alerts:** tiles for failed, denied, risky, outside the project, stuck and warnings, and the latest events.
- **📝 Changes:** a bar per changed file (red outside the project), ± to see its diff, and deletes.
- **💲 Spend:** spend by model against the budget, and per agent (at API prices).
- **💡 Reflect:** the last turn as tiles, and an AI review on demand.

The pictures move: the radar sweeps, the LIVE dot and the prompt cursor blink, working helpers pulse and ping, links to them flow, Main breathes while it works, sparks travel to working helpers, and the current plan step pulses. The motion carries on smoothly when the numbers update. The ✨ Motion toggle on the Bridge (or `/muka motion off`) stops them, and a system "reduce motion" setting always keeps them still.

In the terminal and editors the same views are text.

The line under the message box is Muka's **pulse**. It shows the most urgent thing when something needs you (a stuck agent, failures, the budget, a full context). Otherwise it shows who is working, the spend and the context while work runs, and a one-line recap of the last task when idle.

## Delete guard

Off by default. With `/muka guard on`, before a `Bash` or `PowerShell` command deletes files, Muka shows what it would remove and asks **Delete them** or **Block it**. Anything but Delete them blocks it, including a question that closes on its own. It reads common delete commands (`rm`, `del`, `Remove-Item`, `git clean -f`, `find -delete` and others), including ones wrapped in `sudo`, `bash -c`, `powershell -c` or `$(...)`. It cannot see deletes inside scripts or programs it runs, and it is a safety net, not a sandbox.

Apart from the delete guard, the model guard, pings, setup and the notes it and you send, Muka only watches: it never changes or blocks an agent's work.

## What Muka does on your computer

Muka runs inside Claude Code as a plugin. Everything it does:

- **Network:** none. Muka makes no network calls of its own.
- **Programs it runs:** only `npx rea-agents …`, and only when you type `/muka rea setup` or `/muka rea doctor`.
- **Files it writes:** when output trimming applies (auto or on), the full text of each trimmed output to `~/.claude/muka-outputs` (30 files, rotating). And only during `/muka setup` and `/muka setup undo`: the helper agents in `~/.claude/agents`, the verify and muka-helpers skills in `~/.claude/skills/verify` and `~/.claude/skills/muka-helpers`, `~/.claude/statusline.js`, `~/.claude/settings.json`, and backups of whatever they replace in `~/.claude/backups`. Its own state (panel views, the prompt log for `/muka recap` and `/muka report`, kept 14 days) lives in Claude Code's plugin store.
- **Files it reads:** your settings during setup, `~/.claude.json` and `~/.claude/skills` for `/muka rea`, and the files the agents change (to show their diffs).
- **Model calls:** one, the 💡 Reflect review, and only when you press it.
- **What it changes in a conversation:** the rules block at the start of a chat (while smart is on), short notes added after tool results (waste nudges, budget warnings, your steering notes), a short brief added to the task of a helper that writes code, a helper's model when you turn the model guard on, and a refused shell command when you turn the delete guard on and answer Block.
- **Notifications:** sounds, desktop notifications and phone pushes go through Claude Code's own notification features (`/muka ping off` stops them).

Is it cheaper? Unproven yet. `/muka report` measures spend by model, helper and task size from your own prompts; give it a week, and compare a week with `/muka smart off`.

## License

MIT. See [LICENSE](LICENSE).
