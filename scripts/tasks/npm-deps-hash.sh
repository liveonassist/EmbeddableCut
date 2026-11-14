#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Recomputes the flake's npmDepsHash from package-lock.json and writes it into
# flake.nix. Run it after any change to the lockfile; `nix flake check` fails
# with a hash mismatch otherwise.
set -euo pipefail

hash="$(nix run nixpkgs#prefetch-npm-deps -- package-lock.json 2>/dev/null | tail -n1)"
case "$hash" in
sha256-*) ;;
*)
  echo "prefetch-npm-deps printed no hash" >&2
  exit 1
  ;;
esac
sed -i -E "s|npmDepsHash = \"sha256-[^\"]+\";|npmDepsHash = \"$hash\";|" flake.nix
echo "npmDepsHash = $hash"
