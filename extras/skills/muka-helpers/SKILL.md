---
name: muka-helpers
description: Load before starting any sub-agent or helper (any Agent tool call): decides which helper to start (Explore, builder, reviewer, checker), how many, which model and effort to name, how to write the brief, how helpers report back, and when a helper may act as a sub-master. Also use when sizing a task as M or L and planning helpers.
---

# Helpers: which, when, how many

Helpers cost about 4x the tokens of doing the work yourself, so start one only where this list says.

## Which helper

- **None:** a change in up to 3 files with the location known; one question over fewer than 10 files; dependent steps; edits to the same file; anything that needs back-and-forth.
- **`Explore` (haiku, low):** 10+ files to explore, or 2-3 independent questions: one per question, at most 3 at once. Web or docs research: 1-2 (sonnet if it must weigh sources).
- **`builder` (sonnet, medium):** 2+ independent pieces in different files, each about 10+ tool calls: one per piece, 2 usual, at most 3 per wave. One `builder` (sonnet, low) as a runner for a noisy run (full test suite, long logs) that returns a summary.
- **One fresh `builder` (opus, high)** with a full brief for a bug that survived two fix attempts.
- **`reviewer` (opus, high):** once, at the end of an L task; fix its **Important** findings. **`checker`:** only when the user asks, or in careful mode.

## How many

- **Totals per prompt:** S 0, M at most 3, L at most 6 in waves of at most 3.
- Reuse a helper that already has the context (SendMessage) before starting a new one; never poll a helper.

## Model and effort

You MUST name `model` and `effort` on every Agent call; the agent definition's default is only a fallback. This is the user's explicit instruction to set them. Use the default for each case above; step up one level only after a real shortfall; any other model only when the user asks for it.

- `haiku`, `low`: reading and lookups;
- `sonnet`, `medium`: building, tests, docs;
- `opus`, `high`: the final review of an L task, a bug that survived two fix attempts.

## The brief and the report

- **Brief:** the objective, the exact files, what is already known, done-when, the output format.
- **Report back:** at most 150 words (Changed / Tested / Open issues).

## Sub-masters

A helper starts its own helpers only for an L piece whose parts have their own files: at most 2, and at most two levels below the master unless the user lifts the limit; otherwise it does the piece itself.

- It plans in a few lines, fits and tests their work, and reports up in at most 150 words.
- Helpers never ask the user; they report the question up.

## Advisor, stop rules, Muka notes

- **Advisor:** main session only, before a risky approach or when the same error comes twice.
- **Stop rules:** same error twice: change the approach; a helper 5+ minutes on one step: steer or replace it; user budget: 70% wrap up, 100% no new helpers.
- **Muka notes** (after a tool result): follow them, no reply.
