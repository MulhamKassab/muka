---
name: verify
description: Prove a change works before calling it done. Use before saying a task is finished, before committing, pushing or opening a PR, and whenever files were edited and nothing has run since. Finds the project's test, build, lint and run commands, runs them, smoke-tests a web or desktop app in the browser or on screen with a screenshot, and reports what ran and what was not checked.
---

# Verify

Never call work done on reading alone. Prove it ran, then say exactly what ran.

## 1. Find the commands

Look at the project's own files, in this order, and take the commands it already defines:

- `package.json` scripts: `test`, `test:*`, `build`, `lint`, `typecheck` / `check`, `e2e`, `dev` / `start` / `preview`. Use the package manager its lockfile names (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, else npm).
- `Makefile` / `justfile` / `Taskfile.yml`: targets named test, check, lint, build, run.
- `pyproject.toml` / `setup.cfg` / `tox.ini` / `noxfile.py`: pytest, ruff / flake8, mypy / pyright, the app's entry point.
- `Cargo.toml` (cargo test, cargo clippy, cargo build), `go.mod` (go test ./..., go vet, go build), `*.csproj` / `*.sln` (dotnet test, dotnet build), `pom.xml` / `build.gradle` (mvn test, gradle test).
- `.github/workflows/*.yml`: the steps CI runs are the checks that count; run the same ones locally.
- The README or CONTRIBUTING file, for anything above that is missing.

If the project defines none, say so and run the narrowest real check you can (compile the changed file, run it once).

## 2. Run them

Run, after the last edit:

1. The tests that cover the change (the narrowest command first, then the full suite when it is quick enough).
2. The type check and the linter.
3. The build.

Keep output small: send it to a file and read the failures, or filter it (tail, a grep for FAIL / error). A failure is fixed in the code, or reported. Rerun a test only to show a fix worked, never to wait for a flaky green.

## 3. Run the app, for anything a person sees

For a web or desktop app, a change to what a person sees or does is checked in the running app:

- Start it with the project's own dev or preview command (the browser pane's preview, or the run command in the background).
- Open the changed page or screen with the browser tools available (the built-in browser, Chrome, Playwright) or, for a desktop app, the computer-use tools.
- Walk the changed path once: click through it, fill the form, trigger the state that changed. Check the console for errors.
- Take a screenshot of the result.

A CLI: run the changed command once with real arguments. A library: call the changed function from a short script or the REPL.

## 4. Never

- Never edit a test, a snapshot, a check or its data to make it pass.
- Never skip, disable or loosen a check (`.skip`, `--no-verify`, a lower threshold) to get green.
- Never report a check as passing that did not run.

## 5. Report

End with a short list:

- **Ran:** each command and its result (passed / failed, with the failing lines when it failed); the app path walked, with the screenshot.
- **Not checked:** what was not run and why (no tests for this part, needs credentials, too slow), so the person knows what is still on trust.
