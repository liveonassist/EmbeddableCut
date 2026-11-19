# SPDX-License-Identifier: MIT

# List editor UI recipes and their descriptions.
default:
    @just --list ui

# Serve the embeddable editor page with hot reload.
[working-directory('../ui')]
dev:
    npm run dev

# Build the kit hosts vendor (library, declarations, schemas) into ui/dist/kit.
[working-directory('../ui')]
kit:
    npm run build:kit

# Run the UI's tests, optionally narrowed to a path or name filter.
[working-directory('../ui')]
test *args:
    npx vp test run {{ args }}

# Lint and svelte-check the UI.
[working-directory('../ui')]
check:
    npm run check

# Re-run the preview's sync tests from cold, to surface ordering flakes.
[working-directory('../ui')]
preview-sync-stress runs="20":
    npm run test:preview-sync:stress -- --runs {{ runs }}
