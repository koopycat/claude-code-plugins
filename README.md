# claude-code-plugins

**Plugins for [Claude Code](https://claude.com/claude-code), published as the `vk` plugin marketplace.**

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

## Plugins

| Plugin | What it does |
| --- | --- |
| [`context-meter`](context-meter/) | Model, context fill bar, tokens used out of the window, and session cost, above the prompt |

### context-meter

| Part | Shows |
| --- | --- |
| `Opus 5.5` | The main loop's model. Ids like `claude-opus-5-5` are shortened; anything else is shown as is. |
| `█████░░░░░` | Context fill in 20 cells: green below 60 %, amber from 60 %, red from 85 %. Colors follow your Claude Code theme. |
| `44%` | Input tokens of the last response as a share of the model's context window. |
| `87.4k / 200k` | Those tokens, and the window size. |
| `$1.23` | What the session has cost so far, as `/cost` totals it. |

The row updates when the session starts, after every turn, whenever context or cost changes, and after every slash command, so `/model` and `/compact` show at once. Right after `/clear` or `/compact` the figures read `–` until the next response reports new ones. When Claude Code shows a survey in that spot, the row steps aside.

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

Each mod is a small TypeScript module that registers hooks on Claude Code's engine. `context-meter` uses four:

| Hook | Purpose |
| --- | --- |
| `session.start` | Reads the model and usage once the session is up |
| `session.measure` | Re-reads them whenever the engine reports that context, cost or rate limits moved |
| `command.run` | Re-reads them after every slash command, for `/model`, `/compact` and `/clear` |
| `ui.render` on `AbovePrompt` | Draws the row from the last reading, kept in session state so it survives a hot reload |

The figures come from `$.session.model()` and `$.session.usage()`, the same numbers the status line and `/cost` use. Reading them makes no API calls and costs no tokens.

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

**Adding a plugin:** create a top-level folder with the same layout, list it in `.claude-plugin/marketplace.json` and in the `mods` variable of the `justfile`, then run `just check`.

**Debugging:** start Claude Code with `--debug`. A hook that fails, or a drawing the engine refuses, is logged with the mod's name and the reason, and the engine falls back to its own behaviour.

## Known limitations

- **Narrow terminals:** the row is about 60 columns wide and wraps onto a second line in narrower terminals or beside a docked pane.
- **Dated model ids:** ids with a date or provider suffix (`claude-sonnet-4-20250514`, Bedrock and Vertex ids) are shortened incorrectly or shown in full.
- **Fill during a turn:** the context fill updates at the end of each turn, not during long tool runs.

## Contributing

Issues and pull requests are welcome. Please run `just check` before opening a pull request, and add a test for any behaviour you change.
