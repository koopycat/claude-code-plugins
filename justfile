set shell := ["bash", "-cu"]

mods := "context-meter"

# Show available commands
default:
    @just --list

# Validate the marketplace and every mod's manifest and hooks
validate:
    claude plugin validate .
    for mod in {{mods}}; do claude plugin validate "$mod"; done

# Run every mod's tests
test:
    for mod in {{mods}}; do claude plugin test "$mod"; done

# Type-check every mod (needs the types Claude Code writes when it loads the mod)
typecheck:
    for mod in {{mods}}; do pnpm --package=typescript@5.6.3 dlx tsc -p "$mod"; done

# Validate, type-check and test
check: validate typecheck test
