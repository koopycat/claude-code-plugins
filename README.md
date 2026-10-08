# claude-code-plugins

**Plugins for [Claude Code](https://claude.com/claude-code), published as the `vk` plugin marketplace.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin marketplace](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-d97757.svg)](#installation)

The first plugin, **context-meter**, is a mod (a plugin that draws live UI). It keeps the current model, how full the context window is, and what the session has cost in one row above your prompt, so you never have to type `/context` or `/cost` to find out.

```text
Opus 5.5 · █████████░░░░░░░░░░░ 44% 87.4k / 200k · $1.23
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

## Requirements

- Claude Code with function-hook plugins (developed and tested on **2.1.293**).
- A terminal session or the desktop app's Code tab. Those are the two surfaces that draw the band above the prompt.

> [!NOTE]
> The function-hook plugin API is early access and may change between Claude Code releases. If a mod stops drawing after an update, run `claude plugin validate <mod>` and see [Development](#development).

## Installation

### From GitHub

At the prompt of a Claude Code terminal session:

```text
/plugin install context-meter --marketplace koopycat/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (**user** puts the meter in every session). The mod is active right away; no restart.

### From a local clone

```bash
git clone https://github.com/koopycat/claude-code-plugins.git
claude plugin marketplace add ./claude-code-plugins
claude plugin install context-meter@vk --scope user
```

A marketplace added from a folder is read from that folder, so after editing a mod, `/reload-plugins` picks up the change in a running session.

### Try it without installing

```bash
claude --plugin-dir ./claude-code-plugins/context-meter
```

This loads the mod for that one session and reloads it whenever you save a file.

### Uninstall

```bash
claude plugin uninstall context-meter@vk
claude plugin marketplace remove vk
```

## Usage

There is nothing to configure: start a session and the row is there. The band's `[-]` mark, or <kbd>Ctrl</kbd>+<kbd>X</kbd> <kbd>Ctrl</kbd>+<kbd>A</kbd>, collapses it.

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

## Contributing

Issues and pull requests are welcome. Please run `just check` before opening a pull request, and add a test for any behaviour you change.

## License

[MIT](LICENSE) © Viktor Koop
