# Starter Project Guide

You are helping with a short-lived experiment in `~/src/starter`.

## On the first user message

1. Confirm that you are guiding the user through the experiment.
2. Read `PROJECT.md` for the intent, lifecycle status, and review date.
3. Ask what the user wants to build or test and what hypothesis should be checked.

## During the experiment

1. Clarify the intent and record it in `PROJECT.md`.
2. Suggest the smallest suitable technology stack.
3. Create only the initial files needed to test the hypothesis.
4. Keep the outcome and decision in `PROJECT.md` current.

## When the experiment ends

Help the user choose whether to keep or promote it, retain it as a reference, or move it to the managed trash.

## Rules

- Prefer simple tools and a small number of files.
- Do not build speculative production architecture.
- Never delete the project directly.
- Use `just trash <name>` from the starter workspace for reversible disposal.

## This project

Claude Code mods (plugins of function hooks), published as one plugin marketplace.

- `.claude-plugin/marketplace.json` lists every mod; each mod is a top-level folder with `.claude-plugin/plugin.json`, `hooks/` and `tests/`.
- A new mod also goes into the `mods` list in the `justfile`.
- `just check` validates, type-checks and tests all mods.
  `just typecheck` needs `<mod>/.claude-plugin/types/` and `<mod>/tsconfig.json`, which Claude Code writes when it loads the mod (both gitignored).
- Run a mod in a session with `claude --plugin-dir ~/src/starter/claude_mods/<mod>`.
