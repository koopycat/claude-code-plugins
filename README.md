# claude-code-plugins

**Plugins for [Claude Code](https://claude.com/claude-code), published as the `vk` plugin marketplace.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin marketplace](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-d97757.svg)](#installation)

**context-meter** is a mod (a plugin that draws live UI). It keeps the current model, how full the context window is, and what the session has cost in one row above your prompt, so you never have to type `/context` or `/cost` to find out.

```text
Opus 5.5 · █████████░░░░░░░░░░░ 44% 87.4k / 200k · $1.23
```

**branch-line** keeps the git repository, branch and linked worktree of your session in one line under the prompt, so a `git switch` or an `EnterWorktree` never leaves you guessing where Claude is working.

```text
claude_mods · exp/branch-line · worktree branch-line
```

## Contents

- [Plugins](#plugins)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Development](#development)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

## Plugins

| Plugin | What it does |
| --- | --- |
| [`context-meter`](context-meter/) | Model, context fill bar, tokens used out of the window, and session cost, above the prompt |
| [`branch-line`](branch-line/) | Repository, branch and linked worktree of the session's directory, in a status line under the prompt |

### context-meter

| Part | Shows |
| --- | --- |
| `Opus 5.5` | The main loop's model. Ids are shortened, dated and Bedrock or Vertex ids included (`claude-opus-4-1-20250805` reads `Opus 4.1`); aliases are shown as is. |
| `█████░░░░░` | Context fill in up to 20 cells: green below 60 %, amber from 60 %, red from 85 %. Colors follow your Claude Code theme. |
| `44%` | Input tokens of the last response as a share of the model's context window. |
| `87.4k / 200k` | Those tokens, and the window size. |
| `$1.23` | What the session has cost so far, as `/cost` totals it. |

The row updates when the session starts, after every tool call (so the fill moves during long tool runs), at the end of every turn, and after every slash command, so `/model` and `/compact` show at once. Right after `/clear` or `/compact` it reads `– / 200k` until the next response reports new figures. When Claude Code shows a survey in that spot, the row steps aside.

The row always fits on one line. In a narrow terminal, or beside a docked pane, the bar shrinks to 5 cells, then the cost and then the token counts are left out:

```text
Sonnet 5.5 · █░░░░░░░ 5% 48.5k / 1M · $0.09    48 columns
Sonnet 5.5 · █░░░░ 5%                          26 columns
```

### branch-line

| Where the session is | Shows |
| --- | --- |
| A normal checkout | `claude_mods · main`: the repository, then the branch |
| A linked worktree | `claude_mods · exp/branch-line · worktree branch-line`: the worktree's folder name is added |
| A detached HEAD | `claude_mods · detached 02cbdf4`: the short commit |
| Outside a repository, or in a bare one | Nothing |

The line updates when the session starts, when the session's directory changes (`cd`, `EnterWorktree`, `ExitWorktree`), after every Bash command (so `git switch`, `git checkout` and `git worktree` show at once), and before every prompt, which catches a branch you switched in another terminal while the session sat idle. It reads git through `git rev-parse` and `git branch --show-current`; a failing git never changes what a tool call or prompt did.

## Requirements

- Claude Code with function-hook plugins (context-meter developed and tested on **2.1.293**, branch-line on **2.1.296**).
- For context-meter, a terminal session or the desktop app's Code tab. Those are the two surfaces that draw the band above the prompt.
- For branch-line, `git` 2.31 or newer on your `PATH`.

> [!NOTE]
> The function-hook plugin API is early access and may change between Claude Code releases. If a mod stops drawing after an update, run `claude plugin validate <mod>` and see [Development](#development).

## Installation

### From GitHub

At the prompt of a Claude Code terminal session:

```text
/plugin install context-meter --marketplace koopycat/claude-code-plugins
/plugin install branch-line --marketplace koopycat/claude-code-plugins
```

Answer `y` to add the marketplace (the first time), then pick a scope (**user** puts the mod in every session). The mod is active right away; no restart.

### From a local clone

```bash
git clone https://github.com/koopycat/claude-code-plugins.git
claude plugin marketplace add ./claude-code-plugins
claude plugin install context-meter@vk --scope user
claude plugin install branch-line@vk --scope user
```

A marketplace added from a folder is read from that folder, so after editing a mod, `/reload-plugins` picks up the change in a running session.

### Try it without installing

```bash
claude --plugin-dir ./claude-code-plugins/context-meter
```

This loads the mod for that one session and reloads it whenever you save a file. Use `branch-line` in place of `context-meter` for the other mod.

### Uninstall

```bash
claude plugin uninstall context-meter@vk
claude plugin uninstall branch-line@vk
claude plugin marketplace remove vk
```

## Usage

Neither mod needs configuration.

- **context-meter:** start a session and the row is there. The band's `[-]` mark, or <kbd>Ctrl</kbd>+<kbd>X</kbd> <kbd>Ctrl</kbd>+<kbd>A</kbd>, collapses it.
- **branch-line:** start a session inside a git repository and the line is there. Start `claude` in a linked worktree, or run `git switch` through Claude, to see it change.

## How it works

Each mod is a small TypeScript module that registers hooks on Claude Code's engine. `context-meter` uses five:

| Hook | Purpose |
| --- | --- |
| `session.start` | Reads the model and usage once the session is up |
| `session.measure` | Takes the figures the engine pushes whenever context, cost or rate limits moved |
| `tool.call` | Re-reads them after each tool call, so the fill keeps up during a turn |
| `command.run` | Re-reads them after every slash command, for `/model`, `/compact` and `/clear` |
| `ui.render` on `AbovePrompt` | Draws the row from the last reading, sized to the band's width and kept in session state so it survives a hot reload |

The figures come from `$.session.model()` and `$.session.usage()`, the same numbers the status line and `/cost` use. Reading them makes no API calls and costs no tokens. A refresh that fails never changes what a tool call or command did.

`branch-line` uses four:

| Hook | Purpose |
| --- | --- |
| `session.start` | Shows the checkout the session started in |
| `classic.CwdChanged` | Re-reads it in the new directory after `cd`, `EnterWorktree` and `ExitWorktree` |
| `tool.call` on `Bash`, `EnterWorktree`, `ExitWorktree` | Re-reads it after each command, for `git switch`, `git checkout` and `git worktree` |
| `prompt.submit` | Re-reads it before each prompt, for a branch switched outside the session |

The line is pinned with `$.ui.status`, which gives each plugin a line of its own, so it sits beside the context-meter row instead of competing for the band. Git runs through `$.process.run` in the session's directory. Of overlapping refreshes only the newest writes the line. Git that cannot run, or refuses for a reason other than "not a repository", is reported by the engine as a skipped hook and leaves the line as it was.

## Development

```text
claude-code-plugins/
├── .claude-plugin/marketplace.json   # lists every mod
├── context-meter/
│   ├── .claude-plugin/plugin.json    # the mod's manifest
│   ├── hooks/hooks.json              # names the hooks module
│   ├── hooks/register.tsx            # the mod itself
│   ├── types/index.d.ts              # its session-state contract
│   └── tests/context-meter.test.tsx
├── branch-line/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts             # the hooks, the git calls and the label
│   └── tests/branch-line.test.ts
└── justfile
```

Recipes use [just](https://github.com/casey/just):

| Command | Does |
| --- | --- |
| `just validate` | Validates the marketplace and each mod's manifest and hooks |
| `just test` | Runs each mod's tests with `claude plugin test` |
| `just typecheck` | Type-checks each mod with TypeScript (via `pnpm dlx`) |
| `just check` | All three |

`just typecheck` needs the type declarations Claude Code writes into `<mod>/.claude-plugin/types/` and `<mod>/tsconfig.json` the first time it loads the mod. Both are gitignored, so load a mod once (for example with `--plugin-dir`) before type-checking a fresh clone.

**Adding a plugin:** create a top-level folder with the same layout, list it in `.claude-plugin/marketplace.json` (the `justfile` reads its list from there), then run `just check`.

**Debugging:** start Claude Code with `--debug`. A hook that fails, or a drawing the engine refuses, is logged with the mod's name and the reason, and the engine falls back to its own behaviour.

## Known limitations

- **One band, one plugin:** Claude Code draws a single plugin's row above the prompt, so the meter and another plugin that draws there hide each other.
- **Subagent transcripts:** while you view a subagent's transcript, the row still shows the main session's figures.
- **Older model ids:** ids in the older `claude-3-5-sonnet-…` order are shown in full.
- **branch-line, one directory:** the line follows the session's directory. A subagent or a command that works in another worktree through `git -C` does not change it.
- **branch-line, uncommitted work:** the line names the branch and worktree only; it does not show whether the tree is dirty.

## Contributing

Issues and pull requests are welcome. Please run `just check` before opening a pull request, and add a test for any behaviour you change.

## License

[MIT](LICENSE) © Viktor Koop
