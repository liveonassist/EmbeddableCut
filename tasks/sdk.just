# SPDX-License-Identifier: MIT

# List SDK recipes and their descriptions.
default:
    @just --list sdk

# Run the SDK's tests, optionally narrowed to a path or name filter.
[working-directory('../sdk')]
test *args:
    npx vp test run {{ args }}

# Lint and type-check the SDK.
[working-directory('../sdk')]
check:
    npm run check
