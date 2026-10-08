# Agent instructions for claude-code-plugins

Claude Code plugins, published as the `vk` plugin marketplace from the public repo `koopycat/claude-code-plugins`.
The owner has them installed at user scope, read straight from this folder.

## Commands

```bash
just check                          # validate, type-check and test every plugin
claude plugin test context-meter    # one plugin's tests
```

`just typecheck` needs `<plugin>/.claude-plugin/types/` and `<plugin>/tsconfig.json`, which Claude Code writes when it first loads the plugin (both gitignored).
On a fresh clone, load the plugin once with `claude --plugin-dir <plugin>` first.

## Invariants

- Never leave a plugin broken on disk, because every new session of the owner loads what is saved here, committed or not.
- List a new plugin only in `.claude-plugin/marketplace.json`; the `justfile` reads its list from there.
- Never commit `PROJECT.md`: it is the starter workspace's local metadata, not part of the public repo.
