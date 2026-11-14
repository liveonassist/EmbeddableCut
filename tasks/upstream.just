# SPDX-License-Identifier: MIT

# List upstream recipes and their descriptions.
default:
    @just --list upstream

# Fetch FreeCut's main branch, adding the `upstream` remote if it's missing.
[working-directory('..')]
fetch:
    scripts/tasks/upstream.sh fetch

# Show upstream commits not merged yet, and the files they touch that no longer exist here.
[working-directory('..')]
status ref="upstream/main":
    scripts/tasks/upstream.sh status {{ ref }}

# Merge upstream, then file anything it added under src/ into engine/ or web/.
[working-directory('..')]
merge ref="upstream/main":
    scripts/tasks/upstream.sh merge {{ ref }}

# File paths under src/ (left by a merge) into engine/src or web/src.
[working-directory('..')]
place:
    node scripts/tasks/place-upstream-files.mjs
