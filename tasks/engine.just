# SPDX-License-Identifier: MIT

# List engine recipes and their descriptions.
default:
    @just --list engine

# Run the engine's tests, optionally narrowed to a path or name filter.
[working-directory('../engine')]
test *args:
    npx vp test run {{ args }}

# Run the engine's tests with coverage and its ratchet floor.
[working-directory('../engine')]
coverage:
    npm run test:coverage

# Lint and type-check the engine on its own, which is what keeps it from importing the app.
[working-directory('../engine')]
check:
    npm run check

# Report which English strings a locale still lacks: `just engine locale-coverage de`.
[working-directory('../engine')]
locale-coverage target:
    node scripts/check-locale-coverage.mjs --locales src/i18n/locales --partials src/i18n/locales/partials --source en --target {{ target }}
