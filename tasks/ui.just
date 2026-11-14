# SPDX-License-Identifier: MIT

# List editor UI recipes and their descriptions.
default:
    @just --list ui

# Serve the embeddable editor page with hot reload.
[working-directory('../ui')]
dev:
    npm run dev

# Run the UI's tests, optionally narrowed to a path or name filter.
[working-directory('../ui')]
test *args:
    npx vp test run {{ args }}

# Lint and svelte-check the UI.
[working-directory('../ui')]
check:
    npm run check
