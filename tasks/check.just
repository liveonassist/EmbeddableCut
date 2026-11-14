# SPDX-License-Identifier: MIT

# List check recipes and their descriptions.
default:
    @just --list check

# Lint, type-check and test the engine.
[working-directory('../engine')]
engine:
    npm run check
    npx vp test run

# Lint, type-check and test the SDK.
[working-directory('../sdk')]
sdk:
    npm run check
    npx vp test run

# Lint, svelte-check and test the editor UI.
[working-directory('../ui')]
ui:
    npm run check
    npx vp test run

# Lint the editor app's build config and build it.
[working-directory('../web')]
web:
    npm run check
    npm run build

# Run the render contract tests and the portable Chrome suites (needs a web build).
[working-directory('../render')]
render:
    npm run test:portable

# FreeCut's architecture ratchets: feature and layer boundaries, deps seams, dead code, edge budgets.
[working-directory('..')]
architecture:
    npm run check:architecture

# Format-check and lint the justfiles, task scripts and flake.
[working-directory('..')]
tasks:
    just --fmt --check
    for file in tasks/*.just; do just --fmt --check --justfile "$file" || exit 1; done
    shfmt --diff --indent 2 scripts/tasks
    shellcheck scripts/tasks/*.sh
    alejandra --check flake.nix

# Build the packages and run the flake's checks, as CI does (slowest).
[working-directory('..')]
nix:
    nix flake check

# Run every gate but `just check nix`.
all: tasks architecture engine sdk ui web render

# Refresh the flake's npmDepsHash after a lockfile change.
[working-directory('..')]
npm-hash:
    scripts/tasks/npm-deps-hash.sh
