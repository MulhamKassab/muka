# Install Muka with one prompt

Copy everything in the box below and paste it into Claude Code on the new computer.

```text
Install the Muka plugin for me from my private GitHub repository MulhamKassab/muka. Do these steps in order and show me what each command prints:

1. Run `gh auth status`. If the GitHub CLI is not installed or not signed in, stop and tell me to install it from https://cli.github.com and run `gh auth login`, then to ask you again.
2. Run `gh auth setup-git`, so git can read the private repository.
3. Run `claude plugin marketplace add MulhamKassab/muka`.
4. Run `claude plugin install muka@muka`.
5. Run `claude plugin list` and check that muka@muka shows as enabled.

If a step fails, stop there and tell me what it printed and what to do next. Change nothing else on my computer.

When every step succeeds, tell me to type these three commands myself, one at a time:
- /reload-plugins
- /muka setup
- /muka
```

## What happens

- The first two steps make sure this computer can read the private repository.
- Steps 3 and 4 add the Muka marketplace and install the plugin for your user, so it loads in every project.
- Claude can't type slash commands, so the last three are yours:
  - `/reload-plugins` loads Muka in the open chat. A new chat loads it anyway.
  - `/muka setup` installs the helper agents, the status line and the settings. Anything it replaces is backed up first, and `/muka setup undo` puts it back.
  - `/muka` shows what is on.

## Updating later

Paste this:

```text
Update my Muka plugin: run `claude plugin marketplace update muka`, then `claude plugin update muka@muka`, and show me what they print. Then tell me to type /reload-plugins.
```
