# SPDX-License-Identifier: MIT

# List editor app recipes and their descriptions.
default:
    @just --list web

# Install every workspace's dependencies.
[working-directory('..')]
install:
    npm install

# Serve the editor with hot reload on http://localhost:5173.
[working-directory('../web')]
dev:
    npm run dev

# Build the editor and the headless harness into web/dist.
[working-directory('../web')]
build:
    npm run build

# Serve the last build on http://localhost:4173.
[working-directory('../web')]
preview:
    npm run preview

# Lint the app's build config (the editor itself is checked in ui/).
[working-directory('../web')]
check:
    npm run check
