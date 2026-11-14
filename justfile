# SPDX-License-Identifier: MIT
#
# EmbeddableCut's development commands. Run `just` for every documented
# recipe, or `just GROUP` for one group. Recipes expect the dev shell
# (`nix develop`).

# List every recipe, organized by command group.
default:
    @just --list --list-submodules

# The editor app: FreeCut's browser editor.
mod web "tasks/web.just"

# The framework-independent engine.
mod engine "tasks/engine.just"

# The SDK: headless editing, rendering and extensions over the engine.
mod sdk "tasks/sdk.just"

# Headless rendering: CLIs, the HTTP service and its container.
mod render "tasks/render.just"

# The gates CI runs, whole or scoped.
mod check "tasks/check.just"

# Keeping up with FreeCut upstream.
mod upstream "tasks/upstream.just"
