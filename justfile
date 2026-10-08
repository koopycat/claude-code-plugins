set shell := ["bash", "-euo", "pipefail", "-c"]

# Every plugin folder the marketplace lists
plugins := `jq -r '.plugins[].source' .claude-plugin/marketplace.json | tr '\n' ' '`

# Show available commands
default:
    @just --list

# Validate the marketplace and every plugin's manifest and hooks
validate:
    claude plugin validate .
    for plugin in {{plugins}}; do claude plugin validate "$plugin"; done

# Run every plugin's tests
test:
    for plugin in {{plugins}}; do claude plugin test "$plugin"; done

# Type-check every plugin (needs the types Claude Code writes when it loads the plugin)
typecheck:
    for plugin in {{plugins}}; do pnpm --package=typescript@5.6.3 dlx tsc -p "$plugin"; done

# Validate, type-check and test
check: validate typecheck test
