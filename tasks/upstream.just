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

# Merge upstream, then file engine code it left under src/ into engine/ and list UI to port.
[working-directory('..')]
merge ref="upstream/main":
    scripts/tasks/upstream.sh merge {{ ref }}

# File engine code under src/ (left by a merge) into engine/src; list UI files to port into ui/src.
[working-directory('..')]
place:
    node scripts/tasks/place-upstream-files.mjs
